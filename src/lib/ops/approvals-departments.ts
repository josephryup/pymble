import type { OpsUserRole } from "@/lib/ops/types";

// A "department" is a tab on the Approvals page. Each tab is a filter over the
// `module_key` column of `approval_requests`. Roles that don't have business
// in a department don't see its tab (the My Queue tab is always available).
//
// Leadership (Developer / Managing Director / Owner / General Manager) sees
// every tab.

export type OpsApprovalsDepartmentKey =
  | "my_queue"
  | "operations"
  | "procurement"
  | "finance"
  | "hr"
  | "hse"
  | "commercial"
  | "all";

export type OpsApprovalsDepartment = {
  key: OpsApprovalsDepartmentKey;
  label: string;
  description: string;
  // The set of `module_key` values this tab includes. Empty list = "do not
  // filter" (used by my_queue and all).
  moduleKeys: string[];
};

export const OPS_APPROVALS_DEPARTMENTS: OpsApprovalsDepartment[] = [
  {
    key: "my_queue",
    label: "My queue",
    description: "Items awaiting your decision.",
    moduleKeys: [],
  },
  {
    key: "operations",
    label: "Operations",
    description: "Material and equipment requests, site delivery decisions.",
    moduleKeys: ["material_requests", "equipment", "fleet_logistics", "engineering_controls"],
  },
  {
    key: "procurement",
    label: "Procurement",
    description: "Purchase orders, supplier-related decisions.",
    moduleKeys: ["rfq_po", "suppliers", "stores_inventory", "delivery_exceptions"],
  },
  {
    key: "finance",
    label: "Finance",
    description: "Payments, budgets, payroll.",
    moduleKeys: ["payment_requests", "payroll", "project_budgets", "invoices", "documents"],
  },
  {
    key: "commercial",
    label: "Commercial",
    description: "Quantity Surveyor work — IPCs, variations, claims.",
    moduleKeys: ["commercial", "boq"],
  },
  {
    key: "hr",
    label: "Admin & HR",
    description: "Leave, recruitment, staff changes.",
    moduleKeys: ["employees", "recruitment", "staff"],
  },
  {
    key: "hse",
    label: "Health, Safety & Environment",
    description: "Risk assessments and audit findings awaiting decision.",
    moduleKeys: ["hse", "hse_compliance"],
  },
  {
    key: "all",
    label: "All",
    description: "Every approval visible to you.",
    moduleKeys: [],
  },
];

// Roles that should be able to see "everything" — i.e. all department tabs.
const LEADERSHIP_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "owner",
  "general_manager",
  "manager",
];

// Per-department role allowlists. A role that doesn't appear in any of these
// only sees the My Queue tab.
const DEPARTMENT_VISIBILITY: Partial<Record<OpsApprovalsDepartmentKey, OpsUserRole[]>> = {
  operations: [
    "operations_manager",
    "projects_manager",
    "engineering_manager",
    "supervisor",
    "engineer",
    "manager",
  ],
  procurement: [
    "procurement_manager",
    "procurement",
    "procurement_assistant",
  ],
  finance: [
    "finance_manager",
    "accountant",
  ],
  commercial: [
    "quantity_surveyor",
    "projects_manager",
    "engineering_manager",
  ],
  hr: [
    "human_resource",
    "hr",
    "admin_receptionist",
  ],
  hse: [
    "hse_officer",
    "hse_assistant_officer",
    "engineering_manager",
  ],
};

/**
 * Returns the set of department tabs this role should see on the Approvals
 * page. Leadership sees everything. Everyone else sees My Queue + the tabs
 * for their department(s). The "all" tab is reserved for leadership.
 */
export function getOpsApprovalsDepartmentsForRole(role: OpsUserRole): OpsApprovalsDepartment[] {
  if (LEADERSHIP_ROLES.includes(role)) {
    return OPS_APPROVALS_DEPARTMENTS;
  }

  const allowedKeys = new Set<OpsApprovalsDepartmentKey>(["my_queue"]);
  for (const [key, roles] of Object.entries(DEPARTMENT_VISIBILITY) as Array<
    [OpsApprovalsDepartmentKey, OpsUserRole[]]
  >) {
    if (roles.includes(role)) {
      allowedKeys.add(key);
    }
  }

  return OPS_APPROVALS_DEPARTMENTS.filter((dept) => allowedKeys.has(dept.key));
}

export function findOpsApprovalsDepartment(key: string | undefined | null) {
  const match = OPS_APPROVALS_DEPARTMENTS.find((dept) => dept.key === key);
  return match ?? null;
}
