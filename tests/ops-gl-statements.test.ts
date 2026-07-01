import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  summarizeBalanceSheet,
  summarizeCashFlow,
  summarizeProfitAndLoss,
  type OpsStatementAccountRow,
} from "../src/lib/ops/gl-statements";

function row(partial: Partial<OpsStatementAccountRow> & Pick<OpsStatementAccountRow, "code">): OpsStatementAccountRow {
  return {
    account_id: partial.code,
    code: partial.code,
    name: partial.name ?? partial.code,
    account_type: partial.account_type ?? "asset",
    account_subtype: partial.account_subtype ?? "general",
    debit: partial.debit ?? 0,
    credit: partial.credit ?? 0,
  };
}

describe("summarizeProfitAndLoss", () => {
  it("splits cost-of-sales from operating expenses and computes gross/net profit", () => {
    const rows: OpsStatementAccountRow[] = [
      row({ code: "4010", name: "Contract Revenue", account_type: "income", account_subtype: "revenue", credit: 100000 }),
      row({ code: "5010", name: "Materials", account_type: "expense", account_subtype: "cogs", debit: 40000 }),
      row({ code: "5020", name: "Subcontractor Costs", account_type: "expense", account_subtype: "cogs", debit: 20000 }),
      row({ code: "6010", name: "Office Salaries", account_type: "expense", account_subtype: "opex", debit: 15000 }),
      row({ code: "6080", name: "Depreciation Expense", account_type: "expense", account_subtype: "depreciation", debit: 5000 }),
      // Inactive accounts (no posted activity) must not appear.
      row({ code: "4100", name: "Other Income", account_type: "income", account_subtype: "other_income" }),
    ];

    const pnl = summarizeProfitAndLoss(rows);

    assert.equal(pnl.totalIncome, 100000);
    assert.equal(pnl.totalCostOfSales, 60000);
    assert.equal(pnl.grossProfit, 40000);
    assert.equal(pnl.grossMarginPct, 40);
    assert.equal(pnl.totalOperatingExpenses, 20000);
    assert.equal(pnl.netProfit, 20000);
    assert.equal(pnl.income.length, 1);
    assert.equal(pnl.costOfSales.length, 2);
    assert.equal(pnl.operatingExpenses.length, 2);
    assert.equal(pnl.hasActivity, true);
  });

  it("reports no activity and null margin when nothing has posted", () => {
    const pnl = summarizeProfitAndLoss([
      row({ code: "4010", account_type: "income" }),
      row({ code: "5010", account_type: "expense", account_subtype: "cogs" }),
    ]);

    assert.equal(pnl.hasActivity, false);
    assert.equal(pnl.grossMarginPct, null);
    assert.equal(pnl.netProfit, 0);
  });
});

describe("summarizeBalanceSheet", () => {
  it("balances when current year earnings folds in the P&L net profit", () => {
    const rows: OpsStatementAccountRow[] = [
      row({ code: "1010", name: "Bank", account_type: "asset", account_subtype: "bank", debit: 80000 }),
      row({ code: "1100", name: "Accounts Receivable", account_type: "asset", account_subtype: "accounts_receivable", debit: 20000 }),
      row({ code: "2010", name: "Accounts Payable", account_type: "liability", account_subtype: "accounts_payable", credit: 30000 }),
      row({ code: "3010", name: "Share Capital", account_type: "equity", account_subtype: "equity", credit: 50000 }),
    ];
    const currentYearEarnings = 20000; // assets (100000) - liabilities (30000) - posted equity (50000)

    const balanceSheet = summarizeBalanceSheet(rows, currentYearEarnings);

    assert.equal(balanceSheet.totalAssets, 100000);
    assert.equal(balanceSheet.totalLiabilities, 30000);
    assert.equal(balanceSheet.totalEquity, 70000);
    assert.equal(balanceSheet.balanced, true);
    assert.equal(
      balanceSheet.totalAssets,
      balanceSheet.totalLiabilities + balanceSheet.totalEquity,
    );
  });

  it("flags an out-of-balance ledger rather than silently hiding it", () => {
    const rows: OpsStatementAccountRow[] = [
      row({ code: "1010", account_type: "asset", account_subtype: "bank", debit: 100 }),
      row({ code: "2010", account_type: "liability", account_subtype: "accounts_payable", credit: 40 }),
    ];

    const balanceSheet = summarizeBalanceSheet(rows, 0);

    assert.equal(balanceSheet.balanced, false);
  });
});

describe("summarizeCashFlow", () => {
  it("groups movements by source and reconciles to the closing balance", () => {
    const movements = [
      { source_table: "invoices", net: 11600 },
      { source_table: "invoices", net: -5000 },
      { source_table: "payment_requests", net: -8200 },
      { source_table: "payroll_runs", net: -38000 },
    ];

    const cashFlow = summarizeCashFlow(movements, 11600 - 5000 - 8200 - 38000);

    assert.equal(cashFlow.lines.length, 3);
    const invoiceLine = cashFlow.lines.find((line) => line.category === "Receipts from customers");
    assert.equal(invoiceLine?.amount, 6600);
    assert.equal(cashFlow.netCashMovement, 6600 - 8200 - 38000);
    assert.equal(cashFlow.closingCashBalance, cashFlow.netCashMovement);
    assert.equal(cashFlow.hasActivity, true);
  });

  it("omits zero-net categories and reports no activity when nothing moved", () => {
    const cashFlow = summarizeCashFlow([{ source_table: "invoices", net: 100 }, { source_table: "invoices", net: -100 }], 0);

    assert.equal(cashFlow.lines.length, 0);
    assert.equal(cashFlow.hasActivity, false);
  });

  it("labels an unrecognised source table as Other movements", () => {
    const cashFlow = summarizeCashFlow([{ source_table: "manual_adjustment", net: 500 }], 500);
    assert.equal(cashFlow.lines[0]?.category, "Other movements");
  });
});
