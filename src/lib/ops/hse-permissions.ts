import type {
  OpsCorrectiveActionStatus,
  OpsHseComplianceAuditStatus,
  OpsHseInspectionFindingStatus,
  OpsHseInspectionStatus,
  OpsHseIncidentStatus,
  OpsHseRiskAssessmentStatus,
  OpsPpeIssueStatus,
  OpsSafetyTrainingStatus,
  OpsToolboxTalkStatus,
  OpsUserRole,
} from "@/lib/ops/types";

export type OpsHseIncidentMutationTarget = {
  created_by: string | null;
  status: OpsHseIncidentStatus;
};

export type OpsCorrectiveActionMutationTarget = {
  created_by: string | null;
  status: OpsCorrectiveActionStatus;
};

export type OpsPpeIssueMutationTarget = {
  created_by: string | null;
  status: OpsPpeIssueStatus;
};

export type OpsPpeItemMutationTarget = {
  is_active: boolean;
};

export type OpsToolboxTalkMutationTarget = {
  created_by: string | null;
  status: OpsToolboxTalkStatus;
};

export type OpsHseInspectionMutationTarget = {
  created_by: string | null;
  status: OpsHseInspectionStatus;
};

export type OpsHseInspectionFindingMutationTarget = {
  created_by: string | null;
  status: OpsHseInspectionFindingStatus;
};

export type OpsSafetyTrainingMutationTarget = {
  created_by: string | null;
  status: OpsSafetyTrainingStatus;
};

export type OpsHseRiskAssessmentMutationTarget = {
  created_by: string | null;
  status: OpsHseRiskAssessmentStatus;
};

export type OpsHseComplianceAuditMutationTarget = {
  created_by: string | null;
  status: OpsHseComplianceAuditStatus;
};

const HSE_VIEW_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "general_manager",
  "operations_manager",
  "projects_manager",
  "engineer",
  "hse_officer",
  "hse_assistant_officer",
  "owner",
  "manager",
  "supervisor",
];

const HSE_CREATE_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "general_manager",
  "operations_manager",
  "projects_manager",
  "engineer",
  "hse_officer",
  "hse_assistant_officer",
  "owner",
  "manager",
  "supervisor",
];

const HSE_MANAGE_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "general_manager",
  "operations_manager",
  "projects_manager",
  "hse_officer",
  "owner",
  "manager",
];

const HSE_COMPLIANCE_MANAGE_ROLES: OpsUserRole[] = [
  ...HSE_MANAGE_ROLES,
  "hse_assistant_officer",
];

export function canViewOpsHse(role: OpsUserRole) {
  return HSE_VIEW_ROLES.includes(role);
}

export function canViewOpsHseCompliance(role: OpsUserRole) {
  return canViewOpsHse(role);
}

export function canCreateOpsHseIncident(role: OpsUserRole) {
  return HSE_CREATE_ROLES.includes(role);
}

export function canManageOpsHseIncident(role: OpsUserRole) {
  return HSE_MANAGE_ROLES.includes(role);
}

export function canStartOpsHseInvestigation(
  role: OpsUserRole,
  incident: OpsHseIncidentMutationTarget,
) {
  return canManageOpsHseIncident(role) && incident.status === "reported";
}

export function canRequireOpsCorrectiveAction(
  role: OpsUserRole,
  incident: OpsHseIncidentMutationTarget,
) {
  return (
    canManageOpsHseIncident(role) &&
    (incident.status === "reported" || incident.status === "investigating")
  );
}

export function canCloseOpsHseIncident(
  role: OpsUserRole,
  incident: OpsHseIncidentMutationTarget,
) {
  return canManageOpsHseIncident(role) && incident.status === "action_required";
}

export function canCancelOpsHseIncident(
  role: OpsUserRole,
  incident: OpsHseIncidentMutationTarget,
) {
  return (
    canManageOpsHseIncident(role) &&
    (incident.status === "reported" || incident.status === "investigating")
  );
}

export function canCreateOpsCorrectiveAction(role: OpsUserRole) {
  return HSE_MANAGE_ROLES.includes(role);
}

export function canStartOpsCorrectiveAction(
  role: OpsUserRole,
  action: OpsCorrectiveActionMutationTarget,
) {
  return canCreateOpsCorrectiveAction(role) && action.status === "open";
}

