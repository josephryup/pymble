"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeOpsActionErrorMessage } from "@/lib/ops/action-errors";
import { requireOpsUser } from "@/lib/ops/auth";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import {
  canArchiveHseWeeklyReport,
  canCreateHseWeeklyReport,
  canDeleteHseWeeklyReport,
  canEditHseWeeklyReport,
  canReviewHseWeeklyReport,
  canSubmitHseWeeklyReport,
  type OpsHseWeeklyReportMutationTarget,
} from "@/lib/ops/hse-weekly-report-permissions";
import { fanoutToOpsRoles } from "@/lib/ops/notification-fanout";
import { queueOpsNotification } from "@/lib/ops/notifications";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

const HSE_WEEKLY_ROUTE = "/ops/hse-weekly";

const createSchema = z.object({
  site_id: z.string().uuid("Select a site."),
  week_start: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid week-start date (Monday recommended)."),
  week_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid week-end date."),
  incidents_count: z.coerce.number().int().min(0).default(0),
  near_misses_count: z.coerce.number().int().min(0).default(0),
  ppe_compliance_pct: z
    .string()
    .trim()
    .default("")
    .transform((value) => (value.length > 0 ? Number(value) : null))
    .refine((value) => value === null || (value >= 0 && value <= 100), {
      message: "PPE compliance must be between 0 and 100.",
    }),
  toolbox_talks_held: z.coerce.number().int().min(0).default(0),
  inspections_completed: z.coerce.number().int().min(0).default(0),
  concerns: z.string().trim().max(4000).default(""),
  actions_planned_next_week: z.string().trim().max(4000).default(""),
});

const idSchema = z.object({
  report_id: z.string().uuid("Select a weekly HSE report."),
});

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function hseError(message: string): never {
  redirect(`${HSE_WEEKLY_ROUTE}?error=${encodeURIComponent(safeOpsActionErrorMessage(message))}`);
}

async function fetchReportForMutation(
  reportId: string,
): Promise<
  | (OpsHseWeeklyReportMutationTarget & {
      id: string;
      report_number: string;
      site_id: string;
    })
  | null
> {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("hse_weekly_reports")
    .select("id, report_number, site_id, status, prepared_by, archived_at")
    .eq("id", reportId)
    .maybeSingle();
  if (error) throw error;
  return data as
    | (OpsHseWeeklyReportMutationTarget & {
        id: string;
        report_number: string;
        site_id: string;
      })
    | null;
}

