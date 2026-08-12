import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  opsReportWindow,
  summariseMaterialRequestFunnel,
  summariseBudgetConsumption,
  summarisePayableRelease,
  summariseBorrowing,
  type OpsLoanRepaymentForPeriod,
  summarisePayrollPeriod,
  summariseUnplannedSpend,
  type OpsBudgetForConsumption,
  type OpsCostEntryForConsumption,
  type OpsEscalationForUnplanned,
  type OpsMaterialRequestForFunnel,
  type OpsOverheadPayableForUnplanned,
  type OpsPayableForRelease,
  type OpsPayrollRunForPeriod,
  type OpsRequestItemForUnplanned,
  type OpsSpendEntryForUnplanned,
} from "../src/lib/ops/finance-period-metrics";

/**
 * The material request funnel — what Finance approved against what was bought.
 *
 * Two of these figures are POSITIONS at the window's end and the rest are
 * FLOWS within it. Mixing the two time bases is the standard way a budget
 * report misleads, so the distinction is pinned here rather than left to the
 * reader of the query.
 */

const JULY = opsReportWindow("2026-07-01", "2026-07-31");

const request = (
  overrides: Partial<OpsMaterialRequestForFunnel> = {},
): OpsMaterialRequestForFunnel => ({
  cost_approved_at: null,
  delivered_at: null,
  id: crypto.randomUUID(),
  ordered_at: null,
  priced_at: null,
  status: "approved",
  value: 0,
  ...overrides,
});

describe("approved and procured are counted in their own period", () => {
  it("counts an approval in the month it was approved", () => {
    const funnel = summariseMaterialRequestFunnel(
      [request({ cost_approved_at: "2026-07-13T09:00:00Z", value: 133_250 })],
      JULY,
    );

    assert.equal(funnel.approved_value, 133_250);
    assert.equal(funnel.approved_count, 1);
  });

  it("ignores an approval from an earlier month", () => {
    const funnel = summariseMaterialRequestFunnel(
      [request({ cost_approved_at: "2026-06-29T09:00:00Z", value: 21_000 })],
      JULY,
    );

    assert.equal(funnel.approved_value, 0);
  });

  it("counts the purchase in the month it was bought, not approved", () => {
    // Approved in June, bought in July. Two different periods, deliberately.
    const funnel = summariseMaterialRequestFunnel(
      [
        request({
          cost_approved_at: "2026-06-29T09:00:00Z",
          ordered_at: "2026-07-04T09:00:00Z",
          value: 21_000,
        }),
      ],
      JULY,
    );

    assert.equal(funnel.approved_value, 0, "the approval belongs to June");
    assert.equal(funnel.procured_value, 21_000, "the purchase belongs to July");
  });
});

describe("approved-but-unbought is a position, not a flow", () => {
  it("includes money approved before the window and still unspent", () => {
    // The backlog metric exists for exactly this row. A window-scoped query
    // would report zero and hide it.
    const funnel = summariseMaterialRequestFunnel(
      [request({ cost_approved_at: "2026-06-29T09:00:00Z", value: 287_211 })],
      JULY,
    );

    assert.equal(funnel.approved_value, 0);
    assert.equal(funnel.approved_not_procured_value, 287_211);
    assert.equal(funnel.approved_not_procured_count, 1);
  });

  it("drops a request once something is bought against it", () => {
    const funnel = summariseMaterialRequestFunnel(
      [
        request({
          cost_approved_at: "2026-06-29T09:00:00Z",
          ordered_at: "2026-07-04T09:00:00Z",
          value: 21_000,
        }),
      ],
      JULY,
    );

    assert.equal(funnel.approved_not_procured_value, 0);
  });

  it("still counts it as unspent when the purchase came AFTER the window", () => {
    // At 31 July this money was authorised and unspent. That an August
    // purchase later cleared it does not change the July position.
    const funnel = summariseMaterialRequestFunnel(
      [
        request({
          cost_approved_at: "2026-07-10T09:00:00Z",
          ordered_at: "2026-08-04T09:00:00Z",
          value: 6_500,
        }),
      ],
      JULY,
    );

    assert.equal(funnel.approved_not_procured_value, 6_500);
  });

  it("excludes cancelled and rejected requests — that money is not owed", () => {
    const funnel = summariseMaterialRequestFunnel(
      [
        request({ cost_approved_at: "2026-07-02T09:00:00Z", status: "cancelled", value: 7_999 }),
        request({ cost_approved_at: "2026-07-02T09:00:00Z", status: "rejected", value: 4_563 }),
        request({ cost_approved_at: "2026-07-02T09:00:00Z", status: "approved", value: 1_900 }),
      ],
      JULY,
    );

    assert.equal(funnel.approved_not_procured_value, 1_900);
    assert.equal(funnel.approved_not_procured_count, 1);
  });
});

