import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  decideApprovalInheritance,
  deriveRequestFulfilment,
  type InheritanceCheckInput,
  type PurchaseOrderLineForFulfilment,
  type RequestItemForFulfilment,
} from "../src/lib/ops/procurement-fulfilment";

function item(
  overrides: Partial<RequestItemForFulfilment> & { id: string },
): RequestItemForFulfilment {
  return {
    itemName: overrides.id,
    quantity: 10,
    approvedValue: 1_000,
    decision: "pending",
    declineCount: 0,
    ...overrides,
  };
}

function poLine(
  materialRequestItemId: string,
  quantity: number,
  unitRate: number,
  isLive = true,
): PurchaseOrderLineForFulfilment {
  return { materialRequestItemId, quantity, unitRate, isLive };
}

describe("deriveRequestFulfilment", () => {
  it("derives ordered and outstanding quantity from PO lines, not stored mirrors", () => {
    // 8 t ordered against 12 t requested — partial by QUANTITY, which a
    // per-item tick box could not express.
    const result = deriveRequestFulfilment(
      [item({ id: "rebar", quantity: 12, approvedValue: 120_000, decision: "ordered" })],
      [poLine("rebar", 8, 10_000)],
    );

    const line = result.items[0];
    assert.equal(line.orderedQuantity, 8);
    assert.equal(line.outstandingQuantity, 4);
    assert.equal(line.orderedValue, 80_000);
    assert.equal(line.isFullyOrdered, false);
  });

  it("sums several PO lines for one item (a second procurement round)", () => {
    const result = deriveRequestFulfilment(
      [item({ id: "rebar", quantity: 12, decision: "ordered" })],
      [poLine("rebar", 8, 10_000), poLine("rebar", 4, 10_500)],
    );

    assert.equal(result.items[0].orderedQuantity, 12);
    assert.equal(result.items[0].orderedValue, 122_000);
    assert.equal(result.items[0].isFullyOrdered, true);
  });

  it("ignores cancelled purchase orders entirely", () => {
    const result = deriveRequestFulfilment(
      [item({ id: "rebar", quantity: 12, decision: "ordered" })],
      [poLine("rebar", 8, 10_000, false)],
    );

    assert.equal(result.items[0].orderedQuantity, 0);
    assert.equal(result.orderedValue, 0);
  });

  it("computes the amount to retain, commit and release on a partial round", () => {
    // The business requirement, exactly: approved K287,211 total; some items
    // ordered, one declined, one deferred.
    const result = deriveRequestFulfilment(
      [
        item({ id: "a", approvedValue: 180_000, decision: "ordered" }),
        item({ id: "b", approvedValue: 60_000, decision: "declined" }),
        item({ id: "c", approvedValue: 47_211, decision: "deferred" }),
      ],
      [poLine("a", 10, 18_000)],
    );

    assert.equal(result.requestedValue, 287_211);
    assert.equal(result.orderedValue, 180_000);
    // Declined money goes back to the budget.
    assert.equal(result.releasedValue, 60_000);
    // Deferred money stays reserved for round two.
    assert.equal(result.retainedReservation, 47_211);
    // And the three must account for the whole approved value.
    assert.equal(
      result.orderedValue + result.releasedValue + result.retainedReservation,
      287_211,
    );
  });

  it("marks a request partial until every item is ordered or declined", () => {
    const partial = deriveRequestFulfilment(
      [
        item({ id: "a", decision: "ordered" }),
        item({ id: "b", decision: "deferred" }),
      ],
      [poLine("a", 10, 100)],
    );
    assert.equal(partial.isPartial, true);
    assert.equal(partial.isComplete, false);

    // A deferred item resolved in round two completes the request.
    const complete = deriveRequestFulfilment(
      [
        item({ id: "a", decision: "ordered" }),
        item({ id: "b", decision: "declined" }),
      ],
      [poLine("a", 10, 100)],
    );
    assert.equal(complete.isComplete, true);
    assert.equal(complete.isPartial, false);
  });

  it("surfaces declined and deferred items as unmet site needs", () => {
    const result = deriveRequestFulfilment(
      [
        item({ id: "a", decision: "ordered" }),
        item({ id: "b", quantity: 5, decision: "declined" }),
      ],
      [poLine("a", 10, 100)],
    );

    assert.equal(result.unmetNeeds.length, 1);
    assert.equal(result.unmetNeeds[0].itemId, "b");
    assert.equal(result.unmetNeeds[0].outstandingQuantity, 5);
  });

  it("does not call a declined item unmet once it was fully supplied anyway", () => {
    const result = deriveRequestFulfilment(
      [item({ id: "a", quantity: 10, decision: "declined" })],
      [poLine("a", 10, 100)],
    );

    assert.equal(result.items[0].isUnmetNeed, false);
  });

  it("flags chronic under-supply after two declines", () => {
    const result = deriveRequestFulfilment(
      [
        item({ id: "a", decision: "deferred", declineCount: 1 }),
        item({ id: "b", decision: "deferred", declineCount: 2 }),
      ],
      [],
    );

    assert.equal(result.items[0].isChronicallyUnsupplied, false);
    assert.equal(result.items[1].isChronicallyUnsupplied, true);
  });

  it("handles an empty request without claiming it is complete", () => {
    const result = deriveRequestFulfilment([], []);
    assert.equal(result.isComplete, false);
    assert.equal(result.isPartial, false);
    assert.equal(result.requestedValue, 0);
  });
});

