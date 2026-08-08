import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeBudgetAvailability,
  decideBudgetControl,
  DEFAULT_BUDGET_CONTROL_THRESHOLDS,
  EMPTY_BUDGET_POSITION,
  type BudgetPositionInput,
} from "../src/lib/ops/budget-availability";

function position(patch: Partial<BudgetPositionInput>): BudgetPositionInput {
  return { ...EMPTY_BUDGET_POSITION, ...patch };
}

describe("computeBudgetAvailability", () => {
  it("sums every live station into consumed", () => {
    const result = computeBudgetAvailability(
      position({
        budgeted: 100_000,
        reserved: 10_000,
        committed: 20_000,
        accrued: 5_000,
        actual: 15_000,
        paid: 0,
      }),
    );

    assert.equal(result.consumed, 50_000);
    assert.equal(result.available, 50_000);
    assert.equal(result.usedPercent, 50);
  });

  it("reports negative availability rather than clamping at zero", () => {
    const result = computeBudgetAvailability(
      position({ budgeted: 100, committed: 150 }),
    );

    assert.equal(result.available, -50);
    assert.equal(result.usedPercent, 150);
  });

  it("returns a null used-percent when spend exists with no budget", () => {
    const result = computeBudgetAvailability(position({ budgeted: 0, reserved: 500 }));

    assert.equal(result.usedPercent, null);
    assert.equal(result.available, -500);
  });

  it("returns zero, not null, when there is neither budget nor spend", () => {
    const result = computeBudgetAvailability(position({}));
    assert.equal(result.usedPercent, 0);
  });
});

describe("decideBudgetControl", () => {
  const thresholds = DEFAULT_BUDGET_CONTROL_THRESHOLDS;

  it("passes silently well inside budget", () => {
    const decision = decideBudgetControl({
      position: position({ budgeted: 100_000 }),
      amount: 10_000,
      thresholds,
    });

    assert.equal(decision.band, "ok");
    assert.equal(decision.requiresReason, false);
    assert.equal(decision.escalateToLeadership, false);
    assert.equal(decision.projected.available, 90_000);
  });

  it("warns between the warn and reason thresholds", () => {
    const decision = decideBudgetControl({
      position: position({ budgeted: 100_000, committed: 85_000 }),
      amount: 10_000,
      thresholds,
    });

    assert.equal(decision.band, "warn");
    assert.equal(decision.requiresReason, false);
    assert.match(decision.message, /would remain/);
  });

  it("requires a reason once over budget but inside tolerance", () => {
    const decision = decideBudgetControl({
      position: position({ budgeted: 100_000, committed: 100_000 }),
      amount: 5_000,
      thresholds,
    });

    assert.equal(decision.band, "reason_required");
    assert.equal(decision.requiresReason, true);
    assert.equal(decision.escalateToLeadership, false);
    assert.equal(decision.projected.available, -5_000);
  });

  it("escalates beyond the tolerance", () => {
    const decision = decideBudgetControl({
      position: position({ budgeted: 100_000, committed: 100_000 }),
      amount: 20_000,
      thresholds,
    });

    assert.equal(decision.band, "escalate");
    assert.equal(decision.requiresReason, true);
    assert.equal(decision.escalateToLeadership, true);
    assert.match(decision.message, /Managing Director/);
  });

  it("never blocks, in any band — including far over budget", () => {
    for (const amount of [0, 1_000, 500_000, 10_000_000]) {
      const decision = decideBudgetControl({
        position: position({ budgeted: 1_000 }),
        amount,
        thresholds,
      });
      assert.equal(decision.allowed, true, `amount ${amount} must still be allowed`);
    }
  });

  it("escalates spend on an unfunded cost code (the site 0003 shape)", () => {
    const decision = decideBudgetControl({
      position: position({ budgeted: 0 }),
      amount: 151_531,
      thresholds,
    });

    assert.equal(decision.band, "escalate");
    assert.equal(decision.escalateToLeadership, true);
    assert.match(decision.message, /no budget/);
  });

  it("does not escalate a zero-amount check on an unfunded code", () => {
    const decision = decideBudgetControl({
      position: position({ budgeted: 0 }),
      amount: 0,
      thresholds,
    });

    assert.equal(decision.band, "ok");
  });

  it("counts the proposed amount on top of existing reservations", () => {
    // A second request against a code already holding a reservation must see
    // the first one — this is the whole point of reserving at approval.
    const decision = decideBudgetControl({
      position: position({ budgeted: 100_000, reserved: 95_000 }),
      amount: 10_000,
      thresholds,
    });

    assert.equal(decision.projected.consumed, 105_000);
    assert.equal(decision.band, "reason_required");
  });

  it("honours management-configured thresholds over the defaults", () => {
    const strict = { warnPercent: 50, reasonPercent: 60, escalatePercent: 70 };
    const decision = decideBudgetControl({
      position: position({ budgeted: 100_000 }),
      amount: 55_000,
      thresholds: strict,
    });

    assert.equal(decision.band, "warn");

    const escalating = decideBudgetControl({
      position: position({ budgeted: 100_000 }),
      amount: 75_000,
      thresholds: strict,
    });

    assert.equal(escalating.band, "escalate");
  });
});

describe("decideBudgetControl — contingency codes", () => {
  const thresholds = DEFAULT_BUDGET_CONTROL_THRESHOLDS;

  // The contingency leaf is the designed destination for off-schedule spend,
  // so it receives requests constantly. Escalating every one of them (which is
  // what an unfunded code normally does) produced an alert that never varied
  // and therefore carried no information — 232 items on one site alone.
  it("asks for a reason rather than escalating when contingency is unfunded", () => {
    const decision = decideBudgetControl({
      position: position({ budgeted: 0 }),
      amount: 40_000,
      isContingencyCode: true,
      thresholds,
    });

    assert.equal(decision.band, "reason_required");
    assert.equal(decision.requiresReason, true);
    assert.equal(decision.escalateToLeadership, false);
    assert.match(decision.message, /contingency allowance is not set/);
  });

  it("still escalates an unfunded code that is NOT contingency", () => {
    const decision = decideBudgetControl({
      position: position({ budgeted: 0 }),
      amount: 40_000,
      isContingencyCode: false,
      thresholds,
    });

    assert.equal(decision.band, "escalate");
    assert.equal(decision.escalateToLeadership, true);
  });

  it("escalates a FUNDED contingency once it blows past the tolerance", () => {
    // The softening only covers "nothing to measure against". Once an
    // allowance exists, contingency is judged like any other code.
    const decision = decideBudgetControl({
      position: position({ budgeted: 100_000, reserved: 100_000 }),
      amount: 50_000,
      isContingencyCode: true,
      thresholds,
    });

    assert.equal(decision.band, "escalate");
    assert.equal(decision.escalateToLeadership, true);
  });

  it("leaves a contingency inside its allowance alone", () => {
    const decision = decideBudgetControl({
      position: position({ budgeted: 100_000 }),
      amount: 10_000,
      isContingencyCode: true,
      thresholds,
    });

    assert.equal(decision.band, "ok");
    assert.equal(decision.requiresReason, false);
  });

  it("never blocks, whatever the band", () => {
    for (const isContingencyCode of [true, false]) {
      const decision = decideBudgetControl({
        position: position({ budgeted: 0 }),
        amount: 1_000_000,
        isContingencyCode,
        thresholds,
      });
      assert.equal(decision.allowed, true);
    }
  });
});
