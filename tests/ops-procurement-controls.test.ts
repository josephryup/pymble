import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyUnmetNeed,
  isReservationStale,
  STALE_RESERVATION_DAYS,
} from "../src/lib/ops/procurement-controls";

const NOW = new Date("2026-07-30T00:00:00Z");

function daysAgo(days: number) {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString();
}

describe("classifyUnmetNeed (audit R3)", () => {
  it("escalates on age even after a single decline", () => {
    // Urgency comes from the site's need date, not from how many times
    // Procurement has said no.
    const result = classifyUnmetNeed({
      decision: "declined",
      declineCount: 1,
      outstandingQuantity: 5,
      neededBy: daysAgo(3),
      now: NOW,
    });

    assert.equal(result.isEscalating, true);
    assert.equal(result.isChronic, false);
    assert.equal(result.daysOverdue, 3);
  });

  it("escalates a chronic decline even when nothing is overdue yet", () => {
    const result = classifyUnmetNeed({
      decision: "deferred",
      declineCount: 2,
      outstandingQuantity: 5,
      neededBy: new Date(NOW.getTime() + 30 * 86_400_000).toISOString(),
      now: NOW,
    });

    assert.equal(result.isChronic, true);
    assert.equal(result.isEscalating, true);
    assert.ok(result.daysOverdue !== null && result.daysOverdue < 0);
  });

  it("does not escalate an in-time single deferral", () => {
    const result = classifyUnmetNeed({
      decision: "deferred",
      declineCount: 0,
      outstandingQuantity: 5,
      neededBy: new Date(NOW.getTime() + 14 * 86_400_000).toISOString(),
      now: NOW,
    });

    assert.equal(result.isEscalating, false);
  });

  it("never escalates an item with nothing outstanding", () => {
    const result = classifyUnmetNeed({
      decision: "declined",
      declineCount: 5,
      outstandingQuantity: 0,
      neededBy: daysAgo(90),
      now: NOW,
    });

    assert.equal(result.isEscalating, false);
    // Still chronic — the supplier record matters even once it was resolved.
    assert.equal(result.isChronic, true);
  });

  it("handles a request with no needed-by date", () => {
    const result = classifyUnmetNeed({
      decision: "deferred",
      declineCount: 0,
      outstandingQuantity: 5,
      neededBy: null,
      now: NOW,
    });

    assert.equal(result.daysOverdue, null);
    assert.equal(result.isEscalating, false);
  });
});

describe("isReservationStale (audit R4)", () => {
  it("flags a reservation older than the window", () => {
    const result = isReservationStale({
      reservedOn: daysAgo(STALE_RESERVATION_DAYS + 1),
      neededBy: null,
      now: NOW,
    });

    assert.equal(result.isStale, true);
    assert.equal(result.ageDays, STALE_RESERVATION_DAYS + 1);
  });

  it("leaves a young reservation alone", () => {
    const result = isReservationStale({
      reservedOn: daysAgo(10),
      neededBy: null,
      now: NOW,
    });

    assert.equal(result.isStale, false);
  });

  it("flags a young reservation whose need date is long past", () => {
    // Approved a fortnight ago for materials that were needed two months ago:
    // young by age, but plainly abandoned.
    const result = isReservationStale({
      reservedOn: daysAgo(14),
      neededBy: daysAgo(60),
      now: NOW,
    });

    assert.equal(result.isStale, true);
  });

  it("does not flag on a needed-by date only recently passed", () => {
    const result = isReservationStale({
      reservedOn: daysAgo(5),
      neededBy: daysAgo(7),
      now: NOW,
    });

    assert.equal(result.isStale, false);
  });

  it("honours a caller-supplied window", () => {
    const result = isReservationStale({
      reservedOn: daysAgo(20),
      neededBy: null,
      now: NOW,
      staleDays: 14,
    });

    assert.equal(result.isStale, true);
  });
});
