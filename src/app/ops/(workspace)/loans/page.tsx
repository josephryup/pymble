import {
  AlertTriangle,
  Banknote,
  CalendarClock,
  Landmark,
  Pencil,
  Plus,
  TrendingDown,
} from "lucide-react";
import { notFound } from "next/navigation";
import { OpsCollapsible } from "@/components/ops/OpsCollapsible";
import { OpsConfirmSubmitButton } from "@/components/ops/OpsConfirmSubmitButton";
import { OpsDashboardPanel } from "@/components/ops/OpsDashboardPanel";
import { OpsEmptyState } from "@/components/ops/OpsEmptyState";
import { OpsKpiCard } from "@/components/ops/OpsKpiCard";
import { OpsPageHeader } from "@/components/ops/OpsPageHeader";
import { OpsTableShell } from "@/components/ops/OpsTableShell";
import { requireOpsUser } from "@/lib/ops/auth";
import { formatOpsDate as formatDate, formatOpsLabel as formatLabel } from "@/lib/ops/format";
import {
  createLoanAction,
  createLoanProviderAction,
  recordLoanDrawdownAction,
  recordLoanRepaymentAction,
  reverseLoanRepaymentAction,
  updateLoanScheduleEntryAction,
} from "@/lib/ops/loan-actions";
import {
  canManageOpsLoans,
  canRecordOpsLoanRepayment,
  canViewOpsLoans,
} from "@/lib/ops/loan-permissions";
import {
  fetchOpsLoanProviderOptions,
  fetchOpsLoanRegister,
  type OpsLoanPosition,
  type OpsLoanRepayment,
} from "@/lib/ops/loans";
import { fetchOpsModuleAccessOverrides } from "@/lib/ops/module-access";
import { canAccessOpsHref } from "@/lib/ops/permissions";
import {
  firstParam,
  formatZmw,
  noticeFromParams,
  OPS_INPUT_CLASS,
  OPS_LABEL_CLASS,
  OPS_PRIMARY_BUTTON_CLASS,
  OPS_SECONDARY_BUTTON_CLASS,
  OPS_TABLE_CLASS,
  OPS_TD_CLASS,
  OPS_TD_NUM_CLASS,
  OPS_TH_CLASS,
  OPS_TH_NUM_CLASS,
  OPS_THEAD_CLASS,
  OPS_TR_CLASS,
  opsStatusBadgeClass,
  type OpsSearchParams,
} from "@/lib/ops/ui";

export const dynamic = "force-dynamic";

type PageProps = { searchParams?: Promise<OpsSearchParams> };

/**
 * The loan register.
 *
 * A loan is not a payable, and this page is where that shows: the headline is
 * OUTSTANDING PRINCIPAL — a balance-sheet position — with debt service due
 * beside it as the cash number. The principal never appears as a cost, because
 * it is not one.
 */

function loanNotice(params: OpsSearchParams) {
  const created = noticeFromParams(params, "loan", "Loan recorded, with its schedule laid out.");
  if (created) return created;

  if (firstParam(params.created) === "provider") {
    return { message: "Lender added.", tone: "success" as const };
  }

  const updated = firstParam(params.updated);
  const messages: Record<string, string> = {
    drawn_down:
      "Drawdown posted. The cash is in the bank and the liability is on the balance sheet — no cost was recognised.",
    repaid:
      "Repayment recorded. The principal reduced the liability and only the interest and fees reached the profit and loss.",
    repayment_reversed:
      "Payment reversed. The ledger entry has been contra'd and the instalment is scheduled again.",
    schedule_amended: "Instalment amended to match the lender's schedule.",
  };

  return updated && messages[updated]
    ? { message: messages[updated], tone: "success" as const }
    : null;
}

function rateLabel(loan: OpsLoanPosition) {
  if (loan.interest_rate === 0) {
    return "Interest free";
  }
  return `${loan.interest_rate}% ${loan.rate_basis === "flat" ? "flat" : "reducing"}`;
}

/**
 * Recording an instalment as paid.
 *
 * The split is pre-filled from the schedule but stays editable, because the
 * lender's actual debit is the fact and the schedule is only a prediction. The
 * three parts must add up to what left the bank — the action refuses otherwise,
 * since a journal that does not balance would be rejected only after the
 * instalment had already been marked paid.
 */
