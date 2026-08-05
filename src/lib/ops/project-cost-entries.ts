import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

export type OpsProjectCostEntryStatus = "committed" | "posted" | "cancelled";

/** Stations of the cost lifecycle — see the ops_cost_lifecycle_state enum. */
export type OpsCostLifecycleState =
  | "reserved"
  | "committed"
  | "accrued"
  | "actual"
  | "paid"
  | "released";

/**
 * The coarse `status` every existing report reads is derived from the station,
 * never set independently. This mapping is the mirror of the database check
 * constraint project_cost_entries_lifecycle_status_agree — if the two ever
 * disagree, the insert fails loudly rather than writing an inconsistent row.
 */
export function statusForLifecycleState(
  state: OpsCostLifecycleState,
): OpsProjectCostEntryStatus {
  switch (state) {
    case "reserved":
    case "committed":
    case "accrued":
      return "committed";
    case "actual":
    case "paid":
      return "posted";
    case "released":
      return "cancelled";
  }
}

function normalizeMoney(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

/**
 * Idempotent upsert into the shared project_cost_entries ledger. `match` is
 * the set of equality filters that identifies "the same entry" across calls
 * (e.g. one payment request → one entry; one material request → up to two
 * entries, split by cost_type). Both Payment Requests and Material Requests
 * write through this single code path.
 */
export async function upsertProjectCostEntry(input: {
  actorUserId: string;
  match: Record<string, string>;
  payload: {
    amount: number;
    budget_id: string | null;
    budget_line_id: string | null;
    cost_code_id?: string | null;
    cost_date?: string;
    cost_type: string;
    currency_code?: string;
    description: string;
    material_request_id?: string | null;
    payment_request_id?: string | null;
    purchase_order_id?: string | null;
    /** Overhead attribution, when the cost belongs to no project at all. */
    cost_centre_id?: string | null;
    /**
     * A completed project from the legacy register. Mutually exclusive with
     * site_id — the payment_requests CHECK constraint is what enforces that;
     * this just carries the resolved answer into the cost ledger so
     * "what did that project cost us" stays answerable.
     */
    legacy_project_id?: string | null;
    /** Null for legacy-project and overhead costs. */
    site_id: string | null;
    source_id: string;
    source_table: string;
    supplier_id?: string | null;
  };
  /**
   * Which station this entry represents. `status` is derived from it, so
   * callers can no longer set the two inconsistently. Defaults to the station
   * implied by `status` for callers not yet migrated.
   */
  lifecycleState?: OpsCostLifecycleState;
  status: OpsProjectCostEntryStatus;
}): Promise<string> {
  const supabase = getOpsSupabaseServiceClient();

  let existingQuery = supabase.from("project_cost_entries").select("id");
  for (const [column, value] of Object.entries(input.match)) {
    existingQuery = existingQuery.eq(column, value);
  }
  const { data: existing, error: existingError } = await existingQuery.maybeSingle<{
    id: string;
  }>();

  if (existingError) {
    throw existingError;
  }

  // Default the station from the legacy status so callers not yet migrated
  // keep working: 'committed' means a reservation until a PO proves otherwise.
  const lifecycleState: OpsCostLifecycleState =
    input.lifecycleState ??
    (input.status === "posted"
      ? "actual"
      : input.status === "cancelled"
        ? "released"
        : input.payload.purchase_order_id
          ? "committed"
          : "reserved");

  const payload = {
    amount: normalizeMoney(input.payload.amount),
    budget_id: input.payload.budget_id,
    budget_line_id: input.payload.budget_line_id,
    cost_code_id: input.payload.cost_code_id ?? null,
    cost_date: input.payload.cost_date ?? new Date().toISOString().slice(0, 10),
    cost_type: input.payload.cost_type,
    currency_code: input.payload.currency_code ?? "ZMW",
    description: input.payload.description,
    lifecycle_state: lifecycleState,
    material_request_id: input.payload.material_request_id ?? null,
    payment_request_id: input.payload.payment_request_id ?? null,
    purchase_order_id: input.payload.purchase_order_id ?? null,
    cost_centre_id: input.payload.cost_centre_id ?? null,
    legacy_project_id: input.payload.legacy_project_id ?? null,
    site_id: input.payload.site_id,
    source_id: input.payload.source_id,
    source_table: input.payload.source_table,
    // Derived, never taken from the caller — see statusForLifecycleState.
    status: statusForLifecycleState(lifecycleState),
    supplier_id: input.payload.supplier_id ?? null,
  };

  if (existing) {
    const { error } = await supabase
      .from("project_cost_entries")
      .update(payload)
      .eq("id", existing.id);

    if (error) {
      throw error;
    }

    return existing.id;
  }

  const { data, error } = await supabase
    .from("project_cost_entries")
    .insert({ ...payload, created_by: input.actorUserId })
    .select("id")
    .single<{ id: string }>();

  if (error || !data) {
    throw error ?? new Error("Could not create project cost entry.");
  }

  return data.id;
}

/**
 * Relieve every live station a material request holds, except the one it has
 * just advanced to.
 *
 * This is the rule that stops the ledger double-counting: a request that has
 * been approved (reserved) and then ordered (committed) must not show both
 * amounts against the budget. Relief marks the superseded station `released`,
 * which the availability calculation ignores and which the unique index
 * deliberately does not constrain — so a request can relieve everything it
 * holds, however many stations that is.
 *
 * Called in the same operation as the advance, never as a follow-up job: a
 * crash between the two would leave the budget overstated, which is exactly
 * the class of drift this design exists to prevent.
 */
export async function releaseSupersededCostStations(input: {
  materialRequestId: string;
  /** The station just written. Everything live *other* than this is relieved. */
  keepState: OpsCostLifecycleState;
  /** Limit relief to one cost type when only that type advanced. */
  costType?: string;
}): Promise<number> {
  const supabase = getOpsSupabaseServiceClient();

  let query = supabase
    .from("project_cost_entries")
    .update({ lifecycle_state: "released", status: "cancelled" })
    .eq("material_request_id", input.materialRequestId)
    .neq("lifecycle_state", "released")
    .neq("lifecycle_state", input.keepState);

  if (input.costType) {
    query = query.eq("cost_type", input.costType);
  }

  const { data, error } = await query.select("id");
  if (error) {
    throw error;
  }

  return (data ?? []).length;
}

export type MaterialRequestForCostEntry = {
  id: string;
  request_number: string;
  title: string;
  site_id: string;
  budget_line_id: string | null;
  transport_budget_line_id: string | null;
  transport_cost: number | string | null;
};

type BudgetLineForCostEntry = {
  id: string;
  budget_id: string;
  cost_code_id: string | null;
};

/**
 * Writes up to two ledger rows for a material request: the goods entry
 * (cost_type="materials", keyed to budget_line_id) and, only if
 * transport_cost > 0, a separate transport entry (cost_type="transport",
 * keyed to transport_budget_line_id) — the two never mix into one row, same
 * as material_requests.transport_cost never mixes into the goods totals.
 * Both are best-effort from the caller's perspective (wrap in .catch()) so a
 * ledger hiccup never blocks the underlying status transition.
 *
 * Each entry carries the cost code inherited from its budget line, so the
 * ledger and the budget can never disagree about which code money sits on.
 * When `lifecycleState` advances the request to a new station, superseded
 * stations are relieved in the same call (see releaseSupersededCostStations).
 */
export async function upsertMaterialRequestCostEntries(input: {
  actorUserId: string;
  request: MaterialRequestForCostEntry;
  goodsAmount: number;
  lifecycleState?: OpsCostLifecycleState;
  status: OpsProjectCostEntryStatus;
}) {
  const supabase = getOpsSupabaseServiceClient();
  const { request } = input;

  const lineIds = [request.budget_line_id, request.transport_budget_line_id].filter(
    (id): id is string => Boolean(id),
  );

  const budgetIdByLine = new Map<string, string>();
  const costCodeByLine = new Map<string, string | null>();
  if (lineIds.length > 0) {
    const { data: lineRows, error: lineError } = await supabase
      .from("project_budget_lines")
      .select("id, budget_id, cost_code_id")
      .in("id", lineIds);
    if (lineError) {
      throw lineError;
    }
    for (const row of (lineRows ?? []) as BudgetLineForCostEntry[]) {
      budgetIdByLine.set(row.id, row.budget_id);
      costCodeByLine.set(row.id, row.cost_code_id);
    }
  }

  const lifecycleState: OpsCostLifecycleState =
    input.lifecycleState ??
    (input.status === "posted"
      ? "actual"
      : input.status === "cancelled"
        ? "released"
        : "reserved");

  const results: { goodsEntryId: string | null; transportEntryId: string | null } = {
    goodsEntryId: null,
    transportEntryId: null,
  };

  if (request.budget_line_id) {
    results.goodsEntryId = await upsertProjectCostEntry({
      actorUserId: input.actorUserId,
      match: {
        material_request_id: request.id,
        cost_type: "materials",
        lifecycle_state: lifecycleState,
      },
      payload: {
        amount: input.goodsAmount,
        budget_id: budgetIdByLine.get(request.budget_line_id) ?? null,
        budget_line_id: request.budget_line_id,
        cost_code_id: costCodeByLine.get(request.budget_line_id) ?? null,
        cost_type: "materials",
        description: request.title
          ? `${request.request_number} / ${request.title}`
          : request.request_number,
        material_request_id: request.id,
        site_id: request.site_id,
        source_id: request.id,
        source_table: "material_requests",
      },
      lifecycleState,
      status: input.status,
    });
  }

  const transportCost = normalizeMoney(request.transport_cost);
  if (request.transport_budget_line_id && transportCost > 0) {
    results.transportEntryId = await upsertProjectCostEntry({
      actorUserId: input.actorUserId,
      match: {
        material_request_id: request.id,
        cost_type: "transport",
        lifecycle_state: lifecycleState,
      },
      payload: {
        amount: transportCost,
        budget_id: budgetIdByLine.get(request.transport_budget_line_id) ?? null,
        budget_line_id: request.transport_budget_line_id,
        cost_code_id: costCodeByLine.get(request.transport_budget_line_id) ?? null,
        cost_type: "transport",
        description: `${request.request_number} / transport`,
        material_request_id: request.id,
        site_id: request.site_id,
        source_id: request.id,
        source_table: "material_requests",
      },
      lifecycleState,
      status: input.status,
    });
  }

  // Relieve any station this request previously held, in the same call as the
  // advance. `released` is never the target of relief, so cancellation (which
  // passes 'released') correctly relieves everything else and stops.
  if (lifecycleState !== "released") {
    await releaseSupersededCostStations({
      materialRequestId: request.id,
      keepState: lifecycleState,
    });
  }

  return results;
}
