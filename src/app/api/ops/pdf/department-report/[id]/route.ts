import { NextResponse } from "next/server";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import { requireOpsUser } from "@/lib/ops/auth";
import {
  canViewDepartmentReport,
  OPS_DEPARTMENT_LABELS,
} from "@/lib/ops/department-report-permissions";
import {
  compareReportMetrics,
  OPS_DEPARTMENT_REPORT_TEMPLATES,
  type OpsReportMetricDelta,
} from "@/lib/ops/department-report-templates";
import {
  fetchOpsDepartmentReportById,
  fetchPreviousOpsDepartmentReport,
} from "@/lib/ops/department-reports";
import { logOpsServerError } from "@/lib/ops/log";
import { fetchOpsOrganizationProfile } from "@/lib/ops/organization";
import { DepartmentReportPdf } from "@/lib/ops/pdf/DepartmentReportPdf";
import { pdfResponseHeaders, renderPdfDocument } from "@/lib/ops/pdf/render";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function formatValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toLocaleString("en-ZM");
  }
  return String(value);
}

function formatChange(change: OpsReportMetricDelta | undefined) {
  if (!change) return "";
  const sign = change.delta > 0 ? "+" : "";
  const percent =
    change.percent !== null
      ? ` (${change.percent > 0 ? "+" : ""}${change.percent}%)`
      : "";
  return `${sign}${change.delta.toLocaleString("en-ZM")}${percent}`;
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  try {
    const { profile } = await requireOpsUser();

    const report = await fetchOpsDepartmentReportById(id);
    if (!report) {
      return NextResponse.json({ error: "Department report not found." }, { status: 404 });
    }
    if (!canViewDepartmentReport(profile.role, report.department)) {
      return NextResponse.json(
        { error: "Your role cannot download this department's reports." },
        { status: 403 },
      );
    }

    const [previous, org] = await Promise.all([
      fetchPreviousOpsDepartmentReport(report).catch(() => null),
      fetchOpsOrganizationProfile().catch(() => null),
    ]);
    const deltas = previous ? compareReportMetrics(report.metrics, previous.metrics) : {};
    const template = OPS_DEPARTMENT_REPORT_TEMPLATES[report.department];

    const metricRows = Object.entries(report.metrics).map(([key, value]) => ({
      label:
        template.metrics.find((metric) => metric.key === key)?.label ??
        key.replace(/_/g, " ").replace(/^./, (first) => first.toUpperCase()),
      value: formatValue(value),
      change: formatChange(deltas[key]),
    }));

    const monthTag = new Date(`${report.period_end_date}T00:00:00Z`)
      .toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" })
      .toUpperCase();

    const pdf = await renderPdfDocument(
      DepartmentReportPdf({
        report: {
          id: report.id,
          title: report.title,
          departmentLabel: OPS_DEPARTMENT_LABELS[report.department],
          documentTag: `${report.department.toUpperCase()} · ${monthTag}`,
          period: report.period,
          period_start_date: report.period_start_date,
          period_end_date: report.period_end_date,
          status: report.status,
          submitted_at: report.submitted_at,
          reviewed_at: report.reviewed_at,
          review_notes: report.review_notes,
        },
        metrics: metricRows,
        narrative: report.narrative,
        comparedWith: previous?.title ?? null,
        org: org
          ? {
              legal_name: org.legal_name,
              trading_name: org.trading_name,
              headquarters_address: org.address_line ?? null,
              tpin: org.tpin,
            }
          : {},
        submittedBy: report.submitter,
        reviewedBy: report.reviewer,
        generatedBy: profile.full_name,
      }),
    );

    await recordOpsAuditEvent({
      action: "department_report.pdf_downloaded",
      actorUserId: profile.id,
      entityId: report.id,
      entityType: "department_report",
      metadata: { department: report.department, period: report.period },
      moduleKey: "department_reports",
      sourceId: report.id,
      sourceTable: "department_reports",
      summary: `${profile.full_name} downloaded ${report.title} as PDF`,
    }).catch(() => null);

    return new NextResponse(new Uint8Array(pdf), {
      headers: pdfResponseHeaders(
        `department-report-${report.department}-${report.period_end_date}.pdf`,
      ),
    });
  } catch (error) {
    logOpsServerError(error, {
      module: "department_reports",
      action: "downloadDepartmentReportPdf",
      entityId: id,
    });
    return NextResponse.json(
      { error: "The department report PDF could not be generated." },
      { status: 500 },
    );
  }
}
