"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeOpsActionErrorMessage } from "@/lib/ops/action-errors";
import { requireOpsUser } from "@/lib/ops/auth";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import { canManageOps } from "@/lib/ops/permissions";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

const purchaseOrderApprovalSettingsSchema = z.object({
  threshold_amount: z.coerce
    .number()
    .min(0, "Threshold amount cannot be negative.")
    .max(999999999999.99, "Threshold amount is too large."),
  threshold_enabled: z.boolean(),
});

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function settingsError(message: string): never {
  redirect(`/ops/settings?error=${encodeURIComponent(safeOpsActionErrorMessage(message))}`);
}

export async function updatePurchaseOrderApprovalSettingsAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canManageOps(profile.role)) {
    settingsError("Your role cannot update approval settings.");
  }

  const parsed = purchaseOrderApprovalSettingsSchema.safeParse({
    threshold_amount: field(formData, "threshold_amount") || "0",
    threshold_enabled: field(formData, "threshold_enabled") === "on",
  });

  if (!parsed.success) {
    settingsError(parsed.error.issues[0]?.message ?? "Check the approval settings.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("approval_workflow_settings")
    .update({
      threshold_amount: parsed.data.threshold_amount,
      threshold_enabled: parsed.data.threshold_enabled,
      updated_by: profile.id,
    })
    .eq("workflow_key", "purchase_order")
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error || !data) {
    settingsError(error?.message ?? "Purchase order approval settings were not found.");
  }

  await recordOpsAuditEvent({
    action: "approval_settings.purchase_order_updated",
    actorUserId: profile.id,
    entityId: null,
    entityType: "approval_workflow_settings",
    metadata: {
      threshold_amount: parsed.data.threshold_amount,
      threshold_enabled: parsed.data.threshold_enabled,
      workflow_key: "purchase_order",
    },
    moduleKey: "settings",
    sourceTable: "approval_workflow_settings",
    summary: "Updated purchase order approval threshold settings",
  }).catch(() => null);

  revalidatePath("/ops/settings");
  revalidatePath("/ops/rfq-po");
  redirect("/ops/settings?updated=purchase_order_approval");
}