describe("coverage stops a zero being read as no activity", () => {
  it("reports 0% when nothing approved reached a purchase", () => {
    // The live position as of the audit: K319,103 approved, K0 procured.
    const funnel = summariseMaterialRequestFunnel(
      [
        request({ cost_approved_at: "2026-07-13T09:00:00Z", value: 287_211 }),
        request({ cost_approved_at: "2026-07-13T09:00:00Z", value: 21_000 }),
        request({ cost_approved_at: "2026-07-13T09:00:00Z", value: 10_892 }),
      ],
      JULY,
    );

    assert.equal(funnel.approved_value, 319_103);
    assert.equal(funnel.procured_value, 0);
    assert.equal(funnel.procured_coverage_percent, 0);
  });

  it("has no coverage figure when nothing was approved at all", () => {
    // Null, not zero: "nothing to measure" and "measured, got nothing" are
    // different answers and must not render alike.
    const funnel = summariseMaterialRequestFunnel([], JULY);

    assert.equal(funnel.approved_value, 0);
    assert.equal(funnel.procured_coverage_percent, null);
  });

  it("reports partial coverage to one decimal", () => {
    const funnel = summariseMaterialRequestFunnel(
      [
        request({ cost_approved_at: "2026-07-01T09:00:00Z", value: 30_000 }),
        request({
          cost_approved_at: "2026-07-01T09:00:00Z",
          ordered_at: "2026-07-20T09:00:00Z",
          value: 10_000,
        }),
      ],
      JULY,
    );

    assert.equal(funnel.approved_value, 40_000);
    assert.equal(funnel.procured_value, 10_000);
    assert.equal(funnel.procured_coverage_percent, 25);
  });
});

describe("the Finance queue is visible", () => {
  it("totals priced requests still awaiting a cost decision", () => {
    const funnel = summariseMaterialRequestFunnel(
      [
        request({ priced_at: "2026-07-10T09:00:00Z", status: "priced", value: 749_994 }),
        request({ priced_at: "2026-07-20T09:00:00Z", status: "md_review", value: 5_700 }),
        request({ priced_at: "2026-07-20T09:00:00Z", status: "approved", value: 1_000 }),
      ],
      JULY,
    );

    assert.equal(funnel.awaiting_finance_value, 755_694);
    assert.equal(funnel.awaiting_finance_count, 2);
  });

  it("reports the longest wait, which is what needs chasing", () => {
    const funnel = summariseMaterialRequestFunnel(
      [
        request({ priced_at: "2026-07-10T00:00:00Z", status: "priced", value: 100 }),
        request({ priced_at: "2026-07-29T00:00:00Z", status: "priced", value: 100 }),
      ],
      JULY,
    );

    assert.equal(funnel.awaiting_finance_days_max, 21);
  });

  it("has no wait figure when the queue is empty", () => {
    const funnel = summariseMaterialRequestFunnel([request({ status: "approved" })], JULY);

    assert.equal(funnel.awaiting_finance_count, 0);
    assert.equal(funnel.awaiting_finance_days_max, null);
  });
});

