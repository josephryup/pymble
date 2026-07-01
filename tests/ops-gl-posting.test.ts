import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildInvoiceIssueJournal,
  buildInvoicePaymentJournal,
  buildPaymentRequestAccrualJournal,
  buildPaymentRequestSettlementJournal,
  buildPayrollDisbursementJournal,
  OPS_GL_ACCOUNTS,
  opsPaymentExpenseAccount,
  type OpsGlPostingInput,
  type OpsInvoiceForPosting,
  type OpsPaymentRequestForPosting,
  type OpsPayrollRunForPosting,
} from "../src/lib/ops/gl-journal-builders";

function sumDebit(entry: OpsGlPostingInput) {
  return entry.lines.reduce((total, line) => total + (line.debit ?? 0), 0);
}

function sumCredit(entry: OpsGlPostingInput) {
  return entry.lines.reduce((total, line) => total + (line.credit ?? 0), 0);
}

function assertSingleSided(entry: OpsGlPostingInput) {
  for (const line of entry.lines) {
    const debit = line.debit ?? 0;
    const credit = line.credit ?? 0;
    assert.equal(
      debit > 0 !== credit > 0,
      true,
      `line for ${line.account_code} must have exactly one of debit/credit`,
    );
  }
}

const invoiceWithVat: OpsInvoiceForPosting = {
  id: "11111111-1111-1111-1111-111111111111",
  invoice_number: "PCL-2026-0001",
  client_name: "Acme Holdings",
  site_id: "22222222-2222-2222-2222-222222222222",
  subtotal: 10000,
  vat_amount: 1600,
  total_amount: 11600,
};

const invoiceNoVat: OpsInvoiceForPosting = {
  ...invoiceWithVat,
  invoice_number: "PCL-2026-0002",
  subtotal: 5000,
  vat_amount: 0,
  total_amount: 5000,
};

describe("GL invoice journal builders", () => {
  it("issue journal balances with VAT and tags revenue + output VAT", () => {
    const entry = buildInvoiceIssueJournal(invoiceWithVat, "2026-06-30");

    assert.equal(entry.lines.length, 3);
    assert.equal(sumDebit(entry), 11600);
    assert.equal(sumCredit(entry), 11600);
    assert.equal(sumDebit(entry), sumCredit(entry));
    assertSingleSided(entry);
    assert.equal(entry.sourceEvent, "invoice_issued");

    const ar = entry.lines.find((line) => line.account_code === OPS_GL_ACCOUNTS.accountsReceivable);
    const revenue = entry.lines.find(
      (line) => line.account_code === OPS_GL_ACCOUNTS.contractRevenueCertified,
    );
    const vat = entry.lines.find((line) => line.account_code === OPS_GL_ACCOUNTS.outputVat);
    assert.equal(ar?.debit, 11600);
    assert.equal(revenue?.credit, 10000);
    assert.equal(vat?.credit, 1600);
    // Job-costing tag carried on the revenue/receivable lines.
    assert.equal(ar?.site_id, invoiceWithVat.site_id);
    assert.equal(revenue?.site_id, invoiceWithVat.site_id);
  });

  it("issue journal omits the VAT line when VAT is zero and still balances", () => {
    const entry = buildInvoiceIssueJournal(invoiceNoVat, "2026-06-30");

    assert.equal(entry.lines.length, 2);
    assert.equal(
      entry.lines.some((line) => line.account_code === OPS_GL_ACCOUNTS.outputVat),
      false,
    );
    assert.equal(sumDebit(entry), 5000);
    assert.equal(sumCredit(entry), 5000);
    assertSingleSided(entry);
  });

  it("payment journal moves the gross receivable into the bank and balances", () => {
    const entry = buildInvoicePaymentJournal(invoiceWithVat, "2026-06-30");

    assert.equal(entry.lines.length, 2);
    assert.equal(sumDebit(entry), 11600);
    assert.equal(sumCredit(entry), 11600);
    assertSingleSided(entry);
    assert.equal(entry.sourceEvent, "invoice_paid");

    const bank = entry.lines.find((line) => line.account_code === OPS_GL_ACCOUNTS.bankMain);
    const ar = entry.lines.find((line) => line.account_code === OPS_GL_ACCOUNTS.accountsReceivable);
    assert.equal(bank?.debit, 11600);
    assert.equal(ar?.credit, 11600);
  });
});

const supplierBill: OpsPaymentRequestForPosting = {
  id: "44444444-4444-4444-4444-444444444444",
  request_number: "PAY-20260630-AAAAAA",
  title: "Cement delivery",
  site_id: "22222222-2222-2222-2222-222222222222",
  payment_type: "supplier_invoice",
  amount: 8200,
};

const subcontractorBill: OpsPaymentRequestForPosting = {
  ...supplierBill,
  request_number: "PAY-20260630-BBBBBB",
  payment_type: "subcontractor",
  amount: 15000,
};

