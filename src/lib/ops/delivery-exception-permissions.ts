import type { OpsDeliveryExceptionStatus, OpsUserRole } from "@/lib/ops/types";

export type OpsDeliveryExceptionMutationTarget = {
  created_by: string | null;
  status: OpsDeliveryExceptionStatus;
};

const DELIVERY_EXCEPTION_VIEW_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "general_manager",
  "operations_manager",
  "projects_manager",
  "procurement_manager",
  "quantity_surveyor",
  "procurement",
  "procurement_assistant",
  "finance_manager",
  "accountant",
  "engineer",
  "owner",
  "manager",
  "supervisor",
];

const DELIVERY_EXCEPTION_CREATE_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "general_manager",
  "operations_manager",
  "projects_manager",
  "procurement_manager",
  "procurement",
  "procurement_assistant",
  "engineer",
  "owner",
  "manager",
  "supervisor",
];

const DELIVERY_EXCEPTION_MANAGE_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "general_manager",
  "operations_manager",
  "projects_manager",
  "procurement_manager",
  "procurement",
  "owner",
  "manager",
];

export function canViewOpsDeliveryExceptions(role: OpsUserRole) {
  return DELIVERY_EXCEPTION_VIEW_ROLES.includes(role);
}

export function canCreateOpsDeliveryException(role: OpsUserRole) {
  return DELIVERY_EXCEPTION_CREATE_ROLES.includes(role);
}

export function canManageOpsDeliveryException(role: OpsUserRole) {
  return DELIVERY_EXCEPTION_MANAGE_ROLES.includes(role);
}

export function canStartOpsDeliveryException(
  role: OpsUserRole,
  exception: OpsDeliveryExceptionMutationTarget,
) {
  return canManageOpsDeliveryException(role) && exception.status === "open";
}

export function canResolveOpsDeliveryException(
  role: OpsUserRole,
  exception: OpsDeliveryExceptionMutationTarget,
) {
  return (
    canManageOpsDeliveryException(role) &&
    (exception.status === "open" || exception.status === "investigating")
  );
}

export function canCloseOpsDeliveryException(
  role: OpsUserRole,
  exception: OpsDeliveryExceptionMutationTarget,
) {
  return canManageOpsDeliveryException(role) && exception.status === "resolved";
}

export function canCancelOpsDeliveryException(
  role: OpsUserRole,
  exception: OpsDeliveryExceptionMutationTarget,
) {
  return (
    canManageOpsDeliveryException(role) &&
    (exception.status === "open" || exception.status === "investigating")
  );
}
