import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Clock4,
  TrendingDown,
  TrendingUp,
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  CircleAlert,
} from "lucide-react";
import Link from "next/link";
import {
  OPS_AGEING_BUCKETS,
  type OpsAgeingBucket,
  type OpsAgeingSummary,
  type OpsCashflowChartSummary,
  type OpsCommercialKpis,
} from "@/lib/ops/finance-kpis";
import { formatZmw, OPS_EYEBROW_CLASS, OPS_SECONDARY_BUTTON_CLASS } from "@/lib/ops/ui";

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
    <section className="rounded-lg border border-border border-l-4 border-l-primary bg-card p-5">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className={OPS_EYEBROW_CLASS}>
            Cashflow
          </p>
          <h2 className="mt-1 font-heading text-xl font-bold text-foreground">
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
              className="grid gap-2 rounded-md border border-border px-3 py-3 sm:grid-cols-[8rem_1fr_8rem] sm:items-center"
              key={`${point.period_start}-${point.period_label}`}
            >
              <p className="text-sm font-bold text-foreground">{point.period_label}</p>
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
                <span className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  Actual net
                </span>
                {formatZmw(point.actual_net)}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-5 rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
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
      <span className="w-20 shrink-0 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </span>
      <span className="h-2 grow overflow-hidden rounded-full bg-muted">
        <span className={`block h-full rounded-full ${colorClass}`} style={{ width: `${share}%` }} />
      </span>
      <span className="w-28 shrink-0 text-right text-xs font-semibold text-foreground/75">
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
        : "text-foreground";
  return (
    <div className="rounded-md border border-border px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </p>
      <p className={`mt-0.5 text-sm font-bold ${toneClass}`}>{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ageing report panels (used for both supplier and receivables)
// ---------------------------------------------------------------------------

function bucketMeta(bucket: OpsAgeingBucket) {
  switch (bucket) {
    case "0-30":
      return {
        className: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/50",
        label: "Healthy",
        icon: CheckCircle2,
      };
    case "31-60":
      return {
        className: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/50",
        label: "Watch",
        icon: CircleAlert,
      };
    case "61-90":
      return {
        className: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/20 dark:text-orange-400 dark:border-orange-900/50",
        label: "Critical",
        icon: AlertTriangle,
      };
    default:
      return {
        className: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/20 dark:text-red-400 dark:border-red-900/50",
        label: "Overdue",
        icon: AlertOctagon,
      };
  }
}

export function OpsAgeingPanel({
  description,
  emptyMessage,
  eyebrow,
  registerHref,
  registerLabel,
  summary,
  title,
}: {
  description: string;
  emptyMessage: string;
  eyebrow: string;
  /** Where the underlying records live — makes every row actionable. */
  registerHref?: string;
  registerLabel?: string;
  summary: OpsAgeingSummary;
  title: string;
}) {
  return (
    <section className="rounded-lg border border-border border-l-4 border-l-primary bg-card p-5">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className={OPS_EYEBROW_CLASS}>
            {eyebrow}
          </p>
          <h2 className="mt-1 font-heading text-xl font-bold text-foreground">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <p className="font-heading text-2xl font-bold text-foreground">
            {formatZmw(summary.total)}
          </p>
          {registerHref ? (
            <Link className={OPS_SECONDARY_BUTTON_CLASS} href={registerHref}>
              {registerLabel ?? "Open register"}
            </Link>
          ) : null}
        </div>
      </header>

      <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {OPS_AGEING_BUCKETS.map((bucket) => {
          const meta = bucketMeta(bucket);
          const Icon = meta.icon;
          const tileBody = (
            <>
              <div className="flex items-center justify-between gap-1.5">
                <p className="text-[10px] font-bold uppercase tracking-[0.1em] opacity-80">
                  {bucket} days
                </p>
                <span className="text-[10px] font-bold uppercase tracking-[0.05em] opacity-75 inline-flex items-center gap-1">
                  <Icon className="size-3" aria-hidden="true" />
                  {meta.label}
                </span>
              </div>
              <p className="mt-2 text-base font-bold leading-none">{formatZmw(summary.bucketTotals[bucket])}</p>
            </>
          );
          const tileClass = `rounded-md border px-3 py-2.5 flex flex-col justify-between min-h-[5.5rem] ${meta.className}`;
          // Tiles open the underlying register so an overdue band is one click
          // from the records behind it.
          return registerHref ? (
            <Link className={`${tileClass} transition hover:brightness-95`} href={registerHref} key={bucket}>
              {tileBody}
            </Link>
          ) : (
            <div className={tileClass} key={bucket}>
              {tileBody}
            </div>
          );
        })}
      </dl>

      {summary.rows.length > 0 ? (
        <ul className="mt-4 grid gap-2">
          {summary.rows.slice(0, 8).map((row) => {
            const rowBody = (
              <>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-foreground">{row.label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {row.days_outstanding} days outstanding · {row.reference}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-bold text-foreground">
                  {formatZmw(row.outstanding)}
                </p>
              </>
            );
            return (
              <li key={row.id}>
                {registerHref ? (
                  <Link
                    className="flex items-start justify-between gap-3 rounded-md border border-border px-3 py-2.5 transition hover:border-primary/50 hover:bg-muted/40"
                    href={registerHref}
                  >
                    {rowBody}
                  </Link>
                ) : (
                  <div className="flex items-start justify-between gap-3 rounded-md border border-border px-3 py-2.5">
                    {rowBody}
                  </div>
                )}
              </li>
            );
          })}
          {summary.rows.length > 8 ? (
            <li className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              +{summary.rows.length - 8} more
            </li>
          ) : null}
        </ul>
      ) : (
        <p className="mt-4 rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
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
    <section className="rounded-lg border border-border border-l-4 border-l-primary bg-card p-5">
      <header>
        <p className={OPS_EYEBROW_CLASS}>
          Commercial KPIs
        </p>
        <h2 className="mt-1 font-heading text-xl font-bold text-foreground">
          Margin, variations & IPC speed
        </h2>
      </header>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <article className="rounded-md border border-border p-4">
          <p className="flex items-center justify-between text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
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
          <p className="mt-1 text-xs text-muted-foreground">
            {formatZmw(kpis.gross_profit)} on {formatZmw(kpis.revenue)} revenue
          </p>
        </article>

        <article className="rounded-md border border-border p-4">
          <p className="flex items-center justify-between text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
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
          <p className="mt-1 text-xs text-muted-foreground">
            {formatZmw(kpis.variation_approved)} approved of {formatZmw(kpis.variation_submitted)} submitted
          </p>
        </article>

        <article className="rounded-md border border-border p-4">
          <p className="flex items-center justify-between text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
            Interim Payment Certificate turnaround
            <Clock4 className="size-3.5 text-primary-blue" aria-hidden="true" />
          </p>
          <p className="mt-1 font-heading text-2xl font-bold text-foreground">
            {kpis.ipc_avg_turnaround_days !== null
              ? `${kpis.ipc_avg_turnaround_days}d`
              : "—"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {kpis.ipc_sample_size > 0
              ? `Avg of ${kpis.ipc_sample_size} paid IPC${kpis.ipc_sample_size === 1 ? "" : "s"}`
              : "No paid IPCs yet"}
          </p>
        </article>
      </div>
    </section>
  );
}
