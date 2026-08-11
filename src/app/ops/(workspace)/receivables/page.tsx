import { AlertTriangle, Banknote, Clock3, Landmark, Receipt, Wallet } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OpsDashboardPanel } from "@/components/ops/OpsDashboardPanel";
import { OpsEmptyState } from "@/components/ops/OpsEmptyState";
import { OpsKpiCard } from "@/components/ops/OpsKpiCard";
import { OpsPageHeader } from "@/components/ops/OpsPageHeader";
import { OpsRealtimeRefresh } from "@/components/ops/OpsRealtimeRefresh";
import { OpsTableShell } from "@/components/ops/OpsTableShell";
import { requireOpsUser } from "@/lib/ops/auth";
import { formatOpsDate as formatDate } from "@/lib/ops/format";
import { fetchOpsModuleAccessOverrides } from "@/lib/ops/module-access";
import { canAccessOpsHref } from "@/lib/ops/permissions";
import {
  fetchOpsReceivables,
  type OpsReceivableRow,
  type OpsReceivablesSummary,
} from "@/lib/ops/receivables";
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

/**
 * Receivables — what clients owe.
 *
 * Reads entirely from `summariseReceivables`, which derives every figure from
 * invoices and their receipts (decision D6). There is no receivables table to
 * populate and nothing to keep in step: an invoice IS a receivable the moment
 * it exists.
 *
 * Laid out to mirror the Payables page so Finance learns one shape rather than
 * two — position first, then ageing, then who to call, then the detail.
 */

function bucketTone(bucket: string) {
  if (bucket === "current") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200";
  }
  if (bucket === "due_soon") {
    return "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200";
  }
  return "border-red-200 bg-red-50 text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200";
}

function settlementLabel(row: OpsReceivableRow) {
  if (row.settlement === "part_paid") {
    return `Part paid — ${formatZmw(row.received)} received`;
  }
  return "Awaiting payment";
}

function dueLabel(row: OpsReceivableRow) {
  if (row.days_overdue === null) {
    // No customer means no terms means no due date. Said plainly rather than
    // rendered as "current", which would read as a judgement nobody made.
    return "No due date";
  }
  if (row.days_overdue > 0) {
    return `${row.days_overdue} days overdue`;
  }
  if (row.days_overdue === 0) {
    return "Due today";
  }
  return `Due in ${Math.abs(row.days_overdue)} days`;
}

function AgeingStrip({ summary }: { summary: OpsReceivablesSummary }) {
  return (
    <OpsDashboardPanel
      eyebrow="Receivables ageing"
      title="By due date, not by age"
    >
      <p className="mb-3 text-sm text-muted-foreground">
        Measured against each invoice&rsquo;s agreed payment terms. An invoice is only late
        once its own due date has passed.
      </p>
      <dl className="grid gap-3 min-[520px]:grid-cols-2 xl:grid-cols-5">
        {summary.buckets.map((bucket) => (
          <div
            className={`rounded-md border px-3 py-2 ${bucketTone(bucket.bucket)}`}
            key={bucket.bucket}
          >
            <dt className="text-xs font-semibold uppercase tracking-[0.12em]">
              {bucket.label}
            </dt>
            <dd className="mt-1 font-heading text-lg font-bold">{formatZmw(bucket.amount)}</dd>
            <dd className="text-xs opacity-80">
              {bucket.count} invoice{bucket.count === 1 ? "" : "s"}
            </dd>
          </div>
        ))}
      </dl>
    </OpsDashboardPanel>
  );
}

