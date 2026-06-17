import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type { OpsHseWeeklyReportStatus, OpsUserRole } from "@/lib/ops/types";

export type { OpsHseWeeklyReportStatus };

export type OpsHseWeeklyReportSiteSummary = {
  id: string;
  code: string;
  name: string;
};

export type OpsHseWeeklyReportUserSummary = {
  id: string;
  full_name: string;
  role: OpsUserRole;
};

export type OpsHseWeeklyReportSummary = {
  id: string;
  report_number: string;
  site_id: string;
  week_start: string;
  week_end: string;
  status: OpsHseWeeklyReportStatus;
  incidents_count: number;
  near_misses_count: number;
  ppe_compliance_pct: number | null;
  toolbox_talks_held: number;
  inspections_completed: number;
  concerns: string;
  actions_planned_next_week: string;
  prepared_by: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  site: OpsHseWeeklyReportSiteSummary | null;
  preparer: OpsHseWeeklyReportUserSummary | null;
};

const REPORT_COLUMNS = [
  "id",
  "report_number",
  "site_id",
  "week_start",
  "week_end",
  "status",
  "incidents_count",
  "near_misses_count",
  "ppe_compliance_pct",
  "toolbox_talks_held",
  "inspections_completed",
  "concerns",
  "actions_planned_next_week",
  "prepared_by",
  "submitted_at",
  "reviewed_at",
  "reviewed_by",
  "archived_at",
  "created_at",
  "updated_at",
  "site:sites!hse_weekly_reports_site_id_fkey(id, code, name)",
  "preparer:users!hse_weekly_reports_prepared_by_fkey(id, full_name, role)",
].join(", ");

function normalizeRelation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

function normalizeNumeric(value: number | string | null | undefined) {
  if (value === null || value === undefined) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export async function fetchOpsHseWeeklyReports(): Promise<OpsHseWeeklyReportSummary[]> {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("hse_weekly_reports")
    .select(REPORT_COLUMNS)
    .is("archived_at", null)
    .order("week_start", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(60);

  if (error) {
    throw error;
  }

  return ((data ?? []) as unknown as Array<
    Omit<OpsHseWeeklyReportSummary, "site" | "preparer" | "ppe_compliance_pct"> & {
      site: OpsHseWeeklyReportSiteSummary | OpsHseWeeklyReportSiteSummary[] | null;
      preparer:
        | OpsHseWeeklyReportUserSummary
        | OpsHseWeeklyReportUserSummary[]
        | null;
      ppe_compliance_pct: number | string | null;
    }
  >).map((report) => ({
    ...report,
    ppe_compliance_pct: normalizeNumeric(report.ppe_compliance_pct),
    site: normalizeRelation(report.site),
    preparer: normalizeRelation(report.preparer),
  }));
}

export async function fetchOpsHseWeeklyReport(
  reportId: string,
): Promise<OpsHseWeeklyReportSummary | null> {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("hse_weekly_reports")
    .select(REPORT_COLUMNS)
    .eq("id", reportId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  if (!data) return null;
  const record = data as unknown as Omit<
    OpsHseWeeklyReportSummary,
    "site" | "preparer" | "ppe_compliance_pct"
  > & {
    site: OpsHseWeeklyReportSiteSummary | OpsHseWeeklyReportSiteSummary[] | null;
    preparer:
      | OpsHseWeeklyReportUserSummary
      | OpsHseWeeklyReportUserSummary[]
      | null;
    ppe_compliance_pct: number | string | null;
  };
  return {
    ...record,
    ppe_compliance_pct: normalizeNumeric(record.ppe_compliance_pct),
    site: normalizeRelation(record.site),
    preparer: normalizeRelation(record.preparer),
  };
}
