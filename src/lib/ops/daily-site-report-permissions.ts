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
