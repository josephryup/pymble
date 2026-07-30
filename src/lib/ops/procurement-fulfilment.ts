/**
 * Partial procurement — derived quantities and the approval-inheritance guards.
 *
 * Phase 3 of docs/pymble-ops-project-finance-spine-audit.md (§8).
 *
 * Business decision §7.1: when the procured stage is approved, Procurement
 * selects what was actually procured; a partial procurement shows on the
 * request and reduces the amount committed.
 *
 * The design rule is store-the-decision, derive-the-numbers (§8.3). This module
 * is the "derive" half, and it is deliberately pure: every function takes plain
 * rows and returns plain results, so the arithmetic that decides how much money
 * is committed versus released is testable without a database. Nothing here
 * writes.
 */

export type ProcurementDecision = "pending" | "ordered" | "declined" | "deferred";

/** A request item as stored — note it holds no quantities about procurement. */
export type RequestItemForFulfilment = {
  id: string;
  itemName: string;
  quantity: number;
  /** Procurement's priced total when priced, else the engineer's estimate. */
  approvedValue: number;
  decision: ProcurementDecision;
  declineCount: number;
};

/** A purchase order line fulfilling a request item. The only source of truth. */
export type PurchaseOrderLineForFulfilment = {
  materialRequestItemId: string;
  quantity: number;
  unitRate: number;
  /** Cancelled purchase orders must not count as procurement. */
  isLive: boolean;
};

export type ItemFulfilment = {
  itemId: string;
  itemName: string;
  requestedQuantity: number;
  orderedQuantity: number;
  outstandingQuantity: number;
  approvedValue: number;
  orderedValue: number;
  decision: ProcurementDecision;
  /** True once every requested unit has a live PO line behind it. */
  isFullyOrdered: boolean;
  /** Declined or deferred while units remain — a real unmet site need. */
  isUnmetNeed: boolean;
  /** Two or more declines: a supply failure, not a decision (audit R3). */
  isChronicallyUnsupplied: boolean;
};

export type RequestFulfilment = {
  items: ItemFulfilment[];
  requestedValue: number;
  /** Value actually on purchase orders — the firm commitment. */
  orderedValue: number;
  /**
   * The reservation that must REMAIN after this round: approved value for
   * items still pending or deferred. This is "the amount to reduce" from the
   * business requirement, expressed positively.
   */
  retainedReservation: number;
  /** Value given back to the budget because items were declined. */
  releasedValue: number;
  itemsOrdered: number;
  itemsDeclined: number;
  itemsDeferred: number;
  itemsPending: number;
  /** Every item resolved (ordered or declined) — the request can go `ordered`. */
  isComplete: boolean;
  /** Some but not all resolved — the request is `partially_ordered`. */
  isPartial: boolean;
  unmetNeeds: ItemFulfilment[];
};

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function safeNumber(value: number) {
  return Number.isFinite(value) ? value : 0;
}

/**
 * Fold PO lines into per-item fulfilment, then into the request-level position.
 *
 * Ordered quantity and value come only from live PO lines. A cancelled PO
 * contributes nothing, which is what makes cancel-and-reissue safe (audit R2's
 * reversibility requirement) without any compensating bookkeeping.
 */
export function deriveRequestFulfilment(
  items: RequestItemForFulfilment[],
  poLines: PurchaseOrderLineForFulfilment[],
): RequestFulfilment {
  const orderedByItem = new Map<string, { quantity: number; value: number }>();
  for (const line of poLines) {
    if (!line.isLive) continue;
    const current = orderedByItem.get(line.materialRequestItemId) ?? {
      quantity: 0,
      value: 0,
    };
    current.quantity = roundMoney(current.quantity + safeNumber(line.quantity));
    current.value = roundMoney(
      current.value + safeNumber(line.quantity) * safeNumber(line.unitRate),
    );
    orderedByItem.set(line.materialRequestItemId, current);
  }

  const derived: ItemFulfilment[] = items.map((item) => {
    const ordered = orderedByItem.get(item.id) ?? { quantity: 0, value: 0 };
    const requestedQuantity = safeNumber(item.quantity);
    const orderedQuantity = ordered.quantity;
    // Floors at zero: over-ordering is a separate concern (the PO exceeding the
    // approved value is caught by the inheritance guards), not negative
    // outstanding demand.
    const outstandingQuantity = roundMoney(
      Math.max(requestedQuantity - orderedQuantity, 0),
    );

    return {
      itemId: item.id,
      itemName: item.itemName,
      requestedQuantity,
      orderedQuantity,
      outstandingQuantity,
      approvedValue: roundMoney(safeNumber(item.approvedValue)),
      orderedValue: ordered.value,
      decision: item.decision,
      isFullyOrdered: requestedQuantity > 0 && orderedQuantity >= requestedQuantity,
      isUnmetNeed:
        (item.decision === "declined" || item.decision === "deferred") &&
        outstandingQuantity > 0,
      isChronicallyUnsupplied: item.declineCount >= 2,
    };
  });

  let requestedValue = 0;
  let orderedValue = 0;
  let retainedReservation = 0;
  let releasedValue = 0;
  let itemsOrdered = 0;
  let itemsDeclined = 0;
  let itemsDeferred = 0;
  let itemsPending = 0;

  for (const item of derived) {
    requestedValue = roundMoney(requestedValue + item.approvedValue);
    orderedValue = roundMoney(orderedValue + item.orderedValue);

    switch (item.decision) {
      case "ordered":
        itemsOrdered += 1;
        break;
      case "declined":
        itemsDeclined += 1;
        // Declined means it will never be bought, so its share of the
        // reservation goes back to the budget.
        releasedValue = roundMoney(releasedValue + item.approvedValue);
        break;
      case "deferred":
        itemsDeferred += 1;
        // Still wanted — the reservation stays for a later round.
        retainedReservation = roundMoney(retainedReservation + item.approvedValue);
        break;
      default:
        itemsPending += 1;
        retainedReservation = roundMoney(retainedReservation + item.approvedValue);
        break;
    }
  }

  const total = derived.length;
  const resolved = itemsOrdered + itemsDeclined;

  return {
    items: derived,
    requestedValue,
    orderedValue,
    retainedReservation,
    releasedValue,
    itemsOrdered,
    itemsDeclined,
    itemsDeferred,
    itemsPending,
    isComplete: total > 0 && resolved === total,
    isPartial: total > 0 && resolved > 0 && resolved < total,
    unmetNeeds: derived.filter((item) => item.isUnmetNeed),
  };
}

