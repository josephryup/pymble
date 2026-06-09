import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canCancelOpsDeliveryException,
  canCloseOpsDeliveryException,
  canCreateOpsDeliveryException,
  canManageOpsDeliveryException,
  canResolveOpsDeliveryException,
  canStartOpsDeliveryException,
  canViewOpsDeliveryExceptions,
} from "../src/lib/ops/delivery-exception-permissions";
import {
  createOpsDeliveryExceptionAgeingBucketSummaries,
  getOpsDeliveryExceptionAgeDays,
  getOpsDeliveryExceptionAgeingBucket,
  getOpsDeliveryExceptionCalendarDayDelta,
} from "../src/lib/ops/delivery-exception-reporting";
import { deliveryExceptionCreateHrefForGrn } from "../src/lib/ops/delivery-exception-shortcuts";

describe("delivery exception guards", () => {
  it("scopes visibility to delivery, procurement, finance, and leadership roles", () => {
    assert.equal(canViewOpsDeliveryExceptions("developer"), true);
    assert.equal(canViewOpsDeliveryExceptions("operations_manager"), true);
    assert.equal(canViewOpsDeliveryExceptions("procurement_assistant"), true);
    assert.equal(canViewOpsDeliveryExceptions("finance_manager"), true);
    assert.equal(canViewOpsDeliveryExceptions("engineer"), true);
    assert.equal(canViewOpsDeliveryExceptions("human_resource"), false);
    assert.equal(canViewOpsDeliveryExceptions("hse_officer"), false);
  });

  it("allows field and stores roles to create but keeps resolution with managers", () => {
    assert.equal(canCreateOpsDeliveryException("engineer"), true);
    assert.equal(canCreateOpsDeliveryException("procurement_assistant"), true);
    assert.equal(canCreateOpsDeliveryException("accountant"), false);
    assert.equal(canManageOpsDeliveryException("procurement_manager"), true);
    assert.equal(canManageOpsDeliveryException("procurement_assistant"), false);
    assert.equal(canManageOpsDeliveryException("finance_manager"), false);
  });

  it("enforces the exception status lifecycle", () => {
    const open = { created_by: "u1", status: "open" as const };
    const investigating = { created_by: "u1", status: "investigating" as const };
    const resolved = { created_by: "u1", status: "resolved" as const };
    const closed = { created_by: "u1", status: "closed" as const };

    assert.equal(canStartOpsDeliveryException("operations_manager", open), true);
    assert.equal(canStartOpsDeliveryException("operations_manager", investigating), false);
    assert.equal(canResolveOpsDeliveryException("procurement_manager", investigating), true);
    assert.equal(canResolveOpsDeliveryException("procurement_assistant", investigating), false);
    assert.equal(canCloseOpsDeliveryException("general_manager", resolved), true);
    assert.equal(canCloseOpsDeliveryException("general_manager", open), false);
    assert.equal(canCancelOpsDeliveryException("operations_manager", open), true);
    assert.equal(canCancelOpsDeliveryException("operations_manager", closed), false);
  });

  it("builds a GRN-backed exception shortcut route", () => {
    const grnId = "8de0f685-0d2e-4c9d-9f4a-251dd8cc4e31";

    assert.equal(
      deliveryExceptionCreateHrefForGrn(grnId),
      `/ops/delivery-exceptions?create=exception&grn_id=${grnId}#delivery-exception-create-panel`,
    );
  });

  it("classifies delivery exception ageing from due and reported dates", () => {
    const todayDate = "2026-06-05";

    assert.equal(
      getOpsDeliveryExceptionAgeingBucket({
        dueAt: "2026-06-04",
        reportedAt: "2026-06-01",
        todayDate,
      }),
      "overdue",
    );
    assert.equal(
      getOpsDeliveryExceptionAgeingBucket({
        dueAt: "2026-06-05",
        reportedAt: "2026-06-01",
        todayDate,
      }),
      "due_today",
    );
    assert.equal(
      getOpsDeliveryExceptionAgeingBucket({
        dueAt: "2026-06-08",
        reportedAt: "2026-06-01",
        todayDate,
      }),
      "due_soon",
    );
    assert.equal(
      getOpsDeliveryExceptionAgeingBucket({
        dueAt: "2026-06-12",
        reportedAt: "2026-06-01",
        todayDate,
      }),
      "on_track",
    );
    assert.equal(
      getOpsDeliveryExceptionAgeingBucket({
        dueAt: null,
        reportedAt: "2026-05-28",
        todayDate,
      }),
      "stale_no_due",
    );
  });

  it("keeps delivery exception reporting date helpers deterministic", () => {
    assert.equal(getOpsDeliveryExceptionCalendarDayDelta("2026-06-08", "2026-06-05"), 3);
    assert.equal(getOpsDeliveryExceptionCalendarDayDelta("2026-06-04", "2026-06-05"), -1);
    assert.equal(getOpsDeliveryExceptionCalendarDayDelta(null, "2026-06-05"), null);
    assert.equal(getOpsDeliveryExceptionAgeDays("2026-05-28", "2026-06-05"), 8);
    assert.equal(getOpsDeliveryExceptionAgeDays("2026-06-08", "2026-06-05"), 0);
    assert.deepEqual(
      createOpsDeliveryExceptionAgeingBucketSummaries().map((bucket) => bucket.bucket),
      ["overdue", "due_today", "due_soon", "stale_no_due", "on_track"],
    );
  });
});
