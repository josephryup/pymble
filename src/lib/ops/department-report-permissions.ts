import {
  isDeveloperRole,
  isGeneralManagerRole,
  isLeadershipRole,
  isManagingDirectorRole,
} from "@/lib/ops/roles";
import type { OpsUserRole } from "@/lib/ops/types";

export type OpsDepartmentKey =
  | "operations"
  | "engineering"
  | "procurement"
  | "finance"
  | "commercial"
  | "hse"
  | "hr"
  | "executive";

export const OPS_DEPARTMENT_LABELS: Record<OpsDepartmentKey, string> = {
  operations: "Operations",
  engineering: "Engineering",
  procurement: "Procurement",
  finance: "Finance",
  commercial: "Commercial",
  hse: "Health, Safety and Environment",
  hr: "Human Resources",
  executive: "Executive",
};

/**
 * Map each role to a department key. Cross-department leakage is prevented
 * by filtering reports to (own department) ∪ (departments under your line)
 * for the viewer.
 */
const ROLE_DEPARTMENT_MAP: Partial<Record<OpsUserRole, OpsDepartmentKey>> = {
  operations_manager: "operations",
  supervisor: "operations",
  admin_receptionist: "operations",
  projects_manager: "engineering",
  engineering_manager: "engineering",
  engineer: "engineering",
  procurement_manager: "procurement",
  procurement: "procurement",
  procurement_assistant: "procurement",
  quantity_surveyor: "commercial",
  finance_manager: "finance",
  accountant: "finance",
  hse_officer: "hse",
  hse_assistant_officer: "hse",
  human_resource: "hr",
  hr: "hr",
  managing_director: "executive",
  owner: "executive",
  general_manager: "executive",
  manager: "executive",
  developer: "executive",
};

export function departmentForRole(role: OpsUserRole): OpsDepartmentKey | null {
  return ROLE_DEPARTMENT_MAP[role] ?? null;
}

/**
 * Heads who can submit a department report on behalf of their department.
 * Reports leave the head's hands as 'submitted' and route up to MD + GM.
 */
const DEPARTMENT_HEAD_ROLES: OpsUserRole[] = [
  "operations_manager",
  "projects_manager",
  "engineering_manager",
  "procurement_manager",
  "finance_manager",
  "hse_officer",
  "human_resource",
  "hr",
  "quantity_surveyor",
];

export function canSubmitDepartmentReport(role: OpsUserRole) {
  if (isLeadershipRole(role)) return true;
  return DEPARTMENT_HEAD_ROLES.includes(role);
}

/**
 * Reviewing = acknowledging or requesting revisions. MD + GM + Developer.
 */
export function canReviewDepartmentReport(role: OpsUserRole) {
  return (
    isDeveloperRole(role) ||
    isManagingDirectorRole(role) ||
    isGeneralManagerRole(role)
  );
}

/**
 * Visibility: a viewer can see a report when
 *   - they are leadership (everything routes up to leadership), OR
 *   - the report belongs to their own department.
 *
 * Engineers see Engineering reports. HR sees HR reports. Finance sees
 * Finance reports. Cross-department leakage is blocked here.
 */
export function canViewDepartmentReport(
  role: OpsUserRole,
  reportDepartment: OpsDepartmentKey,
) {
  if (isLeadershipRole(role)) return true;
  const own = departmentForRole(role);
  return own !== null && own === reportDepartment;
}

/**
 * List of departments a viewer can list/select for new reports. Heads
 * see only their own; leadership see all.
 */
export function listAccessibleDepartments(role: OpsUserRole): OpsDepartmentKey[] {
  if (isLeadershipRole(role)) {
    return Object.keys(OPS_DEPARTMENT_LABELS) as OpsDepartmentKey[];
  }
  const own = departmentForRole(role);
  return own ? [own] : [];
}
