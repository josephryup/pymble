import { requireOpsUser } from "@/lib/ops/auth";
import {
  departmentsExpectedToReport,
  type OpsDepartmentKey,
} from "@/lib/ops/department-report-permissions";
import type { OpsDepartmentReportStatus } from "@/lib/ops/department-reports";
import {
  departmentsMissingCadenceReport,
  getOpsEscalationTodayKey,
  previousWeekWindow,
} from "@/lib/ops/escalations";
import { logOpsServerError } from "@/lib/ops/log";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

/**
 * The executive dashboard's view of the weekly reporting chain: which
 * departments filed last week's compiled report, which are missing, what is
 * sitting in the MD's review queue, and the executive summaries pulled out
 * of the filed reports — leadership reads the one-minute version here and
 * clicks through for the full report.
 */

export type OpsExecutiveReportDigestItem = {
  department: OpsDepartmentKey;
  id: string;
  status: OpsDepartmentReportStatus;
  submitted_at: string | null;
  submitter_name: string | null;
  title: string;
};

export type OpsExecutiveReportDigest = {
  window: { start: string; end: string };
  filed: OpsExecutiveReportDigestItem[];
  missing: OpsDepartmentKey[];
  pendingReview: OpsExecutiveReportDigestItem[];
  summaries: Array<{
    department: OpsDepartmentKey;
    excerpt: string;
    id: string;
    title: string;
  }>;
};

type RawDigestRow = {
  department: OpsDepartmentKey;
  id: string;
  period: string;
  period_end_date: string;
  scope: string;
  sections: Record<string, string> | null;
  status: OpsDepartmentReportStatus;
  submitted_at: string | null;
  submitter: { full_name: string } | { full_name: string }[] | null;
  title: string;
};

const DIGEST_SELECT =
  "id, department, scope, period, period_end_date, title, status, submitted_at, sections, submitter:users!department_reports_submitted_by_fkey(full_name)";

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function toItem(row: RawDigestRow): OpsExecutiveReportDigestItem {
  return {
    department: row.department,
    id: row.id,
    status: row.status,
    submitted_at: row.submitted_at,
    submitter_name: one(row.submitter)?.full_name ?? null,
    title: row.title,
  };
}

const EMPTY_DIGEST = (window: { start: string; end: string }): OpsExecutiveReportDigest => ({
  window,
  filed: [],
  missing: departmentsExpectedToReport(),
  pendingReview: [],
  summaries: [],
});

export async function fetchOpsExecutiveReportDigest(
  now = new Date(),
): Promise<OpsExecutiveReportDigest> {
  await requireOpsUser();
  const window = previousWeekWindow(getOpsEscalationTodayKey(now));
  const supabase = getOpsSupabaseServiceClient();

  const [filedResult, pendingResult] = await Promise.all([
    supabase
      .from("department_reports")
      .select(DIGEST_SELECT)
      .eq("scope", "compiled")
      .eq("period", "weekly")
      .gte("period_end_date", window.start)
      .lte("period_end_date", window.end)
      .is("archived_at", null)
      .order("department", { ascending: true }),
    supabase
      .from("department_reports")
      .select(DIGEST_SELECT)
      .eq("scope", "compiled")
      .in("status", ["submitted", "under_review"])
      .is("archived_at", null)
      .order("submitted_at", { ascending: true })
      .limit(10),
  ]);

  if (filedResult.error || pendingResult.error) {
    logOpsServerError(filedResult.error ?? pendingResult.error, {
      module: "department_reports",
      action: "fetchOpsExecutiveReportDigest",
    });
    return EMPTY_DIGEST({ start: window.start, end: window.end });
  }

  const filedRows = (filedResult.data ?? []) as unknown as RawDigestRow[];
  const missing = departmentsMissingCadenceReport(
    filedRows.map((row) => ({
      department: row.department,
      period: row.period,
      period_end_date: row.period_end_date,
      scope: row.scope as "individual" | "compiled",
    })),
    window,
    "weekly",
  );

  return {
    window: { start: window.start, end: window.end },
    filed: filedRows.map(toItem),
    missing,
    pendingReview: ((pendingResult.data ?? []) as unknown as RawDigestRow[]).map(toItem),
    summaries: filedRows
      .map((row) => ({
        department: row.department,
        excerpt: (row.sections?.executive_summary ?? "").trim().slice(0, 280),
        id: row.id,
        title: row.title,
      }))
      .filter((summary) => summary.excerpt !== ""),
  };
}
