import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calculateOpsEquipmentPercent,
} from "../src/lib/ops/equipment";
import {
  canAllocateOpsEquipment,
  canApproveOpsEquipmentRequest,
  canCancelOpsEquipmentAllocation,
  canCancelOpsEquipmentRequest,
  canCancelOpsMaintenanceJob,
  canCompleteOpsEquipmentAllocation,
  canCompleteOpsMaintenanceJob,
  canCreateOpsMaintenanceJob,
  canCreateOpsEquipmentRequest,
  canManageOpsEquipmentMasterData,
  canRejectOpsEquipmentRequest,
  canRecordOpsFuelLog,
  canStartOpsEquipmentAllocation,
  canStartOpsMaintenanceJob,
  canSubmitOpsEquipmentRequest,
  canViewOpsEquipment,
} from "../src/lib/ops/equipment-permissions";

describe("equipment and fleet guards", () => {
  it("calculates bounded equipment reporting percentages", () => {
    assert.equal(calculateOpsEquipmentPercent(0, 0), 0);
    assert.equal(calculateOpsEquipmentPercent(3, 10), 30);
    assert.equal(calculateOpsEquipmentPercent(15, 10), 100);
  });

  it("scopes equipment visibility to delivery, finance, procurement, HSE, and leadership roles", () => {
    assert.equal(canViewOpsEquipment("developer"), true);
    assert.equal(canViewOpsEquipment("operations_manager"), true);
    assert.equal(canViewOpsEquipment("engineer"), true);
    assert.equal(canViewOpsEquipment("finance_manager"), true);
    assert.equal(canViewOpsEquipment("procurement_manager"), true);
    assert.equal(canViewOpsEquipment("hse_officer"), true);
    assert.equal(canViewOpsEquipment("human_resource"), false);
  });

  it("keeps equipment master data with operations, procurement, finance, and leadership", () => {
    assert.equal(canManageOpsEquipmentMasterData("developer"), true);
    assert.equal(canManageOpsEquipmentMasterData("operations_manager"), true);
    assert.equal(canManageOpsEquipmentMasterData("procurement_manager"), true);
    assert.equal(canManageOpsEquipmentMasterData("finance_manager"), true);
    assert.equal(canManageOpsEquipmentMasterData("engineer"), false);
    assert.equal(canManageOpsEquipmentMasterData("hse_officer"), false);
  });

  it("lets site delivery roles request equipment while managers review and allocate", () => {
    const draft = { requested_by: "user-1", status: "draft" as const };
    const submitted = { requested_by: "user-1", status: "submitted" as const };
    const approved = { requested_by: "user-1", status: "approved" as const };
    const allocated = { requested_by: "user-1", status: "allocated" as const };

    assert.equal(canCreateOpsEquipmentRequest("engineer"), true);
    assert.equal(canCreateOpsEquipmentRequest("hse_officer"), true);
    assert.equal(canCreateOpsEquipmentRequest("procurement"), false);
    assert.equal(canSubmitOpsEquipmentRequest("user-1", "engineer", draft), true);
    assert.equal(canSubmitOpsEquipmentRequest("someone-else", "engineer", draft), false);
    assert.equal(canApproveOpsEquipmentRequest("operations_manager", submitted), true);
    assert.equal(canApproveOpsEquipmentRequest("engineer", submitted), false);
    assert.equal(canRejectOpsEquipmentRequest("projects_manager", submitted), true);
    assert.equal(canAllocateOpsEquipment("operations_manager", approved), true);
    assert.equal(canAllocateOpsEquipment("finance_manager", approved), false);
    assert.equal(canCancelOpsEquipmentRequest("user-1", "engineer", approved), true);
    assert.equal(canCancelOpsEquipmentRequest("user-1", "engineer", allocated), false);
  });

  it("guards equipment allocation lifecycle transitions", () => {
    const scheduled = { status: "scheduled" as const };
    const active = { status: "active" as const };
    const completed = { status: "completed" as const };

    assert.equal(canStartOpsEquipmentAllocation("operations_manager", scheduled), true);
    assert.equal(canStartOpsEquipmentAllocation("engineer", scheduled), false);
    assert.equal(canCompleteOpsEquipmentAllocation("projects_manager", active), true);
    assert.equal(canCompleteOpsEquipmentAllocation("projects_manager", scheduled), false);
    assert.equal(canCancelOpsEquipmentAllocation("general_manager", scheduled), true);
    assert.equal(canCancelOpsEquipmentAllocation("general_manager", active), true);
    assert.equal(canCancelOpsEquipmentAllocation("general_manager", completed), false);
  });

  it("keeps fuel logs with field delivery roles and fleet leadership", () => {
    assert.equal(canRecordOpsFuelLog("developer"), true);
    assert.equal(canRecordOpsFuelLog("operations_manager"), true);
    assert.equal(canRecordOpsFuelLog("projects_manager"), true);
    assert.equal(canRecordOpsFuelLog("engineer"), true);
    assert.equal(canRecordOpsFuelLog("finance_manager"), false);
    assert.equal(canRecordOpsFuelLog("human_resource"), false);
  });

  it("guards maintenance creation and lifecycle transitions", () => {
    const scheduled = { status: "scheduled" as const };
    const inProgress = { status: "in_progress" as const };
    const completed = { status: "completed" as const };

    assert.equal(canCreateOpsMaintenanceJob("developer"), true);
    assert.equal(canCreateOpsMaintenanceJob("procurement_manager"), true);
    assert.equal(canCreateOpsMaintenanceJob("finance_manager"), true);
    assert.equal(canCreateOpsMaintenanceJob("hse_officer"), false);
    assert.equal(canStartOpsMaintenanceJob("operations_manager", scheduled), true);
    assert.equal(canStartOpsMaintenanceJob("engineer", scheduled), false);
    assert.equal(canCompleteOpsMaintenanceJob("projects_manager", inProgress), true);
    assert.equal(canCompleteOpsMaintenanceJob("projects_manager", scheduled), false);
    assert.equal(canCancelOpsMaintenanceJob("general_manager", scheduled), true);
    assert.equal(canCancelOpsMaintenanceJob("general_manager", inProgress), true);
    assert.equal(canCancelOpsMaintenanceJob("general_manager", completed), false);
  });
});