describe("procurement lead time", () => {
  it("averages approved to bought over requests that got there", () => {
    const funnel = summariseMaterialRequestFunnel(
      [
        request({
          cost_approved_at: "2026-07-01T00:00:00Z",
          ordered_at: "2026-07-05T00:00:00Z",
          value: 100,
        }),
        request({
          cost_approved_at: "2026-07-01T00:00:00Z",
          ordered_at: "2026-07-11T00:00:00Z",
          value: 100,
        }),
        // Never bought — must not drag the average down as if it were zero days.
        request({ cost_approved_at: "2026-07-01T00:00:00Z", value: 100 }),
      ],
      JULY,
    );

    assert.equal(funnel.procurement_days_avg, 7);
    assert.equal(funnel.procurement_sample, 2);
  });

  it("has no average when nothing has ever been bought", () => {
    const funnel = summariseMaterialRequestFunnel(
      [request({ cost_approved_at: "2026-07-01T00:00:00Z", value: 100 })],
      JULY,
    );

    assert.equal(funnel.procurement_days_avg, null);
    assert.equal(funnel.procurement_sample, 0);
  });
});

describe("delivery", () => {
  it("counts goods confirmed received in the window", () => {
    const funnel = summariseMaterialRequestFunnel(
      [
        request({
          cost_approved_at: "2026-06-01T00:00:00Z",
          delivered_at: "2026-07-15T00:00:00Z",
          ordered_at: "2026-06-20T00:00:00Z",
          status: "closed",
          value: 33_495,
        }),
      ],
      JULY,
    );

    assert.equal(funnel.delivered_value, 33_495);
    assert.equal(funnel.procured_value, 0, "the purchase was June's");
  });
});

// ---------------------------------------------------------------------------
// Cash release
// ---------------------------------------------------------------------------

const AUGUST = opsReportWindow("2026-08-01", "2026-08-31");

const payable = (
  overrides: Partial<OpsPayableForRelease> = {},
): OpsPayableForRelease => ({
  amount: 0,
  approved_at: null,
  id: crypto.randomUUID(),
  paid_at: null,
  payment_type: "supplier_invoice",
  status: "approved",
  submitted_at: null,
  ...overrides,
});

describe("approving a payment is not paying it", () => {
  it("keeps the two apart", () => {
    // The distinction the whole phase exists for. Before the station fix a
    // paid payable was indistinguishable from an approved one.
    const summary = summarisePayableRelease(
      [payable({ amount: 13_500, approved_at: "2026-08-05T09:00:00Z" })],
      AUGUST,
    );

    assert.equal(summary.approved_value, 13_500);
    assert.equal(summary.released_value, 0);
  });

  it("counts the release in the month the cash moved", () => {
    const summary = summarisePayableRelease(
      [
        payable({
          amount: 13_500,
          approved_at: "2026-07-28T09:00:00Z",
          paid_at: "2026-08-05T09:00:00Z",
          status: "paid",
        }),
      ],
      AUGUST,
    );

    assert.equal(summary.approved_value, 0, "the approval belongs to July");
    assert.equal(summary.released_value, 13_500);
  });

  it("splits released cash by type for the finance table", () => {
    const summary = summarisePayableRelease(
      [
        payable({ amount: 13_500, paid_at: "2026-08-05T00:00:00Z", status: "paid" }),
        payable({
          amount: 4_000,
          paid_at: "2026-08-06T00:00:00Z",
          payment_type: "subcontractor",
          status: "paid",
        }),
        payable({
          amount: 1_000,
          paid_at: "2026-08-07T00:00:00Z",
          payment_type: "subcontractor",
          status: "paid",
        }),
      ],
      AUGUST,
    );

    assert.deepEqual(summary.released_by_type, {
      subcontractor: 5_000,
      supplier_invoice: 13_500,
    });
    assert.equal(summary.released_value, 18_500);
  });
});

