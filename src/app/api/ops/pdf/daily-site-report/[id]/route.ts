import { NextResponse } from "next/server";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import { requireOpsUser } from "@/lib/ops/auth";
import { logOpsServerError } from "@/lib/ops/log";
import { fetchOpsOrganizationProfile } from "@/lib/ops/organization";
import { DailySiteReportPdf } from "@/lib/ops/pdf/DailySiteReportPdf";
import { renderPdfDocument, pdfResponseHeaders } from "@/lib/ops/pdf/render";
import { canViewOpsDailySiteReports } from "@/lib/ops/daily-site-report-permissions";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type RawReport = {
  id: string;
  report_number: string;
  report_date: string;
  weather: string | null;
  status: string;
  submitted_at: string | null;
  progress_summary: string | null;
  delay_notes: string | null;
  hse_notes: string | null;
  commercial_notes: string | null;
  prepared_by: string | null;
  site: { code: string; name: string } | { code: string; name: string }[] | null;
  prepared_by_user:
    | { full_name: string; role: string }
    | { full_name: string; role: string }[]
    | null;
};

type RawEntry = {
  entry_type: string;
  title: string;
  notes: string | null;
  quantity: number | string | null;
  unit: string | null;
  hours: number | string | null;
};

function normalizeRel<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  try {
    const { profile } = await requireOpsUser();

    if (!canViewOpsDailySiteReports(profile.role)) {
      return NextResponse.json(
        { error: "Your role cannot download daily site reports." },
        { status: 403 },
      );
    }

    const supabase = getOpsSupabaseServiceClient();
    const [reportRes, entriesRes, orgRes] = await Promise.all([
      supabase
        .from("daily_site_reports")
        .select(
          "id, report_number, report_date, weather, status, submitted_at, progress_summary, delay_notes, hse_notes, commercial_notes, prepared_by, site:sites!daily_site_reports_site_id_fkey(code, name), prepared_by_user:users!daily_site_reports_prepared_by_fkey(full_name, role)",
        )
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("daily_site_report_entries")
        .select("entry_type, title, notes, quantity, unit, hours")
        .eq("report_id", id)
        .order("created_at"),
      fetchOpsOrganizationProfile().catch(() => null),
    ]);

    if (reportRes.error || !reportRes.data) {
      return NextResponse.json(
        { error: reportRes.error?.message ?? "Daily site report not found." },
        { status: 404 },
      );
    }

    const raw = reportRes.data as unknown as RawReport;
    const submitter = normalizeRel(raw.prepared_by_user);
    const entries = (entriesRes.data ?? []) as RawEntry[];

    const pdf = await renderPdfDocument(
      DailySiteReportPdf({
        report: {
          id: raw.id,
          report_number: raw.report_number,
          report_date: raw.report_date,
          weather: raw.weather ?? null,
          status: raw.status,
          submitted_at: raw.submitted_at,
          site: normalizeRel(raw.site),
          summary: raw.progress_summary ?? null,
          delays: raw.delay_notes ?? null,
          hse_notes: raw.hse_notes ?? null,
          visitors: null,
        },
        entries: entries.map((entry) => ({
          category: entry.entry_type,
          description: [entry.title, entry.notes].filter(Boolean).join(" — "),
          quantity:
            entry.quantity !== null && entry.quantity !== undefined
              ? `${entry.quantity}${entry.unit ? ` ${entry.unit}` : ""}`
              : null,
          notes:
            entry.hours !== null && entry.hours !== undefined && Number(entry.hours) > 0
              ? `${entry.hours} hours`
              : null,
        })),
        org: orgRes
          ? {
              legal_name: orgRes.legal_name,
              trading_name: orgRes.trading_name,
              headquarters_address: orgRes.address_line ?? null,
              tpin: orgRes.tpin,
            }
          : {},
        submittedBy: submitter
          ? { full_name: submitter.full_name, role: submitter.role }
          : null,
        generatedBy: profile.full_name,
      }),
    );

    await recordOpsAuditEvent({
      action: "daily_site_report.pdf_downloaded",
      actorUserId: profile.id,
      entityId: raw.id,
      entityType: "daily_site_report",
      metadata: { report_number: raw.report_number },
      moduleKey: "daily_site_reports",
      sourceId: raw.id,
      sourceTable: "daily_site_reports",
      summary: `${profile.full_name} downloaded ${raw.report_number} as PDF`,
    }).catch(() => null);

    return new NextResponse(new Uint8Array(pdf), {
      headers: pdfResponseHeaders(`${raw.report_number}.pdf`),
    });
  } catch (error) {
    logOpsServerError(error, {
      module: "daily_site_reports",
      action: "downloadDailySiteReportPdf",
      entityId: id,
    });
    return NextResponse.json(
      { error: "The daily site report PDF could not be generated." },
      { status: 500 },
    );
  }
}
