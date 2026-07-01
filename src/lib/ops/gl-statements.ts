import type { OpsGlAccountType } from "@/lib/ops/chart-of-accounts";

/**
 * Pure financial-statement aggregation. No I/O — takes the trial balance (one
 * row per postable account, with its posted debit/credit totals) and turns it
 * into Profit & Loss, Balance Sheet, and Cash Flow shapes. Since-inception
 * (no period filter yet — matches the Trial Balance, which is also
 * since-inception until period close lands in a later phase).
 */

export type OpsStatementAccountRow = {
  account_id: string;
  code: string;
  name: string;
  account_type: OpsGlAccountType;
  account_subtype: string;
  debit: number;
  credit: number;
};

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function hasActivityRow(row: OpsStatementAccountRow) {
  return row.debit !== 0 || row.credit !== 0;
}

// ---------------------------------------------------------------------------
// Profit & Loss
// ---------------------------------------------------------------------------

export type OpsProfitAndLossLine = { code: string; name: string; amount: number };

export type OpsProfitAndLoss = {
  income: OpsProfitAndLossLine[];
  costOfSales: OpsProfitAndLossLine[];
  operatingExpenses: OpsProfitAndLossLine[];
  totalIncome: number;
  totalCostOfSales: number;
  grossProfit: number;
  grossMarginPct: number | null;
  totalOperatingExpenses: number;
  netProfit: number;
  hasActivity: boolean;
};

/**
 * Cost-of-sales accounts are subtype `cogs` (5010–5090 in the seeded chart);
 * every other expense subtype (opex, depreciation) is an operating expense.
 * Income accounts are credit-normal — amount = credit - debit. Expense
 * accounts are debit-normal — amount = debit - credit.
 */
export function summarizeProfitAndLoss(rows: OpsStatementAccountRow[]): OpsProfitAndLoss {
  const activeRows = rows.filter(hasActivityRow);
  const incomeRows = activeRows.filter((row) => row.account_type === "income");
  const expenseRows = activeRows.filter((row) => row.account_type === "expense");
  const costRows = expenseRows.filter((row) => row.account_subtype === "cogs");
  const opexRows = expenseRows.filter((row) => row.account_subtype !== "cogs");

  const income = incomeRows.map((row) => ({
    code: row.code,
    name: row.name,
    amount: round2(row.credit - row.debit),
  }));
  const costOfSales = costRows.map((row) => ({
    code: row.code,
    name: row.name,
    amount: round2(row.debit - row.credit),
  }));
  const operatingExpenses = opexRows.map((row) => ({
    code: row.code,
    name: row.name,
    amount: round2(row.debit - row.credit),
  }));

  const totalIncome = round2(income.reduce((sum, line) => sum + line.amount, 0));
  const totalCostOfSales = round2(costOfSales.reduce((sum, line) => sum + line.amount, 0));
  const grossProfit = round2(totalIncome - totalCostOfSales);
  const totalOperatingExpenses = round2(
    operatingExpenses.reduce((sum, line) => sum + line.amount, 0),
  );
  const netProfit = round2(grossProfit - totalOperatingExpenses);

  return {
    income,
    costOfSales,
    operatingExpenses,
    totalIncome,
    totalCostOfSales,
    grossProfit,
    grossMarginPct: totalIncome !== 0 ? round2((grossProfit / totalIncome) * 100) : null,
    totalOperatingExpenses,
    netProfit,
    hasActivity: income.length > 0 || costOfSales.length > 0 || operatingExpenses.length > 0,
  };
}

// ---------------------------------------------------------------------------
// Balance Sheet
// ---------------------------------------------------------------------------

export type OpsBalanceSheetLine = { code: string; name: string; amount: number };

export type OpsBalanceSheet = {
  assets: OpsBalanceSheetLine[];
  liabilities: OpsBalanceSheetLine[];
  equity: OpsBalanceSheetLine[];
  currentYearEarnings: number;
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  balanced: boolean;
  hasActivity: boolean;
};

