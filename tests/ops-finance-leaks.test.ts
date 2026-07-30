import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildOpsFinanceLeakReport,
  type LeakBudgetLineRow,
  type LeakBudgetRow,
  type LeakCostEntryRow,
  type LeakMaterialRequestRow,
  type LeakRequestItemRow,
  type LeakSiteRow,
} from "../src/lib/ops/finance-leaks";
import type { OpsMaterialRequestStatus } from "../src/lib/ops/types";

const SITE: LeakSiteRow = { id: "site-1", code: "0004", name: "Test Site" };

function request(
  overrides: Partial<LeakMaterialRequestRow> & { status?: OpsMaterialRequestStatus },
): LeakMaterialRequestRow {
  return {
    id: "mr-1",
    request_number: "MR-001",
    status: "approved",
    scope: "site",
    site_id: SITE.id,
    budget_line_id: "line-1",
    ...overrides,
  };
}

function item(overrides: Partial<LeakRequestItemRow>): LeakRequestItemRow {
  return { request_id: "mr-1", estimated_total: 1000, actual_total: 0, ...overrides };
}

function build(input: {
  requests?: LeakMaterialRequestRow[];
  items?: LeakRequestItemRow[];
  costEntries?: LeakCostEntryRow[];
  budgets?: LeakBudgetRow[];
  budgetLines?: LeakBudgetLineRow[];
  sites?: LeakSiteRow[];
}) {
  return buildOpsFinanceLeakReport({
    requests: input.requests ?? [],
    items: input.items ?? [],
    costEntries: input.costEntries ?? [],
    budgets: input.budgets ?? [],
    budgetLines: input.budgetLines ?? [],
    sites: input.sites ?? [SITE],
  });
}

function check(report: ReturnType<typeof build>, key: string) {
  const found = report.checks.find((entry) => entry.key === key);
  assert.ok(found, `check ${key} missing`);
  return found;
}

