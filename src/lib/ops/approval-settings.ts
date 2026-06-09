import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type {
  OpsPurchaseOrderApprovalSettings,
} from "@/lib/ops/rfq-po-permissions";
import type { OpsUserRole } from "@/lib/ops/types";

export type OpsApprovalWorkflowSettingsRecord = OpsPurchaseOrderApprovalSettings & {
  description: string;
  id: string;
  module_key: string;
  title: string;
  workflow_key: string;
};

type RawApprovalWorkflowSettingsRecord = Omit<
  OpsApprovalWorkflowSettingsRecord,
  "threshold_amount"
> & {
  threshold_amount: number | string;
};

const FALLBACK_PURCHASE_ORDER_APPROVAL_SETTINGS: OpsApprovalWorkflowSettingsRecord = {
  currency_code: "ZMW",
  description: "Controls the approval chain before purchase orders can be issued.",
  first_step_role: "procurement_manager",
  id: "fallback-purchase-order-approval",
  is_active: true,
  module_key: "rfq_po",
  second_step_role: "finance_manager",
  threshold_amount: 50000,
  threshold_enabled: true,
  threshold_step_role: "managing_director",
  title: "Purchase order approval",
  workflow_key: "purchase_order",
};

function normalizeThresholdAmount(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function normalizeRole(value: string | null): OpsUserRole | null {
  return value as OpsUserRole | null;
}

function normalizeApprovalWorkflowSettings(
  record: RawApprovalWorkflowSettingsRecord,
): OpsApprovalWorkflowSettingsRecord {
  return {
    ...record,
    first_step_role: normalizeRole(record.first_step_role) ?? "procurement_manager",
    second_step_role: normalizeRole(record.second_step_role),
    threshold_amount: normalizeThresholdAmount(record.threshold_amount),
    threshold_step_role: normalizeRole(record.threshold_step_role),
  };
}

export async function fetchPurchaseOrderApprovalSettings() {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("approval_workflow_settings")
    .select(
      [
        "id",
        "workflow_key",
        "module_key",
        "title",
        "description",
        "currency_code",
        "threshold_amount",
        "threshold_enabled",
        "first_step_role",
        "second_step_role",
        "threshold_step_role",
        "is_active",
      ].join(", "),
    )
    .eq("workflow_key", "purchase_order")
    .maybeSingle<RawApprovalWorkflowSettingsRecord>();

  if (error) {
    throw error;
  }

  return data
    ? normalizeApprovalWorkflowSettings(data)
    : FALLBACK_PURCHASE_ORDER_APPROVAL_SETTINGS;
}
