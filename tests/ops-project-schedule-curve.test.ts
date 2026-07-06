import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildOpsPlannedProgressCurve,
  type OpsProjectTask,
} from "../src/lib/ops/project-tasks";

function task(partial: Partial<OpsProjectTask>): OpsProjectTask {
  return {
    id: "task-1",
    site_id: "site-1",
    parent_task_id: null,
    title: "Task",
    description: "",
    status: "planned",
    planned_start_date: "2026-01-01",
    planned_end_date: "2026-01-31",
    actual_start_date: null,
    actual_end_date: null,
    completion_percent: 0,
    assigned_to: null,
    sort_order: 0,
    notes: "",
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    archived_at: null,
    archived_by: null,
    assignee: null,
    site: null,
    days_overdue: 0,
    is_overdue: false,
    ...partial,
  };
}

describe("buildOpsPlannedProgressCurve", () => {
  it("returns an empty curve when there are no live tasks", () => {
    const curve = buildOpsPlannedProgressCurve([], new Date("2026-01-15T00:00:00Z"));
    assert.deepEqual(curve.points, []);
    assert.equal(curve.plannedToday, null);

    const cancelledOnly = buildOpsPlannedProgressCurve(
      [task({ status: "cancelled" })],
      new Date("2026-01-15T00:00:00Z"),
    );
    assert.deepEqual(cancelledOnly.points, []);
  });

  it("runs from 0 to 100 across the programme window", () => {
    const curve = buildOpsPlannedProgressCurve(
      [
        task({ planned_start_date: "2026-01-01", planned_end_date: "2026-01-31" }),
        task({ id: "task-2", planned_start_date: "2026-02-01", planned_end_date: "2026-03-31" }),
      ],
      new Date("2026-02-01T00:00:00Z"),
    );

    assert.equal(curve.points.length, 13);
    assert.equal(curve.points[0].planned, 0);
    assert.equal(curve.points.at(-1)?.planned, 100);
    // Monotonically non-decreasing — it is a cumulative curve.
    for (let index = 1; index < curve.points.length; index += 1) {
      assert.ok(curve.points[index].planned >= curve.points[index - 1].planned);
    }
  });

  it("weights tasks equally, matching computeOpsSiteProgress semantics", () => {
    // Task A is fully in the past, task B has not started: planned = 50%.
    const curve = buildOpsPlannedProgressCurve(
      [
        task({ planned_start_date: "2026-01-01", planned_end_date: "2026-01-10" }),
        task({ id: "task-2", planned_start_date: "2026-03-01", planned_end_date: "2026-03-10" }),
      ],
      new Date("2026-02-01T00:00:00Z"),
    );
    assert.equal(curve.plannedToday, 50);
  });

  it("reports no planned-today figure outside the programme window", () => {
    const tasks = [
      task({ planned_start_date: "2026-01-01", planned_end_date: "2026-01-31" }),
    ];
    assert.equal(
      buildOpsPlannedProgressCurve(tasks, new Date("2025-12-01T00:00:00Z")).plannedToday,
      null,
    );
    assert.equal(
      buildOpsPlannedProgressCurve(tasks, new Date("2026-06-01T00:00:00Z")).plannedToday,
      null,
    );
  });
});