function RepaymentForm({
  loanNumber,
  repayment,
}: {
  loanNumber: string;
  repayment: OpsLoanRepayment;
}) {
  return (
    <form
      action={recordLoanRepaymentAction}
      className="grid gap-3 border-t border-border bg-muted/20 p-3 min-[520px]:grid-cols-2 lg:grid-cols-4"
    >
      <input name="repayment_id" type="hidden" value={repayment.id} />
      <label className={OPS_LABEL_CLASS}>
        Paid on
        <input className={OPS_INPUT_CLASS} name="paid_on" required type="date" />
      </label>
      <label className={OPS_LABEL_CLASS}>
        Total paid
        <input
          className={OPS_INPUT_CLASS}
          defaultValue={repayment.total_amount}
          min="0.01"
          name="total_amount"
          required
          step="0.01"
          type="number"
        />
      </label>
      <label className={OPS_LABEL_CLASS}>
        Of which principal
        <input
          className={OPS_INPUT_CLASS}
          defaultValue={repayment.principal_portion}
          min="0"
          name="principal_portion"
          step="0.01"
          type="number"
        />
      </label>
      <label className={OPS_LABEL_CLASS}>
        Of which interest
        <input
          className={OPS_INPUT_CLASS}
          defaultValue={repayment.interest_portion}
          min="0"
          name="interest_portion"
          step="0.01"
          type="number"
        />
      </label>
      <label className={OPS_LABEL_CLASS}>
        Fees or penalties
        <input
          className={OPS_INPUT_CLASS}
          defaultValue={0}
          min="0"
          name="fees"
          step="0.01"
          type="number"
        />
      </label>
      <label className={OPS_LABEL_CLASS}>
        Bank reference
        <input className={OPS_INPUT_CLASS} name="reference" />
      </label>
      <p className="text-xs leading-5 text-muted-foreground min-[520px]:col-span-2 lg:col-span-2">
        Take these off the bank statement. Principal, interest and fees must add up to the
        total paid — only the interest and fees reach the profit and loss.
      </p>
      <div className="flex items-end min-[520px]:col-span-2 lg:col-span-4 lg:justify-end">
        <OpsConfirmSubmitButton
          className={OPS_PRIMARY_BUTTON_CLASS}
          confirmText={`Confirm — record payment on ${loanNumber}`}
        >
          <Banknote className="size-4" aria-hidden="true" />
          Record payment
        </OpsConfirmSubmitButton>
      </div>
    </form>
  );
}

/**
 * Undo a repayment keyed in error.
 *
 * The instalment goes back to `scheduled` and the journal is contra'd rather
 * than deleted — the correction belongs in the record, and an entry that
 * simply vanished would leave the bank reconciliation with an unexplained gap.
 */
function ReverseRepaymentForm({ repayment }: { repayment: OpsLoanRepayment }) {
  return (
    <form
      action={reverseLoanRepaymentAction}
      className="flex flex-wrap items-center gap-2 border-t border-dashed border-border p-3"
    >
      <input name="repayment_id" type="hidden" value={repayment.id} />
      <input
        aria-label={`Reason for reversing instalment ${repayment.instalment_number}`}
        className={`${OPS_INPUT_CLASS} w-56`}
        name="reason"
        placeholder="Reason for reversal"
        required
      />
      <OpsConfirmSubmitButton
        className="inline-flex items-center gap-1.5 rounded-md border border-red-300 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/40"
        confirmText={`Confirm — reverse instalment ${repayment.instalment_number}`}
      >
        Reverse payment
      </OpsConfirmSubmitButton>
    </form>
  );
}

