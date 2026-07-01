import { CheckCircle2, ScrollText, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OpsEmptyState } from "@/components/ops/OpsEmptyState";
import { OpsPageHeader } from "@/components/ops/OpsPageHeader";
import { OpsTableShell } from "@/components/ops/OpsTableShell";
import { requireOpsUser } from "@/lib/ops/auth";
import { opsGlAccountTypeLabel } from "@/lib/ops/chart-of-accounts";
import { fetchOpsTrialBalance } from "@/lib/ops/gl";
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

export default async function OpsTrialBalancePage() {
  const { profile } = await requireOpsUser();

  if (!canAccessOpsHref(profile.role, "/ops/finance/trial-balance")) {
    notFound();
  }

  const trialBalance = await fetchOpsTrialBalance();

  return (
    <div className="w-full max-w-none space-y-6">
      <OpsPageHeader
        eyebrow="General Ledger"
        title="Trial balance"
        description="Posted debit and credit totals per account, straight from the journal. A healthy ledger always balances — total debits equal total credits."
        actions={
          <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/finance/journal">
            <ScrollText className="size-4" aria-hidden="true" />
            Journal
          </Link>
        }
      />

      <div
        className={`flex items-center gap-2 rounded-md border px-4 py-3 text-sm font-semibold ${
          trialBalance.balanced
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-red-200 bg-red-50 text-red-700"
        }`}
        role="status"
      >
        {trialBalance.balanced ? (
          <CheckCircle2 className="size-4" aria-hidden="true" />
        ) : (
          <TriangleAlert className="size-4" aria-hidden="true" />
        )}
        {trialBalance.balanced
          ? `Balanced — debits ${formatZmw(trialBalance.totalDebit)} = credits ${formatZmw(trialBalance.totalCredit)}`
          : `Out of balance — debits ${formatZmw(trialBalance.totalDebit)} vs credits ${formatZmw(trialBalance.totalCredit)}`}
      </div>

      {trialBalance.hasActivity ? (
        <OpsTableShell>
          <table className={`${OPS_TABLE_CLASS} min-w-[640px]`}>
            <caption className="sr-only">Trial balance — debit and credit totals per account.</caption>
            <thead className={OPS_THEAD_CLASS}>
              <tr>
                <th className={OPS_TH_CLASS} scope="col">Code</th>
                <th className={OPS_TH_CLASS} scope="col">Account</th>
                <th className={OPS_TH_CLASS} scope="col">Type</th>
                <th className={OPS_TH_NUM_CLASS} scope="col">Debit</th>
                <th className={OPS_TH_NUM_CLASS} scope="col">Credit</th>
              </tr>
            </thead>
            <tbody>
              {trialBalance.rows.map((row) => (
                <tr className={OPS_TR_CLASS} key={row.account_id}>
                  <td className={`${OPS_TD_CLASS} font-mono text-xs text-muted-foreground`}>
                    {row.code}
                  </td>
                  <td className={`${OPS_TD_CLASS} font-semibold text-foreground`}>{row.name}</td>
                  <td className={`${OPS_TD_CLASS} text-xs capitalize text-muted-foreground`}>
                    {opsGlAccountTypeLabel(row.account_type)}
                  </td>
                  <td className={`${OPS_TD_NUM_CLASS} text-foreground`}>
                    {row.debit !== 0 ? formatZmw(row.debit) : "—"}
                  </td>
                  <td className={`${OPS_TD_NUM_CLASS} text-foreground`}>
                    {row.credit !== 0 ? formatZmw(row.credit) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/40 font-bold">
                <td className={OPS_TD_CLASS} colSpan={3}>
                  Total
                </td>
                <td className={`${OPS_TD_NUM_CLASS} text-foreground`}>
                  {formatZmw(trialBalance.totalDebit)}
                </td>
                <td className={`${OPS_TD_NUM_CLASS} text-foreground`}>
                  {formatZmw(trialBalance.totalCredit)}
                </td>
              </tr>
            </tfoot>
          </table>
        </OpsTableShell>
      ) : (
        <OpsEmptyState
          icon={ScrollText}
          title="No posted journals yet"
          description="The trial balance fills in as journals post — send or pay an invoice and its entry will appear here. As more events are wired into the ledger, every account's running balance shows up."
          actions={[{ href: "/ops/invoices", label: "Open invoices" }]}
        />
      )}
    </div>
  );
}
