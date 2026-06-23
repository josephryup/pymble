import type { OpsSupplierStatus, OpsUserRole } from "@/lib/ops/types";

export type OpsSupplierMutationTarget = {
  status: OpsSupplierStatus;
};

const SUPPLIER_VIEW_ROLES: OpsUserRole[] = [
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
  "owner",
  "manager",
];

const SUPPLIER_CREATE_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "general_manager",
  "procurement_manager",
  "procurement",
  "procurement_assistant",
  "owner",
  "manager",
];

const SUPPLIER_MANAGER_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "general_manager",
  "procurement_manager",
  "procurement",
  "owner",
  "manager",
];

const SUPPLIER_PERFORMANCE_EVENT_ROLES: OpsUserRole[] = [
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
  "owner",
  "manager",
];

export function canViewOpsSuppliers(role: OpsUserRole) {
  return SUPPLIER_VIEW_ROLES.includes(role);
}

export function canCreateOpsSupplier(role: OpsUserRole) {
  return SUPPLIER_CREATE_ROLES.includes(role);
}

export function canManageOpsSupplier(role: OpsUserRole) {
  return SUPPLIER_MANAGER_ROLES.includes(role);
}

export function canCreateOpsSupplierPerformanceEvent(role: OpsUserRole) {
  return SUPPLIER_PERFORMANCE_EVENT_ROLES.includes(role);
}

export function canArchiveOpsSupplier(role: OpsUserRole, supplier: OpsSupplierMutationTarget) {
  return canManageOpsSupplier(role) && supplier.status !== "archived";
}

export function canReactivateOpsSupplier(role: OpsUserRole, supplier: OpsSupplierMutationTarget) {
  return canManageOpsSupplier(role) && supplier.status === "archived";
}

export function canUpdateOpsSupplierStatus(
  role: OpsUserRole,
  supplier: OpsSupplierMutationTarget,
) {
  return canManageOpsSupplier(role) && supplier.status !== "archived";
}
