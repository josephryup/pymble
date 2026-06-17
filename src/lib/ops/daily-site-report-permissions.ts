import type { OpsDailySiteReportStatus, OpsUserRole } from "@/lib/ops/types";

const DAILY_SITE_REPORT_VIEW_ROLES = new Set<OpsUserRole>([
  "developer",
  "managing_director",
  "general_manager",
  "owner",
  "manager",
  "operations_manager",
  "projects_manager",
  "procurement_manager",
  "quantity_surveyor",
  "finance_manager",
  "accountant",
  "engineer",
  "hse_officer",
  "hse_assistant_officer",
  "supervisor",
]);

const DAILY_SITE_REPORT_CREATE_ROLES = new Set<OpsUserRole>([
  "developer",
  "managing_director",
  "general_manager",
  "owner",
  "manager",
  "operations_manager",
  "projects_manager",
  "engineer",
  "supervisor",
]);

const DAILY_SITE_REPORT_REVIEW_ROLES = new Set<OpsUserRole>([
  "developer",
  "managing_director",
  "general_manager",
  "owner",
  "manager",
  "operations_manager",
  "projects_manager",
]);

export function canViewOpsDailySiteReports(role: OpsUserRole) {
  return DAILY_SITE_REPORT_VIEW_ROLES.has(role);
}

export function canCreateOpsDailySiteReport(role: OpsUserRole) {
  return DAILY_SITE_REPORT_CREATE_ROLES.has(role);
}

export function canEditOpsDailySiteReport(
  userId: string,
  role: OpsUserRole,
  report: { prepared_by: string | null; status: OpsDailySiteReportStatus },
) {
  if (!["draft", "submitted"].includes(report.status)) {
    return false;
  }

  return DAILY_SITE_REPORT_REVIEW_ROLES.has(role) || report.prepared_by === userId;
}

export function canSubmitOpsDailySiteReport(
  userId: string,
  role: OpsUserRole,
  report: { prepared_by: string | null; status: OpsDailySiteReportStatus },
) {
  return report.status === "draft" && canEditOpsDailySiteReport(userId, role, report);
}

export function canReviewOpsDailySiteReport(role: OpsUserRole) {
  return DAILY_SITE_REPORT_REVIEW_ROLES.has(role);
}

export function canCloseOpsDailySiteReport(role: OpsUserRole) {
  return DAILY_SITE_REPORT_REVIEW_ROLES.has(role);
}

const DAILY_SITE_REPORT_ARCHIVE_ROLES = new Set<OpsUserRole>([
  "developer",
  "managing_director",
  "owner",
  "general_manager",
  "manager",
  "operations_manager",
  "projects_manager",
]);

export function canCancelOpsDailySiteReport(
  userId: string,
  role: OpsUserRole,
  report: { prepared_by: string | null; status: OpsDailySiteReportStatus },
) {
  // Preparer can cancel their own draft. Leadership can cancel a draft or
  // submitted report (e.g. duplicate filed).
  if (report.status !== "draft" && report.status !== "submitted") {
    return false;
  }
  if (DAILY_SITE_REPORT_ARCHIVE_ROLES.has(role)) {
    return true;
  }
  return report.prepared_by === userId;
}

export function canArchiveOpsDailySiteReport(
  role: OpsUserRole,
  report: { status: OpsDailySiteReportStatus; cancelled_at?: string | null },
) {
  // Archive once the report is closed or cancelled.
  const terminal = report.status === "closed" || report.cancelled_at != null;
  return terminal && DAILY_SITE_REPORT_ARCHIVE_ROLES.has(role);
}

export function canDeleteOpsDailySiteReport(role: OpsUserRole) {
  return role === "developer";
}
