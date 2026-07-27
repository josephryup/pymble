import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { boqLinePriceBenchmark, deriveOpsBoqLineDates } from "../src/lib/ops/boq";

const TASK = { id: "task-1", title: "Slab pour", planned_start_date: "2026-09-01" };

describe("deriveOpsBoqLineDates — lead time resolution (audit A4)", () => {
  it("uses the manual override when set", () => {
    const result = deriveOpsBoqLineDates({
      needed_by: "2026-09-01",
      lead_time_days_override: 10,
      task: null,
      stock_item: { lead_time_days: 30 },
    });

    assert.equal(result.leadTimeDays, 10);
    assert.equal(result.leadTimeSource, "override");
    assert.equal(result.triggerBy, "2026-08-22");
  });

  it("falls back to the dictionary lead time when there is no override", () => {
    const result = deriveOpsBoqLineDates({
      needed_by: "2026-09-01",
      lead_time_days_override: null,
      task: null,
      stock_item: { lead_time_days: 14 },
    });

    assert.equal(result.leadTimeDays, 14);
    assert.equal(result.leadTimeSource, "dictionary");
    assert.equal(result.triggerBy, "2026-08-18");
  });

  it("falls back to zero notice only when neither is available", () => {
    const result = deriveOpsBoqLineDates({
      needed_by: "2026-09-01",
      lead_time_days_override: null,
      task: null,
      stock_item: null,
    });

    assert.equal(result.leadTimeDays, 0);
    assert.equal(result.leadTimeSource, "none");
    assert.equal(result.triggerBy, "2026-09-01");
  });

  it("respects an explicit zero override over the dictionary", () => {
    // 0 is a deliberate "no lead time needed", not a missing value.
    const result = deriveOpsBoqLineDates({
      needed_by: "2026-09-01",
      lead_time_days_override: 0,
      task: null,
      stock_item: { lead_time_days: 21 },
    });

    assert.equal(result.leadTimeDays, 0);
    assert.equal(result.leadTimeSource, "override");
  });

  it("prefers the linked task's planned start over needed_by", () => {
    const result = deriveOpsBoqLineDates({
      needed_by: "2026-10-15",
      lead_time_days_override: null,
      task: TASK,
      stock_item: { lead_time_days: 7 },
    });

    assert.equal(result.effectiveNeededBy, "2026-09-01");
    assert.equal(result.triggerBy, "2026-08-25");
  });

  it("still reports the lead time when there is no date to anchor to", () => {
    const result = deriveOpsBoqLineDates({
      needed_by: null,
      lead_time_days_override: null,
      task: null,
      stock_item: { lead_time_days: 14 },
    });

    assert.equal(result.effectiveNeededBy, null);
    assert.equal(result.triggerBy, null);
    assert.equal(result.leadTimeDays, 14);
  });
});

describe("boqLinePriceBenchmark (audit A5)", () => {
  it("flags a rate above the last paid price", () => {
    const benchmark = boqLinePriceBenchmark({
      unit_rate: 120,
      stock_item: { last_unit_cost: 100 },
    });

    assert.ok(benchmark);
    assert.equal(benchmark.isAbove, true);
    assert.equal(benchmark.delta, 20);
    assert.equal(benchmark.percent, 20);
  });

  it("reports a saving against the last paid price", () => {
    const benchmark = boqLinePriceBenchmark({
      unit_rate: 90,
      stock_item: { last_unit_cost: 100 },
    });

    assert.ok(benchmark);
    assert.equal(benchmark.isAbove, false);
    assert.equal(benchmark.percent, -10);
  });

  it("stays silent with no dictionary link", () => {
    assert.equal(boqLinePriceBenchmark({ unit_rate: 120, stock_item: null }), null);
  });

  it("stays silent when the item has no purchase history", () => {
    assert.equal(
      boqLinePriceBenchmark({ unit_rate: 120, stock_item: { last_unit_cost: 0 } }),
      null,
    );
  });

  it("stays silent before the line is priced", () => {
    assert.equal(
      boqLinePriceBenchmark({ unit_rate: 0, stock_item: { last_unit_cost: 100 } }),
      null,
    );
  });
});
