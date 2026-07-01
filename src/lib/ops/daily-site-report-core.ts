import { z } from "zod";
import type { OpsUserProfile } from "@/lib/ops/auth";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import { canCreateOpsDailySiteReport } from "@/lib/ops/daily-site-report-permissions";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

/**
 * Shared core for creating a daily site report — used by both
 * createDailySiteReportAction (the online form submit, in
 * daily-site-report-actions.ts) and the /api/ops/offline/daily-site-reports
 * route (the outbox replay endpoint for field staff filing a report with no
 * signal). Kept outside any "use server" file so it's a plain function
 * importable from a Route Handler without becoming an accidental server
 * action itself.
 */

export const createDailySiteReportSchema = z.object({
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

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export type CreateDailySiteReportResult =
  | { ok: true; id: string; reportNumber: string }
  | { ok: false; message: string };

export async function createDailySiteReportCore(
  formData: FormData,
  profile: OpsUserProfile,
): Promise<CreateDailySiteReportResult> {
  if (!canCreateOpsDailySiteReport(profile.role)) {
    return { ok: false, message: "Your role cannot create daily site reports." };
  }

  const parsed = createDailySiteReportSchema.safeParse({
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
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the daily report details." };
  }

  // Sprint 10 offline support: if the page submitted a client_id (UUID
  // generated when the user filled the form offline), upsert on it so a
  // replayed FormData doesn't insert twice.
  const clientId = (field(formData, "client_id") || "").trim() || null;
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = clientId
    ? await supabase
        .from("daily_site_reports")
        .upsert(
          { ...parsed.data, client_id: clientId, prepared_by: profile.id },
          { onConflict: "client_id", ignoreDuplicates: false },
        )
        .select("id, report_number")
        .single<{ id: string; report_number: string }>()
    : await supabase
        .from("daily_site_reports")
        .insert({
          ...parsed.data,
          prepared_by: profile.id,
        })
        .select("id, report_number")
        .single<{ id: string; report_number: string }>();

  if (error || !data) {
    return { ok: false, message: error?.message ?? "The daily site report could not be created." };
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

  return { ok: true, id: data.id, reportNumber: data.report_number };
}
