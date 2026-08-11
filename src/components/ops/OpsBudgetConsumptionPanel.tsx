import Link from "next/link";
import { OpsDashboardPanel } from "@/components/ops/OpsDashboardPanel";
import { OpsTableShell } from "@/components/ops/OpsTableShell";
import type { OpsBudgetConsumption } from "@/lib/ops/finance-period-metrics";
import {
  formatZmw,
  OPS_TABLE_CLASS,
  OPS_TD_CLASS,
  OPS_TD_NUM_CLASS,
  OPS_TH_CLASS,
  OPS_TH_NUM_CLASS,
  OPS_THEAD_CLASS,
  OPS_TR_CLASS,
} from "@/lib/ops/ui";

/**
 * Where the money was allocated, and how much of it is left.
 *
 * A table rather than a metric, deliberately (§5 of the finance metrics
 * audit): a single "budget used" figure tells you there is a problem but never
 * which project has it. Ordered worst-remaining first, because an overspent
 * budget is the reason anyone opens this.
 *
 * Two of these columns are on different time bases and the header says so.
 * "Used this period" is a flow inside the window; "remaining" is a position at
 * its end against a lifetime budget. They will not add up, and a reader who
 * expects them to has been misled by the table rather than by the data.
 */
export function OpsBudgetConsumptionPanel({
  consumption,
  periodLabel,
}: {
  consumption: OpsBudgetConsumption;
  periodLabel: string;
}) {
  const { budgets } = consumption;

  const description =
    budgets.length === 0
      ? "No open project budgets yet."
      : consumption.unfunded_budget_count > 0
        ? `${formatZmw(consumption.unfunded_budget_value)} is charged to ${
            consumption.unfunded_budget_count === 1 ? "a budget" : "budgets"
          } with nothing budgeted at all.`
        : `${formatZmw(consumption.active_remaining)} remaining across active budgets.`;

  return (
    <OpsDashboardPanel
      accent={consumption.unfunded_budget_count > 0 || consumption.budgets_over_threshold > 0}
      density="compact"
      description={description}
      eyebrow="Budgets"
      href="/ops/project-budgets"
      title="Where the money is allocated"
    >
      {budgets.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Create a project budget to track spend against a plan.
        </p>
      ) : (
        <OpsTableShell>
          <table className={`${OPS_TABLE_CLASS} min-w-[760px]`}>
            <caption className="sr-only">
              Open project budgets with budgeted amount, spend in {periodLabel}, total
              consumed to date, and remaining.
            </caption>
            <thead className={OPS_THEAD_CLASS}>
              <tr>
                <th className={OPS_TH_CLASS} scope="col">
                  Budget
                </th>
                <th className={OPS_TH_NUM_CLASS} scope="col">
                  Budgeted
                </th>
                <th className={OPS_TH_NUM_CLASS} scope="col">
                  Used in {periodLabel}
                </th>
                <th className={OPS_TH_NUM_CLASS} scope="col">
                  Consumed to date
                </th>
                <th className={OPS_TH_NUM_CLASS} scope="col">
                  Remaining
                </th>
                <th className={OPS_TH_NUM_CLASS} scope="col">
                  Used
                </th>
              </tr>
            </thead>
            <tbody>
              {budgets.map((budget) => {
                const unfunded = budget.budgeted <= 0 && budget.consumed_to_date > 0;
                const tone = unfunded
                  ? "text-red-700 dark:text-red-300"
                  : budget.remaining < 0
                    ? "text-red-700 dark:text-red-300"
                    : budget.band !== "ok"
                      ? "text-amber-700 dark:text-amber-300"
                      : "text-foreground";

                return (
                  <tr className={OPS_TR_CLASS} key={budget.budget_id}>
                    <td className={OPS_TD_CLASS}>
                      <Link
                        className="font-semibold text-foreground underline-offset-2 hover:underline"
                        href={`/ops/project-budgets?q=${encodeURIComponent(budget.budget_number)}`}
                      >
                        {budget.site_code} — {budget.title}
                      </Link>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {budget.budget_number}
                        {budget.status !== "active" ? ` · ${budget.status}` : ""}
                      </span>
                    </td>
                    <td className={OPS_TD_NUM_CLASS}>
                      {budget.budgeted > 0 ? formatZmw(budget.budgeted) : "Not budgeted"}
                    </td>
                    <td className={OPS_TD_NUM_CLASS}>
                      {budget.consumed_period > 0 ? formatZmw(budget.consumed_period) : "—"}
                    </td>
                    <td className={OPS_TD_NUM_CLASS}>{formatZmw(budget.consumed_to_date)}</td>
                    <td className={`${OPS_TD_NUM_CLASS} font-semibold ${tone}`}>
                      {unfunded ? "No budget" : formatZmw(budget.remaining)}
                    </td>
                    <td className={`${OPS_TD_NUM_CLASS} ${tone}`}>
                      {budget.used_percent === null ? "—" : `${budget.used_percent}%`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </OpsTableShell>
      )}

      <p className="mt-3 text-xs leading-5 text-muted-foreground">
        &ldquo;Used in {periodLabel}&rdquo; counts spend dated inside the period.
        &ldquo;Remaining&rdquo; is the position at the period&rsquo;s end against the whole
        budget — the two are measured over different spans and will not add up.
      </p>
    </OpsDashboardPanel>
  );
}
