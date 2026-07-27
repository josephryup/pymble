import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type { OpsMaterialRequestStatus } from "@/lib/ops/types";

/**
 * Real consumption against material schedule lines (audit finding A2).
 *
 * The schedule's own `actual_quantity` column is a manual re-key and is frozen
 * once a schedule is issued, so it cannot answer "how much of this line have we
 * actually ordered?". The answer already exists in the data:
 * `material_request_items.boq_line_item_id` links every requested item back to
 * the schedule line it was planned against.
 *
 * Deliberately aggregated from request *items*, not from `project_cost_entries`.
 * Cost entries are written per material request, not per item, so splitting one
 * across the several schedule lines a request may cover would mean apportioning
 * money by guesswork. Item-level quantities and priced totals are exact, so
 * that is what this reports; request-level committed/posted spend stays on the
 * budget screens where it is accurate.
 */

/** Statuses that mean the request is dead and should not count as consumption. */
const CANCELLED_STATUSES = new Set<string>(["rejected", "cancelled"]);

/** Statuses that mean goods have physically arrived. */
const DELIVERED_STATUSES = new Set<string>(["delivered", "closed"]);

export type BoqLineRequestRef = {
  requestId: string;
  requestNumber: string;
  status: OpsMaterialRequestStatus;
  quantity: number;
  /** Procurement's priced total when priced, else the engineer's estimate. */
  value: number;
  /** True once the priced figure is in (actual_total > 0). */
  isPriced: boolean;
};

export type BoqLineActuals = {
  /** Quantity requested across every live request linked to this line. */
  requestedQuantity: number;
  /** Value of those requests: priced where priced, estimated otherwise. */
  requestedValue: number;
  /** Quantity on requests whose goods have arrived. */
  deliveredQuantity: number;
  /** Number of live linked requests. */
  requestCount: number;
  /** Live linked requests, newest first. */
  requests: BoqLineRequestRef[];
};

export const EMPTY_BOQ_LINE_ACTUALS: BoqLineActuals = {
  requestedQuantity: 0,
  requestedValue: 0,
  deliveredQuantity: 0,
  requestCount: 0,
  requests: [],
};

export type BoqLineActualsRow = {
  boq_line_item_id: string | null;
  quantity: number | string | null;
  estimated_total: number | string | null;
  actual_total: number | string | null;
  request: {
    id: string;
    request_number: string;
    status: OpsMaterialRequestStatus;
  } | null;
};

function normalizeMoney(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Fold request-item rows into per-schedule-line totals. Pure, so the rules
 * (which statuses count, priced-vs-estimated) are testable without a database.
 */
export function aggregateBoqLineActuals(
  rows: BoqLineActualsRow[],
): Map<string, BoqLineActuals> {
  const byLine = new Map<string, BoqLineActuals>();

  for (const row of rows) {
    const lineId = row.boq_line_item_id;
    const request = row.request;
    if (!lineId || !request) continue;
    // A rejected or cancelled request never became consumption.
    if (CANCELLED_STATUSES.has(request.status)) continue;

    const quantity = normalizeMoney(row.quantity);
    const pricedTotal = normalizeMoney(row.actual_total);
    const isPriced = pricedTotal > 0;
    const value = isPriced ? pricedTotal : normalizeMoney(row.estimated_total);

    const current = byLine.get(lineId) ?? {
      requestedQuantity: 0,
      requestedValue: 0,
      deliveredQuantity: 0,
      requestCount: 0,
      requests: [] as BoqLineRequestRef[],
    };

    current.requestedQuantity = roundMoney(current.requestedQuantity + quantity);
    current.requestedValue = roundMoney(current.requestedValue + value);
    if (DELIVERED_STATUSES.has(request.status)) {
      current.deliveredQuantity = roundMoney(current.deliveredQuantity + quantity);
    }
    current.requests.push({
      requestId: request.id,
      requestNumber: request.request_number,
      status: request.status,
      quantity,
      value,
      isPriced,
    });
    current.requestCount = current.requests.length;

    byLine.set(lineId, current);
  }

  return byLine;
}

/**
 * Planned-vs-requested position for one schedule line. `remainingQuantity`
 * floors at zero; `isOverRequested` is the flag that matters.
 */
export function boqLineVariance(input: {
  plannedQuantity: number;
  plannedValue: number;
  actuals: BoqLineActuals;
}) {
  const requestedQuantity = input.actuals.requestedQuantity;
  const valueVariance = roundMoney(input.plannedValue - input.actuals.requestedValue);

  return {
    remainingQuantity: roundMoney(Math.max(input.plannedQuantity - requestedQuantity, 0)),
    isOverRequested: requestedQuantity > input.plannedQuantity,
    /** Positive = under plan, negative = over plan. */
    valueVariance,
    isOverValue: valueVariance < 0,
    /** 0–100+, share of the planned quantity already requested. */
    requestedPercent:
      input.plannedQuantity > 0
        ? Math.round((requestedQuantity / input.plannedQuantity) * 100)
        : 0,
  };
}

/** Fetch and aggregate actuals for the given schedule line ids. */
export async function fetchOpsBoqLineActuals(
  lineIds: string[],
): Promise<Map<string, BoqLineActuals>> {
  if (lineIds.length === 0) {
    return new Map();
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("material_request_items")
    .select(
      "boq_line_item_id, quantity, estimated_total, actual_total, request:material_requests!material_request_items_request_id_fkey(id, request_number, status)",
    )
    .in("boq_line_item_id", lineIds);

  if (error) {
    throw error;
  }

  const rows = ((data ?? []) as unknown as Array<
    Omit<BoqLineActualsRow, "request"> & {
      request: BoqLineActualsRow["request"] | BoqLineActualsRow["request"][] | null;
    }
  >).map((row) => ({
    ...row,
    request: Array.isArray(row.request) ? (row.request[0] ?? null) : row.request,
  }));

  return aggregateBoqLineActuals(rows);
}