describe("what suppliers are owed is a position", () => {
  it("counts approved and unpaid at the window's end", () => {
    const summary = summarisePayableRelease(
      [payable({ amount: 13_500, approved_at: "2026-08-05T00:00:00Z" })],
      AUGUST,
    );

    assert.equal(summary.awaiting_release_value, 13_500);
    assert.equal(summary.awaiting_release_count, 1);
    assert.equal(summary.awaiting_release_days_max, 26);
  });

  it("still counts it as owed when payment came after the window", () => {
    const summary = summarisePayableRelease(
      [
        payable({
          amount: 13_500,
          approved_at: "2026-08-05T00:00:00Z",
          paid_at: "2026-09-10T00:00:00Z",
          status: "paid",
        }),
      ],
      AUGUST,
    );

    assert.equal(summary.awaiting_release_value, 13_500, "unpaid at 31 August");
    assert.equal(summary.released_value, 0, "the cash moved in September");
  });

  it("owes nothing on a cancelled or rejected payable", () => {
    const summary = summarisePayableRelease(
      [
        payable({ amount: 9_000, approved_at: "2026-08-02T00:00:00Z", status: "cancelled" }),
        payable({ amount: 8_000, approved_at: "2026-08-02T00:00:00Z", status: "rejected" }),
      ],
      AUGUST,
    );

    assert.equal(summary.awaiting_release_value, 0);
  });
});

describe("the payables approval queue is visible too", () => {
  it("totals submitted payables with no decision yet", () => {
    // The live position: 14 payables submitted 5 August, none reviewed.
    const summary = summarisePayableRelease(
      [
        payable({ amount: 159_890, status: "submitted", submitted_at: "2026-08-05T00:00:00Z" }),
        payable({
          amount: 13_500,
          approved_at: "2026-08-05T00:00:00Z",
          status: "approved",
          submitted_at: "2026-08-05T00:00:00Z",
        }),
      ],
      AUGUST,
    );

    assert.equal(summary.awaiting_approval_value, 159_890);
    assert.equal(summary.awaiting_approval_count, 1);
    assert.equal(summary.awaiting_approval_days_max, 26);
  });

  it("counts a payable in finance_review as still waiting", () => {
    const summary = summarisePayableRelease(
      [payable({ amount: 500, status: "finance_review", submitted_at: "2026-08-20T00:00:00Z" })],
      AUGUST,
    );

    assert.equal(summary.awaiting_approval_count, 1);
  });

  it("has no wait figures when both queues are empty", () => {
    const summary = summarisePayableRelease([], AUGUST);

    assert.equal(summary.awaiting_release_days_max, null);
    assert.equal(summary.awaiting_approval_days_max, null);
    assert.equal(summary.release_days_avg, null);
  });
});

describe("release lead time", () => {
  it("averages approved to paid over payables that were paid", () => {
    const summary = summarisePayableRelease(
      [
        payable({
          amount: 100,
          approved_at: "2026-08-01T00:00:00Z",
          paid_at: "2026-08-05T00:00:00Z",
          status: "paid",
        }),
        payable({
          amount: 100,
          approved_at: "2026-08-01T00:00:00Z",
          paid_at: "2026-08-11T00:00:00Z",
          status: "paid",
        }),
        // Approved and unpaid — must not count as a zero-day release.
        payable({ amount: 100, approved_at: "2026-08-01T00:00:00Z" }),
      ],
      AUGUST,
    );

    assert.equal(summary.release_days_avg, 7);
    assert.equal(summary.release_sample, 2);
  });
});

// ---------------------------------------------------------------------------
// Budget consumption
// ---------------------------------------------------------------------------

const budget = (
  overrides: Partial<OpsBudgetForConsumption> = {},
): OpsBudgetForConsumption => ({
  budget_id: crypto.randomUUID(),
  budget_number: "BUD-TEST",
  budgeted: 0,
  contingency: 0,
  site_code: "0001",
  site_id: crypto.randomUUID(),
  status: "active",
  title: "Test budget",
  ...overrides,
});

const entry = (
  budgetId: string,
  amount: number,
  cost_date: string,
  lifecycle_state = "actual",
): OpsCostEntryForConsumption => ({
  amount,
  budget_id: budgetId,
  cost_date,
  lifecycle_state,
});

