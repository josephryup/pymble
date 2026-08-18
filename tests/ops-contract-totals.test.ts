import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  computeOpsContractTotals,
  opsContractMilestoneAmount,
  roundOpsMoney,
} from "../src/lib/ops/contracts";

/**
 * The money on a contract is derived, never typed.
 *
 * The instrument this module was built from carried two arithmetic defects: a
 * total that did not agree with its own line amounts, and a "VAT (16%)" row
 * against a blank figure with a total equal to the net. Both are unrepresentable
 * once the numbers come from here, and these tests are what keeps them that way.
 */

describe("contract totals", () => {
  it("sums the priced lines", () => {
    const totals = computeOpsContractTotals({
      lineAmounts: [170000, 88000],
      vatApplicable: false,
      vatPercent: 16,
    });

    // The Costern figures: 170,000 + 88,000 = 258,000.
    assert.equal(totals.subtotal, 258000);
    assert.equal(totals.total, 258000);
  });

  it("charges no VAT when VAT does not apply, whatever the percent says", () => {
    // The exact ambiguity in the source document: a 16% rate sitting next to a
    // total that was really the net. If vat_applicable is false the rate is
    // inert, and the total must equal the subtotal.
    const totals = computeOpsContractTotals({
      lineAmounts: [258000],
      vatApplicable: false,
      vatPercent: 16,
    });

    assert.equal(totals.vatAmount, 0);
    assert.equal(totals.total, totals.subtotal);
  });

  it("charges VAT when it does apply", () => {
    const totals = computeOpsContractTotals({
      lineAmounts: [258000],
      vatApplicable: true,
      vatPercent: 16,
    });

    assert.equal(totals.vatAmount, 41280);
    assert.equal(totals.total, 299280);
  });

  it("rounds to whole ngwee rather than carrying float noise", () => {
    const totals = computeOpsContractTotals({
      lineAmounts: [0.1, 0.2],
      vatApplicable: false,
      vatPercent: 0,
    });

    // 0.1 + 0.2 is 0.30000000000000004 in IEEE 754.
    assert.equal(totals.subtotal, 0.3);
  });

  it("treats an empty contract as zero, not NaN", () => {
    const totals = computeOpsContractTotals({
      lineAmounts: [],
      vatApplicable: true,
      vatPercent: 16,
    });

    assert.equal(totals.subtotal, 0);
    assert.equal(totals.vatAmount, 0);
    assert.equal(totals.total, 0);
  });
});

describe("milestone amounts", () => {
  it("derives cash from the percentage of the total", () => {
    // The source payment plan: 30 / 25 / 20 / 20 / 5 against 258,000.
    assert.equal(opsContractMilestoneAmount(258000, 30), 77400);
    assert.equal(opsContractMilestoneAmount(258000, 25), 64500);
    assert.equal(opsContractMilestoneAmount(258000, 20), 51600);
    assert.equal(opsContractMilestoneAmount(258000, 5), 12900);
  });

  it("reconstitutes the whole contract when the plan totals 100%", () => {
    const plan = [30, 25, 20, 20, 5];
    const sum = plan.reduce(
      (total, percent) => total + opsContractMilestoneAmount(258000, percent),
      0,
    );

    assert.equal(roundOpsMoney(sum), 258000);
  });

  it("survives a total that does not divide cleanly", () => {
    // 1/3 of an odd amount: the parts must still round to sensible ngwee and
    // not drift more than a toea from the whole.
    const plan = [33.333, 33.333, 33.334];
    const sum = plan.reduce(
      (total, percent) => total + opsContractMilestoneAmount(100000.01, percent),
      0,
    );

    assert.ok(Math.abs(roundOpsMoney(sum) - 100000.01) < 0.05);
  });

  it("is zero for a zero-value contract rather than NaN", () => {
    assert.equal(opsContractMilestoneAmount(0, 30), 0);
  });
});
