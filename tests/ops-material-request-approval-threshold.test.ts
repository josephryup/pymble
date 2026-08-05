import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  materialRequestApprovalSteps,
  type OpsMaterialRequestApprovalThreshold,
} from "../src/lib/ops/material-request-permissions";

/**
 * Value-based escalation on the material request chain.
 *
 * Before this, `materialRequestApprovalSteps` accepted an estimated total and
 * discarded it (`void _estimatedTotal`), so a K200 request and a K200,000
 * request took the identical two-step chain. These tests pin the escalation
 * and, more importantly, the property that makes a misconfigured threshold
 * safe: escalation can only ever ADD an approver.
 */

const threshold: OpsMaterialRequestApprovalThreshold = {
  threshold_amount: 25000,
  threshold_enabled: true,
  threshold_step_role: "managing_director",
};

const roles = (total: number, scope: "site" | "it" = "site") =>
  materialRequestApprovalSteps("normal", total, scope, threshold).map(
    (step) => step.approverRole,
  );

describe("material request approval chain", () => {
  it("keeps the two-step site chain below the threshold", () => {
    assert.deepEqual(roles(24_999), ["projects_manager", "operations_manager"]);
  });

  it("adds the Managing Director at the threshold", () => {
    assert.deepEqual(roles(25_000), [
      "projects_manager",
      "operations_manager",
      "managing_director",
    ]);
  });

  it("adds the Managing Director above the threshold", () => {
    assert.deepEqual(roles(250_000), [
      "projects_manager",
      "operations_manager",
      "managing_director",
    ]);
  });

  it("escalates non-site scope too, from its shorter base chain", () => {
    assert.deepEqual(roles(1_000, "it"), ["operations_manager"]);
    assert.deepEqual(roles(90_000, "it"), ["operations_manager", "managing_director"]);
  });

  it("numbers steps consecutively from one", () => {
    const steps = materialRequestApprovalSteps("normal", 90_000, "site", threshold);
    assert.deepEqual(
      steps.map((step) => step.stepNumber),
      [1, 2, 3],
    );
  });

  it("gives every step a human label", () => {
    const steps = materialRequestApprovalSteps("normal", 90_000, "site", threshold);
    for (const step of steps) {
      assert.ok(step.label.length > 0, `${step.approverRole} has no label`);
    }
  });
});

describe("threshold is fail-safe", () => {
  it("falls back to the base chain when no threshold is configured", () => {
    assert.deepEqual(
      materialRequestApprovalSteps("normal", 10_000_000, "site").map((s) => s.approverRole),
      ["projects_manager", "operations_manager"],
    );
  });

  it("ignores the threshold when disabled", () => {
    const off = { ...threshold, threshold_enabled: false };
    assert.deepEqual(
      materialRequestApprovalSteps("normal", 10_000_000, "site", off).map((s) => s.approverRole),
      ["projects_manager", "operations_manager"],
    );
  });

  it("ignores the threshold when no escalation role is set", () => {
    const noRole = { ...threshold, threshold_step_role: null };
    assert.deepEqual(
      materialRequestApprovalSteps("normal", 10_000_000, "site", noRole).map(
        (s) => s.approverRole,
      ),
      ["projects_manager", "operations_manager"],
    );
  });

  it("never SHORTENS the chain, whatever the threshold says", () => {
    // The safety property. A misconfigured threshold can add a redundant
    // approver; it must never be able to remove one, because that would turn a
    // settings mistake into a weakened financial control.
    const base = materialRequestApprovalSteps("normal", 0, "site").length;

    for (const amount of [0, 1, 24_999, 25_000, 1_000_000]) {
      for (const escalation of [null, threshold, { ...threshold, threshold_amount: 0 }]) {
        const length = materialRequestApprovalSteps("normal", amount, "site", escalation).length;
        assert.ok(
          length >= base,
          `chain shortened to ${length} (base ${base}) at ${amount}`,
        );
      }
    }
  });

  it("does not ask the same role twice", () => {
    // If the escalation role is already in the base chain, it must not appear
    // as a second pending step that nobody can action separately.
    const duplicate = { ...threshold, threshold_step_role: "operations_manager" as const };
    const chain = materialRequestApprovalSteps("normal", 90_000, "site", duplicate).map(
      (s) => s.approverRole,
    );

    assert.deepEqual(chain, [...new Set(chain)]);
  });
});
