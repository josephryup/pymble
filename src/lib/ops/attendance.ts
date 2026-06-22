import { createOpsServerSessionClient } from "@/lib/ops/auth";
import type { OpsAttendancePresence, OpsAttendanceSource } from "@/lib/ops/types";

export type OpsAttendanceWorkerOption = {
  id: string;
  worker_code: string;
  full_name: string;
  trade: string;
  daily_rate: number;
};

export type OpsAttendanceRelation = {
  id: string;
  code?: string;
  worker_code?: string;
  full_name?: string;
  name?: string;
  trade?: string;
};

export type OpsAttendanceRecord = {
  id: string;
  clock_in_at: string;
  clock_out_at: string | null;
  hours_worked: number;
  amount_earned: number;
  overtime_hours: number;
  overtime_amount: number;
  presence: OpsAttendancePresence;
  source: OpsAttendanceSource;
  gps_label: string;
  gps_latitude: number | null;
  gps_longitude: number | null;
  approved_at: string | null;
  created_at: string;
  worker: OpsAttendanceRelation | null;
  site: OpsAttendanceRelation | null;
};

type RawAttendanceRecord = Omit<
  OpsAttendanceRecord,
  | "amount_earned"
  | "hours_worked"
  | "overtime_amount"
  | "overtime_hours"
  | "site"
  | "worker"
> & {
  amount_earned: number | string;
  hours_worked: number | string;
  overtime_amount: number | string;
  overtime_hours: number | string;
  site: OpsAttendanceRelation | OpsAttendanceRelation[] | null;
  worker: OpsAttendanceRelation | OpsAttendanceRelation[] | null;
};

function normalizeMoney(value: number | string | null) {
  return Number(value ?? 0);
}

function normalizeRelation<T>(value: T | T[] | null) {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function fetchAttendanceWorkerOptions() {
  const supabase = await createOpsServerSessionClient();
  const { data, error } = await supabase
    .from("workers")
    .select("id, worker_code, full_name, trade, daily_rate")
    .eq("is_active", true)
    .order("full_name", { ascending: true });

  if (error) {
    throw error;
  }

  return (
    (data ?? []) as Array<Omit<OpsAttendanceWorkerOption, "daily_rate"> & { daily_rate: number | string }>
  ).map((worker) => ({
    ...worker,
    daily_rate: normalizeMoney(worker.daily_rate),
  }));
}

export type OpsAttendanceFilters = {
  workerId?: string | null;
  siteId?: string | null;
  presence?: OpsAttendancePresence | null;
  approval?: "approved" | "pending" | null;
  dateFrom?: string | null;
  dateTo?: string | null;
};

export async function fetchOpsAttendanceRecords(filters: OpsAttendanceFilters = {}) {
  const supabase = await createOpsServerSessionClient();
  let query = supabase
    .from("attendance_records")
    .select(
      `
        id,
        clock_in_at,
        clock_out_at,
        hours_worked,
        amount_earned,
        overtime_hours,
        overtime_amount,
        presence,
        source,
        gps_label,
        gps_latitude,
        gps_longitude,
        approved_at,
        created_at,
        worker:workers!attendance_records_worker_id_fkey(id, worker_code, full_name, trade),
        site:sites!attendance_records_site_id_fkey(id, code, name)
      `,
    )
    .eq("is_active", true)
    // Cancelled rows are soft-deleted: keep them out of the working list.
    .is("cancelled_at", null);

  if (filters.workerId) query = query.eq("worker_id", filters.workerId);
  if (filters.siteId) query = query.eq("site_id", filters.siteId);
  if (filters.presence) query = query.eq("presence", filters.presence);
  if (filters.approval === "approved") query = query.not("approved_at", "is", null);
  if (filters.approval === "pending") query = query.is("approved_at", null);
  // Date range is filtered on the local work day (Africa/Lusaka, UTC+02:00).
  if (filters.dateFrom) {
    query = query.gte("clock_in_at", `${filters.dateFrom}T00:00:00+02:00`);
  }
  if (filters.dateTo) {
    query = query.lte("clock_in_at", `${filters.dateTo}T23:59:59.999+02:00`);
  }

  const { data, error } = await query
    .order("clock_in_at", { ascending: false })
    .limit(100);

  if (error) {
    throw error;
  }

  return ((data ?? []) as unknown as RawAttendanceRecord[]).map((record) => ({
    ...record,
    amount_earned: normalizeMoney(record.amount_earned),
    hours_worked: normalizeMoney(record.hours_worked),
    overtime_amount: normalizeMoney(record.overtime_amount),
    overtime_hours: normalizeMoney(record.overtime_hours),
    site: normalizeRelation(record.site),
    worker: normalizeRelation(record.worker),
  }));
}