describe("used-this-period and remaining are different questions", () => {
  it("counts only in-window spend as used this period", () => {
    const b = budget({ budgeted: 100_000 });
    const consumption = summariseBudgetConsumption(
      [b],
      [
        entry(b.budget_id, 30_000, "2026-06-15"),
        entry(b.budget_id, 25_000, "2026-07-10"),
      ],
      JULY,
    );

    const row = consumption.budgets[0];
    assert.equal(row.consumed_period, 25_000, "July spend only");
    assert.equal(row.consumed_to_date, 55_000, "everything up to 31 July");
    assert.equal(row.remaining, 45_000, "against the whole budget");
  });

  it("ignores spend dated after the window — a later cost cannot move a closed period", () => {
    const b = budget({ budgeted: 100_000 });
    const consumption = summariseBudgetConsumption(
      [b],
      [entry(b.budget_id, 25_000, "2026-07-10"), entry(b.budget_id, 40_000, "2026-08-02")],
      JULY,
    );

    assert.equal(consumption.budgets[0].consumed_to_date, 25_000);
    assert.equal(consumption.budgets[0].remaining, 75_000);
  });

  it("never counts a released station", () => {
    const b = budget({ budgeted: 100_000 });
    const consumption = summariseBudgetConsumption(
      [b],
      [
        entry(b.budget_id, 25_000, "2026-07-10", "reserved"),
        entry(b.budget_id, 90_000, "2026-07-10", "released"),
      ],
      JULY,
    );

    assert.equal(consumption.budgets[0].consumed_to_date, 25_000);
  });

  it("sums every live station, since each holds real budget", () => {
    const b = budget({ budgeted: 100_000 });
    const consumption = summariseBudgetConsumption(
      [b],
      [
        entry(b.budget_id, 1_000, "2026-07-01", "reserved"),
        entry(b.budget_id, 2_000, "2026-07-02", "committed"),
        entry(b.budget_id, 3_000, "2026-07-03", "accrued"),
        entry(b.budget_id, 4_000, "2026-07-04", "actual"),
        entry(b.budget_id, 5_000, "2026-07-05", "paid"),
      ],
      JULY,
    );

    assert.equal(consumption.budgets[0].consumed_to_date, 15_000);
  });

  it("adds the header contingency to what is budgeted", () => {
    const b = budget({ budgeted: 100_000, contingency: 20_000 });
    const consumption = summariseBudgetConsumption([b], [], JULY);

    assert.equal(consumption.budgets[0].budgeted, 120_000);
  });
});

describe("unfunded budgets cannot be a percentage", () => {
  it("reports them by value and count instead", () => {
    // The live case: K133,850 charged to a budget with K0 budgeted.
    const b = budget({ budgeted: 0, status: "draft" });
    const consumption = summariseBudgetConsumption(
      [b],
      [entry(b.budget_id, 133_850, "2026-07-03")],
      JULY,
    );

    assert.equal(consumption.unfunded_budget_count, 1);
    assert.equal(consumption.unfunded_budget_value, 133_850);
    assert.equal(consumption.budgets[0].used_percent, null, "no denominator exists");
  });
});

describe("the roll-up covers active budgets only", () => {
  it("excludes draft and locked from the scalars but keeps them in the table", () => {
    const live = budget({ budgeted: 1_000_000, status: "active" });
    const draft = budget({ budgeted: 900_000, status: "draft" });
    const consumption = summariseBudgetConsumption(
      [live, draft],
      [entry(live.budget_id, 140, "2026-07-10"), entry(draft.budget_id, 46_220, "2026-07-11")],
      JULY,
    );

    assert.equal(consumption.active_budgeted, 1_000_000);
    assert.equal(consumption.active_consumed_period, 140);
    assert.equal(consumption.active_remaining, 999_860);
    assert.equal(consumption.budgets.length, 2, "the table still shows the draft");
  });

  it("has no used percentage when no active budget is funded", () => {
    const consumption = summariseBudgetConsumption(
      [budget({ budgeted: 0, status: "active" })],
      [],
      JULY,
    );

    assert.equal(consumption.active_used_percent, null);
  });

  it("orders worst remaining first — that is why anyone opens the table", () => {
    const healthy = budget({ budgeted: 1_000_000, budget_number: "HEALTHY" });
    const overspent = budget({ budgeted: 10_000, budget_number: "OVERSPENT" });
    const consumption = summariseBudgetConsumption(
      [healthy, overspent],
      [entry(overspent.budget_id, 25_000, "2026-07-10")],
      JULY,
    );

    assert.equal(consumption.budgets[0].budget_number, "OVERSPENT");
    assert.equal(consumption.budgets[0].remaining, -15_000);
  });

  it("counts active budgets past the warning band", () => {
    const consumption = summariseBudgetConsumption(
      [
        budget({ budgeted: 100_000, budget_number: "FINE" }),
        budget({ budgeted: 100_000, budget_number: "TIGHT" }),
      ],
      [],
      JULY,
    );

    // Nothing consumed, so both sit in the ok band.
    assert.equal(consumption.budgets_over_threshold, 0);
  });
});

