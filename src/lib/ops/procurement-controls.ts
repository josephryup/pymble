import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import {
  deriveRequestFulfilment,
  type ProcurementDecision,
  type PurchaseOrderLineForFulfilment,
  type RequestFulfilment,
  type RequestItemForFulfilment,
} from "@/lib/ops/procurement-fulfilment";

/**
 * Phase 3b detective controls — docs/pymble-ops-project-finance-spine-audit.md §8.8.
 *
 * Two risks the procurement redesign introduces, each with a report that makes
 * it visible. Both are read-only.
 *
 *   R3 — partial procurement can hide chronic under-supply. A declined item is
 *        an unmet site need, and today that information simply vanishes: the
 *        site's only recourse is to raise the same request again, which is
 *        plausibly part of why 11 sites have generated 42 requests and 337
 *        items. This surfaces those needs, aged, with repeat declines flagged.
 *
 *   R4 — reservations can become permanent ghosts. A request approved and then
 *        never procured holds budget forever, eventually making a healthy
 *        budget look exhausted. Reservations are reported when stale, never
 *        released automatically: silently handing funds back is its own hazard.
 *
 * The ageing and severity rules are pure so they are testable without a
 * database.
 */

/** Days a reservation may sit before it is worth reporting. */
export const STALE_RESERVATION_DAYS = 60;

/** Days past the needed-by date before an unmet need escalates. */
export const UNMET_NEED_OVERDUE_DAYS = 0;

export type UnmetNeedRow = {
  requestId: string;
  requestNumber: string;
  requestTitle: string;
  siteCode: string;
  itemId: string;
  itemName: string;
  outstandingQuantity: number;
  unit: string;
  decision: ProcurementDecision;
  reason: string;
  declineCount: number;
  neededBy: string | null;
  /** Days past needed-by; negative means still in time. Null when no date. */
  daysOverdue: number | null;
  /** Two or more declines — a supply failure, not a procurement decision. */
  isChronic: boolean;
  /** Escalate to Procurement Manager, then the PM. */
  isEscalating: boolean;
};

export type StaleReservationRow = {
  requestId: string;
  requestNumber: string;
  requestTitle: string;
  siteCode: string;
  amount: number;
  costCodeLabel: string | null;
  reservedOn: string;
  ageDays: number;
  neededBy: string | null;
  isStale: boolean;
};

function daysBetween(from: string, to: Date): number {
  const parsed = new Date(from);
  if (Number.isNaN(parsed.getTime())) {
    return 0;
  }
  return Math.floor((to.getTime() - parsed.getTime()) / 86_400_000);
}