export async function createHseWeeklyReportAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canCreateHseWeeklyReport(profile.role)) {
    hseError("Only HSE Officers and leadership can create weekly HSE reports.");
  }

  const parsed = createSchema.safeParse({
    site_id: field(formData, "site_id"),
    week_start: field(formData, "week_start"),
    week_end: field(formData, "week_end"),
    incidents_count: field(formData, "incidents_count") || "0",
    near_misses_count: field(formData, "near_misses_count") || "0",
    ppe_compliance_pct: field(formData, "ppe_compliance_pct"),
    toolbox_talks_held: field(formData, "toolbox_talks_held") || "0",
    inspections_completed: field(formData, "inspections_completed") || "0",
    concerns: field(formData, "concerns"),
    actions_planned_next_week: field(formData, "actions_planned_next_week"),
  });
  if (!parsed.success) {
    hseError(parsed.error.issues[0]?.message ?? "Check the report details.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("hse_weekly_reports")
    .insert({
      site_id: parsed.data.site_id,
      week_start: parsed.data.week_start,
      week_end: parsed.data.week_end,
      incidents_count: parsed.data.incidents_count,
      near_misses_count: parsed.data.near_misses_count,
      ppe_compliance_pct: parsed.data.ppe_compliance_pct,
      toolbox_talks_held: parsed.data.toolbox_talks_held,
      inspections_completed: parsed.data.inspections_completed,
      concerns: parsed.data.concerns,
      actions_planned_next_week: parsed.data.actions_planned_next_week,
      prepared_by: profile.id,
      created_by: profile.id,
    })
    .select("id, report_number")
    .single<{ id: string; report_number: string }>();
  if (error || !data) {
    hseError(
      error?.code === "23505"
        ? "A weekly HSE report for this site and week already exists."
        : (error?.message ?? "The weekly HSE report could not be created."),
    );
  }

  await recordOpsAuditEvent({
    action: "hse_weekly_report.created",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "hse_weekly_report",
    moduleKey: "hse_compliance",
    sourceId: data.id,
    sourceTable: "hse_weekly_reports",
    summary: `Created weekly HSE report ${data.report_number}`,
  }).catch(() => null);

  revalidatePath(HSE_WEEKLY_ROUTE);
  redirect(`${HSE_WEEKLY_ROUTE}?created=report#wr-${data.id}`);
}

export async function updateHseWeeklyReportAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  const idParsed = idSchema.safeParse({ report_id: field(formData, "report_id") });
  if (!idParsed.success) {
    hseError(idParsed.error.issues[0]?.message ?? "Select a report.");
  }

  const report = await fetchReportForMutation(idParsed.data.report_id);
  if (!report) {
    hseError("Weekly HSE report was not found.");
  }
  if (!canEditHseWeeklyReport(profile.id, profile.role, report)) {
    hseError("This weekly HSE report can no longer be edited by your role.");
  }

  const parsed = createSchema.safeParse({
    site_id: field(formData, "site_id") || report.site_id,
    week_start: field(formData, "week_start"),
    week_end: field(formData, "week_end"),
    incidents_count: field(formData, "incidents_count") || "0",
    near_misses_count: field(formData, "near_misses_count") || "0",
    ppe_compliance_pct: field(formData, "ppe_compliance_pct"),
    toolbox_talks_held: field(formData, "toolbox_talks_held") || "0",
    inspections_completed: field(formData, "inspections_completed") || "0",
    concerns: field(formData, "concerns"),
    actions_planned_next_week: field(formData, "actions_planned_next_week"),
  });
  if (!parsed.success) {
    hseError(parsed.error.issues[0]?.message ?? "Check the report details.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("hse_weekly_reports")
    .update({
      week_start: parsed.data.week_start,
      week_end: parsed.data.week_end,
      incidents_count: parsed.data.incidents_count,
      near_misses_count: parsed.data.near_misses_count,
      ppe_compliance_pct: parsed.data.ppe_compliance_pct,
      toolbox_talks_held: parsed.data.toolbox_talks_held,
      inspections_completed: parsed.data.inspections_completed,
      concerns: parsed.data.concerns,
      actions_planned_next_week: parsed.data.actions_planned_next_week,
    })
    .eq("id", report.id);
  if (error) {
    hseError(error.message);
  }

  await recordOpsAuditEvent({
    action: "hse_weekly_report.updated",
    actorUserId: profile.id,
    entityId: report.id,
    entityType: "hse_weekly_report",
    moduleKey: "hse_compliance",
    sourceId: report.id,
    sourceTable: "hse_weekly_reports",
    summary: `Updated weekly HSE report ${report.report_number}`,
  }).catch(() => null);

  revalidatePath(HSE_WEEKLY_ROUTE);
  redirect(`${HSE_WEEKLY_ROUTE}?updated=report#wr-${report.id}`);
}

export async function submitHseWeeklyReportAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  const parsed = idSchema.safeParse({ report_id: field(formData, "report_id") });
  if (!parsed.success) {
    hseError(parsed.error.issues[0]?.message ?? "Select a report.");
  }

  const report = await fetchReportForMutation(parsed.data.report_id);
  if (!report) {
    hseError("Weekly HSE report was not found.");
  }
  if (!canSubmitHseWeeklyReport(profile.id, profile.role, report)) {
    hseError("This report can't be submitted in its current state.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from("hse_weekly_reports")
    .update({ status: "submitted", submitted_at: nowIso })
    .eq("id", report.id)
    .eq("status", "draft");
  if (error) {
    hseError(error.message);
  }

  await recordOpsAuditEvent({
    action: "hse_weekly_report.submitted",
    actorUserId: profile.id,
    entityId: report.id,
    entityType: "hse_weekly_report",
    moduleKey: "hse_compliance",
    sourceId: report.id,
    sourceTable: "hse_weekly_reports",
    summary: `Submitted weekly HSE report ${report.report_number}`,
  }).catch(() => null);

  // Fan out to leadership per workflow design Part 2.6.
  const recipients = await fanoutToOpsRoles(
    [
      "operations_manager",
      "projects_manager",
      "engineering_manager",
      "general_manager",
      "managing_director",
      "owner",
    ],
    { excludeUserIds: [profile.id] },
  );
  await Promise.all(
    recipients.map((recipient) =>
      queueOpsNotification({
        actionHref: `${HSE_WEEKLY_ROUTE}#wr-${report.id}`,
        body: `${profile.full_name} submitted weekly HSE report ${report.report_number}. Open it to review the week's safety picture.`,
        idempotencyKey: `hse-weekly-submitted:${report.id}:${recipient.id}`,
        moduleKey: "hse_compliance",
        recipientId: recipient.id,
        sourceId: report.id,
        sourceTable: "hse_weekly_reports",
        title: `Weekly HSE report: ${report.report_number}`,
      }).catch(() => null),
    ),
  );

  revalidatePath(HSE_WEEKLY_ROUTE);
  revalidatePath("/ops/notifications");
  redirect(`${HSE_WEEKLY_ROUTE}?updated=submitted#wr-${report.id}`);
}

export async function reviewHseWeeklyReportAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  const parsed = idSchema.safeParse({ report_id: field(formData, "report_id") });
  if (!parsed.success) {
    hseError(parsed.error.issues[0]?.message ?? "Select a report.");
  }

  const report = await fetchReportForMutation(parsed.data.report_id);
  if (!report) {
    hseError("Weekly HSE report was not found.");
  }
  if (!canReviewHseWeeklyReport(profile.role, report)) {
    hseError("Only leadership can mark a submitted weekly HSE report as reviewed.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from("hse_weekly_reports")
    .update({ status: "reviewed", reviewed_at: nowIso, reviewed_by: profile.id })
    .eq("id", report.id)
    .eq("status", "submitted");
  if (error) {
    hseError(error.message);
  }

  await recordOpsAuditEvent({
    action: "hse_weekly_report.reviewed",
    actorUserId: profile.id,
    entityId: report.id,
    entityType: "hse_weekly_report",
    moduleKey: "hse_compliance",
    sourceId: report.id,
    sourceTable: "hse_weekly_reports",
    summary: `${profile.full_name} marked weekly HSE report ${report.report_number} reviewed`,
  }).catch(() => null);

  revalidatePath(HSE_WEEKLY_ROUTE);
  redirect(`${HSE_WEEKLY_ROUTE}?updated=reviewed#wr-${report.id}`);
}

export async function archiveHseWeeklyReportAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canArchiveHseWeeklyReport(profile.role)) {
    hseError("Only leadership can archive weekly HSE reports.");
  }

  const parsed = idSchema.safeParse({ report_id: field(formData, "report_id") });
  if (!parsed.success) {
    hseError(parsed.error.issues[0]?.message ?? "Select a report.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("hse_weekly_reports")
    .update({ archived_at: new Date().toISOString(), archived_by: profile.id })
    .eq("id", parsed.data.report_id);
  if (error) {
    hseError(error.message);
  }

  await recordOpsAuditEvent({
    action: "hse_weekly_report.archived",
    actorUserId: profile.id,
    entityId: parsed.data.report_id,
    entityType: "hse_weekly_report",
    moduleKey: "hse_compliance",
    sourceId: parsed.data.report_id,
    sourceTable: "hse_weekly_reports",
    summary: `Archived weekly HSE report`,
  }).catch(() => null);

  revalidatePath(HSE_WEEKLY_ROUTE);
  redirect(`${HSE_WEEKLY_ROUTE}?updated=archived`);
}

export async function deleteHseWeeklyReportAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canDeleteHseWeeklyReport(profile.role)) {
    hseError("Only the Developer can permanently delete a weekly HSE report.");
  }

  const parsed = idSchema.safeParse({ report_id: field(formData, "report_id") });
  if (!parsed.success) {
    hseError(parsed.error.issues[0]?.message ?? "Select a report.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("hse_weekly_reports")
    .delete()
    .eq("id", parsed.data.report_id);
  if (error) {
    hseError(error.message);
  }

  revalidatePath(HSE_WEEKLY_ROUTE);
  redirect(`${HSE_WEEKLY_ROUTE}?updated=deleted`);
}
