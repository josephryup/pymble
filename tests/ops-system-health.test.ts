import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  opsFailureModuleLabel,
  summariseOpsFailureEvents,
} from "../src/lib/ops/system-health";

/**
 * The system-health panel exists because 338 `.catch(() => null)` sites write
 * an audit row that nothing ever read back (audit finding R2). These tests
 * cover the pure part — grouping and ordering — because that is what decides
 * whether a genuinely new failure is visible or buried.
 */

describe("opsFailureModuleLabel", () => {
  it("derives a readable module from a dotted action", () => {
    assert.equal(
      opsFailureModuleLabel("material_request.budget_line_resolution_failed"),
      "Material request",
    );
  });

  it("handles a single-word prefix", () => {
    assert.equal(opsFailureModuleLabel("boq.issued_budget_sync_failed"), "Boq");
  });

  it("falls back to Platform for an undotted key", () => {
    // `send_failed` and `render_failed` are written from shared helpers, so the
    // action alone cannot tell us which module produced it.
    assert.equal(opsFailureModuleLabel("send_failed"), "Platform");
  });
});

describe("summariseOpsFailureEvents", () => {
  const events = [
    { action: "a.x_failed", created_at: "2026-08-01T10:00:00.000Z" },
    { action: "a.x_failed", created_at: "2026-08-03T10:00:00.000Z" },
    { action: "a.x_failed", created_at: "2026-08-02T10:00:00.000Z" },
    { action: "b.y_failed", created_at: "2026-08-04T10:00:00.000Z" },
  ];

  it("groups by action and counts", () => {
    const { rows } = summariseOpsFailureEvents(events, 30);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].action, "a.x_failed");
    assert.equal(rows[0].count, 3);
  });

  it("keeps the newest timestamp per action regardless of input order", () => {
    const { rows } = summariseOpsFailureEvents(events, 30);
    assert.equal(rows[0].latest, "2026-08-03T10:00:00.000Z");
  });

  it("totals across every action", () => {
    assert.equal(summariseOpsFailureEvents(events, 30).total, 4);
  });

  it("orders by count, then by recency", () => {
    // Two actions tied on count: the more recent must come first, so a new
    // failure is not buried under an old noisy one with the same total.
    const tied = [
      { action: "old.thing_failed", created_at: "2026-07-01T00:00:00.000Z" },
      { action: "new.thing_failed", created_at: "2026-08-04T00:00:00.000Z" },
    ];
    const { rows } = summariseOpsFailureEvents(tied, 30);
    assert.equal(rows[0].action, "new.thing_failed");
  });

  it("returns an empty, non-throwing summary for no events", () => {
    const summary = summariseOpsFailureEvents([], 30);
    assert.deepEqual(summary.rows, []);
    assert.equal(summary.total, 0);
    assert.equal(summary.windowDays, 30);
  });
});
