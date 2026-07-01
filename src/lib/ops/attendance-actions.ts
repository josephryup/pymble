"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeOpsActionErrorMessage } from "@/lib/ops/action-errors";
import {
  combineAttendanceDateTime,
  createAttendanceRecordCore,
  createAttendanceSchema,
} from "@/lib/ops/attendance-core";
import { createOpsServerSessionClient, requireOpsUser } from "@/lib/ops/auth";
import { computeAttendanceEarnings } from "@/lib/ops/attendance-earnings";
import { parseCoordinateInput } from "@/lib/ops/coordinates";
import { fanoutToOpsRoles } from "@/lib/ops/notification-fanout";
import { queueOpsNotification } from "@/lib/ops/notifications";
import { canRecordAttendance } from "@/lib/ops/permissions";

const approveAttendanceSchema = z.object({
  id: z.string().uuid("Select an attendance record."),
});

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function attendanceError(message: string): never {
  redirect(`/ops/attendance?error=${encodeURIComponent(safeOpsActionErrorMessage(message))}`);
}

export async function createAttendanceAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const result = await createAttendanceRecordCore(formData, profile);

  if (!result.ok) {
    attendanceError(result.message);
  }

  revalidatePath("/ops");
  revalidatePath("/ops/attendance");
  redirect("/ops/attendance?created=attendance");
}

export async function approveAttendanceAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canRecordAttendance(profile.role)) {
    attendanceError("Your role cannot approve attendance yet.");
  }

  const parsed = approveAttendanceSchema.safeParse({
    id: field(formData, "id"),
  });

  if (!parsed.success) {
    attendanceError(parsed.error.issues[0]?.message ?? "Select an attendance record.");
  }

  const supabase = await createOpsServerSessionClient();
  const { error } = await supabase
    .from("attendance_records")
    .update({
      approved_at: new Date().toISOString(),
      approved_by: profile.id,
    })
    .eq("id", parsed.data.id)
    .is("approved_at", null);

  if (error) {
    attendanceError(error.message);
  }

  await supabase.from("audit_events").insert({
    actor_user_id: profile.id,
    action: "attendance.approved",
    entity_type: "attendance_record",
    entity_id: parsed.data.id,
    module_key: "attendance",
    source_table: "attendance_records",
    source_id: parsed.data.id,
  });

  // Phase M backfill: notify HR + finance so approved attendance feeds straight
  // into the payroll cycle without a manual ping.
  const recipients = await fanoutToOpsRoles(
    ["human_resource", "hr", "finance_manager", "accountant"],
    { excludeUserIds: [profile.id] },
  );
  await Promise.all(
    recipients.map((recipient) =>
      queueOpsNotification({
        actionHref: "/ops/attendance",
        body: `${profile.full_name} approved an attendance record (${parsed.data.id.slice(0, 8)}). It is now eligible for payroll.`,
        idempotencyKey: `attendance-approved:${parsed.data.id}:${recipient.id}`,
        moduleKey: "attendance",
        recipientId: recipient.id,
        sourceId: parsed.data.id,
        sourceTable: "attendance_records",
        title: "Attendance approved",
      }).catch(() => null),
    ),
  );

  revalidatePath("/ops");
  revalidatePath("/ops/attendance");
  revalidatePath("/ops/notifications");
  redirect("/ops/attendance?updated=approved");
}

const updateAttendanceSchema = createAttendanceSchema.extend({
  id: z.string().uuid("Select an attendance record."),
});

const cancelAttendanceSchema = z.object({
  id: z.string().uuid("Select an attendance record."),
  reason: z.string().trim().min(3, "Provide a brief reason.").max(280).optional(),
});