/** Amend a scheduled instalment to match the lender's own schedule. */
function ScheduleEditForm({ repayment }: { repayment: OpsLoanRepayment }) {
  return (
    <form
      action={updateLoanScheduleEntryAction}
      className="grid gap-2 border-t border-dashed border-border p-3 min-[520px]:grid-cols-4"
    >
      <input name="repayment_id" type="hidden" value={repayment.id} />
      <label className={OPS_LABEL_CLASS}>
        Due date
        <input
          className={OPS_INPUT_CLASS}
          defaultValue={repayment.due_date}
          name="due_date"
          required
          type="date"
        />
      </label>
      <label className={OPS_LABEL_CLASS}>
        Principal
        <input
          className={OPS_INPUT_CLASS}
          defaultValue={repayment.principal_portion}
          min="0"
          name="principal_portion"
          step="0.01"
          type="number"
        />
      </label>
      <label className={OPS_LABEL_CLASS}>
        Interest
        <input
          className={OPS_INPUT_CLASS}
          defaultValue={repayment.interest_portion}
          min="0"
          name="interest_portion"
          step="0.01"
          type="number"
        />
      </label>
      <div className="flex items-end">
        <button className={`${OPS_SECONDARY_BUTTON_CLASS} w-full`} type="submit">
          Save
        </button>
      </div>
    </form>
  );
}

