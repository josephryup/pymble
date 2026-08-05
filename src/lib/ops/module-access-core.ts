import { OPS_MODULES } from "@/lib/ops/constants";
import { isDeveloperRole, isLeadershipRole, isManagingDirectorRole } from "@/lib/ops/roles";
import type { OpsModule, OpsUserRole } from "@/lib/ops/types";

/**
 * Pure core of the role → module access matrix.
 *
 * Kept free of `requireOpsUser`, Supabase and `next/*` so the rules below can
 * be tested directly. Everything that touches the database lives in
 * module-access.ts; everything that decides policy lives here.
 */

/** One override row: this module/role pair differs from the code default. */
export type OpsModuleAccessOverride = {
  module_key: string;
  role: OpsUserRole;
  can_access: boolean;
};

/** Resolved overrides, keyed `${module_key}::${role}`. */
export type OpsModuleAccessMap = ReadonlyMap<string, boolean>;

export function opsModuleAccessKey(moduleKey: string, role: OpsUserRole) {
  return `${moduleKey}::${role}`;
}

export function buildOpsModuleAccessMap(
  overrides: readonly OpsModuleAccessOverride[],
): OpsModuleAccessMap {
  return new Map(
    overrides.map((row) => [opsModuleAccessKey(row.module_key, row.role), row.can_access]),
  );
}

/** The empty map — "no overrides", i.e. exactly the code defaults. */
export const OPS_NO_MODULE_OVERRIDES: OpsModuleAccessMap = new Map();

/**
 * Modules whose access is a business decision rather than an IT one.
 *
 * The existing `canCreateStaffRole` control stops IT minting a Finance Manager
 * or an MD, on the grounds that provisioning an account is an IT function
 * while granting authority over money is not (audit §6). An editable module
 * matrix reopens exactly that hole from the other side: if IT could tick
 * "it_manager → Staff payroll", it would reach the payroll module without ever
 * touching a role. Same failure, different door.
 *
 * So IT may not WIDEN access to these groups. Narrowing is always allowed —
 * removing your own access is not an escalation.
 */
const SENSITIVE_MODULE_GROUPS = new Set(["finance", "hr", "executive", "commercial"]);

export function isSensitiveOpsModule(module: OpsModule) {
  return SENSITIVE_MODULE_GROUPS.has(module.group);
}

/**
 * Who may open the module-access screen: the IT Manager, the Managing Director
 * (and its `owner` alias), and the Developer.
 *
 * Deliberately NOT the General Manager. This mirrors OPS_IT_ROLES, where the IT
 * area is role-isolated because IT reports to the MD — widening it here would
 * quietly disagree with the rest of the IT module.
 */
export function canViewOpsModuleAccess(role: OpsUserRole) {
  return isDeveloperRole(role) || isManagingDirectorRole(role) || role === "it_manager";
}

/**
 * Whether `actorRole` may set `targetRole`'s access to `module` to `next`.
 *
 * Returns a reason string when refused so the UI can explain itself rather
 * than silently disabling a checkbox.
 */
export function canEditOpsModuleAccess(input: {
  actorRole: OpsUserRole;
  module: OpsModule;
  targetRole: OpsUserRole;
  next: boolean;
}): { allowed: true } | { allowed: false; reason: string } {
  const { actorRole, module, targetRole, next } = input;

  if (!canViewOpsModuleAccess(actorRole)) {
    return { allowed: false, reason: "Your role cannot change module access." };
  }

  // The Developer role is the maintenance backstop and bypasses every module
  // check at runtime. Letting it be edited would imply a control that does not
  // exist, which is worse than no control.
  if (targetRole === "developer") {
    return {
      allowed: false,
      reason: "Developer access is the maintenance backstop and cannot be edited.",
    };
  }

  // Nobody may remove the Managing Director from a module. Otherwise the one
  // person who can always put it back can be locked out — including out of
  // this screen.
  if (!next && isManagingDirectorRole(targetRole)) {
    return {
      allowed: false,
      reason: "The Managing Director cannot be removed from a module.",
    };
  }

  // Developer and MD may set anything the two guards above allow.
  if (isDeveloperRole(actorRole) || isManagingDirectorRole(actorRole)) {
    return { allowed: true };
  }

  // IT Manager from here down.
  if (isSensitiveOpsModule(module) && next) {
    return {
      allowed: false,
      reason:
        "IT cannot grant access to finance, HR, commercial or executive modules — ask the Managing Director.",
    };
  }

  if (isLeadershipRole(targetRole) || targetRole === "finance_manager") {
    return {
      allowed: false,
      reason: "IT cannot change leadership or Finance Manager access.",
    };
  }

  return { allowed: true };
}

/**
 * Does `role` reach `module`, accounting for overrides?
 *
 * The Developer bypass is checked first and is not overridable — same rule the
 * static registry has always had.
 */
export function resolveOpsModuleAccess(
  role: OpsUserRole,
  module: OpsModule,
  overrides: OpsModuleAccessMap = OPS_NO_MODULE_OVERRIDES,
) {
  if (isDeveloperRole(role)) {
    return true;
  }

  const override = overrides.get(opsModuleAccessKey(module.id, role));

  return override ?? module.roles.includes(role);
}

/** Same, for the narrower navigation list (`navigationRoles` when present). */
export function resolveOpsModuleNavAccess(
  role: OpsUserRole,
  module: OpsModule,
  overrides: OpsModuleAccessMap = OPS_NO_MODULE_OVERRIDES,
) {
  if (isDeveloperRole(role)) {
    return true;
  }

  const override = overrides.get(opsModuleAccessKey(module.id, role));

  if (override !== undefined) {
    // An explicit override decides both routes and navigation; showing a nav
    // item that 404s, or hiding one that works, is worse than either answer.
    return override;
  }

  // navigationRoles narrows the sidebar below `roles` and only exists on
  // ready modules; planned modules have no route to hide.
  const navRoles =
    "navigationRoles" in module && module.navigationRoles
      ? module.navigationRoles
      : module.roles;

  return navRoles.includes(role);
}

/** Every module, with its effective access for one role. Drives the editor. */
export function opsModuleAccessMatrix(
  role: OpsUserRole,
  overrides: OpsModuleAccessMap = OPS_NO_MODULE_OVERRIDES,
) {
  return OPS_MODULES.map((module) => {
    const key = opsModuleAccessKey(module.id, role);
    const override = overrides.get(key);

    return {
      module,
      allowed: resolveOpsModuleAccess(role, module, overrides),
      isDefault: override === undefined,
      codeDefault: module.roles.includes(role),
    };
  });
}
