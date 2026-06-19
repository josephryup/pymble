import type { OpsUserRole } from "@/lib/ops/types";

// Module keys used across the codebase to tag audit_events and notifications.
const COMMERCIAL_MODULES = ["boq", "invoices", "commercial", "payment_requests"];
const PROCUREMENT_MODULES = [
  "material_requests",
  "rfq_po",
  "stores_inventory",
  "delivery_exceptions",
  "suppliers",
];
const FINANCE_MODULES = [
  "invoices",
  "payment_requests",
  "payroll",
  "project_budgets",
  "commercial",
];
const HSE_MODULES = ["hse", "hse_compliance"];
const SITE_MODULES = [
  "sites",
  "daily_site_reports",
  "engineering_controls",
  "workers",
  "attendance",
  "material_requests",
];
const HR_MODULES = ["recruitment", "workers", "attendance", "staff"];
const LEADERSHIP_SEES_ALL: string[] | null = null;

// Map a role to the set of module_keys whose audit_events that role should see
// on the Workspace Timeline. Returning `null` means no filter — show everything.
// Each entry follows the principle from workflow design Part 9: people only
// see records that concern them.
export function getOpsTimelineModuleKeys(role: OpsUserRole): string[] | null {
  switch (role) {
    case "developer":
    case "managing_director":
    case "general_manager":
    case "owner":
    case "manager":
      return LEADERSHIP_SEES_ALL;

    case "operations_manager":
    case "projects_manager":
      return Array.from(
        new Set([
          ...SITE_MODULES,
          ...COMMERCIAL_MODULES,
          ...PROCUREMENT_MODULES,
          ...HSE_MODULES,
        ]),
      );

    case "engineer":
    case "supervisor":
      return Array.from(new Set([...SITE_MODULES, "material_requests"]));

    case "engineering_manager":
      // Engineering Manager oversees the whole engineering function, so they
      // see site delivery + commercial (to track Bill of Quantities cost
      // pressure) + HSE (incidents that affect engineering work).
      return Array.from(
        new Set([
          ...SITE_MODULES,
          ...COMMERCIAL_MODULES,
          ...HSE_MODULES,
          "engineering_controls",
        ]),
      );

    case "quantity_surveyor":
      return Array.from(new Set([...COMMERCIAL_MODULES, "boq", "material_requests"]));

    case "procurement_manager":
    case "procurement":
    case "procurement_assistant":
      return PROCUREMENT_MODULES;

    case "finance_manager":
    case "accountant":
      return FINANCE_MODULES;

    case "hse_officer":
    case "hse_assistant_officer":
      return Array.from(new Set([...HSE_MODULES, "daily_site_reports", "material_requests"]));

    case "human_resource":
    case "hr":
      return HR_MODULES;

    case "admin_receptionist":
      return ["staff", "documents"];

    case "crew":
      return ["attendance", "workers"];

    default:
      return LEADERSHIP_SEES_ALL;
  }
}
