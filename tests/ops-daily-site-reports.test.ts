import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canCloseOpsDailySiteReport,
  canCreateOpsDailySiteReport,
  canEditOpsDailySiteReport,
  canReviewOpsDailySiteReport,
  canSubmitOpsDailySiteReport,
  canViewOpsDailySiteReports,
} from "../src/lib/ops/daily-site-report-permissions";

describe("daily site report guards", () => {
  it("scopes daily report visibility across delivery and oversight roles", () => {
    assert.equal(canViewOpsDailySiteReports("developer"), true);
    assert.equal(canViewOpsDailySiteReports("engineer"), true);
    assert.equal(canViewOpsDailySiteReports("quantity_surveyor"), true);
    assert.equal(canViewOpsDailySiteReports("finance_manager"), true);
    assert.equal(canViewOpsDailySiteReports("hse_officer"), true);
    assert.equal(canViewOpsDailySiteReports("procurement"), false);
    assert.equal(canViewOpsDailySiteReports("human_resource"), false);
  });

  it("keeps creation with delivery managers and field owners", () => {
    assert.equal(canCreateOpsDailySiteReport("operations_manager"), true);
    assert.equal(canCreateOpsDailySiteReport("projects_manager"), true);
    assert.equal(canCreateOpsDailySiteReport("engineer"), true);
    assert.equal(canCreateOpsDailySiteReport("supervisor"), true);
    assert.equal(canCreateOpsDailySiteReport("quantity_surveyor"), false);
    assert.equal(canCreateOpsDailySiteReport("finance_manager"), false);
  });

  it("allows draft owners to edit and submit while managers can review and close", () => {
    const draftReport = {
      prepared_by: "user-1",
      status: "draft" as const,
    };
    const submittedReport = {
      prepared_by: "user-1",
      status: "submitted" as const,
    };
    const reviewedReport = {
      prepared_by: "user-1",
      status: "reviewed" as const,
    };

    assert.equal(canEditOpsDailySiteReport("user-1", "engineer", draftReport), true);
    assert.equal(canSubmitOpsDailySiteReport("user-1", "engineer", draftReport), true);
    assert.equal(canSubmitOpsDailySiteReport("user-2", "engineer", draftReport), false);
    assert.equal(canEditOpsDailySiteReport("user-2", "projects_manager", submittedReport), true);
    assert.equal(canReviewOpsDailySiteReport("projects_manager"), true);
    assert.equal(canReviewOpsDailySiteReport("engineer"), false);
    assert.equal(canCloseOpsDailySiteReport("operations_manager"), true);
    assert.equal(canEditOpsDailySiteReport("user-1", "engineer", reviewedReport), false);
  });
});
