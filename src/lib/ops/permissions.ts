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
