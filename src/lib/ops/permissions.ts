import { OPS_MODULES } from "@/lib/ops/constants";
import {
  isDeveloperRole,
  isEngineeringManagerRole,
  isGeneralManagerRole,
  isHumanResourceRole,
  isLeadershipRole,
  isManagingDirectorRole,
  type OpsAssignableStaffRole,
} from "@/lib/ops/roles";
import type { OpsModule, OpsReadyModule, OpsUserRole } from "@/lib/ops/types";

function isReadyOpsModule(module: OpsModule): module is OpsReadyModule {
  return module.status === "ready" && Boolean(module.href);
}

export function canManageOps(role: OpsUserRole) {
  return role !== "crew";
}

export function canManageStaff(role: OpsUserRole) {
  return (
    isDeveloperRole(role) ||
    isManagingDirectorRole(role) ||
    isGeneralManagerRole(role) ||
    isHumanResourceRole(role)
  );
}

export function canRecordAttendance(role: OpsUserRole) {
  return role !== "crew";
}

export function canApproveAttendance(role: OpsUserRole) {
  return canRecordAttendance(role) && role !== "engineering_intern";
}

// Site register: who can create/edit, archive, and hard-delete sites.
const SITE_MANAGE_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "owner",
  "general_manager",
  "manager",
  "operations_manager",
  "supervisor",
  "projects_manager",
];

export function canManageSites(role: OpsUserRole) {
  return SITE_MANAGE_ROLES.includes(role);
}

export function canArchiveSite(role: OpsUserRole) {
  return (
    isDeveloperRole(role) || isManagingDirectorRole(role) || isGeneralManagerRole(role)
  );
}

export function canDeleteSite(role: OpsUserRole) {
  return isDeveloperRole(role);
}

/**
 * Site budget (ZMW) is commercially sensitive. Leadership, the Operations
 * Manager, and Finance (Finance Manager + Accountant) may see the budget
 * figure; other roles that can otherwise manage sites still do not see the
 * money column or field.
 */
export function canViewSiteBudget(role: OpsUserRole) {
  return (
    isLeadershipRole(role) ||
    role === "operations_manager" ||
    role === "finance_manager" ||
    role === "accountant"
  );
}

/**
 * The project's actual budget is more sensitive than the planned budget —
 * limited to leadership and the Operations Manager, who owns delivery against
 * that budget.
 */
export function canViewSiteActualBudget(role: OpsUserRole) {
  return isLeadershipRole(role) || role === "operations_manager";
}

export function canViewSensitiveOpsFoundation(role: OpsUserRole) {
  return (
    isDeveloperRole(role) ||
    isManagingDirectorRole(role) ||
    isGeneralManagerRole(role)
  );
}

export function canOverrideApprovalDecision(role: OpsUserRole) {
  return isDeveloperRole(role);
}

/**
 * Back-office oversight tools (the system Activity Log and the Archive viewer):
 * leadership, the Operations Manager, and the Developer. These surface
 * company-wide records, so they sit above the usual per-department scoping.
 */
export function canViewOpsBackoffice(role: OpsUserRole) {
  return isLeadershipRole(role) || role === "operations_manager";
}

/**
 * Permanently deleting an archived record is irreversible and can collide with
 * foreign-key history, so it is restricted to the Developer — matching the
 * other hard-delete actions (payroll runs, BOQ documents).
 */
export function canDeleteOpsArchived(role: OpsUserRole) {
  return isDeveloperRole(role);
}

export function canCreateStaffRole(actorRole: OpsUserRole, targetRole: OpsAssignableStaffRole) {
  if (isDeveloperRole(actorRole) || isManagingDirectorRole(actorRole)) {
    return true;
  }

  if (isGeneralManagerRole(actorRole)) {
    return targetRole !== "managing_director";
  }

  if (isHumanResourceRole(actorRole)) {
    return targetRole !== "managing_director" && targetRole !== "general_manager";
  }

  return false;
}

