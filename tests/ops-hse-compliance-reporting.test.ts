import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildOpsHseAuditEscalations,
  buildOpsHseRiskHeatmap,
} from "../src/lib/ops/hse-compliance-reporting";
import type {
  OpsHseComplianceAuditSummary,
  OpsHseRiskAssessmentSummary,
} from "../src/lib/ops/hse-compliance";

function riskAssessment(
  overrides: Partial<OpsHseRiskAssessmentSummary>,
): OpsHseRiskAssessmentSummary {
  return {
    activity: "Concrete pour",
    approved_at: null,
    archived_at: null,
    area_location: "Zone A",
    assessment_date: "2026-06-01",
    assessment_number: "RA-001",
    cancelled_at: null,
    control_measures: "Permit, barricades, supervision",
    created_at: "2026-06-01T08:00:00Z",
    created_by: "user-1",
    hazard_category: "working_at_height",
    id: "risk-1",
    initial_risk: "medium",
    residual_risk: "low",
    responsible_user: null,
    responsible_user_id: null,
    review_date: null,
    site: null,
    site_id: null,
    status: "draft",
    submitted_at: null,
    title: "Pour deck slab",
    ...overrides,
  };
}

function complianceAudit(
  overrides: Partial<OpsHseComplianceAuditSummary>,
): OpsHseComplianceAuditSummary {
  return {
    action_required: "",
    action_required_at: null,
    audit_number: "AUD-001",
    audit_type: "site",
    auditor: null,
    auditor_id: null,
    cancelled_at: null,
    closed_at: null,
    completed_by: null,
    completed_by_user: null,
    completed_date: null,
    created_at: "2026-06-01T08:00:00Z",
    created_by: "user-1",
    findings_count: 0,
    id: "audit-1",
    next_audit_date: null,
    non_conformance_count: 0,
    scheduled_date: "2026-06-10",
    score: 0,
    site: null,
    site_id: null,
    status: "planned",
    summary: "",
    title: "Monthly site audit",
    ...overrides,
  };
}

describe("HSE compliance reporting helpers", () => {
  it("builds a risk heatmap from active risk assessments only", () => {
    const heatmap = buildOpsHseRiskHeatmap(
      [
        riskAssessment({
          id: "risk-1",
          initial_risk: "critical",
          residual_risk: "high",
          review_date: "2026-06-20",
          status: "approved",
        }),
        riskAssessment({
          id: "risk-2",
          initial_risk: "high",
          residual_risk: "critical",
          status: "submitted",
        }),
        riskAssessment({
          id: "risk-3",
          initial_risk: "medium",
          residual_risk: "medium",
          status: "archived",
        }),
        riskAssessment({
          id: "risk-4",
          initial_risk: "low",
          residual_risk: "low",
          status: "cancelled",
        }),
      ],
      "2026-06-05",
    );

    assert.equal(heatmap.totalActive, 2);
    assert.equal(heatmap.highResidualCount, 2);
    assert.equal(heatmap.criticalResidualCount, 1);
    assert.equal(heatmap.reviewDueCount, 1);
    assert.equal(heatmap.submittedCount, 1);

    const criticalToHigh = heatmap.cells.find(
      (cell) => cell.initialRisk === "critical" && cell.residualRisk === "high",
    );

    assert.equal(criticalToHigh?.count, 1);
    assert.equal(criticalToHigh?.approvedCount, 1);
    assert.equal(criticalToHigh?.reviewDueCount, 1);
  });

  it("buckets audit escalations by operational urgency", () => {
    const escalations = buildOpsHseAuditEscalations(
      [
        complianceAudit({
          id: "action",
          scheduled_date: "2026-06-04",
          status: "action_required",
        }),
        complianceAudit({
          id: "overdue",
          scheduled_date: "2026-06-01",
          status: "planned",
        }),
        complianceAudit({
          id: "due-soon",
          scheduled_date: "2026-06-14",
          status: "planned",
        }),
        complianceAudit({
          id: "completed-with-ncs",
          non_conformance_count: 2,
          scheduled_date: "2026-05-20",
          status: "completed",
        }),
        complianceAudit({
          id: "closed",
          scheduled_date: "2026-06-02",
          status: "closed",
        }),
      ],
      "2026-06-05",
    );

    assert.equal(escalations.counts.action_required, 1);
    assert.equal(escalations.counts.overdue, 1);
    assert.equal(escalations.counts.due_soon, 1);
    assert.equal(escalations.counts.completed_with_ncs, 1);
    assert.deepEqual(
      escalations.items.map((item) => item.bucket),
      ["action_required", "overdue", "due_soon", "completed_with_ncs"],
    );
  });
});
