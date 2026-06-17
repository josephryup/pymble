import { OPS_MODULES } from "@/lib/ops/constants";
import {
  isDeveloperRole,
  isGeneralManagerRole,
  isHumanResourceRole,
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