// ---------------------------------------------------------------------------
// Unplanned spend
// ---------------------------------------------------------------------------

const CONTINGENCY = "cc-contingency";

describe("unplanned spend keeps four different failures apart", () => {
  const base = {
    contingencyCostCodeIds: new Set([CONTINGENCY]),
    entries: [] as OpsSpendEntryForUnplanned[],
    escalations: [] as OpsEscalationForUnplanned[],
    items: [] as OpsRequestItemForUnplanned[],
    payables: [] as OpsOverheadPayableForUnplanned[],
  };

  it("counts contingency and unbudgeted separately even for one entry", () => {
    // The same K5,000 is both off-schedule AND unbudgeted. Summing the two
    // figures would double-count it, which is why they are never summed.
    const spend = summariseUnplannedSpend(
      {
        ...base,
        entries: [
          {
            amount: 5_000,
            budget_line_id: null,
            cost_code_id: CONTINGENCY,
            cost_date: "2026-07-10",
            lifecycle_state: "actual",
          },
        ],
      },
      JULY,
    );

    assert.equal(spend.contingency_value, 5_000);
    assert.equal(spend.unbudgeted_value, 5_000);
  });

  it("ignores released entries and anything outside the window", () => {
    const spend = summariseUnplannedSpend(
      {
        ...base,
        entries: [
          {
            amount: 1_000,
            budget_line_id: null,
            cost_code_id: null,
            cost_date: "2026-07-10",
            lifecycle_state: "released",
          },
          {
            amount: 2_000,
            budget_line_id: null,
            cost_code_id: null,
            cost_date: "2026-06-30",
            lifecycle_state: "actual",
          },
        ],
      },
      JULY,
    );

    assert.equal(spend.unbudgeted_value, 0);
  });

  it("counts uncoded request value only once the cost is approved", () => {
    const spend = summariseUnplannedSpend(
      {
        ...base,
        items: [
          {
            cost_approved_at: "2026-07-13T00:00:00Z",
            cost_code_id: null,
            scope: "site",
            value: 4_000,
          },
          { cost_approved_at: null, cost_code_id: null, scope: "site", value: 90_000 },
        ],
      },
      JULY,
    );

    assert.equal(spend.uncoded_value, 4_000);
    assert.equal(spend.uncoded_item_count, 1);
    assert.equal(spend.total_item_count, 1);
  });

  it("separates general and IT scope from site work", () => {
    const spend = summariseUnplannedSpend(
      {
        ...base,
        items: [
          { cost_approved_at: "2026-07-13T00:00:00Z", cost_code_id: "x", scope: "general", value: 3_392 },
          { cost_approved_at: "2026-07-13T00:00:00Z", cost_code_id: "x", scope: "it", value: 7_500 },
          { cost_approved_at: "2026-07-13T00:00:00Z", cost_code_id: "x", scope: "site", value: 287_211 },
        ],
      },
      JULY,
    );

    assert.equal(spend.general_request_value, 3_392);
    assert.equal(spend.it_request_value, 7_500);
  });

  it("counts only overhead-charged payables", () => {
    const spend = summariseUnplannedSpend(
      {
        ...base,
        payables: [
          { amount: 9_000, approved_at: "2026-07-05T00:00:00Z", charge_target: "overhead" },
          { amount: 13_500, approved_at: "2026-07-05T00:00:00Z", charge_target: "site" },
        ],
      },
      JULY,
    );

    assert.equal(spend.overhead_value, 9_000);
  });

  it("counts only the escalate band, not warnings", () => {
    const spend = summariseUnplannedSpend(
      {
        ...base,
        escalations: [
          { amount: 50_000, band: "escalate", decided_at: "2026-07-10T00:00:00Z" },
          { amount: 20_000, band: "reason_required", decided_at: "2026-07-11T00:00:00Z" },
          { amount: 10_000, band: "ok", decided_at: "2026-07-12T00:00:00Z" },
          { amount: 99_000, band: null, decided_at: "2026-07-13T00:00:00Z" },
        ],
      },
      JULY,
    );

    assert.equal(spend.escalated_value, 50_000);
    assert.equal(spend.escalated_count, 1);
  });
});

