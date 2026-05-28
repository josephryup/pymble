import { createOpsServerSessionClient } from "@/lib/ops/auth";
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

export async function fetchOpsWorkers() {
  const supabase = await createOpsServerSessionClient();
  const { data, error } = await supabase
    .from("workers")
    .select(
      `
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
      `,
    )
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return ((data ?? []) as unknown as RawOpsWorker[]).map((worker) => ({
    ...worker,
    daily_rate: normalizeMoney(worker.daily_rate),
    site: Array.isArray(worker.site) ? (worker.site[0] ?? null) : worker.site,
  }));
}
