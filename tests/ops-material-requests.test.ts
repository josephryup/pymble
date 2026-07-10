import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canApproveMaterialRequestCost,
  canAttachMaterialRequestPricing,
  canConfirmMaterialRequestDelivery,
  canCreateOpsMaterialRequest,
  canEditOpsMaterialRequest,
  canSetMaterialRequestTransportCost,
  canSubmitOpsMaterialRequest,
  canViewOpsMaterialRequestFinanceQueue,
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

  it("uses a single operations step for general/IT scope; site adds a PM review first", () => {
    // Per the Phase H3 workflow (+ system-wide audit §6a):
    //   submitted → (site only: PM accuracy check) → in_review →
    //   (Operations approves) → pricing_pending →
    //   (Procurement attaches prices) → priced →
    //   (Finance approves cost via action) → approved.
    assert.deepEqual(
      materialRequestApprovalSteps("normal", 25_000, "general").map((step) => step.approverRole),
      ["operations_manager"],
    );
    assert.deepEqual(
      materialRequestApprovalSteps("urgent", 25_000, "it").map((step) => step.approverRole),
      ["operations_manager"],
    );
    assert.deepEqual(
      materialRequestApprovalSteps("normal", 25_000, "site").map((step) => step.approverRole),
      ["projects_manager", "operations_manager"],
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

  it("gives both Finance roles the shared priced approval queue", () => {
    assert.equal(canViewOpsMaterialRequestFinanceQueue("finance_manager"), true);
    assert.equal(canViewOpsMaterialRequestFinanceQueue("accountant"), true);
    assert.equal(canViewOpsMaterialRequestFinanceQueue("procurement_manager"), false);
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

describe("material request transport cost gate", () => {
  it("lets procurement and leadership record transport cost, but not site or finance roles", () => {
    assert.equal(canSetMaterialRequestTransportCost("procurement_manager"), true);
    assert.equal(canSetMaterialRequestTransportCost("procurement"), true);
    assert.equal(canSetMaterialRequestTransportCost("procurement_assistant"), true);
    assert.equal(canSetMaterialRequestTransportCost("developer"), true);
    // It is a procurement-owned figure — engineers and finance don't set it.
    assert.equal(canSetMaterialRequestTransportCost("engineer"), false);
    assert.equal(canSetMaterialRequestTransportCost("finance_manager"), false);
  });
});

describe("material request delivery confirmation gate", () => {
  it("lets the requester confirm delivery only once ordered", () => {
    assert.equal(
      canConfirmMaterialRequestDelivery("requester-1", "engineer", {
        requested_by: "requester-1",
        status: "ordered",
      }),
      true,
    );
    // Not before it has been ordered.
    assert.equal(
      canConfirmMaterialRequestDelivery("requester-1", "engineer", {
        requested_by: "requester-1",
        status: "approved",
      }),
      false,
    );
    // Already delivered/closed → nothing further to confirm.
    assert.equal(
      canConfirmMaterialRequestDelivery("requester-1", "engineer", {
        requested_by: "requester-1",
        status: "delivered",
      }),
      false,
    );
  });

  it("lets operations managers confirm as a backstop, but blocks unrelated site staff", () => {
    assert.equal(
      canConfirmMaterialRequestDelivery("ops-1", "operations_manager", {
        requested_by: "requester-1",
        status: "ordered",
      }),
      true,
    );
    // A different engineer who didn't raise it and isn't a manager cannot confirm.
    assert.equal(
      canConfirmMaterialRequestDelivery("engineer-2", "engineer", {
        requested_by: "requester-1",
        status: "ordered",
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

describe("IT material request confidentiality and flow", () => {
  it("limits IT-scope creation to the IT manager and top leadership", async () => {
    const { canCreateOpsMaterialRequestScope } = await import(
      "../src/lib/ops/material-request-permissions"
    );
    assert.equal(canCreateOpsMaterialRequestScope("it_manager", "it"), true);
    assert.equal(canCreateOpsMaterialRequestScope("managing_director", "it"), true);
    assert.equal(canCreateOpsMaterialRequestScope("engineer", "it"), false);
    assert.equal(canCreateOpsMaterialRequestScope("procurement", "it"), false);
    // The IT manager only raises IT requests, never site/general ones.
    assert.equal(canCreateOpsMaterialRequestScope("it_manager", "site"), false);
    assert.equal(canCreateOpsMaterialRequestScope("it_manager", "general"), false);
    assert.equal(canCreateOpsMaterialRequestScope("engineer", "site"), true);
  });

  it("restricts IT request visibility to leadership, procurement, and finance", async () => {
    const { canViewOpsItMaterialRequests } = await import(
      "../src/lib/ops/material-request-permissions"
    );
    for (const role of [
      "managing_director",
      "general_manager",
      "operations_manager",
      "projects_manager",
      "it_manager",
      "procurement_manager",
      "procurement",
      "procurement_assistant",
      "finance_manager",
      "accountant",
    ] as const) {
      assert.equal(canViewOpsItMaterialRequests(role), true, role);
    }
    for (const role of [
      "engineer",
      "supervisor",
      "quantity_surveyor",
      "manager",
      "hse_officer",
      "hr",
      "engineering_manager",
    ] as const) {
      assert.equal(canViewOpsItMaterialRequests(role), false, role);
    }
  });

  it("reserves the md_review decision for the Managing Director", async () => {
    const { canApproveMaterialRequestMdReview } = await import(
      "../src/lib/ops/material-request-permissions"
    );
    assert.equal(canApproveMaterialRequestMdReview("managing_director"), true);
    assert.equal(canApproveMaterialRequestMdReview("finance_manager"), false);
    assert.equal(canApproveMaterialRequestMdReview("operations_manager"), false);
    assert.equal(canApproveMaterialRequestMdReview("it_manager"), false);
  });

  it("adds the MD gate to the chain only for IT-scoped requests", async () => {
    const { buildMaterialRequestChainSteps } = await import(
      "../src/lib/ops/material-requests"
    );
    const base = {
      request_number: "MR-001",
      created_at: "2026-07-01T08:00:00Z",
      submitted_at: "2026-07-01T09:00:00Z",
      approved_at: null,
      rejected_at: null,
      ordered_at: null,
      closed_at: null,
      priced_at: "2026-07-02T09:00:00Z",
      delivered_at: null,
    };

    const itChain = buildMaterialRequestChainSteps({
      ...base,
      scope: "it",
      status: "md_review",
    });
    const mdStep = itChain.find((step) => step.key === "md_approved");
    assert.ok(mdStep, "IT chain includes the MD gate");
    assert.equal(mdStep?.state, "current");
    assert.equal(
      itChain.find((step) => step.key === "finance_approved")?.state,
      "done",
    );

    const siteChain = buildMaterialRequestChainSteps({
      ...base,
      scope: "site",
      status: "priced",
    });
    assert.equal(
      siteChain.some((step) => step.key === "md_approved"),
      false,
      "site chain has no MD gate",
    );
  });
});

describe("site-scope Projects Manager review stage", () => {
  it("prepends a PM step for site scope only", async () => {
    const { materialRequestApprovalSteps } = await import(
      "../src/lib/ops/material-request-permissions"
    );
    const site = materialRequestApprovalSteps("normal", 1000, "site");
    assert.deepEqual(
      site.map((step) => [step.stepNumber, step.approverRole]),
      [
        [1, "projects_manager"],
        [2, "operations_manager"],
      ],
    );

    for (const scope of ["general", "it"] as const) {
      const steps = materialRequestApprovalSteps("normal", 1000, scope);
      assert.deepEqual(
        steps.map((step) => [step.stepNumber, step.approverRole]),
        [[1, "operations_manager"]],
        scope,
      );
    }
  });

  it("only notifies the first step's approver at submission", async () => {
    const { materialRequestApprovalSteps, materialRequestApprovalRecipientRoles } =
      await import("../src/lib/ops/material-request-permissions");
    const roles = materialRequestApprovalRecipientRoles(
      materialRequestApprovalSteps("normal", 1000, "site"),
    );
    assert.ok(roles.includes("projects_manager"));
    assert.ok(
      !roles.includes("operations_manager"),
      "Operations must not be summoned before the PM has reviewed",
    );
  });

  it("shows the PM chain step for site scope with correct states", async () => {
    const { buildMaterialRequestChainSteps } = await import(
      "../src/lib/ops/material-requests"
    );
    const base = {
      request_number: "MR-002",
      created_at: "2026-07-01T08:00:00Z",
      submitted_at: "2026-07-01T09:00:00Z",
      approved_at: null,
      rejected_at: null,
      ordered_at: null,
      closed_at: null,
      priced_at: null,
      delivered_at: null,
    };

    const awaitingPm = buildMaterialRequestChainSteps({
      ...base,
      scope: "site",
      status: "submitted",
    });
    assert.equal(awaitingPm.find((step) => step.key === "pm_reviewed")?.state, "current");
    assert.equal(
      awaitingPm.find((step) => step.key === "operations_approved")?.state,
      "pending",
      "Operations is not current while the PM review is open",
    );

    const awaitingOps = buildMaterialRequestChainSteps({
      ...base,
      scope: "site",
      status: "in_review",
    });
    assert.equal(awaitingOps.find((step) => step.key === "pm_reviewed")?.state, "done");
    assert.equal(
      awaitingOps.find((step) => step.key === "operations_approved")?.state,
      "current",
    );

    const generalChain = buildMaterialRequestChainSteps({
      ...base,
      scope: "general",
      status: "submitted",
    });
    assert.equal(
      generalChain.some((step) => step.key === "pm_reviewed"),
      false,
      "general scope keeps the single-step chain",
    );
  });
});
