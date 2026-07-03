import { requireOpsUser } from "@/lib/ops/auth";
import {
  canViewDepartmentReport,
  departmentForRole,
  departmentsCompiledBy,
  type OpsDepartmentKey,
  type OpsDepartmentReportScope,
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
  scope: OpsDepartmentReportScope;
  period: OpsDepartmentReportPeriod;
  period_start_date: string;
  period_end_date: string;
  title: string;
  narrative: string;
  sections: Record<string, string>;
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
  "scope",
  "period",
  "period_start_date",
  "period_end_date",
  "title",
  "narrative",
  "sections",
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
  const { profile } = await requireOpsUser();
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
    const compiled = departmentsCompiledBy(role);
    const visibleDepartments = Array.from(new Set([own, ...compiled].filter(Boolean))) as string[];
    if (visibleDepartments.length === 0) return [];

    const scoped =
      deptOverride && visibleDepartments.includes(deptOverride)
        ? [deptOverride]
        : visibleDepartments;
    query = query.in("department", scoped);

    if (compiled.length === 0) {
      // Contributors: their own reports plus the department's compiled
      // reports — never a colleague's individual report (tier isolation).
      query = query.or(
        `scope.eq.compiled,created_by.eq.${profile.id},submitted_by.eq.${profile.id}`,
      );
    }
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
 * The report this one naturally follows: same department, same cadence,
 * closest earlier period end. Used for the month-over-month comparison on
 * the detail page and in the PDF. Ad-hoc reports have no meaningful
 * predecessor, so they return null.
 */
export async function fetchPreviousOpsDepartmentReport(current: {
  created_by: string | null;
  department: OpsDepartmentKey;
  id: string;
  period: OpsDepartmentReportPeriod;
  period_end_date: string;
  scope: OpsDepartmentReportScope;
}): Promise<OpsDepartmentReport | null> {
  if (current.period === "ad_hoc") return null;

  const supabase = getOpsSupabaseServiceClient();
  let query = supabase
    .from("department_reports")
    .select(REPORT_SELECT)
    .eq("department", current.department)
    .eq("scope", current.scope)
    .eq("period", current.period)
    .lt("period_end_date", current.period_end_date)
    .neq("id", current.id)
    .is("archived_at", null)
    .order("period_end_date", { ascending: false })
    .limit(1);

  // An individual's trend compares against THEIR previous report, not a
  // colleague's.
  if (current.scope === "individual" && current.created_by) {
    query = query.eq("created_by", current.created_by);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    logOpsServerError(error, {
      module: "department_reports",
      action: "fetchPreviousOpsDepartmentReport",
      entityId: current.id,
    });
    return null;
  }

  return data ? normalize(data as unknown as RawDepartmentReport) : null;
}

/**
 * Tier-1 reports feeding a compiled report: everything contributors have
 * submitted for this department whose period ends inside the compiling
 * window. Callers must already hold compile authority for the department
 * (canFileDepartmentReport(role, department, "compiled")).
 */
export async function fetchSubmittedIndividualReports(
  department: OpsDepartmentKey,
  windowStart: string,
  windowEnd: string,
): Promise<OpsDepartmentReport[]> {
  await requireOpsUser();
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("department_reports")
    .select(REPORT_SELECT)
    .eq("department", department)
    .eq("scope", "individual")
    .in("status", ["submitted", "under_review", "acknowledged"])
    .gte("period_end_date", windowStart)
    .lte("period_end_date", windowEnd)
    .is("archived_at", null)
    .order("submitted_at", { ascending: true });

  if (error) {
    logOpsServerError(error, {
      module: "department_reports",
      action: "fetchSubmittedIndividualReports",
    });
    return [];
  }
  return ((data ?? []) as unknown as RawDepartmentReport[]).map(normalize);
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
