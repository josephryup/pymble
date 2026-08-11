import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  opsReportWindow,
  summariseMaterialRequestFunnel,
  type OpsMaterialRequestForFunnel,
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