// ---------------------------------------------------------------------------
// Approval inheritance (§8.5) — the guard rails that make deleting the
// redundant PO approval safe rather than merely convenient.
// ---------------------------------------------------------------------------

export type InheritanceCheckInput = {
  /** Must be 'approved' for inheritance to be possible at all. */
  requestStatus: string;
  /** Value Finance/MD actually authorised. */
  approvedValue: number;
  /** Total of POs already issued against this request. */
  alreadyOrderedValue: number;
  /** Total of the PO about to be issued. */
  proposedValue: number;
  /** Every proposed line must trace to an approved request item. */
  allLinesTraceToApprovedItems: boolean;
  /** Supplier on the proposed PO. */
  supplierId: string | null;
  /** Supplier whose price was priced and approved. */
  approvedSupplierId: string | null;
  /** Worst per-unit price increase across the proposed lines, as a percent. */
  maxUnitPriceIncreasePercent: number;
  /** Configurable, recommended 5%. */
  unitPriceTolerancePercent: number;
  /** The user running the procure action. */
  procuringUserId: string;
  /** The user who gave the final approval. */
  approvedByUserId: string | null;
};

export type InheritanceDecision = {
  /** 'inherited' needs no further approval; 'delta' needs a variance approval. */
  approvalSource: "inherited" | "delta";
  /** Why inheritance was refused, in approver-facing language. Empty if inherited. */
  reasons: string[];
  /** Value needing fresh authority — the variance only, never the whole PO. */
  deltaValue: number;
  /** Segregation of duties breach: the procurer is also the approver (audit R1). */
  segregationOfDutiesBreach: boolean;
};

/**
 * Decide whether a purchase order can stand on the material request's existing
 * approval, or needs a delta approval for the variance.
 *
 * The four value/traceability guards come straight from §8.5. The supplier
 * check is the one worth spelling out: price is what Finance approved, but
 * *who we pay* matters as much — a price-identical PO redirected to a
 * different, possibly related-party supplier passes every value test and is
 * the classic abuse. So a supplier change voids inheritance outright.
 *
 * Segregation of duties is reported separately rather than folded into
 * `approvalSource`, because it is not a question about the PO's value — it is a
 * question about who is allowed to press the button, and the caller must
 * refuse the action rather than downgrade it to a delta approval.
 */
export function decideApprovalInheritance(
  input: InheritanceCheckInput,
): InheritanceDecision {
  const reasons: string[] = [];

  if (input.requestStatus !== "approved" && input.requestStatus !== "partially_ordered") {
    reasons.push("The material request is not in an approved state.");
  }

  if (!input.allLinesTraceToApprovedItems) {
    reasons.push(
      "Some purchase order lines do not trace back to an approved request item.",
    );
  }

  if (
    input.approvedSupplierId &&
    input.supplierId &&
    input.supplierId !== input.approvedSupplierId
  ) {
    reasons.push(
      "The supplier differs from the one whose price was approved, so the approval does not cover it.",
    );
  }

  if (input.maxUnitPriceIncreasePercent > input.unitPriceTolerancePercent) {
    reasons.push(
      `A unit price is ${Math.round(input.maxUnitPriceIncreasePercent * 10) / 10}% above the approved price, beyond the ${input.unitPriceTolerancePercent}% tolerance.`,
    );
  }

  const cumulative = roundMoney(
    safeNumber(input.alreadyOrderedValue) + safeNumber(input.proposedValue),
  );
  const approved = roundMoney(safeNumber(input.approvedValue));
  const overspend = roundMoney(cumulative - approved);

  if (overspend > 0) {
    reasons.push(
      `This order would take the total ordered against the request to ${cumulative.toFixed(2)}, above the approved ${approved.toFixed(2)}.`,
    );
  }

  return {
    approvalSource: reasons.length === 0 ? "inherited" : "delta",
    reasons,
    // Only the variance ever needs fresh authority. When inheritance fails for
    // a non-value reason (supplier change, untraceable lines) there may be no
    // overspend at all, and the delta approval is then purely about the change.
    deltaValue: Math.max(overspend, 0),
    segregationOfDutiesBreach:
      input.approvedByUserId !== null &&
      input.approvedByUserId === input.procuringUserId,
  };
}
