import {
  AlertOctagon,
  Archive,
  CheckCircle2,
  ClipboardList,
  Pencil,
  Plus,
  Send,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { notFound } from "next/navigation";
import { requireOpsUser } from "@/lib/ops/auth";
import {
  archiveHseWeeklyReportAction,
  createHseWeeklyReportAction,
  reviewHseWeeklyReportAction,
  submitHseWeeklyReportAction,
  updateHseWeeklyReportAction,
} from "@/lib/ops/hse-weekly-report-actions";
import {
  canArchiveHseWeeklyReport,
  canCreateHseWeeklyReport,
  canEditHseWeeklyReport,
  canReviewHseWeeklyReport,
  canSubmitHseWeeklyReport,
} from "@/lib/ops/hse-weekly-report-permissions";
import {
  fetchOpsHseWeeklyReports,
  type OpsHseWeeklyReportSummary,
} from "@/lib/ops/hse-weekly-reports";
import { OpsPageHeader } from "@/components/ops/OpsPageHeader";
import { OpsRealtimeRefresh } from "@/components/ops/OpsRealtimeRefresh";
import { canAccessOpsHref } from "@/lib/ops/permissions";
import { fetchActiveSiteOptions } from "@/lib/ops/sites";
import {
  firstParam,
  OPS_FOCUS_CLASS,
  OPS_INPUT_CLASS,
  OPS_LABEL_CLASS,
  OPS_PRIMARY_BUTTON_CLASS,
  OPS_SECONDARY_BUTTON_CLASS,
  type OpsSearchParams,
} from "@/lib/ops/ui";

type PageProps = {
  searchParams?: Promise<OpsSearchParams>;
};

function statusClass(status: OpsHseWeeklyReportSummary["status"]) {
  if (status === "reviewed") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "submitted") return "border-sky-200 bg-sky-50 text-sky-700";
  return "border-orange-200 bg-orange-50 text-orange-700";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-ZM", {
    dateStyle: "medium",
    timeZone: "Africa/Lusaka",
  }).format(new Date(`${value}T00:00:00+02:00`));
}

function weeklyNotice(params: OpsSearchParams) {
  const error = firstParam(params.error);
  if (error) return { tone: "error" as const, message: error };
  const created = firstParam(params.created);
  if (created === "report") {
    return { tone: "success" as const, message: "Weekly HSE report created." };
  }
  const updated = firstParam(params.updated);
  if (updated === "report")
    return { tone: "success" as const, message: "Weekly HSE report updated." };
  if (updated === "submitted")
    return { tone: "success" as const, message: "Report submitted. Leadership has been notified." };
  if (updated === "reviewed")
    return { tone: "success" as const, message: "Report marked as reviewed." };
  if (updated === "archived")
    return { tone: "success" as const, message: "Report archived." };
  if (updated === "deleted")
    return { tone: "success" as const, message: "Report permanently deleted." };
  return null;
}

