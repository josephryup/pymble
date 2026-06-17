import {
  opsIlikeOrFilter,
  toOpsPaginatedResult,
  type OpsListState,
  type OpsPaginatedResult,
} from "@/lib/ops/listing";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type {
  OpsDailySiteReportEntryType,
  OpsDailySiteReportStatus,
  OpsUserRole,
} from "@/lib/ops/types";

export type OpsDailySiteReportSite = {
  code: string;
  id: string;
  name: string;
};

export type OpsDailySiteReportUser = {
  full_name: string;
  id: string;
  role: OpsUserRole;
};

export type OpsDailySiteReportEntry = {
  created_at: string;
  created_by: string | null;
  entry_type: OpsDailySiteReportEntryType;
  hours: number;
  id: string;
  notes: string;
  quantity: number;
  report_id: string;
  title: string;
  unit: string;
  updated_at: string;
};

export type OpsDailySiteReport = {
  closed_at: string | null;
  commercial_notes: string;
  created_at: string;
  delay_notes: string;
  entries: OpsDailySiteReportEntry[];
  equipment_count: number;
  equipment_notes: string;
  hse_notes: string;
  id: string;
  incident_count: number;
  labour_count: number;
  labour_notes: string;
  material_deliveries_count: number;
  material_notes: string;
  overall_progress_percent: number;
  prepared_by: string | null;
  prepared_by_user: OpsDailySiteReportUser | null;
  progress_summary: string;
  report_date: string;
  report_number: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  reviewed_by_user: OpsDailySiteReportUser | null;
  site: OpsDailySiteReportSite | null;
  site_id: string;
  status: OpsDailySiteReportStatus;
  submitted_at: string | null;
  updated_at: string;
  weather: string;
};

export type FetchOpsDailySiteReportsOptions = {
  query?: string;
  status?: OpsDailySiteReportStatus;
};

export type FetchPaginatedOpsDailySiteReportsOptions = FetchOpsDailySiteReportsOptions & {
  listState: OpsListState;
};

type Relation<T> = T | T[] | null;

type RawDailySiteReport = Omit<
  OpsDailySiteReport,
  | "entries"
  | "equipment_count"
  | "incident_count"
  | "labour_count"
  | "material_deliveries_count"
  | "overall_progress_percent"
  | "prepared_by_user"
  | "reviewed_by_user"
  | "site"
> & {
  equipment_count: number | string;
  incident_count: number | string;
  labour_count: number | string;
  material_deliveries_count: number | string;
  overall_progress_percent: number | string;
  prepared_by_user: Relation<OpsDailySiteReportUser>;
  reviewed_by_user: Relation<OpsDailySiteReportUser>;
  site: Relation<OpsDailySiteReportSite>;
};

type RawDailySiteReportEntry = Omit<
  OpsDailySiteReportEntry,
  "hours" | "quantity"
> & {
  hours: number | string;
  quantity: number | string;
};

function normalizeNumber(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

function normalizeRelation<T>(value: Relation<T>) {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function groupEntriesByReportId(entries: RawDailySiteReportEntry[]) {
  const grouped = new Map<string, OpsDailySiteReportEntry[]>();

  entries.forEach((entry) => {
    const normalized = {
      ...entry,
      hours: normalizeNumber(entry.hours),
      quantity: normalizeNumber(entry.quantity),
    };

    grouped.set(entry.report_id, [...(grouped.get(entry.report_id) ?? []), normalized]);
  });

  return grouped;
}

async function fetchDailySiteReportEntries(reportIds: string[]) {
  if (reportIds.length === 0) {
    return new Map<string, OpsDailySiteReportEntry[]>();
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("daily_site_report_entries")
    .select("id, report_id, entry_type, title, quantity, unit, hours, notes, created_by, created_at, updated_at")
    .in("report_id", reportIds)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return groupEntriesByReportId((data ?? []) as unknown as RawDailySiteReportEntry[]);
}

async function fetchOpsDailySiteReportItems(
  options: FetchOpsDailySiteReportsOptions = {},
  listState?: OpsListState,
) {
  const supabase = getOpsSupabaseServiceClient();
  let query = supabase
    .from("daily_site_reports")
    .select(
      [
        "id",
        "report_number",
        "site_id",
        "report_date",
        "prepared_by",
        "reviewed_by",
        "status",
        "weather",
        "progress_summary",
        "labour_notes",
        "equipment_notes",
        "material_notes",
        "delay_notes",
        "hse_notes",
        "commercial_notes",
        "overall_progress_percent",
        "labour_count",
        "equipment_count",
        "material_deliveries_count",
        "incident_count",
        "submitted_at",
        "reviewed_at",
        "closed_at",
        "created_at",
        "updated_at",
        "site:sites!daily_site_reports_site_id_fkey(id, code, name)",
        "prepared_by_user:users!daily_site_reports_prepared_by_fkey(id, full_name, role)",
        "reviewed_by_user:users!daily_site_reports_reviewed_by_fkey(id, full_name, role)",
      ].join(", "),
      listState ? { count: "exact" } : undefined,
    )
    .is("archived_at", null)
    .is("cancelled_at", null)
    .order("report_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (options.status) {
    query = query.eq("status", options.status);
  }

  const searchFilter = opsIlikeOrFilter(
    [
      "report_number",
      "weather",
      "progress_summary",
      "labour_notes",
      "equipment_notes",
      "material_notes",
      "delay_notes",
      "hse_notes",
      "commercial_notes",
    ],
    options.query ?? "",
  );

  if (searchFilter) {
    query = query.or(searchFilter);
  }

  const { data, error, count } = await (listState
    ? query.range(listState.from, listState.to)
    : query.limit(25));

  if (error) {
    throw error;
  }

  const reports = (data ?? []) as unknown as RawDailySiteReport[];
  const entriesByReportId = await fetchDailySiteReportEntries(reports.map((report) => report.id));

  return {
    count,
    items: reports.map((report) => ({
      ...report,
      entries: entriesByReportId.get(report.id) ?? [],
      equipment_count: normalizeNumber(report.equipment_count),
      incident_count: normalizeNumber(report.incident_count),
      labour_count: normalizeNumber(report.labour_count),
      material_deliveries_count: normalizeNumber(report.material_deliveries_count),
      overall_progress_percent: normalizeNumber(report.overall_progress_percent),
      prepared_by_user: normalizeRelation(report.prepared_by_user),
      reviewed_by_user: normalizeRelation(report.reviewed_by_user),
      site: normalizeRelation(report.site),
    })),
  };
}

export async function fetchOpsDailySiteReports(options: FetchOpsDailySiteReportsOptions = {}) {
  const result = await fetchOpsDailySiteReportItems(options);
  return result.items;
}

export async function fetchPaginatedOpsDailySiteReports(
  options: FetchPaginatedOpsDailySiteReportsOptions,
): Promise<OpsPaginatedResult<OpsDailySiteReport>> {
  const result = await fetchOpsDailySiteReportItems(options, options.listState);
  return toOpsPaginatedResult(result.items, result.count, options.listState);
}
