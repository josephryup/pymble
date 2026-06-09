"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeOpsActionErrorMessage } from "@/lib/ops/action-errors";
import { getOpsAuthCallbackUrl } from "@/lib/ops/auth-redirect";
import { requireOpsUser } from "@/lib/ops/auth";
import { canCreateStaffRole, canDeactivateStaffRole, canManageStaff } from "@/lib/ops/permissions";
import { formatOpsRole, OPS_STAFF_ROLE_VALUES } from "@/lib/ops/roles";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type { OpsUserRole } from "@/lib/ops/types";

const createStaffSchema = z.object({
  email: z.string().trim().email("Enter a valid email address.").max(160),
  full_name: z.string().trim().min(2, "Full name is required.").max(140),
  phone: z.string().trim().max(40).default(""),
  role: z.enum(OPS_STAFF_ROLE_VALUES),
});

const staffIdSchema = z.object({
  id: z.string().uuid("Select a staff member."),
});

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function staffError(message: string): never {
  redirect(`/ops/staff?error=${encodeURIComponent(safeOpsActionErrorMessage(message))}`);
}

export async function createStaffMemberAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canManageStaff(profile.role)) {
    staffError("Only the Developer, Managing Director, General Manager, and Human Resource can create staff accounts.");
  }

  const parsed = createStaffSchema.safeParse({
    email: field(formData, "email"),
    full_name: field(formData, "full_name"),
    phone: field(formData, "phone"),
    role: field(formData, "role"),
  });

  if (!parsed.success) {
    staffError(parsed.error.issues[0]?.message ?? "Check the staff details.");
  }

  if (!canCreateStaffRole(profile.role, parsed.data.role)) {
    staffError(`${formatOpsRole(profile.role)} cannot create a ${formatOpsRole(parsed.data.role)} account.`);
  }

  const serviceClient = getOpsSupabaseServiceClient();

  if (parsed.data.role === "managing_director") {
    const { count, error: directorCountError } = await serviceClient
      .from("users")
      .select("id", { count: "exact", head: true })
      .in("role", ["managing_director", "owner"])
      .eq("is_active", true);

    if (directorCountError) {
      staffError(directorCountError.message);
    }

    if ((count ?? 0) > 0) {
      staffError("Only one active Managing Director account is allowed.");
    }
  }

  const { data: authData, error: inviteError } = await serviceClient.auth.admin.inviteUserByEmail(
    parsed.data.email,
    {
      data: {
        full_name: parsed.data.full_name,
      },
      redirectTo: await getOpsAuthCallbackUrl(),
    },
  );

  if (inviteError || !authData.user) {
    staffError("The email invitation could not be sent. Check the email address and try again.");
  }

  const { error: profileError } = await serviceClient.from("users").insert({
    email: parsed.data.email,
    full_name: parsed.data.full_name,
    id: authData.user.id,
    is_active: true,
    phone: parsed.data.phone || null,
    role: parsed.data.role,
  });

  if (profileError) {
    await serviceClient.auth.admin.deleteUser(authData.user.id).catch(() => null);
    staffError(profileError.message);
  }

  await serviceClient.from("audit_events").insert({
    actor_user_id: profile.id,
    action: "staff.created",
    entity_type: "user",
    entity_id: authData.user.id,
    metadata: {
      email: parsed.data.email,
      role: parsed.data.role,
    },
  });

  revalidatePath("/ops/staff");
  redirect("/ops/staff?created=invitation");
}

export async function deactivateStaffMemberAction(formData: FormData) {
  const { authUser, profile } = await requireOpsUser();

  if (!canManageStaff(profile.role)) {
    staffError("Only the Developer, Managing Director, General Manager, and Human Resource can deactivate staff accounts.");
  }

  const parsed = staffIdSchema.safeParse({
    id: field(formData, "id"),
  });

  if (!parsed.success) {
    staffError(parsed.error.issues[0]?.message ?? "Select a staff member.");
  }

  if (parsed.data.id === authUser.id) {
    staffError("You cannot deactivate your own account.");
  }

  const serviceClient = getOpsSupabaseServiceClient();
  const { data: target, error: targetError } = await serviceClient
    .from("users")
    .select("id, role")
    .eq("id", parsed.data.id)
    .maybeSingle<{ id: string; role: OpsUserRole }>();

  if (targetError || !target) {
    staffError(targetError?.message ?? "Staff member was not found.");
  }

  if (!canDeactivateStaffRole(profile.role, target.role)) {
    staffError(`${formatOpsRole(profile.role)} cannot deactivate a ${formatOpsRole(target.role)} account.`);
  }

  const { error } = await serviceClient
    .from("users")
    .update({ is_active: false })
    .eq("id", parsed.data.id);

  if (error) {
    staffError(error.message);
  }

  await serviceClient.from("audit_events").insert({
    actor_user_id: profile.id,
    action: "staff.deactivated",
    entity_type: "user",
    entity_id: parsed.data.id,
  });

  revalidatePath("/ops/staff");
  redirect("/ops/staff?updated=deactivated");
}
