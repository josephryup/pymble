import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canAdjustOpsStock,
  canIssueOpsStock,
  canManageOpsInventoryMasterData,
  canRecordOpsGoodsReceived,
  canTransferOpsStock,
  canViewOpsStoresInventory,
} from "../src/lib/ops/stores-inventory-permissions";

describe("stores and inventory guards", () => {
  it("scopes stores visibility to procurement, delivery management, finance, and leadership", () => {
    assert.equal(canViewOpsStoresInventory("developer"), true);
    assert.equal(canViewOpsStoresInventory("procurement_assistant"), true);
    assert.equal(canViewOpsStoresInventory("operations_manager"), true);
    assert.equal(canViewOpsStoresInventory("finance_manager"), true);
    assert.equal(canViewOpsStoresInventory("engineer"), true);
    assert.equal(canViewOpsStoresInventory("human_resource"), false);
    assert.equal(canViewOpsStoresInventory("hse_officer"), false);
  });

  it("keeps stock master data with leadership and stores/procurement managers", () => {
    assert.equal(canManageOpsInventoryMasterData("developer"), true);
    assert.equal(canManageOpsInventoryMasterData("managing_director"), true);
    assert.equal(canManageOpsInventoryMasterData("procurement_manager"), true);
    assert.equal(canManageOpsInventoryMasterData("operations_manager"), true);
    assert.equal(canManageOpsInventoryMasterData("procurement_assistant"), false);
    assert.equal(canManageOpsInventoryMasterData("accountant"), false);
  });

  it("allows goods receipt only against issued or partially received purchase orders", () => {
    assert.equal(
      canRecordOpsGoodsReceived("procurement", { status: "issued" }),
      true,
    );
    assert.equal(
      canRecordOpsGoodsReceived("engineer", { status: "partially_received" }),
      true,
    );
    assert.equal(
      canRecordOpsGoodsReceived("procurement", { status: "draft" }),
      false,
    );
    assert.equal(
      canRecordOpsGoodsReceived("accountant", { status: "issued" }),
      false,
    );
  });

  it("allows stock issue and transfer for stores operators but keeps adjustments tighter", () => {
    assert.equal(canIssueOpsStock("procurement_assistant"), true);
    assert.equal(canTransferOpsStock("engineer"), true);
    assert.equal(canIssueOpsStock("accountant"), false);
    assert.equal(canTransferOpsStock("human_resource"), false);

    assert.equal(canAdjustOpsStock("developer"), true);
    assert.equal(canAdjustOpsStock("operations_manager"), true);
    assert.equal(canAdjustOpsStock("procurement_manager"), true);
    assert.equal(canAdjustOpsStock("procurement_assistant"), false);
    assert.equal(canAdjustOpsStock("engineer"), false);
  });
});
