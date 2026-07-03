import { Inbox, RefreshCw, Sparkles } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OpsPageHeader } from "@/components/ops/OpsPageHeader";
import { requireOpsUser } from "@/lib/ops/auth";
import { createDepartmentReportAction } from "@/lib/ops/department-report-actions";
import { fetchOpsDepartmentMetricPrefill } from "@/lib/ops/department-report-metrics";
import {
  OPS_DEPARTMENT_LABELS,
  reportFilingOptions,
  reviewerRolesForReport,
  type OpsDepartmentKey,
  type OpsDepartmentReportScope,
} from "@/lib/ops/department-report-permissions";
import {
  defaultReportPeriodRange,
  OPS_DEPARTMENT_REPORT_TEMPLATES,
  reportSectionsFor,
  suggestedReportTitle,
} from "@/lib/ops/department-report-templates";
import {
  fetchSubmittedIndividualReports,
  type OpsDepartmentReportPeriod,
} from "@/lib/ops/department-reports";
import { formatOpsRole } from "@/lib/ops/roles";
import {
  firstParam,
  OPS_INPUT_CLASS,
  OPS_LABEL_CLASS,
  OPS_PRIMARY_BUTTON_CLASS,
  OPS_SECONDARY_BUTTON_CLASS,
  type OpsSearchParams,
} from "@/lib/ops/ui";

export const dynamic = "force-dynamic";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const PERIODS: OpsDepartmentReportPeriod[] = ["weekly", "monthly", "quarterly", "ad_hoc"];

type PageProps = { searchParams?: Promise<OpsSearchParams> };

function filingLabel(department: OpsDepartmentKey, scope: OpsDepartmentReportScope) {
  return scope === "individual"
    ? `${OPS_DEPARTMENT_LABELS[department]} — my report to my manager`
    : `${OPS_DEPARTMENT_LABELS[department]} — department report`;
}

