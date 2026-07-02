import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

export type OpsProjectCostEntryStatus = "committed" | "posted" | "cancelled";

function normalizeMoney(value: number | string | null | undefined) {
  return Number(value ?? 0);
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
    cost_date?: string;
    cost_type: string;
    currency_code?: string;
    description: string;
    material_request_id?: string | null;
    payment_request_id?: string | null;
    purchase_order_id?: string | null;
    site_id: string;
    source_id: string;
    source_table: string;
    supplier_id?: string | null;
  };
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

  const payload = {
    amount: normalizeMoney(input.payload.amount),
    budget_id: input.payload.budget_id,
    budget_line_id: input.payload.budget_line_id,
    cost_date: input.payload.cost_date ?? new Date().toISOString().slice(0, 10),
    cost_type: input.payload.cost_type,
    currency_code: input.payload.currency_code ?? "ZMW",
    description: input.payload.description,
    material_request_id: input.payload.material_request_id ?? null,
    payment_request_id: input.payload.payment_request_id ?? null,
    purchase_order_id: input.payload.purchase_order_id ?? null,
    site_id: input.payload.site_id,
    source_id: input.payload.source_id,
    source_table: input.payload.source_table,
    status: input.status,
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
};

/**
 * Writes up to two ledger rows for a material request: the goods entry
 * (cost_type="materials", keyed to budget_line_id) and, only if
 * transport_cost > 0, a separate transport entry (cost_type="transport",
 * keyed to transport_budget_line_id) — the two never mix into one row, same
 * as material_requests.transport_cost never mixes into the goods totals.
 * Both are best-effort from the caller's perspective (wrap in .catch()) so a
 * ledger hiccup never blocks the underlying status transition.
 */
export async function upsertMaterialRequestCostEntries(input: {
  actorUserId: string;
  request: MaterialRequestForCostEntry;
  goodsAmount: number;
  status: OpsProjectCostEntryStatus;
}) {
  const supabase = getOpsSupabaseServiceClient();
  const { request } = input;

  const lineIds = [request.budget_line_id, request.transport_budget_line_id].filter(
    (id): id is string => Boolean(id),
  );

  const budgetIdByLine = new Map<string, string>();
  if (lineIds.length > 0) {
    const { data: lineRows, error: lineError } = await supabase
      .from("project_budget_lines")
      .select("id, budget_id")
      .in("id", lineIds);
    if (lineError) {
      throw lineError;
    }
    for (const row of (lineRows ?? []) as BudgetLineForCostEntry[]) {
      budgetIdByLine.set(row.id, row.budget_id);
    }
  }

  const results: { goodsEntryId: string | null; transportEntryId: string | null } = {
    goodsEntryId: null,
    transportEntryId: null,
  };

  if (request.budget_line_id) {
    results.goodsEntryId = await upsertProjectCostEntry({
      actorUserId: input.actorUserId,
      match: { material_request_id: request.id, cost_type: "materials" },
      payload: {
        amount: input.goodsAmount,
        budget_id: budgetIdByLine.get(request.budget_line_id) ?? null,
        budget_line_id: request.budget_line_id,
        cost_type: "materials",
        description: request.title
          ? `${request.request_number} / ${request.title}`
          : request.request_number,
        material_request_id: request.id,
        site_id: request.site_id,
        source_id: request.id,
        source_table: "material_requests",
      },
      status: input.status,
    });
  }

  const transportCost = normalizeMoney(request.transport_cost);
  if (request.transport_budget_line_id && transportCost > 0) {
    results.transportEntryId = await upsertProjectCostEntry({
      actorUserId: input.actorUserId,
      match: { material_request_id: request.id, cost_type: "transport" },
      payload: {
        amount: transportCost,
        budget_id: budgetIdByLine.get(request.transport_budget_line_id) ?? null,
        budget_line_id: request.transport_budget_line_id,
        cost_type: "transport",
        description: `${request.request_number} / transport`,
        material_request_id: request.id,
        site_id: request.site_id,
        source_id: request.id,
        source_table: "material_requests",
      },
      status: input.status,
    });
  }

  return results;
}
