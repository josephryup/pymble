"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeOpsActionErrorMessage } from "@/lib/ops/action-errors";
import { requireOpsUser } from "@/lib/ops/auth";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import {
  canCloseOpsDailySiteReport,
  canCreateOpsDailySiteReport,
  canEditOpsDailySiteReport,
  canReviewOpsDailySiteReport,
  canSubmitOpsDailySiteReport,
} from "@/lib/ops/daily-site-report-permissions";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type { OpsDailySiteReportStatus } from "@/lib/ops/types";

const createReportSchema = z.object({
  commercial_notes: z.string().trim().max(1200).default(""),
  delay_notes: z.string().trim().max(1200).default(""),
  equipment_count: z.coerce.number().int().min(0).default(0),
  equipment_notes: z.string().trim().max(1200).default(""),
  hse_notes: z.string().trim().max(1200).default(""),
  incident_count: z.coerce.number().int().min(0).default(0),
  labour_count: z.coerce.number().int().min(0).default(0),
  labour_notes: z.string().trim().max(1200).default(""),
  material_deliveries_count: z.coerce.number().int().min(0).default(0),
  material_notes: z.string().trim().max(1200).default(""),
  overall_progress_percent: z.coerce.number().min(0).max(100).default(0),
  progress_summary: z.string().trim().min(2, "Progress summary is required.").max(1600),
  report_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid report date."),
  site_id: z.string().uuid("Select a Pymble site."),
  weather: z.string().trim().max(160).default(""),
});

const entrySchema = z.object({
  entry_type: z.enum(["progress", "labour", "equipment", "material", "delay", "hse", "commercial"]),
  hours: z.coerce.number().min(0).default(0),
  notes: z.string().trim().max(800).default(""),
  quantity: z.coerce.number().min(0).default(0),
  report_id: z.string().uuid("Select a daily report."),
  title: z.string().trim().min(2, "Entry title is required.").max(180),
  unit: z.string().trim().max(40).default(""),
});

const statusSchema = z.object({
  report_id: z.string().uuid("Select a daily report."),
});

type ReportPermissionRecord = {
  id: string;
  prepared_by: string | null;
  report_number: string;
  status: OpsDailySiteReportStatus;
};

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function reportError(message: string): never {
  redirect(`/ops/daily-site-reports?error=${encodeURIComponent(safeOpsActionErrorMessage(message))}`);
}

function reportNotice(value: string): never {
  redirect(`/ops/daily-site-reports?updated=${encodeURIComponent(value)}`);
}

async function fetchReportForPermission(reportId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("daily_site_reports")
    .select("id, report_number, prepared_by, status")
    .eq("id", reportId)
    .maybeSingle<ReportPermissionRecord>();

  if (error) {
    throw error;
  }

  return data;
}

