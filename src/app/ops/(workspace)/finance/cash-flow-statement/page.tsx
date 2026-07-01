import { Landmark } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OpsEmptyState } from "@/components/ops/OpsEmptyState";
import { OpsPageHeader } from "@/components/ops/OpsPageHeader";
import { OpsTableShell } from "@/components/ops/OpsTableShell";
import { requireOpsUser } from "@/lib/ops/auth";
import { fetchOpsCashFlowStatement } from "@/lib/ops/gl";
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

export default async function OpsCashFlowStatementPage() {
  const { profile } = await requireOpsUser();

  if (!canAccessOpsHref(profile.role, "/ops/finance/cash-flow-statement")) {
    notFound();
  }

  const cashFlow = await fetchOpsCashFlowStatement();

  return (
    <div className="w-full max-w-none space-y-6">
      <OpsPageHeader
        eyebrow="General Ledger"
        title="Cash Flow Statement"
        description="Bank and cash movements since the ledger went live, by source — receipts from customers, payments to suppliers and subcontractors, and payments to employees."
        actions={
          <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/finance/trial-balance">
            <Landmark className="size-4" aria-hidden="true" />
            Trial balance
          </Link>
        }
      />

      <section className="grid gap-3 md:grid-cols-2">
        <div
          className={`rounded-xl border px-4 py-3 ${
            cashFlow.netCashMovement >= 0
              ? "border-emerald-200 bg-emerald-50"
              : "border-red-200 bg-red-50"
          }`}
        >
          <p
            className={`font-heading text-2xl font-black ${
              cashFlow.netCashMovement >= 0 ? "text-emerald-700" : "text-red-700"
            }`}
          >
            {formatZmw(cashFlow.netCashMovement)}
          </p>
          <p className="mt-0.5 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Net cash movement
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="font-heading text-2xl font-black text-foreground">
            {formatZmw(cashFlow.closingCashBalance)}
          </p>
          <p className="mt-0.5 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Closing cash balance
          </p>
        </div>
      </section>

      {cashFlow.hasActivity ? (
        <OpsTableShell>
          <table className={`${OPS_TABLE_CLASS} min-w-[480px]`}>
            <caption className="sr-only">Cash flow by source.</caption>
            <thead className={OPS_THEAD_CLASS}>
              <tr>
                <th className={OPS_TH_CLASS} scope="col">Source</th>
                <th className={OPS_TH_NUM_CLASS} scope="col">Net movement</th>
              </tr>
            </thead>
            <tbody>
              {cashFlow.lines.map((line) => (
                <tr className={OPS_TR_CLASS} key={line.category}>
                  <td className={`${OPS_TD_CLASS} text-foreground`}>{line.category}</td>
                  <td
                    className={`${OPS_TD_NUM_CLASS} font-semibold ${
                      line.amount >= 0 ? "text-emerald-700" : "text-red-700"
                    }`}
                  >
                    {formatZmw(line.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/40 font-bold">
                <td className={OPS_TD_CLASS}>Net cash movement</td>
                <td className={`${OPS_TD_NUM_CLASS} text-foreground`}>
                  {formatZmw(cashFlow.netCashMovement)}
                </td>
              </tr>
            </tfoot>
          </table>
        </OpsTableShell>
      ) : (
        <OpsEmptyState
          icon={Landmark}
          title="No cash movement yet"
          description="Bank and cash receipts and payments appear here as invoices, bills, and payroll post to the ledger."
          actions={[{ href: "/ops/finance/journal", label: "Open journal" }]}
        />
      )}
    </div>
  );
}
