import type { OpsUserRole } from "@/lib/ops/types";

// Cost codes have deliberately asymmetric ownership (business decision §7.4 of
// docs/pymble-ops-project-finance-spine-audit.md):
//
//   • The company LIBRARY is Finance's and the MD's. It maps every code to a
//     GL account, so whoever edits it is editing the chart of accounts by
//     proxy. It is the most change-controlled object in the system.
//
//   • The per-project WBS is assembled from library codes by the Quantity
//     Surveyor and Projects Manager — the people who know the phasing.
//
//   • Everyone who raises, prices, or approves anything can READ codes. This
//     is not a courtesy: restricting reads is what drives people back to free
//     text, which is the failure this whole spine exists to end.
//
// Requesting a NEW library code is separate from creating one: a QS may ask,
// Finance decides. That keeps the taxonomy tight without making the QS wait on
// Finance to get on with measuring.

const LIBRARY_MANAGE_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "owner",
  "finance_manager",
];

const PROJECT_WBS_MANAGE_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "general_manager",
  "owner",
  "operations_manager",
  "projects_manager",
  "quantity_surveyor",
];

const LIBRARY_REQUEST_ROLES: OpsUserRole[] = [
  ...PROJECT_WBS_MANAGE_ROLES,
  "procurement_manager",
  "procurement",
  "engineering_manager",
  "engineer",
];

/**
 * Create, rename, remap to a different GL account, or deactivate a library
 * code. Finance Manager and MD only — deliberately excludes the General
 * Manager and Operations Manager, who own delivery rather than the ledger.
 */
export function canManageOpsCostCodeLibrary(role: OpsUserRole) {
  return LIBRARY_MANAGE_ROLES.includes(role);
}

/** Assemble a project's WBS: add phases, attach library codes as leaves. */
export function canManageOpsProjectCostCodes(role: OpsUserRole) {
  return PROJECT_WBS_MANAGE_ROLES.includes(role);
}

/** Ask Finance to add a code that does not exist yet. */
export function canRequestOpsCostCode(role: OpsUserRole) {
  return LIBRARY_REQUEST_ROLES.includes(role);
}

/**
 * Read cost codes. Every active ops user — see the note above on why this is
 * intentionally open. Access to the *workspace* is already gated upstream by
 * requireOpsUser, so this is not a security boundary, it is a statement that
 * cost codes are not confidential.
 */
export function canViewOpsCostCodes(_role: OpsUserRole) {
  return true;
}
