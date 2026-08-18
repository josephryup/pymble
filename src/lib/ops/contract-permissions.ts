import type { OpsContractKind, OpsContractSignatoryRole } from "@/lib/ops/contract-types";
import type { OpsUserRole } from "@/lib/ops/types";

/**
 * Who can do what with contracts. Mirrors subcontractor-permissions.ts in
 * shape, and is deliberately kept in step with private.can_access_contracts()
 * in the database — the standing finding across this codebase is that RLS
 * drifts WIDER than the code that reads through it, so the two lists are meant
 * to be compared whenever either changes.
 */

const DRAFT_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "general_manager",
  "owner",
  "manager",
  "human_resource",
  "hr",
  "operations_manager",
  "projects_manager",
  "procurement_manager",
  "quantity_surveyor",
];

/** Commercial review — the values, the milestones, the programme. */
const REVIEW_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "general_manager",
  "owner",
  "manager",
  "operations_manager",
  "projects_manager",
  "procurement_manager",
  "quantity_surveyor",
  "finance_manager",
];

const APPROVE_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "general_manager",
  "owner",
];

/** HR and leadership put contracts out; nobody else. */
const ISSUE_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "general_manager",
  "owner",
  "human_resource",
  "hr",
];

const VIEWER_ROLES: OpsUserRole[] = [
  ...DRAFT_ROLES,
  ...REVIEW_ROLES,
  "accountant",
];

/**
 * Employment contracts carry pay. They are visible only to the roles that can
 * already see salaries elsewhere in HR — the same set behind
 * private.can_access_hr_maturity(). A quantity surveyor can price a
 * subcontract; they have no business reading a colleague's salary.
 */
const EMPLOYMENT_VIEWER_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "general_manager",
  "owner",
  "manager",
  "human_resource",
  "hr",
];

/**
 * Which workspace role may occupy which signature slot.
 *
 * The internal panel is HR, the General Manager and the Managing Director.
 * Developer is absent on purpose: holding the keys to the database is not the
 * same as having authority to execute an agreement, and a developer signature
 * on a construction contract would be indefensible if it were ever questioned.
 */
const SIGNATORY_ROLE_MATRIX: Record<OpsContractSignatoryRole, OpsUserRole[]> = {
  hr: ["human_resource", "hr"],
  general_manager: ["general_manager"],
  managing_director: ["managing_director"],
  // The counterparty signs on paper; witnesses are recorded, not clicked.
  counterparty: [],
  witness_internal: [],
  witness_counterparty: [],
};

/** The internal panel, in signing order. */
export const OPS_CONTRACT_INTERNAL_SIGNATORIES: OpsContractSignatoryRole[] = [
  "hr",
  "general_manager",
  "managing_director",
];

export function canViewOpsContracts(role: OpsUserRole) {
  return Array.from(new Set(VIEWER_ROLES)).includes(role);
}

/**
 * View gate for one contract. Kind-aware because the employment kind exposes
 * pay — the same split the `contracts_select_ops` RLS policy makes.
 */
export function canViewOpsContractKind(role: OpsUserRole, kind: OpsContractKind) {
  if (!canViewOpsContracts(role)) return false;
  if (kind === "employment") return EMPLOYMENT_VIEWER_ROLES.includes(role);
  return true;
}

export function canDraftOpsContract(role: OpsUserRole) {
  return DRAFT_ROLES.includes(role);
}

/** Employment contracts may only be drafted by people who can see pay. */
export function canDraftOpsContractKind(role: OpsUserRole, kind: OpsContractKind) {
  if (!canDraftOpsContract(role)) return false;
  if (kind === "employment") return EMPLOYMENT_VIEWER_ROLES.includes(role);
  return true;
}

export function canReviewOpsContract(role: OpsUserRole) {
  return REVIEW_ROLES.includes(role);
}

export function canApproveOpsContract(role: OpsUserRole) {
  return APPROVE_ROLES.includes(role);
}

export function canIssueOpsContract(role: OpsUserRole) {
  return ISSUE_ROLES.includes(role);
}

export function canTerminateOpsContract(role: OpsUserRole) {
  return APPROVE_ROLES.includes(role);
}

/**
 * Who may certify a stage as complete, which raises the payable.
 *
 * The people who can judge that the work is actually done — engineering and
 * the QS — plus leadership. Finance is absent on purpose: certifying is a
 * statement about the work, and the same person should not both certify it and
 * approve the payment it triggers.
 */
const CERTIFY_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "general_manager",
  "owner",
  "manager",
  "operations_manager",
  "projects_manager",
  "engineering_manager",
  "quantity_surveyor",
];

export function canCertifyOpsContractMilestone(role: OpsUserRole) {
  return CERTIFY_ROLES.includes(role);
}

/**
 * Whether this workspace role may occupy this signature slot.
 *
 * This is the fallback path only. The primary check is identity: a signature
 * row names `assigned_user_id`, and that person signing themselves is always
 * the intended route. The role match exists so a slot assigned to nobody in
 * particular can still be filled by the officer who holds that office.
 */
export function canSignOpsContractAs(
  role: OpsUserRole,
  signatoryRole: OpsContractSignatoryRole,
) {
  return SIGNATORY_ROLE_MATRIX[signatoryRole].includes(role);
}

/** Which slot, if any, this role would fill by virtue of office. */
export function opsContractSignatorySlotForRole(
  role: OpsUserRole,
): OpsContractSignatoryRole | null {
  return (
    OPS_CONTRACT_INTERNAL_SIGNATORIES.find((slot) =>
      canSignOpsContractAs(role, slot),
    ) ?? null
  );
}
