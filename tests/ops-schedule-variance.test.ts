import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeProgrammeVariance,
  computeTaskVariance,
  type TaskForVariance,
} from "../src/lib/ops/schedule-variance";

const NOW = new Date("2026-07-30T00:00:00Z");

function task(overrides: Partial<TaskForVariance> & { id: string }): TaskForVariance {
  return {
    title: overrides.id,
    baselineStartDate: "2026-07-01",
    baselineEndDate: "2026-07-15",
    plannedStartDate: "2026-07-01",
    plannedEndDate: "2026-07-15",
    actualStartDate: null,
    actualEndDate: null,
    completionPercent: 0,
    ...overrides,
  };
}

describe("computeTaskVariance", () => {
  it("reports no slip when the plan still matches its baseline", () => {
    const result = computeTaskVariance(
      task({ id: "t1", completionPercent: 100, actualEndDate: "2026-07-15" }),
      NOW,
    );

    assert.equal(result.plannedSlipDays, 0);
    assert.equal(result.actualSlipDays, 0);
    assert.equal(result.isSlipping, false);
  });

  it("separates a re-planned finish from a late one", () => {
    // Nothing has finished late — but the plan has moved a fortnight. Only
    // plannedSlip shows it, which is the whole reason these are not collapsed.
    const result = computeTaskVariance(
      task({ id: "t1", plannedEndDate: "2026-07-29", completionPercent: 50 }),
      NOW,
    );

    assert.equal(result.plannedSlipDays, 14);
    assert.equal(result.actualSlipDays, null);
    assert.equal(result.isSlipping, true);
  });

  it("records actual lateness once the task finishes", () => {
    const result = computeTaskVariance(
      task({ id: "t1", actualEndDate: "2026-07-22", completionPercent: 100 }),
      NOW,
    );

    assert.equal(result.actualSlipDays, 7);
    assert.equal(result.isComplete, true);
    // Complete work cannot still be overdue.
    assert.equal(result.isOverdue, false);
  });

  it("flags running work already past its baseline as overdue", () => {
    const result = computeTaskVariance(task({ id: "t1", completionPercent: 40 }), NOW);

    assert.equal(result.forecastSlipDays, 15);
    assert.equal(result.isOverdue, true);
  });

  it("cannot measure anything without a baseline", () => {
    // This is the D11 state: mutable dates only, so the plan always agrees
    // with reality and slippage is invisible.
    const result = computeTaskVariance(
      task({
        id: "t1",
        baselineStartDate: null,
        baselineEndDate: null,
        plannedEndDate: "2026-09-30",
      }),
      NOW,
    );

    assert.equal(result.isBaselined, false);
    assert.equal(result.plannedSlipDays, null);
    assert.equal(result.forecastSlipDays, null);
    assert.equal(result.isSlipping, false);
  });

  it("treats 100% complete as done even without an actual end date", () => {
    const result = computeTaskVariance(task({ id: "t1", completionPercent: 100 }), NOW);
    assert.equal(result.isComplete, true);
    assert.equal(result.isOverdue, false);
  });
});

describe("computeProgrammeVariance", () => {
  it("counts baselined, slipping and overdue tasks", () => {
    const result = computeProgrammeVariance(
      [
        task({ id: "ok", completionPercent: 100, actualEndDate: "2026-07-14" }),
        task({ id: "late", completionPercent: 20 }),
        task({ id: "unbaselined", baselineEndDate: null, baselineStartDate: null }),
      ],
      NOW,
    );

    assert.equal(result.baselinedCount, 2);
    assert.equal(result.unbaselinedCount, 1);
    assert.equal(result.overdueCount, 1);
  });

  it("surfaces the worst slip in the programme", () => {
    const result = computeProgrammeVariance(
      [
        task({ id: "a", plannedEndDate: "2026-07-20", completionPercent: 100, actualEndDate: "2026-07-20" }),
        task({ id: "b", plannedEndDate: "2026-08-30", completionPercent: 10 }),
      ],
      NOW,
    );

    assert.equal(result.worstSlipDays, 46);
    // Worst first, so a PM sees the problem before the detail.
    assert.equal(result.tasks[0].taskId, "b");
  });

  it("averages completion across tasks and clamps over-reporting", () => {
    const result = computeProgrammeVariance(
      [
        task({ id: "a", completionPercent: 100 }),
        task({ id: "b", completionPercent: 120 }),
        task({ id: "c", completionPercent: 20 }),
      ],
      NOW,
    );

    // (100 + 100 + 20) / 3 — the 120 cannot inflate the programme.
    assert.equal(result.completionPercent, 73);
  });

  it("handles an empty programme", () => {
    const result = computeProgrammeVariance([], NOW);
    assert.equal(result.completionPercent, 0);
    assert.equal(result.worstSlipDays, 0);
  });
});
