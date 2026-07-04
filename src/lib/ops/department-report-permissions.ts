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
  | "it"
  | "executive";

export const OPS_DEPARTMENT_LABELS: Record<OpsDepartmentKey, string> = {
  operations: "Operations",
  engineering: "Engineering",
  procurement: "Procurement",
  finance: "Finance",
  commercial: "Commercial",
  hse: "Health, Safety and Environment",
  hr: "Human Resources",
  it: "Information Technology",
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
  it_manager: "it",
  managing_director: "executive",
  owner: "executive",
  general_manager: "executive",
  manager: "executive",
  developer: "executive",
};

export function departmentForRole(role: OpsUserRole): OpsDepartmentKey | null {
  return ROLE_DEPARTMENT_MAP[role] ?? null;
}

export type OpsDepartmentReportScope = "individual" | "compiled";

export type OpsDepartmentReportingRoute = {
  /** Roles that file tier-1 individual reports for this department. */
  contributorRoles: OpsUserRole[];
  /**
   * Line managers who review the individual reports AND file the compiled
   * department report upward.
   */
  compilerRoles: OpsUserRole[];
  /** Leadership the compiled report routes to for final review. */
  finalReviewerRoles: OpsUserRole[];
};

/**
 * The weekly reporting chain, per the PCL organogram:
 * - Engineers and HSE report to the Projects Manager, who compiles for the MD.
 * - Procurement officers report to the Procurement Manager, who compiles for
 *   the GM and MD.
 * - Operations Manager, Accountant/Finance, QS, HR, and IT file their
 *   department report straight up (no tier-1 contributors).
 */
export const OPS_DEPARTMENT_REPORTING_ROUTES: Record<
  OpsDepartmentKey,
  OpsDepartmentReportingRoute
> = {
  operations: {
    contributorRoles: ["supervisor"],
    compilerRoles: ["operations_manager"],
    finalReviewerRoles: ["managing_director", "projects_manager", "general_manager"],
  },
  engineering: {
    contributorRoles: ["engineer"],
    compilerRoles: ["projects_manager", "engineering_manager"],
    finalReviewerRoles: ["managing_director"],
  },
  hse: {
    contributorRoles: ["hse_officer", "hse_assistant_officer"],
    compilerRoles: ["projects_manager"],
    finalReviewerRoles: ["managing_director", "general_manager"],
  },
  procurement: {
    contributorRoles: ["procurement", "procurement_assistant"],
    compilerRoles: ["procurement_manager"],
    finalReviewerRoles: ["general_manager", "managing_director", "projects_manager"],
  },
  finance: {
    contributorRoles: [],
    compilerRoles: ["accountant", "finance_manager"],
    finalReviewerRoles: ["managing_director", "general_manager"],
  },
  // QS follows the engineering workflow: individual report to the Projects
  // Manager, who compiles commercial upward for the MD.
  commercial: {
    contributorRoles: ["quantity_surveyor"],
    compilerRoles: ["projects_manager"],
    finalReviewerRoles: ["managing_director"],
  },
  hr: {
    contributorRoles: [],
    compilerRoles: ["human_resource", "hr"],
    finalReviewerRoles: ["managing_director", "general_manager"],
  },
  it: {
    contributorRoles: [],
    compilerRoles: ["it_manager"],
    finalReviewerRoles: ["managing_director"],
  },
  executive: {
    contributorRoles: [],
    compilerRoles: [],
    finalReviewerRoles: [],
  },
};

/** Departments whose compiled report this role files (PM covers eng + HSE). */
export function departmentsCompiledBy(role: OpsUserRole): OpsDepartmentKey[] {
  return (Object.keys(OPS_DEPARTMENT_REPORTING_ROUTES) as OpsDepartmentKey[]).filter(
    (department) => OPS_DEPARTMENT_REPORTING_ROUTES[department].compilerRoles.includes(role),
  );
}

/** Departments whose individual reports this role contributes to. */
export function departmentsContributedBy(role: OpsUserRole): OpsDepartmentKey[] {
  return (Object.keys(OPS_DEPARTMENT_REPORTING_ROUTES) as OpsDepartmentKey[]).filter(
    (department) => OPS_DEPARTMENT_REPORTING_ROUTES[department].contributorRoles.includes(role),
  );
}

/**
 * Departments whose COMPILED reports route to this role for final review
 * (e.g. the Projects Manager receives the Operations and Procurement
 * compiled reports).
 */
export function departmentsFinallyReviewedBy(role: OpsUserRole): OpsDepartmentKey[] {
  return (Object.keys(OPS_DEPARTMENT_REPORTING_ROUTES) as OpsDepartmentKey[]).filter(
    (department) => OPS_DEPARTMENT_REPORTING_ROUTES[department].finalReviewerRoles.includes(role),
  );
}

