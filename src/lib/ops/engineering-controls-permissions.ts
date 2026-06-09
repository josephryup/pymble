import type {
  OpsDrawingRegisterStatus,
  OpsMaterialTestStatus,
  OpsProgrammeMilestoneStatus,
  OpsQaInspectionStatus,
  OpsSiteInstructionFollowUpStatus,
  OpsSiteInstructionStatus,
  OpsSnagItemStatus,
  OpsUserRole,
} from "@/lib/ops/types";

const ENGINEERING_VIEW_ROLES = new Set<OpsUserRole>([
  "developer",
  "managing_director",
  "general_manager",
  "owner",
  "manager",
  "operations_manager",
  "projects_manager",
  "quantity_surveyor",
  "engineer",
  "hse_officer",
  "hse_assistant_officer",
  "supervisor",
]);

const ENGINEERING_CREATE_ROLES = new Set<OpsUserRole>([
  "developer",
  "managing_director",
  "general_manager",
  "owner",
  "manager",
  "operations_manager",
  "projects_manager",
  "quantity_surveyor",
  "engineer",
  "hse_officer",
  "hse_assistant_officer",
  "supervisor",
]);

const ENGINEERING_DECISION_ROLES = new Set<OpsUserRole>([
  "developer",
  "managing_director",
  "general_manager",
  "owner",
  "manager",
  "operations_manager",
  "projects_manager",
]);

const ENGINEERING_VERIFY_ROLES = new Set<OpsUserRole>([
  ...ENGINEERING_DECISION_ROLES,
  "quantity_surveyor",
  "hse_officer",
]);

export function canViewOpsEngineeringControls(role: OpsUserRole) {
  return ENGINEERING_VIEW_ROLES.has(role);
}

export function canCreateOpsEngineeringControl(role: OpsUserRole) {
  return ENGINEERING_CREATE_ROLES.has(role);
}

export function canIssueOpsSiteInstruction(
  role: OpsUserRole,
  instruction: { status: OpsSiteInstructionStatus },
) {
  return ENGINEERING_DECISION_ROLES.has(role) && instruction.status === "draft";
}

export function canAcknowledgeOpsSiteInstruction(
  userId: string,
  role: OpsUserRole,
  instruction: { assigned_to: string | null; status: OpsSiteInstructionStatus },
) {
  return (
    instruction.status === "issued" &&
    (ENGINEERING_DECISION_ROLES.has(role) || instruction.assigned_to === userId)
  );
}

export function canCloseOpsSiteInstruction(
  role: OpsUserRole,
  instruction: { status: OpsSiteInstructionStatus },
) {
  return (
    ENGINEERING_DECISION_ROLES.has(role) &&
    (instruction.status === "issued" || instruction.status === "acknowledged")
  );
}

export function canCancelOpsSiteInstruction(
  role: OpsUserRole,
  instruction: { status: OpsSiteInstructionStatus },
) {
  return ENGINEERING_DECISION_ROLES.has(role) && !["closed", "cancelled"].includes(instruction.status);
}

export function canStartOpsSiteInstructionFollowUp(
  userId: string,
  role: OpsUserRole,
  followUp: { assigned_to: string | null; status: OpsSiteInstructionFollowUpStatus },
) {
  return (
    followUp.status === "open" &&
    (ENGINEERING_DECISION_ROLES.has(role) ||
      ENGINEERING_CREATE_ROLES.has(role) ||
      followUp.assigned_to === userId)
  );
}

export function canCloseOpsSiteInstructionFollowUp(
  userId: string,
  role: OpsUserRole,
  followUp: { assigned_to: string | null; status: OpsSiteInstructionFollowUpStatus },
) {
  return (
    (followUp.status === "open" || followUp.status === "in_progress") &&
    (ENGINEERING_DECISION_ROLES.has(role) || followUp.assigned_to === userId)
  );
}

export function canCancelOpsSiteInstructionFollowUp(
  role: OpsUserRole,
  followUp: { status: OpsSiteInstructionFollowUpStatus },
) {
  return ENGINEERING_DECISION_ROLES.has(role) && !["closed", "cancelled"].includes(followUp.status);
}

