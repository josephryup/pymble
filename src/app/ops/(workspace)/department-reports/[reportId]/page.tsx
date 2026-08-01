import { CheckCircle2, FileDown, RotateCcw, Send } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OpsRecordActivityPanel } from "@/components/ops/OpsRecordActivityPanel";
import { OpsConfirmSubmitButton } from "@/components/ops/OpsConfirmSubmitButton";
import { OpsPageHeader } from "@/components/ops/OpsPageHeader";
import { OpsRealtimeRefresh } from "@/components/ops/OpsRealtimeRefresh";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import { requireOpsUser } from "@/lib/ops/auth";
import {
  archiveDepartmentReportAction,
  reviewDepartmentReportAction,
  submitDepartmentReportAction,
  updateDepartmentReportAction,
} from "@/lib/ops/department-report-actions";
import {
  canFileDepartmentReport,
  canReviewDepartmentReport,
  canReviewDepartmentReportRecord,
  canViewDepartmentReportRecord,
  OPS_DEPARTMENT_LABELS,
} from "@/lib/ops/department-report-permissions";
import {
  compareReportMetrics,
  OPS_DEPARTMENT_REPORT_TEMPLATES,
  reportSectionLabel,
  reportSectionsFor,
  templateMetricKeys,
} from "@/lib/ops/department-report-templates";
import {
  fetchOpsDepartmentReportById,
  fetchPreviousOpsDepartmentReport,
} from "@/lib/ops/department-reports";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import {
  firstParam,
  OPS_DANGER_BUTTON_CLASS,
  OPS_INPUT_CLASS,
  OPS_LABEL_CLASS,
  OPS_PRIMARY_BUTTON_CLASS,
  OPS_SECONDARY_BUTTON_CLASS,
  type OpsSearchParams,
  OPS_NOTICE_SUCCESS_CLASS,
  OPS_NOTICE_ERROR_CLASS,
} from "@/lib/ops/ui";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ reportId: string }>;
  searchParams?: Promise<OpsSearchParams>;
};

function metricsToText(metrics: Record<string, unknown>) {
  try {
    return JSON.stringify(metrics, null, 2);
  } catch {
    return "{}";
  }
}

function prettifyMetricKey(key: string) {
  return key.replace(/_/g, " ").replace(/^./, (first) => first.toUpperCase());
}

function formatMetricValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toLocaleString("en-ZM");
  }
  return String(value);
}

