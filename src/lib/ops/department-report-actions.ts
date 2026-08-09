"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeOpsActionErrorMessage } from "@/lib/ops/action-errors";
import { requireOpsUser } from "@/lib/ops/auth";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import {
  canFileDepartmentReport,
  canReviewDepartmentReport,
  canReviewDepartmentReportRecord,
  canViewDepartmentReportRecord,
  OPS_DEPARTMENT_LABELS,
  reviewerRolesForReport,
  type OpsDepartmentKey,
  type OpsDepartmentReportScope,
} from "@/lib/ops/department-report-permissions";
import {
  collectTemplateMetrics,
  collectTemplateSections,
} from "@/lib/ops/department-report-templates";
import { fetchOpsDepartmentReportById } from "@/lib/ops/department-reports";
import { logOpsServerError } from "@/lib/ops/log";
import { fanoutToOpsRoles } from "@/lib/ops/notification-fanout";
import { queueOpsNotification } from "@/lib/ops/notifications";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type { OpsUserRole } from "@/lib/ops/types";

const ROUTE = "/ops/department-reports";
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const departmentEnum = z.enum([
  "operations",
  "engineering",
  "procurement",
  "finance",
  "commercial",
  "hse",
  "hr",
  "it",
  "executive",
]);
const periodEnum = z.enum(["weekly", "monthly", "quarterly", "ad_hoc"]);

const scopeEnum = z.enum(["individual", "compiled"]);

const createReportSchema = z.object({
  department: departmentEnum,
  scope: scopeEnum.default("compiled"),
  period: periodEnum,
  period_start_date: z.string().regex(datePattern, "Pick a period start date."),
  period_end_date: z.string().regex(datePattern, "Pick a period end date."),
  title: z.string().trim().min(2, "Report title is required.").max(200),
  narrative: z.string().trim().max(20000).default(""),
  metrics_json: z.string().trim().default(""),
});

const updateReportSchema = createReportSchema.extend({
  id: z.string().uuid("Select a department report."),
});

const idSchema = z.object({ id: z.string().uuid("Select a department report.") });

const reviewSchema = z.object({
  id: z.string().uuid("Select a department report."),
  decision: z.enum(["acknowledged", "revision_requested"]),
  review_notes: z.string().trim().max(5000).default(""),
});

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function reportError(message: string): never {
  redirect(
    `${ROUTE}?error=${encodeURIComponent(safeOpsActionErrorMessage(message))}`,
  );
}

/**
 * Same failure, but shown on the report it happened to.
 *
 * Bouncing a reviewer to the index left them reading a message with no idea
 * which report it belonged to, and with the review notes they had just typed
 * gone. Anything that already knows its report id reports the failure here.
 */
function reportRecordError(id: string, message: string): never {
  redirect(
    `${ROUTE}/${id}?error=${encodeURIComponent(safeOpsActionErrorMessage(message))}`,
  );
}

function parseMetrics(input: string): Record<string, unknown> {
  if (!input) return {};
  try {
    const parsed = JSON.parse(input);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // fall through
  }
  reportError("Metrics must be a JSON object.");
}

function assertCanWriteDepartment(
  role: OpsUserRole,
  department: OpsDepartmentKey,
  scope: OpsDepartmentReportScope,
) {
  if (!canFileDepartmentReport(role, department, scope)) {
    reportError(
      scope === "individual"
        ? "Your role does not file individual reports for this department."
        : "Your role does not file this department's compiled report.",
    );
  }
}

/**
 * Routes the submission to whoever reviews this tier: line managers for an
 * individual report (engineer → Projects Manager), leadership for a compiled
 * one (Procurement Manager → GM + MD). Resolved through the workflow
 * fallback chain so an unfilled seat never swallows the report.
 */
