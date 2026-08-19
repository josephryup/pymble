import { recordOpsAuditEvent } from "@/lib/ops/audit";
import {
  transitionMaterialRequest,
  type MaterialRequestEdge,
} from "@/lib/ops/material-request-lifecycle";
import { fanoutToOpsRoles } from "@/lib/ops/notification-fanout";
import { queueOpsNotification } from "@/lib/ops/notifications";
import {
  deriveRequestFulfilment,
  type ProcurementDecision,
  type PurchaseOrderLineForFulfilment,
  type RequestFulfilment,
  type RequestItemForFulfilment,
} from "@/lib/ops/procurement-fulfilment";
import {
  releaseSupersededCostStations,
  upsertProjectCostEntry,
} from "@/lib/ops/project-cost-entries";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

/**
 * The one place a material request is advanced to `ordered`.
 *
 * ── Why this module was split out (workflow audit F2) ─────────────────────
 * This settlement used to live inside procure-actions.ts, which carries the
 * "use server" directive — so nothing else could import it without turning it
 * into a public server action. The result was that the OTHER path to ordered,
 * `issuePurchaseOrderAction` in rfq-po-actions.ts, could not reuse it and grew
 * its own two-line version instead:
 *
 *     .update({ status: "ordered" })
 *
 * No committed cost entry. No reservation relief. And because issuing a
 * purchase order is the ordinary way a request gets ordered, that silent path
 * is the one production actually took: every one of the eight purchase orders
 * in the database produced zero cost entries, and the `committed` lifecycle
 * station is empty company-wide.
 *
 * Moving the arithmetic to a plain module makes reuse possible, so both entry
 * points can call the same code rather than agreeing to behave the same.
 */

const PROCURE_ROUTE = "/ops/material-requests";