/**
 * Asset accounts are debit-normal — amount = debit - credit. Liability and
 * equity accounts are credit-normal — amount = credit - debit. Revenue and
 * expense accounts are never closed into Retained Earnings by a journal (that
 * is a period-close operation, a later phase) — so the net profit/loss to
 * date is folded in here as a computed "Current Year Earnings" line, which is
 * what makes Assets = Liabilities + Equity hold before any close happens.
 */
export function summarizeBalanceSheet(
  rows: OpsStatementAccountRow[],
  currentYearEarnings: number,
): OpsBalanceSheet {
  const activeRows = rows.filter(hasActivityRow);
  const assetRows = activeRows.filter((row) => row.account_type === "asset");
  const liabilityRows = activeRows.filter((row) => row.account_type === "liability");
  const equityRows = activeRows.filter((row) => row.account_type === "equity");

  const assets = assetRows.map((row) => ({
    code: row.code,
    name: row.name,
    amount: round2(row.debit - row.credit),
  }));
  const liabilities = liabilityRows.map((row) => ({
    code: row.code,
    name: row.name,
    amount: round2(row.credit - row.debit),
  }));
  const equity = equityRows.map((row) => ({
    code: row.code,
    name: row.name,
    amount: round2(row.credit - row.debit),
  }));

  const totalAssets = round2(assets.reduce((sum, line) => sum + line.amount, 0));
  const totalLiabilities = round2(liabilities.reduce((sum, line) => sum + line.amount, 0));
  const postedEquity = round2(equity.reduce((sum, line) => sum + line.amount, 0));
  const roundedEarnings = round2(currentYearEarnings);
  const totalEquity = round2(postedEquity + roundedEarnings);

  return {
    assets,
    liabilities,
    equity,
    currentYearEarnings: roundedEarnings,
    totalAssets,
    totalLiabilities,
    totalEquity,
    balanced: totalAssets === round2(totalLiabilities + totalEquity),
    hasActivity:
      assets.length > 0 || liabilities.length > 0 || equity.length > 0 || roundedEarnings !== 0,
  };
}

// ---------------------------------------------------------------------------
// Cash Flow Statement
// ---------------------------------------------------------------------------

export type OpsCashFlowMovement = { source_table: string | null; net: number };

export type OpsCashFlowLine = { category: string; amount: number };

export type OpsCashFlowStatement = {
  lines: OpsCashFlowLine[];
  netCashMovement: number;
  closingCashBalance: number;
  hasActivity: boolean;
};

const CASH_FLOW_CATEGORY_LABELS: Record<string, string> = {
  invoices: "Receipts from customers",
  payment_requests: "Payments to suppliers and subcontractors",
  payroll_runs: "Payments to employees",
};

function cashFlowCategoryLabel(sourceTable: string | null) {
  if (!sourceTable) {
    return "Other movements";
  }
  return CASH_FLOW_CATEGORY_LABELS[sourceTable] ?? "Other movements";
}

/**
 * Direct-method cash flow: every posted journal line touching a bank/cash
 * account, grouped by the subledger that caused it. A bank/cash account is
 * debit-normal, so net = debit - credit per line (a receipt is a debit, a
 * payment is a credit) — same sign convention as the Balance Sheet's asset
 * rows, so the statement's net movement reconciles to the ledger's cash
 * balance with no separate calculation.
 */
export function summarizeCashFlow(
  movements: OpsCashFlowMovement[],
  closingCashBalance: number,
): OpsCashFlowStatement {
  const byCategory = new Map<string, number>();

  for (const movement of movements) {
    const key = movement.source_table ?? "other";
    byCategory.set(key, round2((byCategory.get(key) ?? 0) + movement.net));
  }

  const lines = Array.from(byCategory.entries())
    .map(([sourceTable, amount]) => ({
      category: cashFlowCategoryLabel(sourceTable === "other" ? null : sourceTable),
      amount,
    }))
    .filter((line) => line.amount !== 0)
    .sort((a, b) => b.amount - a.amount);

  const netCashMovement = round2(lines.reduce((sum, line) => sum + line.amount, 0));

  return {
    lines,
    netCashMovement,
    closingCashBalance: round2(closingCashBalance),
    hasActivity: lines.length > 0,
  };
}
