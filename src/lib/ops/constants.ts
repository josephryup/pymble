import { COMPANY, CONTACT } from "@/lib/constants";
import type { OpsModule, OpsUserRole } from "@/lib/ops/types";

export const OPS_HOST = "ops.pymbleconstruction.com";

export const OPS_BRAND = {
  name: "Pymble Operations",
  companyName: COMPANY.legalName,
  shortName: "Pymble Ops",
  supportEmail: CONTACT.email,
  supportPhone: CONTACT.phone.primary,
} as const;

const OPS_TEMPORARY_OPERATIONAL_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "general_manager",
  "human_resource",
  "operations_manager",
  "projects_manager",
  "procurement_manager",
  "quantity_surveyor",
  "procurement",
  "procurement_assistant",
  "finance_manager",
  "accountant",
  "engineer",
  "hse_officer",
  "hse_assistant_officer",
  "admin_receptionist",
  "owner",
  "hr",
  "manager",
  "supervisor",
];
const OPS_STAFF_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "general_manager",
  "human_resource",
  "owner",
  "hr",
  "manager",
];

export const OPS_MODULES: OpsModule[] = [
  {
    title: "Overview",
    description: "One workspace for active sites, approvals, payroll exposure, and project controls.",
    href: "/ops",
    roles: OPS_TEMPORARY_OPERATIONAL_ROLES,
    status: "ready",
  },
  {
    title: "Staff",
    description: "Create invite-only Pymble staff accounts and manage internal access roles.",
    href: "/ops/staff",
    roles: OPS_STAFF_ROLES,
    status: "ready",
  },
  {
    title: "Sites",
    description: "Manage project sites, budgets, supervisors, locations, and live status.",
    href: "/ops/sites",
    roles: OPS_TEMPORARY_OPERATIONAL_ROLES,
    status: "ready",
  },
  {
    title: "Workers",
    description: "Crew profiles, trades, daily rates, phone numbers, and site assignment.",
    href: "/ops/workers",
    roles: OPS_TEMPORARY_OPERATIONAL_ROLES,
    status: "ready",
  },
  {
    title: "Attendance",
    description: "Daily timesheets, approval workflows, GPS labels, and correction history.",
    href: "/ops/attendance",
    roles: OPS_TEMPORARY_OPERATIONAL_ROLES,
    status: "ready",
  },
  {
    title: "Payroll",
    description: "Cash advances, approved payroll runs, and payout status tracking.",
    href: "/ops/payroll",
    roles: OPS_TEMPORARY_OPERATIONAL_ROLES,
    status: "ready",
  },
  {
    title: "BOQ",
    description: "BOQ documents, line items, budgeted totals, actual quantities, and PDF exports.",
    href: "/ops/boq",
    roles: OPS_TEMPORARY_OPERATIONAL_ROLES,
    status: "ready",
  },
  {
    title: "Invoices",
    description: "Pymble invoice numbers, VAT, client TPIN records, status tracking, and PDF exports.",
    href: "/ops/invoices",
    roles: OPS_TEMPORARY_OPERATIONAL_ROLES,
    status: "ready",
  },
  {
    title: "Photos",
    description: "Secure site photo logs for progress, deliveries, and safety records.",
    href: "/ops/photos",
    roles: OPS_TEMPORARY_OPERATIONAL_ROLES,
    status: "ready",
  },
  {
    title: "Settings",
    description: "Manage the Pymble organization profile, HQ address, map position, and invoice defaults.",
    href: "/ops/settings",
    roles: OPS_TEMPORARY_OPERATIONAL_ROLES,
    status: "ready",
  },
];
