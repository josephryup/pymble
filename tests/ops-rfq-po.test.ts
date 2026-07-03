import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canAddOpsRfqItem,
  canCreateOpsRfq,
  canEditOpsRfq,
  canIssueOpsPurchaseOrder,
  canSubmitOpsPurchaseOrderForApproval,
  canViewOpsRfqPo,
  purchaseOrderApprovalRecipientRoles,
  purchaseOrderApprovalSteps,
} from "../src/lib/ops/rfq-po-permissions";
import { calculateOpsRfqEstimatedTotal } from "../src/lib/ops/rfq-po";

describe("RFQ and purchase order guards", () => {
  it("scopes RFQ visibility to procurement, finance, delivery management, and leadership", () => {
    assert.equal(canViewOpsRfqPo("developer"), true);
    assert.equal(canViewOpsRfqPo("procurement_assistant"), true);
    assert.equal(canViewOpsRfqPo("finance_manager"), true);
    assert.equal(canViewOpsRfqPo("operations_manager"), true);
    assert.equal(canViewOpsRfqPo("engineer"), false);
    assert.equal(canViewOpsRfqPo("human_resource"), false);
  });

  it("lets procurement create and edit RFQ lines while draft or issued", () => {
    assert.equal(canCreateOpsRfq("procurement_assistant"), true);
    assert.equal(canCreateOpsRfq("accountant"), false);
    assert.equal(canAddOpsRfqItem("procurement", { status: "draft" }), true);
    assert.equal(canEditOpsRfq("procurement", { status: "issued" }), true);
    assert.equal(canEditOpsRfq("procurement", { status: "awarded" }), false);
    assert.equal(canEditOpsRfq("accountant", { status: "draft" }), false);
  });

  it("guards purchase order approval and issue transitions by role and status", () => {
    assert.equal(canSubmitOpsPurchaseOrderForApproval("procurement_manager", { status: "draft" }), true);
    assert.equal(canSubmitOpsPurchaseOrderForApproval("procurement_manager", { status: "rejected" }), true);
    assert.equal(canSubmitOpsPurchaseOrderForApproval("procurement_manager", { status: "approved" }), false);
    assert.equal(canSubmitOpsPurchaseOrderForApproval("procurement_assistant", { status: "draft" }), false);
    assert.equal(canIssueOpsPurchaseOrder("procurement_manager", { status: "approved" }), true);
    assert.equal(canIssueOpsPurchaseOrder("procurement_manager", { status: "approval_pending" }), false);
  });

  it("builds purchase order approval steps from configured threshold settings", () => {
    const settings = {
      currency_code: "ZMW",
      first_step_role: "procurement_manager",
      is_active: true,
      second_step_role: "finance_manager",
      threshold_amount: 50000,
      threshold_enabled: true,
      threshold_step_role: "managing_director",
    } as const;

    const normalSteps = purchaseOrderApprovalSteps(settings, 25000);
    assert.deepEqual(
      normalSteps.map((step) => step.approverRole),
      ["procurement_manager", "finance_manager"],
    );

    const thresholdSteps = purchaseOrderApprovalSteps(settings, 50000);
    assert.deepEqual(
      thresholdSteps.map((step) => step.approverRole),
      ["procurement_manager", "finance_manager", "managing_director"],
    );
    // Only the first step's approver is summoned at submission — later steps
    // are notified when the chain reaches them (decideOpsApprovalAction).
    assert.deepEqual(purchaseOrderApprovalRecipientRoles(thresholdSteps), [
      "procurement_manager",
      "developer",
    ]);
  });
});

describe("RFQ calculation helpers", () => {
  it("sums RFQ estimated totals safely", () => {
    assert.equal(
      calculateOpsRfqEstimatedTotal([
        { estimated_total: 3000 },
        { estimated_total: 1500.25 },
        { estimated_total: 0 },
      ]),
      4500.25,
    );
  });
});
