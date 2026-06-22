import {
  isDeveloperRole,
  isGeneralManagerRole,
  isManagingDirectorRole,
} from "@/lib/ops/roles";
import type { OpsUserRole } from "@/lib/ops/types";

const REGISTER_MANAGER_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "general_manager",
  "owner",
  "manager",
  "operations_manager",
  "projects_manager",
  "procurement_manager",
];

const ALLOCATION_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "general_manager",
  "owner",
  "manager",
  "operations_manager",
  "projects_manager",
  "engineering_manager",
];

const FINANCE_PAYMENT_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "general_manager",
  "owner",
  "finance_manager",
  "accountant",
];

const VIEWER_ROLES: OpsUserRole[] = [
  ...REGISTER_MANAGER_ROLES,
  ...ALLOCATION_ROLES,
  ...FINANCE_PAYMENT_ROLES,
  "quantity_surveyor",
  "engineer",
  "supervisor",
];

export function canManageSubcontractor(role: OpsUserRole) {
  return REGISTER_MANAGER_ROLES.includes(role);
}

export function canAllocateSubcontractor(role: OpsUserRole) {
  return ALLOCATION_ROLES.includes(role);
}

export function canRequestSubcontractorPayment(role: OpsUserRole) {
  return (
    canAllocateSubcontractor(role) ||
    FINANCE_PAYMENT_ROLES.includes(role)
  );
}

export function canApproveSubcontractorPayment(role: OpsUserRole) {
  return FINANCE_PAYMENT_ROLES.includes(role);
}

export function canArchiveSubcontractor(role: OpsUserRole) {
  return (
    isDeveloperRole(role) ||
    isManagingDirectorRole(role) ||
    isGeneralManagerRole(role) ||
    role === "operations_manager"
  );
}

export function canViewSubcontractors(role: OpsUserRole) {
  return Array.from(new Set(VIEWER_ROLES)).includes(role);
}