export default async function OpsHseWeeklyPage({ searchParams }: PageProps) {
  const [params, auth] = await Promise.all([
    searchParams ?? Promise.resolve({} as OpsSearchParams),
    requireOpsUser(),
  ]);

  if (!canAccessOpsHref(auth.profile.role, "/ops/hse-weekly")) {
    notFound();
  }

  const canCreate = canCreateHseWeeklyReport(auth.profile.role);
  const [reports, siteOptions] = await Promise.all([
    fetchOpsHseWeeklyReports(),
    fetchActiveSiteOptions(),
  ]);
  const notice = weeklyNotice(params);

  return (
    <div className="w-full max-w-none space-y-6">
      <OpsRealtimeRefresh tables={["hse_weekly_reports"]} />
      <OpsPageHeader
        eyebrow="Health, Safety & Environment"
        title="Weekly HSE Report"
        description="Roll up the week's safety picture: incidents, near-misses, Personal Protective Equipment compliance, toolbox talks, inspections, and actions for next week. Submitting notifies Operations Manager, Projects Manager, General Manager, and Managing Director."
      />

      {notice ? (
        <div
          className={`rounded-md border px-4 py-3 text-sm font-semibold ${
            notice.tone === "error"
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
          role={notice.tone === "error" ? "alert" : "status"}
        >
          {notice.message}
        </div>
      ) : null}

      {canCreate ? (
        <details className="rounded-lg border border-primary-dark/10 bg-white" id="create-weekly">
          <summary
            className={`flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 transition hover:text-primary-blue [&::-webkit-details-marker]:hidden ${OPS_FOCUS_CLASS}`}
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-blue text-white">
              <Plus className="size-5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-heading text-xl font-bold text-primary-dark">
                Create weekly HSE report
              </span>
              <span className="mt-1 block text-sm text-primary-dark/60">
                One report per site per week. Drafts can be edited before submission.
              </span>
            </span>
            <span className="shrink-0 text-xs font-bold uppercase tracking-[0.12em] text-primary-dark/45">
              Open
            </span>
          </summary>
          <form
            action={createHseWeeklyReportAction}
            className="grid gap-4 border-t border-primary-dark/10 p-5 sm:grid-cols-2 lg:grid-cols-6"
          >
            <label className={`${OPS_LABEL_CLASS} sm:col-span-2 lg:col-span-2`}>
              Site
              <select className={OPS_INPUT_CLASS} defaultValue="" name="site_id" required>
                <option value="" disabled>
                  Select site
                </option>
                {siteOptions.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.code} - {site.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
              Week start
              <input className={OPS_INPUT_CLASS} name="week_start" required type="date" />
            </label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
              Week end
              <input className={OPS_INPUT_CLASS} name="week_end" required type="date" />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Incidents
              <input className={OPS_INPUT_CLASS} defaultValue="0" min="0" name="incidents_count" type="number" />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Near-misses
              <input className={OPS_INPUT_CLASS} defaultValue="0" min="0" name="near_misses_count" type="number" />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Personal Protective Equipment compliance %
              <input className={OPS_INPUT_CLASS} max="100" min="0" name="ppe_compliance_pct" step="0.1" type="number" />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Toolbox talks
              <input className={OPS_INPUT_CLASS} defaultValue="0" min="0" name="toolbox_talks_held" type="number" />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Inspections
              <input className={OPS_INPUT_CLASS} defaultValue="0" min="0" name="inspections_completed" type="number" />
            </label>
            <label className={`${OPS_LABEL_CLASS} sm:col-span-2 lg:col-span-6`}>
              Concerns / risks for this week
              <textarea className={`${OPS_INPUT_CLASS} min-h-24`} name="concerns" />
            </label>
            <label className={`${OPS_LABEL_CLASS} sm:col-span-2 lg:col-span-6`}>
              Actions planned for next week
              <textarea className={`${OPS_INPUT_CLASS} min-h-24`} name="actions_planned_next_week" />
            </label>
            <div className="flex items-end sm:col-span-2 lg:col-span-6">
              <button className={`${OPS_PRIMARY_BUTTON_CLASS} w-full lg:w-auto`} type="submit">
                <Plus className="size-4" aria-hidden="true" />
                Save as draft
              </button>
            </div>
          </form>
        </details>
      ) : null}

      <section className="space-y-4">
        <h2 className="font-heading text-xl font-bold text-primary-dark">
          Weekly reports
        </h2>
        {reports.length > 0 ? (
          <div className="grid gap-4">
            {reports.map((report) => {
              const canEdit = canEditHseWeeklyReport(auth.profile.id, auth.profile.role, report);
              const canSubmit = canSubmitHseWeeklyReport(auth.profile.id, auth.profile.role, report);
              const canReview = canReviewHseWeeklyReport(auth.profile.role, report);
              const canArchive = canArchiveHseWeeklyReport(auth.profile.role);
              return (
                <article
                  className="rounded-lg border border-primary-dark/10 bg-white p-5"
                  id={`wr-${report.id}`}
                  key={report.id}
                >
                  <header className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-heading text-lg font-bold text-primary-dark">
                          {report.report_number}
                        </h3>
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${statusClass(
                            report.status,
                          )}`}
                        >
                          {report.status}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-primary-dark/60">
                        {report.site ? `${report.site.code} - ${report.site.name}` : "Site unavailable"}
                        {" · "}
                        Week {formatDate(report.week_start)} to {formatDate(report.week_end)}
                      </p>
                      <p className="mt-1 text-xs text-primary-dark/50">
                        Prepared by {report.preparer?.full_name ?? "Unknown"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {canSubmit ? (
                        <form action={submitHseWeeklyReportAction}>
                          <input name="report_id" type="hidden" value={report.id} />
                          <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
                            <Send className="size-4" aria-hidden="true" />
                            Submit to leadership
                          </button>
                        </form>
                      ) : null}
                      {canReview ? (
                        <form action={reviewHseWeeklyReportAction}>
                          <input name="report_id" type="hidden" value={report.id} />
                          <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
                            <CheckCircle2 className="size-4" aria-hidden="true" />
                            Mark reviewed
                          </button>
                        </form>
                      ) : null}
                      {canArchive && (report.status === "reviewed" || report.status === "submitted") ? (
                        <form action={archiveHseWeeklyReportAction}>
                          <input name="report_id" type="hidden" value={report.id} />
                          <button
                            className="inline-flex items-center gap-2 rounded-md border border-primary-dark/15 bg-white px-3 py-1.5 text-sm font-semibold text-primary-dark/70 hover:bg-primary-dark/5"
                            type="submit"
                          >
                            <Archive className="size-4" aria-hidden="true" />
                            Archive
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </header>

                  <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    <Metric label="Incidents" value={report.incidents_count} icon={AlertOctagon} />
                    <Metric label="Near-misses" value={report.near_misses_count} icon={AlertOctagon} />
                    <Metric
                      label="Personal Protective Equipment compliance"
                      value={
                        report.ppe_compliance_pct !== null
                          ? `${report.ppe_compliance_pct}%`
                          : "—"
                      }
                      icon={ShieldCheck}
                    />
                    <Metric label="Toolbox talks" value={report.toolbox_talks_held} icon={ClipboardList} />
                    <Metric label="Inspections" value={report.inspections_completed} icon={TrendingUp} />
                  </dl>

                  {report.concerns ? (
                    <p className="mt-4 whitespace-pre-line rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-sm leading-6 text-orange-800">
                      <span className="block text-[10px] font-bold uppercase tracking-[0.1em] text-orange-700">
                        Concerns
                      </span>
                      {report.concerns}
                    </p>
                  ) : null}
                  {report.actions_planned_next_week ? (
                    <p className="mt-3 whitespace-pre-line rounded-md border border-primary-blue/15 bg-primary-blue/[0.04] px-3 py-2 text-sm leading-6 text-primary-dark/80">
                      <span className="block text-[10px] font-bold uppercase tracking-[0.1em] text-primary-blue">
                        Actions planned next week
                      </span>
                      {report.actions_planned_next_week}
                    </p>
                  ) : null}

                  {canEdit ? (
                    <details className="mt-3 rounded-md border border-primary-dark/10">
                      <summary
                        className={`flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 text-sm font-bold text-primary-dark transition hover:text-primary-blue [&::-webkit-details-marker]:hidden ${OPS_FOCUS_CLASS}`}
                      >
                        <span className="inline-flex items-center gap-2">
                          <Pencil className="size-4" aria-hidden="true" />
                          Edit report
                        </span>
                        <span className="text-xs uppercase tracking-[0.12em] text-primary-dark/45">
                          Open
                        </span>
                      </summary>
                      <form
                        action={updateHseWeeklyReportAction}
                        className="grid gap-3 border-t border-primary-dark/10 p-4 sm:grid-cols-2 lg:grid-cols-6"
                      >
                        <input name="report_id" type="hidden" value={report.id} />
                        <input name="site_id" type="hidden" value={report.site_id} />
                        <label className={`${OPS_LABEL_CLASS} lg:col-span-3`}>
                          Week start
                          <input className={OPS_INPUT_CLASS} defaultValue={report.week_start} name="week_start" required type="date" />
                        </label>
                        <label className={`${OPS_LABEL_CLASS} lg:col-span-3`}>
                          Week end
                          <input className={OPS_INPUT_CLASS} defaultValue={report.week_end} name="week_end" required type="date" />
                        </label>
                        <label className={OPS_LABEL_CLASS}>
                          Incidents
                          <input className={OPS_INPUT_CLASS} defaultValue={report.incidents_count} min="0" name="incidents_count" type="number" />
                        </label>
                        <label className={OPS_LABEL_CLASS}>
                          Near-misses
                          <input className={OPS_INPUT_CLASS} defaultValue={report.near_misses_count} min="0" name="near_misses_count" type="number" />
                        </label>
                        <label className={OPS_LABEL_CLASS}>
                          PPE %
                          <input className={OPS_INPUT_CLASS} defaultValue={report.ppe_compliance_pct ?? ""} max="100" min="0" name="ppe_compliance_pct" step="0.1" type="number" />
                        </label>
                        <label className={OPS_LABEL_CLASS}>
                          Toolbox talks
                          <input className={OPS_INPUT_CLASS} defaultValue={report.toolbox_talks_held} min="0" name="toolbox_talks_held" type="number" />
                        </label>
                        <label className={OPS_LABEL_CLASS}>
                          Inspections
                          <input className={OPS_INPUT_CLASS} defaultValue={report.inspections_completed} min="0" name="inspections_completed" type="number" />
                        </label>
                        <label className={`${OPS_LABEL_CLASS} sm:col-span-2 lg:col-span-6`}>
                          Concerns
                          <textarea className={`${OPS_INPUT_CLASS} min-h-24`} defaultValue={report.concerns} name="concerns" />
                        </label>
                        <label className={`${OPS_LABEL_CLASS} sm:col-span-2 lg:col-span-6`}>
                          Actions planned next week
                          <textarea className={`${OPS_INPUT_CLASS} min-h-24`} defaultValue={report.actions_planned_next_week} name="actions_planned_next_week" />
                        </label>
                        <div className="flex items-end sm:col-span-2 lg:col-span-6">
                          <button className={OPS_SECONDARY_BUTTON_CLASS} type="submit">
                            <Pencil className="size-4" aria-hidden="true" />
                            Save changes
                          </button>
                        </div>
                      </form>
                    </details>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-lg border border-primary-dark/10 bg-white p-8 text-center">
            <ShieldCheck className="size-8 text-primary-blue" aria-hidden="true" />
            <p className="text-sm text-primary-dark/60">
              No weekly Health, Safety &amp; Environment reports yet. Create one above to start
              the weekly safety rollup.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof AlertOctagon;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-md border border-primary-dark/10 p-3">
      <p className="flex items-center justify-between text-xs font-bold uppercase tracking-[0.1em] text-primary-dark/45">
        {label}
        <Icon className="size-3.5 text-primary-blue" aria-hidden="true" />
      </p>
      <p className="mt-1 font-heading text-xl font-bold text-primary-dark">{value}</p>
    </div>
  );
}
