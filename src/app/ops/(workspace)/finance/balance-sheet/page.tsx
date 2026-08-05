import { CheckCircle2, Filter, Scale, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OpsEmptyState } from "@/components/ops/OpsEmptyState";
import { OpsPageHeader } from "@/components/ops/OpsPageHeader";
import { OpsTableShell } from "@/components/ops/OpsTableShell";
import { fetchOpsModuleAccessOverrides } from "@/lib/ops/module-access";
import { requireOpsUser } from "@/lib/ops/auth";
import { fetchOpsBalanceSheet } from "@/lib/ops/gl";
import { canAccessOpsHref } from "@/lib/ops/permissions";
import {
  firstParam,
  formatZmw,
  OPS_INPUT_CLASS,
  OPS_LABEL_CLASS,
  OPS_SECONDARY_BUTTON_CLASS,
  OPS_TABLE_CLASS,
  OPS_TD_CLASS,
  OPS_TD_NUM_CLASS,
  OPS_TH_CLASS,
  OPS_TH_NUM_CLASS,
  OPS_THEAD_CLASS,
  OPS_TR_CLASS,
  type OpsSearchParams,
} from "@/lib/ops/ui";

export const dynamic = "force-dynamic";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function LineRows({ lines }: { lines: { code: string; name: string; amount: number }[] }) {
  return (
    <>
      {lines.map((line) => (
        <tr className={OPS_TR_CLASS} key={line.code}>
          <td className={`${OPS_TD_CLASS} text-muted-foreground`}>
            <Link
              className="hover:text-primary hover:underline"
              href={`/ops/finance/journal?account=${line.code}`}
              title={`Open journal entries touching ${line.code}`}
            >
              <span className="font-mono text-xs">{line.code}</span> {line.name}
            </Link>
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

type PageProps = { searchParams?: Promise<OpsSearchParams> };

export default async function OpsBalanceSheetPage({ searchParams }: PageProps) {
  const [params, { profile }] = await Promise.all([
    searchParams ?? Promise.resolve({} as OpsSearchParams),
    requireOpsUser(),
  ]);

  if (!canAccessOpsHref(profile.role, "/ops/finance/balance-sheet", await fetchOpsModuleAccessOverrides())) {
    notFound();
  }

  const rawAsAt = firstParam(params.as_at) ?? "";
  const asAt = DATE_PATTERN.test(rawAsAt) ? rawAsAt : null;

  const balanceSheet = await fetchOpsBalanceSheet(asAt);

  return (
    <div className="w-full max-w-none space-y-6">
      <OpsPageHeader
        eyebrow="General Ledger"
        title="Balance Sheet"
        description={
          asAt
            ? `Assets, liabilities, and equity as at ${asAt}. Click any account line to open its journal entries.`
            : "Assets, liabilities, and equity since the ledger went live. Current Year Earnings is computed from the Profit and Loss statement — revenue and expense accounts are not closed into equity until period close (a later phase)."
        }
        actions={
          <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/finance/profit-and-loss">
            <Scale className="size-4" aria-hidden="true" />
            Profit and loss
          </Link>
        }
      />

      <form className="rounded-lg border border-border bg-card p-4 shadow-sm" method="get">
        <div className="grid gap-3 md:grid-cols-2 xl:max-w-xl">
          <label className={OPS_LABEL_CLASS}>
            As at
            <input className={OPS_INPUT_CLASS} defaultValue={asAt ?? ""} name="as_at" type="date" />
          </label>
          <div className="flex items-end gap-2">
            <button className={OPS_SECONDARY_BUTTON_CLASS} type="submit">
              <Filter className="size-4" aria-hidden="true" />
              Apply date
            </button>
            {asAt ? (
              <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/finance/balance-sheet">
                Today
              </Link>
            ) : null}
          </div>
        </div>
      </form>

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
