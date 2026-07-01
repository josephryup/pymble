import type { OpsCustomerStatus, OpsUserRole } from "@/lib/ops/types";

// Customers are an AR-facing register — same visibility as who can raise and
// manage invoices, since the two are directly linked.
const CUSTOMER_VIEW_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "owner",
  "general_manager",
  "manager",
  "finance_manager",
  "accountant",
  "quantity_surveyor",
];

const CUSTOMER_MANAGE_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "owner",
  "general_manager",
  "manager",
  "finance_manager",
  "accountant",
];

export type OpsCustomerMutationTarget = {
  status: OpsCustomerStatus;
};

export function canViewOpsCustomers(role: OpsUserRole) {
  return CUSTOMER_VIEW_ROLES.includes(role);
}

export function canCreateOpsCustomer(role: OpsUserRole) {
  return CUSTOMER_MANAGE_ROLES.includes(role);
}

export function canArchiveOpsCustomer(role: OpsUserRole, customer: OpsCustomerMutationTarget) {
  return CUSTOMER_MANAGE_ROLES.includes(role) && customer.status !== "archived";
}

export function canReactivateOpsCustomer(role: OpsUserRole, customer: OpsCustomerMutationTarget) {
  return CUSTOMER_MANAGE_ROLES.includes(role) && customer.status === "archived";
}