export default async function OpsNewDepartmentReportPage({ searchParams }: PageProps) {
  const [params, { profile }] = await Promise.all([
    searchParams ?? Promise.resolve({} as OpsSearchParams),
    requireOpsUser(),
  ]);
  const filingOptions = reportFilingOptions(profile.role);
  if (filingOptions.length === 0) notFound();

  // Filing choice comes from the GET form; anything invalid falls back to the
  // role's first option, weekly cadence, last completed week.
  const requestedFiling = firstParam(params.filing);
  const filing =
    filingOptions.find(
      (option) => `${option.department}:${option.scope}` === requestedFiling,
    ) ??
    (firstParam(params.department)
      ? filingOptions.find((option) => option.department === firstParam(params.department))
      : undefined) ??
    filingOptions[0];
  const { department, scope } = filing;

  const requestedPeriod = firstParam(params.period) as OpsDepartmentReportPeriod | undefined;
  const period = requestedPeriod && PERIODS.includes(requestedPeriod)
    ? requestedPeriod
    : "weekly";
  const defaults = defaultReportPeriodRange(period);
  const requestedStart = firstParam(params.period_start_date);
  const requestedEnd = firstParam(params.period_end_date);
  const periodStart = requestedStart && DATE_PATTERN.test(requestedStart)
    ? requestedStart
    : defaults.start;
  const periodEnd = requestedEnd && DATE_PATTERN.test(requestedEnd) && requestedEnd >= periodStart
    ? requestedEnd
    : defaults.end;

  const deptLabel = OPS_DEPARTMENT_LABELS[department];
  const sections = reportSectionsFor(department, scope);
  const template = OPS_DEPARTMENT_REPORT_TEMPLATES[department];
  // Department-wide figures make sense on the compiled report; a contributor's
  // report is their own account, so no system prefill there.
  const prefill =
    scope === "compiled"
      ? await fetchOpsDepartmentMetricPrefill(department, periodStart, periodEnd)
      : {};
  const receivedReports =
    scope === "compiled"
      ? await fetchSubmittedIndividualReports(department, periodStart, periodEnd)
      : [];
  const reviewerRoles = reviewerRolesForReport({ department, scope });
  const titleSuggestion = suggestedReportTitle(
    scope === "individual" ? `${profile.full_name} — ${deptLabel}` : deptLabel,
    period,
    { start: periodStart, end: periodEnd },
  );

  return (
    <div className="w-full max-w-3xl space-y-6">
      <OpsPageHeader
        eyebrow="Department reporting"
        title="Draft a new report"
        description={
          scope === "individual"
            ? `Your report routes to: ${reviewerRoles.map(formatOpsRole).join(", ") || "leadership"}.`
            : `This department report routes to: ${reviewerRoles.map(formatOpsRole).join(", ") || "leadership"}.`
        }
        actions={
          <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/department-reports">
            All reports
          </Link>
        }
      />

      <form
        className="rounded-2xl border border-primary-dark/10 bg-white p-5 shadow-sm"
        method="get"
      >
        <h2 className="font-heading text-sm font-bold uppercase tracking-[0.14em] text-primary-dark/55">
          Report setup
        </h2>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <label className={OPS_LABEL_CLASS}>
            Reporting as
            <select
              className={OPS_INPUT_CLASS}
              defaultValue={`${department}:${scope}`}
              name="filing"
            >
              {filingOptions.map((option) => (
                <option
                  key={`${option.department}:${option.scope}`}
                  value={`${option.department}:${option.scope}`}
                >
                  {filingLabel(option.department, option.scope)}
                </option>
              ))}
            </select>
          </label>
          <label className={OPS_LABEL_CLASS}>
            Period
            <select className={OPS_INPUT_CLASS} defaultValue={period} name="period">
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="ad_hoc">Ad hoc</option>
            </select>
          </label>
          <label className={OPS_LABEL_CLASS}>
            Period start
            <input
              className={OPS_INPUT_CLASS}
              defaultValue={periodStart}
              name="period_start_date"
              required
              type="date"
            />
          </label>
          <label className={OPS_LABEL_CLASS}>
            Period end
            <input
              className={OPS_INPUT_CLASS}
              defaultValue={periodEnd}
              name="period_end_date"
              required
              type="date"
            />
          </label>
        </div>
        <button className={`${OPS_SECONDARY_BUTTON_CLASS} mt-4`} type="submit">
          <RefreshCw className="size-4" aria-hidden="true" />
          Reload template & suggestions
        </button>
      </form>

      {scope === "compiled" ? (
        <section className="rounded-2xl border border-primary-dark/10 bg-white p-5 shadow-sm">
          <h2 className="flex items-center gap-2 font-heading text-sm font-bold uppercase tracking-[0.14em] text-primary-dark/55">
            <Inbox className="size-4" aria-hidden="true" />
            Team reports received for this window ({receivedReports.length})
          </h2>
          {receivedReports.length === 0 ? (
            <p className="mt-2 text-sm text-primary-dark/60">
              No individual reports submitted for this period yet. You can still compile —
              chase the team or note the gap in your executive summary.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {receivedReports.map((received) => (
                <li key={received.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary-dark/10 bg-primary-dark/[0.02] px-3 py-2">
                  <div className="min-w-0">
                    <Link
                      className="text-sm font-semibold text-primary-blue hover:underline"
                      href={`/ops/department-reports/${received.id}`}
                    >
                      {received.title}
                    </Link>
                    <p className="text-xs text-primary-dark/55">
                      {received.submitter?.full_name ?? "Unknown"} · {received.status.replace("_", " ")}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <form
        action={createDepartmentReportAction}
        className="space-y-4 rounded-2xl border border-primary-dark/10 bg-white p-6 shadow-sm"
      >
        <input name="department" type="hidden" value={department} />
        <input name="scope" type="hidden" value={scope} />
        <input name="period" type="hidden" value={period} />
        <input name="period_start_date" type="hidden" value={periodStart} />
        <input name="period_end_date" type="hidden" value={periodEnd} />

        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-dark/45">
          {deptLabel} · {scope === "individual" ? "individual" : "department"} ·{" "}
          {period.replace("_", " ")} · {periodStart} → {periodEnd}
        </p>

        <label className={OPS_LABEL_CLASS}>
          Title
          <input
            className={OPS_INPUT_CLASS}
            defaultValue={titleSuggestion}
            maxLength={200}
            name="title"
            required
          />
        </label>

        {scope === "compiled" ? (
          <fieldset>
            <legend className="flex items-center gap-2 text-sm font-bold text-primary-dark">
              <Sparkles className="size-4 text-primary-blue" aria-hidden="true" />
              Key figures
              <span className="text-xs font-medium text-primary-dark/50">
                (suggested from system records — check and adjust before submitting)
              </span>
            </legend>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              {template.metrics.map((metric) => {
                const suggested = prefill[metric.key];
                return (
                  <label className={OPS_LABEL_CLASS} key={metric.key}>
                    {metric.label}
                    <input
                      className={OPS_INPUT_CLASS}
                      defaultValue={suggested ?? ""}
                      inputMode="decimal"
                      name={`metric_${metric.key}`}
                      step="any"
                      type="number"
                    />
                    <span className="mt-1 block text-xs font-normal normal-case text-primary-dark/50">
                      {suggested !== undefined
                        ? "Suggested from system records for this period."
                        : (metric.hint ?? "Fill in manually.")}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ) : null}

        <fieldset className="space-y-4">
          <legend className="text-sm font-bold text-primary-dark">Report sections</legend>
          {sections.map((section) => (
            <label className={OPS_LABEL_CLASS} key={section.key}>
              {section.label}
              <textarea
                className={`${OPS_INPUT_CLASS} min-h-24`}
                maxLength={8000}
                name={`section_${section.key}`}
                placeholder={section.placeholder}
                rows={4}
              />
            </label>
          ))}
        </fieldset>

        {scope === "compiled" ? (
          <details className="rounded-lg border border-primary-dark/10 bg-primary-dark/[0.02] px-4 py-3">
            <summary className="cursor-pointer text-sm font-semibold text-primary-dark/70">
              Extra metrics (advanced, JSON)
            </summary>
            <textarea
              className={`${OPS_INPUT_CLASS} mt-3 min-h-20 font-mono text-xs`}
              name="metrics_json"
              placeholder='{"custom_measure": 12}'
              rows={3}
            />
          </details>
        ) : null}

        <div className="flex items-center gap-3">
          <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
            Save draft
          </button>
          <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/department-reports">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
