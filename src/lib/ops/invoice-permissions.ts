import { isDeveloperRole, isManagingDirectorRole } from "@/lib/ops/roles";
import type { OpsUserRole } from "@/lib/ops/types";

// Invoice ownership per Part 4 of the workflow design.

const INVOICE_CREATE_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "owner",
  "general_manager",
  "manager",
  "finance_manager",
  "accountant",
  "quantity_surveyor",
];

const INVOICE_EDIT_ROLES: OpsUserRole[] = INVOICE_CREATE_ROLES;

const INVOICE_SEND_PAY_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "owner",
  "general_manager",
  "manager",
  "finance_manager",
  "accountant",
];

// Void / cancel — Finance Manager + MD + Developer.
const INVOICE_VOID_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "owner",
  "finance_manager",
];

export type OpsInvoiceMutationTarget = {
  status: "draft" | "sent" | "paid";
  cancelled_at?: string | null;
  archived_at?: string | null;
  deleted_at?: string | null;
};

export function canCreateInvoice(role: OpsUserRole) {
  return INVOICE_CREATE_ROLES.includes(role);
}

export function canEditInvoice(role: OpsUserRole, invoice: OpsInvoiceMutationTarget) {
  if (invoice.status !== "draft") return false;
  if (invoice.cancelled_at || invoice.archived_at || invoice.deleted_at) return false;
  return INVOICE_EDIT_ROLES.includes(role);
}

export function canSendInvoice(role: OpsUserRole, invoice: OpsInvoiceMutationTarget) {
  if (invoice.status !== "draft") return false;
  if (invoice.cancelled_at || invoice.archived_at || invoice.deleted_at) return false;
  return INVOICE_SEND_PAY_ROLES.includes(role);
}

export function canMarkInvoicePaid(role: OpsUserRole, invoice: OpsInvoiceMutationTarget) {
  if (invoice.status !== "sent") return false;
  if (invoice.cancelled_at || invoice.archived_at || invoice.deleted_at) return false;
  return INVOICE_SEND_PAY_ROLES.includes(role);
}

export function canVoidInvoice(role: OpsUserRole, invoice: OpsInvoiceMutationTarget) {
  // Paid invoices can't be voided — they need a credit note instead.
  if (invoice.status === "paid") return false;
  if (invoice.cancelled_at || invoice.archived_at || invoice.deleted_at) return false;
  return INVOICE_VOID_ROLES.includes(role);
}

export function canArchiveInvoice(role: OpsUserRole, invoice: OpsInvoiceMutationTarget) {
  // Only archive once paid or voided.
  if (invoice.status !== "paid" && !invoice.cancelled_at) return false;
  return isDeveloperRole(role) || isManagingDirectorRole(role);
}

export function canDeleteInvoice(role: OpsUserRole) {
  return isDeveloperRole(role);
}
