import { createOpsServerSessionClient } from "@/lib/ops/auth";
import {
  opsIlikeOrFilter,
  toOpsPaginatedResult,
  type OpsListState,
} from "@/lib/ops/listing";
import type { OpsMomoProvider, OpsPayrollStatus, OpsPayoutStatus } from "@/lib/ops/types";

export type OpsPayrollWorker = {
  id: string;
  worker_code: string;
  full_name: string;
  phone?: string;
  momo_provider?: OpsMomoProvider | null;
  momo_number?: string | null;
};

export type OpsCashAdvance = {
  id: string;
  worker_id: string;
  amount: number;
  note: string;
  issued_at: string;
  deducted_in_run_id: string | null;
  created_at: string;
  worker: OpsPayrollWorker | null;
};

export type OpsPayrollRunItem = {
  id: string;
  payroll_run_id: string;
  worker_id: string;
  gross_pay: number;
  advance_deduction: number;
  net_pay: number;
  overtime_hours: number;
  overtime_amount: number;
  payout_status: OpsPayoutStatus;
  payout_reference: string | null;
  worker: OpsPayrollWorker | null;
};

export type OpsPayrollRun = {
  id: string;
  period_label: string;
  period_start: string;
  period_end: string;
  status: OpsPayrollStatus;
  total_gross: number;
  total_advances: number;
  total_net: number;
  created_at: string;
  line_items: OpsPayrollRunItem[];
};

type Relation<T> = T | T[] | null;

type RawCashAdvance = Omit<OpsCashAdvance, "amount" | "worker"> & {
  amount: number | string;
  worker: Relation<OpsPayrollWorker>;
};

type RawPayrollRun = Omit<
  OpsPayrollRun,
  "line_items" | "total_advances" | "total_gross" | "total_net"
> & {
  total_advances: number | string;
  total_gross: number | string;
  total_net: number | string;
};

type RawPayrollRunItem = Omit<
  OpsPayrollRunItem,
  "advance_deduction" | "gross_pay" | "net_pay" | "overtime_hours" | "overtime_amount" | "worker"
> & {
  advance_deduction: number | string;
  gross_pay: number | string;
  net_pay: number | string;
  overtime_hours: number | string;
  overtime_amount: number | string;
  worker: Relation<OpsPayrollWorker>;
};

function normalizeMoney(value: number | string | null) {
  return Number(value ?? 0);
}

function normalizeRelation<T>(value: Relation<T>) {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

const CASH_ADVANCE_COLUMNS = `
  id,
  worker_id,
  amount,
  note,
  issued_at,
  deducted_in_run_id,
  created_at,
  worker:workers!cash_advances_worker_id_fkey(id, worker_code, full_name)
`;

function normalizeCashAdvance(advance: RawCashAdvance) {
  return {
    ...advance,
    amount: normalizeMoney(advance.amount),
    worker: normalizeRelation(advance.worker),
  };
}

/**
 * Cash advances, one page at a time. The previous hard `limit(50)` put every
 * advance older than the most recent fifty out of reach entirely — on a ledger
 * that decides what gets deducted from somebody's pay (UI/UX audit §1d).
 */
export async function fetchPaginatedOpsCashAdvances(listState: OpsListState) {
  const supabase = await createOpsServerSessionClient();
  let query = supabase
    .from("cash_advances")
    .select(CASH_ADVANCE_COLUMNS, { count: "exact" })
    .is("archived_at", null);

  const search = opsIlikeOrFilter(["note"], listState.query);
  if (search) query = query.or(search);

  const { count, data, error } = await query
    .order("issued_at", { ascending: false })
    .order("created_at", { ascending: false })
    .range(listState.from, listState.to);

  if (error) {
    throw error;
  }

  return toOpsPaginatedResult(
    ((data ?? []) as unknown as RawCashAdvance[]).map(normalizeCashAdvance),
    count,
    listState,
  );
}

/** Outstanding advance total across the whole ledger, for the header tile. */
export async function fetchOpsCashAdvanceSummary() {
  const supabase = await createOpsServerSessionClient();
  const { count, data, error } = await supabase
    .from("cash_advances")
    .select("amount, deducted_in_run_id", { count: "exact" })
    .is("archived_at", null);

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as Array<{
    amount: number | string;
    deducted_in_run_id: string | null;
  }>;

  return {
    advances: count ?? 0,
    outstanding: rows
      .filter((row) => !row.deducted_in_run_id)
      .reduce((sum, row) => sum + normalizeMoney(row.amount), 0),
  };
}

export async function fetchOpsPayrollRuns() {
  const supabase = await createOpsServerSessionClient();
  const { data: runData, error: runError } = await supabase
    .from("payroll_runs")
    .select(
      "id, period_label, period_start, period_end, status, total_gross, total_advances, total_net, created_at",
    )
    .is("archived_at", null)
    .is("cancelled_at", null)
    .order("created_at", { ascending: false })
    .limit(20);

  if (runError) {
    throw runError;
  }

  const runs = ((runData ?? []) as unknown as RawPayrollRun[]).map((run) => ({
    ...run,
    line_items: [] as OpsPayrollRunItem[],
    total_advances: normalizeMoney(run.total_advances),
    total_gross: normalizeMoney(run.total_gross),
    total_net: normalizeMoney(run.total_net),
  }));

  if (!runs.length) {
    return runs;
  }

  const { data: itemData, error: itemError } = await supabase
    .from("payroll_run_items")
    .select(
      `
        id,
        payroll_run_id,
        worker_id,
        gross_pay,
        advance_deduction,
        net_pay,
        overtime_hours,
        overtime_amount,
        payout_status,
        payout_reference,
        worker:workers!payroll_run_items_worker_id_fkey(
          id,
          worker_code,
          full_name,
          phone,
          momo_provider,
          momo_number
        )
      `,
    )
    .in(
      "payroll_run_id",
      runs.map((run) => run.id),
    )
    .order("created_at", { ascending: true });

  if (itemError) {
    throw itemError;
  }

  const items = ((itemData ?? []) as unknown as RawPayrollRunItem[]).map((item) => ({
    ...item,
    advance_deduction: normalizeMoney(item.advance_deduction),
    gross_pay: normalizeMoney(item.gross_pay),
    net_pay: normalizeMoney(item.net_pay),
    overtime_hours: normalizeMoney(item.overtime_hours),
    overtime_amount: normalizeMoney(item.overtime_amount),
    worker: normalizeRelation(item.worker),
  }));

  return runs.map((run) => ({
    ...run,
    line_items: items.filter((item) => item.payroll_run_id === run.id),
  }));
}