export default async function OpsReceivablesPage() {
  const { profile } = await requireOpsUser();

  if (!canAccessOpsHref(profile.role, "/ops/receivables", await fetchOpsModuleAccessOverrides())) {
    notFound();
  }

  const summary = await fetchOpsReceivables();

  return (
    <div className="w-full max-w-none space-y-6">
      <OpsRealtimeRefresh tables={["invoices", "invoice_receipts"]} />
      <OpsPageHeader
        eyebrow="Finance and Accounts"
        title="Receivables"
        description="What clients owe Pymble: outstanding invoices, ageing against agreed terms, and who to chase."
        actions={
          <>
            <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/invoices">
              <Receipt className="size-4" aria-hidden="true" />
              Invoice register
            </Link>
            <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/customers">
              <Landmark className="size-4" aria-hidden="true" />
              Customers
            </Link>
          </>
        }
      />

      <section className="grid gap-4 min-[520px]:grid-cols-2 xl:grid-cols-4">
        <OpsKpiCard
          href="#outstanding-invoices"
          icon={Wallet}
          label="Outstanding"
          hint="Sent and unsettled"
          value={formatZmw(summary.total_outstanding)}
        />
        <OpsKpiCard
          href="#debtors"
          icon={AlertTriangle}
          label="Overdue"
          hint="Past its due date"
          tone={summary.total_overdue > 0 ? "warn" : "good"}
          value={formatZmw(summary.total_overdue)}
        />
        <OpsKpiCard
          href="#outstanding-invoices"
          icon={Banknote}
          label="Collectable now"
          hint="Outstanding less retention"
          value={formatZmw(summary.total_collectable)}
        />
        <OpsKpiCard
          href="/ops/invoices?status=draft"
          icon={Clock3}
          label="Drafts not sent"
          hint="Not yet a receivable"
          tone={summary.draft_value > 0 ? "warn" : "default"}
          value={formatZmw(summary.draft_value)}
        />
      </section>

      <AgeingStrip summary={summary} />

      {summary.total_retention > 0 || summary.opening_balance_value > 0 ? (
        <section className="grid gap-4 xl:grid-cols-2">
          {summary.total_retention > 0 ? (
            <div className="rounded-md border border-border bg-muted/30 px-4 py-3 text-sm leading-6 text-muted-foreground">
              <p className="font-bold text-foreground">
                {formatZmw(summary.total_retention)} held as retention
              </p>
              <p className="mt-1">
                Invoiced but not collectable until release. Counted in outstanding, kept out
                of what is worth chasing — a client withholding contractual retention is not
                a late payer.
              </p>
            </div>
          ) : null}
          {summary.opening_balance_value > 0 ? (
            <div className="rounded-md border border-border bg-muted/30 px-4 py-3 text-sm leading-6 text-muted-foreground">
              <p className="font-bold text-foreground">
                {formatZmw(summary.opening_balance_value)} carried in from before the system
              </p>
              <p className="mt-1">
                Real debt, aged and chased like any other. Tracked separately so a one-off
                backlog catch-up is not read as this year&rsquo;s trading.
              </p>
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="scroll-mt-24" id="debtors">
        <OpsDashboardPanel eyebrow="Who to call" title="Debtors">
        {summary.debtors.length > 0 ? (
          <OpsTableShell>
            <table className={`${OPS_TABLE_CLASS} min-w-[640px]`}>
              <caption className="sr-only">
                Debtors by amount overdue, then by total outstanding.
              </caption>
              <thead className={OPS_THEAD_CLASS}>
                <tr>
                  <th className={OPS_TH_CLASS} scope="col">Client</th>
                  <th className={OPS_TH_NUM_CLASS} scope="col">Invoices</th>
                  <th className={OPS_TH_NUM_CLASS} scope="col">Outstanding</th>
                  <th className={OPS_TH_NUM_CLASS} scope="col">Overdue</th>
                  <th className={OPS_TH_NUM_CLASS} scope="col">Longest wait</th>
                </tr>
              </thead>
              <tbody>
                {summary.debtors.map((debtor) => (
                  <tr className={OPS_TR_CLASS} key={debtor.customer_id ?? debtor.client_name}>
                    <td className={`${OPS_TD_CLASS} font-bold text-foreground`}>
                      {debtor.client_name}
                      {debtor.customer_id ? null : (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          no customer record
                        </span>
                      )}
                    </td>
                    <td className={`${OPS_TD_NUM_CLASS} text-muted-foreground`}>
                      {debtor.invoice_count}
                    </td>
                    <td className={`${OPS_TD_NUM_CLASS} font-semibold text-foreground`}>
                      {formatZmw(debtor.outstanding)}
                    </td>
                    <td
                      className={`${OPS_TD_NUM_CLASS} font-semibold ${
                        debtor.overdue > 0 ? "text-red-700 dark:text-red-300" : "text-muted-foreground"
                      }`}
                    >
                      {formatZmw(debtor.overdue)}
                    </td>
                    <td className={`${OPS_TD_NUM_CLASS} text-muted-foreground`}>
                      {debtor.oldest_overdue_days === null
                        ? "—"
                        : `${debtor.oldest_overdue_days} days`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </OpsTableShell>
        ) : (
          <OpsEmptyState
            icon={Wallet}
            title="Nothing outstanding"
            description="No sent invoice is waiting to be paid. Raise one from the invoice register when there is work to bill."
            actions={[{ href: "/ops/invoices", label: "Invoice register" }]}
          />
          )}
        </OpsDashboardPanel>
      </div>

      {summary.rows.length > 0 ? (
        <div className="scroll-mt-24" id="outstanding-invoices">
        <OpsDashboardPanel eyebrow="Detail" title="Outstanding invoices">
          <OpsTableShell>
            <table className={`${OPS_TABLE_CLASS} min-w-[820px]`}>
              <caption className="sr-only">
                Outstanding invoices, most overdue first.
              </caption>
              <thead className={OPS_THEAD_CLASS}>
                <tr>
                  <th className={OPS_TH_CLASS} scope="col">Invoice</th>
                  <th className={OPS_TH_CLASS} scope="col">Client</th>
                  <th className={OPS_TH_CLASS} scope="col">Due</th>
                  <th className={OPS_TH_NUM_CLASS} scope="col">Invoiced</th>
                  <th className={OPS_TH_NUM_CLASS} scope="col">Outstanding</th>
                  <th className={OPS_TH_NUM_CLASS} scope="col">Retention</th>
                </tr>
              </thead>
              <tbody>
                {summary.rows.map((row) => (
                  <tr className={OPS_TR_CLASS} key={row.invoice_id}>
                    <td className={`${OPS_TD_CLASS} font-bold text-foreground`}>
                      {row.invoice_number}
                      <span className="block text-xs font-normal text-muted-foreground">
                        {row.site_code ? `${row.site_code} · ` : ""}
                        {settlementLabel(row)}
                        {row.is_opening_balance ? " · opening balance" : ""}
                      </span>
                    </td>
                    <td className={`${OPS_TD_CLASS} text-muted-foreground`}>
                      {row.client_name}
                    </td>
                    <td className={OPS_TD_CLASS}>
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${bucketTone(row.bucket)}`}
                      >
                        {dueLabel(row)}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {row.due_date ? formatDate(row.due_date) : `Issued ${formatDate(row.issued_at)}`}
                      </span>
                    </td>
                    <td className={`${OPS_TD_NUM_CLASS} text-muted-foreground`}>
                      {formatZmw(row.total)}
                    </td>
                    <td className={`${OPS_TD_NUM_CLASS} font-semibold text-foreground`}>
                      {formatZmw(row.outstanding)}
                    </td>
                    <td className={`${OPS_TD_NUM_CLASS} text-muted-foreground`}>
                      {row.retention > 0 ? formatZmw(row.retention) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </OpsTableShell>
        </OpsDashboardPanel>
        </div>
      ) : null}
    </div>
  );
}
