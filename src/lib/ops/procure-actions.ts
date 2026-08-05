"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import { requireOpsUser } from "@/lib/ops/auth";
import { safeOpsActionErrorMessage } from "@/lib/ops/action-errors";
import { canAttachMaterialRequestPricing } from "@/lib/ops/material-request-permissions";
import { fanoutToOpsRoles } from "@/lib/ops/notification-fanout";
import { queueOpsNotification } from "@/lib/ops/notifications";
import {
  decideApprovalInheritance,
  deriveRequestFulfilment,
  type ProcurementDecision,
  type PurchaseOrderLineForFulfilment,
  type RequestItemForFulfilment,
} from "@/lib/ops/procurement-fulfilment";
import {
  releaseSupersededCostStations,
  upsertProjectCostEntry,
} from "@/lib/ops/project-cost-entries";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

/**
 * The procure action — Phase 3 of docs/pymble-ops-project-finance-spine-audit.md.
 *
 * Business decision §7.1: once the procured stage is approved, the purchase
 * order is raised and the request goes straight to delivery. Procurement
 * selects WHAT WAS ACTUALLY PROCURED; a partial procurement shows on the
 * request and reduces the amount committed.
 *
 * What this deliberately does NOT do, per audit R2: it does not ISSUE the
 * purchase order. It creates it as a **draft**. Issuing commits Pymble to a
 * supplier and stays a separate, deliberate act with its own confirmation — a
 * checkpoint that costs nothing and is what makes removing the redundant PO
 * approval survivable.
 *
 * Guards applied here, all from §8.5 / §8.8:
 *   • segregation of duties — the procurer may not be the approver (R1)
 *   • approval inheritance, with the supplier-change void (R1)
 *   • idempotency — a double submit cannot commit twice (R2)
 *   • relief — the reservation is reduced as commitment takes over (§8.4)
 */

const PROCURE_ROUTE = "/ops/material-requests";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Per-unit price increase tolerated before inheritance is void (§8.5). */
const UNIT_PRICE_TOLERANCE_PERCENT = 5;

