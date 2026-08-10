import { createOpsServerSessionClient } from "@/lib/ops/auth";
import {
  opsIlikeOrFilter,
  toOpsPaginatedResult,
  type OpsListState,
} from "@/lib/ops/listing";
import type { OpsMomoProvider, OpsWorkerType } from "@/lib/ops/types";

export type OpsWorkerSite = {
  id: string;
  code: string;
  name: string;
};

export type OpsWorker = {
  id: string;
  worker_code: string;
  full_name: string;
  trade: string;
  phone: string;
  momo_provider: OpsMomoProvider | null;
  momo_number: string | null;
  daily_rate: number;
  worker_type: OpsWorkerType;
  is_active: boolean;
  created_at: string;
  site: OpsWorkerSite | null;
};

type RawOpsWorker = Omit<OpsWorker, "daily_rate" | "site"> & {
  daily_rate: number | string;
  site: OpsWorkerSite | OpsWorkerSite[] | null;
};

function normalizeMoney(value: number | string | null) {
  return Number(value ?? 0);
}

const WORKER_COLUMNS = `
  id,
  worker_code,
  full_name,
  trade,
  phone,
  momo_provider,
  momo_number,
  daily_rate,
  worker_type,
  is_active,
  created_at,
  site:sites!workers_site_id_fkey(id, code, name)
`;

/** The site filter value that means "on the register but not posted anywhere". */
export const OPS_WORKER_UNASSIGNED_SITE = "unassigned";

export type FetchOpsWorkersOptions = {
  listState: OpsListState;
  siteId?: string;
  trade?: string;
};

function normalizeWorker(worker: RawOpsWorker): OpsWorker {
  return {
    ...worker,
    daily_rate: normalizeMoney(worker.daily_rate),
    site: Array.isArray(worker.site) ? (worker.site[0] ?? null) : worker.site,
  };
}

/**
 * Register-wide totals for the header tiles. Kept separate from the paginated
 * list so "Active workers" keeps counting the whole register while the table
 * below shows one filtered page of it.
 */
export async function fetchOpsWorkerRegisterSummary() {
  const supabase = await createOpsServerSessionClient();
  const { count, data, error } = await supabase
    .from("workers")
    .select("daily_rate", { count: "exact" })
    .eq("is_active", true);

  if (error) {
    throw error;
  }

  const dailyExposure = ((data ?? []) as Array<{ daily_rate: number | string }>).reduce(
    (sum, row) => sum + normalizeMoney(row.daily_rate),
    0,
  );

  return { activeWorkers: count ?? 0, dailyExposure };
}

/**
 * The crew register, searchable by name / code / trade / phone and filterable
 * by site and trade. A register of a few hundred casuals is unusable as one
 * unbroken list — this is the paginated read the page uses.
 */
export async function fetchPaginatedOpsWorkers({
  listState,
  siteId,
  trade,
}: FetchOpsWorkersOptions) {
  const supabase = await createOpsServerSessionClient();
  let query = supabase
    .from("workers")
    .select(WORKER_COLUMNS, { count: "exact" })
    .eq("is_active", true);

  const search = opsIlikeOrFilter(["full_name", "worker_code", "trade", "phone"], listState.query);
  if (search) {
    query = query.or(search);
  }
  if (siteId === OPS_WORKER_UNASSIGNED_SITE) {
    query = query.is("site_id", null);
  } else if (siteId) {
    query = query.eq("site_id", siteId);
  }
  if (trade) {
    query = query.eq("trade", trade);
  }

  const { count, data, error } = await query
    .order("full_name", { ascending: true })
    .range(listState.from, listState.to);

  if (error) {
    throw error;
  }

  return toOpsPaginatedResult(
    ((data ?? []) as unknown as RawOpsWorker[]).map(normalizeWorker),
    count,
    listState,
  );
}

/**
 * Distinct trades on the active register, for the trade filter. Trade is free
 * text on the worker record, so the options have to come from the data rather
 * than from a fixed list.
 */
export async function fetchOpsWorkerTradeOptions() {
  const supabase = await createOpsServerSessionClient();
  const { data, error } = await supabase
    .from("workers")
    .select("trade")
    .eq("is_active", true)
    .order("trade", { ascending: true });

  if (error) {
    throw error;
  }

  const trades = new Set<string>();
  for (const row of (data ?? []) as Array<{ trade: string | null }>) {
    const trade = (row.trade ?? "").trim();
    if (trade) trades.add(trade);
  }

  return Array.from(trades);
}
