import type {
  OpsEmployeeContractStatus,
  OpsEmployeeDocumentStatus,
  OpsEmployeeOnboardingStatus,
  OpsEmployeeStatus,
  OpsLeaveRequestStatus,
  OpsPerformanceAppraisalStatus,
  OpsRecruitmentRequisitionStatus,
  OpsUserRole,
} from "@/lib/ops/types";

export type OpsEmployeeMutationTarget = {
  status: OpsEmployeeStatus;
};

export type OpsLeaveRequestMutationTarget = {
  created_by: string | null;
  employee_user_id?: string | null;
  status: OpsLeaveRequestStatus;
};

export type OpsSelfServiceLeaveEmployeeTarget = {
  status: OpsEmployeeStatus;
  user_id: string | null;
};

export type OpsRecruitmentRequisitionMutationTarget = {
  status: OpsRecruitmentRequisitionStatus;
};

export type OpsEmployeeContractMutationTarget = {
  status: OpsEmployeeContractStatus;
};

export type OpsPerformanceAppraisalMutationTarget = {
  status: OpsPerformanceAppraisalStatus;
};

export type OpsEmployeeOnboardingMutationTarget = {
  status: OpsEmployeeOnboardingStatus;
};

export type OpsEmployeeDocumentEmployeeTarget = {
  status: OpsEmployeeStatus;
  user_id: string | null;
};

export type OpsEmployeeDocumentMutationTarget = {
  status: OpsEmployeeDocumentStatus;
};

/**
 * The Operations Manager appears in all three lists below by explicit decision
 * (2026-08-25): the OM runs HR admin day to day — approving leave, maintaining
 * employee records, drawing up employment contracts.
 *
 * These three, OPS_HR_ROLES in constants.ts and
 * private.can_access_hr_maturity() in the database must stay in step. The
 * standing finding in this codebase is that RLS drifts WIDER than the code
 * reading through it; here the risk runs the other way too, since every
 * fetcher in hr.ts gates on canViewOpsHr alone.
 */
const HR_VIEW_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "general_manager",
  "human_resource",
  "hr",
  "admin_receptionist",
  "owner",
  "manager",
  "operations_manager",
];

const HR_MANAGE_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "general_manager",
  "human_resource",
  "hr",
  "owner",
  "manager",
  "operations_manager",
];

const LEAVE_DECISION_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "general_manager",
  "human_resource",
  "hr",
  "owner",
  "manager",
  "operations_manager",
];

export function canViewOpsHr(role: OpsUserRole) {
  return HR_VIEW_ROLES.includes(role);
}

export function canCreateOpsEmployee(role: OpsUserRole) {
  return HR_MANAGE_ROLES.includes(role);
}

export function canUpdateOpsEmployeeStatus(role: OpsUserRole) {
  return HR_MANAGE_ROLES.includes(role);
}

/**
 * Who may connect an employee record to a login account.
 *
 * Deliberately NARROWER than HR_MANAGE_ROLES — it excludes the General Manager
 * and the generic `manager` role, because this link is not an HR detail. It
 * decides whose payslip a person can open: `employees.user_id` is the only
 * bridge between "the person we employ" and "the account that signs in", and
 * the payslip gate reads it directly (see the payslip self-service rules).
 * Mis-linking two employees exposes one person's pay to another.
 *
 * So: HR (who own the employee record), the Managing Director and Owner (who
 * carry the accountability), and the developer. Nobody else — including people
 * who can otherwise edit every other field on the same form.
 *
 * The Operations Manager was added to HR_VIEW_ROLES, HR_MANAGE_ROLES and
 * LEAVE_DECISION_ROLES on 2026-08-25 and is DELIBERATELY absent here. Widening
 * HR admin is a workload decision; deciding whose payslip an account can open
 * is not. Do not "tidy" this list into line with the others.
 */
const EMPLOYEE_ACCOUNT_LINK_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "owner",
  "human_resource",
  "hr",
];

export function canLinkOpsEmployeeAccount(role: OpsUserRole) {
  return EMPLOYEE_ACCOUNT_LINK_ROLES.includes(role);
}

export function canCreateOpsLeaveRequest(role: OpsUserRole) {
  return HR_VIEW_ROLES.includes(role);
}

export function canCreateOpsSelfServiceLeaveRequest(
  actorId: string,
  employee: OpsSelfServiceLeaveEmployeeTarget | null | undefined,
) {
  return Boolean(
    employee &&
      employee.user_id === actorId &&
      (employee.status === "active" ||
        employee.status === "probation" ||
        employee.status === "on_leave"),
  );
}

export function canSubmitOpsLeaveRequest(
  actorId: string,
  role: OpsUserRole,
  request: OpsLeaveRequestMutationTarget,
) {
  return (
    request.status === "draft" &&
    (HR_MANAGE_ROLES.includes(role) ||
      request.created_by === actorId ||
      request.employee_user_id === actorId)
  );
}

export function canApproveOpsLeaveRequest(
  role: OpsUserRole,
  request: OpsLeaveRequestMutationTarget,
) {
  return LEAVE_DECISION_ROLES.includes(role) && request.status === "submitted";
}

