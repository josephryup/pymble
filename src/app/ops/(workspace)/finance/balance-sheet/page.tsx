import { CheckCircle2, Scale, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OpsEmptyState } from "@/components/ops/OpsEmptyState";
import { OpsPageHeader } from "@/components/ops/OpsPageHeader";
import { OpsTableShell } from "@/components/ops/OpsTableShell";
import { requireOpsUser } from "@/lib/ops/auth";
import { fetchOpsBalanceSheet } from "@/lib/ops/gl";
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

function SectionHeader({ label }: { label: string }) {
  return (
    <tr className="bg-muted/40">
      <td className={`${OPS_TD_CLASS} font-bold uppercase tracking-[0.06em] text-foreground`}>
        {label}
      </td>
      <td className={OPS_TD_NUM_CLASS} />
    </tr>
  );
}

export default async function OpsBalanceSheetPage() {
  const { profile } = await requireOpsUser();

  if (!canAccessOpsHref(profile.role, "/ops/finance/balance-sheet")) {
    notFound();
  }

  const balanceSheet = await fetchOpsBalanceSheet();

  return (
    <div className="w-full max-w-none space-y-6">
      <OpsPageHeader
        eyebrow="General Ledger"
        title="Balance Sheet"
        description="Assets, liabilities, and equity since the ledger went live. Current Year Earnings is computed from the Profit and Loss statement — revenue and expense accounts are not closed into equity until period close (a later phase)."
        actions={
          <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/finance/profit-and-loss">
            <Scale className="size-4" aria-hidden="true" />
            Profit and loss
          </Link>
        }
      />

      <div
        className={`flex items-center gap-2 rounded-md border px-4 py-3 text-sm font-semibold ${
          balanceSheet.balanced
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-red-200 bg-red-50 text-red-700"
        }`}
        role="status"
      >
        {balanceSheet.balanced ? (
          <CheckCircle2 className="size-4" aria-hidden="true" />
        ) : (
          <TriangleAlert className="size-4" aria-hidden="true" />
        )}
        {balanceSheet.balanced
          ? `Balanced — assets ${formatZmw(balanceSheet.totalAssets)} = liabilities + equity ${formatZmw(
              balanceSheet.totalLiabilities + balanceSheet.totalEquity,
            )}`
          : `Out of balance — assets ${formatZmw(balanceSheet.totalAssets)} vs liabilities + equity ${formatZmw(
              balanceSheet.totalLiabilities + balanceSheet.totalEquity,
            )}`}
      </div>

      {balanceSheet.hasActivity ? (
        <OpsTableShell>
          <table className={`${OPS_TABLE_CLASS} min-w-[520px]`}>
            <caption className="sr-only">Balance sheet by account.</caption>
            <thead className={OPS_THEAD_CLASS}>
              <tr>
                <th className={OPS_TH_CLASS} scope="col">Account</th>
                <th className={OPS_TH_NUM_CLASS} scope="col">Amount</th>
              </tr>
            </thead>
            <tbody>
              <SectionHeader label="Assets" />
              <LineRows lines={balanceSheet.assets} />
              <tr className="border-t border-border bg-muted/20 font-bold">
                <td className={OPS_TD_CLASS}>Total assets</td>
                <td className={`${OPS_TD_NUM_CLASS} text-foreground`}>
                  {formatZmw(balanceSheet.totalAssets)}
                </td>
              </tr>

              <SectionHeader label="Liabilities" />
              <LineRows lines={balanceSheet.liabilities} />
              <tr className="border-t border-border bg-muted/20 font-bold">
                <td className={OPS_TD_CLASS}>Total liabilities</td>
                <td className={`${OPS_TD_NUM_CLASS} text-foreground`}>
                  {formatZmw(balanceSheet.totalLiabilities)}
                </td>
              </tr>

              <SectionHeader label="Equity" />
              <LineRows lines={balanceSheet.equity} />
              <tr className={OPS_TR_CLASS}>
                <td className={`${OPS_TD_CLASS} text-muted-foreground`}>
                  Current Year Earnings (computed)
                </td>
                <td className={`${OPS_TD_NUM_CLASS} text-foreground`}>
                  {formatZmw(balanceSheet.currentYearEarnings)}
                </td>
              </tr>
              <tr className="border-t-2 border-border bg-muted/40 font-bold">
                <td className={OPS_TD_CLASS}>Total equity</td>
                <td className={`${OPS_TD_NUM_CLASS} text-foreground`}>
                  {formatZmw(balanceSheet.totalEquity)}
                </td>
              </tr>
            </tbody>
          </table>
        </OpsTableShell>
      ) : (
        <OpsEmptyState
          icon={Scale}
          title="No balance sheet activity yet"
          description="Asset, liability, and equity balances appear here as journals post to the ledger."
          actions={[{ href: "/ops/finance/journal", label: "Open journal" }]}
        />
      )}
    </div>
  );
}
