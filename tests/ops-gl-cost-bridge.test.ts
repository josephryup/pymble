import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  creditAccountForStation,
  isPostableStation,
} from "../src/lib/ops/gl-cost-bridge";

describe("isPostableStation", () => {
  it("keeps commitments and reservations out of the general ledger", () => {
    // A commitment is not an expense. Posting one would overstate cost and
    // misstate the balance sheet — every standard system keeps them out.
    assert.equal(isPostableStation("reserved"), false);
    assert.equal(isPostableStation("committed"), false);
  });

  it("posts goods received and invoices matched", () => {
    assert.equal(isPostableStation("accrued"), true);
    assert.equal(isPostableStation("actual"), true);
  });

  it("leaves paid to the existing payment-request posting", () => {
    // Posting it here as well would double the expense.
    assert.equal(isPostableStation("paid"), false);
  });

  it("never posts a released station", () => {
    assert.equal(isPostableStation("released"), false);
  });
});

describe("creditAccountForStation", () => {
  it("credits Accruals for goods received but not yet invoiced", () => {
    assert.equal(creditAccountForStation("accrued"), "2300");
  });

  it("credits Accounts Payable once the invoice is matched", () => {
    assert.equal(creditAccountForStation("actual"), "2010");
  });
});
