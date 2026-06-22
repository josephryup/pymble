import { requireOpsUser } from "@/lib/ops/auth";
import {
  canViewDepartmentReport,
  departmentForRole,
  type OpsDepartmentKey,
} from "@/lib/ops/department-report-permissions";
import { logOpsServerError } from "@/lib/ops/log";
import { isLeadershipRole } from "@/lib/ops/roles";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type { OpsUserRole } from "@/lib/ops/types";

export type OpsDepartmentReportPeriod =
  | "weekly"
  | "monthly"
  | "quarterly"
  | "ad_hoc";

export type OpsDepartmentReportStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "acknowledged"
  | "revision_requested";

type UserRef = { id: string; full_name: string; role: OpsUserRole } | null;

export type OpsDepartmentReport = {
  id: string;
  department: OpsDepartmentKey;
  period: OpsDepartmentReportPeriod;
  period_start_date: string;
  period_end_date: string;
  title: string;
  narrative: string;
  metrics: Record<string, unknown>;
  status: OpsDepartmentReportStatus;
  submitted_at: string | null;
  submitted_by: string | null;
  submitter: UserRef;
  reviewed_at: string | null;
  reviewed_by: string | null;
  reviewer: UserRef;
  review_notes: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  archived_by: string | null;
};

type Relation<T> = T | T[] | null;

type RawDepartmentReport = Omit<
  OpsDepartmentReport,
  "submitter" | "reviewer"
> & {
  submitter: Relation<NonNullable<UserRef>>;
  reviewer: Relation<NonNullable<UserRef>>;
};

function normalizeRel<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function normalize(row: RawDepartmentReport): OpsDepartmentReport {
  return {
    ...row,
    submitter: normalizeRel(row.submitter),
    reviewer: normalizeRel(row.reviewer),
  };
}

const REPORT_SELECT = [
  "id",
  "department",
  "period",
  "period_start_date",
  "period_end_date",
  "title",
  "narrative",
  "metrics",
  "status",
  "submitted_at",
  "submitted_by",
  "reviewed_at",
  "reviewed_by",
  "review_notes",
  "created_by",
  "created_at",
  "updated_at",
  "archived_at",
  "archived_by",
  "submitter:users!department_reports_submitted_by_fkey(id, full_name, role)",
  "reviewer:users!department_reports_reviewed_by_fkey(id, full_name, role)",
].join(", ");

/**
 * Returns the reports a viewer is allowed to see. Leadership sees all;
 * everyone else sees only their own department.
 *
 * `deptOverride` allows leadership to drill into a specific department
 * from the dashboard view without loosening the data-layer isolation for
 * non-leadership callers (the override is ignored if the viewer is not leadership).
 */
export async function fetchOpsDepartmentReports(
  role: OpsUserRole,
  deptOverride: OpsDepartmentKey | null = null,
) {
  await requireOpsUser();
  const supabase = getOpsSupabaseServiceClient();

  let query = supabase
    .from("department_reports")
    .select(REPORT_SELECT)
    .is("archived_at", null)
    .order("period_end_date", { ascending: false })
    .limit(200);

  if (isLeadershipRole(role)) {
    // Leadership can drill into a specific dept or see all.
    if (deptOverride) query = query.eq("department", deptOverride);
  } else {
    const own = departmentForRole(role);
    if (!own) return [];
    // Always scope to own dept regardless of any override attempt.
    query = query.eq("department", own);
  }

  const { data, error } = await query;
  if (error) {
    logOpsServerError(error, {
      module: "department_reports",
      action: "fetchOpsDepartmentReports",
    });
    throw error;
  }
  return ((data ?? []) as unknown as RawDepartmentReport[]).map(normalize);
}

export async function fetchOpsDepartmentReportById(
  reportId: string,
): Promise<OpsDepartmentReport | null> {
  await requireOpsUser();
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("department_reports")
    .select(REPORT_SELECT)
    .eq("id", reportId)
    .maybeSingle();
  if (error) {
    logOpsServerError(error, {
      module: "department_reports",
      action: "fetchOpsDepartmentReportById",
      entityId: reportId,
    });
    throw error;
  }
  return data ? normalize(data as unknown as RawDepartmentReport) : null;
}

/**
 * Server-side gate that decides whether the current viewer is allowed to
 * read a given report. Used in the detail page to 404 cross-department peeks.
 */
export function isReportVisibleToRole(
  role: OpsUserRole,
  report: { department: OpsDepartmentKey },
) {
  return canViewDepartmentReport(role, report.department);
}

export type OpsDeptReportStat = {
  department: OpsDepartmentKey;
  pendingReview: number;
  revisionRequested: number;
  acknowledgedThisMonth: number;
  latestReport: {
    id: string;
    title: string;
    period: OpsDepartmentReportPeriod;
    period_end_date: string;
    status: OpsDepartmentReportStatus;
    submitted_at: string | null;
  } | null;
};

/**
 * Returns per-department summary stats for the leadership dashboard.
 *
 * This aggregates EVERY department's reports, so it self-enforces leadership
 * access as a defense-in-depth backstop: non-leadership callers receive an
 * empty array rather than a cross-department leak, even if a future caller
 * forgets the page-level guard.
 */
export async function fetchOpsDepartmentReportSummary(): Promise<OpsDeptReportStat[]> {
  const { profile } = await requireOpsUser();
  if (!isLeadershipRole(profile.role)) {
    return [];
  }
  const supabase = getOpsSupabaseServiceClient();

  const { data, error } = await supabase
    .from("department_reports")
    .select(
      "id, department, period, period_end_date, status, title, submitted_at",
    )
    .is("archived_at", null)
    .order("period_end_date", { ascending: false });

  if (error) {
    logOpsServerError(error, {
      module: "department_reports",
      action: "fetchOpsDepartmentReportSummary",
    });
    throw error;
  }

  const rows = (data ?? []) as {
    id: string;
    department: OpsDepartmentKey;
    period: OpsDepartmentReportPeriod;
    period_end_date: string;
    status: OpsDepartmentReportStatus;
    title: string;
    submitted_at: string | null;
  }[];

  const thisMonth = new Date().toISOString().slice(0, 7); // "YYYY-MM"

  // Group by department, compute stats.
  const deptMap = new Map<OpsDepartmentKey, OpsDeptReportStat>();

  for (const row of rows) {
    const d = row.department;
    if (!deptMap.has(d)) {
      deptMap.set(d, {
        department: d,
        pendingReview: 0,
        revisionRequested: 0,
        acknowledgedThisMonth: 0,
        latestReport: null,
      });
    }
    const stat = deptMap.get(d)!;

    if (row.status === "submitted" || row.status === "under_review") {
      stat.pendingReview += 1;
    }
    if (row.status === "revision_requested") {
      stat.revisionRequested += 1;
    }
    if (
      row.status === "acknowledged" &&
      row.submitted_at?.startsWith(thisMonth)
    ) {
      stat.acknowledgedThisMonth += 1;
    }
    // Rows are ordered by period_end_date DESC; first one per dept is latest.
    if (!stat.latestReport) {
      stat.latestReport = {
        id: row.id,
        title: row.title,
        period: row.period,
        period_end_date: row.period_end_date,
        status: row.status,
        submitted_at: row.submitted_at,
      };
    }
  }

  return Array.from(deptMap.values());
}
