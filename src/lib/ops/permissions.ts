import { OPS_MODULES } from "@/lib/ops/constants";
import {
  isDeveloperRole,
  isEngineeringManagerRole,
  isGeneralManagerRole,
  isHumanResourceRole,
  isItManagerRole,
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
    isHumanResourceRole(role) ||
    // Provisioning and deactivating accounts is IT's job (audit §6). Which
    // ROLES the IT Manager may hand out is bounded separately in
    // canCreateStaffRole — being able to create an account is not the same as
    // being able to decide what that account may do.
    isItManagerRole(role)
  );
}

export function canRecordAttendance(role: OpsUserRole) {
  return role !== "crew";
}

export function canApproveAttendance(role: OpsUserRole) {
  return canRecordAttendance(role) && role !== "engineering_intern";
}

/**
 * Roles senior enough to approve an attendance record they created themselves.
 *
 * Attendance approval is the gate into payroll, and workers are on a fixed daily
 * rate — so a supervisor who can both record and approve can create pay
 * unopposed. Everyone else needs a second pair of eyes (audit finding A1).
 */
const ATTENDANCE_SELF_APPROVAL_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "owner",
  "general_manager",
  "manager",
  "operations_manager",
  "projects_manager",
];

/**
 * Whether `role` may approve an attendance record it created. Records created by
 * someone else are governed by `canApproveAttendance` alone.
 */
export function canSelfApproveAttendance(role: OpsUserRole) {
  return canApproveAttendance(role) && ATTENDANCE_SELF_APPROVAL_ROLES.includes(role);
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

  /**
   * IT provisions accounts, but does not decide authority (audit §6).
   *
   * The distinction matters: creating a login so someone can do their job is
   * an IT function; granting the ability to approve money or run the company
   * is a business decision. If IT could mint a Managing Director or a Finance
   * Manager, whoever holds the IT account would hold unlimited authority over
   * spend by simply creating themselves a second account — a textbook
   * segregation-of-duties failure, and one that would be invisible because IT
   * legitimately administers the system.
   *
   * So IT may create the operational roles it supports, and no others. Anyone
   * needing a leadership or finance role gets it from the MD, GM or HR.
   *
   * Written as an ALLOWLIST, deliberately. A denylist returns "permitted" for
   * anything it has not heard of — including `developer`, which is excluded
   * from OpsAssignableStaffRole at the type level but is just a string at
   * runtime, and including every role added to the system in future. Listing
   * what IT may grant means a new role is denied until someone decides
   * otherwise, which is the right default for a privilege boundary.
   */
  if (isItManagerRole(actorRole)) {
    const IT_ASSIGNABLE_ROLES: OpsAssignableStaffRole[] = [
      "operations_manager",
      "projects_manager",
      "engineering_manager",
      "procurement_manager",
      "quantity_surveyor",
      "procurement",
      "procurement_assistant",
      "engineer",
      "engineering_intern",
      "hse_officer",
      "hse_assistant_officer",
      "admin_receptionist",
      "it_manager",
    ];
    return IT_ASSIGNABLE_ROLES.includes(targetRole);
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

  // Offboarding is core IT work — cutting access on someone's last day is the
  // whole point of IT provisioning (audit §6). Bounded to the same roles IT may
  // create, so IT can never disable the people who oversee it.
  if (isItManagerRole(actorRole)) {
    return canCreateStaffRole(actorRole, targetRole as OpsAssignableStaffRole);
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
