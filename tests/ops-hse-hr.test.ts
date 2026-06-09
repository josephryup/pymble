import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canAddOpsToolboxTalkAttendee,
  canAdjustOpsPpeItem,
  canApproveOpsHseRiskAssessment,
  canArchiveOpsHseRiskAssessment,
  canCloseOpsHseIncident,
  canCancelOpsHseComplianceAudit,
  canCancelOpsHseInspection,
  canCancelOpsHseInspectionFinding,
  canCancelOpsHseRiskAssessment,
  canCancelOpsSafetyTraining,
  canCreateOpsCorrectiveAction,
  canCreateOpsHseComplianceAudit,
  canCreateOpsHseInspection,
  canCreateOpsHseInspectionFinding,
  canCreateOpsHseIncident,
  canCreateOpsHseRiskAssessment,
  canCreateOpsPpeIssue,
  canCreateOpsPpeItem,
  canCreateOpsSafetyTraining,
  canCreateOpsToolboxTalk,
  canCloseOpsHseComplianceAudit,
  canCompleteOpsHseInspection,
  canCompleteOpsHseComplianceAudit,
  canCompleteOpsSafetyTraining,
  canCompleteOpsToolboxTalk,
  canCorrectOpsHseInspectionFinding,
  canRequireOpsHseComplianceAuditAction,
  canRequireOpsHseInspectionAction,
  canReturnOpsPpeIssue,
  canStartOpsHseInspectionFinding,
  canStartOpsHseInvestigation,
  canSubmitOpsHseRiskAssessment,
  canVerifyOpsHseInspectionFinding,
  canVerifyOpsCorrectiveAction,
  canViewOpsHseCompliance,
  canViewOpsHse,
} from "../src/lib/ops/hse-permissions";
import {
  canApproveOpsLeaveRequest,
  canArchiveOpsEmployeeDocument,
  canCancelOpsEmployeeOnboardingItem,
  canCompleteOpsEmployeeOnboardingItem,
  canCreateOpsEmployeeContract,
  canCreateOpsEmployee,
  canCreateOpsEmployeeOnboardingItem,
  canCreateOpsLeaveRequest,
  canCreateOpsPerformanceAppraisal,
  canCreateOpsRecruitmentRequisition,
  canCreateOpsSelfServiceLeaveRequest,
  canManageOpsEmployeeContract,
  canManageOpsHrDocumentCategory,
  canManageOpsLeaveBalance,
  canManageOpsPerformanceAppraisal,
  canManageOpsRecruitmentRequisition,
  canReviewOpsEmployeeDocument,
  canStartOpsEmployeeOnboardingItem,
  canSubmitOpsLeaveRequest,
  canUploadOpsEmployeeDocument,
  canViewOpsEmployeeDocuments,
  canWaiveOpsEmployeeOnboardingItem,
  canViewOpsHr,
} from "../src/lib/ops/hr-permissions";
import { buildOpsHrDashboardActions, type OpsHrStats } from "../src/lib/ops/hr";
import { buildOpsHrDocumentCoverageReport } from "../src/lib/ops/hr-reporting";

const EMPTY_HR_STATS: OpsHrStats = {
  activeContracts: 0,
  activeEmployees: 0,
  approvedLeave: 0,
  dueAppraisals: 0,
  expiredTraining: 0,
  lowLeaveBalances: 0,
  onLeave: 0,
  openOnboardingItems: 0,
  openRecruitment: 0,
  overdueOnboardingItems: 0,
  submittedLeave: 0,
  totalEmployees: 0,
  trainingDueSoon: 0,
};

