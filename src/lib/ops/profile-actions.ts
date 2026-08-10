"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeOpsActionErrorMessage } from "@/lib/ops/action-errors";
import { createOpsServerSessionClient, requireOpsUser } from "@/lib/ops/auth";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import { canCreateOpsSelfServiceLeaveRequest } from "@/lib/ops/hr-permissions";
import { queueOpsNotification } from "@/lib/ops/notifications";
import { logOpsServerError } from "@/lib/ops/log";
import { opsPasswordSchema } from "@/lib/ops/password-policy";
import { deleteOpsR2Object, putOpsR2Object } from "@/lib/ops/r2";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type { OpsEmployeeStatus, OpsLeaveType, OpsUserRole } from "@/lib/ops/types";

const updateProfileSchema = z.object({
  full_name: z.string().trim().min(2, "Full name is required.").max(140),
  phone: z.string().trim().max(40).optional(),
});

const leaveTypes = [
  "annual",
  "sick",
  "compassionate",
  "unpaid",
  "maternity",
  "paternity",
  "study",
  "other",
] as const satisfies readonly OpsLeaveType[];

const updatePasswordSchema = z
  .object({
    confirm_password: z.string(),
    password: opsPasswordSchema.and(z.string().max(72)),
  })
  .refine((value) => value.password === value.confirm_password, {
    message: "Passwords do not match.",
    path: ["confirm_password"],
  });

const selfServiceLeaveRequestSchema = z.object({
  days_requested: z.coerce.number().min(0).optional().or(z.literal("")),
  end_date: z.string().trim(),
  handover_notes: z.string().trim().max(1000).default(""),
  leave_type: z.enum(leaveTypes),
  reason: z.string().trim().max(1000).default(""),
  start_date: z.string().trim(),
});

const HR_LEAVE_NOTIFICATION_ROLES = [
  "developer",
  "managing_director",
  "general_manager",
  "human_resource",
  "hr",
  "owner",
  "manager",
] as const satisfies readonly OpsUserRole[];

type LinkedEmployeeForLeave = {
  employee_number: string;
  full_name: string;
  id: string;
  status: OpsEmployeeStatus;
  user_id: string | null;
};

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function profileError(message: string): never {
  redirect(`/ops/profile?error=${encodeURIComponent(safeOpsActionErrorMessage(message))}`);
}

function normalizeDate(value: string, message = "Use a valid date.") {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    profileError(message);
  }

  return value;
}

