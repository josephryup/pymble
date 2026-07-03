import { RefreshCw, Sparkles } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OpsPageHeader } from "@/components/ops/OpsPageHeader";
import { requireOpsUser } from "@/lib/ops/auth";
import { createDepartmentReportAction } from "@/lib/ops/department-report-actions";
import { fetchOpsDepartmentMetricPrefill } from "@/lib/ops/department-report-metrics";
import {
  canSubmitDepartmentReport,
  listAccessibleDepartments,
  OPS_DEPARTMENT_LABELS,
  type OpsDepartmentKey,
} from "@/lib/ops/department-report-permissions";
import {
  defaultReportPeriodRange,
  OPS_DEPARTMENT_REPORT_TEMPLATES,
  suggestedReportTitle,
} from "@/lib/ops/department-report-templates";
import type { OpsDepartmentReportPeriod } from "@/lib/ops/department-reports";
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

export default async function OpsNewDepartmentReportPage({ searchParams }: PageProps) {
  const [params, { profile }] = await Promise.all([
    searchParams ?? Promise.resolve({} as OpsSearchParams),
    requireOpsUser(),
  ]);
  if (!canSubmitDepartmentReport(profile.role)) {
    notFound();
  }
  const departments = listAccessibleDepartments(profile.role);
  if (departments.length === 0) notFound();

  // Report setup comes from the GET form; anything invalid falls back to a
  // sensible default (own department, last completed month).
  const requestedDept = firstParam(params.department) as OpsDepartmentKey | undefined;
  const department = requestedDept && departments.includes(requestedDept)
    ? requestedDept
    : departments[0];
  const requestedPeriod = firstParam(params.period) as OpsDepartmentReportPeriod | undefined;
  const period = requestedPeriod && PERIODS.includes(requestedPeriod)
    ? requestedPeriod
    : "monthly";
  const defaults = defaultReportPeriodRange(period);
  const requestedStart = firstParam(params.period_start_date);
  const requestedEnd = firstParam(params.period_end_date);
  const periodStart = requestedStart && DATE_PATTERN.test(requestedStart)
    ? requestedStart
    : defaults.start;
  const periodEnd = requestedEnd && DATE_PATTERN.test(requestedEnd) && requestedEnd >= periodStart
    ? requestedEnd
    : defaults.end;

  const template = OPS_DEPARTMENT_REPORT_TEMPLATES[department];
  const prefill = await fetchOpsDepartmentMetricPrefill(department, periodStart, periodEnd);
  const deptLabel = OPS_DEPARTMENT_LABELS[department];
  const titleSuggestion = suggestedReportTitle(deptLabel, period, {
    start: periodStart,
    end: periodEnd,
  });

  return (
    <div className="w-full max-w-3xl space-y-6">
      <OpsPageHeader
        eyebrow="Department reporting"
        title="Draft a new department report"
        description="Pick the reporting window, check the suggested figures pulled from system records, add your narrative, then submit for leadership review."
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
            Department
            <select className={OPS_INPUT_CLASS} defaultValue={department} name="department">
              {departments.map((dept) => (
                <option key={dept} value={dept}>
                  {OPS_DEPARTMENT_LABELS[dept]}
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
          Load suggested figures
        </button>
      </form>

      <form
        action={createDepartmentReportAction}
        className="space-y-4 rounded-2xl border border-primary-dark/10 bg-white p-6 shadow-sm"
      >
        <input name="department" type="hidden" value={department} />
        <input name="period" type="hidden" value={period} />
        <input name="period_start_date" type="hidden" value={periodStart} />
        <input name="period_end_date" type="hidden" value={periodEnd} />

        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-dark/45">
          {deptLabel} · {period.replace("_", " ")} · {periodStart} → {periodEnd}
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

        <label className={OPS_LABEL_CLASS}>
          Narrative
          <textarea
            className={`${OPS_INPUT_CLASS} min-h-48`}
            defaultValue={template.narrativePrompt}
            maxLength={20000}
            name="narrative"
            rows={12}
          />
        </label>

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