export function canRejectOpsLeaveRequest(
  role: OpsUserRole,
  request: OpsLeaveRequestMutationTarget,
) {
  return LEAVE_DECISION_ROLES.includes(role) && request.status === "submitted";
}

export function canCancelOpsLeaveRequest(
  actorId: string,
  role: OpsUserRole,
  request: OpsLeaveRequestMutationTarget,
) {
  return (
    (request.status === "draft" || request.status === "submitted" || request.status === "approved") &&
    (LEAVE_DECISION_ROLES.includes(role) ||
      request.created_by === actorId ||
      request.employee_user_id === actorId)
  );
}

export function canCompleteOpsLeaveRequest(
  role: OpsUserRole,
  request: OpsLeaveRequestMutationTarget,
) {
  return LEAVE_DECISION_ROLES.includes(role) && request.status === "approved";
}

export function canCreateOpsRecruitmentRequisition(role: OpsUserRole) {
  return HR_MANAGE_ROLES.includes(role);
}

export function canManageOpsRecruitmentRequisition(
  role: OpsUserRole,
  requisition?: OpsRecruitmentRequisitionMutationTarget,
) {
  return HR_MANAGE_ROLES.includes(role) && (!requisition || requisition.status !== "cancelled");
}

export function canManageOpsJobPosting(role: OpsUserRole) {
  return HR_MANAGE_ROLES.includes(role);
}

export function canReviewOpsJobApplication(role: OpsUserRole) {
  return HR_MANAGE_ROLES.includes(role);
}

export function canCreateOpsEmployeeContract(role: OpsUserRole) {
  return HR_MANAGE_ROLES.includes(role);
}

export function canManageOpsEmployeeContract(
  role: OpsUserRole,
  contract?: OpsEmployeeContractMutationTarget,
) {
  return HR_MANAGE_ROLES.includes(role) && (!contract || contract.status !== "cancelled");
}

export function canCreateOpsPerformanceAppraisal(role: OpsUserRole) {
  return HR_MANAGE_ROLES.includes(role);
}

export function canManageOpsPerformanceAppraisal(
  role: OpsUserRole,
  appraisal?: OpsPerformanceAppraisalMutationTarget,
) {
  return HR_MANAGE_ROLES.includes(role) && (!appraisal || appraisal.status !== "cancelled");
}

export function canManageOpsLeaveBalance(role: OpsUserRole) {
  return HR_MANAGE_ROLES.includes(role);
}

export function canManageOpsHrDocumentCategory(role: OpsUserRole) {
  return HR_MANAGE_ROLES.includes(role);
}

export function canViewOpsEmployeeDocuments(role: OpsUserRole) {
  return HR_MANAGE_ROLES.includes(role);
}

export function canUploadOpsEmployeeDocument(
  actorId: string,
  role: OpsUserRole,
  employee: OpsEmployeeDocumentEmployeeTarget | null | undefined,
) {
  return (
    HR_MANAGE_ROLES.includes(role) ||
    Boolean(
      employee &&
        employee.user_id === actorId &&
        (employee.status === "active" ||
          employee.status === "probation" ||
          employee.status === "on_leave"),
    )
  );
}

export function canReviewOpsEmployeeDocument(
  role: OpsUserRole,
  document?: OpsEmployeeDocumentMutationTarget,
) {
  return (
    HR_MANAGE_ROLES.includes(role) &&
    (!document || document.status === "submitted" || document.status === "rejected")
  );
}

export function canArchiveOpsEmployeeDocument(
  role: OpsUserRole,
  document?: OpsEmployeeDocumentMutationTarget,
) {
  return HR_MANAGE_ROLES.includes(role) && (!document || document.status !== "archived");
}

export function canCreateOpsEmployeeOnboardingItem(role: OpsUserRole) {
  return HR_MANAGE_ROLES.includes(role);
}

export function canStartOpsEmployeeOnboardingItem(
  role: OpsUserRole,
  item: OpsEmployeeOnboardingMutationTarget,
) {
  return HR_MANAGE_ROLES.includes(role) && item.status === "pending";
}

export function canCompleteOpsEmployeeOnboardingItem(
  role: OpsUserRole,
  item: OpsEmployeeOnboardingMutationTarget,
) {
  return (
    HR_MANAGE_ROLES.includes(role) &&
    (item.status === "pending" || item.status === "in_progress")
  );
}

export function canWaiveOpsEmployeeOnboardingItem(
  role: OpsUserRole,
  item: OpsEmployeeOnboardingMutationTarget,
) {
  return (
    HR_MANAGE_ROLES.includes(role) &&
    (item.status === "pending" || item.status === "in_progress")
  );
}

export function canCancelOpsEmployeeOnboardingItem(
  role: OpsUserRole,
  item: OpsEmployeeOnboardingMutationTarget,
) {
  return (
    HR_MANAGE_ROLES.includes(role) &&
    (item.status === "pending" || item.status === "in_progress")
  );
}
