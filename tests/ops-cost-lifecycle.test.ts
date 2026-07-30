import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  statusForLifecycleState,
  type OpsCostLifecycleState,
} from "../src/lib/ops/project-cost-entries";
import {
  computeBudgetAvailability,
  EMPTY_BUDGET_POSITION,
} from "../src/lib/ops/budget-availability";

describe("statusForLifecycleState", () => {
  it("maps every station exactly as the database check constraint does", () => {
    // This mapping mirrors project_cost_entries_lifecycle_status_agree. If the
    // two ever drift, inserts fail loudly — but this test catches it first.
    const expected: Record<OpsCostLifecycleState, string> = {
      reserved: "committed",
      committed: "committed",
      accrued: "committed",
      actual: "posted",
      paid: "posted",
      released: "cancelled",
    };

    for (const [state, status] of Object.entries(expected)) {
      assert.equal(
        statusForLifecycleState(state as OpsCostLifecycleState),
        status,
        `station ${state} must summarise as ${status}`,
      );
    }
  });

  it("covers every enum member — a new station must be mapped deliberately", () => {
    const states: OpsCostLifecycleState[] = [
      "reserved",
      "committed",
      "accrued",
      "actual",
      "paid",
      "released",
    ];
    for (const state of states) {
      assert.ok(
        ["committed", "posted", "cancelled"].includes(statusForLifecycleState(state)),
        `${state} produced an unknown status`,
      );
    }
  });
});

describe("relief keeps exposure honest", () => {
  // These model what releaseSupersededCostStations achieves, as arithmetic:
  // the whole reason relief exists is that without it the same money would be
  // counted twice against one budget.

  it("counts a partial procurement once, not twice", () => {
    // Approved K287,211 (reserved). 60% procured → K180,000 committed, and the
    // reservation is relieved to the un-procured remainder.
    const withRelief = computeBudgetAvailability({
      ...EMPTY_BUDGET_POSITION,
      budgeted: 500_000,
      reserved: 107_211,
      committed: 180_000,
    });

    assert.equal(withRelief.consumed, 287_211);
    assert.equal(withRelief.available, 212_789);
  });

  it("shows what NOT relieving would cost — the double-count", () => {
    // The same moment with the reservation left standing at its full value.
    const withoutRelief = computeBudgetAvailability({
      ...EMPTY_BUDGET_POSITION,
      budgeted: 500_000,
      reserved: 287_211,
      committed: 180_000,
    });

    assert.equal(withoutRelief.consumed, 467_211);
    // K180,000 of phantom consumption — the budget would look nearly spent.
    assert.equal(withoutRelief.consumed - 287_211, 180_000);
  });

  it("returns funds to the budget when everything is released", () => {
    const cancelled = computeBudgetAvailability({
      ...EMPTY_BUDGET_POSITION,
      budgeted: 500_000,
      // Every station released, so none of them appear here at all.
    });

    assert.equal(cancelled.consumed, 0);
    assert.equal(cancelled.available, 500_000);
    assert.equal(cancelled.usedPercent, 0);
  });

  it("treats a fully-delivered request as actual only, never actual plus reserved", () => {
    const delivered = computeBudgetAvailability({
      ...EMPTY_BUDGET_POSITION,
      budgeted: 300_000,
      actual: 287_211,
    });

    assert.equal(delivered.consumed, 287_211);
    assert.equal(delivered.usedPercent, 95.7);
  });
});
