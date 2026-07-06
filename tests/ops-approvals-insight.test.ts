import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  approvalAgeDays,
  classifyApprovalForViewer,
  type OpsApprovalInsightStep,
} from "../src/lib/ops/approvals-insight";

const NOW = new Date("2026-07-04T12:00:00Z");

function step(partial: Partial<OpsApprovalInsightStep>): OpsApprovalInsightStep {
  return {
    approval_request_id: "req-1",
    approver_role: "operations_manager",
    approver_user_id: null,
    status: "pending",
    step_label: "Operations review",
    step_number: 1,
    approver_sequence: 1,
    ...partial,
  };
}

const baseRequest = {
  id: "req-1",
  requested_by: "user-req",
  status: "submitted" as const,
  submitted_at: "2026-07-01T08:00:00Z",
};

describe("classifyApprovalForViewer", () => {
  it("flags the current step's approver as 'my turn' and names who it waits on", () => {
    const steps = [
      step({ step_number: 1, status: "approved" }),
      step({ step_number: 2, approver_role: "finance_manager", step_label: "Finance review" }),
      step({ step_number: 3, approver_role: "managing_director", step_label: "MD review" }),
    ];

    const financeView = classifyApprovalForViewer(
      { ...baseRequest, status: "in_review" },
      steps,
      { id: "user-fin", role: "finance_manager" },
      NOW,
    );
    assert.equal(financeView.isMyTurn, true);
    assert.equal(financeView.waitingOn, "Finance Manager");
    assert.equal(financeView.decidedSteps, 1);
    assert.equal(financeView.totalSteps, 3);

    // The MD's step has NOT been reached yet — not their turn.
    const mdView = classifyApprovalForViewer(
      { ...baseRequest, status: "in_review" },
      steps,
      { id: "user-md", role: "managing_director" },
      NOW,
    );
    assert.equal(mdView.isMyTurn, false);
  });

  it("never marks the requester's own request as their turn", () => {
    const steps = [step({ approver_role: "operations_manager" })];
    const view = classifyApprovalForViewer(
      baseRequest,
      steps,
      { id: "user-req", role: "operations_manager" },
      NOW,
    );
    assert.equal(view.isMine, true);
    assert.equal(view.isMyTurn, false);
  });

  it("resolved requests are nobody's turn and wait on nobody", () => {
    const steps = [step({ status: "approved" })];
    const view = classifyApprovalForViewer(
      { ...baseRequest, status: "approved" },
      steps,
      { id: "user-om", role: "operations_manager" },
      NOW,
    );
    assert.equal(view.isMyTurn, false);
    assert.equal(view.waitingOn, null);
  });

  it("marks open requests past the 2-day SLA as overdue", () => {
    const view = classifyApprovalForViewer(
      { ...baseRequest, submitted_at: "2026-06-28T08:00:00Z" },
      [step({})],
      { id: "user-x", role: "engineer" },
      NOW,
    );
    assert.equal(view.ageDays, 6);
    assert.equal(view.isOverdue, true);

    const fresh = classifyApprovalForViewer(
      { ...baseRequest, submitted_at: "2026-07-03T18:00:00Z" },
      [step({})],
      { id: "user-x", role: "engineer" },
      NOW,
    );
    assert.equal(fresh.isOverdue, false);
  });

  it("a directly assigned user gets their turn even without the role", () => {
    const steps = [step({ approver_role: null, approver_user_id: "user-direct", step_label: "Named reviewer" })];
    const view = classifyApprovalForViewer(
      baseRequest,
      steps,
      { id: "user-direct", role: "engineer" },
      NOW,
    );
    assert.equal(view.isMyTurn, true);
    assert.equal(view.waitingOn, "Named reviewer");
  });

  it("orders the chain by step number then sequence when finding the current step", () => {
    const steps = [
      step({ step_number: 2, approver_role: "finance_manager" }),
      step({ step_number: 1, status: "approved" }),
    ];
    const view = classifyApprovalForViewer(
      { ...baseRequest, status: "in_review" },
      steps,
      { id: "user-fin", role: "finance_manager" },
      NOW,
    );
    assert.equal(view.isMyTurn, true);
    assert.equal(view.decidedSteps, 1);
  });
});

describe("approvalAgeDays", () => {
  it("floors to whole days and never goes negative", () => {
    assert.equal(approvalAgeDays("2026-07-03T11:00:00Z", NOW), 1);
    assert.equal(approvalAgeDays("2026-07-04T11:59:00Z", NOW), 0);
    assert.equal(approvalAgeDays(null, NOW), 0);
    assert.equal(approvalAgeDays("2026-07-05T00:00:00Z", NOW), 0);
  });
});
