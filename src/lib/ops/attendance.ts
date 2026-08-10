import { attendanceRateSettings, type AttendanceRateSettings } from "@/lib/ops/attendance-core";
import { createOpsServerSessionClient, requireOpsUser } from "@/lib/ops/auth";
import { toOpsPaginatedResult, type OpsListState } from "@/lib/ops/listing";
import { fetchActiveOpsAssignedSiteIds, requiresOpsSiteAssignment } from "@/lib/ops/site-assignments";
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
  /** Free-text site note. Stored in the legacy `gps_label` column. */
  site_note: string;
  approved_at: string | null;
  /** Who captured the record — drives the maker/checker approval rule. */
  created_by: string | null;
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
  | "site_note"
  | "worker"
> & {
  amount_earned: number | string;
  hours_worked: number | string;
  overtime_amount: number | string;
  overtime_hours: number | string;
  gps_label: string | null;
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
  const { profile } = await requireOpsUser();
  const supabase = await createOpsServerSessionClient();
  let query = supabase
    .from("workers")
    .select("id, worker_code, full_name, trade, daily_rate")
    .eq("is_active", true)
    .order("full_name", { ascending: true });

  if (requiresOpsSiteAssignment(profile.role)) {
    const siteIds = await fetchActiveOpsAssignedSiteIds(profile.id);
    if (siteIds.length === 0) return [];
    query = query.in("site_id", siteIds);
  }

  const { data, error } = await query;

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

/**
 * Company standard day + overtime multiplier, used to price overtime and to
 * drive the live earnings preview on the capture form.
 */
export async function fetchAttendanceRateSettings(): Promise<AttendanceRateSettings> {
  const supabase = await createOpsServerSessionClient();
  const { data } = await supabase
    .from("organization_profile")
    .select("standard_daily_hours, overtime_multiplier")
    .eq("id", 1)
    .maybeSingle<{ standard_daily_hours: number | string; overtime_multiplier: number | string }>();

  return attendanceRateSettings(data ?? null);
}

export type OpsAttendanceRosterWorker = {
  id: string;
  worker_code: string;
  full_name: string;
  trade: string;
  daily_rate: number;
  /** Id of the record this worker already has for the roster date, if any. */
  existing_record_id: string | null;
};

/**
 * Roster for bulk attendance capture: every active worker assigned to a site,
 * flagged with whether they already have a record for that work day so the
 * form can show it instead of inviting a duplicate (audit finding A4).
 */
export async function fetchAttendanceRoster(
  siteId: string,
  workDate: string,
): Promise<OpsAttendanceRosterWorker[]> {
  const { profile } = await requireOpsUser();
  const supabase = await createOpsServerSessionClient();

  if (requiresOpsSiteAssignment(profile.role)) {
    const siteIds = await fetchActiveOpsAssignedSiteIds(profile.id);
    if (!siteIds.includes(siteId)) return [];
  }

  const [workersRes, existingRes] = await Promise.all([
    supabase
      .from("workers")
      .select("id, worker_code, full_name, trade, daily_rate")
      .eq("is_active", true)
      .eq("site_id", siteId)
      .order("full_name", { ascending: true }),
    supabase
      .from("attendance_records")
      .select("id, worker_id")
      .eq("site_id", siteId)
      .eq("is_active", true)
      .is("cancelled_at", null)
      .gte("clock_in_at", `${workDate}T00:00:00+02:00`)
      .lte("clock_in_at", `${workDate}T23:59:59.999+02:00`),
  ]);

  if (workersRes.error) throw workersRes.error;

  const existingByWorker = new Map(
    ((existingRes.data ?? []) as Array<{ id: string; worker_id: string }>).map((row) => [
      row.worker_id,
      row.id,
    ]),
  );

  return (
    (workersRes.data ?? []) as Array<{
      id: string;
      worker_code: string;
      full_name: string;
      trade: string;
      daily_rate: number | string;
    }>
  ).map((worker) => ({
    ...worker,
    daily_rate: normalizeMoney(worker.daily_rate),
    existing_record_id: existingByWorker.get(worker.id) ?? null,
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

export async function fetchOpsAttendanceRecords(
  filters: OpsAttendanceFilters = {},
  options: { limit?: number; listState?: OpsListState } = {},
) {
  return (await fetchPaginatedOpsAttendanceRecords(filters, options)).items;
}

/**
 * Attendance is the fastest-growing table in the workspace — one row per worker
 * per day — and it was capped at the most recent 100 records with no way to
 * reach anything older (UI/UX audit §1d). Supply `listState` to page it.
 */
export async function fetchPaginatedOpsAttendanceRecords(
  filters: OpsAttendanceFilters = {},
  options: { limit?: number; listState?: OpsListState } = {},
) {
  const listState = options.listState ?? {
    from: 0,
    page: 1,
    pageSize: options.limit ?? 100,
    query: "",
    to: (options.limit ?? 100) - 1,
  };
  const { profile } = await requireOpsUser();
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
        approved_at,
        created_by,
        created_at,
        worker:workers!attendance_records_worker_id_fkey(id, worker_code, full_name, trade),
        site:sites!attendance_records_site_id_fkey(id, code, name)
      `,
      { count: "exact" },
    )
    .eq("is_active", true)
    // Cancelled rows are soft-deleted: keep them out of the working list.
    .is("cancelled_at", null);

  if (requiresOpsSiteAssignment(profile.role)) {
    const siteIds = await fetchActiveOpsAssignedSiteIds(profile.id);
    if (siteIds.length === 0) return toOpsPaginatedResult<OpsAttendanceRecord>([], 0, listState);
    query = query.in("site_id", siteIds);
  }

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

  const { count, data, error } = await query
    .order("clock_in_at", { ascending: false })
    .range(listState.from, listState.to);

  if (error) {
    throw error;
  }

  const records = ((data ?? []) as unknown as RawAttendanceRecord[]).map(
    ({ gps_label, ...record }) => ({
      ...record,
      site_note: gps_label ?? "",
      amount_earned: normalizeMoney(record.amount_earned),
      hours_worked: normalizeMoney(record.hours_worked),
      overtime_amount: normalizeMoney(record.overtime_amount),
      overtime_hours: normalizeMoney(record.overtime_hours),
      site: normalizeRelation(record.site),
      worker: normalizeRelation(record.worker),
    }),
  );

  return toOpsPaginatedResult(records, count, listState);
}

/**
 * Totals across the whole filtered set, so the header tiles keep describing the
 * filter rather than whichever page happens to be on screen. Two narrow columns
 * instead of the joined rows.
 */
export async function fetchOpsAttendanceSummary(filters: OpsAttendanceFilters = {}) {
  const { profile } = await requireOpsUser();
  const supabase = await createOpsServerSessionClient();
  let query = supabase
    .from("attendance_records")
    .select("amount_earned, approved_at")
    .eq("is_active", true)
    .is("cancelled_at", null);

  if (requiresOpsSiteAssignment(profile.role)) {
    const siteIds = await fetchActiveOpsAssignedSiteIds(profile.id);
    if (siteIds.length === 0) return { records: 0, pending: 0, earned: 0 };
    query = query.in("site_id", siteIds);
  }

  if (filters.workerId) query = query.eq("worker_id", filters.workerId);
  if (filters.siteId) query = query.eq("site_id", filters.siteId);
  if (filters.presence) query = query.eq("presence", filters.presence);
  if (filters.approval === "approved") query = query.not("approved_at", "is", null);
  if (filters.approval === "pending") query = query.is("approved_at", null);
  if (filters.dateFrom) {
    query = query.gte("clock_in_at", `${filters.dateFrom}T00:00:00+02:00`);
  }
  if (filters.dateTo) {
    query = query.lte("clock_in_at", `${filters.dateTo}T23:59:59.999+02:00`);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  const rows = (data ?? []) as Array<{ amount_earned: number | string; approved_at: string | null }>;
  return {
    records: rows.length,
    pending: rows.filter((row) => !row.approved_at).length,
    earned: rows.reduce((sum, row) => sum + normalizeMoney(row.amount_earned), 0),
  };
}

export type OpsAttendanceDailyPoint = {
  /** ISO date (Africa/Lusaka work day). */
  date: string;
  /** Short chart label, e.g. "Mon 30". */
  label: string;
  present: number;
  late: number;
  absent: number;
  hoursWorked: number;
};

export type OpsAttendanceDailySummary = {
  windowDays: number;
  days: OpsAttendanceDailyPoint[];
  today: {
    present: number;
    late: number;
    absent: number;
    pendingApproval: number;
  };
};

const LUSAKA_DAY_FORMAT = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "Africa/Lusaka",
  year: "numeric",
});

const LUSAKA_LABEL_FORMAT = new Intl.DateTimeFormat("en-ZM", {
  day: "numeric",
  timeZone: "Africa/Lusaka",
  weekday: "short",
});

/**
 * Trailing daily headcount for the attendance dashboard, aggregated on the
 * Africa/Lusaka work day. Always unfiltered — the dashboard shows the whole
 * operation even while the register below is filtered.
 */
export async function fetchOpsAttendanceDailySummary(
  windowDays = 7,
): Promise<OpsAttendanceDailySummary> {
  const { profile } = await requireOpsUser();
  const supabase = await createOpsServerSessionClient();
  const windowStart = new Date(Date.now() - (windowDays - 1) * 24 * 60 * 60 * 1000);
  const windowStartDay = LUSAKA_DAY_FORMAT.format(windowStart);

  let query = supabase
    .from("attendance_records")
    .select("clock_in_at, presence, hours_worked, approved_at")
    .eq("is_active", true)
    .is("cancelled_at", null)
    .gte("clock_in_at", `${windowStartDay}T00:00:00+02:00`);

  if (requiresOpsSiteAssignment(profile.role)) {
    const siteIds = await fetchActiveOpsAssignedSiteIds(profile.id);
    if (siteIds.length === 0) {
      return {
        windowDays,
        days: [],
        today: { present: 0, late: 0, absent: 0, pendingApproval: 0 },
      };
    }
    query = query.in("site_id", siteIds);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as Array<{
    clock_in_at: string;
    presence: OpsAttendancePresence;
    hours_worked: number | string;
    approved_at: string | null;
  }>;

  const byDay = new Map<string, OpsAttendanceDailyPoint>();
  for (let offset = windowDays - 1; offset >= 0; offset -= 1) {
    const day = new Date(Date.now() - offset * 24 * 60 * 60 * 1000);
    const date = LUSAKA_DAY_FORMAT.format(day);
    byDay.set(date, {
      date,
      label: LUSAKA_LABEL_FORMAT.format(day),
      present: 0,
      late: 0,
      absent: 0,
      hoursWorked: 0,
    });
  }

  const todayKey = LUSAKA_DAY_FORMAT.format(new Date());
  let pendingApproval = 0;

  for (const row of rows) {
    const date = LUSAKA_DAY_FORMAT.format(new Date(row.clock_in_at));
    const point = byDay.get(date);
    if (!point) continue;
    if (row.presence === "present") point.present += 1;
    else if (row.presence === "late") point.late += 1;
    else point.absent += 1;
    point.hoursWorked += normalizeMoney(row.hours_worked);
    if (date === todayKey && !row.approved_at) pendingApproval += 1;
  }

  const days = [...byDay.values()];
  const today = days.find((point) => point.date === todayKey);

  return {
    windowDays,
    days,
    today: {
      present: today?.present ?? 0,
      late: today?.late ?? 0,
      absent: today?.absent ?? 0,
      pendingApproval,
    },
  };
}
