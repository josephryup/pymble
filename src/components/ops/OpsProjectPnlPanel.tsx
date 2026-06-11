import { TrendingDown, TrendingUp } from "lucide-react";
import type { OpsProjectPnlSummary } from "@/lib/ops/project-pnl";
import { formatZmw, OPS_TABLE_SCROLL_CLASS } from "@/lib/ops/ui";

function formatType(type: string) {
  return type.replace(/_/g, " ");
}

function marginClass(margin: number) {
  return margin >= 0 ? "text-emerald-700" : "text-red-700";
}

export function OpsProjectPnlPanel({ pnl }: { pnl: OpsProjectPnlSummary }) {
  const { rows, totals } = pnl;

  return (
    <section className="rounded-lg border border-primary-dark/10 bg-white">
      <div className="flex flex-col gap-3 border-b border-primary-dark/10 p-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-blue">
            Profitability by project
          </p>
          <h2 className="mt-1 font-heading text-xl font-bold text-primary-dark">
            Project P&amp;L
          </h2>
          <p className="mt-1 text-sm text-primary-dark/60">
            Revenue from issued and paid invoices, less committed and posted costs, per site.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-right">
          <div className="rounded-md border border-primary-dark/10 px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-primary-dark/45">
              Revenue
            </p>
            <p className="mt-0.5 text-sm font-bold text-primary-dark">{formatZmw(totals.revenue)}</p>
          </div>
          <div className="rounded-md border border-primary-dark/10 px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-primary-dark/45">
              Cost
            </p>
            <p className="mt-0.5 text-sm font-bold text-primary-dark">{formatZmw(totals.cost)}</p>
          </div>
          <div className="rounded-md border border-primary-dark/10 px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-primary-dark/45">
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
        <div className={`hidden md:block ${OPS_TABLE_SCROLL_CLASS}`} tabIndex={0}>
          <table className="min-w-full divide-y divide-primary-dark/10 text-sm">
            <caption className="sr-only">Project profit and loss by site.</caption>
            <thead className="bg-primary-dark/[0.03] text-left text-xs uppercase tracking-[0.12em] text-primary-dark/52">
              <tr>
                <th className="px-5 py-3" scope="col">Site</th>
                <th className="px-5 py-3" scope="col">Cost breakdown</th>
                <th className="px-5 py-3 text-right" scope="col">Revenue</th>
                <th className="px-5 py-3 text-right" scope="col">Cost</th>
                <th className="px-5 py-3 text-right" scope="col">Margin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-primary-dark/10">
              {rows.map((row) => (
                <tr key={row.site_id}>
                  <td className="px-5 py-4">
                    <p className="font-bold text-primary-dark">{row.name}</p>
                    <p className="mt-0.5 text-xs font-semibold uppercase tracking-[0.1em] text-primary-dark/45">
                      {row.code}
                    </p>
                  </td>
                  <td className="px-5 py-4">
                    {row.cost_by_type.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {row.cost_by_type.map((cost) => (
                          <span
                            className="inline-flex items-center gap-1 rounded-full border border-primary-dark/10 bg-primary-dark/[0.03] px-2 py-0.5 text-[11px] font-semibold text-primary-dark/70"
                            key={cost.type}
                          >
                            {formatType(cost.type)}
                            <span className="text-primary-dark/45">{formatZmw(cost.amount)}</span>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-primary-dark/40">No costs posted</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-right font-semibold text-primary-dark">
                    {formatZmw(row.revenue)}
                  </td>
                  <td className="px-5 py-4 text-right text-primary-dark/70">
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
            <div className="rounded-md border border-primary-dark/10 p-4" key={row.site_id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-primary-dark">{row.name}</p>
                  <p className="mt-0.5 text-xs font-semibold uppercase tracking-[0.1em] text-primary-dark/45">
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
                  <dt className="text-xs text-primary-dark/45">Revenue</dt>
                  <dd className="font-semibold text-primary-dark">{formatZmw(row.revenue)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-primary-dark/45">Cost</dt>
                  <dd className="font-semibold text-primary-dark">{formatZmw(row.total_cost)}</dd>
                </div>
              </dl>
              {row.cost_by_type.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {row.cost_by_type.map((cost) => (
                    <span
                      className="inline-flex items-center gap-1 rounded-full border border-primary-dark/10 bg-primary-dark/[0.03] px-2 py-0.5 text-[11px] font-semibold text-primary-dark/70"
                      key={cost.type}
                    >
                      {formatType(cost.type)}
                      <span className="text-primary-dark/45">{formatZmw(cost.amount)}</span>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex min-h-32 items-center justify-center p-8 text-center text-sm text-primary-dark/60">
          No project revenue or costs recorded yet. Issue an invoice or post a cost to see the P&amp;L.
        </div>
      )}
    </section>
  );
}
