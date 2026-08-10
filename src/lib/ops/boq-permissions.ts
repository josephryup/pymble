import {
  isDeveloperRole,
  isGeneralManagerRole,
  isManagingDirectorRole,
} from "@/lib/ops/roles";
import type { OpsUserRole } from "@/lib/ops/types";

// BOQ ownership per Part 2.1 of pymble-ops-workflow-design.md.
//
// Strategy: BOQ is the Quantity Surveyor's tool, with Engineering, Projects
// Manager and Leadership as fallback owners. Procurement Manager / Operations
// Manager can no longer create BOQs (that was the old `canManageOps`
// behaviour) — they read it to source materials, they don't author it.
//
// Site engineers take off their own quantities, so they author schedules
// alongside the QS rather than queueing behind the Projects Manager. Issuing
// stays narrower (see BOQ_ISSUE_ROLES) because issue is what generates the
// project budget.

const BOQ_CREATE_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "owner",
  "general_manager",
  "manager",
  "projects_manager",
  "quantity_surveyor",
  "engineering_manager",
  "engineer",
];

// Roles allowed to edit a BOQ (header + lines) while the document is editable.
// Same as create — keeps ownership clear.
const BOQ_EDIT_ROLES: OpsUserRole[] = BOQ_CREATE_ROLES;

// Issuing a priced schedule generates the project budget, so it stays with the
// commercial owners even though Engineering can author and revise the document.
const BOQ_ISSUE_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "owner",
  "general_manager",
  "manager",
  "projects_manager",
  "quantity_surveyor",
];

// Soft-archive (sets archived_at). Reversible by Developer / Managing Director.
const BOQ_ARCHIVE_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "owner",
  "general_manager",
  "manager",
  "operations_manager",
  "projects_manager",
];

// Procurement prices the schedule (unit_rate + transport estimate per line)
// once QS has submitted it. Same role set as material request pricing
// (MATERIAL_REQUEST_PRICING_ROLES in material-request-permissions.ts) — one
// department, one gate.
const BOQ_PRICING_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "owner",
  "procurement_manager",
  "procurement",
  "procurement_assistant",
];

export type OpsBoqMutationTarget = {
  status: "draft" | "pricing_pending" | "priced" | "issued";
  deleted_at?: string | null;
  archived_at?: string | null;
  superseded_at?: string | null;
};

export function canCreateBoq(role: OpsUserRole) {
  return BOQ_CREATE_ROLES.includes(role);
}

export function canEditBoq(role: OpsUserRole, document: OpsBoqMutationTarget) {
  // Lines (quantities, spec, classification, dates) can only be edited by QS
  // while draft. Issued documents must be replaced by a new version (handled
  // separately via a future supersede action). Once submitted for pricing,
  // only Procurement can touch the document (see canAttachBoqPricing).
  if (document.status !== "draft") {
    return false;
  }

  if (document.archived_at || document.deleted_at) {
    return false;
  }

  return BOQ_EDIT_ROLES.includes(role);
}

export function canSubmitBoqForPricing(role: OpsUserRole, document: OpsBoqMutationTarget) {
  // Same owners as edit, one step later: draft → pricing_pending.
  return canEditBoq(role, document);
}

export function canAttachBoqPricing(role: OpsUserRole, document: OpsBoqMutationTarget) {
  if (document.archived_at || document.deleted_at) {
    return false;
  }

  // Procurement can keep adjusting prices while priced (before issue) in case
  // a supplier quote changes, same latitude Material Request pricing gets.
  if (document.status !== "pricing_pending" && document.status !== "priced") {
    return false;
  }

  return BOQ_PRICING_ROLES.includes(role);
}

export function canIssueBoq(role: OpsUserRole, document: OpsBoqMutationTarget) {
  // Mandatory-procurement gate: a schedule cannot be issued until Procurement
  // has priced every line. QS / Projects Manager / leadership still perform
  // the final sign-off.
  if (document.status !== "priced") {
    return false;
  }

  if (document.archived_at || document.deleted_at) {
    return false;
  }

  return BOQ_ISSUE_ROLES.includes(role);
}

/**
 * Revise an issued schedule (audit B1). Produces a new draft that supersedes
 * this one — the issued document itself is never edited, so history stays
 * intact. Same owners as authoring: this is a QS act, not a procurement one.
 */
export function canReviseBoq(role: OpsUserRole, document: OpsBoqMutationTarget) {
  if (document.status !== "issued") {
    return false;
  }

  if (document.archived_at || document.deleted_at || document.superseded_at) {
    return false;
  }

  return BOQ_EDIT_ROLES.includes(role);
}

export function canArchiveBoq(role: OpsUserRole) {
  return BOQ_ARCHIVE_ROLES.includes(role);
}

// Hard delete — sets deleted_at. Developer only. Should be used near-never
// because of the FK churn (BOQ line items, invoices, etc.).
export function canDeleteBoq(role: OpsUserRole) {
  return isDeveloperRole(role);
}

export function canViewAllBoqs(role: OpsUserRole) {
  return (
    isDeveloperRole(role) ||
    isManagingDirectorRole(role) ||
    isGeneralManagerRole(role) ||
    BOQ_CREATE_ROLES.includes(role)
  );
}