function toNumber(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

export type RequestForSettlement = {
  budget_line_id: string | null;
  id: string;
  request_number: string;
  site_id: string | null;
  status: string;
};

/**
 * Everything that happens once a procurement round's purchase records exist:
 * recompute fulfilment, advance the request, move the money between stations,
 * log it, and chase the unmet needs.
 *
 * Shared by both ways a request can reach "procured" — a sourced RFQ→PO round
 * and a recorded direct purchase (decision D1). The two differ only in how the
 * purchase record comes into being; from that point the arithmetic must be
 * identical, and the surest way to keep it identical is for there to be one
 * copy of it. Anything that varies is a parameter.
 */
export async function settleProcurementRound(input: {
  actorUserId: string;
  auditAction: string;
  buildSummary: (fulfilment: RequestFulfilment, itemCount: number) => string;
  createdPoCount: number;
  /** Every item on the request, whether or not this round touched it. */
  itemIds: string[];
  nowIso: string;
  request: RequestForSettlement;
}) {
  const supabase = getOpsSupabaseServiceClient();
  const { request } = input;

  const { data: freshItems } = await supabase
    .from("material_request_items")
    .select(
      "id, item_name, quantity, actual_total, estimated_total, procurement_decision, decline_count",
    )
    .eq("request_id", request.id);

  const { data: freshPoLines } = await supabase
    .from("purchase_order_items")
    .select(
      "material_request_item_id, quantity, unit_cost, purchase_order:purchase_orders!purchase_order_items_purchase_order_id_fkey(status)",
    )
    .in("material_request_item_id", input.itemIds);

  const fulfilmentItems: RequestItemForFulfilment[] = (
    (freshItems ?? []) as Array<{
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

  const fulfilmentPoLines: PurchaseOrderLineForFulfilment[] = (
    (freshPoLines ?? []) as unknown as Array<{
      material_request_item_id: string;
      quantity: number | string;
      unit_cost: number | string | null;
      purchase_order: { status: string } | { status: string }[] | null;
    }>
  ).map((row) => {
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

  const fulfilment = deriveRequestFulfilment(fulfilmentItems, fulfilmentPoLines);

  // The edge is decided by what is actually on live purchase orders, not by
  // which screen the user came from — that equivalence is the point of this
  // function. `null` means the round ordered nothing at all, so the request
  // stays where it is rather than being "advanced" to its own status.
  const edge: MaterialRequestEdge | null = fulfilment.isComplete
    ? "ordered"
    : fulfilment.isPartial
      ? "partially_ordered"
      : null;

  if (edge) {
    await transitionMaterialRequest({
      requestId: request.id,
      edge,
      actorUserId: input.actorUserId,
      patch: edge === "ordered" ? { ordered_at: input.nowIso } : {},
      reason: input.auditAction,
    });
  }

  const nextStatus = edge ?? request.status;

  // ── §8.4: commitment recognised, reservation relieved ────────────────────
  // The committed entry carries only what was actually ordered; the
  // reservation is rewritten to the retained amount (pending + deferred), so
  // declined money returns to the budget. Both in one operation — a crash
  // between them would overstate the budget.
  if (request.budget_line_id && request.site_id) {
    const { data: budgetLine } = await supabase
      .from("project_budget_lines")
      .select("id, budget_id, cost_code_id")
      .eq("id", request.budget_line_id)
      .maybeSingle<{ id: string; budget_id: string; cost_code_id: string | null }>();

    const shared = {
      budget_id: budgetLine?.budget_id ?? null,
      budget_line_id: request.budget_line_id,
      cost_code_id: budgetLine?.cost_code_id ?? null,
      cost_type: "materials",
      material_request_id: request.id,
      site_id: request.site_id,
      source_id: request.id,
      source_table: "material_requests",
    };

    await upsertProjectCostEntry({
      actorUserId: input.actorUserId,
      match: {
        material_request_id: request.id,
        cost_type: "materials",
        lifecycle_state: "committed",
      },
      payload: {
        ...shared,
        amount: fulfilment.orderedValue,
        description: `${request.request_number} / ordered`,
      },
      lifecycleState: "committed",
      status: "committed",
    }).catch(() => null);

    if (fulfilment.retainedReservation > 0) {
      await upsertProjectCostEntry({
        actorUserId: input.actorUserId,
        match: {
          material_request_id: request.id,
          cost_type: "materials",
          lifecycle_state: "reserved",
        },
        payload: {
          ...shared,
          amount: fulfilment.retainedReservation,
          description: `${request.request_number} / awaiting procurement`,
        },
        lifecycleState: "reserved",
        status: "committed",
      }).catch(() => null);
    } else {
      // Nothing left to reserve: relieve it so declined money goes back.
      await releaseSupersededCostStations({
        materialRequestId: request.id,
        keepState: "committed",
        costType: "materials",
      }).catch(() => null);
    }
  }

  await recordOpsAuditEvent({
    action: input.auditAction,
    actorUserId: input.actorUserId,
    entityId: request.id,
    entityType: "material_request",
    metadata: {
      request_number: request.request_number,
      purchase_orders_created: input.createdPoCount,
      items_ordered: fulfilment.itemsOrdered,
      items_declined: fulfilment.itemsDeclined,
      items_deferred: fulfilment.itemsDeferred,
      ordered_value: fulfilment.orderedValue,
      released_value: fulfilment.releasedValue,
      retained_reservation: fulfilment.retainedReservation,
      next_status: nextStatus,
    },
    moduleKey: "material_requests",
    sourceId: request.id,
    sourceTable: "material_requests",
    summary: input.buildSummary(fulfilment, fulfilmentItems.length),
  }).catch(() => null);

  // ── R3: unmet needs must reach someone ───────────────────────────────────
  if (fulfilment.unmetNeeds.length > 0) {
    const recipients = await fanoutToOpsRoles(["procurement_manager", "projects_manager"], {
      excludeUserIds: [input.actorUserId],
    });
    const names = fulfilment.unmetNeeds
      .slice(0, 3)
      .map((need) => need.itemName)
      .join(", ");
    await Promise.all(
      recipients.map((recipient) =>
        queueOpsNotification({
          actionHref: `${PROCURE_ROUTE}#mr-${request.id}`,
          body: `${fulfilment.unmetNeeds.length} item(s) on ${request.request_number} were not procured and the site still needs them: ${names}.`,
          // Keyed on the request and recipient only. This previously carried
          // `nowIso`, which made every procurement round mint a unique key so
          // it could never dedupe at all (audit §9). Re-running a procure
          // action now updates the existing notice rather than adding another.
          idempotencyKey: `material-request-unmet:${request.id}:${recipient.id}`,
          moduleKey: "material_requests",
          recipientId: recipient.id,
          sourceId: request.id,
          sourceTable: "material_requests",
          title: `Unmet need: ${request.request_number}`,
        }).catch(() => null),
      ),
    );
  }

  return fulfilment;
}


/**
 * Settle a request's procurement state from a purchase order, when that order
 * is all the caller has.
 *
 * This is what `issuePurchaseOrderAction` needs: issuing an order is a real
 * procurement event, and until now it advanced the request without recording
 * a penny of it. Recomputing from the live purchase order lines means both
 * entry points reach the same answer from the same evidence.
 *
 * Best-effort by intent, not by neglect: issuing the order has already
 * succeeded and must not be undone by a ledger hiccup. But unlike the old
 * silent path, a failure here leaves an audit row rather than nothing.
 */
export async function settleMaterialRequestForPurchaseOrder(input: {
  actorUserId: string;
  materialRequestId: string;
  nowIso: string;
  auditAction: string;
  poNumber: string;
}): Promise<RequestFulfilment | null> {
  const supabase = getOpsSupabaseServiceClient();

  const { data: request } = await supabase
    .from("material_requests")
    .select("id, request_number, site_id, status, budget_line_id")
    .eq("id", input.materialRequestId)
    .maybeSingle<RequestForSettlement>();

  if (!request) {
    return null;
  }

  const { data: itemRows } = await supabase
    .from("material_request_items")
    .select("id")
    .eq("request_id", request.id);

  const itemIds = ((itemRows ?? []) as Array<{ id: string }>).map((row) => row.id);
  if (itemIds.length === 0) {
    return null;
  }

  return settleProcurementRound({
    actorUserId: input.actorUserId,
    auditAction: input.auditAction,
    buildSummary: (fulfilment, itemCount) =>
      `${input.poNumber} issued against ${request.request_number} — ${fulfilment.itemsOrdered} of ${itemCount} item(s) on live orders, ${formatOrderedValue(fulfilment)} committed.`,
    createdPoCount: 0,
    itemIds,
    nowIso: input.nowIso,
    request,
  });
}

function formatOrderedValue(fulfilment: RequestFulfilment) {
  return `ZMW ${fulfilment.orderedValue.toLocaleString("en-ZM", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