/** What this role may file: [department, scope] pairs. Leadership files anything compiled. */
export function reportFilingOptions(
  role: OpsUserRole,
): Array<{ department: OpsDepartmentKey; scope: OpsDepartmentReportScope }> {
  if (isLeadershipRole(role)) {
    return (Object.keys(OPS_DEPARTMENT_LABELS) as OpsDepartmentKey[]).map((department) => ({
      department,
      scope: "compiled" as const,
    }));
  }
  return [
    ...departmentsCompiledBy(role).map((department) => ({
      department,
      scope: "compiled" as const,
    })),
    ...departmentsContributedBy(role).map((department) => ({
      department,
      scope: "individual" as const,
    })),
  ];
}

export function canFileDepartmentReport(
  role: OpsUserRole,
  department: OpsDepartmentKey,
  scope: OpsDepartmentReportScope,
) {
  return reportFilingOptions(role).some(
    (option) => option.department === department && option.scope === scope,
  );
}

/** Roles a submitted report routes to: line manager for tier 1, leadership for compiled. */
export function reviewerRolesForReport(report: {
  department: OpsDepartmentKey;
  scope: OpsDepartmentReportScope;
}): OpsUserRole[] {
  const route = OPS_DEPARTMENT_REPORTING_ROUTES[report.department];
  return report.scope === "individual" ? route.compilerRoles : route.finalReviewerRoles;
}

export function canSubmitDepartmentReport(role: OpsUserRole) {
  if (isLeadershipRole(role)) return true;
  return reportFilingOptions(role).length > 0;
}

/**
 * Record-level review gate. MD/GM/Developer can always review; a compiler
 * (e.g. Projects Manager) reviews the INDIVIDUAL reports routed to them; a
 * named final reviewer reviews the COMPILED reports routed to them (e.g. the
 * PM on the Operations compiled report). A compiler's own compiled report
 * still needs its final reviewers.
 */
export function canReviewDepartmentReportRecord(
  role: OpsUserRole,
  report: { department: OpsDepartmentKey; scope: OpsDepartmentReportScope },
) {
  if (canReviewDepartmentReport(role)) return true;
  const route = OPS_DEPARTMENT_REPORTING_ROUTES[report.department];
  return report.scope === "individual"
    ? route.compilerRoles.includes(role)
    : route.finalReviewerRoles.includes(role);
}

/**
 * Record-level visibility — "isolated" per the reporting chain:
 * - Leadership sees everything.
 * - A compiler sees every report in the departments they compile (their own
 *   department included).
 * - A contributor sees their OWN individual reports plus their department's
 *   compiled reports — not their colleagues' individual reports.
 */
export function canViewDepartmentReportRecord(
  role: OpsUserRole,
  userId: string,
  report: {
    created_by: string | null;
    department: OpsDepartmentKey;
    scope: OpsDepartmentReportScope;
    submitted_by: string | null;
  },
) {
  if (isLeadershipRole(role)) return true;
  if (report.created_by === userId || report.submitted_by === userId) return true;

  const own = departmentForRole(role);
  const compiled = departmentsCompiledBy(role);
  if (compiled.includes(report.department)) return true;
  if (report.scope === "compiled" && departmentsFinallyReviewedBy(role).includes(report.department)) {
    // Named final reviewers see the compiled reports routed to them.
    return true;
  }
  if (own === report.department) {
    // Department mates see the compiled report, never each other's tier-1s.
    return report.scope === "compiled";
  }
  return false;
}

/**
 * Departments expected to file reports on the weekly cadence. Executive is
 * excluded — leadership reviews reports, it does not report to itself.
 */
export function departmentsExpectedToReport(): OpsDepartmentKey[] {
  return (Object.keys(OPS_DEPARTMENT_LABELS) as OpsDepartmentKey[]).filter(
    (department) => department !== "executive",
  );
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
 * Department-level visibility: leadership sees all; everyone else sees their
 * own department plus any department whose reports route THROUGH them (the
 * Projects Manager compiles Engineering and HSE, so they see both).
 * Cross-department leakage is blocked here; record-level isolation between
 * colleagues is enforced by canViewDepartmentReportRecord.
 */
export function canViewDepartmentReport(
  role: OpsUserRole,
  reportDepartment: OpsDepartmentKey,
) {
  if (isLeadershipRole(role)) return true;
  if (departmentsCompiledBy(role).includes(reportDepartment)) return true;
  if (departmentsFinallyReviewedBy(role).includes(reportDepartment)) return true;
  const own = departmentForRole(role);
  return own !== null && own === reportDepartment;
}

/**
 * List of departments a viewer can browse. Leadership sees all; managers see
 * their own, the departments they compile, and the departments whose
 * compiled reports route to them; contributors see their own.
 */
export function listAccessibleDepartments(role: OpsUserRole): OpsDepartmentKey[] {
  if (isLeadershipRole(role)) {
    return Object.keys(OPS_DEPARTMENT_LABELS) as OpsDepartmentKey[];
  }
  const departments = new Set<OpsDepartmentKey>([
    ...departmentsCompiledBy(role),
    ...departmentsFinallyReviewedBy(role),
  ]);
  const own = departmentForRole(role);
  if (own) departments.add(own);
  return Array.from(departments);
}