export async function createDailySiteReportAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canCreateOpsDailySiteReport(profile.role)) {
    reportError("Your role cannot create daily site reports.");
  }

  const parsed = createReportSchema.safeParse({
    commercial_notes: field(formData, "commercial_notes"),
    delay_notes: field(formData, "delay_notes"),
    equipment_count: field(formData, "equipment_count") || "0",
    equipment_notes: field(formData, "equipment_notes"),
    hse_notes: field(formData, "hse_notes"),
    incident_count: field(formData, "incident_count") || "0",
    labour_count: field(formData, "labour_count") || "0",
    labour_notes: field(formData, "labour_notes"),
    material_deliveries_count: field(formData, "material_deliveries_count") || "0",
    material_notes: field(formData, "material_notes"),
    overall_progress_percent: field(formData, "overall_progress_percent") || "0",
    progress_summary: field(formData, "progress_summary"),
    report_date: field(formData, "report_date"),
    site_id: field(formData, "site_id"),
    weather: field(formData, "weather"),
  });

  if (!parsed.success) {
    reportError(parsed.error.issues[0]?.message ?? "Check the daily report details.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("daily_site_reports")
    .insert({
      ...parsed.data,
      prepared_by: profile.id,
    })
    .select("id, report_number")
    .single<{ id: string; report_number: string }>();

  if (error || !data) {
    reportError(error?.message ?? "The daily site report could not be created.");
  }

  await recordOpsAuditEvent({
    action: "daily_site_report.created",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "daily_site_report",
    metadata: {
      report_date: parsed.data.report_date,
      site_id: parsed.data.site_id,
    },
    moduleKey: "daily_site_reports",
    sourceId: data.id,
    sourceTable: "daily_site_reports",
    summary: `Created daily site report ${data.report_number}`,
  }).catch(() => null);

  revalidatePath("/ops/daily-site-reports");
  redirect("/ops/daily-site-reports?created=report");
}

export async function addDailySiteReportEntryAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = entrySchema.safeParse({
    entry_type: field(formData, "entry_type"),
    hours: field(formData, "hours") || "0",
    notes: field(formData, "notes"),
    quantity: field(formData, "quantity") || "0",
    report_id: field(formData, "report_id"),
    title: field(formData, "title"),
    unit: field(formData, "unit"),
  });

  if (!parsed.success) {
    reportError(parsed.error.issues[0]?.message ?? "Check the report entry details.");
  }

  const report = await fetchReportForPermission(parsed.data.report_id);

  if (!report) {
    reportError("The daily report could not be found.");
  }

  if (!canEditOpsDailySiteReport(profile.id, profile.role, report)) {
    reportError("Your role cannot add entries to this daily report.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("daily_site_report_entries")
    .insert({
      ...parsed.data,
      created_by: profile.id,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !data) {
    reportError(error?.message ?? "The daily report entry could not be added.");
  }

  await recordOpsAuditEvent({
    action: "daily_site_report_entry.created",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "daily_site_report_entry",
    metadata: {
      entry_type: parsed.data.entry_type,
      report_id: parsed.data.report_id,
    },
    moduleKey: "daily_site_reports",
    sourceId: parsed.data.report_id,
    sourceTable: "daily_site_reports",
    summary: `Added ${parsed.data.entry_type} entry to ${report.report_number}`,
  }).catch(() => null);

  revalidatePath("/ops/daily-site-reports");
  reportNotice("entry_added");
}

export async function submitDailySiteReportAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = statusSchema.safeParse({ report_id: field(formData, "report_id") });

  if (!parsed.success) {
    reportError(parsed.error.issues[0]?.message ?? "Select a daily report.");
  }

  const report = await fetchReportForPermission(parsed.data.report_id);

  if (!report) {
    reportError("The daily report could not be found.");
  }

  if (!canSubmitOpsDailySiteReport(profile.id, profile.role, report)) {
    reportError("Your role cannot submit this daily report.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("daily_site_reports")
    .update({
      status: "submitted",
      submitted_at: new Date().toISOString(),
    })
    .eq("id", report.id);

  if (error) {
    reportError(error.message);
  }

  await recordOpsAuditEvent({
    action: "daily_site_report.submitted",
    actorUserId: profile.id,
    entityId: report.id,
    entityType: "daily_site_report",
    moduleKey: "daily_site_reports",
    sourceId: report.id,
    sourceTable: "daily_site_reports",
    summary: `Submitted daily site report ${report.report_number}`,
  }).catch(() => null);

  revalidatePath("/ops/daily-site-reports");
  reportNotice("submitted");
}

export async function reviewDailySiteReportAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = statusSchema.safeParse({ report_id: field(formData, "report_id") });

  if (!parsed.success) {
    reportError(parsed.error.issues[0]?.message ?? "Select a daily report.");
  }

  const report = await fetchReportForPermission(parsed.data.report_id);

  if (!report) {
    reportError("The daily report could not be found.");
  }

  if (report.status !== "submitted" || !canReviewOpsDailySiteReport(profile.role)) {
    reportError("Your role cannot review this daily report.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("daily_site_reports")
    .update({
      reviewed_at: new Date().toISOString(),
      reviewed_by: profile.id,
      status: "reviewed",
    })
    .eq("id", report.id);

  if (error) {
    reportError(error.message);
  }

  await recordOpsAuditEvent({
    action: "daily_site_report.reviewed",
    actorUserId: profile.id,
    entityId: report.id,
    entityType: "daily_site_report",
    moduleKey: "daily_site_reports",
    sourceId: report.id,
    sourceTable: "daily_site_reports",
    summary: `Reviewed daily site report ${report.report_number}`,
  }).catch(() => null);

  revalidatePath("/ops/daily-site-reports");
  reportNotice("reviewed");
}

export async function closeDailySiteReportAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = statusSchema.safeParse({ report_id: field(formData, "report_id") });

  if (!parsed.success) {
    reportError(parsed.error.issues[0]?.message ?? "Select a daily report.");
  }

  const report = await fetchReportForPermission(parsed.data.report_id);

  if (!report) {
    reportError("The daily report could not be found.");
  }

  if (report.status !== "reviewed" || !canCloseOpsDailySiteReport(profile.role)) {
    reportError("Your role cannot close this daily report.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("daily_site_reports")
    .update({
      closed_at: new Date().toISOString(),
      status: "closed",
    })
    .eq("id", report.id);

  if (error) {
    reportError(error.message);
  }

  await recordOpsAuditEvent({
    action: "daily_site_report.closed",
    actorUserId: profile.id,
    entityId: report.id,
    entityType: "daily_site_report",
    moduleKey: "daily_site_reports",
    sourceId: report.id,
    sourceTable: "daily_site_reports",
    summary: `Closed daily site report ${report.report_number}`,
  }).catch(() => null);

  revalidatePath("/ops/daily-site-reports");
  reportNotice("closed");
}
