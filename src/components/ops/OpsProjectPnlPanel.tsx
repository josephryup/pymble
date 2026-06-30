import { TrendingDown, TrendingUp, BarChart3 } from "lucide-react";
import type { OpsProjectPnlSummary } from "@/lib/ops/project-pnl";
import { OpsEmptyState } from "@/components/ops/OpsEmptyState";
import { formatZmw, OPS_EYEBROW_CLASS, OPS_TABLE_SCROLL_CLASS } from "@/lib/ops/ui";

function formatType(type: string) {
  return type.replace(/_/g, " ");
}

function marginClass(margin: number) {
  return margin >= 0 ? "text-emerald-700" : "text-red-700";
}

export function OpsProjectPnlPanel({ pnl }: { pnl: OpsProjectPnlSummary }) {
  const { rows, totals } = pnl;

  return (
    <section className="rounded-lg border border-border border-l-4 border-l-primary bg-card">
      <div className="flex flex-col gap-3 border-b border-border p-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className={OPS_EYEBROW_CLASS}>
            Profitability by project
          </p>
          <h2 className="mt-1 font-heading text-xl font-bold text-foreground">
            Project P&amp;L
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Revenue from issued and paid invoices, less committed and posted costs, per site.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-right">
          <div className="rounded-md border border-border px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
              Revenue
            </p>
            <p className="mt-0.5 text-sm font-bold text-foreground">{formatZmw(totals.revenue)}</p>
          </div>
          <div className="rounded-md border border-border px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
              Cost
            </p>
            <p className="mt-0.5 text-sm font-bold text-foreground">{formatZmw(totals.cost)}</p>
          </div>
          <div className="rounded-md border border-border px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
              Margin
            </p>
            <p className={`mt-0.5 text-sm font-bold ${marginClass(totals.margin)}`}>
              {formatZmw(totals.margin)}
              {totals.margin_pct !== null ? ` (${totals.margin_pct}%)` : ""}
            </p>
          </div>
        </div>
      </div>

      {rows.length > 0 ? (
        <div className={`hidden md:block max-h-[32rem] overflow-auto relative ${OPS_TABLE_SCROLL_CLASS}`} tabIndex={0}>
          <table className="min-w-full divide-y divide-border text-sm">
            <caption className="sr-only">Project profit and loss by site.</caption>
            <thead className="sticky top-0 z-10 bg-muted text-left text-xs uppercase tracking-[0.12em] text-muted-foreground shadow-[inset_0_-1px_0_0_rgba(0,0,0,0.1)] dark:shadow-[inset_0_-1px_0_0_rgba(255,255,255,0.1)]">
              <tr>
                <th className="px-5 py-3" scope="col">Site</th>
                <th className="px-5 py-3" scope="col">Cost breakdown</th>
                <th className="px-5 py-3 text-right" scope="col">Revenue</th>
                <th className="px-5 py-3 text-right" scope="col">Cost</th>
                <th className="px-5 py-3 text-right" scope="col">Margin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr key={row.site_id}>
                  <td className="px-5 py-4">
                    <p className="font-bold text-foreground">{row.name}</p>
                    <p className="mt-0.5 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                      {row.code}
                    </p>
                  </td>
                  <td className="px-5 py-4">
                    {row.cost_by_type.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {row.cost_by_type.map((cost) => (
                          <span
                            className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground"
                            key={cost.type}
                          >
                            {formatType(cost.type)}
                            <span className="text-muted-foreground/80">{formatZmw(cost.amount)}</span>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground/60">No costs posted</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-right font-semibold text-foreground">
                    {formatZmw(row.revenue)}
                  </td>
                  <td className="px-5 py-4 text-right text-muted-foreground/75">
                    {formatZmw(row.total_cost)}
                  </td>
                  <td className={`px-5 py-4 text-right font-bold ${marginClass(row.margin)}`}>
                    <span className="inline-flex items-center justify-end gap-1">
                      {row.margin >= 0 ? (
                        <TrendingUp className="size-3.5" aria-hidden="true" />
                      ) : (
                        <TrendingDown className="size-3.5" aria-hidden="true" />
                      )}
                      {formatZmw(row.margin)}
                      {row.margin_pct !== null ? (
                        <span className="text-xs font-semibold opacity-70">
                          {row.margin_pct}%
                        </span>
                      ) : null}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* Mobile cards */}
      {rows.length > 0 ? (
        <div className="grid gap-3 p-4 md:hidden">
          {rows.map((row) => (
            <div className="rounded-md border border-border p-4" key={row.site_id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-foreground">{row.name}</p>
                  <p className="mt-0.5 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    {row.code}
                  </p>
                </div>
                <p className={`text-right font-bold ${marginClass(row.margin)}`}>
                  {formatZmw(row.margin)}
                  {row.margin_pct !== null ? (
                    <span className="block text-xs opacity-70">{row.margin_pct}% margin</span>
                  ) : null}
                </p>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Revenue</dt>
                  <dd className="font-semibold text-foreground">{formatZmw(row.revenue)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Cost</dt>
                  <dd className="font-semibold text-foreground">{formatZmw(row.total_cost)}</dd>
                </div>
              </dl>
              {row.cost_by_type.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {row.cost_by_type.map((cost) => (
                    <span
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground"
                      key={cost.type}
                    >
                      {formatType(cost.type)}
                      <span className="text-muted-foreground/80">{formatZmw(cost.amount)}</span>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <OpsEmptyState
          icon={BarChart3}
          title="No project P&amp;L records"
          description="Revenue from issued invoices, less committed and posted costs, will appear here once recorded."
          actions={[
            { href: "/ops/invoices", label: "Issue invoice" }
          ]}
        />
      )}
    </section>
  );
}
