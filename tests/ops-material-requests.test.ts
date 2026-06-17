import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canApproveMaterialRequestCost,
  canAttachMaterialRequestPricing,
  canCreateOpsMaterialRequest,
  canEditOpsMaterialRequest,
  canSubmitOpsMaterialRequest,
  materialRequestApprovalRecipientRoles,
  materialRequestApprovalSteps,
} from "../src/lib/ops/material-request-permissions";
import { calculateOpsMaterialRequestTotal } from "../src/lib/ops/material-requests";

describe("material request workflow guards", () => {
  it("keeps material request creation scoped to operational and HSE roles", () => {
    assert.equal(canCreateOpsMaterialRequest("developer"), true);
    assert.equal(canCreateOpsMaterialRequest("engineer"), true);
    assert.equal(canCreateOpsMaterialRequest("procurement_assistant"), true);
    // HSE roles can now raise material requests (e.g. for PPE / safety equipment)
    // per Phase H3 of the workflow design.
    assert.equal(canCreateOpsMaterialRequest("hse_officer"), true);
    assert.equal(canCreateOpsMaterialRequest("hse_assistant_officer"), true);
    // Finance and HR don't raise material requests.
    assert.equal(canCreateOpsMaterialRequest("accountant"), false);
    assert.equal(canCreateOpsMaterialRequest("human_resource"), false);
  });

  it("allows draft owners and managers to edit or submit", () => {
    assert.equal(
      canEditOpsMaterialRequest("requester-1", "engineer", {
        requested_by: "requester-1",
        status: "draft",
      }),
      true,
    );
    assert.equal(
      canSubmitOpsMaterialRequest("manager-1", "procurement_manager", {
        requested_by: "requester-1",
        status: "draft",
      }),
      true,
    );
    assert.equal(
      canSubmitOpsMaterialRequest("requester-1", "engineer", {
        requested_by: "requester-1",
        status: "submitted",
      }),
      false,
    );
  });

  it("uses a single operations approval step (procurement and finance are explicit actions)", () => {
    // Per the Phase H3 workflow:
    //   submitted/in_review → (Operations approves) → pricing_pending →
    //   (Procurement attaches prices) → priced →
    //   (Finance approves cost via action) → approved.
    // The approval chain itself is just the single operations step.
    assert.deepEqual(
      materialRequestApprovalSteps("normal", 25_000).map((step) => step.approverRole),
      ["operations_manager"],
    );
    assert.deepEqual(
      materialRequestApprovalSteps("urgent", 25_000).map((step) => step.approverRole),
      ["operations_manager"],
    );
  });

  it("deduplicates approval recipient roles and always includes Developer", () => {
    assert.deepEqual(
      materialRequestApprovalRecipientRoles([
        {
          approverRole: "operations_manager",
          label: "Operations review",
          sequence: 1,
          stepNumber: 1,
        },
        {
          approverRole: "operations_manager",
          label: "Second Operations review",
          sequence: 2,
          stepNumber: 1,
        },
      ]),
      ["operations_manager", "developer"],
    );
  });
});

describe("material request pricing flow gates", () => {
  it("only procurement and leadership can attach supplier prices", () => {
    assert.equal(canAttachMaterialRequestPricing("procurement_manager"), true);
    assert.equal(canAttachMaterialRequestPricing("procurement"), true);
    assert.equal(canAttachMaterialRequestPricing("procurement_assistant"), true);
    assert.equal(canAttachMaterialRequestPricing("developer"), true);
    assert.equal(canAttachMaterialRequestPricing("managing_director"), true);
    assert.equal(canAttachMaterialRequestPricing("engineer"), false);
    assert.equal(canAttachMaterialRequestPricing("finance_manager"), false);
    assert.equal(canAttachMaterialRequestPricing("hse_officer"), false);
  });

  it("only finance and leadership can approve the cost", () => {
    assert.equal(canApproveMaterialRequestCost("finance_manager"), true);
    assert.equal(canApproveMaterialRequestCost("accountant"), true);
    assert.equal(canApproveMaterialRequestCost("developer"), true);
    assert.equal(canApproveMaterialRequestCost("managing_director"), true);
    assert.equal(canApproveMaterialRequestCost("procurement_manager"), false);
    assert.equal(canApproveMaterialRequestCost("engineer"), false);
  });

  it("permits editing while a request is in pricing_pending or priced", () => {
    // Procurement Manager edits during pricing_pending.
    assert.equal(
      canEditOpsMaterialRequest("procurement-mgr-id", "procurement_manager", {
        requested_by: "engineer-id",
        status: "pricing_pending",
      }),
      true,
    );
    // Original requester (engineer) can still edit while priced (e.g. fix a typo
    // before Finance approves).
    assert.equal(
      canEditOpsMaterialRequest("engineer-id", "engineer", {
        requested_by: "engineer-id",
        status: "priced",
      }),
      true,
    );
    // Editing locked after Finance approves.
    assert.equal(
      canEditOpsMaterialRequest("engineer-id", "engineer", {
        requested_by: "engineer-id",
        status: "approved",
      }),
      false,
    );
  });
});

describe("material request totals", () => {
  it("sums estimated line totals safely", () => {
    assert.equal(
      calculateOpsMaterialRequestTotal([
        { estimated_total: 1200 },
        { estimated_total: 450.5 },
        { estimated_total: 0 },
      ]),
      1650.5,
    );
  });
});
