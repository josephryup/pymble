import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildOpsEngineeringProgrammePressureReport,
  buildOpsEngineeringQaCategoryReport,
} from "../src/lib/ops/engineering-controls-reporting";
import {
  canAcknowledgeOpsSiteInstruction,
  canArchiveOpsDrawingRecord,
  canCancelOpsMaterialTest,
  canCancelOpsProgrammeMilestone,
  canCancelOpsQaInspection,
  canCancelOpsSiteInstruction,
  canCancelOpsSiteInstructionFollowUp,
  canCancelOpsSnagItem,
  canCloseOpsQaInspection,
  canCloseOpsSiteInstruction,
  canCloseOpsSiteInstructionFollowUp,
  canCompleteOpsProgrammeMilestone,
  canCompleteOpsQaInspection,
  canCreateOpsEngineeringControl,
  canIssueOpsSiteInstruction,
  canRequireOpsQaInspectionAction,
  canResolveOpsSnagItem,
  canStartOpsSiteInstructionFollowUp,
  canStartOpsSnagItem,
  canSupersedeOpsDrawingRecord,
  canUpdateOpsMaterialTest,
  canUpdateOpsProgrammeMilestone,
  canVerifyOpsSnagItem,
  canViewOpsEngineeringControls,
} from "../src/lib/ops/engineering-controls-permissions";

