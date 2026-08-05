import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { OPS_MODULES } from "../src/lib/ops/constants";
import {
  buildOpsModuleAccessMap,
  canEditOpsModuleAccess,
  canViewOpsModuleAccess,
  isSensitiveOpsModule,
  opsModuleAccessKey,
  resolveOpsModuleAccess,
} from "../src/lib/ops/module-access-core";
import type { OpsModule, OpsUserRole } from "../src/lib/ops/types";

/**
 * The role → module matrix is editable from the workspace, which makes it a
 * privilege boundary rather than a preferences screen. These tests pin the
 * rules that stop it becoming a way around the controls it sits next to.
 */

function moduleById(id: string): OpsModule {
  const found = OPS_MODULES.find((item) => item.id === id);
  assert.ok(found, `module ${id} not found — test is out of date`);
  return found;
}

const anOperationalModule = moduleById("sites");
const aFinanceModule = OPS_MODULES.find((item) => item.group === "finance");
const anHrModule = OPS_MODULES.find((item) => item.group === "hr");

describe("who may open the module access screen", () => {
  it("allows IT Manager, Managing Director, owner and Developer", () => {
    for (const role of ["it_manager", "managing_director", "owner", "developer"] as OpsUserRole[]) {
      assert.equal(canViewOpsModuleAccess(role), true, role);
    }
  });

  it("excludes the General Manager", () => {
    // Mirrors OPS_IT_ROLES: the IT area is role-isolated because IT reports to
    // the MD. Widening it here would disagree with the rest of the IT module.
    assert.equal(canViewOpsModuleAccess("general_manager"), false);
  });

  it("excludes ordinary roles", () => {
    for (const role of ["engineer", "crew", "finance_manager", "hr"] as OpsUserRole[]) {
      assert.equal(canViewOpsModuleAccess(role), false, role);
    }
  });
});

describe("segregation of duties — IT cannot widen its own reach", () => {
  it("blocks IT from granting access to a finance module", () => {
    assert.ok(aFinanceModule, "no finance module in the registry");
    const decision = canEditOpsModuleAccess({
      actorRole: "it_manager",
      module: aFinanceModule,
      next: true,
      targetRole: "it_manager",
    });

    assert.equal(decision.allowed, false);
    assert.match(
      decision.allowed === false ? decision.reason : "",
      /finance|Managing Director/i,
    );
  });

  it("blocks IT from granting access to an HR module", () => {
    assert.ok(anHrModule, "no HR module in the registry");
    assert.equal(
      canEditOpsModuleAccess({
        actorRole: "it_manager",
        module: anHrModule,
        next: true,
        targetRole: "procurement",
      }).allowed,
      false,
    );
  });

  it("still lets IT NARROW a sensitive module", () => {
    // Removing access is not an escalation, so it stays available.
    assert.ok(aFinanceModule);
    assert.equal(
      canEditOpsModuleAccess({
        actorRole: "it_manager",
        module: aFinanceModule,
        next: false,
        targetRole: "accountant",
      }).allowed,
      true,
    );
  });

  it("blocks IT from changing leadership or Finance Manager access", () => {
    for (const targetRole of ["general_manager", "finance_manager"] as OpsUserRole[]) {
      assert.equal(
        canEditOpsModuleAccess({
          actorRole: "it_manager",
          module: anOperationalModule,
          next: true,
          targetRole,
        }).allowed,
        false,
        targetRole,
      );
    }
  });

  it("lets IT manage an ordinary operational module", () => {
    assert.equal(
      canEditOpsModuleAccess({
        actorRole: "it_manager",
        module: anOperationalModule,
        next: true,
        targetRole: "engineer",
      }).allowed,
      true,
    );
  });

  it("lets the Managing Director grant a sensitive module", () => {
    assert.ok(aFinanceModule);
    assert.equal(
      canEditOpsModuleAccess({
        actorRole: "managing_director",
        module: aFinanceModule,
        next: true,
        targetRole: "quantity_surveyor",
      }).allowed,
      true,
    );
  });
});

describe("lock-out protection", () => {
  it("nobody can remove the Managing Director from a module", () => {
    for (const actorRole of ["developer", "managing_director", "it_manager"] as OpsUserRole[]) {
      assert.equal(
        canEditOpsModuleAccess({
          actorRole,
          module: anOperationalModule,
          next: false,
          targetRole: "managing_director",
        }).allowed,
        false,
        actorRole,
      );
    }
  });

  it("the Developer row cannot be edited at all", () => {
    assert.equal(
      canEditOpsModuleAccess({
        actorRole: "developer",
        module: anOperationalModule,
        next: false,
        targetRole: "developer",
      }).allowed,
      false,
    );
  });
});

describe("resolving effective access", () => {
  it("uses the code default when there is no override", () => {
    const role = anOperationalModule.roles[0];
    assert.equal(resolveOpsModuleAccess(role, anOperationalModule), true);
  });

  it("an override can grant access the code does not give", () => {
    const denied = (["crew"] as OpsUserRole[]).find(
      (role) => !anOperationalModule.roles.includes(role),
    );
    assert.ok(denied, "expected a role without default access");

    assert.equal(resolveOpsModuleAccess(denied, anOperationalModule), false);

    const overrides = buildOpsModuleAccessMap([
      { can_access: true, module_key: anOperationalModule.id, role: denied },
    ]);
    assert.equal(resolveOpsModuleAccess(denied, anOperationalModule, overrides), true);
  });

  it("an override can remove access the code does give", () => {
    const allowed = anOperationalModule.roles.find((role) => role !== "developer");
    assert.ok(allowed, "expected a non-developer role with default access");

    const overrides = buildOpsModuleAccessMap([
      { can_access: false, module_key: anOperationalModule.id, role: allowed },
    ]);
    assert.equal(resolveOpsModuleAccess(allowed, anOperationalModule, overrides), false);
  });

  it("the Developer bypass is not overridable", () => {
    // The Developer is the maintenance backstop; an override that could lock it
    // out would make the system unrecoverable from the UI.
    const overrides = buildOpsModuleAccessMap([
      { can_access: false, module_key: anOperationalModule.id, role: "developer" },
    ]);
    assert.equal(resolveOpsModuleAccess("developer", anOperationalModule, overrides), true);
  });

  it("keys are scoped per module, so one override does not leak to another", () => {
    const other = OPS_MODULES.find((item) => item.id !== anOperationalModule.id);
    assert.ok(other);
    assert.notEqual(
      opsModuleAccessKey(anOperationalModule.id, "engineer"),
      opsModuleAccessKey(other.id, "engineer"),
    );
  });
});

describe("sensitive module classification", () => {
  it("treats finance, HR, commercial and executive as sensitive", () => {
    for (const group of ["finance", "hr", "commercial", "executive"]) {
      const found = OPS_MODULES.find((item) => item.group === group);
      if (found) assert.equal(isSensitiveOpsModule(found), true, group);
    }
  });

  it("does not treat operations as sensitive", () => {
    assert.equal(isSensitiveOpsModule(anOperationalModule), false);
  });
});
