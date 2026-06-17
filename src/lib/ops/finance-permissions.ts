import type {
  OpsPaymentRequestStatus,
  OpsProjectBudgetStatus,
  OpsUserRole,
} from "@/lib/ops/types";

export type OpsProjectBudgetMutationTarget = {
  created_by: string | null;
  status: OpsProjectBudgetStatus;
};

export type OpsPaymentRequestMutationTarget = {
  requested_by: string | null;
  status: OpsPaymentRequestStatus;
};

const FINANCE_VIEW_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "general_manager",
  "operations_manager",
  "projects_manager",
  "procurement_manager",
  "quantity_surveyor",
  "procurement",
  "finance_manager",
  "accountant",
  "owner",
  "manager",
];

const FINANCE_MANAGER_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "general_manager",
  "finance_manager",
  "owner",
  "manager",
];

const BUDGET_CREATE_ROLES: OpsUserRole[] = [
  ...FINANCE_MANAGER_ROLES,
  "accountant",
  "quantity_surveyor",
  "projects_manager",
];

const PAYMENT_CREATE_ROLES: OpsUserRole[] = [
  ...FINANCE_MANAGER_ROLES,
  "accountant",
  "operations_manager",
  "projects_manager",
  "procurement_manager",
  "procurement",
  "quantity_surveyor",
];

const PAYMENT_REVIEW_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "general_manager",
  "finance_manager",
  "accountant",
  "owner",
  "manager",
];

const PAYMENT_APPROVE_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "general_manager",
  "finance_manager",
  "owner",
  "manager",
];

export function canViewOpsFinanceBridge(role: OpsUserRole) {
  return FINANCE_VIEW_ROLES.includes(role);
}

export function canCreateOpsProjectBudget(role: OpsUserRole) {
  return BUDGET_CREATE_ROLES.includes(role);
}

export function canManageOpsProjectBudget(role: OpsUserRole) {
  return FINANCE_MANAGER_ROLES.includes(role);
}

export function canEditOpsProjectBudgetLine(
  role: OpsUserRole,
  budget: OpsProjectBudgetMutationTarget,
) {
  return canCreateOpsProjectBudget(role) && (budget.status === "draft" || budget.status === "active");
}

export function canActivateOpsProjectBudget(
  role: OpsUserRole,
  budget: OpsProjectBudgetMutationTarget,
) {
  return canManageOpsProjectBudget(role) && budget.status === "draft";
}

export function canLockOpsProjectBudget(
  role: OpsUserRole,
  budget: OpsProjectBudgetMutationTarget,
) {
  return canManageOpsProjectBudget(role) && budget.status === "active";
}

export function canArchiveOpsProjectBudget(
  role: OpsUserRole,
  budget: OpsProjectBudgetMutationTarget,
) {
  return canManageOpsProjectBudget(role) && budget.status !== "archived";
}

export function canCreateOpsPaymentRequest(role: OpsUserRole) {
  return PAYMENT_CREATE_ROLES.includes(role);
}

export function canEditOpsPaymentRequest(
  actorId: string,
  role: OpsUserRole,
  paymentRequest: OpsPaymentRequestMutationTarget,
) {
  return (
    (paymentRequest.status === "draft" || paymentRequest.status === "rejected") &&
    (PAYMENT_CREATE_ROLES.includes(role) || paymentRequest.requested_by === actorId)
  );
}

export function canSubmitOpsPaymentRequest(
  actorId: string,
  role: OpsUserRole,
  paymentRequest: OpsPaymentRequestMutationTarget,
) {
  return canEditOpsPaymentRequest(actorId, role, paymentRequest);
}

export function canReviewOpsPaymentRequest(
  role: OpsUserRole,
  paymentRequest: OpsPaymentRequestMutationTarget,
) {
  return PAYMENT_REVIEW_ROLES.includes(role) && paymentRequest.status === "submitted";
}

export function canApproveOpsPaymentRequest(
  role: OpsUserRole,
  paymentRequest: OpsPaymentRequestMutationTarget,
) {
  return PAYMENT_APPROVE_ROLES.includes(role) && paymentRequest.status === "finance_review";
}

export function canRejectOpsPaymentRequest(
  role: OpsUserRole,
  paymentRequest: OpsPaymentRequestMutationTarget,
) {
  return (
    PAYMENT_APPROVE_ROLES.includes(role) &&
    (paymentRequest.status === "submitted" || paymentRequest.status === "finance_review")
  );
}

export function canPayOpsPaymentRequest(
  role: OpsUserRole,
  paymentRequest: OpsPaymentRequestMutationTarget,
) {
  return PAYMENT_REVIEW_ROLES.includes(role) && paymentRequest.status === "approved";
}

export function canCancelOpsPaymentRequest(
  actorId: string,
  role: OpsUserRole,
  paymentRequest: OpsPaymentRequestMutationTarget,
) {
  return (
    (paymentRequest.status === "draft" ||
      paymentRequest.status === "submitted" ||
      paymentRequest.status === "finance_review") &&
    (PAYMENT_APPROVE_ROLES.includes(role) || paymentRequest.requested_by === actorId)
  );
}

const PAYMENT_ARCHIVE_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "owner",
];

export function canArchiveOpsPaymentRequest(
  role: OpsUserRole,
  paymentRequest: OpsPaymentRequestMutationTarget,
) {
  // Only archive once the request reaches a terminal state.
  const terminal = ["paid", "rejected", "cancelled"];
  return terminal.includes(paymentRequest.status) && PAYMENT_ARCHIVE_ROLES.includes(role);
}

export function canDeleteOpsPaymentRequest(role: OpsUserRole) {
  return role === "developer";
}
