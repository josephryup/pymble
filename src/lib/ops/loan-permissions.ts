import type { OpsUserRole } from "@/lib/ops/types";

/**
 * Who sees and who manages borrowing.
 *
 * Deliberately narrower than the rest of Finance. A loan register is the
 * company's debt position and its security arrangements — what has been
 * pledged, to whom, and on what terms. That is leadership and Finance
 * information, not something the procurement or QS roles need in order to do
 * their jobs, and the finance-bridge roles (which include Operations,
 * Projects, Procurement and the QS) are far wider than that.
 */

const LOAN_VIEW_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "owner",
  "general_manager",
  "finance_manager",
  "accountant",
];

/** Creating a facility commits the company. Kept to Finance and the top. */
const LOAN_MANAGE_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "owner",
  "finance_manager",
];

export function canViewOpsLoans(role: OpsUserRole) {
  return LOAN_VIEW_ROLES.includes(role);
}

export function canManageOpsLoans(role: OpsUserRole) {
  return LOAN_MANAGE_ROLES.includes(role);
}

/**
 * Recording a repayment moves cash and posts a journal, so it matches who
 * marks a payable paid — the Accountant included, since this is bookkeeping
 * against an agreement that already exists rather than a new commitment.
 */
export function canRecordOpsLoanRepayment(role: OpsUserRole) {
  return [...LOAN_MANAGE_ROLES, "accountant"].includes(role);
}