function LoanCard({
  canManage,
  canRepay,
  loan,
}: {
  canManage: boolean;
  canRepay: boolean;
  loan: OpsLoanPosition;
}) {
  const scheduled = loan.repayments.filter((repayment) => repayment.status === "scheduled");
  const paid = loan.repayments.filter((repayment) => repayment.status === "paid");
  // Earliest unpaid, arrears included — that is what actually gets paid next.
  const nextUnpaid =
    loan.repayments
      .filter((repayment) => repayment.status === "scheduled" || repayment.status === "missed")
      .sort((a, b) => a.instalment_number - b.instalment_number)[0] ?? null;

  return (
    <article className="p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-heading text-lg font-bold text-foreground">
              {loan.loan_number}
            </h3>
            <span className={opsStatusBadgeClass(loan.status)}>{formatLabel(loan.status)}</span>
            <span className="rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
              {formatLabel(loan.kind)}
            </span>
            {loan.arrears_count > 0 ? (
              <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-bold text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
                <AlertTriangle className="mr-1 inline size-3" aria-hidden="true" />
                {loan.arrears_count} instalment{loan.arrears_count === 1 ? "" : "s"} overdue
              </span>
            ) : null}
          </div>
          <p className="mt-2 font-bold text-foreground">{loan.provider_name}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {rateLabel(loan)}
            {loan.term_months > 0
              ? ` · ${loan.term_months} months ${loan.repayment_frequency}`
              : " · repayable on demand"}
            {loan.reference ? ` · ${loan.reference}` : ""}
          </p>
          {loan.purpose ? (
            <p className="mt-1 text-sm text-muted-foreground">{loan.purpose}</p>
          ) : null}
        </div>
      </div>

      <dl className="mt-4 grid gap-3 min-[520px]:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-md border border-border px-3 py-2">
          <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Borrowed
          </dt>
          <dd className="mt-1 font-bold text-foreground">{formatZmw(loan.principal)}</dd>
        </div>
        <div className="rounded-md border border-primary-blue/25 bg-primary-blue/5 px-3 py-2">
          <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Still owed
          </dt>
          <dd className="mt-1 font-bold text-foreground">{formatZmw(loan.outstanding)}</dd>
          {loan.repaid_percent !== null ? (
            <dd className="text-xs text-muted-foreground">{loan.repaid_percent}% repaid</dd>
          ) : null}
        </div>
        <div className="rounded-md border border-border px-3 py-2">
          <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Interest over the term
          </dt>
          <dd className="mt-1 font-bold text-foreground">
            {formatZmw(loan.scheduled_interest)}
          </dd>
          <dd className="text-xs text-muted-foreground">
            {formatZmw(loan.interest_paid)} charged so far
          </dd>
        </div>
        <div className="rounded-md border border-border px-3 py-2">
          <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Next payment
          </dt>
          <dd className="mt-1 font-bold text-foreground">
            {loan.next_due ? formatZmw(loan.next_due.total_amount) : "—"}
          </dd>
          <dd className="text-xs text-muted-foreground">
            {loan.next_due ? formatDate(loan.next_due.due_date) : "Nothing scheduled"}
          </dd>
        </div>
      </dl>

      {loan.security_notes ? (
        <p className="mt-3 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm leading-6 text-muted-foreground">
          <strong className="text-foreground">Security:</strong> {loan.security_notes}
        </p>
      ) : null}

      {/* Recording the terms is not the same as the money arriving. Until the
          drawdown is posted the liability is not on the balance sheet, and no
          repayment can be recorded against it. */}
      {canManage && loan.status === "draft" ? (
        <form
          action={recordLoanDrawdownAction}
          className="mt-4 grid gap-3 rounded-md border border-primary-blue/30 bg-primary-blue/5 p-3 min-[520px]:grid-cols-3"
        >
          <input name="loan_id" type="hidden" value={loan.id} />
          <div className="min-[520px]:col-span-3">
            <p className="text-sm font-bold text-foreground">Has the money arrived?</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Posting the drawdown puts {formatZmw(loan.principal)} in the bank and the same
              amount on the balance sheet as a liability. No cost is recognised — borrowing
              is not an expense.
            </p>
          </div>
          <label className={OPS_LABEL_CLASS}>
            Date received
            <input className={OPS_INPUT_CLASS} name="drawdown_date" required type="date" />
          </label>
          <div className="flex items-end min-[520px]:col-span-2">
            <OpsConfirmSubmitButton
              className={OPS_PRIMARY_BUTTON_CLASS}
              confirmText={`Confirm — ${formatZmw(loan.principal)} drawn down`}
            >
              <Banknote className="size-4" aria-hidden="true" />
              Post drawdown
            </OpsConfirmSubmitButton>
          </div>
        </form>
      ) : null}

      {loan.repayments.length > 0 ? (
        <OpsCollapsible
          className="mt-4"
          icon={CalendarClock}
          title={`Repayment schedule — ${loan.repayments.length} instalments`}
          variant="panel"
        >
          <OpsTableShell>
            <table className={`${OPS_TABLE_CLASS} min-w-[640px]`}>
              <caption className="sr-only">
                Instalments for {loan.loan_number}, with the principal and interest split.
              </caption>
              <thead className={OPS_THEAD_CLASS}>
                <tr>
                  <th className={OPS_TH_CLASS} scope="col">#</th>
                  <th className={OPS_TH_CLASS} scope="col">Due</th>
                  <th className={OPS_TH_NUM_CLASS} scope="col">Principal</th>
                  <th className={OPS_TH_NUM_CLASS} scope="col">Interest</th>
                  <th className={OPS_TH_NUM_CLASS} scope="col">Total</th>
                  <th className={OPS_TH_CLASS} scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {loan.repayments.map((repayment) => (
                  <tr className={OPS_TR_CLASS} key={repayment.id}>
                    <td className={`${OPS_TD_CLASS} text-muted-foreground`}>
                      {repayment.instalment_number}
                    </td>
                    <td className={OPS_TD_CLASS}>{formatDate(repayment.due_date)}</td>
                    <td className={`${OPS_TD_NUM_CLASS} text-foreground`}>
                      {formatZmw(repayment.principal_portion)}
                    </td>
                    {/* The only column that reaches the profit and loss. */}
                    <td className={`${OPS_TD_NUM_CLASS} text-muted-foreground`}>
                      {formatZmw(repayment.interest_portion)}
                    </td>
                    <td className={`${OPS_TD_NUM_CLASS} font-semibold text-foreground`}>
                      {formatZmw(repayment.total_amount)}
                    </td>
                    <td className={OPS_TD_CLASS}>
                      <span className={opsStatusBadgeClass(repayment.status)}>
                        {formatLabel(repayment.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </OpsTableShell>

          {/* The EARLIEST unpaid instalment, not the next one falling due —
              an overdue instalment is what gets paid next, and offering the
              future one instead would leave the arrears behind. */}
          {canRepay && loan.status === "active" && nextUnpaid ? (
            <div className="mt-4 rounded-md border border-border">
              <p className="border-b border-border px-3 py-2 text-sm font-bold text-foreground">
                Record instalment {nextUnpaid.instalment_number}, due{" "}
                {formatDate(nextUnpaid.due_date)}
              </p>
              <RepaymentForm loanNumber={loan.loan_number} repayment={nextUnpaid} />
            </div>
          ) : null}

          {canManage && paid.length > 0 ? (
            <OpsCollapsible
              className="mt-4"
              icon={AlertTriangle}
              title="Reverse a payment recorded in error"
              variant="panel"
            >
              <div className="p-3">
                <p className="mb-2 text-xs leading-5 text-muted-foreground">
                  The instalment goes back to scheduled and its ledger entry is contra&rsquo;d.
                  The original entry stays on file — a reversal is a correction, not a
                  deletion.
                </p>
                {paid.map((repayment) => (
                  <div className="rounded-md border border-border" key={repayment.id}>
                    <p className="px-3 pt-2 text-xs font-bold text-muted-foreground">
                      Instalment {repayment.instalment_number} ·{" "}
                      {formatZmw(repayment.total_amount)} paid{" "}
                      {repayment.paid_on ? formatDate(repayment.paid_on) : ""}
                    </p>
                    <ReverseRepaymentForm repayment={repayment} />
                  </div>
                ))}
              </div>
            </OpsCollapsible>
          ) : null}

          {canManage && scheduled.length > 0 ? (
            <OpsCollapsible
              className="mt-4"
              icon={Pencil}
              title="Correct the schedule against the lender's paper"
              variant="panel"
            >
              <div className="p-3">
                <p className="mb-2 text-xs leading-5 text-muted-foreground">
                  The generated schedule is a good default, not the contract. Banks round
                  differently, load an arrangement fee onto the first instalment, and shift
                  dates off weekends. Only unpaid instalments can be amended — a paid one has
                  posted a journal and needs a reversal instead.
                </p>
                {scheduled.map((repayment) => (
                  <div className="rounded-md border border-border" key={repayment.id}>
                    <p className="px-3 pt-2 text-xs font-bold text-muted-foreground">
                      Instalment {repayment.instalment_number}
                    </p>
                    <ScheduleEditForm repayment={repayment} />
                  </div>
                ))}
              </div>
            </OpsCollapsible>
          ) : null}
        </OpsCollapsible>
      ) : null}
    </article>
  );
}

export default async function OpsLoansPage({ searchParams }: PageProps) {
  const [params, auth] = await Promise.all([
    searchParams ?? Promise.resolve({} as OpsSearchParams),
    requireOpsUser(),
  ]);

  const overrides = await fetchOpsModuleAccessOverrides();

  if (
    !canAccessOpsHref(auth.profile.role, "/ops/loans", overrides) ||
    !canViewOpsLoans(auth.profile.role)
  ) {
    notFound();
  }

  const canManage = canManageOpsLoans(auth.profile.role);
  const canRepay = canRecordOpsLoanRepayment(auth.profile.role);
  const [register, providers] = await Promise.all([
    fetchOpsLoanRegister(),
    fetchOpsLoanProviderOptions(),
  ]);
  const notice = loanNotice(params);
  const error = firstParam(params.error);

  return (
    <div className="w-full max-w-none space-y-6">
      <OpsPageHeader
        eyebrow="Finance and Accounts"
        title="Loans"
        description="What Pymble owes its lenders: outstanding principal, what interest is costing, and when the next payment falls due."
      />

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200">
          {notice.message}
        </div>
      ) : null}

      <section className="grid gap-4 min-[520px]:grid-cols-2 xl:grid-cols-4">
        {/* Outstanding PRINCIPAL leads, because that is the liability. The
            principal is never a cost — only the interest is. */}
        <OpsKpiCard
          href="#loan-register"
          icon={Landmark}
          label="Outstanding debt"
          hint="Principal still owed"
          value={formatZmw(register.total_outstanding)}
        />
        <OpsKpiCard
          href="#loan-register"
          icon={Banknote}
          label="Originally borrowed"
          hint="Across live facilities"
          value={formatZmw(register.total_principal)}
        />
        <OpsKpiCard
          href="#loan-register"
          icon={CalendarClock}
          label="Due in 30 days"
          hint="Debt service, competing with payables"
          value={formatZmw(register.due_next_30_days)}
        />
        <OpsKpiCard
          href="#loan-register"
          icon={AlertTriangle}
          label="In arrears"
          hint={`${register.arrears_count} instalment${register.arrears_count === 1 ? "" : "s"} past due`}
          tone={register.total_arrears > 0 ? "warn" : "good"}
          value={formatZmw(register.total_arrears)}
        />
      </section>

      {register.by_provider.length > 0 ? (
        <OpsDashboardPanel eyebrow="Exposure" title="What we owe, by lender">
          <OpsTableShell>
            <table className={`${OPS_TABLE_CLASS} min-w-[520px]`}>
              <caption className="sr-only">Outstanding debt per lender, largest first.</caption>
              <thead className={OPS_THEAD_CLASS}>
                <tr>
                  <th className={OPS_TH_CLASS} scope="col">Lender</th>
                  <th className={OPS_TH_CLASS} scope="col">Type</th>
                  <th className={OPS_TH_NUM_CLASS} scope="col">Facilities</th>
                  <th className={OPS_TH_NUM_CLASS} scope="col">Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {register.by_provider.map((provider) => (
                  <tr className={OPS_TR_CLASS} key={provider.provider_id}>
                    <td className={`${OPS_TD_CLASS} font-bold text-foreground`}>
                      {provider.provider_name}
                    </td>
                    <td className={`${OPS_TD_CLASS} text-muted-foreground`}>
                      {formatLabel(provider.kind)}
                    </td>
                    <td className={`${OPS_TD_NUM_CLASS} text-muted-foreground`}>
                      {provider.loan_count}
                    </td>
                    <td className={`${OPS_TD_NUM_CLASS} font-semibold text-foreground`}>
                      {formatZmw(provider.outstanding)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </OpsTableShell>
        </OpsDashboardPanel>
      ) : null}

      {canManage ? (
        <OpsCollapsible icon={Plus} title="Add a lender" variant="panel">
          <form
            action={createLoanProviderAction}
            className="grid gap-4 p-5 min-[520px]:grid-cols-2 lg:grid-cols-4"
          >
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
              Lender name
              <input className={OPS_INPUT_CLASS} name="name" required />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Type
              <select className={OPS_INPUT_CLASS} defaultValue="bank" name="kind">
                <option value="bank">Bank</option>
                <option value="microfinance">Microfinance</option>
                <option value="asset_financier">Asset financier</option>
                <option value="shareholder">Shareholder / director</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className={OPS_LABEL_CLASS}>
              Contact name
              <input className={OPS_INPUT_CLASS} name="contact_name" />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Contact email
              <input className={OPS_INPUT_CLASS} name="contact_email" type="email" />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Contact phone
              <input className={OPS_INPUT_CLASS} name="contact_phone" />
            </label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
              Notes
              <input className={OPS_INPUT_CLASS} name="notes" />
            </label>
            <div className="flex items-end min-[520px]:col-span-2 lg:col-span-4 lg:justify-end">
              <button className={`${OPS_PRIMARY_BUTTON_CLASS} w-full min-[520px]:w-auto`} type="submit">
                <Plus className="size-4" aria-hidden="true" />
                Add lender
              </button>
            </div>
          </form>
        </OpsCollapsible>
      ) : null}

      {canManage && providers.length > 0 ? (
        <OpsCollapsible icon={Landmark} title="Record a loan" variant="panel">
          <div className="p-5">
            <div className="mb-4 rounded-md border border-border bg-muted/30 px-4 py-3 text-sm leading-6 text-muted-foreground">
              <p className="font-bold text-foreground">Flat or reducing balance?</p>
              <p className="mt-1">
                It is not a presentation choice. <strong>Flat</strong> charges interest on the
                original amount for the whole term; <strong>reducing balance</strong> charges
                it on what is still owed. On K500,000 at 20% over 3 years that is K300,000 of
                interest against about K167,000. Take it from the loan agreement rather than
                guessing.
              </p>
            </div>
            <form
              action={createLoanAction}
              className="grid gap-4 min-[520px]:grid-cols-2 lg:grid-cols-4"
            >
              <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
                Lender
                <select className={OPS_INPUT_CLASS} defaultValue="" name="provider_id" required>
                  <option value="" disabled>
                    Select the lender
                  </option>
                  {providers.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={OPS_LABEL_CLASS}>
                Facility type
                <select className={OPS_INPUT_CLASS} defaultValue="term_loan" name="kind">
                  <option value="term_loan">Bank term loan</option>
                  <option value="asset_finance">Asset finance / lease</option>
                  <option value="shareholder">Shareholder / director loan</option>
                </select>
              </label>
              <label className={OPS_LABEL_CLASS}>
                Agreement reference
                <input className={OPS_INPUT_CLASS} name="reference" />
              </label>
              <label className={OPS_LABEL_CLASS}>
                Amount borrowed
                <input
                  className={OPS_INPUT_CLASS}
                  min="0.01"
                  name="principal"
                  required
                  step="0.01"
                  type="number"
                />
              </label>
              <label className={OPS_LABEL_CLASS}>
                Interest rate (% a year)
                <input
                  className={OPS_INPUT_CLASS}
                  defaultValue="0"
                  min="0"
                  name="interest_rate"
                  step="0.01"
                  type="number"
                />
                <span className="mt-1 block text-xs font-normal leading-5 text-muted-foreground">
                  Leave at 0 for an interest-free director&rsquo;s loan.
                </span>
              </label>
              <label className={OPS_LABEL_CLASS}>
                Interest basis
                <select
                  className={OPS_INPUT_CLASS}
                  defaultValue="reducing_balance"
                  name="rate_basis"
                >
                  <option value="reducing_balance">Reducing balance</option>
                  <option value="flat">Flat rate</option>
                </select>
              </label>
              <label className={OPS_LABEL_CLASS}>
                Repayment frequency
                <select
                  className={OPS_INPUT_CLASS}
                  defaultValue="monthly"
                  name="repayment_frequency"
                >
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                </select>
              </label>
              <label className={OPS_LABEL_CLASS}>
                Term (months)
                <input
                  className={OPS_INPUT_CLASS}
                  defaultValue="0"
                  min="0"
                  name="term_months"
                  type="number"
                />
                <span className="mt-1 block text-xs font-normal leading-5 text-muted-foreground">
                  Leave at 0 if it is repayable on demand — there is then no schedule.
                </span>
              </label>
              <label className={OPS_LABEL_CLASS}>
                Drawdown date
                <input className={OPS_INPUT_CLASS} name="drawdown_date" type="date" />
              </label>
              <label className={OPS_LABEL_CLASS}>
                First payment date
                <input className={OPS_INPUT_CLASS} name="first_payment_date" type="date" />
              </label>
              <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
                What it funded
                <input className={OPS_INPUT_CLASS} name="purpose" />
              </label>
              <label className={`${OPS_LABEL_CLASS} lg:col-span-4`}>
                Security pledged
                <input className={OPS_INPUT_CLASS} name="security_notes" />
              </label>
              <div className="flex items-end min-[520px]:col-span-2 lg:col-span-4 lg:justify-end">
                <button className={`${OPS_PRIMARY_BUTTON_CLASS} w-full min-[520px]:w-auto`} type="submit">
                  <Landmark className="size-4" aria-hidden="true" />
                  Record loan and lay out schedule
                </button>
              </div>
            </form>
          </div>
        </OpsCollapsible>
      ) : null}

      <section
        className="scroll-mt-24 rounded-lg border border-border bg-card"
        id="loan-register"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Register
            </p>
            <h2 className="font-heading text-xl font-bold text-foreground">Facilities</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Arrears first, then largest debt.
            </p>
          </div>
          <TrendingDown className="size-6 shrink-0 text-primary-blue" aria-hidden="true" />
        </div>

        {register.loans.length > 0 ? (
          <div className="divide-y divide-border">
            {register.loans.map((loan) => (
              <LoanCard
                canManage={canManage}
                canRepay={canRepay}
                key={loan.id}
                loan={loan}
              />
            ))}
          </div>
        ) : (
          <OpsEmptyState
            icon={Landmark}
            title="No loans recorded"
            description={
              providers.length === 0
                ? "Add a lender first, then record the facility and its terms — the schedule is laid out for you."
                : "Record a facility and its terms. The repayment schedule is generated from the interest basis you choose."
            }
            actions={
              canManage
                ? [{ href: "#loan-register", label: "Use the forms above" }]
                : [{ href: "/ops/finance", label: "Back to finance", variant: "secondary" }]
            }
          />
        )}
      </section>
    </div>
  );
}
