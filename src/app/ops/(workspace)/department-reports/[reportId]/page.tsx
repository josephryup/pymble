import { CheckCircle2, RotateCcw, Send } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OpsConfirmSubmitButton } from "@/components/ops/OpsConfirmSubmitButton";
import { OpsPageHeader } from "@/components/ops/OpsPageHeader";
import { OpsRealtimeRefresh } from "@/components/ops/OpsRealtimeRefresh";
import { requireOpsUser } from "@/lib/ops/auth";
import {
  archiveDepartmentReportAction,
  reviewDepartmentReportAction,
  submitDepartmentReportAction,
  updateDepartmentReportAction,
} from "@/lib/ops/department-report-actions";
import {
  canReviewDepartmentReport,
  canSubmitDepartmentReport,
  canViewDepartmentReport,
  OPS_DEPARTMENT_LABELS,
} from "@/lib/ops/department-report-permissions";
import { fetchOpsDepartmentReportById } from "@/lib/ops/department-reports";
import {
  firstParam,
  OPS_DANGER_BUTTON_CLASS,
  OPS_INPUT_CLASS,
  OPS_LABEL_CLASS,
  OPS_PRIMARY_BUTTON_CLASS,
  OPS_SECONDARY_BUTTON_CLASS,
  type OpsSearchParams,
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

export default async function OpsDepartmentReportDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { reportId } = await params;
  const search = (await (searchParams ?? Promise.resolve({} as OpsSearchParams))) ?? {};
  const { profile } = await requireOpsUser();
  const report = await fetchOpsDepartmentReportById(reportId);
  if (!report) notFound();
  // Cross-department leakage guard.
  if (!canViewDepartmentReport(profile.role, report.department)) {
    notFound();
  }

  const errorMessage = firstParam(search.error);
  const updated = firstParam(search.updated);
  const isAcknowledged = report.status === "acknowledged";
  const canEdit =
    canSubmitDepartmentReport(profile.role) &&
    canViewDepartmentReport(profile.role, report.department) &&
    !isAcknowledged;
  const canSubmit =
    canSubmitDepartmentReport(profile.role) &&
    canViewDepartmentReport(profile.role, report.department) &&
    (report.status === "draft" || report.status === "revision_requested");
  const canReview =
    canReviewDepartmentReport(profile.role) &&
    (report.status === "submitted" || report.status === "under_review");
  const canArchive = canReviewDepartmentReport(profile.role);

  return (
    <div className="w-full max-w-4xl space-y-6">
      <OpsRealtimeRefresh tables={["department_reports"]} />
      <OpsPageHeader
        eyebrow={`${OPS_DEPARTMENT_LABELS[report.department]} · ${report.period}`}
        title={report.title}
        description={`Period ${report.period_start_date} → ${report.period_end_date}. Status: ${report.status.replace("_", " ")}.`}
        actions={
          <Link
            className={OPS_SECONDARY_BUTTON_CLASS}
            href="/ops/department-reports"
          >
            All reports
          </Link>
        }
      />

      {errorMessage ? (
        <div
          className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
          role="alert"
        >
          {errorMessage}
        </div>
      ) : null}
      {updated ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
          Report {updated.replace("_", " ")}.
        </div>
      ) : null}

      <section className="rounded-2xl border border-primary-dark/10 bg-white p-6 shadow-sm">
        <h2 className="font-heading text-lg font-bold text-primary-dark">Narrative</h2>
        <pre className="mt-2 whitespace-pre-wrap font-sans text-sm leading-6 text-primary-dark/80">
          {report.narrative || "(no narrative provided)"}
        </pre>
      </section>

      {Object.keys(report.metrics).length > 0 ? (
        <section className="rounded-2xl border border-primary-dark/10 bg-white p-6 shadow-sm">
          <h2 className="font-heading text-lg font-bold text-primary-dark">Metrics</h2>
          <pre className="mt-2 overflow-x-auto rounded-md bg-primary-dark/5 p-3 text-xs text-primary-dark/80">
            {metricsToText(report.metrics)}
          </pre>
        </section>
      ) : null}

      {report.reviewer ? (
        <section className="rounded-2xl border border-primary-dark/10 bg-white p-6 shadow-sm">
          <h2 className="font-heading text-lg font-bold text-primary-dark">
            Leadership review
          </h2>
          <p className="mt-2 text-sm text-primary-dark/70">
            {report.reviewer.full_name} marked the report{" "}
            <strong>{report.status.replace("_", " ")}</strong> on{" "}
            {report.reviewed_at?.slice(0, 10)}.
          </p>
          {report.review_notes ? (
            <pre className="mt-2 whitespace-pre-wrap font-sans text-sm leading-6 text-primary-dark/75">
              {report.review_notes}
            </pre>
          ) : null}
        </section>
      ) : null}

      {canSubmit ? (
        <form
          action={submitDepartmentReportAction}
          className="rounded-2xl border border-primary-dark/10 bg-white p-4 shadow-sm"
        >
          <input name="id" type="hidden" value={report.id} />
          <p className="text-sm text-primary-dark/70">
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
          className="rounded-2xl border border-primary-dark/10 bg-white p-4 shadow-sm"
        >
          <input name="id" type="hidden" value={report.id} />
          <h2 className="font-heading text-base font-bold text-primary-dark">
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
        <details className="rounded-2xl border border-primary-dark/10 bg-white">
          <summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-primary-dark">
            Edit this report
          </summary>
          <form
            action={updateDepartmentReportAction}
            className="space-y-4 border-t border-primary-dark/10 p-5"
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
            <label className={OPS_LABEL_CLASS}>
              Narrative
              <textarea
                className={`${OPS_INPUT_CLASS} min-h-40`}
                defaultValue={report.narrative}
                name="narrative"
                rows={10}
              />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Metrics JSON
              <textarea
                className={`${OPS_INPUT_CLASS} min-h-24 font-mono text-xs`}
                defaultValue={metricsToText(report.metrics)}
                name="metrics_json"
                rows={4}
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
                Save
              </button>
              {canArchive ? (
                <form action={archiveDepartmentReportAction} className="inline-block">
                  <input name="id" type="hidden" value={report.id} />
                  <OpsConfirmSubmitButton
                    className={OPS_DANGER_BUTTON_CLASS}
                    confirmText="Confirm archive"
                  >
                    Archive
                  </OpsConfirmSubmitButton>
                </form>
              ) : null}
            </div>
          </form>
        </details>
      ) : null}
    </div>
  );
}