export function canCompleteOpsQaInspection(
  role: OpsUserRole,
  inspection: { status: OpsQaInspectionStatus },
) {
  return ENGINEERING_VERIFY_ROLES.has(role) && inspection.status === "planned";
}

export function canRequireOpsQaInspectionAction(
  role: OpsUserRole,
  inspection: { status: OpsQaInspectionStatus },
) {
  return (
    ENGINEERING_VERIFY_ROLES.has(role) &&
    (inspection.status === "planned" || inspection.status === "completed")
  );
}

export function canCloseOpsQaInspection(
  role: OpsUserRole,
  inspection: { status: OpsQaInspectionStatus },
) {
  return (
    ENGINEERING_DECISION_ROLES.has(role) &&
    (inspection.status === "completed" || inspection.status === "action_required")
  );
}

export function canCancelOpsQaInspection(
  role: OpsUserRole,
  inspection: { status: OpsQaInspectionStatus },
) {
  return ENGINEERING_DECISION_ROLES.has(role) && !["closed", "cancelled"].includes(inspection.status);
}

export function canUpdateOpsMaterialTest(
  role: OpsUserRole,
  test: { status: OpsMaterialTestStatus },
) {
  return ENGINEERING_VERIFY_ROLES.has(role) && ["scheduled", "submitted"].includes(test.status);
}

export function canCancelOpsMaterialTest(
  role: OpsUserRole,
  test: { status: OpsMaterialTestStatus },
) {
  return ENGINEERING_DECISION_ROLES.has(role) && !["passed", "failed", "cancelled"].includes(test.status);
}

export function canStartOpsSnagItem(
  role: OpsUserRole,
  snag: { status: OpsSnagItemStatus },
) {
  return ENGINEERING_CREATE_ROLES.has(role) && snag.status === "open";
}

export function canResolveOpsSnagItem(
  userId: string,
  role: OpsUserRole,
  snag: { assigned_to: string | null; status: OpsSnagItemStatus },
) {
  return (
    snag.status === "in_progress" &&
    (ENGINEERING_DECISION_ROLES.has(role) || snag.assigned_to === userId)
  );
}

export function canVerifyOpsSnagItem(
  role: OpsUserRole,
  snag: { status: OpsSnagItemStatus },
) {
  return ENGINEERING_VERIFY_ROLES.has(role) && snag.status === "resolved";
}

export function canCancelOpsSnagItem(
  role: OpsUserRole,
  snag: { status: OpsSnagItemStatus },
) {
  return ENGINEERING_DECISION_ROLES.has(role) && !["verified", "cancelled"].includes(snag.status);
}

export function canArchiveOpsDrawingRecord(
  role: OpsUserRole,
  drawing: { status: OpsDrawingRegisterStatus },
) {
  return ENGINEERING_DECISION_ROLES.has(role) && drawing.status !== "archived";
}

export function canSupersedeOpsDrawingRecord(
  role: OpsUserRole,
  drawing: { status: OpsDrawingRegisterStatus },
) {
  return ENGINEERING_DECISION_ROLES.has(role) && drawing.status === "current";
}

export function canUpdateOpsProgrammeMilestone(
  role: OpsUserRole,
  milestone: { status: OpsProgrammeMilestoneStatus },
) {
  return ENGINEERING_CREATE_ROLES.has(role) && !["completed", "cancelled"].includes(milestone.status);
}

export function canCompleteOpsProgrammeMilestone(
  role: OpsUserRole,
  milestone: { status: OpsProgrammeMilestoneStatus },
) {
  return ENGINEERING_DECISION_ROLES.has(role) && !["completed", "cancelled"].includes(milestone.status);
}

export function canCancelOpsProgrammeMilestone(
  role: OpsUserRole,
  milestone: { status: OpsProgrammeMilestoneStatus },
) {
  return ENGINEERING_DECISION_ROLES.has(role) && !["completed", "cancelled"].includes(milestone.status);
}