function inheritanceInput(
  overrides: Partial<InheritanceCheckInput> = {},
): InheritanceCheckInput {
  return {
    requestStatus: "approved",
    approvedValue: 287_211,
    alreadyOrderedValue: 0,
    proposedValue: 180_000,
    allLinesTraceToApprovedItems: true,
    supplierId: "sup-1",
    approvedSupplierId: "sup-1",
    maxUnitPriceIncreasePercent: 0,
    unitPriceTolerancePercent: 5,
    procuringUserId: "user-procurement",
    approvedByUserId: "user-finance",
    ...overrides,
  };
}

describe("decideApprovalInheritance", () => {
  it("inherits when the PO is within everything already approved", () => {
    const decision = decideApprovalInheritance(inheritanceInput());

    assert.equal(decision.approvalSource, "inherited");
    assert.deepEqual(decision.reasons, []);
    assert.equal(decision.deltaValue, 0);
  });

  it("requires a delta approval for the variance only, not the whole PO", () => {
    const decision = decideApprovalInheritance(
      inheritanceInput({ approvedValue: 287_211, proposedValue: 312_000 }),
    );

    assert.equal(decision.approvalSource, "delta");
    assert.equal(decision.deltaValue, 24_789);
    assert.match(decision.reasons[0], /above the approved/);
  });

  it("counts POs already issued against the request toward the ceiling", () => {
    // K180,000 already ordered; a second PO of K150,000 breaches K287,211
    // even though neither PO alone would.
    const decision = decideApprovalInheritance(
      inheritanceInput({ alreadyOrderedValue: 180_000, proposedValue: 150_000 }),
    );

    assert.equal(decision.approvalSource, "delta");
    assert.equal(decision.deltaValue, 42_789);
  });

  it("voids inheritance when the supplier changed, even at an identical price", () => {
    // The classic abuse: same money, different (possibly related-party) payee.
    const decision = decideApprovalInheritance(
      inheritanceInput({ supplierId: "sup-other" }),
    );

    assert.equal(decision.approvalSource, "delta");
    assert.equal(decision.deltaValue, 0);
    assert.match(decision.reasons[0], /supplier differs/);
  });

  it("voids inheritance when a unit price exceeds tolerance", () => {
    const within = decideApprovalInheritance(
      inheritanceInput({ maxUnitPriceIncreasePercent: 4.9 }),
    );
    assert.equal(within.approvalSource, "inherited");

    const beyond = decideApprovalInheritance(
      inheritanceInput({ maxUnitPriceIncreasePercent: 7.5 }),
    );
    assert.equal(beyond.approvalSource, "delta");
    assert.match(beyond.reasons[0], /7.5% above the approved price/);
  });

  it("voids inheritance when a line does not trace to an approved item", () => {
    const decision = decideApprovalInheritance(
      inheritanceInput({ allLinesTraceToApprovedItems: false }),
    );

    assert.equal(decision.approvalSource, "delta");
    assert.match(decision.reasons[0], /do not trace back/);
  });

  it("allows inheritance from a partially_ordered request (round two)", () => {
    const decision = decideApprovalInheritance(
      inheritanceInput({ requestStatus: "partially_ordered", alreadyOrderedValue: 100_000, proposedValue: 80_000 }),
    );

    assert.equal(decision.approvalSource, "inherited");
  });

  it("refuses a request that was never approved", () => {
    const decision = decideApprovalInheritance(
      inheritanceInput({ requestStatus: "pricing_pending" }),
    );

    assert.equal(decision.approvalSource, "delta");
    assert.match(decision.reasons[0], /not in an approved state/);
  });

  it("reports a segregation-of-duties breach separately from the value decision", () => {
    const decision = decideApprovalInheritance(
      inheritanceInput({ procuringUserId: "user-finance" }),
    );

    // The value is fine — so it would inherit — but the same person cannot
    // both approve and procure. The caller must refuse, not downgrade.
    assert.equal(decision.approvalSource, "inherited");
    assert.equal(decision.segregationOfDutiesBreach, true);
  });

  it("does not report a breach when nobody is recorded as approver", () => {
    const decision = decideApprovalInheritance(
      inheritanceInput({ approvedByUserId: null }),
    );

    assert.equal(decision.segregationOfDutiesBreach, false);
  });
});
