"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeOpsActionErrorMessage } from "@/lib/ops/action-errors";
import { requireOpsUser } from "@/lib/ops/auth";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import { OPS_MODULES } from "@/lib/ops/constants";
import {
  canEditOpsModuleAccess,
  canViewOpsModuleAccess,
} from "@/lib/ops/module-access-core";
import { OPS_PRODUCTION_ROLE_POLICY } from "@/lib/ops/role-policy";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type { OpsUserRole } from "@/lib/ops/types";

const ROUTE = "/ops/it/module-access";

const ASSIGNABLE_ROLES = new Set<OpsUserRole>(
  OPS_PRODUCTION_ROLE_POLICY.map(({ role }) => role),
);

const toggleSchema = z.object({
  module_key: z.string().trim().min(1),
  reason: z.string().trim().max(200).default(""),
  role: z.string().trim().min(1),
  // The checkbox posts the value it wants to end up at, not the current one,
  // so a double submit is idempotent rather than a toggle-back.
  next: z.enum(["true", "false"]),
});

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function accessError(message: string): never {
  redirect(`${ROUTE}?error=${encodeURIComponent(safeOpsActionErrorMessage(message))}`);
}

/**
 * Set (or clear) one cell of the role → module matrix.
 *
 * Writes an override row when the requested value differs from the code
 * default, and DELETES the row when it matches — so the table only ever holds
 * genuine differences and "reset to default" needs no separate action.
 */
export async function setOpsModuleAccessAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canViewOpsModuleAccess(profile.role)) {
    accessError("Your role cannot change module access.");
  }

  const parsed = toggleSchema.safeParse({
    module_key: field(formData, "module_key"),
    next: field(formData, "next"),
    reason: field(formData, "reason"),
    role: field(formData, "role"),
  });

  if (!parsed.success) {
    accessError("Select a module and a role.");
  }

  const opsModule = OPS_MODULES.find((item) => item.id === parsed.data.module_key);

  if (!opsModule) {
    accessError("That module no longer exists.");
  }

  const targetRole = parsed.data.role as OpsUserRole;

  // Validate against the role policy rather than the raw enum: `developer` is
  // in the database enum but is not an assignable production role, and an
  // unknown string must not create a row nobody can see in the editor.
  if (!ASSIGNABLE_ROLES.has(targetRole)) {
    accessError("That role cannot be configured here.");
  }

  const next = parsed.data.next === "true";

  const decision = canEditOpsModuleAccess({
    actorRole: profile.role,
    module: opsModule,
    next,
    targetRole,
  });

  if (!decision.allowed) {
    accessError(decision.reason);
  }

  const supabase = getOpsSupabaseServiceClient();
  const matchesDefault = opsModule.roles.includes(targetRole) === next;

  if (matchesDefault) {
    // Back to what the code says — drop the override so the registry stays the
    // single readable source of intent.
    const { error } = await supabase
      .from("ops_module_role_access")
      .delete()
      .eq("module_key", opsModule.id)
      .eq("role", targetRole);

    if (error) {
      accessError(error.message);
    }
  } else {
    const { error } = await supabase.from("ops_module_role_access").upsert(
      {
        can_access: next,
        module_key: opsModule.id,
        reason: parsed.data.reason,
        role: targetRole,
        updated_at: new Date().toISOString(),
        updated_by: profile.id,
      },
      { onConflict: "module_key,role" },
    );

    if (error) {
      accessError(error.message);
    }
  }

  // Access changes are exactly the kind of thing that needs to be answerable
  // months later ("who gave Procurement the invoices module?").
  await recordOpsAuditEvent({
    action: next ? "module_access.granted" : "module_access.revoked",
    actorUserId: profile.id,
    entityId: null,
    entityType: "module_access",
    metadata: {
      code_default: opsModule.roles.includes(targetRole),
      module_key: opsModule.id,
      module_title: opsModule.title,
      reason: parsed.data.reason,
      reset_to_default: matchesDefault,
      role: targetRole,
    },
    moduleKey: "it",
    summary: `${next ? "Granted" : "Removed"} ${targetRole} access to ${opsModule.title}`,
  }).catch(() => null);

  revalidatePath(ROUTE);
  revalidatePath("/ops", "layout");
  redirect(`${ROUTE}?updated=module_access`);
}
