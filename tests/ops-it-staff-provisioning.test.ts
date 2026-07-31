import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canCreateStaffRole,
  canDeactivateStaffRole,
  canManageStaff,
} from "../src/lib/ops/permissions";
import type { OpsAssignableStaffRole } from "../src/lib/ops/roles";
import type { OpsUserRole } from "../src/lib/ops/types";

/**
 * IT staff provisioning (audit §6).
 *
 * IT could not reach the staff register at all, which is why account creation
 * kept falling to HR. Granting it raises the real question: creating a login is
 * an IT function, but deciding what that login may DO is a business decision.
 *
 * These tests pin the boundary, because it is the kind that erodes quietly —
 * someone adds a role to a list years later and nobody notices that IT can now
 * mint a Finance Manager.
 */

const PRIVILEGED: OpsAssignableStaffRole[] = [
  "managing_director",
  "general_manager",
  "human_resource",
  "finance_manager",
  "accountant",
  "accountant_intern",
];

const OPERATIONAL: OpsAssignableStaffRole[] = [
  "engineer",
  "engineering_intern",
  "procurement",
  "procurement_assistant",
  "quantity_surveyor",
  "hse_officer",
  "admin_receptionist",
  "it_manager",
];

describe("IT staff provisioning", () => {
  it("lets the IT Manager reach the staff register", () => {
    assert.equal(canManageStaff("it_manager"), true);
  });

  it("lets IT create the operational roles it supports", () => {
    for (const role of OPERATIONAL) {
      assert.equal(
        canCreateStaffRole("it_manager", role),
        true,
        `IT should be able to provision ${role}`,
      );
    }
  });

  it("never lets IT mint a leadership or finance role", () => {
    // The segregation-of-duties boundary: whoever holds the IT account must
    // not be able to grant themselves authority over money by creating a
    // second account.
    for (const role of PRIVILEGED) {
      assert.equal(
        canCreateStaffRole("it_manager", role),
        false,
        `IT must not be able to create ${role}`,
      );
    }
  });

  it("never lets IT create a developer account", () => {
    assert.equal(
      canCreateStaffRole("it_manager", "developer" as OpsAssignableStaffRole),
      false,
    );
  });

  it("lets IT deactivate exactly the roles it can create", () => {
    // Offboarding is core IT work, but IT must not be able to disable the
    // people who oversee it.
    for (const role of OPERATIONAL) {
      assert.equal(
        canDeactivateStaffRole("it_manager", role as OpsUserRole),
        true,
        `IT should be able to offboard ${role}`,
      );
    }
    for (const role of PRIVILEGED) {
      assert.equal(
        canDeactivateStaffRole("it_manager", role as OpsUserRole),
        false,
        `IT must not be able to deactivate ${role}`,
      );
    }
  });

  it("does not widen anyone else's powers", () => {
    // HR keeps its existing bounds…
    assert.equal(canCreateStaffRole("human_resource", "managing_director"), false);
    assert.equal(canCreateStaffRole("human_resource", "general_manager"), false);
    assert.equal(canCreateStaffRole("human_resource", "finance_manager"), true);
    // …and roles with no staff powers still have none.
    assert.equal(canManageStaff("engineer"), false);
    assert.equal(canManageStaff("procurement"), false);
    assert.equal(canCreateStaffRole("engineer", "engineer"), false);
  });

  it("keeps the developer account protected from every non-developer", () => {
    for (const actor of ["it_manager", "human_resource", "general_manager"] as const) {
      assert.equal(canDeactivateStaffRole(actor, "developer"), false);
    }
  });
});
