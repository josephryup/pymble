import { BookOpen, Lock, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OpsEmptyState } from "@/components/ops/OpsEmptyState";
import { OpsPageHeader } from "@/components/ops/OpsPageHeader";
import { OpsTableShell } from "@/components/ops/OpsTableShell";
import { fetchOpsModuleAccessOverrides } from "@/lib/ops/module-access";
import { requireOpsUser } from "@/lib/ops/auth";
import {
  fetchOpsChartOfAccounts,
  summarizeOpsChartOfAccounts,
} from "@/lib/ops/chart-of-accounts";
import { canManageOpsChartOfAccounts } from "@/lib/ops/chart-of-accounts-permissions";
import { canAccessOpsHref } from "@/lib/ops/permissions";
import {
  OPS_SECONDARY_BUTTON_CLASS,
  OPS_TABLE_CLASS,
  OPS_TD_CLASS,
  OPS_TH_CLASS,
  OPS_THEAD_CLASS,
  OPS_TR_CLASS,
} from "@/lib/ops/ui";

export const dynamic = "force-dynamic";

function formatSubtype(value: string) {
  return value.replace(/_/g, " ");
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <p className="font-heading text-2xl font-black text-foreground">{value}</p>
      <p className="mt-0.5 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

export default async function OpsChartOfAccountsPage() {
  const { profile } = await requireOpsUser();

  if (!canAccessOpsHref(profile.role, "/ops/finance/accounts", await fetchOpsModuleAccessOverrides())) {
    notFound();
  }

  const groups = await fetchOpsChartOfAccounts();
  const stats = summarizeOpsChartOfAccounts(groups);
  const canManage = canManageOpsChartOfAccounts(profile.role);

  return (
    <div className="w-full max-w-none space-y-6">
      <OpsPageHeader
        eyebrow="Finance and Accounts"
        title="Chart of Accounts"
        description="The general ledger account master. Control accounts are posted only by their subledger (invoices, payments, payroll). Seeded accounts are locked; you can add your own once management controls land."
        actions={
          <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/finance">
            <BookOpen className="size-4" aria-hidden="true" />
            Finance overview
          </Link>
        }
      />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Accounts" value={stats.total} />
        <StatTile label="Postable" value={stats.postable} />
        <StatTile label="Control accounts" value={stats.control} />
        <StatTile label="Inactive" value={stats.inactive} />
      </section>

      {!canManage ? (
        <p className="rounded-md border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          You have read-only access to the chart of accounts. Restructuring the
          account tree is reserved for the Finance Manager and leadership.
        </p>
      ) : null}

      {groups.length === 0 ? (
        <OpsEmptyState
          icon={BookOpen}
          title="No accounts found"
          description="The chart of accounts has not been seeded yet. Apply the latest finance migration to load the standard construction chart."
        />
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section
              key={group.type}
              className="rounded-lg border border-border border-l-4 border-l-primary bg-card"
            >
              <div className="flex items-center justify-between gap-3 border-b border-border p-4">
                <h2 className="font-heading text-lg font-bold text-foreground">{group.label}</h2>
                <span className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  {group.accounts.length} accounts
                </span>
              </div>
              <OpsTableShell>
                <table className={`${OPS_TABLE_CLASS} min-w-[640px]`}>
                  <caption className="sr-only">{group.label} ledger accounts.</caption>
                  <thead className={OPS_THEAD_CLASS}>
                    <tr>
                      <th className={OPS_TH_CLASS} scope="col">Code</th>
                      <th className={OPS_TH_CLASS} scope="col">Account</th>
                      <th className={OPS_TH_CLASS} scope="col">Type</th>
                      <th className={OPS_TH_CLASS} scope="col">Normal</th>
                      <th className={OPS_TH_CLASS} scope="col">Flags</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.accounts.map((account) => {
                      const isHeader = !account.is_postable;
                      return (
                        <tr
                          className={`${OPS_TR_CLASS} ${isHeader ? "bg-muted/30" : ""}`}
                          key={account.id}
                        >
                          <td
                            className={`${OPS_TD_CLASS} font-mono text-xs ${
                              isHeader ? "font-bold text-foreground" : "text-muted-foreground"
                            }`}
                          >
                            {account.code}
                          </td>
                          <td className={OPS_TD_CLASS}>
                            <span
                              className={
                                isHeader
                                  ? "font-bold uppercase tracking-[0.06em] text-foreground"
                                  : "font-semibold text-foreground"
                              }
                            >
                              {account.name}
                            </span>
                            {!account.is_active ? (
                              <span className="ml-2 inline-flex rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                                Inactive
                              </span>
                            ) : null}
                          </td>
                          <td className={`${OPS_TD_CLASS} text-xs capitalize text-muted-foreground`}>
                            {formatSubtype(account.account_subtype)}
                          </td>
                          <td className={`${OPS_TD_CLASS} text-xs uppercase text-muted-foreground`}>
                            {account.normal_balance}
                          </td>
                          <td className={OPS_TD_CLASS}>
                            <span className="flex flex-wrap items-center gap-1.5">
                              {account.is_control ? (
                                <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-sky-700 dark:border-sky-900/50 dark:bg-sky-950/20 dark:text-sky-400">
                                  <ShieldCheck className="size-3" aria-hidden="true" />
                                  Control
                                </span>
                              ) : null}
                              {account.system_locked ? (
                                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
                                  <Lock className="size-3" aria-hidden="true" />
                                  System
                                </span>
                              ) : null}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </OpsTableShell>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