describe("buildOpsFinanceLeakReport", () => {
  it("reports a clean chain when everything reconciles", () => {
    const report = build({
      requests: [request({})],
      items: [item({})],
      costEntries: [
        {
          material_request_id: "mr-1",
          budget_line_id: "line-1",
          status: "committed",
          amount: 1000,
          site_id: SITE.id,
        },
      ],
      budgets: [{ id: "bud-1", site_id: SITE.id, status: "active" }],
      budgetLines: [{ budget_id: "bud-1", budgeted_amount: 5000 }],
    });

    assert.equal(report.clean, true);
    assert.equal(report.leakAmount, 0);
  });

  it("flags a live site request with no budget line, valued priced-over-estimated", () => {
    const report = build({
      requests: [request({ budget_line_id: null })],
      items: [item({ estimated_total: 1000, actual_total: 1200 })],
      budgets: [{ id: "bud-1", site_id: SITE.id, status: "active" }],
      budgetLines: [{ budget_id: "bud-1", budgeted_amount: 5000 }],
    });

    const found = check(report, "requests_without_budget_line");
    assert.equal(found.count, 1);
    assert.equal(found.amount, 1200);
    assert.deepEqual(found.samples, ["MR-001"]);
    assert.equal(report.clean, false);
  });

  it("ignores draft, rejected, and cancelled requests entirely", () => {
    const report = build({
      requests: [
        request({ id: "mr-d", status: "draft", budget_line_id: null }),
        request({ id: "mr-r", status: "rejected", budget_line_id: null }),
        request({ id: "mr-c", status: "cancelled", budget_line_id: null }),
      ],
      items: [item({ request_id: "mr-d" }), item({ request_id: "mr-r" })],
    });

    assert.equal(check(report, "requests_without_budget_line").count, 0);
  });

  it("ignores general/IT scope for the budget-line check (no site to budget against)", () => {
    const report = build({
      requests: [request({ scope: "it", site_id: null, budget_line_id: null })],
      items: [item({})],
    });

    assert.equal(check(report, "requests_without_budget_line").count, 0);
  });

  it("flags delivered/closed requests with no cost entry (the D6 shape)", () => {
    const report = build({
      requests: [
        request({ id: "mr-closed", status: "closed", budget_line_id: null }),
        request({ id: "mr-open", status: "approved", budget_line_id: null }),
      ],
      items: [
        item({ request_id: "mr-closed", estimated_total: 3000 }),
        item({ request_id: "mr-open" }),
      ],
    });

    const found = check(report, "arrived_without_cost_entry");
    assert.equal(found.count, 1);
    assert.equal(found.amount, 3000);
    assert.deepEqual(found.samples, ["MR-001"]);
  });

  it("does not flag a delivered request whose cost entry exists", () => {
    const report = build({
      requests: [request({ status: "closed" })],
      items: [item({})],
      costEntries: [
        {
          material_request_id: "mr-1",
          budget_line_id: "line-1",
          status: "posted",
          amount: 1000,
          site_id: SITE.id,
        },
      ],
      budgets: [{ id: "bud-1", site_id: SITE.id, status: "active" }],
      budgetLines: [{ budget_id: "bud-1", budgeted_amount: 5000 }],
    });

    assert.equal(check(report, "arrived_without_cost_entry").count, 0);
  });

  it("flags cost entries with no budget line (the orphaned-transport shape)", () => {
    const report = build({
      costEntries: [
        {
          material_request_id: null,
          budget_line_id: null,
          status: "committed",
          amount: 770,
          site_id: SITE.id,
        },
        {
          material_request_id: null,
          budget_line_id: null,
          status: "posted",
          amount: 2000,
          site_id: SITE.id,
        },
        {
          material_request_id: null,
          budget_line_id: null,
          status: "cancelled",
          amount: 999,
          site_id: SITE.id,
        },
      ],
      budgets: [{ id: "bud-1", site_id: SITE.id, status: "active" }],
      budgetLines: [{ budget_id: "bud-1", budgeted_amount: 5000 }],
    });

    const found = check(report, "cost_entries_without_budget_line");
    assert.equal(found.count, 2);
    assert.equal(found.amount, 2770);
  });

  it("flags a site spending with no funded open budget", () => {
    const report = build({
      requests: [request({})],
      items: [item({ estimated_total: 151531 })],
      // Open budget exists but every line is zero — unfunded (site 0003 shape).
      budgets: [{ id: "bud-1", site_id: SITE.id, status: "draft" }],
      budgetLines: [{ budget_id: "bud-1", budgeted_amount: 0 }],
    });

    const found = check(report, "spend_without_funded_budget");
    assert.equal(found.count, 1);
    assert.equal(found.amount, 151531);
    assert.deepEqual(found.samples, ["0004 — Test Site"]);
  });

  it("does not double-count a request's value with its own cost entry", () => {
    const report = build({
      requests: [request({ budget_line_id: null })],
      items: [item({ estimated_total: 1000 })],
      costEntries: [
        {
          material_request_id: "mr-1",
          budget_line_id: null,
          status: "committed",
          amount: 1000,
          site_id: SITE.id,
        },
      ],
    });

    // Site spend counted once (from the request), not 2000.
    assert.equal(check(report, "spend_without_funded_budget").amount, 1000);
  });

  it("flags a site holding two open budgets (the D7 ambiguity)", () => {
    const report = build({
      budgets: [
        { id: "bud-1", site_id: SITE.id, status: "draft" },
        { id: "bud-2", site_id: SITE.id, status: "draft" },
      ],
      budgetLines: [{ budget_id: "bud-2", budgeted_amount: 904672 }],
    });

    const found = check(report, "multiple_open_budgets");
    assert.equal(found.count, 1);
    assert.deepEqual(found.samples, ["0004 — Test Site"]);
    assert.equal(found.amount, null);
  });

  it("takes the larger of the overlapping request-side amounts in the total", () => {
    // One closed request missing both its budget line AND its cost entry:
    // it appears in checks 1 and 2, but the total must count it once.
    const report = build({
      requests: [request({ status: "closed", budget_line_id: null })],
      items: [item({ estimated_total: 3000 })],
      budgets: [{ id: "bud-1", site_id: SITE.id, status: "active" }],
      budgetLines: [{ budget_id: "bud-1", budgeted_amount: 9000 }],
    });

    assert.equal(check(report, "requests_without_budget_line").amount, 3000);
    assert.equal(check(report, "arrived_without_cost_entry").amount, 3000);
    assert.equal(report.leakAmount, 3000);
  });
});
