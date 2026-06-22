"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeOpsActionErrorMessage } from "@/lib/ops/action-errors";
import { requireOpsUser } from "@/lib/ops/auth";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import {
  canReviewDepartmentReport,
  canSubmitDepartmentReport,
  canViewDepartmentReport,
  type OpsDepartmentKey,
} from "@/lib/ops/department-report-permissions";
import { fetchOpsDepartmentReportById } from "@/lib/ops/department-reports";
import { logOpsServerError } from "@/lib/ops/log";
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
  "executive",
]);
const periodEnum = z.enum(["weekly", "monthly", "quarterly", "ad_hoc"]);

const createReportSchema = z.object({
  department: departmentEnum,
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

function assertCanWriteDepartment(role: OpsUserRole, department: OpsDepartmentKey) {
  if (!canSubmitDepartmentReport(role)) {
    reportError("Only department heads or leadership can submit reports.");
  }
  if (!canViewDepartmentReport(role, department)) {
    reportError("You cannot submit a report for another department.");
  }
}

async function notifyLeadershipOnSubmit({
  reportId,
  department,
  title,
  actorId,
}: {
  reportId: string;
  department: OpsDepartmentKey;
  title: string;
  actorId: string;
}) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("users")
    .select("id")
    .in("role", ["managing_director", "general_manager", "owner", "manager"])
    .eq("is_active", true);
  if (error) {
    logOpsServerError(error, {
      module: "department_reports",
      action: "notifyLeadershipOnSubmit",
    });
    return;
  }
  const today = new Date().toISOString().slice(0, 10);
  await Promise.all(
    (data ?? [])
      .filter((row) => (row as { id: string }).id !== actorId)
      .map((row) =>
        queueOpsNotification({
          actionHref: `${ROUTE}/${reportId}`,
          body: `${title} (${department}) has been submitted for review.`,
          idempotencyKey: `dept-report-submit:${today}:${reportId}:${(row as { id: string }).id}`,
          moduleKey: "department_reports",
          recipientId: (row as { id: string }).id,
          sourceId: reportId,
          sourceTable: "department_reports",
          title: "Department report submitted",
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
  assertCanWriteDepartment(profile.role, parsed.data.department);
  const metrics = parseMetrics(parsed.data.metrics_json);

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("department_reports")
    .insert({
      department: parsed.data.department,
      period: parsed.data.period,
      period_start_date: parsed.data.period_start_date,
      period_end_date: parsed.data.period_end_date,
      title: parsed.data.title,
      narrative: parsed.data.narrative,
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
  if (!canViewDepartmentReport(profile.role, existing.department)) {
    reportError("You cannot edit a report from another department.");
  }
  if (
    existing.status === "acknowledged" &&
    profile.role !== "developer"
  ) {
    reportError("Acknowledged reports can no longer be edited.");
  }
  assertCanWriteDepartment(profile.role, parsed.data.department);
  const metrics = parseMetrics(parsed.data.metrics_json);

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
  if (!canViewDepartmentReport(profile.role, existing.department)) {
    reportError("You cannot submit another department's report.");
  }
  if (!canSubmitDepartmentReport(profile.role)) {
    reportError("Only department heads or leadership can submit reports.");
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

  await notifyLeadershipOnSubmit({
    reportId: parsed.data.id,
    department: existing.department,
    title: existing.title,
    actorId: profile.id,
  });

  revalidatePath(ROUTE);
  revalidatePath(`${ROUTE}/${parsed.data.id}`);
  redirect(`${ROUTE}/${parsed.data.id}?updated=submitted`);
}

export async function reviewDepartmentReportAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  if (!canReviewDepartmentReport(profile.role)) {
    reportError("Only leadership can review department reports.");
  }
  const parsed = reviewSchema.safeParse({
    id: field(formData, "id"),
    decision: field(formData, "decision"),
    review_notes: field(formData, "review_notes"),
  });
  if (!parsed.success) {
    reportError(parsed.error.issues[0]?.message ?? "Check the review fields.");
  }

  const existing = await fetchOpsDepartmentReportById(parsed.data.id);
  if (!existing) reportError("The department report was not found.");
  if (existing.status === "draft") {
    reportError("The report has not been submitted yet.");
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
  if (error) reportError(error.message);

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
    !canReviewDepartmentReport(profile.role) &&
    !canViewDepartmentReport(profile.role, existing.department)
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