export default async function OpsDepartmentReportDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { reportId } = await params;
  const search = (await (searchParams ?? Promise.resolve({} as OpsSearchParams))) ?? {};
  const { profile } = await requireOpsUser();
  const report = await fetchOpsDepartmentReportById(reportId);
  if (!report) notFound();
  // Isolation guard: cross-department AND cross-tier (a contributor never
  // sees a colleague's individual report).
  if (!canViewDepartmentReportRecord(profile.role, profile.id, report)) {
    notFound();
  }

  const viewerIsAuthor =
    report.created_by === profile.id || report.submitted_by === profile.id;
  const viewerCanReviewRecord =
    canReviewDepartmentReportRecord(profile.role, report) &&
    (!viewerIsAuthor || profile.role === "developer");

  // Read receipt: the moment its reviewer opens a submitted report it becomes
  // "under review", so the author can see it has actually been picked up.
  // The status guard keeps the update idempotent across refreshes/races.
  if (viewerCanReviewRecord && report.status === "submitted") {
    const supabase = getOpsSupabaseServiceClient();
    const { error: reviewMarkError } = await supabase
      .from("department_reports")
      .update({ status: "under_review" })
      .eq("id", report.id)
      .eq("status", "submitted");
    if (!reviewMarkError) {
      report.status = "under_review";
      await recordOpsAuditEvent({
        action: "department_report.review_started",
        actorUserId: profile.id,
        entityId: report.id,
        entityType: "department_report",
        moduleKey: "department_reports",
        sourceId: report.id,
        sourceTable: "department_reports",
        summary: `${profile.full_name} opened ${report.title} for review`,
      }).catch(() => null);
    }
  }

  const previousReport = await fetchPreviousOpsDepartmentReport(report);
  const metricDeltas = previousReport
    ? compareReportMetrics(report.metrics, previousReport.metrics)
    : {};

  const errorMessage = firstParam(search.error);
  const updated = firstParam(search.updated);
  const isAcknowledged = report.status === "acknowledged";
  // Individual reports belong to their author; compiled reports to whoever
  // may file them for that department.
  const canWrite =
    canFileDepartmentReport(profile.role, report.department, report.scope) &&
    (report.scope === "compiled" || viewerIsAuthor || canReviewDepartmentReport(profile.role));
  const canEdit = canWrite && !isAcknowledged;
  const canSubmit =
    canWrite && (report.status === "draft" || report.status === "revision_requested");
  const canReview =
    viewerCanReviewRecord &&
    (report.status === "submitted" || report.status === "under_review");
  const canArchive = canReviewDepartmentReportRecord(profile.role, report) || viewerIsAuthor;
  const sectionEntries = reportSectionsFor(report.department, report.scope)
    .map((section) => ({
      key: section.key,
      label: section.label,
      value: report.sections[section.key] ?? "",
    }))
    .concat(
      Object.entries(report.sections)
        .filter(
          ([key]) =>
            !reportSectionsFor(report.department, report.scope).some(
              (section) => section.key === key,
            ),
        )
        .map(([key, value]) => ({ key, label: reportSectionLabel(key), value })),
    );
  const hasSections = sectionEntries.some((entry) => entry.value.trim() !== "");

  return (
    <div className="w-full max-w-4xl space-y-6">
      <OpsRealtimeRefresh tables={["department_reports"]} />
      <OpsPageHeader
        eyebrow={`${OPS_DEPARTMENT_LABELS[report.department]} · ${report.scope === "individual" ? "individual" : "department"} · ${report.period}`}
        title={report.title}
        description={`Period ${report.period_start_date} → ${report.period_end_date}. Status: ${report.status.replace("_", " ")}.${report.submitter ? ` Prepared by ${report.submitter.full_name}.` : ""}`}
        actions={
          <>
            <a
              className={OPS_SECONDARY_BUTTON_CLASS}
              href={`/api/ops/pdf/department-report/${report.id}`}
            >
              <FileDown className="size-4" aria-hidden="true" />
              Download PDF
            </a>
            <Link
              className={OPS_SECONDARY_BUTTON_CLASS}
              href="/ops/department-reports"
            >
              All reports
            </Link>
          </>
        }
      />

      {errorMessage ? (
        <div
          className={OPS_NOTICE_ERROR_CLASS}
          role="alert"
        >
          {errorMessage}
        </div>
      ) : null}
      {updated ? (
        <div className={OPS_NOTICE_SUCCESS_CLASS}>
          Report {updated.replace("_", " ")}.
        </div>
      ) : null}

      {hasSections ? (
        <section className="space-y-4 rounded-lg border border-border bg-card p-6 shadow-sm">
          {sectionEntries
            .filter((entry) => entry.value.trim() !== "")
            .map((entry) => (
              <div key={entry.key}>
                <h2 className="font-heading text-base font-bold text-foreground">
                  {entry.label}
                </h2>
                <pre className="mt-1 whitespace-pre-wrap font-sans text-sm leading-6 text-foreground/80">
                  {entry.value}
                </pre>
              </div>
            ))}
        </section>
      ) : (
        <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <h2 className="font-heading text-lg font-bold text-foreground">Narrative</h2>
          <pre className="mt-2 whitespace-pre-wrap font-sans text-sm leading-6 text-foreground/80">
            {report.narrative || "(no narrative provided)"}
          </pre>
        </section>
      )}

      {Object.keys(report.metrics).length > 0 ? (
        <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-heading text-lg font-bold text-foreground">Key figures</h2>
            {previousReport ? (
              <p className="text-xs text-muted-foreground">
                Compared with{" "}
                <Link
                  className="font-semibold text-primary-blue hover:underline"
                  href={`/ops/department-reports/${previousReport.id}`}
                >
                  {previousReport.title}
                </Link>
              </p>
            ) : null}
          </div>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(report.metrics).map(([key, value]) => {
              const templateField = OPS_DEPARTMENT_REPORT_TEMPLATES[report.department].metrics.find(
                (metric) => metric.key === key,
              );
              const change = metricDeltas[key];
              // "Up" is only good when the metric says so — more incidents
              // rising green would send exactly the wrong message.
              const improving =
                change &&
                change.delta !== 0 &&
                (templateField?.downIsGood ? change.delta < 0 : change.delta > 0);
              return (
                <div
                  className="rounded-xl border border-border bg-muted/40 p-3"
                  key={key}
                >
                  <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    {templateField?.label ?? prettifyMetricKey(key)}
                  </dt>
                  <dd className="mt-1 font-heading text-xl font-bold text-foreground">
                    {formatMetricValue(value)}
                  </dd>
                  {change ? (
                    <p
                      className={`mt-1 text-xs font-semibold ${
                        change.delta === 0
                          ? "text-muted-foreground"
                          : improving
                            ? "text-emerald-700"
                            : "text-red-700"
                      }`}
                    >
                      {change.delta > 0 ? "▲" : change.delta < 0 ? "▼" : "•"}{" "}
                      {change.delta > 0 ? "+" : ""}
                      {change.delta.toLocaleString("en-ZM")} vs previous
                      {change.percent !== null ? ` (${change.percent > 0 ? "+" : ""}${change.percent}%)` : ""}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </dl>
        </section>
      ) : null}

      {report.reviewer ? (
        <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <h2 className="font-heading text-lg font-bold text-foreground">
            Leadership review
          </h2>
          <p className="mt-2 text-sm text-foreground/70">
            {report.reviewer.full_name} marked the report{" "}
            <strong>{report.status.replace("_", " ")}</strong> on{" "}
            {report.reviewed_at?.slice(0, 10)}.
          </p>
          {report.review_notes ? (
            <pre className="mt-2 whitespace-pre-wrap font-sans text-sm leading-6 text-foreground/75">
              {report.review_notes}
            </pre>
          ) : null}
        </section>
      ) : null}

      {canSubmit ? (
        <form
          action={submitDepartmentReportAction}
          className="rounded-lg border border-border bg-card p-4 shadow-sm"
        >
          <input name="id" type="hidden" value={report.id} />
          <p className="text-sm text-foreground/70">
            Submit this report so the Managing Director and General Manager can review it.
          </p>
          <button className={`${OPS_PRIMARY_BUTTON_CLASS} mt-3`} type="submit">
            <Send className="size-4" aria-hidden="true" />
            Submit for review
          </button>
        </form>
      ) : null}

      {canReview ? (
        <form
          action={reviewDepartmentReportAction}
          className="rounded-lg border border-border bg-card p-4 shadow-sm"
        >
          <input name="id" type="hidden" value={report.id} />
          <h2 className="font-heading text-base font-bold text-foreground">
            Leadership decision
          </h2>
          <label className={`${OPS_LABEL_CLASS} mt-3 block`}>
            Review notes (optional)
            <textarea
              className={`${OPS_INPUT_CLASS} min-h-24`}
              maxLength={5000}
              name="review_notes"
              rows={4}
            />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className={OPS_PRIMARY_BUTTON_CLASS}
              name="decision"
              type="submit"
              value="acknowledged"
            >
              <CheckCircle2 className="size-4" aria-hidden="true" />
              Acknowledge
            </button>
            <button
              className={OPS_SECONDARY_BUTTON_CLASS}
              name="decision"
              type="submit"
              value="revision_requested"
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              Request revisions
            </button>
          </div>
        </form>
      ) : null}

      {canEdit ? (
        <details className="rounded-lg border border-border bg-card">
          <summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-foreground">
            Edit this report
          </summary>
          <form
            action={updateDepartmentReportAction}
            className="space-y-4 border-t border-border p-5"
          >
            <input name="id" type="hidden" value={report.id} />
            <input name="department" type="hidden" value={report.department} />
            <div className="grid gap-4 md:grid-cols-2">
              <label className={OPS_LABEL_CLASS}>
                Period
                <select
                  className={OPS_INPUT_CLASS}
                  defaultValue={report.period}
                  name="period"
                >
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="ad_hoc">Ad hoc</option>
                </select>
              </label>
              <div />
              <label className={OPS_LABEL_CLASS}>
                Period start
                <input
                  className={OPS_INPUT_CLASS}
                  defaultValue={report.period_start_date}
                  name="period_start_date"
                  required
                  type="date"
                />
              </label>
              <label className={OPS_LABEL_CLASS}>
                Period end
                <input
                  className={OPS_INPUT_CLASS}
                  defaultValue={report.period_end_date}
                  name="period_end_date"
                  required
                  type="date"
                />
              </label>
            </div>
            <label className={OPS_LABEL_CLASS}>
              Title
              <input
                className={OPS_INPUT_CLASS}
                defaultValue={report.title}
                name="title"
                required
              />
            </label>
            {report.narrative && !hasSections ? (
              <label className={OPS_LABEL_CLASS}>
                Narrative (legacy)
                <textarea
                  className={`${OPS_INPUT_CLASS} min-h-40`}
                  defaultValue={report.narrative}
                  name="narrative"
                  rows={10}
                />
              </label>
            ) : null}
            <fieldset className="space-y-4">
              <legend className="text-sm font-bold text-foreground">Report sections</legend>
              {reportSectionsFor(report.department, report.scope).map((section) => (
                <label className={OPS_LABEL_CLASS} key={section.key}>
                  {section.label}
                  <textarea
                    className={`${OPS_INPUT_CLASS} min-h-24`}
                    defaultValue={report.sections[section.key] ?? ""}
                    maxLength={8000}
                    name={`section_${section.key}`}
                    placeholder={section.placeholder}
                    rows={4}
                  />
                </label>
              ))}
            </fieldset>
            {report.scope === "compiled" ? (
              <>
                <fieldset>
                  <legend className="text-sm font-bold text-foreground">Key figures</legend>
                  <div className="mt-3 grid gap-4 md:grid-cols-2">
                    {OPS_DEPARTMENT_REPORT_TEMPLATES[report.department].metrics.map((metric) => {
                      const current = report.metrics[metric.key];
                      return (
                        <label className={OPS_LABEL_CLASS} key={metric.key}>
                          {metric.label}
                          <input
                            className={OPS_INPUT_CLASS}
                            defaultValue={
                              typeof current === "number" || typeof current === "string"
                                ? current
                                : ""
                            }
                            inputMode="decimal"
                            name={`metric_${metric.key}`}
                            step="any"
                            type="number"
                          />
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
                <label className={OPS_LABEL_CLASS}>
                  Extra metrics (advanced, JSON)
                  <textarea
                    className={`${OPS_INPUT_CLASS} min-h-24 font-mono text-xs`}
                    defaultValue={metricsToText(
                      Object.fromEntries(
                        Object.entries(report.metrics).filter(
                          ([key]) => !templateMetricKeys(report.department).has(key),
                        ),
                      ),
                    )}
                    name="metrics_json"
                    rows={4}
                  />
                </label>
              </>
            ) : null}
            <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
              Save
            </button>
          </form>
        </details>
      ) : null}

      {/* Separate top-level form: nesting it inside the edit form is invalid
          HTML — the browser drops the inner <form> and Archive would submit
          the edit action instead. */}
      {canEdit && canArchive ? (
        <form
          action={archiveDepartmentReportAction}
          className="rounded-lg border border-border bg-card p-4 shadow-sm"
        >
          <input name="id" type="hidden" value={report.id} />
          <p className="text-sm text-foreground/70">
            Archiving removes this report from the active list. It stays available to leadership
            in the archive.
          </p>
          <OpsConfirmSubmitButton
            className={`${OPS_DANGER_BUTTON_CLASS} mt-3`}
            confirmText="Confirm archive"
          >
            Archive
          </OpsConfirmSubmitButton>
        </form>
      ) : null}

      {/* Supporting evidence: the narrative says what happened, the
          attachments prove it — site photos, a signed minute, a supplier
          quote, a spreadsheet the figures came from. Reuses the shared record
          activity panel so reports get the same upload, versioning, download
          gating and comment thread as every other record, rather than a
          second bespoke attachment mechanism. */}
      <OpsRecordActivityPanel
        canManage={canWrite || viewerCanReviewRecord}
        sourceId={report.id}
        sourceTable="department_reports"
      />
    </div>
  );
}