export function canCompleteOpsCorrectiveAction(
  actorId: string,
  role: OpsUserRole,
  action: OpsCorrectiveActionMutationTarget,
) {
  return (
    action.status === "open" ||
    action.status === "in_progress"
  ) && (canCreateOpsCorrectiveAction(role) || action.created_by === actorId);
}

export function canVerifyOpsCorrectiveAction(
  role: OpsUserRole,
  action: OpsCorrectiveActionMutationTarget,
) {
  return canCreateOpsCorrectiveAction(role) && action.status === "completed";
}

export function canCancelOpsCorrectiveAction(
  role: OpsUserRole,
  action: OpsCorrectiveActionMutationTarget,
) {
  return (
    canCreateOpsCorrectiveAction(role) &&
    (action.status === "open" || action.status === "in_progress")
  );
}

export function canCreateOpsPpeIssue(role: OpsUserRole) {
  return HSE_CREATE_ROLES.includes(role);
}

export function canCreateOpsPpeItem(role: OpsUserRole) {
  return HSE_COMPLIANCE_MANAGE_ROLES.includes(role);
}

export function canAdjustOpsPpeItem(role: OpsUserRole, item: OpsPpeItemMutationTarget) {
  return HSE_COMPLIANCE_MANAGE_ROLES.includes(role) && item.is_active;
}

export function canManageOpsPpeIssue(role: OpsUserRole) {
  return HSE_COMPLIANCE_MANAGE_ROLES.includes(role);
}

export function canReturnOpsPpeIssue(role: OpsUserRole, issue: OpsPpeIssueMutationTarget) {
  return canManageOpsPpeIssue(role) && issue.status === "issued";
}

export function canMarkOpsPpeIssueDamaged(role: OpsUserRole, issue: OpsPpeIssueMutationTarget) {
  return canManageOpsPpeIssue(role) && issue.status === "issued";
}

export function canMarkOpsPpeIssueLost(role: OpsUserRole, issue: OpsPpeIssueMutationTarget) {
  return canManageOpsPpeIssue(role) && issue.status === "issued";
}

export function canCancelOpsPpeIssue(role: OpsUserRole, issue: OpsPpeIssueMutationTarget) {
  return canManageOpsPpeIssue(role) && issue.status === "issued";
}

export function canCreateOpsToolboxTalk(role: OpsUserRole) {
  return HSE_CREATE_ROLES.includes(role);
}

export function canAddOpsToolboxTalkAttendee(
  role: OpsUserRole,
  talk: OpsToolboxTalkMutationTarget,
) {
  return canManageOpsToolboxTalk(role) && talk.status !== "cancelled";
}

export function canManageOpsToolboxTalk(role: OpsUserRole) {
  return HSE_COMPLIANCE_MANAGE_ROLES.includes(role);
}

export function canCompleteOpsToolboxTalk(
  role: OpsUserRole,
  talk: OpsToolboxTalkMutationTarget,
) {
  return canManageOpsToolboxTalk(role) && talk.status === "planned";
}

export function canCancelOpsToolboxTalk(role: OpsUserRole, talk: OpsToolboxTalkMutationTarget) {
  return canManageOpsToolboxTalk(role) && talk.status === "planned";
}

export function canCreateOpsHseInspection(role: OpsUserRole) {
  return HSE_CREATE_ROLES.includes(role);
}

export function canCreateOpsHseInspectionFinding(
  role: OpsUserRole,
  inspection: OpsHseInspectionMutationTarget,
) {
  return (
    canManageOpsHseInspection(role) &&
    inspection.status !== "closed" &&
    inspection.status !== "cancelled"
  );
}

export function canManageOpsHseInspection(role: OpsUserRole) {
  return HSE_COMPLIANCE_MANAGE_ROLES.includes(role);
}

export function canCompleteOpsHseInspection(
  role: OpsUserRole,
  inspection: OpsHseInspectionMutationTarget,
) {
  return canManageOpsHseInspection(role) && inspection.status === "planned";
}

export function canRequireOpsHseInspectionAction(
  role: OpsUserRole,
  inspection: OpsHseInspectionMutationTarget,
) {
  return (
    canManageOpsHseInspection(role) &&
    (inspection.status === "planned" || inspection.status === "completed")
  );
}

export function canCloseOpsHseInspection(
  role: OpsUserRole,
  inspection: OpsHseInspectionMutationTarget,
) {
  return (
    canManageOpsHseInspection(role) &&
    (inspection.status === "completed" || inspection.status === "action_required")
  );
}

