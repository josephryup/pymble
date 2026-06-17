import { ArrowDownRight, ArrowUpRight, BarChart3, Clock4, TrendingDown, TrendingUp } from "lucide-react";
import {
  OPS_AGEING_BUCKETS,
  type OpsAgeingBucket,
  type OpsAgeingSummary,
  type OpsCashflowChartSummary,
  type OpsCommercialKpis,
} from "@/lib/ops/finance-kpis";
import { formatZmw } from "@/lib/ops/ui";

// ---------------------------------------------------------------------------
// Cashflow chart panel
// ---------------------------------------------------------------------------

function safeShare(value: number, max: number) {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(100, (Math.abs(value) / max) * 100));
}

export function OpsCashflowChartPanel({ data }: { data: OpsCashflowChartSummary }) {
  const { points, totals } = data;
  const max = Math.max(
    1,
    ...points.flatMap((point) => [
      Math.abs(point.forecast_inflow),
      Math.abs(point.forecast_outflow),
      Math.abs(point.forecast_net),
      Math.abs(point.actual_net),
    ]),
  );

  return (
    <section className="rounded-lg border border-primary-dark/10 bg-white p-5">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-blue">
            Cashflow
          </p>
          <h2 className="mt-1 font-heading text-xl font-bold text-primary-dark">
            Forecast vs actual
          </h2>
        </div>
        <span className="flex size-9 items-center justify-center rounded-md bg-primary-blue/10 text-primary-blue">
          <BarChart3 className="size-5" aria-hidden="true" />
        </span>
      </header>

      <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <KpiTile label="Forecast inflow" value={formatZmw(totals.forecast_inflow)} />
        <KpiTile label="Forecast outflow" value={formatZmw(totals.forecast_outflow)} />
        <KpiTile
          label="Forecast net"
          value={formatZmw(totals.forecast_net)}
          tone={totals.forecast_net >= 0 ? "good" : "warn"}
        />
        <KpiTile
          label="Actual net"
          value={formatZmw(totals.actual_net)}
          tone={totals.actual_net >= 0 ? "good" : "warn"}
        />
      </dl>

      {points.length > 0 ? (
        <ul className="mt-5 grid gap-3">
          {points.map((point) => (
            <li
              className="grid gap-2 rounded-md border border-primary-dark/10 px-3 py-3 sm:grid-cols-[8rem_1fr_8rem] sm:items-center"
              key={`${point.period_start}-${point.period_label}`}
            >
              <p className="text-sm font-bold text-primary-dark">{point.period_label}</p>
              <div className="grid gap-1.5">
                <BarRow
                  label="Inflow"
                  amount={point.forecast_inflow}
                  share={safeShare(point.forecast_inflow, max)}
                  colorClass="bg-emerald-500"
                />
                <BarRow
                  label="Outflow"
                  amount={point.forecast_outflow}
                  share={safeShare(point.forecast_outflow, max)}
                  colorClass="bg-red-500"
                />
                <BarRow
                  label="Net (fcst)"
                  amount={point.forecast_net}
                  share={safeShare(point.forecast_net, max)}
                  colorClass={point.forecast_net >= 0 ? "bg-primary-blue" : "bg-orange-500"}
                />
              </div>
              <p
                className={`text-right text-sm font-bold ${
                  point.actual_net >= 0 ? "text-emerald-700" : "text-red-700"
                }`}
              >
                <span className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-primary-dark/45">
                  Actual net
                </span>
                {formatZmw(point.actual_net)}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-5 rounded-md border border-dashed border-primary-dark/15 p-6 text-center text-sm text-primary-dark/60">
          No cashflow forecasts captured yet.
        </p>
      )}
    </section>
  );
}

function BarRow({
  amount,
  colorClass,
  label,
  share,
}: {
  amount: number;
  colorClass: string;
  label: string;
  share: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-xs font-semibold uppercase tracking-[0.1em] text-primary-dark/45">
        {label}
      </span>
      <span className="h-2 grow overflow-hidden rounded-full bg-primary-dark/[0.06]">
        <span className={`block h-full rounded-full ${colorClass}`} style={{ width: `${share}%` }} />
      </span>
      <span className="w-28 shrink-0 text-right text-xs font-semibold text-primary-dark/75">
        {formatZmw(amount)}
      </span>
    </div>
  );
}

function KpiTile({
  label,
  tone = "default",
  value,
}: {
  label: string;
  tone?: "default" | "good" | "warn";
  value: string;
}) {
  const toneClass =
    tone === "good"
      ? "text-emerald-700"
      : tone === "warn"
        ? "text-red-700"
        : "text-primary-dark";
  return (
    <div className="rounded-md border border-primary-dark/10 px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-primary-dark/45">
        {label}
      </p>
      <p className={`mt-0.5 text-sm font-bold ${toneClass}`}>{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ageing report panels (used for both supplier and receivables)
// ---------------------------------------------------------------------------

function bucketToneClass(bucket: OpsAgeingBucket) {
  switch (bucket) {
    case "0-30":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "31-60":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "61-90":
      return "bg-orange-50 text-orange-700 border-orange-200";
    default:
      return "bg-red-50 text-red-700 border-red-200";
  }
}

export function OpsAgeingPanel({
  description,
  emptyMessage,
  eyebrow,
  summary,
  title,
}: {
  description: string;
  emptyMessage: string;
  eyebrow: string;
  summary: OpsAgeingSummary;
  title: string;
}) {
  return (
    <section className="rounded-lg border border-primary-dark/10 bg-white p-5">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-blue">
            {eyebrow}
          </p>
          <h2 className="mt-1 font-heading text-xl font-bold text-primary-dark">{title}</h2>
          <p className="mt-1 text-sm text-primary-dark/60">{description}</p>
        </div>
        <p className="font-heading text-2xl font-bold text-primary-dark">
          {formatZmw(summary.total)}
        </p>
      </header>

      <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {OPS_AGEING_BUCKETS.map((bucket) => (
          <div
            className={`rounded-md border px-3 py-2.5 ${bucketToneClass(bucket)}`}
            key={bucket}
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] opacity-80">
              {bucket} days
            </p>
            <p className="mt-0.5 text-sm font-bold">{formatZmw(summary.bucketTotals[bucket])}</p>
          </div>
        ))}
      </dl>

      {summary.rows.length > 0 ? (
        <ul className="mt-4 grid gap-2">
          {summary.rows.slice(0, 8).map((row) => (
            <li
              className="flex items-start justify-between gap-3 rounded-md border border-primary-dark/10 px-3 py-2.5"
              key={row.id}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-primary-dark">{row.label}</p>
                <p className="mt-0.5 text-xs text-primary-dark/55">
                  {row.days_outstanding} days outstanding · {row.reference}
                </p>
              </div>
              <p className="shrink-0 text-sm font-bold text-primary-dark">
                {formatZmw(row.outstanding)}
              </p>
            </li>
          ))}
          {summary.rows.length > 8 ? (
            <li className="text-xs font-semibold uppercase tracking-[0.1em] text-primary-dark/45">
              +{summary.rows.length - 8} more
            </li>
          ) : null}
        </ul>
      ) : (
        <p className="mt-4 rounded-md border border-dashed border-primary-dark/15 p-6 text-center text-sm text-primary-dark/60">
          {emptyMessage}
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Commercial KPI panel (gross profit %, variation recovery %, Interim Payment Certificate turnaround)
// ---------------------------------------------------------------------------

export function OpsCommercialKpiPanel({ kpis }: { kpis: OpsCommercialKpis }) {
  const profitTrendClass =
    kpis.gross_profit >= 0 ? "text-emerald-700" : "text-red-700";
  const variationTrendClass =
    (kpis.variation_recovery_pct ?? 0) >= 75
      ? "text-emerald-700"
      : (kpis.variation_recovery_pct ?? 0) >= 50
        ? "text-amber-700"
        : "text-red-700";

  return (
    <section className="rounded-lg border border-primary-dark/10 bg-white p-5">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-blue">
          Commercial KPIs
        </p>
        <h2 className="mt-1 font-heading text-xl font-bold text-primary-dark">
          Margin, variations & IPC speed
        </h2>
      </header>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <article className="rounded-md border border-primary-dark/10 p-4">
          <p className="flex items-center justify-between text-xs font-bold uppercase tracking-[0.12em] text-primary-dark/45">
            Gross profit
            {kpis.gross_profit >= 0 ? (
              <TrendingUp className="size-3.5 text-emerald-600" aria-hidden="true" />
            ) : (
              <TrendingDown className="size-3.5 text-red-600" aria-hidden="true" />
            )}
          </p>
          <p className={`mt-1 font-heading text-2xl font-bold ${profitTrendClass}`}>
            {kpis.gross_profit_pct !== null ? `${kpis.gross_profit_pct}%` : "—"}
          </p>
          <p className="mt-1 text-xs text-primary-dark/60">
            {formatZmw(kpis.gross_profit)} on {formatZmw(kpis.revenue)} revenue
          </p>
        </article>

        <article className="rounded-md border border-primary-dark/10 p-4">
          <p className="flex items-center justify-between text-xs font-bold uppercase tracking-[0.12em] text-primary-dark/45">
            Variation recovery
            {(kpis.variation_recovery_pct ?? 0) >= 75 ? (
              <ArrowUpRight className="size-3.5 text-emerald-600" aria-hidden="true" />
            ) : (
              <ArrowDownRight className="size-3.5 text-red-600" aria-hidden="true" />
            )}
          </p>
          <p className={`mt-1 font-heading text-2xl font-bold ${variationTrendClass}`}>
            {kpis.variation_recovery_pct !== null ? `${kpis.variation_recovery_pct}%` : "—"}
          </p>
          <p className="mt-1 text-xs text-primary-dark/60">
            {formatZmw(kpis.variation_approved)} approved of {formatZmw(kpis.variation_submitted)} submitted
          </p>
        </article>

        <article className="rounded-md border border-primary-dark/10 p-4">
          <p className="flex items-center justify-between text-xs font-bold uppercase tracking-[0.12em] text-primary-dark/45">
            Interim Payment Certificate turnaround
            <Clock4 className="size-3.5 text-primary-blue" aria-hidden="true" />
          </p>
          <p className="mt-1 font-heading text-2xl font-bold text-primary-dark">
            {kpis.ipc_avg_turnaround_days !== null
              ? `${kpis.ipc_avg_turnaround_days}d`
              : "—"}
          </p>
          <p className="mt-1 text-xs text-primary-dark/60">
            {kpis.ipc_sample_size > 0
              ? `Avg of ${kpis.ipc_sample_size} paid IPC${kpis.ipc_sample_size === 1 ? "" : "s"}`
              : "No paid IPCs yet"}
          </p>
        </article>
      </div>
    </section>
  );
}