async function notifyReviewersOnSubmit({
  report,
  actorId,
  actorName,
}: {
  report: {
    id: string;
    department: OpsDepartmentKey;
    scope: OpsDepartmentReportScope;
    title: string;
    /**
     * The moment this submission happened. Part of the notification key so a
     * genuine RE-submission (after a rejection) notifies again, while a
     * double-click on the same submission does not. Previously the key used
     * the calendar date, which conflated the two — see audit §9.
     */
    submittedAt: string;
  };
  actorId: string;
  actorName: string;
}) {
  const reviewerRoles = reviewerRolesForReport(report);
  if (reviewerRoles.length === 0) return;

  const reviewers = await fanoutToOpsRoles(reviewerRoles, {
    excludeUserIds: [actorId],
  }).catch(() => []);

  await Promise.all(
    reviewers.map((reviewer) =>
      queueOpsNotification({
        actionHref: `${ROUTE}/${report.id}`,
        body: `${actorName} submitted ${report.title} (${OPS_DEPARTMENT_LABELS[report.department]}) for your review.`,
        idempotencyKey: `dept-report-submit:${report.id}:${report.submittedAt}:${reviewer.id}`,
        moduleKey: "department_reports",
        recipientId: reviewer.id,
        sourceId: report.id,
        sourceTable: "department_reports",
        title:
          report.scope === "individual"
            ? "Team report awaiting your review"
            : "Department report submitted",
      }).catch(() => null),
    ),
  );
}

async function notifyHeadOnReview({
  reportId,
  recipientId,
  decision,
  title,
}: {
  reportId: string;
  recipientId: string;
  decision: "acknowledged" | "revision_requested";
  title: string;
}) {
  await queueOpsNotification({
    actionHref: `${ROUTE}/${reportId}`,
    body:
      decision === "acknowledged"
        ? `${title} has been acknowledged by leadership.`
        : `${title} needs revisions before it can be acknowledged.`,
    idempotencyKey: `dept-report-review:${reportId}:${decision}`,
    moduleKey: "department_reports",
    recipientId,
    sourceId: reportId,
    sourceTable: "department_reports",
    title:
      decision === "acknowledged"
        ? "Department report acknowledged"
        : "Department report needs revisions",
  }).catch(() => null);
}

