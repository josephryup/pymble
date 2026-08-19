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

// ── Audit F5 ───────────────────────────────────────────────────────────────
// The generated budget line used to carry `cost_code` (free text) and nothing
// else. Every control — the availability bands, the per-leaf roll-up, every
// variance report — reads `cost_code_id`, so a line without one is money
// nothing can see. Zero budget lines in the database had ever come from a
// schedule, so the defect had never been observed in the wild.
describe("aggregateBoqBudgetTotals — cost code inheritance (F5)", () => {
  it("gives each category the leaf its schedule lines charge", () => {
    const { costCodeByCategory } = aggregateBoqBudgetTotals([
      line({ category: "concrete_works", cost_code_id: "cc-concrete" }),
      line({ category: "roofing", cost_code_id: "cc-roof" }),
    ]);

    assert.equal(costCodeByCategory.get("concrete_works"), "cc-concrete");
    assert.equal(costCodeByCategory.get("roofing"), "cc-roof");
  });

  it("picks the leaf most of the category's lines charge", () => {
    // A category spanning several leaves has to land somewhere; the majority
    // is the only defensible pick, and the roll-up still sees the rest through
    // the items themselves.
    const { costCodeByCategory } = aggregateBoqBudgetTotals([
      line({ category: "concrete_works", cost_code_id: "cc-a" }),
      line({ category: "concrete_works", cost_code_id: "cc-a" }),
      line({ category: "concrete_works", cost_code_id: "cc-b" }),
    ]);

    assert.equal(costCodeByCategory.get("concrete_works"), "cc-a");
  });

  it("reports nothing for a category whose lines carry no code", () => {
    // Better an absent entry the caller can fall back from than a wrong one.
    const { costCodeByCategory } = aggregateBoqBudgetTotals([
      line({ category: "concrete_works", cost_code_id: null }),
      line({ category: "roofing" }),
    ]);

    assert.equal(costCodeByCategory.has("concrete_works"), false);
    assert.equal(costCodeByCategory.has("roofing"), false);
  });

  it("still sums the money when no line carries a code", () => {
    // Cost-code inheritance must not disturb the arithmetic it rides along on.
    const { totalsByCategory, transportTotal } = aggregateBoqBudgetTotals([
      line({ category: "roofing", budgeted_total: 100, estimated_transport_cost: 10 }),
      line({ category: "roofing", budgeted_total: 250, estimated_transport_cost: 5 }),
    ]);

    assert.equal(totalsByCategory.get("roofing"), 350);
    assert.equal(transportTotal, 15);
  });
});
