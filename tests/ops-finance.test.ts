import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canActivateOpsProjectBudget,
  canApproveOpsPaymentRequest,
  canArchiveOpsProjectBudget,
  canCancelOpsPaymentRequest,
  canCreateOpsPaymentRequest,
  canCreateOpsProjectBudget,
  canEditOpsProjectBudgetLine,
  canLockOpsProjectBudget,
  canPayOpsPaymentRequest,
  canRejectOpsPaymentRequest,
  canReviewOpsPaymentRequest,
  canSubmitOpsPaymentRequest,
  canViewOpsFinanceBridge,
} from "../src/lib/ops/finance-permissions";
import {
  createOpsFinanceAgeingBucketSummaries,
  getOpsFinanceAgeingBucket,
  getOpsFinanceCalendarDayDelta,
  getOpsFinanceDatePlusDays,
  getOpsFinanceMonthStartIso,
} from "../src/lib/ops/finance-reporting";

describe("finance bridge guards", () => {
  it("scopes visibility across finance, commercial, procurement, and delivery leadership", () => {
    assert.equal(canViewOpsFinanceBridge("developer"), true);
    assert.equal(canViewOpsFinanceBridge("finance_manager"), true);
    assert.equal(canViewOpsFinanceBridge("accountant"), true);
    assert.equal(canViewOpsFinanceBridge("quantity_surveyor"), true);
    assert.equal(canViewOpsFinanceBridge("procurement"), true);
    assert.equal(canViewOpsFinanceBridge("operations_manager"), true);
    assert.equal(canViewOpsFinanceBridge("engineer"), false);
    assert.equal(canViewOpsFinanceBridge("human_resource"), false);
  });

  it("keeps budget lifecycle changes with finance leadership", () => {
    const draft = { created_by: "user-1", status: "draft" as const };
    const active = { created_by: "user-1", status: "active" as const };
    const locked = { created_by: "user-1", status: "locked" as const };

    assert.equal(canCreateOpsProjectBudget("quantity_surveyor"), true);
    assert.equal(canCreateOpsProjectBudget("procurement"), false);
    assert.equal(canEditOpsProjectBudgetLine("accountant", draft), true);
    assert.equal(canEditOpsProjectBudgetLine("accountant", locked), false);
    assert.equal(canActivateOpsProjectBudget("finance_manager", draft), true);
    assert.equal(canActivateOpsProjectBudget("accountant", draft), false);
    assert.equal(canLockOpsProjectBudget("general_manager", active), true);
    assert.equal(canArchiveOpsProjectBudget("finance_manager", locked), true);
  });

  it("guards payment request workflow by status and finance role", () => {
    const draft = { requested_by: "requester-1", status: "draft" as const };
    const submitted = { requested_by: "requester-1", status: "submitted" as const };
    const financeReview = { requested_by: "requester-1", status: "finance_review" as const };
    const approved = { requested_by: "requester-1", status: "approved" as const };

    assert.equal(canCreateOpsPaymentRequest("procurement"), true);
    assert.equal(canCreateOpsPaymentRequest("engineer"), false);
    assert.equal(canSubmitOpsPaymentRequest("requester-1", "procurement", draft), true);
    assert.equal(canSubmitOpsPaymentRequest("someone-else", "engineer", draft), false);
    assert.equal(canReviewOpsPaymentRequest("accountant", submitted), true);
    assert.equal(canReviewOpsPaymentRequest("procurement", submitted), false);
    assert.equal(canApproveOpsPaymentRequest("finance_manager", financeReview), true);
    assert.equal(canApproveOpsPaymentRequest("accountant", financeReview), false);
    assert.equal(canRejectOpsPaymentRequest("general_manager", submitted), true);
    assert.equal(canPayOpsPaymentRequest("accountant", approved), true);
    assert.equal(canCancelOpsPaymentRequest("requester-1", "procurement", submitted), true);
    assert.equal(canCancelOpsPaymentRequest("someone-else", "procurement", submitted), false);
  });

  it("classifies finance ageing buckets from calendar dates", () => {
    const today = "2026-06-04";

    assert.equal(getOpsFinanceAgeingBucket(null, today), "current");
    assert.equal(getOpsFinanceAgeingBucket("2026-06-20", today), "current");
    assert.equal(getOpsFinanceAgeingBucket("2026-06-11", today), "due_soon");
    assert.equal(getOpsFinanceAgeingBucket("2026-06-04", today), "due_soon");
    assert.equal(getOpsFinanceAgeingBucket("2026-05-20", today), "overdue_1_30");
    assert.equal(getOpsFinanceAgeingBucket("2026-04-15", today), "overdue_31_60");
    assert.equal(getOpsFinanceAgeingBucket("2026-03-01", today), "overdue_61_plus");
  });

  it("keeps finance reporting date helpers deterministic", () => {
    assert.equal(getOpsFinanceCalendarDayDelta("2026-06-11", "2026-06-04"), 7);
    assert.equal(getOpsFinanceCalendarDayDelta("2026-06-01", "2026-06-04"), -3);
    assert.equal(getOpsFinanceDatePlusDays("2026-06-04", 30), "2026-07-04");
    assert.equal(getOpsFinanceMonthStartIso("2026-06-04"), "2026-06-01");
    assert.deepEqual(
      createOpsFinanceAgeingBucketSummaries().map((bucket) => bucket.bucket),
      ["current", "due_soon", "overdue_1_30", "overdue_31_60", "overdue_61_plus"],
    );
  });
});