export async function createDepartmentReportAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = createReportSchema.safeParse({
    department: field(formData, "department"),
    scope: field(formData, "scope") || "compiled",
    period: field(formData, "period"),
    period_start_date: field(formData, "period_start_date"),
    period_end_date: field(formData, "period_end_date"),
    title: field(formData, "title"),
    narrative: field(formData, "narrative"),
    metrics_json: field(formData, "metrics_json"),
  });
  if (!parsed.success) {
    reportError(parsed.error.issues[0]?.message ?? "Check the report details.");
  }
  if (parsed.data.period_end_date < parsed.data.period_start_date) {
    reportError("Period end date must be on or after the start date.");
  }
  assertCanWriteDepartment(profile.role, parsed.data.department, parsed.data.scope);
  // Structured template inputs win over the advanced-JSON extras.
  const metrics = collectTemplateMetrics(
    parsed.data.department,
    (name) => field(formData, name),
    parseMetrics(parsed.data.metrics_json),
  );
  const sections = collectTemplateSections(
    parsed.data.department,
    parsed.data.scope,
    (name) => field(formData, name),
  );

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("department_reports")
    .insert({
      department: parsed.data.department,
      scope: parsed.data.scope,
      period: parsed.data.period,
      period_start_date: parsed.data.period_start_date,
      period_end_date: parsed.data.period_end_date,
      title: parsed.data.title,
      narrative: parsed.data.narrative,
      sections,
      metrics,
      created_by: profile.id,
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) {
    logOpsServerError(error, {
      module: "department_reports",
      action: "createDepartmentReportAction",
    });
    reportError(error?.message ?? "The department report could not be created.");
  }

  await recordOpsAuditEvent({
    action: "department_report.created",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "department_report",
    metadata: { department: parsed.data.department, period: parsed.data.period },
    moduleKey: "department_reports",
    sourceId: data.id,
    sourceTable: "department_reports",
    summary: `Created department report draft: ${parsed.data.title}`,
  }).catch(() => null);

  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${data.id}?created=report`);
}

export async function updateDepartmentReportAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = updateReportSchema.safeParse({
    id: field(formData, "id"),
    department: field(formData, "department"),
    period: field(formData, "period"),
    period_start_date: field(formData, "period_start_date"),
    period_end_date: field(formData, "period_end_date"),
    title: field(formData, "title"),
    narrative: field(formData, "narrative"),
    metrics_json: field(formData, "metrics_json"),
  });
  if (!parsed.success) {
    reportError(parsed.error.issues[0]?.message ?? "Check the report details.");
  }
  if (parsed.data.period_end_date < parsed.data.period_start_date) {
    reportError("Period end date must be on or after the start date.");
  }

  const existing = await fetchOpsDepartmentReportById(parsed.data.id);
  if (!existing) reportError("The department report was not found.");
  if (!canViewDepartmentReportRecord(profile.role, profile.id, existing)) {
    reportError("You cannot edit that report.");
  }
  // Tier isolation: an individual report is edited only by its author (or
  // leadership); a colleague from the same department cannot touch it.
  if (
    existing.scope === "individual" &&
    existing.created_by !== profile.id &&
    !canReviewDepartmentReport(profile.role)
  ) {
    reportError("Only the report's author can edit it.");
  }
  if (
    existing.status === "acknowledged" &&
    profile.role !== "developer"
  ) {
    reportError("Acknowledged reports can no longer be edited.");
  }
  assertCanWriteDepartment(profile.role, parsed.data.department, existing.scope);
  // Structured template inputs win over the advanced-JSON extras.
  const metrics = collectTemplateMetrics(
    parsed.data.department,
    (name) => field(formData, name),
    parseMetrics(parsed.data.metrics_json),
  );
  const sections = collectTemplateSections(
    parsed.data.department,
    existing.scope,
    (name) => field(formData, name),
  );

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("department_reports")
    .update({
      department: parsed.data.department,
      period: parsed.data.period,
      period_start_date: parsed.data.period_start_date,
      period_end_date: parsed.data.period_end_date,
      title: parsed.data.title,
      narrative: parsed.data.narrative,
      sections,
      metrics,
      // Revision means it's back in the head's hands as a draft.
      status:
        existing.status === "revision_requested" ? "draft" : existing.status,
    })
    .eq("id", parsed.data.id);
  if (error) {
    reportError(error.message);
  }

  await recordOpsAuditEvent({
    action: "department_report.updated",
    actorUserId: profile.id,
    entityId: parsed.data.id,
    entityType: "department_report",
    moduleKey: "department_reports",
    sourceId: parsed.data.id,
    sourceTable: "department_reports",
    summary: `Updated department report: ${parsed.data.title}`,
  }).catch(() => null);

  revalidatePath(ROUTE);
  revalidatePath(`${ROUTE}/${parsed.data.id}`);
  redirect(`${ROUTE}/${parsed.data.id}?updated=report`);
}

export async function submitDepartmentReportAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = idSchema.safeParse({ id: field(formData, "id") });
  if (!parsed.success) reportError("Select a department report.");

  const existing = await fetchOpsDepartmentReportById(parsed.data.id);
  if (!existing) reportError("The department report was not found.");
  if (!canViewDepartmentReportRecord(profile.role, profile.id, existing)) {
    reportError("You cannot submit that report.");
  }
  assertCanWriteDepartment(profile.role, existing.department, existing.scope);
  if (
    existing.scope === "individual" &&
    existing.created_by !== profile.id &&
    !canReviewDepartmentReport(profile.role)
  ) {
    reportError("Only the report's author can submit it.");
  }
  if (existing.status === "submitted" || existing.status === "under_review") {
    reportError("This report has already been submitted.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("department_reports")
    .update({
      status: "submitted",
      submitted_at: now,
      submitted_by: profile.id,
    })
    .eq("id", parsed.data.id);
  if (error) reportError(error.message);

  await recordOpsAuditEvent({
    action: "department_report.submitted",
    actorUserId: profile.id,
    entityId: parsed.data.id,
    entityType: "department_report",
    moduleKey: "department_reports",
    sourceId: parsed.data.id,
    sourceTable: "department_reports",
    summary: `Submitted department report: ${existing.title}`,
  }).catch(() => null);

  await notifyReviewersOnSubmit({
    report: {
      id: parsed.data.id,
      department: existing.department,
      scope: existing.scope,
      title: existing.title,
      submittedAt: now,
    },
    actorId: profile.id,
    actorName: profile.full_name,
  });

  revalidatePath(ROUTE);
  revalidatePath(`${ROUTE}/${parsed.data.id}`);
  redirect(`${ROUTE}/${parsed.data.id}?updated=submitted`);
}

export async function reviewDepartmentReportAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = reviewSchema.safeParse({
    id: field(formData, "id"),
    decision: field(formData, "decision"),
    review_notes: field(formData, "review_notes"),
  });
  if (!parsed.success) {
    // The id is the one field that tells us where to send them back to, so use
    // it when it survived validation even though something else did not.
    const rawId = field(formData, "id");
    const message = parsed.error.issues[0]?.message ?? "Check the review fields.";
    if (z.string().uuid().safeParse(rawId).success) {
      reportRecordError(rawId, message);
    }
    reportError(message);
  }

  const reviewError = (message: string): never =>
    reportRecordError(parsed.data.id, message);

  const existing = await fetchOpsDepartmentReportById(parsed.data.id);
  if (!existing) reportError("The department report was not found.");
  // Individual reports are reviewed by the line manager they route to
  // (e.g. Projects Manager); compiled reports need MD/GM/Developer.
  if (!canReviewDepartmentReportRecord(profile.role, existing)) {
    reviewError("Your role cannot review this report.");
  }
  if (
    (existing.submitted_by === profile.id || existing.created_by === profile.id) &&
    profile.role !== "developer"
  ) {
    reviewError("You cannot review your own report.");
  }
  if (existing.status === "draft") {
    reviewError("The report has not been submitted yet.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("department_reports")
    .update({
      status: parsed.data.decision,
      reviewed_at: now,
      reviewed_by: profile.id,
      review_notes: parsed.data.review_notes,
    })
    .eq("id", parsed.data.id);
  if (error) reviewError(error.message);

  await recordOpsAuditEvent({
    action:
      parsed.data.decision === "acknowledged"
        ? "department_report.acknowledged"
        : "department_report.revision_requested",
    actorUserId: profile.id,
    entityId: parsed.data.id,
    entityType: "department_report",
    moduleKey: "department_reports",
    sourceId: parsed.data.id,
    sourceTable: "department_reports",
    summary: `${parsed.data.decision} department report: ${existing.title}`,
  }).catch(() => null);

  if (existing.submitted_by) {
    await notifyHeadOnReview({
      reportId: parsed.data.id,
      recipientId: existing.submitted_by,
      decision: parsed.data.decision,
      title: existing.title,
    });
  }

  revalidatePath(ROUTE);
  revalidatePath(`${ROUTE}/${parsed.data.id}`);
  redirect(`${ROUTE}/${parsed.data.id}?updated=${parsed.data.decision}`);
}

export async function archiveDepartmentReportAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = idSchema.safeParse({ id: field(formData, "id") });
  if (!parsed.success) reportError("Select a department report.");

  const existing = await fetchOpsDepartmentReportById(parsed.data.id);
  if (!existing) reportError("The department report was not found.");
  if (
    !canReviewDepartmentReportRecord(profile.role, existing) &&
    existing.created_by !== profile.id &&
    existing.submitted_by !== profile.id
  ) {
    reportError("You cannot archive that report.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("department_reports")
    .update({ archived_at: now, archived_by: profile.id })
    .eq("id", parsed.data.id);
  if (error) reportError(error.message);

  await recordOpsAuditEvent({
    action: "department_report.archived",
    actorUserId: profile.id,
    entityId: parsed.data.id,
    entityType: "department_report",
    moduleKey: "department_reports",
    sourceId: parsed.data.id,
    sourceTable: "department_reports",
    summary: "Archived department report",
  }).catch(() => null);

  revalidatePath(ROUTE);
  redirect(ROUTE);
}
