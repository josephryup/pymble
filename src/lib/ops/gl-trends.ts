import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

/**
 * Monthly time series from the general ledger — the first trend data in the
 * workspace. Statements stay since-inception until period close ships, but a
 * month-bucketed view of posted journals is already computable and gives
 * leadership direction-of-travel: revenue vs cost per month and the cash
 * balance curve.
 */

export type OpsGlMonthlyPoint = {
  /** "2026-06" — stable sort key. */
  month: string;
  /** "Jun 26" — axis label. */
  label: string;
  income: number;
  expenses: number;
  net: number;
  /** Net cash movement within the month (bank + cash accounts). */
  cashMovement: number;
  /** Cumulative cash balance at month end. */
  cashBalance: number;
};

export type OpsGlTrendLine = {
  entry_date: string;
  status: string;
  account_type: string;
  account_subtype: string;
  debit: number;
  credit: number;
};

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function monthKey(entryDate: string) {
  return entryDate.slice(0, 7);
}

function monthLabel(month: string) {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-GB", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}

/**
 * Buckets posted journal lines into calendar months and returns the LAST
 * `monthsBack` months up to `now`, as a continuous series (empty months are
 * zero-filled). Cash balance is cumulative from the beginning of the ledger,
 * so the window opens with the correct running balance.
 */
export function bucketGlMonthlyTrend(
  lines: OpsGlTrendLine[],
  monthsBack = 6,
  now = new Date(),
): OpsGlMonthlyPoint[] {
  type Bucket = { income: number; expenses: number; cash: number };
  const buckets = new Map<string, Bucket>();

  for (const line of lines) {
    if (line.status !== "posted" || !line.entry_date) continue;
    const month = monthKey(line.entry_date);
    const bucket = buckets.get(month) ?? { income: 0, expenses: 0, cash: 0 };

    if (line.account_type === "income") {
      bucket.income += line.credit - line.debit;
    } else if (line.account_type === "expense") {
      bucket.expenses += line.debit - line.credit;
    }
    if (line.account_subtype === "bank" || line.account_subtype === "cash") {
      bucket.cash += line.debit - line.credit;
    }

    buckets.set(month, bucket);
  }

  // Continuous window ending at the current month.
  const windowMonths: string[] = [];
  for (let offset = monthsBack - 1; offset >= 0; offset -= 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
    windowMonths.push(date.toISOString().slice(0, 7));
  }

  // Opening cash balance = every cash movement before the window starts.
  const windowStart = windowMonths[0];
  let runningCash = Array.from(buckets.entries())
    .filter(([month]) => month < windowStart)
    .reduce((sum, [, bucket]) => sum + bucket.cash, 0);

  return windowMonths.map((month) => {
    const bucket = buckets.get(month) ?? { income: 0, expenses: 0, cash: 0 };
    runningCash += bucket.cash;
    return {
      month,
      label: monthLabel(month),
      income: round2(bucket.income),
      expenses: round2(bucket.expenses),
      net: round2(bucket.income - bucket.expenses),
      cashMovement: round2(bucket.cash),
      cashBalance: round2(runningCash),
    };
  });
}

type RawTrendLine = {
  debit: number | string;
  credit: number | string;
  entry: { entry_date: string; status: string } | { entry_date: string; status: string }[] | null;
  account:
    | { account_type: string; account_subtype: string }
    | { account_type: string; account_subtype: string }[]
    | null;
};

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function fetchOpsGlMonthlyTrend(
  monthsBack = 6,
  now = new Date(),
): Promise<OpsGlMonthlyPoint[]> {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("journal_lines")
    .select(
      [
        "debit",
        "credit",
        "entry:journal_entries!journal_lines_entry_id_fkey(entry_date, status)",
        "account:chart_of_accounts!journal_lines_account_id_fkey(account_type, account_subtype)",
      ].join(", "),
    )
    .limit(10000);

  if (error) {
    throw error;
  }

  const lines: OpsGlTrendLine[] = ((data ?? []) as unknown as RawTrendLine[]).map((raw) => {
    const entry = one(raw.entry);
    const account = one(raw.account);
    return {
      entry_date: entry?.entry_date ?? "",
      status: entry?.status ?? "",
      account_type: account?.account_type ?? "",
      account_subtype: account?.account_subtype ?? "",
      debit: Number(raw.debit ?? 0),
      credit: Number(raw.credit ?? 0),
    };
  });

  return bucketGlMonthlyTrend(lines, monthsBack, now);
}
