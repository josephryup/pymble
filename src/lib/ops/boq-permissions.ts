import {
  isDeveloperRole,
  isGeneralManagerRole,
  isManagingDirectorRole,
} from "@/lib/ops/roles";
import type { OpsUserRole } from "@/lib/ops/types";

// BOQ ownership per Part 2.1 of pymble-ops-workflow-design.md.
//
// Strategy: BOQ is the Quantity Surveyor's tool, with Projects Manager and
// Leadership as fallback owners. Procurement Manager / Operations Manager can
// no longer create BOQs (that was the old `canManageOps` behaviour) — they read
// it to source materials, they don't author it.

const BOQ_CREATE_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "owner",
  "general_manager",
  "manager",
  "projects_manager",
  "quantity_surveyor",
];

// Roles allowed to edit a BOQ (header + lines) while the document is editable.
// Same as create — keeps ownership clear.
const BOQ_EDIT_ROLES: OpsUserRole[] = BOQ_CREATE_ROLES;

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

export type OpsBoqMutationTarget = {
  status: "draft" | "issued";
  deleted_at?: string | null;
  archived_at?: string | null;
};

export function canCreateBoq(role: OpsUserRole) {
  return BOQ_CREATE_ROLES.includes(role);
}

export function canEditBoq(role: OpsUserRole, document: OpsBoqMutationTarget) {
  // Lines can only be edited while draft. Issued documents must be replaced by
  // a new version (handled separately via a future supersede action).
  if (document.status !== "draft") {
    return false;
  }

  if (document.archived_at || document.deleted_at) {
    return false;
  }

  return BOQ_EDIT_ROLES.includes(role);
}

export function canIssueBoq(role: OpsUserRole, document: OpsBoqMutationTarget) {
  return canEditBoq(role, document);
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
