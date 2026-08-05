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

const budgetControlSettingsSchema = z.object({
  po_unit_price_tolerance_percent: z.coerce
    .number()
    .min(0, "Tolerance cannot be negative.")
    .max(100, "Tolerance cannot exceed 100%."),
  tender_threshold_zmw: z.coerce
    .number()
    .min(0, "Tender threshold cannot be negative.")
    .max(999999999999.99, "Tender threshold is too large."),
});

/**
 * The competitive tender threshold.
 *
 * This had no editing surface at all — the code only ever read
 * `budget_control_settings`, so the only way to change it was direct database
 * access. That is how it came to be confused with the purchase order approval
 * threshold, which sits next to it on the settings page, looks like the same
 * kind of dial, and does something completely different: the PO threshold
 * decides whether the Managing Director joins a PO approval chain, while this
 * one decides whether comparison prices must be recorded before a material
 * request can go to Finance at all.
 *
 * Raising this is a genuine loosening of a spend control, so the change is
 * audited with both the old and new value.
 */
export async function updateBudgetControlSettingsAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canManageOps(profile.role)) {
    settingsError("Your role cannot update budget control settings.");
  }

  const parsed = budgetControlSettingsSchema.safeParse({
    po_unit_price_tolerance_percent:
      field(formData, "po_unit_price_tolerance_percent") || "0",
    tender_threshold_zmw: field(formData, "tender_threshold_zmw") || "0",
  });

  if (!parsed.success) {
    settingsError(parsed.error.issues[0]?.message ?? "Check the budget control settings.");
  }

  const supabase = getOpsSupabaseServiceClient();

  const { data: previous } = await supabase
    .from("budget_control_settings")
    .select("tender_threshold_zmw")
    .limit(1)
    .maybeSingle<{ tender_threshold_zmw: number | string }>();

  const { error } = await supabase
    .from("budget_control_settings")
    .update({
      po_unit_price_tolerance_percent: parsed.data.po_unit_price_tolerance_percent,
      tender_threshold_zmw: parsed.data.tender_threshold_zmw,
      updated_by: profile.id,
    })
    // Single-row settings table keyed on a boolean `id`.
    .eq("id", true);

  if (error) {
    settingsError(error.message);
  }

  await recordOpsAuditEvent({
    action: "budget_control_settings.updated",
    actorUserId: profile.id,
    entityType: "budget_control_settings",
    metadata: {
      previous_tender_threshold_zmw: Number(previous?.tender_threshold_zmw ?? 0),
      tender_threshold_zmw: parsed.data.tender_threshold_zmw,
      po_unit_price_tolerance_percent: parsed.data.po_unit_price_tolerance_percent,
    },
    moduleKey: "settings",
    sourceTable: "budget_control_settings",
    summary: `Tender threshold set to ZMW ${parsed.data.tender_threshold_zmw.toLocaleString("en-ZM")}`,
  }).catch(() => null);

  revalidatePath("/ops/settings");
  revalidatePath("/ops/material-schedule");
  redirect("/ops/settings?updated=budget_controls");
}