// ---------------------------------------------------------------------------
// Payroll
// ---------------------------------------------------------------------------

const payrollItem = (
  overrides: Partial<OpsPayrollRunForPeriod> = {},
): OpsPayrollRunForPeriod => ({
  advances: 0,
  disbursed_at: "2026-07-31T00:00:00Z",
  employee_statutory: 0,
  employer_statutory: 0,
  gross: 0,
  headcount: 1,
  net: 0,
  ...overrides,
});

describe("payroll reports cost to company, not net pay", () => {
  it("adds the employer burden on top of gross", () => {
    // Net understates labour by the whole employer statutory load, which is
    // real cash with a filing deadline.
    const summary = summarisePayrollPeriod(
      {
        advances: [],
        casual: [],
        staff: [
          payrollItem({
            employee_statutory: 24_000,
            employer_statutory: 7_500,
            gross: 149_486,
            net: 118_510,
          }),
        ],
      },
      JULY,
    );

    assert.equal(summary.staff_net, 118_510);
    assert.equal(summary.employer_cost, 156_986, "gross plus employer statutory");
    assert.equal(summary.statutory_due, 31_500, "both sides of the remittance");
  });

  it("keeps casual and staff net apart but pools the employer cost", () => {
    const summary = summarisePayrollPeriod(
      {
        advances: [],
        casual: [payrollItem({ gross: 300, net: 269 })],
        staff: [payrollItem({ gross: 149_486, net: 118_510 })],
      },
      JULY,
    );

    assert.equal(summary.casual_net, 269);
    assert.equal(summary.staff_net, 118_510);
    assert.equal(summary.employer_cost, 149_786);
    assert.equal(summary.headcount_paid, 2);
  });

  it("counts a run only in the period it was disbursed", () => {
    const summary = summarisePayrollPeriod(
      {
        advances: [],
        casual: [],
        staff: [payrollItem({ disbursed_at: "2026-08-03T00:00:00Z", gross: 100, net: 90 })],
      },
      JULY,
    );

    assert.equal(summary.staff_net, 0);
    assert.equal(summary.employer_cost, 0);
  });

  it("never counts an undisbursed run — a draft is not a payment", () => {
    const summary = summarisePayrollPeriod(
      {
        advances: [],
        casual: [],
        staff: [payrollItem({ disbursed_at: null, gross: 1_732_838, net: 1_310_964 })],
      },
      JULY,
    );

    assert.equal(summary.staff_net, 0);
  });

  it("shows advances still outstanding at the period end", () => {
    const summary = summarisePayrollPeriod(
      {
        advances: [
          { amount: 2_000, issued_at: "2026-07-05", recovered: false },
          { amount: 1_500, issued_at: "2026-07-06", recovered: true },
          { amount: 900, issued_at: "2026-08-02", recovered: false },
        ],
        casual: [],
        staff: [],
      },
      JULY,
    );

    assert.equal(summary.advances_outstanding, 2_000);
  });
});

// ---------------------------------------------------------------------------
// Borrowing in the finance report (L5)
// ---------------------------------------------------------------------------

const AUG = opsReportWindow("2026-08-01", "2026-08-31");

