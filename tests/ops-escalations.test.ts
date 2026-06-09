import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildOpsEscalationIdempotencyKey,
  classifyOpsEscalationAge,
  getOpsEscalationDateDaysAgo,
  getOpsEscalationTodayKey,
} from "../src/lib/ops/escalations";

describe("ops escalation helpers", () => {
  const now = new Date("2026-06-08T10:00:00.000Z");

  it("classifies due dates before the local business date as overdue", () => {
    assert.equal(
      classifyOpsEscalationAge({
        dueDate: "2026-06-07",
        nowIso: now.toISOString(),
        staleBeforeIso: "2026-06-06T10:00:00.000Z",
        staleAt: "2026-06-08T09:00:00.000Z",
        todayIsoDate: "2026-06-08",
      }),
      "overdue",
    );
  });

  it("classifies records older than the configured SLA as stale", () => {
    assert.equal(
      classifyOpsEscalationAge({
        nowIso: now.toISOString(),
        staleAt: "2026-06-05T09:59:59.000Z",
        staleBeforeIso: "2026-06-06T10:00:00.000Z",
        todayIsoDate: "2026-06-08",
      }),
      "stale",
    );
  });

  it("keeps current records out of the escalation sweep", () => {
    assert.equal(
      classifyOpsEscalationAge({
        dueDate: "2026-06-08",
        nowIso: now.toISOString(),
        staleAt: "2026-06-07T10:00:00.000Z",
        staleBeforeIso: "2026-06-06T10:00:00.000Z",
        todayIsoDate: "2026-06-08",
      }),
      null,
    );
  });

  it("uses deterministic local date keys for daily idempotency", () => {
    assert.equal(getOpsEscalationTodayKey(now), "2026-06-08");
    assert.equal(getOpsEscalationDateDaysAgo(2, now), "2026-06-06");
    assert.equal(
      buildOpsEscalationIdempotencyKey({
        dateKey: "2026-06-08",
        reason: "stale",
        recipientId: "user-1",
        sourceId: "record-1",
        sourceTable: "material_requests",
      }),
      "ops-escalation:material_requests:record-1:stale:2026-06-08:user-1",
    );
  });
});
