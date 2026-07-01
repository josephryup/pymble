import { LineChart, TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OpsEmptyState } from "@/components/ops/OpsEmptyState";
import { OpsPageHeader } from "@/components/ops/OpsPageHeader";
import { OpsTableShell } from "@/components/ops/OpsTableShell";
import { requireOpsUser } from "@/lib/ops/auth";
import { fetchOpsProfitAndLoss } from "@/lib/ops/gl";
import { canAccessOpsHref } from "@/lib/ops/permissions";
import {
  formatZmw,
  OPS_SECONDARY_BUTTON_CLASS,
  OPS_TABLE_CLASS,
  OPS_TD_CLASS,
  OPS_TD_NUM_CLASS,
  OPS_TH_CLASS,
  OPS_TH_NUM_CLASS,
  OPS_THEAD_CLASS,
  OPS_TR_CLASS,
} from "@/lib/ops/ui";

export const dynamic = "force-dynamic";

function LineRows({ lines }: { lines: { code: string; name: string; amount: number }[] }) {
  return (
    <>
      {lines.map((line) => (
        <tr className={OPS_TR_CLASS} key={line.code}>
          <td className={`${OPS_TD_CLASS} text-muted-foreground`}>
            <span className="font-mono text-xs">{line.code}</span> {line.name}
          </td>
          <td className={`${OPS_TD_NUM_CLASS} text-foreground`}>{formatZmw(line.amount)}</td>
        </tr>
      ))}
    </>
  );
}

export default async function OpsProfitAndLossPage() {
  const { profile } = await requireOpsUser();

  if (!canAccessOpsHref(profile.role, "/ops/finance/profit-and-loss")) {
    notFound();
  }

  const pnl = await fetchOpsProfitAndLoss();

  return (
    <div className="w-full max-w-none space-y-6">
      <OpsPageHeader
        eyebrow="General Ledger"
        title="Profit and Loss"
        description="Revenue, cost of sales, and operating expenses since the ledger went live. Since-inception, not period-bound — period close arrives in a later phase."
        actions={
          <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/finance/balance-sheet">
            <LineChart className="size-4" aria-hidden="true" />
            Balance sheet
          </Link>
        }
      />

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="font-heading text-2xl font-black text-foreground">
            {formatZmw(pnl.totalIncome)}
          </p>
          <p className="mt-0.5 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Revenue
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="font-heading text-2xl font-black text-foreground">
            {formatZmw(pnl.totalCostOfSales)}
          </p>
          <p className="mt-0.5 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Cost of sales
          </p>
        </div>
        <div
          className={`rounded-xl border px-4 py-3 ${
            pnl.grossProfit >= 0
              ? "border-emerald-200 bg-emerald-50"
              : "border-red-200 bg-red-50"
          }`}
        >
          <p
            className={`flex items-center gap-1.5 font-heading text-2xl font-black ${
              pnl.grossProfit >= 0 ? "text-emerald-700" : "text-red-700"
            }`}
          >
            {pnl.grossProfit >= 0 ? (
              <TrendingUp className="size-4" aria-hidden="true" />
            ) : (
              <TrendingDown className="size-4" aria-hidden="true" />
            )}
            {formatZmw(pnl.grossProfit)}
          </p>
          <p className="mt-0.5 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Gross profit{pnl.grossMarginPct !== null ? ` · ${pnl.grossMarginPct}%` : ""}
          </p>
        </div>
        <div
          className={`rounded-xl border px-4 py-3 ${
            pnl.netProfit >= 0 ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"
          }`}
        >
          <p
            className={`font-heading text-2xl font-black ${
              pnl.netProfit >= 0 ? "text-emerald-700" : "text-red-700"
            }`}
          >
            {formatZmw(pnl.netProfit)}
          </p>
          <p className="mt-0.5 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Net profit
          </p>
        </div>
      </section>

      {pnl.hasActivity ? (
        <OpsTableShell>
          <table className={`${OPS_TABLE_CLASS} min-w-[520px]`}>
            <caption className="sr-only">Profit and loss by account.</caption>
            <thead className={OPS_THEAD_CLASS}>
              <tr>
                <th className={OPS_TH_CLASS} scope="col">Account</th>
                <th className={OPS_TH_NUM_CLASS} scope="col">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr className="bg-muted/40">
                <td className={`${OPS_TD_CLASS} font-bold uppercase tracking-[0.06em] text-foreground`}>
                  Income
                </td>
                <td className={OPS_TD_NUM_CLASS} />
              </tr>
              <LineRows lines={pnl.income} />
              <tr className="border-t border-border bg-muted/20 font-bold">
                <td className={OPS_TD_CLASS}>Total income</td>
                <td className={`${OPS_TD_NUM_CLASS} text-foreground`}>{formatZmw(pnl.totalIncome)}</td>
              </tr>

              <tr className="bg-muted/40">
                <td className={`${OPS_TD_CLASS} font-bold uppercase tracking-[0.06em] text-foreground`}>
                  Cost of sales
                </td>
                <td className={OPS_TD_NUM_CLASS} />
              </tr>
              <LineRows lines={pnl.costOfSales} />
              <tr className="border-t border-border bg-muted/20 font-bold">
                <td className={OPS_TD_CLASS}>Gross profit</td>
                <td
                  className={`${OPS_TD_NUM_CLASS} ${
                    pnl.grossProfit >= 0 ? "text-emerald-700" : "text-red-700"
                  }`}
                >
                  {formatZmw(pnl.grossProfit)}
                </td>
              </tr>

              <tr className="bg-muted/40">
                <td className={`${OPS_TD_CLASS} font-bold uppercase tracking-[0.06em] text-foreground`}>
                  Operating expenses
                </td>
                <td className={OPS_TD_NUM_CLASS} />
              </tr>
              <LineRows lines={pnl.operatingExpenses} />
              <tr className="border-t-2 border-border bg-muted/40 font-bold">
                <td className={OPS_TD_CLASS}>Net profit</td>
                <td
                  className={`${OPS_TD_NUM_CLASS} ${
                    pnl.netProfit >= 0 ? "text-emerald-700" : "text-red-700"
                  }`}
                >
                  {formatZmw(pnl.netProfit)}
                </td>
              </tr>
            </tbody>
          </table>
        </OpsTableShell>
      ) : (
        <OpsEmptyState
          icon={LineChart}
          title="No income or expense activity yet"
          description="Revenue and cost lines appear here as invoices and bills post to the ledger."
          actions={[{ href: "/ops/finance/journal", label: "Open journal" }]}
        />
      )}
    </div>
  );
}
