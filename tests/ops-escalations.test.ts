import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildOpsEscalationIdempotencyKey,
  classifyOpsEscalationAge,
  getOpsEscalationDateDaysAgo,
  getOpsEscalationTodayKey,
  OPS_ESCALATION_SLA_DAYS,
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

  it("uses deterministic local date keys for SLA windows", () => {
    assert.equal(getOpsEscalationTodayKey(now), "2026-06-08");
    assert.equal(getOpsEscalationDateDaysAgo(2, now), "2026-06-06");
  });

  it("builds a date-free notification key so a daily sweep cannot duplicate", () => {
    // The key used to embed the sweep date, so six daily crons minted a fresh
    // key every morning — 88% of all notifications were copies made this way.
    const key = buildOpsEscalationIdempotencyKey({
      reason: "stale",
      recipientId: "user-1",
      sourceId: "record-1",
      sourceTable: "material_requests",
    });

    assert.equal(key, "ops-escalation:material_requests:record-1:stale:user-1");
    assert.doesNotMatch(
      key,
      /\d{4}-\d{2}-\d{2}|\d{13}|T\d{2}:\d{2}/,
      "an escalation key must never contain a date or timestamp",
    );
  });

  it("is stable across sweeps for the same item, reason and recipient", () => {
    const build = () =>
      buildOpsEscalationIdempotencyKey({
        reason: "overdue",
        recipientId: "user-1",
        sourceId: "record-1",
        sourceTable: "approval_requests",
      });

    // Same inputs on Monday and on Friday produce the same key, so the upsert
    // updates one row instead of adding a second.
    assert.equal(build(), build());
  });

  it("still raises a new notification when the situation actually changes", () => {
    const base = {
      recipientId: "user-1",
      sourceId: "record-1",
      sourceTable: "approval_requests",
    } as const;

    // Escalation now happens through meaning, not repetition: a worsening
    // reason, or a newly-involved recipient, is a genuinely new notification.
    assert.notEqual(
      buildOpsEscalationIdempotencyKey({ ...base, reason: "overdue" }),
      buildOpsEscalationIdempotencyKey({ ...base, reason: "stale" }),
    );
    assert.notEqual(
      buildOpsEscalationIdempotencyKey({ ...base, reason: "overdue" }),
      buildOpsEscalationIdempotencyKey({
        ...base,
        reason: "overdue",
        recipientId: "user-2",
      }),
    );
  });
});

describe("ops escalation — new source tables (equipment/transport/subcontractor/leave)", () => {
  const now = new Date("2026-06-08T10:00:00.000Z");

  it("configures an SLA window for every escalated source table", () => {
    for (const key of [
      "equipmentRequests",
      "transportRequests",
      "subcontractorPayments",
      "leaveRequests",
    ] as const) {
      assert.ok(
        typeof OPS_ESCALATION_SLA_DAYS[key] === "number" && OPS_ESCALATION_SLA_DAYS[key] >= 1,
        `${key} SLA missing`,
      );
    }
  });

  it("flags a subcontractor payment past its scheduled date as overdue", () => {
    assert.equal(
      classifyOpsEscalationAge({
        dueDate: "2026-06-06",
        nowIso: now.toISOString(),
        staleAt: "2026-06-07T09:00:00.000Z",
        staleBeforeIso: getOpsEscalationDaysAgoIso(2, now),
        todayIsoDate: "2026-06-08",
      }),
      "overdue",
    );
  });

  it("flags a leave request whose start date passed while still submitted", () => {
    // A leave that should already have started but is not approved is overdue —
    // the employee cannot lawfully take unapproved leave.
    assert.equal(
      classifyOpsEscalationAge({
        dueDate: "2026-06-07",
        nowIso: now.toISOString(),
        staleAt: "2026-06-08T08:00:00.000Z",
        staleBeforeIso: getOpsEscalationDaysAgoIso(2, now),
        todayIsoDate: "2026-06-08",
      }),
      "overdue",
    );
  });

  it("leaves a not-yet-due equipment request alone until it ages past the SLA", () => {
    assert.equal(
      classifyOpsEscalationAge({
        dueDate: "2026-06-12",
        nowIso: now.toISOString(),
        staleAt: "2026-06-08T09:00:00.000Z",
        staleBeforeIso: getOpsEscalationDaysAgoIso(2, now),
        todayIsoDate: "2026-06-08",
      }),
      null,
    );
  });
});

function getOpsEscalationDaysAgoIso(days: number, now: Date) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}
