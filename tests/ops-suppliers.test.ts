import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canArchiveOpsSupplier,
  canCreateOpsSupplier,
  canCreateOpsSupplierPerformanceEvent,
  canManageOpsSupplier,
  canUpdateOpsSupplierStatus,
  canViewOpsSuppliers,
} from "../src/lib/ops/supplier-permissions";

describe("supplier register guards", () => {
  it("scopes supplier visibility to procurement, finance, delivery management, and leadership", () => {
    assert.equal(canViewOpsSuppliers("developer"), true);
    assert.equal(canViewOpsSuppliers("procurement_assistant"), true);
    assert.equal(canViewOpsSuppliers("finance_manager"), true);
    assert.equal(canViewOpsSuppliers("operations_manager"), true);
    assert.equal(canViewOpsSuppliers("engineer"), false);
    assert.equal(canViewOpsSuppliers("human_resource"), false);
  });

  it("lets procurement create suppliers but keeps archive control with managers", () => {
    assert.equal(canCreateOpsSupplier("procurement_assistant"), true);
    assert.equal(canManageOpsSupplier("procurement_assistant"), false);
    assert.equal(canManageOpsSupplier("procurement_manager"), true);
    assert.equal(canManageOpsSupplier("accountant"), false);
  });

  it("allows operational and commercial supplier performance evidence without opening HR access", () => {
    assert.equal(canCreateOpsSupplierPerformanceEvent("developer"), true);
    assert.equal(canCreateOpsSupplierPerformanceEvent("projects_manager"), true);
    assert.equal(canCreateOpsSupplierPerformanceEvent("procurement_assistant"), true);
    assert.equal(canCreateOpsSupplierPerformanceEvent("finance_manager"), true);
    assert.equal(canCreateOpsSupplierPerformanceEvent("supervisor"), false);
    assert.equal(canCreateOpsSupplierPerformanceEvent("human_resource"), false);
    assert.equal(canCreateOpsSupplierPerformanceEvent("crew"), false);
  });

  it("prevents status mutation on archived supplier records", () => {
    assert.equal(
      canArchiveOpsSupplier("procurement_manager", { status: "active" }),
      true,
    );
    assert.equal(
      canArchiveOpsSupplier("procurement_manager", { status: "archived" }),
      false,
    );
    assert.equal(
      canUpdateOpsSupplierStatus("procurement_manager", { status: "on_hold" }),
      true,
    );
    assert.equal(
      canUpdateOpsSupplierStatus("procurement_manager", { status: "archived" }),
      false,
    );
  });
});
