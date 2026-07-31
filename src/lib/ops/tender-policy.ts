import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

/**
 * Competitive tender policy (§8.6) and the inherited-approval digest (R1).
 *
 * Context that makes this cheap: suppliers are never invited to this system —
 * Procurement gathers prices by phone, WhatsApp, email or counter visit and
 * records them (§9). An RFQ therefore involves no external round-trip and no
 * waiting, so requiring one above a value threshold is pure governance gain
 * with zero delivery cost.
 *
 * The important reordering: the RFQ runs BEFORE pricing, not after approval.
 * Today it happens after Finance has already approved the money, which proves
 * nothing. Moving it earlier means the competitive evidence is attached to the
 * request Finance is looking at.
 */

export type OpsTenderPolicy = {
  thresholdZmw: number;
  unitPriceTolerancePercent: number;
};

export const DEFAULT_TENDER_POLICY: OpsTenderPolicy = {
  thresholdZmw: 50_000,
  unitPriceTolerancePercent: 5,
};

export type TenderRequirement = {
  required: boolean;
  satisfied: boolean;
  /** Why competitive prices are needed, in Procurement's language. */
  reason: string;
  requestValue: number;
  thresholdZmw: number;
};

function toNumber(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

/**
 * Decide whether a request needs competitive prices recorded before it can be
 * sent for approval.
 *
 * Three triggers, any one of which is enough:
 *   • the value is at or above the tender threshold;
 *   • no item nominates a supplier at all — there is nothing to compare;
 *   • an item names a supplier that is not on the approved register.
 *
 * Pure, so the policy is testable without a database.
 */
export function evaluateTenderRequirement(input: {
  requestValue: number;
  itemCount: number;
  itemsWithSupplier: number;
  itemsWithUnapprovedSupplier: number;
  /** RFQs already raised against this request, in any state past draft. */
  competitiveQuotesRecorded: number;
  policy?: OpsTenderPolicy;
}): TenderRequirement {
  const policy = input.policy ?? DEFAULT_TENDER_POLICY;
  const requestValue = toNumber(input.requestValue);

  const overThreshold = requestValue >= policy.thresholdZmw;
  const noSupplierNominated = input.itemCount > 0 && input.itemsWithSupplier === 0;
  const unapprovedSupplier = input.itemsWithUnapprovedSupplier > 0;

  const required = overThreshold || noSupplierNominated || unapprovedSupplier;

  let reason = "";
  if (overThreshold) {
    reason = `This request is ZMW ${requestValue.toLocaleString("en-ZM")}, at or above the ZMW ${policy.thresholdZmw.toLocaleString("en-ZM")} tender threshold — record the prices you compared before sending it for approval.`;
  } else if (noSupplierNominated) {
    reason =
      "No item names a supplier yet, so there is nothing for Finance to approve a price against.";
  } else if (unapprovedSupplier) {
    reason =
      "An item names a supplier that is not on the approved register — record comparison prices before committing to them.";
  }

  return {
    required,
    satisfied: !required || input.competitiveQuotesRecorded > 0,
    reason,
    requestValue,
    thresholdZmw: policy.thresholdZmw,
  };
}

export async function fetchOpsTenderPolicy(): Promise<OpsTenderPolicy> {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("budget_control_settings")
    .select("tender_threshold_zmw, po_unit_price_tolerance_percent")
    .limit(1)
    .maybeSingle<{
      tender_threshold_zmw: number | string;
      po_unit_price_tolerance_percent: number | string;
    }>();

  if (error || !data) {
    return DEFAULT_TENDER_POLICY;
  }

  return {
    thresholdZmw: toNumber(data.tender_threshold_zmw),
    unitPriceTolerancePercent: toNumber(data.po_unit_price_tolerance_percent),
  };
}

/** Tender position for one request, for the pricing screen. */
export async function fetchOpsTenderRequirement(
  requestId: string,
): Promise<TenderRequirement> {
  const supabase = getOpsSupabaseServiceClient();

  const [policy, itemsResult, rfqResult] = await Promise.all([
    fetchOpsTenderPolicy(),
    supabase
      .from("material_request_items")
      .select(
        "actual_total, estimated_total, supplier_id, supplier:suppliers!material_request_items_supplier_id_fkey(status)",
      )
      .eq("request_id", requestId),
    supabase
      .from("rfqs")
      .select("id", { count: "exact", head: true })
      .eq("material_request_id", requestId)
      .neq("status", "cancelled"),
  ]);

  type ItemRow = {
    actual_total: number | string | null;
    estimated_total: number | string | null;
    supplier_id: string | null;
    supplier: { status: string } | { status: string }[] | null;
  };

  const items = (itemsResult.data ?? []) as unknown as ItemRow[];

  let requestValue = 0;
  let itemsWithSupplier = 0;
  let itemsWithUnapprovedSupplier = 0;

  for (const item of items) {
    const priced = toNumber(item.actual_total);
    requestValue += priced > 0 ? priced : toNumber(item.estimated_total);
    if (item.supplier_id) {
      itemsWithSupplier += 1;
      const supplier = Array.isArray(item.supplier)
        ? (item.supplier[0] ?? null)
        : item.supplier;
      if (supplier && supplier.status !== "active") {
        itemsWithUnapprovedSupplier += 1;
      }
    }
  }

  return evaluateTenderRequirement({
    requestValue,
    itemCount: items.length,
    itemsWithSupplier,
    itemsWithUnapprovedSupplier,
    competitiveQuotesRecorded: rfqResult.count ?? 0,
    policy,
  });
}

// ---------------------------------------------------------------------------
// R1 detective control — the inherited-approval digest.
// ---------------------------------------------------------------------------

export type InheritedApprovalRow = {
  purchaseOrderId: string;
  poNumber: string;
  title: string;
  supplierName: string | null;
  amount: number;
  approvalSource: string;
  requestNumber: string | null;
  procuredByName: string | null;
  procuredAt: string | null;
  status: string;
};

/**
 * Purchase orders raised under someone else's approval in a given window.
 *
 * Removing the redundant PO approval traded a preventive control for a
 * detective one, and the audit is blunt that this is only acceptable "if the
 * detective one actually gets read". This is that report; a cron or the weekly
 * digest sends it to Procurement Manager + Finance.
 */
export async function fetchOpsInheritedApprovals(options?: {
  sinceDays?: number;
}): Promise<{ rows: InheritedApprovalRow[]; totalValue: number; deltaCount: number }> {
  const supabase = getOpsSupabaseServiceClient();
  const sinceDays = options?.sinceDays ?? 7;
  const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString();

  const { data, error } = await supabase
    .from("purchase_orders")
    .select(
      "id, po_number, title, total_amount, approval_source, status, procured_at, supplier:suppliers!purchase_orders_supplier_id_fkey(legal_name), request:material_requests!purchase_orders_material_request_id_fkey(request_number), procurer:users!purchase_orders_procured_by_fkey(full_name)",
    )
    .neq("approval_source", "direct")
    .gte("procured_at", since)
    .order("procured_at", { ascending: false });

  if (error) {
    throw error;
  }

  type Row = {
    id: string;
    po_number: string;
    title: string;
    total_amount: number | string | null;
    approval_source: string;
    status: string;
    procured_at: string | null;
    supplier: { legal_name: string } | { legal_name: string }[] | null;
    request: { request_number: string } | { request_number: string }[] | null;
    procurer: { full_name: string } | { full_name: string }[] | null;
  };

  const first = <T,>(value: T | T[] | null): T | null =>
    Array.isArray(value) ? (value[0] ?? null) : value;

  const rows = ((data ?? []) as unknown as Row[]).map((row) => ({
    purchaseOrderId: row.id,
    poNumber: row.po_number,
    title: row.title,
    supplierName: first(row.supplier)?.legal_name ?? null,
    amount: toNumber(row.total_amount),
    approvalSource: row.approval_source,
    requestNumber: first(row.request)?.request_number ?? null,
    procuredByName: first(row.procurer)?.full_name ?? null,
    procuredAt: row.procured_at,
    status: row.status,
  }));

  return {
    rows,
    totalValue:
      Math.round((rows.reduce((sum, row) => sum + row.amount, 0) + Number.EPSILON) * 100) /
      100,
    deltaCount: rows.filter((row) => row.approvalSource === "delta").length,
  };
}
