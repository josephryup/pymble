import type { OpsUserRole } from "@/lib/ops/types";

// The chart of accounts is a finance-owned register. Viewing is limited to
// leadership + Finance (Finance Manager + Accountant); restructuring it
// (adding, renaming, deactivating accounts) is leadership + Finance Manager,
// mirroring how project budgets are managed. The Accountant works the ledger
// day to day but does not reshape the account tree.
const COA_VIEW_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "general_manager",
  "owner",
  "finance_manager",
  "accountant",
];

const COA_MANAGE_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "general_manager",
  "owner",
  "finance_manager",
];

export function canViewOpsChartOfAccounts(role: OpsUserRole) {
  return COA_VIEW_ROLES.includes(role);
}

export function canManageOpsChartOfAccounts(role: OpsUserRole) {
  return COA_MANAGE_ROLES.includes(role);
}
