import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildPaymentRequestAccrualJournal,
  buildPaymentRequestSettlementJournal,
  OPS_GL_ACCOUNTS,
  opsPaymentPayableAccount,
  type OpsPaymentRequestForPosting,
} from "../src/lib/ops/gl-journal-builders";

/**
 * General ledger treatment of payables, including the legacy ones.
 *
 * Two treatments, and picking the wrong one is a real misstatement either way.
 *
 * `current_period` (the DEFAULT) recognises the cost now. This is correct when
 * the cost was never booked anywhere — which is the actual situation for
 * Pymble's completed projects. The backlog lands in the current year's P&L
 * because that is the first time the cost has been recognised at all.
 *
 * `opening_balance` debits equity instead, and is ONLY correct when the expense
 * already sits in closed accounts and all that is missing is the liability.
 * Using it on an unrecognised cost would put the debt on the balance sheet
 * while the cost never appears in any profit and loss account, in any year —
 * understating cost permanently rather than shifting it.
 */

const bill = (over: Partial<OpsPaymentRequestForPosting> = {}): OpsPaymentRequestForPosting => ({
  id: "11111111-1111-4111-8111-111111111111",
  request_number: "PAY-20260805-ABC123",
  title: "Reinforcement steel",
  site_id: null,
  payment_type: "supplier_invoice",
  amount: 12_500,
  ...over,
});

const totals = (lines: { debit?: number; credit?: number }[]) => ({
  debit: lines.reduce((sum, line) => sum + (line.debit ?? 0), 0),
  credit: lines.reduce((sum, line) => sum + (line.credit ?? 0), 0),
});

describe("every payable journal balances", () => {
  for (const treatment of ["opening_balance", "current_period", null] as const) {
    it(`accrual balances for treatment=${treatment ?? "none"}`, () => {
      const { lines } = buildPaymentRequestAccrualJournal(
        bill({ cost_treatment: treatment }),
        "2026-08-05",
      );
      const { debit, credit } = totals(lines);
      assert.equal(debit, credit);
      assert.equal(debit, 12_500);
    });
  }

  it("settlement balances", () => {
    const { lines } = buildPaymentRequestSettlementJournal(bill(), "2026-08-05");
    const { debit, credit } = totals(lines);
    assert.equal(debit, credit);
  });
});

describe("legacy payable — opening balance treatment", () => {
  const { lines } = buildPaymentRequestAccrualJournal(
    bill({ cost_treatment: "opening_balance" }),
    "2026-08-05",
  );

  it("debits retained earnings, not an expense account", () => {
    assert.equal(lines[0].account_code, OPS_GL_ACCOUNTS.retainedEarnings);
  });

  it("does not touch any profit-and-loss account", () => {
    // The whole point: recording an old debt must not move this year's profit.
    const plAccounts = [
      OPS_GL_ACCOUNTS.materials,
      OPS_GL_ACCOUNTS.subcontractorCosts,
      OPS_GL_ACCOUNTS.directLabour,
      OPS_GL_ACCOUNTS.otherDirectCosts,
    ];
    for (const line of lines) {
      assert.ok(
        !plAccounts.includes(line.account_code as never),
        `opening balance hit P&L account ${line.account_code}`,
      );
    }
  });

  it("still raises the liability", () => {
    assert.equal(lines[1].account_code, OPS_GL_ACCOUNTS.accountsPayable);
    assert.equal(lines[1].credit, 12_500);
  });
});

describe("legacy payable — current period treatment (the default)", () => {
  it("recognises the cost, because it was never recognised before", () => {
    // The whole reason this is the default: Pymble's completed-project costs
    // were never booked. An unrecognised cost has to be recognised somewhere,
    // and the only correct place is an expense account.
    const { lines } = buildPaymentRequestAccrualJournal(
      bill({ cost_treatment: "current_period" }),
      "2026-08-05",
    );
    const expenseLine = lines.find((line) => line.debit);
    assert.equal(expenseLine?.account_code, OPS_GL_ACCOUNTS.materials);
    assert.notEqual(expenseLine?.account_code, OPS_GL_ACCOUNTS.retainedEarnings);
  });

  it("debits the normal expense account", () => {
    const { lines } = buildPaymentRequestAccrualJournal(
      bill({ cost_treatment: "current_period" }),
      "2026-08-05",
    );
    assert.equal(lines[0].account_code, OPS_GL_ACCOUNTS.materials);
  });

  it("matches an ordinary site bill exactly", () => {
    // A current-period legacy payable is just a late bill; it should be
    // indistinguishable in the ledger from any other bill of the same type.
    const legacy = buildPaymentRequestAccrualJournal(
      bill({ cost_treatment: "current_period" }),
      "2026-08-05",
    );
    const ordinary = buildPaymentRequestAccrualJournal(
      bill({ cost_treatment: null, site_id: "22222222-2222-4222-8222-222222222222" }),
      "2026-08-05",
    );
    assert.deepEqual(
      legacy.lines.map((l) => l.account_code),
      ordinary.lines.map((l) => l.account_code),
    );
  });
});

describe("payables land in the right liability account", () => {
  it("subcontractor payables use 2050, not generic AP", () => {
    assert.equal(
      opsPaymentPayableAccount("subcontractor"),
      OPS_GL_ACCOUNTS.subcontractorPayable,
    );
    const { lines } = buildPaymentRequestAccrualJournal(
      bill({ payment_type: "subcontractor" }),
      "2026-08-05",
    );
    assert.equal(lines[1].account_code, OPS_GL_ACCOUNTS.subcontractorPayable);
  });

  it("everything else uses 2010", () => {
    for (const type of ["supplier_invoice", "expense", "payroll", "tax", "other"] as const) {
      assert.equal(opsPaymentPayableAccount(type), OPS_GL_ACCOUNTS.accountsPayable, type);
    }
  });

  it("settles from the same account it accrued into", () => {
    // Accruing to 2050 and settling from 2010 would leave a permanent phantom
    // balance in both accounts.
    for (const type of ["subcontractor", "supplier_invoice"] as const) {
      const accrual = buildPaymentRequestAccrualJournal(bill({ payment_type: type }), "2026-08-05");
      const settle = buildPaymentRequestSettlementJournal(bill({ payment_type: type }), "2026-08-05");

      const accrued = accrual.lines.find((line) => line.credit)?.account_code;
      const settled = settle.lines.find((line) => line.debit)?.account_code;
      assert.equal(settled, accrued, `${type} accrues to ${accrued} but settles from ${settled}`);
    }
  });
});

describe("a legacy payable carries no site tag", () => {
  it("leaves site_id null on the ledger line", () => {
    const { lines } = buildPaymentRequestAccrualJournal(
      bill({ cost_treatment: "opening_balance", site_id: null }),
      "2026-08-05",
    );
    assert.equal(lines[0].site_id ?? null, null);
  });
});