describe("GL payment request (accounts payable) journal builders", () => {
  it("accrual journal debits the cost account by payment type and credits AP", () => {
    const entry = buildPaymentRequestAccrualJournal(supplierBill, "2026-06-30");

    assert.equal(entry.lines.length, 2);
    assert.equal(sumDebit(entry), 8200);
    assert.equal(sumCredit(entry), 8200);
    assertSingleSided(entry);
    assert.equal(entry.sourceEvent, "payment_accrued");

    const cost = entry.lines.find(
      (line) => line.account_code === opsPaymentExpenseAccount("supplier_invoice"),
    );
    const ap = entry.lines.find((line) => line.account_code === OPS_GL_ACCOUNTS.accountsPayable);
    assert.equal(cost?.account_code, OPS_GL_ACCOUNTS.materials);
    assert.equal(cost?.debit, 8200);
    assert.equal(cost?.site_id, supplierBill.site_id);
    assert.equal(ap?.credit, 8200);
  });

  it("routes subcontractor bills to the subcontractor cost account", () => {
    const entry = buildPaymentRequestAccrualJournal(subcontractorBill, "2026-06-30");
    const cost = entry.lines.find(
      (line) => line.account_code === OPS_GL_ACCOUNTS.subcontractorCosts,
    );
    assert.equal(cost?.debit, 15000);
    assert.equal(sumDebit(entry), sumCredit(entry));
  });

  it("settlement journal clears AP into the bank and balances", () => {
    const entry = buildPaymentRequestSettlementJournal(
      { ...supplierBill, payment_reference: "EFT-0042" },
      "2026-06-30",
    );

    assert.equal(entry.lines.length, 2);
    assert.equal(sumDebit(entry), 8200);
    assert.equal(sumCredit(entry), 8200);
    assertSingleSided(entry);
    assert.equal(entry.sourceEvent, "payment_paid");

    const ap = entry.lines.find((line) => line.account_code === OPS_GL_ACCOUNTS.accountsPayable);
    const bank = entry.lines.find((line) => line.account_code === OPS_GL_ACCOUNTS.bankMain);
    assert.equal(ap?.debit, 8200);
    assert.equal(bank?.credit, 8200);
    assert.match(bank?.description ?? "", /EFT-0042/);
  });
});

describe("GL payroll disbursement journal builder", () => {
  it("balances when gross equals net + PAYE + employee NAPSA + advances", () => {
    const run: OpsPayrollRunForPosting = {
      id: "55555555-5555-5555-5555-555555555555",
      period_label: "June 2026",
      gross: 50000,
      net: 38000,
      paye: 8000,
      napsa_employee: 2500,
      napsa_employer: 2500,
      wcf: 500,
      advances: 1500,
    };
    // Sanity: the fixture itself must satisfy the payslip identity.
    assert.equal(run.net + run.paye + run.napsa_employee + run.advances, run.gross);

    const entry = buildPayrollDisbursementJournal(run, "2026-06-30");

    assert.equal(sumDebit(entry), sumCredit(entry));
    assertSingleSided(entry);
    assert.equal(entry.sourceEvent, "payroll_disbursed");

    const labour = entry.lines.find((line) => line.account_code === OPS_GL_ACCOUNTS.directLabour);
    const bank = entry.lines.find((line) => line.account_code === OPS_GL_ACCOUNTS.bankMain);
    const paye = entry.lines.find((line) => line.account_code === OPS_GL_ACCOUNTS.payePayable);
    const napsa = entry.lines.filter((line) => line.account_code === OPS_GL_ACCOUNTS.napsaPayable);
    const wcf = entry.lines.find((line) => line.account_code === OPS_GL_ACCOUNTS.wcfPayable);
    const employerExpense = entry.lines.find(
      (line) => line.account_code === OPS_GL_ACCOUNTS.employerStatutory,
    );

    assert.equal(labour?.debit, 50000);
    assert.equal(bank?.credit, 38000);
    assert.equal(paye?.credit, 8000);
    // Employee NAPSA credited from the gross block, employer NAPSA credited
    // from the employer-cost block — two distinct lines on the same account.
    assert.equal(napsa.length, 2);
    assert.equal(
      napsa.reduce((sum, line) => sum + (line.credit ?? 0), 0),
      5000,
    );
    assert.equal(wcf?.credit, 500);
    assert.equal(employerExpense?.debit, 3000);
  });

  it("omits zero-valued statutory lines while still balancing", () => {
    const run: OpsPayrollRunForPosting = {
      id: "66666666-6666-6666-6666-666666666666",
      period_label: "July 2026",
      gross: 10000,
      net: 10000,
      paye: 0,
      napsa_employee: 0,
      napsa_employer: 0,
      wcf: 0,
      advances: 0,
    };

    const entry = buildPayrollDisbursementJournal(run, "2026-07-31");

    assert.equal(entry.lines.length, 2);
    assert.equal(sumDebit(entry), 10000);
    assert.equal(sumCredit(entry), 10000);
    assertSingleSided(entry);
  });
});
