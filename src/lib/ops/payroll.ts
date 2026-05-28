import { createOpsServerSessionClient } from "@/lib/ops/auth";
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
  "advance_deduction" | "gross_pay" | "net_pay" | "worker"
> & {
  advance_deduction: number | string;
  gross_pay: number | string;
  net_pay: number | string;
  worker: Relation<OpsPayrollWorker>;
};

function normalizeMoney(value: number | string | null) {
  return Number(value ?? 0);
}

function normalizeRelation<T>(value: Relation<T>) {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function fetchOpsCashAdvances() {
  const supabase = await createOpsServerSessionClient();
  const { data, error } = await supabase
    .from("cash_advances")
    .select(
      `
        id,
        worker_id,
        amount,
        note,
        issued_at,
        deducted_in_run_id,
        created_at,
        worker:workers!cash_advances_worker_id_fkey(id, worker_code, full_name)
      `,
    )
    .order("issued_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    throw error;
  }

  return ((data ?? []) as unknown as RawCashAdvance[]).map((advance) => ({
    ...advance,
    amount: normalizeMoney(advance.amount),
    worker: normalizeRelation(advance.worker),
  }));
}

export async function fetchOpsPayrollRuns() {
  const supabase = await createOpsServerSessionClient();
  const { data: runData, error: runError } = await supabase
    .from("payroll_runs")
    .select(
      "id, period_label, period_start, period_end, status, total_gross, total_advances, total_net, created_at",
    )
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
    worker: normalizeRelation(item.worker),
  }));

  return runs.map((run) => ({
    ...run,
    line_items: items.filter((item) => item.payroll_run_id === run.id),
  }));
}
