import {
  isDeveloperRole,
  isGeneralManagerRole,
  isManagingDirectorRole,
} from "@/lib/ops/roles";
import type { OpsUserRole } from "@/lib/ops/types";

/**
 * Quotation access: leadership + accounts + HR + procurement.
 *
 * Mirrors `private.can_access_quotations()` in
 * 20260805090000_pymble_ops_quotations.sql — keep the two in step. Deliberately
 * excluded: accountant_intern and admin_receptionist (a quotation is a priced
 * commitment to a client), and site roles, who have no reason to quote.
 */
const QUOTATION_ROLES: OpsUserRole[] = [
  // Leadership
  "developer",
  "managing_director",
  "general_manager",
  "owner",
  "manager",
  // Accounts
  "finance_manager",
  "accountant",
  // Human resources
  "human_resource",
  "hr",
  // Procurement
  "procurement_manager",
  "procurement",
  "procurement_assistant",
];

export function canViewOpsQuotations(role: OpsUserRole) {
  return QUOTATION_ROLES.includes(role);
}

/** Create, edit lines, and move a quotation through its statuses. */
export function canManageOpsQuotations(role: OpsUserRole) {
  return QUOTATION_ROLES.includes(role);
}

/**
 * Archive is the only destructive action, so it stays with leadership —
 * everyone else can decline or let a quotation expire instead.
 */
export function canArchiveOpsQuotation(role: OpsUserRole) {
  // isManagingDirectorRole covers owner; isGeneralManagerRole covers manager.
  return isDeveloperRole(role) || isManagingDirectorRole(role) || isGeneralManagerRole(role);
}

/** A quotation can only be edited before it goes out to the client. */
export function canEditOpsQuotation(
  role: OpsUserRole,
  quotation: { status: string; archived_at?: string | null },
) {
  if (quotation.archived_at) return false;
  if (quotation.status !== "draft") return false;
  return canManageOpsQuotations(role);
}
