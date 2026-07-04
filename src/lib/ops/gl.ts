import { requireOpsUser } from "@/lib/ops/auth";
import { canViewOpsChartOfAccounts } from "@/lib/ops/chart-of-accounts-permissions";
import type { OpsGlAccountType } from "@/lib/ops/chart-of-accounts";
import {
  summarizeBalanceSheet,
  summarizeCashFlow,
  summarizeProfitAndLoss,
  type OpsCashFlowMovement,
  type OpsStatementAccountRow,
} from "@/lib/ops/gl-statements";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

export type {
  OpsBalanceSheet,
  OpsBalanceSheetLine,
  OpsCashFlowLine,
  OpsCashFlowStatement,
  OpsProfitAndLoss,
  OpsProfitAndLossLine,
} from "@/lib/ops/gl-statements";

function toNumber(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Ledger account balances — shared base query for the trial balance and the
// Profit & Loss / Balance Sheet statements, which all read the same posted
// debit/credit totals per account, just sliced differently.
// ---------------------------------------------------------------------------

type RawLedgerAccountRow = {
  account_id: string;
  code: string;
  name: string;
  account_type: OpsGlAccountType;
  account_subtype: string;
  debit: number | string;
  credit: number | string;
};

async function fetchOpsLedgerAccountBalances(): Promise<OpsStatementAccountRow[]> {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("ops_trial_balance")
    .select("account_id, code, name, account_type, account_subtype, debit, credit")
    .order("code", { ascending: true });

  if (error) {
    throw error;
  }

  return ((data ?? []) as unknown as RawLedgerAccountRow[]).map((row) => ({
    account_id: row.account_id,
    code: row.code,
    name: row.name,
    account_type: row.account_type,
    account_subtype: row.account_subtype,
    debit: toNumber(row.debit),
    credit: toNumber(row.credit),
  }));
}

/**
 * Period-bounded account balances, aggregated straight from posted journal
 * lines. The ops_trial_balance view is since-inception; this path powers the
 * statement period selectors (P&L for a date range, Balance Sheet as at a
 * date) without waiting for formal period close.
 */
async function fetchOpsLedgerAccountBalancesForPeriod(
  from: string | null,
  to: string | null,
): Promise<OpsStatementAccountRow[]> {
  const supabase = getOpsSupabaseServiceClient();

  let query = supabase
    .from("journal_lines")
    .select(
      [
        "account_id",
        "debit",
        "credit",
        "entry:journal_entries!journal_lines_entry_id_fkey!inner(entry_date, status)",
        "account:chart_of_accounts!journal_lines_account_id_fkey(code, name, account_type, account_subtype)",
      ].join(", "),
    )
    .eq("entry.status", "posted")
    .limit(10000);

  if (from) query = query.gte("entry.entry_date", from);
  if (to) query = query.lte("entry.entry_date", to);

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  type RawPeriodLine = {
    account_id: string;
    debit: number | string;
    credit: number | string;
    account:
      | { code: string; name: string; account_type: OpsGlAccountType; account_subtype: string }
      | { code: string; name: string; account_type: OpsGlAccountType; account_subtype: string }[]
      | null;
  };

  const totals = new Map<string, OpsStatementAccountRow>();
  for (const raw of (data ?? []) as unknown as RawPeriodLine[]) {
    const account = Array.isArray(raw.account) ? (raw.account[0] ?? null) : raw.account;
    if (!account) continue;
    const existing = totals.get(raw.account_id) ?? {
      account_id: raw.account_id,
      code: account.code,
      name: account.name,
      account_type: account.account_type,
      account_subtype: account.account_subtype,
      debit: 0,
      credit: 0,
    };
    existing.debit = round2(existing.debit + toNumber(raw.debit));
    existing.credit = round2(existing.credit + toNumber(raw.credit));
    totals.set(raw.account_id, existing);
  }

  return Array.from(totals.values()).sort((first, second) =>
    first.code.localeCompare(second.code),
  );
}

export type OpsStatementPeriod = {
  from?: string | null;
  to?: string | null;
};

function hasPeriodBounds(period?: OpsStatementPeriod): period is Required<OpsStatementPeriod> {
  return Boolean(period && (period.from || period.to));
}

// ---------------------------------------------------------------------------
// Trial balance
// ---------------------------------------------------------------------------

export type OpsTrialBalanceRow = {
  account_id: string;
  code: string;
  name: string;
  account_type: OpsGlAccountType;
  debit: number;
  credit: number;
};

export type OpsTrialBalance = {
  rows: OpsTrialBalanceRow[];
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
  hasActivity: boolean;
};

export async function fetchOpsTrialBalance(): Promise<OpsTrialBalance> {
  const { profile } = await requireOpsUser();

  const empty: OpsTrialBalance = {
    rows: [],
    totalDebit: 0,
    totalCredit: 0,
    balanced: true,
    hasActivity: false,
  };

  if (!canViewOpsChartOfAccounts(profile.role)) {
    return empty;
  }

  const rows = await fetchOpsLedgerAccountBalances();
  const activeRows = rows.filter((row) => row.debit !== 0 || row.credit !== 0);
  const totalDebit = round2(activeRows.reduce((sum, row) => sum + row.debit, 0));
  const totalCredit = round2(activeRows.reduce((sum, row) => sum + row.credit, 0));

  return {
    rows: activeRows,
    totalDebit,
    totalCredit,
    balanced: totalDebit === totalCredit,
    hasActivity: activeRows.length > 0,
  };
}

// ---------------------------------------------------------------------------
// Profit & Loss
// ---------------------------------------------------------------------------

export async function fetchOpsProfitAndLoss(period?: OpsStatementPeriod) {
  const { profile } = await requireOpsUser();

  if (!canViewOpsChartOfAccounts(profile.role)) {
    return summarizeProfitAndLoss([]);
  }

  const rows = hasPeriodBounds(period)
    ? await fetchOpsLedgerAccountBalancesForPeriod(period.from ?? null, period.to ?? null)
    : await fetchOpsLedgerAccountBalances();
  return summarizeProfitAndLoss(rows);
}

// ---------------------------------------------------------------------------
// Balance Sheet
// ---------------------------------------------------------------------------

export async function fetchOpsBalanceSheet(asAt?: string | null) {
  const { profile } = await requireOpsUser();

  if (!canViewOpsChartOfAccounts(profile.role)) {
    return summarizeBalanceSheet([], 0);
  }

  // A balance sheet "as at" a date is simply every posted movement from
  // inception up to that date.
  const rows = asAt
    ? await fetchOpsLedgerAccountBalancesForPeriod(null, asAt)
    : await fetchOpsLedgerAccountBalances();
  const profitAndLoss = summarizeProfitAndLoss(rows);
  return summarizeBalanceSheet(rows, profitAndLoss.netProfit);
}

// ---------------------------------------------------------------------------
// Cash Flow Statement
// ---------------------------------------------------------------------------

type RawCashFlowAccount = { account_subtype: string };
type RawCashFlowEntry = { source_table: string | null; status: string };

type RawCashFlowLine = {
  debit: number | string;
  credit: number | string;
  entry: RawCashFlowEntry | RawCashFlowEntry[] | null;
  account: RawCashFlowAccount | RawCashFlowAccount[] | null;
};

function normalizeOne<T>(value: T | T[] | null) {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function fetchOpsCashFlowStatement() {
  const { profile } = await requireOpsUser();

  if (!canViewOpsChartOfAccounts(profile.role)) {
    return summarizeCashFlow([], 0);
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("journal_lines")
    .select(
      [
        "debit",
        "credit",
        "entry:journal_entries!journal_lines_entry_id_fkey(source_table, status)",
        "account:chart_of_accounts!journal_lines_account_id_fkey(account_subtype)",
      ].join(", "),
    )
    .limit(5000);

  if (error) {
    throw error;
  }

  const movements: OpsCashFlowMovement[] = ((data ?? []) as unknown as RawCashFlowLine[])
    .map((line) => ({
      entry: normalizeOne(line.entry),
      account: normalizeOne(line.account),
      debit: toNumber(line.debit),
      credit: toNumber(line.credit),
    }))
    .filter(
      (line) =>
        line.entry?.status === "posted" &&
        (line.account?.account_subtype === "bank" || line.account?.account_subtype === "cash"),
    )
    .map((line) => ({
      source_table: line.entry?.source_table ?? null,
      net: round2(line.debit - line.credit),
    }));

  const closingCashBalance = round2(movements.reduce((sum, movement) => sum + movement.net, 0));
  return summarizeCashFlow(movements, closingCashBalance);
}

// ---------------------------------------------------------------------------
// Journal feed
// ---------------------------------------------------------------------------

export type OpsJournalLine = {
  line_number: number;
  account_code: string;
  account_name: string;
  debit: number;
  credit: number;
  description: string;
};

export type OpsJournalEntry = {
  id: string;
  entry_number: string;
  entry_date: string;
  memo: string;
  source_table: string | null;
  source_event: string | null;
  posted_at: string | null;
  lines: OpsJournalLine[];
  total: number;
};

type RawJournalAccount = { code: string; name: string };

type RawJournalLine = {
  line_number: number;
  debit: number | string;
  credit: number | string;
  description: string;
  account: RawJournalAccount | RawJournalAccount[] | null;
};

type RawJournalEntry = {
  id: string;
  entry_number: string;
  entry_date: string;
  memo: string;
  source_table: string | null;
  source_event: string | null;
  posted_at: string | null;
  lines: RawJournalLine[] | null;
};

function normalizeAccount(value: RawJournalLine["account"]) {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export type OpsJournalFilters = {
  /** Restrict to entries touching this account code (e.g. "4010"). */
  accountCode?: string | null;
  /** Restrict to a source module (e.g. "invoices", "payment_requests"). */
  sourceTable?: string | null;
  from?: string | null;
  to?: string | null;
};

/**
 * Entry ids that touch a given account code — resolved first so the main
 * query stays a clean entry-level fetch. Capped: the journal page is a
 * drill-down, not an export.
 */
async function journalEntryIdsForAccount(accountCode: string): Promise<string[]> {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("journal_lines")
    .select("entry_id, account:chart_of_accounts!journal_lines_account_id_fkey!inner(code)")
    .eq("account.code", accountCode)
    .limit(500);

  if (error) {
    throw error;
  }
  return Array.from(new Set((data ?? []).map((row) => row.entry_id as string)));
}

export async function fetchOpsJournalEntries(
  limit = 25,
  filters: OpsJournalFilters = {},
): Promise<OpsJournalEntry[]> {
  const { profile } = await requireOpsUser();

  if (!canViewOpsChartOfAccounts(profile.role)) {
    return [];
  }

  const supabase = getOpsSupabaseServiceClient();

  let entryIdFilter: string[] | null = null;
  if (filters.accountCode) {
    entryIdFilter = await journalEntryIdsForAccount(filters.accountCode);
    if (entryIdFilter.length === 0) {
      return [];
    }
  }

  let query = supabase
    .from("journal_entries")
    .select(
      [
        "id",
        "entry_number",
        "entry_date",
        "memo",
        "source_table",
        "source_event",
        "posted_at",
        "lines:journal_lines!journal_lines_entry_id_fkey(line_number, debit, credit, description, account:chart_of_accounts!journal_lines_account_id_fkey(code, name))",
      ].join(", "),
    )
    .eq("status", "posted")
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));

  if (entryIdFilter) query = query.in("id", entryIdFilter);
  if (filters.sourceTable) query = query.eq("source_table", filters.sourceTable);
  if (filters.from) query = query.gte("entry_date", filters.from);
  if (filters.to) query = query.lte("entry_date", filters.to);

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return ((data ?? []) as unknown as RawJournalEntry[]).map((entry) => {
    const lines = (entry.lines ?? [])
      .map((line) => {
        const account = normalizeAccount(line.account);
        return {
          line_number: line.line_number,
          account_code: account?.code ?? "—",
          account_name: account?.name ?? "Unknown account",
          debit: toNumber(line.debit),
          credit: toNumber(line.credit),
          description: line.description,
        } satisfies OpsJournalLine;
      })
      .sort((first, second) => first.line_number - second.line_number);

    return {
      id: entry.id,
      entry_number: entry.entry_number,
      entry_date: entry.entry_date,
      memo: entry.memo,
      source_table: entry.source_table,
      source_event: entry.source_event,
      posted_at: entry.posted_at,
      lines,
      total: round2(lines.reduce((sum, line) => sum + line.debit, 0)),
    } satisfies OpsJournalEntry;
  });
}