function toNumber(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

/**
 * Classify an unmet need. Escalation is driven by AGE, not by decline count
 * alone: an item declined once but already past its needed-by date is more
 * urgent than one declined twice that nobody needs until next quarter.
 */
export function classifyUnmetNeed(input: {
  decision: ProcurementDecision;
  declineCount: number;
  outstandingQuantity: number;
  neededBy: string | null;
  now?: Date;
}): { isChronic: boolean; isEscalating: boolean; daysOverdue: number | null } {
  const now = input.now ?? new Date();
  const daysOverdue = input.neededBy ? daysBetween(input.neededBy, now) : null;
  const isChronic = input.declineCount >= 2;
  const overdue = daysOverdue !== null && daysOverdue > UNMET_NEED_OVERDUE_DAYS;

  return {
    isChronic,
    daysOverdue,
    isEscalating: input.outstandingQuantity > 0 && (isChronic || overdue),
  };
}

/** A reservation is stale on age, or sooner once its needed-by has passed. */
export function isReservationStale(input: {
  reservedOn: string;
  neededBy: string | null;
  now?: Date;
  staleDays?: number;
}): { ageDays: number; isStale: boolean } {
  const now = input.now ?? new Date();
  const staleDays = input.staleDays ?? STALE_RESERVATION_DAYS;
  const ageDays = daysBetween(input.reservedOn, now);
  const pastNeededBy =
    input.neededBy !== null && daysBetween(input.neededBy, now) > 30;

  return { ageDays, isStale: ageDays > staleDays || pastNeededBy };
}

/** Items Procurement declined or deferred that the site still needs. */
export async function fetchOpsUnmetNeeds(): Promise<UnmetNeedRow[]> {
  const supabase = getOpsSupabaseServiceClient();

  const { data, error } = await supabase
    .from("material_request_items")
    .select(
      "id, item_name, quantity, unit, procurement_decision, decision_reason, decline_count, request:material_requests!material_request_items_request_id_fkey(id, request_number, title, needed_by, status, archived_at, site:sites!material_requests_site_id_fkey(code))",
    )
    .in("procurement_decision", ["declined", "deferred"]);

  if (error) {
    throw error;
  }

  type Row = {
    id: string;
    item_name: string;
    quantity: number | string;
    unit: string;
    procurement_decision: ProcurementDecision;
    decision_reason: string;
    decline_count: number;
    request: {
      id: string;
      request_number: string;
      title: string;
      needed_by: string | null;
      status: string;
      archived_at: string | null;
      site: { code: string } | { code: string }[] | null;
    } | null;
  };

  const rows = (data ?? []) as unknown as Row[];
  const itemIds = rows.map((row) => row.id);

  // Ordered quantity comes from PO lines, never from a stored mirror.
  const orderedByItem = new Map<string, number>();
  if (itemIds.length > 0) {
    const { data: poItems, error: poError } = await supabase
      .from("purchase_order_items")
      .select(
        "material_request_item_id, quantity, purchase_order:purchase_orders!purchase_order_items_purchase_order_id_fkey(status)",
      )
      .in("material_request_item_id", itemIds);
    if (poError) {
      throw poError;
    }
    for (const row of (poItems ?? []) as unknown as Array<{
      material_request_item_id: string;
      quantity: number | string;
      purchase_order: { status: string } | { status: string }[] | null;
    }>) {
      const po = Array.isArray(row.purchase_order)
        ? (row.purchase_order[0] ?? null)
        : row.purchase_order;
      if (!po || po.status === "cancelled" || po.status === "rejected") continue;
      orderedByItem.set(
        row.material_request_item_id,
        (orderedByItem.get(row.material_request_item_id) ?? 0) + toNumber(row.quantity),
      );
    }
  }

  const now = new Date();
  const out: UnmetNeedRow[] = [];

  for (const row of rows) {
    const request = row.request;
    // An archived or dead request is not an unmet need.
    if (
      !request ||
      request.archived_at ||
      ["draft", "rejected", "cancelled", "closed"].includes(request.status)
    ) {
      continue;
    }

    const site = Array.isArray(request.site) ? (request.site[0] ?? null) : request.site;
    const outstandingQuantity = Math.max(
      toNumber(row.quantity) - (orderedByItem.get(row.id) ?? 0),
      0,
    );
    if (outstandingQuantity <= 0) continue;

    const classified = classifyUnmetNeed({
      decision: row.procurement_decision,
      declineCount: row.decline_count,
      outstandingQuantity,
      neededBy: request.needed_by,
      now,
    });

    out.push({
      requestId: request.id,
      requestNumber: request.request_number,
      requestTitle: request.title,
      siteCode: site?.code ?? "—",
      itemId: row.id,
      itemName: row.item_name,
      outstandingQuantity,
      unit: row.unit,
      decision: row.procurement_decision,
      reason: row.decision_reason,
      declineCount: row.decline_count,
      neededBy: request.needed_by,
      ...classified,
    });
  }

  // Most urgent first: escalating, then chronic, then most overdue.
  return out.sort(
    (a, b) =>
      Number(b.isEscalating) - Number(a.isEscalating) ||
      Number(b.isChronic) - Number(a.isChronic) ||
      (b.daysOverdue ?? -Infinity) - (a.daysOverdue ?? -Infinity),
  );
}

/**
 * Reservations still standing, with the stale ones flagged. Deliberately
 * reports rather than releases — see R4.
 */
export async function fetchOpsStaleReservations(): Promise<{
  rows: StaleReservationRow[];
  staleAmount: number;
  totalReservedAmount: number;
}> {
  const supabase = getOpsSupabaseServiceClient();

  const { data, error } = await supabase
    .from("project_cost_entries")
    .select(
      "amount, created_at, material_request_id, cost_code:project_cost_codes!project_cost_entries_cost_code_id_fkey(path, name), request:material_requests!project_cost_entries_material_request_id_fkey(id, request_number, title, needed_by, status, site:sites!material_requests_site_id_fkey(code))",
    )
    .eq("lifecycle_state", "reserved");

  if (error) {
    throw error;
  }

  type Row = {
    amount: number | string;
    created_at: string;
    material_request_id: string | null;
    cost_code: { path: string; name: string } | { path: string; name: string }[] | null;
    request: {
      id: string;
      request_number: string;
      title: string;
      needed_by: string | null;
      status: string;
      site: { code: string } | { code: string }[] | null;
    } | null;
  };

  const now = new Date();
  const rows: StaleReservationRow[] = [];
  let staleAmount = 0;
  let totalReservedAmount = 0;

  for (const row of (data ?? []) as unknown as Row[]) {
    const request = row.request;
    if (!request) continue;

    const site = Array.isArray(request.site) ? (request.site[0] ?? null) : request.site;
    const code = Array.isArray(row.cost_code) ? (row.cost_code[0] ?? null) : row.cost_code;
    const amount = toNumber(row.amount);
    const { ageDays, isStale } = isReservationStale({
      reservedOn: row.created_at,
      neededBy: request.needed_by,
      now,
    });

    totalReservedAmount += amount;
    if (isStale) {
      staleAmount += amount;
    }

    rows.push({
      requestId: request.id,
      requestNumber: request.request_number,
      requestTitle: request.title,
      siteCode: site?.code ?? "—",
      amount,
      costCodeLabel: code ? `${code.path} · ${code.name}` : null,
      reservedOn: row.created_at,
      ageDays,
      neededBy: request.needed_by,
      isStale,
    });
  }

  rows.sort((a, b) => Number(b.isStale) - Number(a.isStale) || b.ageDays - a.ageDays);

  return {
    rows,
    staleAmount: Math.round((staleAmount + Number.EPSILON) * 100) / 100,
    totalReservedAmount: Math.round((totalReservedAmount + Number.EPSILON) * 100) / 100,
  };
}

/** Full fulfilment position for one request, for the procure screen. */
export async function fetchOpsRequestFulfilment(
  requestId: string,
): Promise<RequestFulfilment> {
  const supabase = getOpsSupabaseServiceClient();

  const { data: itemRows, error: itemError } = await supabase
    .from("material_request_items")
    .select(
      "id, item_name, quantity, actual_total, estimated_total, procurement_decision, decline_count",
    )
    .eq("request_id", requestId)
    .order("line_number", { ascending: true });

  if (itemError) {
    throw itemError;
  }

  const items: RequestItemForFulfilment[] = (
    (itemRows ?? []) as Array<{
      id: string;
      item_name: string;
      quantity: number | string;
      actual_total: number | string | null;
      estimated_total: number | string | null;
      procurement_decision: ProcurementDecision;
      decline_count: number;
    }>
  ).map((row) => {
    const priced = toNumber(row.actual_total);
    return {
      id: row.id,
      itemName: row.item_name,
      quantity: toNumber(row.quantity),
      approvedValue: priced > 0 ? priced : toNumber(row.estimated_total),
      decision: row.procurement_decision,
      declineCount: row.decline_count,
    };
  });

  let poLines: PurchaseOrderLineForFulfilment[] = [];
  if (items.length > 0) {
    const { data: poItems, error: poError } = await supabase
      .from("purchase_order_items")
      .select(
        "material_request_item_id, quantity, unit_cost, purchase_order:purchase_orders!purchase_order_items_purchase_order_id_fkey(status)",
      )
      .in(
        "material_request_item_id",
        items.map((item) => item.id),
      );
    if (poError) {
      throw poError;
    }

    poLines = ((poItems ?? []) as unknown as Array<{
      material_request_item_id: string;
      quantity: number | string;
      unit_cost: number | string | null;
      purchase_order: { status: string } | { status: string }[] | null;
    }>).map((row) => {
      const po = Array.isArray(row.purchase_order)
        ? (row.purchase_order[0] ?? null)
        : row.purchase_order;
      return {
        materialRequestItemId: row.material_request_item_id,
        quantity: toNumber(row.quantity),
        unitRate: toNumber(row.unit_cost),
        isLive: Boolean(po) && po?.status !== "cancelled" && po?.status !== "rejected",
      };
    });
  }

  return deriveRequestFulfilment(items, poLines);
}
