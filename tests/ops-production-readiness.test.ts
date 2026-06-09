import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { OPS_MODULES } from "../src/lib/ops/constants";
import {
  canAccessOpsHref,
  canCreateStaffRole,
  canDeactivateStaffRole,
  canManageStaff,
  visibleOpsModuleRegistry,
  visibleOpsRouteModules,
} from "../src/lib/ops/permissions";
import {
  OPS_PRODUCTION_ASSIGNABLE_ROLES,
  OPS_PRODUCTION_ROLE_POLICY,
} from "../src/lib/ops/role-policy";
import { OPS_STAFF_ROLE_VALUES } from "../src/lib/ops/roles";

describe("production role policy", () => {
  it("keeps the assignable staff roles aligned with the approved Pymble role list", () => {
    const assignableRoleStrings = OPS_PRODUCTION_ASSIGNABLE_ROLES.map((role) => role as string);

    assert.deepEqual(OPS_PRODUCTION_ASSIGNABLE_ROLES, [...OPS_STAFF_ROLE_VALUES]);
    assert.equal(OPS_PRODUCTION_ASSIGNABLE_ROLES.includes("managing_director"), true);
    assert.equal(assignableRoleStrings.includes("developer"), false);
  });

  it("keeps Developer hidden but fully privileged", () => {
    const developerPolicy = OPS_PRODUCTION_ROLE_POLICY.find(
      (policy) => policy.role === "developer",
    );
    const readyRoutes = OPS_MODULES.filter((module) => module.status === "ready");

    assert.equal(developerPolicy?.visibleInAccessRegister, false);
    assert.equal(canManageStaff("developer"), true);
    assert.equal(visibleOpsRouteModules("developer").length, readyRoutes.length);
    assert.equal(visibleOpsModuleRegistry("developer").length, OPS_MODULES.length);

    for (const opsModule of readyRoutes) {
      assert.equal(canAccessOpsHref("developer", opsModule.href), true, opsModule.href);
    }
  });

  it("keeps the Managing Director as the single operational superuser", () => {
    const managingDirectorPolicy = OPS_PRODUCTION_ROLE_POLICY.find(
      (policy) => policy.role === "managing_director",
    );
    const readyRoutes = OPS_MODULES.filter((module) => module.status === "ready");

    assert.equal(managingDirectorPolicy?.accountModel, "single");
    assert.equal(managingDirectorPolicy?.visibleInAccessRegister, true);
    assert.equal(canManageStaff("managing_director"), true);

    for (const opsModule of readyRoutes) {
      assert.equal(canAccessOpsHref("managing_director", opsModule.href), true, opsModule.href);
    }
  });

  it("enforces the final staff account creation hierarchy", () => {
    assert.equal(canCreateStaffRole("developer", "managing_director"), true);
    assert.equal(canCreateStaffRole("managing_director", "general_manager"), true);
    assert.equal(canCreateStaffRole("general_manager", "human_resource"), true);
    assert.equal(canCreateStaffRole("general_manager", "managing_director"), false);
    assert.equal(canCreateStaffRole("human_resource", "operations_manager"), true);
    assert.equal(canCreateStaffRole("human_resource", "general_manager"), false);
    assert.equal(canCreateStaffRole("human_resource", "managing_director"), false);
    assert.equal(canCreateStaffRole("operations_manager", "engineer"), false);
  });

  it("prevents app deletion of Developer and protects Managing Director from GM/HR", () => {
    assert.equal(canDeactivateStaffRole("developer", "developer"), false);
    assert.equal(canDeactivateStaffRole("managing_director", "developer"), false);
    assert.equal(canDeactivateStaffRole("general_manager", "developer"), false);
    assert.equal(canDeactivateStaffRole("human_resource", "developer"), false);

    assert.equal(canDeactivateStaffRole("managing_director", "general_manager"), true);
    assert.equal(canDeactivateStaffRole("general_manager", "managing_director"), false);
    assert.equal(canDeactivateStaffRole("general_manager", "human_resource"), true);
    assert.equal(canDeactivateStaffRole("human_resource", "general_manager"), false);
    assert.equal(canDeactivateStaffRole("human_resource", "operations_manager"), true);
    assert.equal(canDeactivateStaffRole("operations_manager", "engineer"), false);
  });

  it("keeps production policy roles unique and covered", () => {
    const roles = OPS_PRODUCTION_ROLE_POLICY.map((policy) => policy.role);
    const uniqueRoles = new Set(roles);

    assert.equal(uniqueRoles.size, roles.length);

    for (const role of OPS_PRODUCTION_ASSIGNABLE_ROLES) {
      assert.equal(uniqueRoles.has(role), true, role);
    }
  });
});
