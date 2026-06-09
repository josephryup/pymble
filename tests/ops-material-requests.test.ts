import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canCreateOpsMaterialRequest,
  canEditOpsMaterialRequest,
  canSubmitOpsMaterialRequest,
  materialRequestApprovalRecipientRoles,
  materialRequestApprovalSteps,
} from "../src/lib/ops/material-request-permissions";
import { calculateOpsMaterialRequestTotal } from "../src/lib/ops/material-requests";

describe("material request workflow guards", () => {
  it("keeps material request creation scoped to operational roles", () => {
    assert.equal(canCreateOpsMaterialRequest("developer"), true);
    assert.equal(canCreateOpsMaterialRequest("engineer"), true);
    assert.equal(canCreateOpsMaterialRequest("procurement_assistant"), true);
    assert.equal(canCreateOpsMaterialRequest("accountant"), false);
    assert.equal(canCreateOpsMaterialRequest("hse_officer"), false);
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

  it("uses the first-pass project and procurement approval chain", () => {
    assert.deepEqual(
      materialRequestApprovalSteps("normal", 25_000).map((step) => step.approverRole),
      ["projects_manager", "procurement_manager"],
    );
    assert.deepEqual(
      materialRequestApprovalSteps("urgent", 25_000).map((step) => step.approverRole),
      ["projects_manager", "procurement_manager"],
    );
  });

  it("deduplicates approval recipient roles and always includes Developer", () => {
    assert.deepEqual(
      materialRequestApprovalRecipientRoles([
        {
          approverRole: "projects_manager",
          label: "Projects Manager review",
          sequence: 1,
          stepNumber: 1,
        },
        {
          approverRole: "projects_manager",
          label: "Second Projects Manager review",
          sequence: 2,
          stepNumber: 1,
        },
      ]),
      ["projects_manager", "developer"],
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
