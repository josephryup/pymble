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

const FALLBACK_MATERIAL_REQUEST_APPROVAL_SETTINGS: OpsApprovalWorkflowSettingsRecord = {
  currency_code: "ZMW",
  description:
    "Site requests are reviewed by the Projects Manager then Operations. Above the threshold the Managing Director is added as a final step.",
  first_step_role: "projects_manager",
  id: "fallback-material-request-approval",
  is_active: true,
  module_key: "material_requests",
  second_step_role: "operations_manager",
  threshold_amount: 25000,
  threshold_enabled: true,
  threshold_step_role: "managing_director",
  title: "Material request approval",
  workflow_key: "material_request",
};

const APPROVAL_SETTINGS_COLUMNS = [
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
].join(", ");

/**
 * Every configured workflow, for the read-only "who approves what" page.
 *
 * Returns the seeded rows only — the fallbacks above exist so a missing row
 * cannot break approval routing, not so they appear as configuration nobody
 * set.
 */
export async function fetchOpsApprovalWorkflowSettings() {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("approval_workflow_settings")
    .select(APPROVAL_SETTINGS_COLUMNS)
    .eq("is_active", true)
    .order("title");

  if (error || !data) {
    return [];
  }

  return (data as unknown as RawApprovalWorkflowSettingsRecord[]).map(
    normalizeApprovalWorkflowSettings,
  );
}

/**
 * Threshold configuration for material requests.
 *
 * Falls back to a sane default rather than throwing: approval routing must not
 * fail because a settings row is missing, and the fallback only ever ADDS an
 * approver, so degrading to it cannot weaken a chain.
 */
export async function fetchMaterialRequestApprovalSettings() {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("approval_workflow_settings")
    .select(APPROVAL_SETTINGS_COLUMNS)
    .eq("workflow_key", "material_request")
    .maybeSingle<RawApprovalWorkflowSettingsRecord>();

  if (error || !data) {
    return FALLBACK_MATERIAL_REQUEST_APPROVAL_SETTINGS;
  }

  return normalizeApprovalWorkflowSettings(data);
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