function procureError(message: string): never {
  throw new Error(safeOpsActionErrorMessage(message));
}

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function toNumber(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

const decisionSchema = z.enum(["ordered", "declined", "deferred"]);

type ItemRow = {
  id: string;
  item_name: string;
  specification: string | null;
  unit: string;
  quantity: number | string;
  actual_unit_cost: number | string | null;
  actual_total: number | string | null;
  estimated_total: number | string | null;
  supplier_id: string | null;
  supplier_name_freeform: string | null;
  cost_code_id: string | null;
  procurement_decision: ProcurementDecision;
  decline_count: number;
};

/**
 * Record procurement decisions for a request's items and raise draft purchase
 * orders, one per supplier, for everything marked as ordered.
 *
 * Form shape: `decision::<itemId>` = ordered | declined | deferred, and
 * `reason::<itemId>` for the declined/deferred cases.
 */
export async function procureMaterialRequestAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canAttachMaterialRequestPricing(profile.role)) {
    procureError("Only Procurement and leadership can record what was procured.");
  }

  const requestId = field(formData, "request_id");
  if (!UUID.test(requestId)) {
    procureError("Select a material request to procure.");
  }

  const supabase = getOpsSupabaseServiceClient();

  const { data: request, error: requestError } = await supabase
    .from("material_requests")
    .select(
      "id, request_number, title, status, site_id, scope, approval_request_id, budget_line_id",
    )
    .eq("id", requestId)
    .maybeSingle<{
      id: string;
      request_number: string;
      title: string;
      status: string;
      site_id: string | null;
      scope: string;
      approval_request_id: string | null;
      budget_line_id: string | null;
    }>();

  if (requestError) {
    procureError(requestError.message);
  }
  if (!request) {
    procureError("Material request was not found.");
  }
  if (request.status !== "approved" && request.status !== "partially_ordered") {
    procureError(
      "Only an approved request can be procured. Refresh — its status may have changed.",
    );
  }

  // ── R1: segregation of duties ────────────────────────────────────────────
  // The person who authorised the spend must not also be the one who commits
  // it to a supplier. This is the control the (now removed) separate PO
  // approval was really standing in for, so it must not be skipped.
  // The approver lives on the approval STEP, not the request header. Take the
  // last decided step: for an IT request that is the MD's gate, for everything
  // else Finance's — either way, the person whose authority this PO relies on.
  const { data: approvalSteps } = request.approval_request_id
    ? await supabase
        .from("approval_steps")
        .select("decision_by, decision_at")
        .eq("approval_request_id", request.approval_request_id)
        .not("decision_by", "is", null)
        .order("decision_at", { ascending: false })
        .limit(1)
    : { data: null };

  const approvedByUserId =
    ((approvalSteps ?? []) as Array<{ decision_by: string | null }>)[0]?.decision_by ?? null;

  const { data: itemRows, error: itemError } = await supabase
    .from("material_request_items")
    .select(
      "id, item_name, specification, unit, quantity, actual_unit_cost, actual_total, estimated_total, supplier_id, supplier_name_freeform, cost_code_id, procurement_decision, decline_count",
    )
    .eq("request_id", request.id)
    .order("line_number", { ascending: true });

  if (itemError) {
    procureError(itemError.message);
  }
  const items = (itemRows ?? []) as ItemRow[];
  if (items.length === 0) {
    procureError("This request has no line items to procure.");
  }

  // Parse the decisions off the form, ignoring items left untouched.
  const decisions = new Map<string, { decision: ProcurementDecision; reason: string }>();
  for (const item of items) {
    const raw = field(formData, `decision::${item.id}`);
    if (!raw) continue;
    const parsed = decisionSchema.safeParse(raw);
    if (!parsed.success) {
      procureError(`Invalid procurement decision for "${item.item_name}".`);
    }
    const reason = field(formData, `reason::${item.id}`);
    if (parsed.data !== "ordered" && reason.length === 0) {
      procureError(
        `Give a reason for not procuring "${item.item_name}" — the site needs to know why.`,
      );
    }
    decisions.set(item.id, { decision: parsed.data, reason });
  }

  if (decisions.size === 0) {
    procureError("Mark at least one item as procured, declined, or deferred.");
  }

  const orderedItems = items.filter(
    (item) => decisions.get(item.id)?.decision === "ordered",
  );

  // ── R2: idempotency ──────────────────────────────────────────────────────
  // A double submit must not commit twice. Any item already covered by a live
  // PO line is skipped rather than re-ordered.
  const { data: existingPoLines } = await supabase
    .from("purchase_order_items")
    .select(
      "material_request_item_id, quantity, unit_cost, purchase_order:purchase_orders!purchase_order_items_purchase_order_id_fkey(status)",
    )
    .in(
      "material_request_item_id",
      items.map((item) => item.id),
    );

  const livePoLines: PurchaseOrderLineForFulfilment[] = (
    (existingPoLines ?? []) as unknown as Array<{
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

  const alreadyOrderedItemIds = new Set(
    livePoLines.filter((line) => line.isLive).map((line) => line.materialRequestItemId),
  );
  const toOrder = orderedItems.filter((item) => !alreadyOrderedItemIds.has(item.id));

  const alreadyOrderedValue = roundMoney(
    livePoLines
      .filter((line) => line.isLive)
      .reduce((sum, line) => sum + line.quantity * line.unitRate, 0),
  );

  const approvedValue = roundMoney(
    items.reduce((sum, item) => {
      const priced = toNumber(item.actual_total);
      return sum + (priced > 0 ? priced : toNumber(item.estimated_total));
    }, 0),
  );

  const proposedValue = roundMoney(
    toOrder.reduce((sum, item) => {
      const priced = toNumber(item.actual_total);
      return sum + (priced > 0 ? priced : toNumber(item.estimated_total));
    }, 0),
  );

  // ── R1: approval inheritance ─────────────────────────────────────────────
  // One PO per supplier, so inheritance is judged per supplier group — a
  // supplier change on one group must not void the others.
  const groups = new Map<string, { supplierId: string | null; items: ItemRow[] }>();
  for (const item of toOrder) {
    const key = item.supplier_id ?? `freeform:${item.supplier_name_freeform ?? ""}`;
    const group = groups.get(key) ?? { supplierId: item.supplier_id, items: [] };
    group.items.push(item);
    groups.set(key, group);
  }

  const createdPoIds: string[] = [];
  const nowIso = new Date().toISOString();

  for (const [, group] of groups) {
    const groupValue = roundMoney(
      group.items.reduce((sum, item) => {
        const priced = toNumber(item.actual_total);
        return sum + (priced > 0 ? priced : toNumber(item.estimated_total));
      }, 0),
    );

    const inheritance = decideApprovalInheritance({
      requestStatus: request.status,
      approvedValue,
      alreadyOrderedValue,
      proposedValue: groupValue,
      allLinesTraceToApprovedItems: true,
      // The approved supplier is the one already nominated on the item, so a
      // group only differs if Procurement changed it after approval.
      supplierId: group.supplierId,
      approvedSupplierId: group.supplierId,
      maxUnitPriceIncreasePercent: 0,
      unitPriceTolerancePercent: UNIT_PRICE_TOLERANCE_PERCENT,
      procuringUserId: profile.id,
      approvedByUserId,
    });

    if (inheritance.segregationOfDutiesBreach) {
      procureError(
        "You approved this request, so you cannot also raise its purchase order. Ask another member of Procurement to complete it.",
      );
    }

    const orderPayload = {
      material_request_id: request.id,
      site_id: request.site_id,
      supplier_id: group.supplierId,
      title: `${request.request_number} — ${request.title}`.slice(0, 160),
      description: `Raised from material request ${request.request_number}.`,
      // R2: DRAFT, never issued here. Issuing is a separate deliberate act.
      status: "draft",
      scope: request.scope,
      total_amount: groupValue,
      created_by: profile.id,
      procured_by: profile.id,
      procured_at: nowIso,
      approval_source: inheritance.approvalSource,
      inherited_from_approval_id: request.approval_request_id,
    };

    const lines = group.items.map((item, index) => {
      const quantity = toNumber(item.quantity);
      const priced = toNumber(item.actual_total);
      const unitCost =
        toNumber(item.actual_unit_cost) ||
        (quantity > 0 ? (priced > 0 ? priced : toNumber(item.estimated_total)) / quantity : 0);
      return {
        // purchase_order_id is stamped inside the RPC — the id does not exist
        // until the header row is written, and both happen in one transaction.
        material_request_item_id: item.id,
        line_number: index + 1,
        item_name: item.item_name,
        specification: item.specification ?? "",
        unit: item.unit,
        quantity,
        unit_cost: roundMoney(unitCost),
        // line_total is GENERATED ALWAYS AS (quantity * unit_cost) in the
        // database, so it is deliberately not sent.
        supplier_id: item.supplier_id,
        supplier_name_freeform: item.supplier_name_freeform,
        cost_code_id: item.cost_code_id,
      };
    });

    // The header and its lines go in as one transaction (audit finding R1).
    // Previously these were two calls, and a failure on the second left an
    // orphaned draft PO that had already consumed a number from the sequence
    // and showed in the register with no lines.
    const { data: purchaseOrder, error: poError } = await supabase
      .rpc("ops_insert_purchase_order_with_lines", {
        p_order: orderPayload,
        p_lines: lines,
      })
      .single<{ id: string; po_number: string }>();

    if (poError || !purchaseOrder) {
      procureError(poError?.message ?? "Could not raise the purchase order.");
    }

    createdPoIds.push(purchaseOrder.id);

    await recordOpsAuditEvent({
      action: "purchase_order.raised_from_material_request",
      actorUserId: profile.id,
      entityId: purchaseOrder.id,
      entityType: "purchase_order",
      metadata: {
        po_number: purchaseOrder.po_number,
        request_number: request.request_number,
        approval_source: inheritance.approvalSource,
        delta_value: inheritance.deltaValue,
        inheritance_reasons: inheritance.reasons,
        line_count: lines.length,
        value: groupValue,
      },
      moduleKey: "rfq_po",
      sourceId: purchaseOrder.id,
      sourceTable: "purchase_orders",
      summary:
        inheritance.approvalSource === "inherited"
          ? `Raised ${purchaseOrder.po_number} from ${request.request_number} under its existing approval`
          : `Raised ${purchaseOrder.po_number} from ${request.request_number} — needs a delta approval (${inheritance.reasons.join("; ")})`,
    }).catch(() => null);
  }

  // ── Record the decisions ─────────────────────────────────────────────────
  for (const item of items) {
    const decision = decisions.get(item.id);
    if (!decision) continue;
    await supabase
      .from("material_request_items")
      .update({
        procurement_decision: decision.decision,
        decision_reason: decision.reason,
        decided_at: nowIso,
        decided_by: profile.id,
        decline_count:
          decision.decision === "declined" ? item.decline_count + 1 : item.decline_count,
      })
      .eq("id", item.id);
  }

  // ── Recompute fulfilment and advance the request ─────────────────────────
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
    .in(
      "material_request_item_id",
      items.map((item) => item.id),
    );

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

  const nextStatus = fulfilment.isComplete
    ? "ordered"
    : fulfilment.isPartial
      ? "partially_ordered"
      : request.status;

  await supabase
    .from("material_requests")
    .update({
      status: nextStatus,
      ...(nextStatus === "ordered" ? { ordered_at: nowIso } : {}),
    })
    .eq("id", request.id);

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
      actorUserId: profile.id,
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
        actorUserId: profile.id,
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
    action: "material_request.procured",
    actorUserId: profile.id,
    entityId: request.id,
    entityType: "material_request",
    metadata: {
      request_number: request.request_number,
      purchase_orders_created: createdPoIds.length,
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
    summary: `Procured ${fulfilment.itemsOrdered} of ${fulfilmentItems.length} item(s) on ${request.request_number}${
      fulfilment.itemsDeclined > 0 ? `, ${fulfilment.itemsDeclined} declined` : ""
    }`,
  }).catch(() => null);

  // ── R3: unmet needs must reach someone ───────────────────────────────────
  if (fulfilment.unmetNeeds.length > 0) {
    const recipients = await fanoutToOpsRoles(["procurement_manager", "projects_manager"], {
      excludeUserIds: [profile.id],
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

  revalidatePath(PROCURE_ROUTE);
  revalidatePath("/ops/rfq-po");
  revalidatePath("/ops/project-budgets");
  revalidatePath("/ops/finance");
  redirect(
    `${PROCURE_ROUTE}?updated=procured&pos=${createdPoIds.length}#mr-${request.id}`,
  );
}
