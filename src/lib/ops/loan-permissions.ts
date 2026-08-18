import type { OpsUserRole } from "@/lib/ops/types";

/**
 * Who sees and who manages borrowing.
 *
 * Still narrower than the rest of Finance. A loan register is the company's
 * debt position and its security arrangements — what has been pledged, to whom,
 * and on what terms. That remains leadership, Finance and Operations
 * information rather than something the procurement or QS roles need, so this
 * list stays well short of the finance-bridge roles.
 *
 * Operations was added on 2026-08-18 at the owner's direction. Recording a
 * repayment is kept OUT of that grant — see below.
 */

const LOAN_VIEW_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "owner",
  "general_manager",
  "finance_manager",
  "accountant",
  "operations_manager",
];

/** Creating a facility commits the company. Finance, the top, and Operations. */
const LOAN_MANAGE_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "owner",
  "finance_manager",
  "operations_manager",
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
 *
 * Listed explicitly rather than derived from LOAN_MANAGE_ROLES. It used to
 * spread that list, which would have handed Operations the ability to post a
 * general-ledger journal as a side effect of being granted "create and edit
 * loans" — a consequence nobody asked for and nobody would have seen. Widen
 * this list deliberately or not at all.
 */
const LOAN_REPAYMENT_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "owner",
  "finance_manager",
  "accountant",
];

export function canRecordOpsLoanRepayment(role: OpsUserRole) {
  return LOAN_REPAYMENT_ROLES.includes(role);
}
