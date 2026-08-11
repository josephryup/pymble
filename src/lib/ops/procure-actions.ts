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
  type RequestFulfilment,
  type RequestItemForFulfilment,
} from "@/lib/ops/procurement-fulfilment";
import {
  releaseSupersededCostStations,
  upsertProjectCostEntry,
} from "@/lib/ops/project-cost-entries";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import { formatZmw } from "@/lib/ops/ui";

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

const directPurchaseSchema = z.object({
  purchased_on: z.string().trim().min(1, "Enter the date of the purchase."),
  receipt_reference: z.string().trim().max(120).default(""),
  supplier_id: z.string().trim().default(""),
  // Named to match OpsSupplierPicker's own field, so the picker drops in
  // unmodified — a cash purchase is exactly the case it exists for.
  supplier_name_freeform: z.string().trim().max(160).default(""),
});

type RequestForSettlement = {
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
async function settleProcurementRound(input: {
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

  const nextStatus = fulfilment.isComplete
    ? "ordered"
    : fulfilment.isPartial
      ? "partially_ordered"
      : request.status;

  await supabase
    .from("material_requests")
    .update({
      status: nextStatus,
      ...(nextStatus === "ordered" ? { ordered_at: input.nowIso } : {}),
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

  await settleProcurementRound({
    actorUserId: profile.id,
    auditAction: "material_request.procured",
    buildSummary: (settled, itemCount) =>
      `Procured ${settled.itemsOrdered} of ${itemCount} item(s) on ${request.request_number}${
        settled.itemsDeclined > 0 ? `, ${settled.itemsDeclined} declined` : ""
      }`,
    createdPoCount: createdPoIds.length,
    itemIds: items.map((item) => item.id),
    nowIso,
    request,
  });

  revalidatePath(PROCURE_ROUTE);
  revalidatePath("/ops/rfq-po");
  revalidatePath("/ops/project-budgets");
  revalidatePath("/ops/finance");
  redirect(
    `${PROCURE_ROUTE}?updated=procured&pos=${createdPoIds.length}#mr-${request.id}`,
  );
}

/**
 * Record a purchase that has already happened — cash, mobile money, or a
 * walk-in account buy — against an approved material request.
 *
 * Decision D1. The sourced RFQ→PO path went six weeks and 24 cost-approved
 * requests without a single use, because a great deal of site material is
 * simply bought over the counter. That spend was real and none of it reached
 * Finance. This is the second door to the same room: the purchase record is
 * still a purchase order, so fulfilment, three-way match and every existing
 * report keep working; only `purchase_kind` differs.
 *
 * Three deliberate differences from the sourced path:
 *
 *   • The order is written `issued`, not `draft`. Issuing is the act of
 *     committing to a supplier, and here that already happened — leaving it
 *     draft would invite someone to "issue" a purchase made last Tuesday.
 *   • The price is a fact, not a proposal, so the amount paid is entered per
 *     line and overwrites the estimate. A receipt outranks an estimate.
 *   • Segregation of duties is recorded, not enforced. On the sourced path
 *     refusing the approver stops money being committed; here the money is
 *     already gone, so refusing would only lose the record. Recording what
 *     happened is not the same act as authorising it — so the breach is
 *     logged and Finance is told, which is the control that still works.
 *
 * Form shape: `purchased::<itemId>` = "on" for each line bought, and
 * `amount::<itemId>` = the actual total paid for that line.
 */
export async function recordDirectPurchaseAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canAttachMaterialRequestPricing(profile.role)) {
    procureError("Only Procurement and leadership can record a purchase.");
  }

  const requestId = field(formData, "request_id");
  if (!UUID.test(requestId)) {
    procureError("Select a material request.");
  }

  const parsed = directPurchaseSchema.safeParse({
    purchased_on: field(formData, "purchased_on"),
    receipt_reference: field(formData, "receipt_reference"),
    supplier_id: field(formData, "supplier_id"),
    supplier_name_freeform: field(formData, "supplier_name_freeform"),
  });

  if (!parsed.success) {
    procureError(parsed.error.issues[0]?.message ?? "Check the purchase details.");
  }

  if (!parsed.data.supplier_id && !parsed.data.supplier_name_freeform) {
    procureError("Name who you bought from, even if they are not a registered supplier.");
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
      "Only an approved request can have a purchase recorded against it. Refresh — its status may have changed.",
    );
  }

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
    procureError("This request has no line items.");
  }

  // Which lines were bought, and for how much. A blank or zero amount falls
  // back to the priced/estimated figure rather than booking the purchase at
  // nothing — a receipt whose total was not keyed is still a real purchase.
  const purchased: Array<{ item: ItemRow; amount: number }> = [];
  for (const item of items) {
    if (field(formData, `purchased::${item.id}`) === "") continue;

    const keyed = toNumber(field(formData, `amount::${item.id}`));
    const priced = toNumber(item.actual_total);
    const fallback = priced > 0 ? priced : toNumber(item.estimated_total);
    const amount = roundMoney(keyed > 0 ? keyed : fallback);

    if (amount <= 0) {
      procureError(`Enter what was paid for "${item.item_name}".`);
    }

    purchased.push({ amount, item });
  }

  if (purchased.length === 0) {
    procureError("Tick at least one line that was bought.");
  }

  // Idempotency, same rule as the sourced path (R2): a line already covered by
  // a live purchase record is not bought twice by a double submit.
  const { data: existingPoLines } = await supabase
    .from("purchase_order_items")
    .select(
      "material_request_item_id, purchase_order:purchase_orders!purchase_order_items_purchase_order_id_fkey(status)",
    )
    .in(
      "material_request_item_id",
      items.map((item) => item.id),
    );

  const alreadyCovered = new Set(
    (
      (existingPoLines ?? []) as unknown as Array<{
        material_request_item_id: string;
        purchase_order: { status: string } | { status: string }[] | null;
      }>
    )
      .filter((row) => {
        const po = Array.isArray(row.purchase_order)
          ? (row.purchase_order[0] ?? null)
          : row.purchase_order;
        return Boolean(po) && po?.status !== "cancelled" && po?.status !== "rejected";
      })
      .map((row) => row.material_request_item_id),
  );

  const toRecord = purchased.filter((entry) => !alreadyCovered.has(entry.item.id));

  if (toRecord.length === 0) {
    procureError("Every line you ticked already has a purchase recorded against it.");
  }

  const approvedValue = roundMoney(
    items.reduce((sum, item) => {
      const priced = toNumber(item.actual_total);
      return sum + (priced > 0 ? priced : toNumber(item.estimated_total));
    }, 0),
  );
  const purchaseValue = roundMoney(
    toRecord.reduce((sum, entry) => sum + entry.amount, 0),
  );

  // The approver, for the segregation-of-duties record. Same resolution as the
  // sourced path: the last decided step on the request's approval.
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
  const selfApproved = approvedByUserId !== null && approvedByUserId === profile.id;

  const purchasedAtIso = `${parsed.data.purchased_on}T12:00:00+02:00`;
  const nowIso = new Date().toISOString();

  const { data: purchaseOrder, error: poError } = await supabase
    .rpc("ops_insert_purchase_order_with_lines", {
      p_order: {
        material_request_id: request.id,
        site_id: request.site_id,
        supplier_id: parsed.data.supplier_id || null,
        title: `${request.request_number} — ${request.title}`.slice(0, 160),
        description: parsed.data.supplier_id
          ? `Direct purchase against ${request.request_number}.`
          : `Direct purchase against ${request.request_number} from ${parsed.data.supplier_name_freeform}.`,
        // Already bought: there is nothing left to issue.
        status: "issued",
        purchase_kind: "direct",
        receipt_reference: parsed.data.receipt_reference,
        scope: request.scope,
        total_amount: purchaseValue,
        created_by: profile.id,
        procured_by: profile.id,
        procured_at: nowIso,
        issued_at: purchasedAtIso,
        issued_by: profile.id,
        // The spend rests on the request's own approval, exactly as an
        // inherited sourced order does.
        approval_source: "inherited",
        inherited_from_approval_id: request.approval_request_id,
      },
      p_lines: toRecord.map((entry, index) => {
        const quantity = toNumber(entry.item.quantity);
        return {
          material_request_item_id: entry.item.id,
          line_number: index + 1,
          item_name: entry.item.item_name,
          specification: entry.item.specification ?? "",
          unit: entry.item.unit,
          quantity,
          unit_cost: roundMoney(quantity > 0 ? entry.amount / quantity : entry.amount),
          supplier_id: entry.item.supplier_id ?? (parsed.data.supplier_id || null),
          supplier_name_freeform:
            entry.item.supplier_name_freeform || parsed.data.supplier_name_freeform,
          cost_code_id: entry.item.cost_code_id,
        };
      }),
    })
    .single<{ id: string; po_number: string }>();

  if (poError || !purchaseOrder) {
    procureError(poError?.message ?? "Could not record the purchase.");
  }

  // The receipt is the truth about what this cost, so it replaces the estimate
  // — the same rule pricing already follows when a supplier quote lands.
  for (const entry of toRecord) {
    const quantity = toNumber(entry.item.quantity);
    await supabase
      .from("material_request_items")
      .update({
        actual_total: entry.amount,
        actual_unit_cost: roundMoney(quantity > 0 ? entry.amount / quantity : entry.amount),
        decided_at: nowIso,
        decided_by: profile.id,
        decision_reason: "",
        procurement_decision: "ordered",
      })
      .eq("id", entry.item.id);
  }

  await recordOpsAuditEvent({
    action: "purchase_order.direct_purchase_recorded",
    actorUserId: profile.id,
    entityId: purchaseOrder.id,
    entityType: "purchase_order",
    metadata: {
      approved_value: approvedValue,
      line_count: toRecord.length,
      po_number: purchaseOrder.po_number,
      purchase_value: purchaseValue,
      purchased_on: parsed.data.purchased_on,
      receipt_reference: parsed.data.receipt_reference,
      request_number: request.request_number,
      // Recorded rather than refused — see this action's header.
      self_approved: selfApproved,
      supplier: parsed.data.supplier_id || parsed.data.supplier_name_freeform,
    },
    moduleKey: "rfq_po",
    sourceId: purchaseOrder.id,
    sourceTable: "purchase_orders",
    summary: `Recorded direct purchase ${purchaseOrder.po_number} of ${formatZmw(purchaseValue)} against ${request.request_number}${
      selfApproved ? " — recorded by the same person who approved the request" : ""
    }`,
  }).catch(() => null);

  await settleProcurementRound({
    actorUserId: profile.id,
    auditAction: "material_request.direct_purchase_recorded",
    buildSummary: (settled, itemCount) =>
      `Recorded a direct purchase of ${settled.itemsOrdered} of ${itemCount} item(s) on ${request.request_number}`,
    createdPoCount: 1,
    itemIds: items.map((item) => item.id),
    nowIso,
    request,
  });

  // Two things Finance must not learn about by accident: spend above what was
  // approved, and a purchase recorded by its own approver.
  if (purchaseValue > approvedValue || selfApproved) {
    const overspend = roundMoney(purchaseValue - approvedValue);
    const recipients = await fanoutToOpsRoles(["finance_manager", "managing_director"], {
      excludeUserIds: [profile.id],
    });
    const reason =
      overspend > 0
        ? `It came to ${formatZmw(purchaseValue)} against ${formatZmw(approvedValue)} approved — ${formatZmw(overspend)} over.`
        : "It was recorded by the same person who approved the request.";

    await Promise.all(
      recipients.map((recipient) =>
        queueOpsNotification({
          actionHref: `${PROCURE_ROUTE}#mr-${request.id}`,
          body: `A direct purchase was recorded against ${request.request_number}. ${reason}`,
          idempotencyKey: `direct-purchase-review:${purchaseOrder.id}:${recipient.id}`,
          moduleKey: "rfq_po",
          recipientId: recipient.id,
          sourceId: purchaseOrder.id,
          sourceTable: "purchase_orders",
          title: `Direct purchase to review: ${purchaseOrder.po_number}`,
        }).catch(() => null),
      ),
    );
  }

  revalidatePath(PROCURE_ROUTE);
  revalidatePath("/ops/rfq-po");
  revalidatePath("/ops/project-budgets");
  revalidatePath("/ops/finance");
  redirect(`${PROCURE_ROUTE}?updated=direct_purchase#mr-${request.id}`);
}