describe("HSE and HR guards", () => {
  it("scopes HSE incidents to delivery, HSE, and leadership roles", () => {
    assert.equal(canViewOpsHse("developer"), true);
    assert.equal(canViewOpsHse("hse_officer"), true);
    assert.equal(canViewOpsHse("hse_assistant_officer"), true);
    assert.equal(canViewOpsHse("engineer"), true);
    assert.equal(canViewOpsHse("human_resource"), false);
    assert.equal(canViewOpsHse("accountant"), false);
  });

  it("guards HSE incident and corrective action lifecycle controls", () => {
    const reported = { created_by: "u1", status: "reported" as const };
    const actionRequired = { created_by: "u1", status: "action_required" as const };
    const completedAction = { created_by: "u1", status: "completed" as const };

    assert.equal(canCreateOpsHseIncident("engineer"), true);
    assert.equal(canCreateOpsHseIncident("accountant"), false);
    assert.equal(canStartOpsHseInvestigation("hse_officer", reported), true);
    assert.equal(canCloseOpsHseIncident("hse_officer", actionRequired), true);
    assert.equal(canCreateOpsCorrectiveAction("hse_assistant_officer"), false);
    assert.equal(canVerifyOpsCorrectiveAction("hse_officer", completedAction), true);
  });

  it("guards HSE compliance creation and lifecycle controls", () => {
    const issuedPpe = { created_by: "u1", status: "issued" as const };
    const plannedTalk = { created_by: "u1", status: "planned" as const };
    const plannedInspection = { created_by: "u1", status: "planned" as const };
    const completedInspection = { created_by: "u1", status: "completed" as const };
    const actionRequiredInspection = { created_by: "u1", status: "action_required" as const };
    const activePpeItem = { is_active: true };
    const inactivePpeItem = { is_active: false };
    const openFinding = { created_by: "u1", status: "open" as const };
    const correctedFinding = { created_by: "u1", status: "corrected" as const };
    const plannedTraining = { created_by: "u1", status: "planned" as const };
    const draftRisk = { created_by: "u1", status: "draft" as const };
    const submittedRisk = { created_by: "u1", status: "submitted" as const };
    const approvedRisk = { created_by: "u1", status: "approved" as const };
    const plannedAudit = { created_by: "u1", status: "planned" as const };
    const completedAudit = { created_by: "u1", status: "completed" as const };
    const actionAudit = { created_by: "u1", status: "action_required" as const };

    assert.equal(canViewOpsHseCompliance("hse_assistant_officer"), true);
    assert.equal(canViewOpsHseCompliance("human_resource"), false);
    assert.equal(canCreateOpsPpeIssue("engineer"), true);
    assert.equal(canCreateOpsPpeItem("hse_assistant_officer"), true);
    assert.equal(canAdjustOpsPpeItem("hse_officer", activePpeItem), true);
    assert.equal(canAdjustOpsPpeItem("hse_officer", inactivePpeItem), false);
    assert.equal(canCreateOpsToolboxTalk("hse_assistant_officer"), true);
    assert.equal(canAddOpsToolboxTalkAttendee("hse_officer", plannedTalk), true);
    assert.equal(canCreateOpsHseInspection("hse_officer"), true);
    assert.equal(canReturnOpsPpeIssue("hse_assistant_officer", issuedPpe), true);
    assert.equal(canReturnOpsPpeIssue("engineer", issuedPpe), false);
    assert.equal(canCompleteOpsToolboxTalk("hse_officer", plannedTalk), true);
    assert.equal(canCompleteOpsHseInspection("hse_officer", plannedInspection), true);
    assert.equal(canCreateOpsHseInspectionFinding("hse_officer", plannedInspection), true);
    assert.equal(canStartOpsHseInspectionFinding("hse_officer", openFinding), true);
    assert.equal(canCorrectOpsHseInspectionFinding("hse_officer", openFinding), true);
    assert.equal(canVerifyOpsHseInspectionFinding("hse_officer", correctedFinding), true);
    assert.equal(canCancelOpsHseInspectionFinding("hse_officer", openFinding), true);
    assert.equal(canRequireOpsHseInspectionAction("hse_officer", completedInspection), true);
    assert.equal(canCancelOpsHseInspection("hse_officer", actionRequiredInspection), true);
    assert.equal(canCreateOpsSafetyTraining("engineer"), true);
    assert.equal(canCompleteOpsSafetyTraining("hse_officer", plannedTraining), true);
    assert.equal(canCancelOpsSafetyTraining("hse_officer", plannedTraining), true);
    assert.equal(canCreateOpsHseRiskAssessment("engineer"), true);
    assert.equal(canSubmitOpsHseRiskAssessment("u1", "engineer", draftRisk), true);
    assert.equal(canApproveOpsHseRiskAssessment("hse_officer", submittedRisk), true);
    assert.equal(canArchiveOpsHseRiskAssessment("hse_officer", approvedRisk), true);
    assert.equal(canCancelOpsHseRiskAssessment("hse_assistant_officer", submittedRisk), true);
    assert.equal(canCreateOpsHseComplianceAudit("hse_assistant_officer"), true);
    assert.equal(canCompleteOpsHseComplianceAudit("hse_assistant_officer", plannedAudit), true);
    assert.equal(canRequireOpsHseComplianceAuditAction("hse_officer", completedAudit), true);
    assert.equal(canCloseOpsHseComplianceAudit("hse_officer", actionAudit), true);
    assert.equal(canCancelOpsHseComplianceAudit("engineer", plannedAudit), false);
  });

  it("scopes HR records to HR and leadership roles", () => {
    assert.equal(canViewOpsHr("developer"), true);
    assert.equal(canViewOpsHr("human_resource"), true);
    assert.equal(canViewOpsHr("admin_receptionist"), true);
    assert.equal(canViewOpsHr("finance_manager"), false);
    assert.equal(canViewOpsHr("hse_officer"), false);
    assert.equal(canViewOpsHr("engineer"), false);
  });

  it("guards employee creation and leave decisions", () => {
    const draftLeave = { created_by: "u1", employee_user_id: "u2", status: "draft" as const };
    const submittedLeave = {
      created_by: "u1",
      employee_user_id: "u2",
      status: "submitted" as const,
    };

    assert.equal(canCreateOpsEmployee("human_resource"), true);
    assert.equal(canCreateOpsEmployee("admin_receptionist"), false);
    assert.equal(canCreateOpsLeaveRequest("human_resource"), true);
    assert.equal(canSubmitOpsLeaveRequest("u2", "human_resource", draftLeave), true);
    assert.equal(canApproveOpsLeaveRequest("human_resource", submittedLeave), true);
    assert.equal(canApproveOpsLeaveRequest("admin_receptionist", submittedLeave), false);
    assert.equal(
      canCreateOpsSelfServiceLeaveRequest("u2", { status: "active", user_id: "u2" }),
      true,
    );
    assert.equal(
      canCreateOpsSelfServiceLeaveRequest("u2", { status: "suspended", user_id: "u2" }),
      false,
    );
    assert.equal(
      canCreateOpsSelfServiceLeaveRequest("u2", { status: "active", user_id: "u3" }),
      false,
    );
  });

  it("guards HR maturity controls", () => {
    const openRequisition = { status: "open" as const };
    const activeContract = { status: "active" as const };
    const plannedAppraisal = { status: "planned" as const };
    const pendingOnboarding = { status: "pending" as const };
    const inProgressOnboarding = { status: "in_progress" as const };
    const completedOnboarding = { status: "completed" as const };

    assert.equal(canCreateOpsRecruitmentRequisition("human_resource"), true);
    assert.equal(canCreateOpsRecruitmentRequisition("admin_receptionist"), false);
    assert.equal(canManageOpsRecruitmentRequisition("human_resource", openRequisition), true);
    assert.equal(canCreateOpsEmployeeContract("human_resource"), true);
    assert.equal(canManageOpsEmployeeContract("human_resource", activeContract), true);
    assert.equal(canCreateOpsPerformanceAppraisal("human_resource"), true);
    assert.equal(canManageOpsPerformanceAppraisal("human_resource", plannedAppraisal), true);
    assert.equal(canManageOpsLeaveBalance("human_resource"), true);
    assert.equal(canManageOpsHrDocumentCategory("human_resource"), true);
    assert.equal(canManageOpsLeaveBalance("admin_receptionist"), false);
    assert.equal(canCreateOpsEmployeeOnboardingItem("human_resource"), true);
    assert.equal(canCreateOpsEmployeeOnboardingItem("admin_receptionist"), false);
    assert.equal(canStartOpsEmployeeOnboardingItem("human_resource", pendingOnboarding), true);
    assert.equal(canCompleteOpsEmployeeOnboardingItem("human_resource", inProgressOnboarding), true);
    assert.equal(canWaiveOpsEmployeeOnboardingItem("human_resource", pendingOnboarding), true);
    assert.equal(canCancelOpsEmployeeOnboardingItem("human_resource", pendingOnboarding), true);
    assert.equal(canCancelOpsEmployeeOnboardingItem("human_resource", completedOnboarding), false);
  });

  it("guards employee document upload, review, and archive controls", () => {
    const submittedDocument = { status: "submitted" as const };
    const acceptedDocument = { status: "accepted" as const };
    const archivedDocument = { status: "archived" as const };

    assert.equal(canViewOpsEmployeeDocuments("human_resource"), true);
    assert.equal(canViewOpsEmployeeDocuments("admin_receptionist"), false);
    assert.equal(
      canUploadOpsEmployeeDocument("u1", "engineer", { status: "active", user_id: "u1" }),
      true,
    );
    assert.equal(
      canUploadOpsEmployeeDocument("u1", "engineer", { status: "active", user_id: "u2" }),
      false,
    );
    assert.equal(
      canUploadOpsEmployeeDocument("hr1", "human_resource", { status: "active", user_id: "u2" }),
      true,
    );
    assert.equal(canReviewOpsEmployeeDocument("human_resource", submittedDocument), true);
    assert.equal(canReviewOpsEmployeeDocument("admin_receptionist", submittedDocument), false);
    assert.equal(canReviewOpsEmployeeDocument("human_resource", acceptedDocument), false);
    assert.equal(canArchiveOpsEmployeeDocument("human_resource", acceptedDocument), true);
    assert.equal(canArchiveOpsEmployeeDocument("human_resource", archivedDocument), false);
  });

  it("builds an HR dashboard action queue from actionable signals only", () => {
    assert.deepEqual(buildOpsHrDashboardActions(EMPTY_HR_STATS), []);

    const actions = buildOpsHrDashboardActions({
      ...EMPTY_HR_STATS,
      dueAppraisals: 1,
      expiredTraining: 2,
      submittedLeave: 3,
      trainingDueSoon: 4,
    });

    assert.deepEqual(
      actions.map((action) => [action.label, action.value, action.tone]),
      [
        ["Submitted leave", 3, "watch"],
        ["Expired training", 2, "urgent"],
        ["Training due soon", 4, "watch"],
        ["Appraisals due", 1, "watch"],
      ],
    );
  });

  it("builds HR document coverage across required categories", () => {
    const report = buildOpsHrDocumentCoverageReport({
      categories: [
        {
          category_code: "identity",
          id: "cat-identity",
          is_active: true,
          is_required: true,
          name: "Identity document",
        },
        {
          category_code: "contract",
          id: "cat-contract",
          is_active: true,
          is_required: true,
          name: "Employment contract",
        },
        {
          category_code: "training",
          id: "cat-training",
          is_active: true,
          is_required: false,
          name: "Training record",
        },
      ],
      documents: [
        {
          category_id: "cat-identity",
          employee_id: "emp-1",
          expiry_date: null,
          status: "accepted",
        },
        {
          category_id: "cat-contract",
          employee_id: "emp-1",
          expiry_date: "2026-12-31",
          status: "submitted",
        },
        {
          category_id: "cat-identity",
          employee_id: "emp-2",
          expiry_date: "2026-01-01",
          status: "accepted",
        },
        {
          category_id: "cat-training",
          employee_id: "emp-2",
          expiry_date: null,
          status: "rejected",
        },
      ],
      employees: [
        { department: "Operations", id: "emp-1", status: "active" },
        { department: "Operations", id: "emp-2", status: "probation" },
        { department: "Finance", id: "emp-3", status: "exited" },
      ],
      today: "2026-06-06",
    });

    assert.equal(report.totalEmployees, 2);
    assert.equal(report.totalRequiredSlots, 4);
    assert.equal(report.coveredRequiredSlots, 2);
    assert.equal(report.missingRequiredSlots, 2);
    assert.equal(report.rejectedDocuments, 1);
    assert.equal(report.expiredDocuments, 1);
    assert.deepEqual(
      report.categoryRows
        .filter((row) => row.required)
        .map((row) => [row.categoryCode, row.covered, row.missing]),
      [
        ["identity", 1, 1],
        ["contract", 1, 1],
      ],
    );
  });
});