export function canChangeStaffRole(
  actorRole: OpsUserRole,
  targetCurrentRole: OpsUserRole,
  desiredRole: OpsAssignableStaffRole,
) {
  // Developer-only protection: never re-role a developer; OpsAssignableStaffRole
  // already excludes "developer" so non-developers can't grant it.
  if (isDeveloperRole(targetCurrentRole) && !isDeveloperRole(actorRole)) {
    return false;
  }
  // Existing creation rules already encode who can assign which roles, so reuse them.
  if (!canCreateStaffRole(actorRole, desiredRole)) {
    return false;
  }
  // Demotions of leadership: same scope as deactivation (MD, GM are protected from HR).
  if (isManagingDirectorRole(targetCurrentRole) && !isDeveloperRole(actorRole)) {
    return false;
  }
  if (isGeneralManagerRole(targetCurrentRole) && isHumanResourceRole(actorRole)) {
    return false;
  }
  return true;
}

export function canDeactivateStaffRole(actorRole: OpsUserRole, targetRole: OpsUserRole) {
  if (isDeveloperRole(targetRole)) {
    return false;
  }

  if (isDeveloperRole(actorRole) || isManagingDirectorRole(actorRole)) {
    return true;
  }

  if (isGeneralManagerRole(actorRole)) {
    return !isManagingDirectorRole(targetRole);
  }

  if (isHumanResourceRole(actorRole)) {
    return !isManagingDirectorRole(targetRole) && !isGeneralManagerRole(targetRole);
  }

  return false;
}

export function canAccessOpsHref(role: OpsUserRole, href: string) {
  const opsModule = OPS_MODULES.find(
    (item) => isReadyOpsModule(item) && item.href === href,
  );
  return Boolean(opsModule && (isDeveloperRole(role) || opsModule.roles.includes(role)));
}

export function visibleOpsModules(role: OpsUserRole) {
  return OPS_MODULES.filter(
    (item): item is OpsReadyModule =>
      isReadyOpsModule(item) &&
      item.showInNavigation !== false &&
      (isDeveloperRole(role) || (item.navigationRoles ?? item.roles).includes(role)),
  );
}

export function visibleOpsRouteModules(role: OpsUserRole) {
  return OPS_MODULES.filter(
    (item): item is OpsReadyModule =>
      isReadyOpsModule(item) && (isDeveloperRole(role) || item.roles.includes(role)),
  );
}

export function visibleOpsModuleRegistry(role: OpsUserRole) {
  return OPS_MODULES.filter((item) => isDeveloperRole(role) || item.roles.includes(role));
}

// ---------------------------------------------------------------------------
// Sprint 8 — Role model rework aligned with the Pymble organogram.
// ---------------------------------------------------------------------------

/**
 * Executive dashboard = MD / GM / Developer / Owner only.
 * Operations Manager is intentionally NOT here — per the organogram they
 * oversee operations, they do not have company-wide executive visibility.
 */
export function canAccessExecutiveDashboard(role: OpsUserRole) {
  return isLeadershipRole(role);
}

/**
 * Cross-department leadership view = same as executive dashboard. Used to
 * gate widgets that show data from multiple departments at once.
 */
export function canSeeCrossDepartmentSummary(role: OpsUserRole) {
  return isLeadershipRole(role);
}

/**
 * Engineering Manager can manage engineers + their work allocation, receive
 * engineering reports, and escalate to MD/GM. MD / GM / Developer can also do
 * this by virtue of being above the Engineering Manager on the org chart.
 */
export function canManageEngineeringTeam(role: OpsUserRole) {
  return isLeadershipRole(role) || isEngineeringManagerRole(role);
}

/**
 * Recipients of routine engineering escalations (Daily Site Reports,
 * Engineer-submitted Material Requests, drawing reviews). EM is the first
 * line, MD/GM see them too so leadership has visibility.
 */
export function canReceiveEngineeringEscalations(role: OpsUserRole) {
  return isLeadershipRole(role) || isEngineeringManagerRole(role);
}
