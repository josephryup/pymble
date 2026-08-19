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

/**
 * Which trigger fired, so the UI can offer the RIGHT remedy rather than always
 * saying "raise an RFQ".
 *
 * The distinction matters because two of the three triggers are satisfied by
 * fixing the request itself, and only one genuinely needs competitive prices:
 *
 *   • `none`          — nothing required.
 *   • `no_supplier`   — no line names anyone. Remedy: name a supplier.
 *   • `unregistered`  — a line names someone by typing their name, so they are
 *                       not on the approved register. Remedy: add them to the
 *                       register, OR record comparison prices.
 *   • `not_approved`  — a registered supplier that is on hold or archived.
 *                       Remedy: use an active supplier, OR record comparison.
 *   • `over_threshold`— value alone demands competition. Only an RFQ satisfies.
 */
export type TenderTrigger =
  | "none"
  | "no_supplier"
  | "unregistered"
  | "not_approved"
  | "over_threshold";

export type TenderRequirement = {
  required: boolean;
  satisfied: boolean;
  /** Which rule fired — drives the remedy the UI offers. */
  trigger: TenderTrigger;
  /** Why competitive prices are needed, in Procurement's language. */
  reason: string;
  /** What to do about it. Empty when nothing is required. */
  remedy: string;
  /** Supplier names typed rather than picked, for naming them in the message. */
  unregisteredSupplierNames: string[];
  /**
   * True when recording competitive prices is the ONLY way through. Below the
   * threshold, naming a registered supplier also clears the gate — the UI says
   * so rather than sending everyone down the RFQ path.
   */
  rfqIsOnlyRemedy: boolean;
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
 * Four triggers, any one of which is enough:
 *   • the value is at or above the tender threshold;
 *   • no item nominates a supplier at all — there is nothing to compare;
 *   • an item names a supplier by TYPING it, so they are not on the register;
 *   • an item picks a registered supplier that is on hold or archived.
 *
 * ── Why the typed-supplier case is separate (audit F1) ────────────────────
 * A line may carry either `supplier_id` (a row on the approved register) or
 * `supplier_name_freeform` (a name someone typed). The request screen shows
 * the typed name as "Supplier: MTN (not in master list)" — so it plainly
 * DOES name a supplier. The old rule counted only `supplier_id`, which meant
 * the screen said one thing and the gate said the opposite:
 *
 *     "No item names a supplier yet, so there is nothing for Finance to
 *      approve a price against."
 *
 * …on a request that visibly names MTN. Worse, the remedy it offered ("raise
 * an RFQ") was not the cheapest way through: registering MTN clears the gate
 * outright when the value is below the threshold.
 *
 * So typed suppliers now count as *named* — they simply are not *approved*,
 * which is its own trigger with its own remedy.
 *
 * Pure, so the policy is testable without a database.
 */
export function evaluateTenderRequirement(input: {
  requestValue: number;
  itemCount: number;
  /** Items pointing at a row on the supplier register. */
  itemsWithRegisteredSupplier: number;
  /** Items naming a supplier by typed text rather than by register row. */
  itemsWithUnregisteredSupplier: number;
  /** Items whose registered supplier is not `active`. */
  itemsWithUnapprovedSupplier: number;
  /** Distinct typed supplier names, so the message can name them. */
  unregisteredSupplierNames?: string[];
  /** RFQs already raised against this request, in any state past draft. */
  competitiveQuotesRecorded: number;
  policy?: OpsTenderPolicy;
}): TenderRequirement {
  const policy = input.policy ?? DEFAULT_TENDER_POLICY;
  const requestValue = toNumber(input.requestValue);
  const unregisteredSupplierNames = input.unregisteredSupplierNames ?? [];

  const namedSuppliers =
    input.itemsWithRegisteredSupplier + input.itemsWithUnregisteredSupplier;

  const overThreshold = requestValue >= policy.thresholdZmw;
  const noSupplierNominated = input.itemCount > 0 && namedSuppliers === 0;
  const unregisteredSupplier = input.itemsWithUnregisteredSupplier > 0;
  const unapprovedSupplier = input.itemsWithUnapprovedSupplier > 0;

  const required =
    overThreshold || noSupplierNominated || unregisteredSupplier || unapprovedSupplier;

  // Ordered by how much the reader can do about it: value is immovable, so it
  // is reported first; the supplier cases each have a cheaper fix.
  let trigger: TenderTrigger = "none";
  if (overThreshold) {
    trigger = "over_threshold";
  } else if (noSupplierNominated) {
    trigger = "no_supplier";
  } else if (unregisteredSupplier) {
    trigger = "unregistered";
  } else if (unapprovedSupplier) {
    trigger = "not_approved";
  }

  const named = (() => {
    if (unregisteredSupplierNames.length === 0) {
      return "a supplier";
    }
    if (unregisteredSupplierNames.length === 1) {
      return unregisteredSupplierNames[0];
    }
    return `${unregisteredSupplierNames.slice(0, -1).join(", ")} and ${unregisteredSupplierNames.at(-1)}`;
  })();

  let reason = "";
  let remedy = "";
  switch (trigger) {
    case "over_threshold":
      reason = `This request is ZMW ${requestValue.toLocaleString("en-ZM")}, at or above the ZMW ${policy.thresholdZmw.toLocaleString("en-ZM")} tender threshold.`;
      remedy =
        "Record the prices you compared before sending it to Finance — you can raise the comparison from this request.";
      break;
    case "no_supplier":
      reason =
        "No line names a supplier yet, so there is nothing for Finance to approve a price against.";
      remedy =
        "Name the supplier on each line — pick one from the register, or type the name if they are not on it yet.";
      break;
    case "unregistered":
      reason = `${named} ${unregisteredSupplierNames.length === 1 ? "is" : "are"} named by typed name, so ${unregisteredSupplierNames.length === 1 ? "they are" : "they are"} not on the approved supplier register.`;
      remedy = `Add ${named} to the supplier register, or record the prices you compared. Either one clears this.`;
      break;
    case "not_approved":
      reason =
        "A line names a supplier that is on hold or archived on the register, so they are not approved to trade with.";
      remedy =
        "Switch the line to an active supplier, or record the prices you compared. Either one clears this.";
      break;
    case "none":
      break;
  }

  return {
    required,
    satisfied: !required || input.competitiveQuotesRecorded > 0,
    trigger,
    reason,
    remedy,
    unregisteredSupplierNames,
    // Below the threshold every trigger has a cheaper fix than an RFQ; at or
    // above it, competition is the point and nothing else will do.
    rfqIsOnlyRemedy: trigger === "over_threshold",
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

/**
 * Tender position for one request, for the pricing screen and the gate.
 *
 * `proposedUnitCosts` lets the caller judge the request at the prices ABOUT to
 * be saved rather than the ones already stored. The gate used to run after the
 * price write, which meant a blocked request had nonetheless been mutated —
 * prices saved, state not advanced, and nothing on screen saying so (audit
 * F1). Passing the proposed prices in lets the check run first, so a refusal
 * leaves the request exactly as the user found it.
 */
export async function fetchOpsTenderRequirement(
  requestId: string,
  options?: { proposedUnitCosts?: Map<string, number> },
): Promise<TenderRequirement> {
  const supabase = getOpsSupabaseServiceClient();

  const [policy, itemsResult, rfqResult] = await Promise.all([
    fetchOpsTenderPolicy(),
    supabase
      .from("material_request_items")
      .select(
        "id, quantity, actual_total, estimated_total, supplier_id, supplier_name_freeform, supplier:suppliers!material_request_items_supplier_id_fkey(status)",
      )
      .eq("request_id", requestId),
    supabase
      .from("rfqs")
      .select("id", { count: "exact", head: true })
      .eq("material_request_id", requestId)
      .neq("status", "cancelled"),
  ]);

  type ItemRow = {
    id: string;
    quantity: number | string | null;
    actual_total: number | string | null;
    estimated_total: number | string | null;
    supplier_id: string | null;
    supplier_name_freeform: string | null;
    supplier: { status: string } | { status: string }[] | null;
  };

  const items = (itemsResult.data ?? []) as unknown as ItemRow[];
  const proposed = options?.proposedUnitCosts;

  let requestValue = 0;
  let itemsWithRegisteredSupplier = 0;
  let itemsWithUnregisteredSupplier = 0;
  let itemsWithUnapprovedSupplier = 0;
  const unregisteredNames = new Set<string>();

  for (const item of items) {
    const proposedUnitCost = proposed?.get(item.id);
    if (proposedUnitCost !== undefined) {
      requestValue += proposedUnitCost * toNumber(item.quantity);
    } else {
      const priced = toNumber(item.actual_total);
      requestValue += priced > 0 ? priced : toNumber(item.estimated_total);
    }

    if (item.supplier_id) {
      itemsWithRegisteredSupplier += 1;
      const supplier = Array.isArray(item.supplier)
        ? (item.supplier[0] ?? null)
        : item.supplier;
      if (supplier && supplier.status !== "active") {
        itemsWithUnapprovedSupplier += 1;
      }
      continue;
    }

    // A typed name is a named supplier — just not an approved one. Counting it
    // as "no supplier" is what produced the contradiction in audit F1.
    const freeform = (item.supplier_name_freeform ?? "").trim();
    if (freeform) {
      itemsWithUnregisteredSupplier += 1;
      unregisteredNames.add(freeform);
    }
  }

  return evaluateTenderRequirement({
    requestValue,
    itemCount: items.length,
    itemsWithRegisteredSupplier,
    itemsWithUnregisteredSupplier,
    itemsWithUnapprovedSupplier,
    unregisteredSupplierNames: Array.from(unregisteredNames),
    competitiveQuotesRecorded: rfqResult.count ?? 0,
    policy,
  });
}

/**
 * Tender position for many requests at once, for the material requests list.
 *
 * The list renders every request the user can see, so the gate has to be
 * readable from the moment items exist rather than discovered by pressing
 * "Send to Finance" (audit F1). One query per table, not per request.
 */
export async function fetchOpsTenderRequirements(
  requestIds: string[],
): Promise<Map<string, TenderRequirement>> {
  const out = new Map<string, TenderRequirement>();
  if (requestIds.length === 0) {
    return out;
  }

  const supabase = getOpsSupabaseServiceClient();
  const [policy, itemsResult, rfqResult] = await Promise.all([
    fetchOpsTenderPolicy(),
    supabase
      .from("material_request_items")
      .select(
        "request_id, actual_total, estimated_total, supplier_id, supplier_name_freeform, supplier:suppliers!material_request_items_supplier_id_fkey(status)",
      )
      .in("request_id", requestIds),
    supabase
      .from("rfqs")
      .select("material_request_id")
      .in("material_request_id", requestIds)
      .neq("status", "cancelled"),
  ]);

  type ItemRow = {
    request_id: string;
    actual_total: number | string | null;
    estimated_total: number | string | null;
    supplier_id: string | null;
    supplier_name_freeform: string | null;
    supplier: { status: string } | { status: string }[] | null;
  };

  const rfqCounts = new Map<string, number>();
  for (const row of (rfqResult.data ?? []) as Array<{ material_request_id: string }>) {
    rfqCounts.set(
      row.material_request_id,
      (rfqCounts.get(row.material_request_id) ?? 0) + 1,
    );
  }

  type Tally = {
    requestValue: number;
    itemCount: number;
    itemsWithRegisteredSupplier: number;
    itemsWithUnregisteredSupplier: number;
    itemsWithUnapprovedSupplier: number;
    names: Set<string>;
  };

  const tallies = new Map<string, Tally>();
  for (const requestId of requestIds) {
    tallies.set(requestId, {
      requestValue: 0,
      itemCount: 0,
      itemsWithRegisteredSupplier: 0,
      itemsWithUnregisteredSupplier: 0,
      itemsWithUnapprovedSupplier: 0,
      names: new Set(),
    });
  }

  for (const item of (itemsResult.data ?? []) as unknown as ItemRow[]) {
    const tally = tallies.get(item.request_id);
    if (!tally) {
      continue;
    }
    tally.itemCount += 1;
    const priced = toNumber(item.actual_total);
    tally.requestValue += priced > 0 ? priced : toNumber(item.estimated_total);

    if (item.supplier_id) {
      tally.itemsWithRegisteredSupplier += 1;
      const supplier = Array.isArray(item.supplier)
        ? (item.supplier[0] ?? null)
        : item.supplier;
      if (supplier && supplier.status !== "active") {
        tally.itemsWithUnapprovedSupplier += 1;
      }
      continue;
    }

    const freeform = (item.supplier_name_freeform ?? "").trim();
    if (freeform) {
      tally.itemsWithUnregisteredSupplier += 1;
      tally.names.add(freeform);
    }
  }

  for (const [requestId, tally] of tallies) {
    out.set(
      requestId,
      evaluateTenderRequirement({
        requestValue: tally.requestValue,
        itemCount: tally.itemCount,
        itemsWithRegisteredSupplier: tally.itemsWithRegisteredSupplier,
        itemsWithUnregisteredSupplier: tally.itemsWithUnregisteredSupplier,
        itemsWithUnapprovedSupplier: tally.itemsWithUnapprovedSupplier,
        unregisteredSupplierNames: Array.from(tally.names),
        competitiveQuotesRecorded: rfqCounts.get(requestId) ?? 0,
        policy,
      }),
    );
  }

  return out;
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
