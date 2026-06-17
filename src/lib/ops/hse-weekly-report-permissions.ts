import type { OpsHseWeeklyReportStatus, OpsUserRole } from "@/lib/ops/types";

const HSE_AUTHOR_ROLES = new Set<OpsUserRole>([
  "developer",
  "managing_director",
  "owner",
  "general_manager",
  "manager",
  "operations_manager",
  "projects_manager",
  "hse_officer",
  "hse_assistant_officer",
]);

const HSE_REVIEW_ROLES = new Set<OpsUserRole>([
  "developer",
  "managing_director",
  "owner",
  "general_manager",
  "manager",
  "operations_manager",
  "projects_manager",
]);

const HSE_ARCHIVE_ROLES = HSE_REVIEW_ROLES;

export type OpsHseWeeklyReportMutationTarget = {
  status: OpsHseWeeklyReportStatus;
  prepared_by?: string | null;
  archived_at?: string | null;
};

export function canCreateHseWeeklyReport(role: OpsUserRole) {
  return HSE_AUTHOR_ROLES.has(role);
}

export function canEditHseWeeklyReport(
  userId: string,
  role: OpsUserRole,
  report: OpsHseWeeklyReportMutationTarget,
) {
  if (report.archived_at) return false;
  if (report.status !== "draft") {
    // Only leadership can edit once submitted (typo fixes).
    return HSE_REVIEW_ROLES.has(role);
  }
  // Draft is editable by leadership OR the preparer.
  return HSE_REVIEW_ROLES.has(role) || (report.prepared_by != null && report.prepared_by === userId);
}

export function canSubmitHseWeeklyReport(
  userId: string,
  role: OpsUserRole,
  report: OpsHseWeeklyReportMutationTarget,
) {
  return report.status === "draft" && canEditHseWeeklyReport(userId, role, report);
}

export function canReviewHseWeeklyReport(
  role: OpsUserRole,
  report: OpsHseWeeklyReportMutationTarget,
) {
  return report.status === "submitted" && HSE_REVIEW_ROLES.has(role);
}

export function canArchiveHseWeeklyReport(role: OpsUserRole) {
  return HSE_ARCHIVE_ROLES.has(role);
}

export function canDeleteHseWeeklyReport(role: OpsUserRole) {
  return role === "developer";
}