export async function updateAttendanceAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canRecordAttendance(profile.role)) {
    attendanceError("Your role cannot edit attendance.");
  }

  const parsed = updateAttendanceSchema.safeParse({
    id: field(formData, "id"),
    worker_id: field(formData, "worker_id"),
    site_id: field(formData, "site_id"),
    work_date: field(formData, "work_date"),
    clock_in_time: field(formData, "clock_in_time"),
    clock_out_time: field(formData, "clock_out_time"),
    hours_worked: field(formData, "hours_worked"),
    presence: field(formData, "presence"),
    gps_label: field(formData, "gps_label"),
    gps_latitude: parseCoordinateInput(field(formData, "gps_latitude"), "latitude"),
    gps_longitude: parseCoordinateInput(field(formData, "gps_longitude"), "longitude"),
  });

  if (!parsed.success) {
    attendanceError(parsed.error.issues[0]?.message ?? "Check the attendance entry.");
  }

  if ((parsed.data.gps_latitude === null) !== (parsed.data.gps_longitude === null)) {
    attendanceError("Enter both GPS latitude and longitude, or leave both blank.");
  }

  const { id, ...patch } = parsed.data;
  const supabase = await createOpsServerSessionClient();

  // Recompute earnings from the (possibly changed) worker and hours so an edit
  // never leaves amount_earned / overtime stale ahead of payroll.
  const [workerRes, orgRes] = await Promise.all([
    supabase
      .from("workers")
      .select("daily_rate")
      .eq("id", patch.worker_id)
      .eq("is_active", true)
      .single<{ daily_rate: number | string }>(),
    supabase
      .from("organization_profile")
      .select("standard_daily_hours, overtime_multiplier")
      .eq("id", 1)
      .maybeSingle<{ standard_daily_hours: number | string; overtime_multiplier: number | string }>(),
  ]);

  if (workerRes.error || !workerRes.data) {
    attendanceError("The selected worker could not be found.");
  }

  const hoursWorked = patch.presence === "absent" ? 0 : patch.hours_worked;
  const earnings = computeAttendanceEarnings({
    hoursWorked,
    dailyRate: Number(workerRes.data.daily_rate),
    standardDailyHours: Number(orgRes.data?.standard_daily_hours ?? 8),
    overtimeMultiplier: Number(orgRes.data?.overtime_multiplier ?? 1.5),
    isAbsent: patch.presence === "absent",
  });

  const { error } = await supabase
    .from("attendance_records")
    .update({
      worker_id: patch.worker_id,
      site_id: patch.site_id,
      clock_in_at: combineAttendanceDateTime(patch.work_date, patch.clock_in_time),
      clock_out_at: patch.clock_out_time
        ? combineAttendanceDateTime(patch.work_date, patch.clock_out_time)
        : null,
      hours_worked: hoursWorked,
      amount_earned: earnings.totalAmount,
      overtime_hours: earnings.overtimeHours,
      overtime_amount: earnings.overtimeAmount,
      presence: patch.presence,
      gps_label: patch.gps_label,
      gps_latitude: patch.gps_latitude,
      gps_longitude: patch.gps_longitude,
    })
    .eq("id", id)
    .is("approved_at", null)
    .is("cancelled_at", null);

  if (error) {
    attendanceError(error.message);
  }

  await supabase.from("audit_events").insert({
    actor_user_id: profile.id,
    action: "attendance.updated",
    entity_type: "attendance_record",
    entity_id: id,
    module_key: "attendance",
    source_table: "attendance_records",
    source_id: id,
  });

  revalidatePath("/ops/attendance");
  redirect("/ops/attendance?updated=record");
}

export async function cancelAttendanceAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canRecordAttendance(profile.role)) {
    attendanceError("Your role cannot cancel attendance.");
  }

  const parsed = cancelAttendanceSchema.safeParse({
    id: field(formData, "id"),
    reason: field(formData, "reason") || undefined,
  });

  if (!parsed.success) {
    attendanceError(parsed.error.issues[0]?.message ?? "Select an attendance record.");
  }

  const supabase = await createOpsServerSessionClient();
  const { error } = await supabase
    .from("attendance_records")
    .update({
      cancelled_at: new Date().toISOString(),
      cancelled_by: profile.id,
    })
    .eq("id", parsed.data.id)
    .is("approved_at", null);

  if (error) {
    attendanceError(error.message);
  }

  await supabase.from("audit_events").insert({
    actor_user_id: profile.id,
    action: "attendance.cancelled",
    entity_type: "attendance_record",
    entity_id: parsed.data.id,
    module_key: "attendance",
    source_table: "attendance_records",
    source_id: parsed.data.id,
    metadata: parsed.data.reason ? { reason: parsed.data.reason } : null,
  });

  revalidatePath("/ops/attendance");
  redirect("/ops/attendance?updated=cancelled");
}
