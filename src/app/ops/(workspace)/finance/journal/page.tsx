import { BookOpen, Filter, ScrollText } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OpsEmptyState } from "@/components/ops/OpsEmptyState";
import { OpsPageHeader } from "@/components/ops/OpsPageHeader";
import { OpsTableShell } from "@/components/ops/OpsTableShell";
import { fetchOpsModuleAccessOverrides } from "@/lib/ops/module-access";
import { requireOpsUser } from "@/lib/ops/auth";
import { fetchOpsJournalEntries } from "@/lib/ops/gl";
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
import { formatOpsDate } from "@/lib/ops/format";

const formatDate = (value: string | null | undefined) => formatOpsDate(value, "—");

export const dynamic = "force-dynamic";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ACCOUNT_CODE_PATTERN = /^[0-9]{3,6}$/;

// Matches the sourceTable values postOpsJournal writes (see gl-posting.ts).
const SOURCE_OPTIONS = [
  { value: "", label: "All sources" },
  { value: "invoices", label: "Invoices" },
  { value: "payment_requests", label: "Payment requests" },
  { value: "payroll_runs", label: "Payroll" },
];

function formatEvent(value: string | null) {
  return value ? value.replace(/_/g, " ") : "manual";
}

type PageProps = { searchParams?: Promise<OpsSearchParams> };

export default async function OpsJournalPage({ searchParams }: PageProps) {
  const [params, { profile }] = await Promise.all([
    searchParams ?? Promise.resolve({} as OpsSearchParams),
    requireOpsUser(),
  ]);

  if (!canAccessOpsHref(profile.role, "/ops/finance/journal", await fetchOpsModuleAccessOverrides())) {
    notFound();
  }

  const rawAccount = (firstParam(params.account) ?? "").trim();
  const rawSource = firstParam(params.source) ?? "";
  const rawFrom = firstParam(params.from) ?? "";
  const rawTo = firstParam(params.to) ?? "";
  const accountCode = ACCOUNT_CODE_PATTERN.test(rawAccount) ? rawAccount : null;
  const sourceTable = SOURCE_OPTIONS.some((option) => option.value === rawSource && rawSource)
    ? rawSource
    : null;
  const from = DATE_PATTERN.test(rawFrom) ? rawFrom : null;
  const to = DATE_PATTERN.test(rawTo) ? rawTo : null;
  const hasFilters = Boolean(accountCode || sourceTable || from || to);

  const entries = await fetchOpsJournalEntries(50, { accountCode, sourceTable, from, to });

  return (
    <div className="w-full max-w-none space-y-6">
      <OpsPageHeader
        eyebrow="General Ledger"
        title="Journal"
        description="The double-entry record. Every posted entry balances — total debits equal total credits — and is immutable once posted."
        actions={
          <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/finance/trial-balance">
            <BookOpen className="size-4" aria-hidden="true" />
            Trial balance
          </Link>
        }
      />

      <form
        className="rounded-lg border border-border bg-card p-4 shadow-sm"
        method="get"
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label className={OPS_LABEL_CLASS}>
            Account code
            <input
              className={OPS_INPUT_CLASS}
              defaultValue={accountCode ?? ""}
              inputMode="numeric"
              name="account"
              placeholder="e.g. 4010"
            />
          </label>
          <label className={OPS_LABEL_CLASS}>
            Source
            <select className={OPS_INPUT_CLASS} defaultValue={sourceTable ?? ""} name="source">
              {SOURCE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className={OPS_LABEL_CLASS}>
            From
            <input className={OPS_INPUT_CLASS} defaultValue={from ?? ""} name="from" type="date" />
          </label>
          <label className={OPS_LABEL_CLASS}>
            To
            <input className={OPS_INPUT_CLASS} defaultValue={to ?? ""} name="to" type="date" />
          </label>
          <div className="flex items-end gap-2">
            <button className={OPS_SECONDARY_BUTTON_CLASS} type="submit">
              <Filter className="size-4" aria-hidden="true" />
              Filter
            </button>
            {hasFilters ? (
              <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/finance/journal">
                Clear
              </Link>
            ) : null}
          </div>
        </div>
        {hasFilters ? (
          <p className="mt-3 text-xs font-semibold text-muted-foreground">
            Showing up to 50 posted entries
            {accountCode ? ` touching account ${accountCode}` : ""}
            {sourceTable ? ` from ${sourceTable.replace(/_/g, " ")}` : ""}
            {from ? ` since ${from}` : ""}
            {to ? ` until ${to}` : ""}.
          </p>
        ) : null}
      </form>

      {entries.length > 0 ? (
        <div className="space-y-4">
          {entries.map((entry) => (
            <section
              key={entry.id}
              className="rounded-lg border border-border border-l-4 border-l-primary bg-card"
            >
              <div className="flex flex-col gap-2 border-b border-border p-4 min-[520px]:flex-row min-[520px]:items-start min-[520px]:justify-between">
                <div className="min-w-0">
                  <p className="font-mono text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    {entry.entry_number}
                  </p>
                  <h2 className="mt-1 font-heading text-base font-bold text-foreground">
                    {entry.memo || "Journal entry"}
                  </h2>
                </div>
                <div className="shrink-0 text-left min-[520px]:text-right">
                  <p className="text-sm font-bold text-foreground">{formatDate(entry.entry_date)}</p>
                  <p className="mt-0.5 text-xs capitalize text-muted-foreground">
                    {formatEvent(entry.source_event)}
                  </p>
                </div>
              </div>
              <OpsTableShell>
                <table className={`${OPS_TABLE_CLASS} min-w-[560px]`}>
                  <caption className="sr-only">Journal lines for {entry.entry_number}.</caption>
                  <thead className={OPS_THEAD_CLASS}>
                    <tr>
                      <th className={OPS_TH_CLASS} scope="col">Account</th>
                      <th className={OPS_TH_CLASS} scope="col">Description</th>
                      <th className={OPS_TH_NUM_CLASS} scope="col">Debit</th>
                      <th className={OPS_TH_NUM_CLASS} scope="col">Credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entry.lines.map((line) => (
                      <tr className={OPS_TR_CLASS} key={`${entry.id}-${line.line_number}`}>
                        <td className={OPS_TD_CLASS}>
                          <span className="font-mono text-xs text-muted-foreground">
                            {line.account_code}
                          </span>{" "}
                          <span className="font-semibold text-foreground">{line.account_name}</span>
                        </td>
                        <td className={`${OPS_TD_CLASS} text-muted-foreground`}>
                          {line.description || "—"}
                        </td>
                        <td className={`${OPS_TD_NUM_CLASS} text-foreground`}>
                          {line.debit !== 0 ? formatZmw(line.debit) : "—"}
                        </td>
                        <td className={`${OPS_TD_NUM_CLASS} text-foreground`}>
                          {line.credit !== 0 ? formatZmw(line.credit) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border bg-muted/40 font-bold">
                      <td className={OPS_TD_CLASS} colSpan={2}>
                        Total
                      </td>
                      <td className={`${OPS_TD_NUM_CLASS} text-foreground`}>
                        {formatZmw(entry.total)}
                      </td>
                      <td className={`${OPS_TD_NUM_CLASS} text-foreground`}>
                        {formatZmw(entry.total)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </OpsTableShell>
            </section>
          ))}
        </div>
      ) : (
        <OpsEmptyState
          icon={ScrollText}
          title="No journal entries yet"
          description="Posted journals appear here. Send or pay an invoice and the matching double-entry will be recorded automatically."
          actions={[{ href: "/ops/invoices", label: "Open invoices" }]}
        />
      )}
    </div>
  );
}