const instalment = (
  overrides: Partial<OpsLoanRepaymentForPeriod> = {},
): OpsLoanRepaymentForPeriod => ({
  due_date: "2026-08-15",
  fees: 0,
  interest_portion: 0,
  paid_on: null,
  principal_portion: 0,
  status: "scheduled",
  total_amount: 0,
  ...overrides,
});

describe("borrowing separates the cost from the capital", () => {
  it("reports interest as the cost and principal as not one", () => {
    // The distinction the whole loans module exists for. A reader seeing only
    // debt service would take K22,222 of expense where only K8,333 is.
    const summary = summariseBorrowing(
      [
        instalment({
          fees: 0,
          interest_portion: 8_333.33,
          paid_on: "2026-08-05",
          principal_portion: 13_888.89,
          status: "paid",
          total_amount: 22_222.22,
        }),
      ],
      486_111.11,
      AUG,
    );

    assert.equal(summary.interest_paid, 8_333.33);
    assert.equal(summary.principal_repaid, 13_888.89);
    assert.equal(summary.debt_service, 22_222.22);
    assert.equal(summary.outstanding, 486_111.11);
  });

  it("counts a payment in the month the money left, not the month it was due", () => {
    const summary = summariseBorrowing(
      [
        instalment({
          due_date: "2026-07-15",
          interest_portion: 500,
          paid_on: "2026-08-03",
          principal_portion: 4_500,
          status: "paid",
          total_amount: 5_000,
        }),
      ],
      0,
      AUG,
    );

    assert.equal(summary.debt_service, 5_000);
  });

  it("keeps lender fees out of interest", () => {
    // Fees are bank charges, not the cost of the money.
    const summary = summariseBorrowing(
      [
        instalment({
          fees: 150,
          interest_portion: 1_000,
          paid_on: "2026-08-10",
          principal_portion: 9_000,
          status: "paid",
          total_amount: 10_150,
        }),
      ],
      0,
      AUG,
    );

    assert.equal(summary.interest_paid, 1_000);
    assert.equal(summary.fees_paid, 150);
    assert.equal(summary.debt_service, 10_150);
  });

  it("counts an instalment missed months ago as still in arrears", () => {
    // Arrears is a position at the window's end, so an old miss must appear —
    // it is still owed.
    const summary = summariseBorrowing(
      [
        instalment({ due_date: "2026-05-15", status: "missed", total_amount: 5_000 }),
        instalment({ due_date: "2026-08-15", status: "scheduled", total_amount: 5_000 }),
      ],
      100_000,
      AUG,
    );

    assert.equal(summary.arrears, 10_000);
    assert.equal(summary.arrears_count, 2);
  });

  it("does not count a future instalment as arrears", () => {
    const summary = summariseBorrowing(
      [instalment({ due_date: "2026-10-15", status: "scheduled", total_amount: 5_000 })],
      100_000,
      AUG,
    );

    assert.equal(summary.arrears, 0);
  });

  it("does not count a waived instalment as owed", () => {
    const summary = summariseBorrowing(
      [instalment({ due_date: "2026-05-15", status: "waived", total_amount: 5_000 })],
      0,
      AUG,
    );

    assert.equal(summary.arrears, 0);
  });
});

describe("the arrears sweep", () => {
  const LOANS = readFileSync(
    join(import.meta.dirname, "..", "src", "lib", "ops", "loans.ts"),
    "utf8",
  );

  it("only sweeps facilities that have been drawn down", () => {
    assert.match(LOANS, /loan\?\.status === "active"/);
  });

  it("marks the instalment missed rather than deleting or auto-paying it", () => {
    // It is still owed; the status only records that the date went by.
    assert.match(LOANS, /update\(\{ status: "missed" \}\)/);
  });

  it("sends one notice per facility, not one per instalment", () => {
    // Three missed months on one loan is a single conversation with the bank.
    assert.match(LOANS, /const byLoan = new Map/);
  });

  it("keys the notice on the arrears count so it does not repeat daily", () => {
    // The dated-key mistake the notification audit found: a fresh key every
    // morning means it can never dedupe.
    assert.match(LOANS, /idempotencyKey: `loan-arrears:\$\{loanId\}:\$\{entry\.count\}/);
  });
});