describe("engineering controls permission guards", () => {
  it("scopes module access to delivery, QS, HSE, and leadership roles", () => {
    assert.equal(canViewOpsEngineeringControls("developer"), true);
    assert.equal(canViewOpsEngineeringControls("projects_manager"), true);
    assert.equal(canViewOpsEngineeringControls("quantity_surveyor"), true);
    assert.equal(canViewOpsEngineeringControls("hse_officer"), true);
    assert.equal(canViewOpsEngineeringControls("finance_manager"), false);
    assert.equal(canViewOpsEngineeringControls("procurement"), false);
    assert.equal(canCreateOpsEngineeringControl("engineer"), true);
    assert.equal(canCreateOpsEngineeringControl("human_resource"), false);
  });

  it("protects site instruction lifecycle transitions", () => {
    assert.equal(canIssueOpsSiteInstruction("projects_manager", { status: "draft" }), true);
    assert.equal(canIssueOpsSiteInstruction("engineer", { status: "draft" }), false);
    assert.equal(
      canAcknowledgeOpsSiteInstruction("user-1", "engineer", {
        assigned_to: "user-1",
        status: "issued",
      }),
      true,
    );
    assert.equal(
      canAcknowledgeOpsSiteInstruction("user-2", "engineer", {
        assigned_to: "user-1",
        status: "issued",
      }),
      false,
    );
    assert.equal(canCloseOpsSiteInstruction("operations_manager", { status: "acknowledged" }), true);
    assert.equal(canCancelOpsSiteInstruction("projects_manager", { status: "closed" }), false);
  });

  it("protects instruction follow-up task transitions", () => {
    const assignedOpen = { assigned_to: "user-1", status: "open" as const };
    const assignedActive = { assigned_to: "user-1", status: "in_progress" as const };

    assert.equal(canStartOpsSiteInstructionFollowUp("user-1", "engineer", assignedOpen), true);
    assert.equal(canStartOpsSiteInstructionFollowUp("user-2", "engineer", assignedOpen), true);
    assert.equal(canCloseOpsSiteInstructionFollowUp("user-1", "engineer", assignedActive), true);
    assert.equal(canCloseOpsSiteInstructionFollowUp("user-2", "engineer", assignedActive), false);
    assert.equal(canCloseOpsSiteInstructionFollowUp("user-2", "projects_manager", assignedActive), true);
    assert.equal(canCancelOpsSiteInstructionFollowUp("projects_manager", assignedOpen), true);
    assert.equal(canCancelOpsSiteInstructionFollowUp("engineer", assignedOpen), false);
  });

  it("protects QA, material test, snag, drawing, and milestone decisions", () => {
    assert.equal(canCompleteOpsQaInspection("quantity_surveyor", { status: "planned" }), true);
    assert.equal(canRequireOpsQaInspectionAction("hse_officer", { status: "completed" }), true);
    assert.equal(canCloseOpsQaInspection("engineer", { status: "completed" }), false);
    assert.equal(canCancelOpsQaInspection("projects_manager", { status: "planned" }), true);

    assert.equal(canUpdateOpsMaterialTest("hse_officer", { status: "submitted" }), true);
    assert.equal(canCancelOpsMaterialTest("quantity_surveyor", { status: "scheduled" }), false);

    assert.equal(canStartOpsSnagItem("engineer", { status: "open" }), true);
    assert.equal(
      canResolveOpsSnagItem("user-1", "engineer", {
        assigned_to: "user-1",
        status: "in_progress",
      }),
      true,
    );
    assert.equal(canVerifyOpsSnagItem("quantity_surveyor", { status: "resolved" }), true);
    assert.equal(canCancelOpsSnagItem("projects_manager", { status: "verified" }), false);

    assert.equal(canSupersedeOpsDrawingRecord("projects_manager", { status: "current" }), true);
    assert.equal(canArchiveOpsDrawingRecord("engineer", { status: "current" }), false);

    assert.equal(canUpdateOpsProgrammeMilestone("engineer", { status: "delayed" }), true);
    assert.equal(canCompleteOpsProgrammeMilestone("projects_manager", { status: "on_track" }), true);
    assert.equal(canCancelOpsProgrammeMilestone("quantity_surveyor", { status: "planned" }), false);
  });

  it("builds QA category pressure from failed, observation, and action items", () => {
    const rows = buildOpsEngineeringQaCategoryReport([
      { action_required: true, finding_category: "safety", result: "fail" },
      { action_required: false, finding_category: "safety", result: "observation" },
      { action_required: true, finding_category: "documentation", result: "pass" },
    ]);

    assert.equal(rows[0]?.category, "safety");
    assert.equal(rows[0]?.total, 2);
    assert.equal(rows[0]?.failed, 1);
    assert.equal(rows[0]?.observations, 1);
    assert.equal(rows[1]?.category, "documentation");
    assert.equal(rows[1]?.action_required, 1);
  });

  it("builds programme pressure by site from milestone dates and slip", () => {
    const report = buildOpsEngineeringProgrammePressureReport({
      todayDate: "2026-06-06",
      milestones: [
        {
          actual_date: null,
          baseline_date: "2026-06-01",
          delay_reason: "Late IFC drawing",
          forecast_date: "2026-06-10",
          milestone_number: "PM-001",
          progress_percent: 40,
          site: { code: "PCL-001", id: "site-1", name: "North Site" },
          site_id: "site-1",
          status: "delayed",
          title: "Foundations",
        },
        {
          actual_date: null,
          baseline_date: "2026-06-20",
          delay_reason: "",
          forecast_date: null,
          milestone_number: "PM-002",
          progress_percent: 20,
          site: { code: "PCL-001", id: "site-1", name: "North Site" },
          site_id: "site-1",
          status: "planned",
          title: "Columns",
        },
        {
          actual_date: "2026-06-04",
          baseline_date: "2026-06-05",
          delay_reason: "",
          forecast_date: null,
          milestone_number: "PM-003",
          progress_percent: 100,
          site: { code: "PCL-002", id: "site-2", name: "South Site" },
          site_id: "site-2",
          status: "completed",
          title: "Setting out",
        },
      ],
    });

    assert.equal(report.totals.milestones, 3);
    assert.equal(report.totals.delayedMilestones, 1);
    assert.equal(report.totals.overdueMilestones, 0);
    assert.equal(report.totals.forecastSlipDays, 9);
    assert.equal(report.siteRows[0]?.site_id, "site-1");
    assert.equal(report.siteRows[0]?.forecast_slip_days, 9);
    assert.equal(report.siteRows[0]?.progress_percent, 30);
  });
});