export function canCancelOpsHseInspection(
  role: OpsUserRole,
  inspection: OpsHseInspectionMutationTarget,
) {
  return (
    canManageOpsHseInspection(role) &&
    (inspection.status === "planned" || inspection.status === "action_required")
  );
}

export function canStartOpsHseInspectionFinding(
  role: OpsUserRole,
  finding: OpsHseInspectionFindingMutationTarget,
) {
  return canManageOpsHseInspection(role) && finding.status === "open";
}

export function canCorrectOpsHseInspectionFinding(
  role: OpsUserRole,
  finding: OpsHseInspectionFindingMutationTarget,
) {
  return (
    canManageOpsHseInspection(role) &&
    (finding.status === "open" || finding.status === "in_progress")
  );
}

export function canVerifyOpsHseInspectionFinding(
  role: OpsUserRole,
  finding: OpsHseInspectionFindingMutationTarget,
) {
  return canManageOpsHseInspection(role) && finding.status === "corrected";
}

export function canCancelOpsHseInspectionFinding(
  role: OpsUserRole,
  finding: OpsHseInspectionFindingMutationTarget,
) {
  return (
    canManageOpsHseInspection(role) &&
    (finding.status === "open" || finding.status === "in_progress")
  );
}

export function canCreateOpsSafetyTraining(role: OpsUserRole) {
  return HSE_CREATE_ROLES.includes(role);
}

export function canCompleteOpsSafetyTraining(
  role: OpsUserRole,
  training: OpsSafetyTrainingMutationTarget,
) {
  return canManageOpsHseInspection(role) && training.status === "planned";
}

export function canCancelOpsSafetyTraining(
  role: OpsUserRole,
  training: OpsSafetyTrainingMutationTarget,
) {
  return canManageOpsHseInspection(role) && training.status === "planned";
}

export function canCreateOpsHseRiskAssessment(role: OpsUserRole) {
  return HSE_CREATE_ROLES.includes(role);
}

export function canSubmitOpsHseRiskAssessment(
  actorId: string,
  role: OpsUserRole,
  assessment: OpsHseRiskAssessmentMutationTarget,
) {
  return (
    assessment.status === "draft" &&
    (HSE_COMPLIANCE_MANAGE_ROLES.includes(role) || assessment.created_by === actorId)
  );
}

export function canApproveOpsHseRiskAssessment(
  role: OpsUserRole,
  assessment: OpsHseRiskAssessmentMutationTarget,
) {
  return HSE_MANAGE_ROLES.includes(role) && assessment.status === "submitted";
}

export function canArchiveOpsHseRiskAssessment(
  role: OpsUserRole,
  assessment: OpsHseRiskAssessmentMutationTarget,
) {
  return HSE_MANAGE_ROLES.includes(role) && assessment.status === "approved";
}

export function canCancelOpsHseRiskAssessment(
  role: OpsUserRole,
  assessment: OpsHseRiskAssessmentMutationTarget,
) {
  return (
    HSE_COMPLIANCE_MANAGE_ROLES.includes(role) &&
    (assessment.status === "draft" || assessment.status === "submitted")
  );
}

export function canCreateOpsHseComplianceAudit(role: OpsUserRole) {
  return HSE_COMPLIANCE_MANAGE_ROLES.includes(role);
}

export function canCompleteOpsHseComplianceAudit(
  role: OpsUserRole,
  audit: OpsHseComplianceAuditMutationTarget,
) {
  return HSE_COMPLIANCE_MANAGE_ROLES.includes(role) && audit.status === "planned";
}

export function canRequireOpsHseComplianceAuditAction(
  role: OpsUserRole,
  audit: OpsHseComplianceAuditMutationTarget,
) {
  return (
    HSE_MANAGE_ROLES.includes(role) &&
    (audit.status === "planned" || audit.status === "completed")
  );
}

export function canCloseOpsHseComplianceAudit(
  role: OpsUserRole,
  audit: OpsHseComplianceAuditMutationTarget,
) {
  return (
    HSE_MANAGE_ROLES.includes(role) &&
    (audit.status === "completed" || audit.status === "action_required")
  );
}

export function canCancelOpsHseComplianceAudit(
  role: OpsUserRole,
  audit: OpsHseComplianceAuditMutationTarget,
) {
  return (
    HSE_MANAGE_ROLES.includes(role) &&
    (audit.status === "planned" || audit.status === "action_required")
  );
}