function inclusiveDateDays(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00Z`).getTime();
  const end = new Date(`${endDate}T00:00:00Z`).getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  return Math.max(Math.floor((end - start) / dayMs) + 1, 0);
}

async function fetchLinkedEmployeeForLeave(userId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("employees")
    .select("id, employee_number, full_name, status, user_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<LinkedEmployeeForLeave>();

  if (error) {
    throw error;
  }

  return data;
}

async function queueSelfServiceLeaveNotifications(input: {
  actorUserId: string;
  employee: LinkedEmployeeForLeave;
  leaveNumber: string;
  leaveRequestId: string;
}) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("users")
    .select("id, role")
    .in("role", [...HR_LEAVE_NOTIFICATION_ROLES])
    .eq("is_active", true);

  if (error) {
    throw error;
  }

  const recipients = ((data ?? []) as Array<{ id: string; role: OpsUserRole }>).filter(
    (user, index, list) =>
      user.id !== input.actorUserId && list.findIndex((item) => item.id === user.id) === index,
  );

  await Promise.all(
    recipients.map((recipient) =>
      queueOpsNotification({
        actionHref: "/ops/employees?tab=people#employee-register",
        body: `${input.employee.employee_number} - ${input.employee.full_name} submitted ${input.leaveNumber}.`,
        idempotencyKey: `self-service-leave-submitted:${input.leaveRequestId}:${recipient.id}`,
        moduleKey: "employees",
        recipientId: recipient.id,
        sourceId: input.leaveRequestId,
        sourceTable: "leave_requests",
        title: "Leave request submitted",
      }).catch(() => null),
    ),
  );
}

export async function updateMyProfileAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = updateProfileSchema.safeParse({
    full_name: field(formData, "full_name"),
    phone: field(formData, "phone"),
  });

  if (!parsed.success) {
    profileError(parsed.error.issues[0]?.message ?? "Check your profile details.");
  }

  const supabase = await createOpsServerSessionClient();
  const { error } = await supabase
    .from("users")
    .update({
      full_name: parsed.data.full_name,
      phone: parsed.data.phone || null,
    })
    .eq("id", profile.id);

  if (error) {
    profileError(error.message);
  }

  revalidatePath("/ops");
  revalidatePath("/ops/profile");
  redirect("/ops/profile?updated=profile");
}

/** Image types accepted for a profile photo. */
const AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** 5 MB — generous for a photo, far below the 25 MB document limit. */
const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Upload or replace your own profile photo (audit §3).
 *
 * Scoped to the signed-in user by construction: the key is derived from
 * `profile.id`, and there is no parameter for whose photo to change. Nobody can
 * set someone else's picture, which matters more than it sounds — an avatar is
 * how colleagues recognise who approved something.
 *
 * The previous object is deleted after the new one is written, so replacing a
 * photo does not quietly accumulate storage. Deletion is best-effort: an
 * orphaned object costs pennies, a failed upload costs the user their change.
 */
export async function updateMyAvatarAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) {
    profileError("Choose an image to upload.");
  }
  if (!AVATAR_TYPES.has(file.type)) {
    profileError("Profile photos must be a JPEG, PNG or WebP image.");
  }
  if (file.size > AVATAR_MAX_BYTES) {
    profileError("Profile photos must be 5 MB or smaller.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data: existing } = await supabase
    .from("users")
    .select("avatar_key")
    .eq("id", profile.id)
    .maybeSingle<{ avatar_key: string | null }>();

  const extension =
    file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  // Timestamped key so a replacement never collides with a cached copy of the
  // old object at the same path.
  const key = `ops/avatars/${profile.id}/${Date.now()}.${extension}`;

  try {
    await putOpsR2Object({
      body: new Uint8Array(await file.arrayBuffer()),
      contentType: file.type,
      key,
    });
  } catch (uploadError) {
    logOpsServerError(uploadError, { module: "profile", action: "avatar.upload" });
    profileError("The photo could not be uploaded. Try again.");
  }

  const { error } = await supabase
    .from("users")
    .update({ avatar_key: key, avatar_updated_at: new Date().toISOString() })
    .eq("id", profile.id);

  if (error) {
    profileError(error.message);
  }

  if (existing?.avatar_key && existing.avatar_key !== key) {
    await deleteOpsR2Object(existing.avatar_key).catch(() => null);
  }

  await recordOpsAuditEvent({
    action: "profile.avatar_updated",
    actorUserId: profile.id,
    entityId: profile.id,
    entityType: "user",
    moduleKey: "profile",
    sourceId: profile.id,
    sourceTable: "users",
    summary: "Updated profile photo",
  }).catch(() => null);

  revalidatePath("/ops");
  revalidatePath("/ops/profile");
  redirect("/ops/profile?updated=avatar");
}

/** Remove your profile photo and fall back to initials. */
export async function removeMyAvatarAction() {
  const { profile } = await requireOpsUser();

  const supabase = getOpsSupabaseServiceClient();
  const { data: existing } = await supabase
    .from("users")
    .select("avatar_key")
    .eq("id", profile.id)
    .maybeSingle<{ avatar_key: string | null }>();

  const { error } = await supabase
    .from("users")
    .update({ avatar_key: null, avatar_updated_at: new Date().toISOString() })
    .eq("id", profile.id);

  if (error) {
    profileError(error.message);
  }

  if (existing?.avatar_key) {
    await deleteOpsR2Object(existing.avatar_key).catch(() => null);
  }

  revalidatePath("/ops");
  revalidatePath("/ops/profile");
  redirect("/ops/profile?updated=avatar_removed");
}

export async function updateMyPasswordAction(formData: FormData) {
  await requireOpsUser();
  const parsed = updatePasswordSchema.safeParse({
    confirm_password: field(formData, "confirm_password"),
    password: field(formData, "password"),
  });

  if (!parsed.success) {
    profileError(parsed.error.issues[0]?.message ?? "Check the password fields.");
  }

  const supabase = await createOpsServerSessionClient();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    profileError(error.message);
  }

  revalidatePath("/ops/profile");
  redirect("/ops/profile?updated=password");
}

export async function createMyLeaveRequestAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const employee = await fetchLinkedEmployeeForLeave(profile.id);

  if (!employee || !canCreateOpsSelfServiceLeaveRequest(profile.id, employee)) {
    profileError("Ask HR to link an active employee record to your account before requesting leave.");
  }

  const parsed = selfServiceLeaveRequestSchema.safeParse({
    days_requested: field(formData, "days_requested"),
    end_date: field(formData, "end_date"),
    handover_notes: field(formData, "handover_notes"),
    leave_type: field(formData, "leave_type") || "annual",
    reason: field(formData, "reason"),
    start_date: field(formData, "start_date"),
  });

  if (!parsed.success) {
    profileError(parsed.error.issues[0]?.message ?? "Check the leave request.");
  }

  const startDate = normalizeDate(parsed.data.start_date, "Use a valid leave start date.");
  const endDate = normalizeDate(parsed.data.end_date, "Use a valid leave end date.");

  if (endDate < startDate) {
    profileError("Leave end date cannot be before the start date.");
  }

  const daysRequested =
    typeof parsed.data.days_requested === "number" && parsed.data.days_requested > 0
      ? parsed.data.days_requested
      : inclusiveDateDays(startDate, endDate);
  const now = new Date().toISOString();
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("leave_requests")
    .insert({
      created_by: profile.id,
      days_requested: daysRequested,
      employee_id: employee.id,
      end_date: endDate,
      handover_notes: parsed.data.handover_notes,
      leave_type: parsed.data.leave_type,
      reason: parsed.data.reason,
      start_date: startDate,
      status: "submitted",
      submitted_at: now,
    })
    .select("id, leave_number")
    .single<{ id: string; leave_number: string }>();

  if (error || !data) {
    profileError(error?.message ?? "Could not create leave request.");
  }

  await recordOpsAuditEvent({
    action: "leave_request.self_service_submitted",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "leave_request",
    metadata: {
      employee_number: employee.employee_number,
      leave_number: data.leave_number,
      leave_type: parsed.data.leave_type,
    },
    moduleKey: "employees",
    sourceId: data.id,
    sourceTable: "leave_requests",
    summary: `${employee.employee_number} submitted leave request ${data.leave_number}`,
  });

  await queueSelfServiceLeaveNotifications({
    actorUserId: profile.id,
    employee,
    leaveNumber: data.leave_number,
    leaveRequestId: data.id,
  });

  revalidatePath("/ops/profile");
  revalidatePath("/ops/employees");
  revalidatePath("/ops/notifications");
  redirect("/ops/profile?updated=self_leave#my-leave");
}
