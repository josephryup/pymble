import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { aggregateBoqBudgetTotals, type BoqLineForSync } from "../src/lib/ops/boq-budget-sync";

function line(overrides: Partial<BoqLineForSync>): BoqLineForSync {
  return {
    category: "concrete_works",
    budgeted_total: 1000,
    estimated_transport_cost: 0,
    ...overrides,
  };
}

describe("aggregateBoqBudgetTotals", () => {
  it("keeps two phases' distinct categories side by side (audit D14)", () => {
    // Phase 1 (earlier issued schedule) + Phase 2 (just issued). The Phase 1
    // category must survive the Phase 2 issue with its amount intact.
    const { totalsByCategory } = aggregateBoqBudgetTotals([
      line({ category: "substructure", budgeted_total: 500_000 }),
      line({ category: "roofing", budgeted_total: 320_000 }),
    ]);

    assert.equal(totalsByCategory.get("substructure"), 500_000);
    assert.equal(totalsByCategory.get("roofing"), 320_000);
    assert.equal(totalsByCategory.size, 2);
  });

  it("sums a category shared by two phases", () => {
    const { totalsByCategory } = aggregateBoqBudgetTotals([
      line({ category: "concrete_works", budgeted_total: 200_000 }),
      line({ category: "concrete_works", budgeted_total: 150_000 }),
    ]);

    assert.equal(totalsByCategory.get("concrete_works"), 350_000);
  });

  it("sums transport across every line of every phase", () => {
    const { transportTotal } = aggregateBoqBudgetTotals([
      line({ estimated_transport_cost: 1_500 }),
      line({ category: "roofing", estimated_transport_cost: 2_500 }),
    ]);

    assert.equal(transportTotal, 4_000);
  });

  it("defaults a blank category to general", () => {
    const { totalsByCategory } = aggregateBoqBudgetTotals([
      line({ category: "", budgeted_total: 700 }),
    ]);

    assert.equal(totalsByCategory.get("general"), 700);
  });

  it("treats malformed money as zero rather than poisoning the totals", () => {
    const { totalsByCategory, transportTotal } = aggregateBoqBudgetTotals([
      line({ budgeted_total: "not-a-number", estimated_transport_cost: "??" }),
      line({ budgeted_total: 250 }),
    ]);

    assert.equal(totalsByCategory.get("concrete_works"), 250);
    assert.equal(transportTotal, 0);
  });

  it("returns empty totals for an empty live set (all schedules retired)", () => {
    const { totalsByCategory, transportTotal } = aggregateBoqBudgetTotals([]);

    assert.equal(totalsByCategory.size, 0);
    assert.equal(transportTotal, 0);
  });
});
