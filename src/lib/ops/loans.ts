import { outstandingLoanBalance, type OpsLoanRateBasis } from "@/lib/ops/loan-schedule";
import { getOpsFinanceTodayIso } from "@/lib/ops/finance-reporting";
import { fanoutToOpsRoles } from "@/lib/ops/notification-fanout";
import { queueOpsNotification } from "@/lib/ops/notifications";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

/**
 * The loan register — L2 of docs/pymble-ops-loans-design-2026-08.md.
 *
 * Every figure here is derived from the facility and its repayments. Nothing
 * about the debt position is stored twice, the same discipline as receivables
 * (decision D6): a stored balance and a list of repayments are two records of
 * one fact, and the stored one is always the one that goes stale.
 */

export type OpsLoanStatus =
  | "draft"
  | "active"
  | "settled"
  | "written_off"
  | "cancelled";

export type OpsLoanRepayment = {
  due_date: string;
  fees: number;
  id: string;
  instalment_number: number;
  interest_portion: number;
  paid_on: string | null;
  principal_portion: number;
  reference: string;
  status: "scheduled" | "paid" | "missed" | "waived";
  total_amount: number;
};

export type OpsLoan = {
  archived_at: string | null;
  currency_code: string;
  drawdown_date: string | null;
  first_payment_date: string | null;
  id: string;
  interest_rate: number;
  kind: string;
  loan_number: string;
  principal: number;
  provider_id: string;
  provider_kind: string;
  provider_name: string;
  purpose: string;
  rate_basis: OpsLoanRateBasis;
  reference: string;
  repayment_frequency: string;
  security_notes: string;
  status: OpsLoanStatus;
  term_months: number;
};

export type OpsLoanPosition = OpsLoan & {
  /** principal − principal actually repaid. Never the total paid. */
  outstanding: number;
  /** Principal cleared so far, as a percentage. Null when nothing is owed. */
  repaid_percent: number | null;
  repayments: OpsLoanRepayment[];
  /** The next instalment falling due, or null when none remain. */
  next_due: OpsLoanRepayment | null;
  /** Scheduled instalments already past their date and still unpaid. */
  arrears_count: number;
  arrears_value: number;
  /** Interest charged across the whole schedule. */
  scheduled_interest: number;
  /** Interest on instalments actually paid — what has hit the P&L. */
  interest_paid: number;
};

export type OpsLoanRegister = {
  loans: OpsLoanPosition[];
  /** Total still owed across every live facility. */
  total_outstanding: number;
  /** What the company originally borrowed, across live facilities. */
  total_principal: number;
  /** Cash due on debt service in the next 30 days. */
  due_next_30_days: number;
  /** Instalments past due and unpaid — the number that needs acting on. */
  total_arrears: number;
  arrears_count: number;
  /** Exposure per lender, worst first. */
  by_provider: Array<{
    kind: string;
    loan_count: number;
    outstanding: number;
    provider_id: string;
    provider_name: string;
  }>;
};

function toNumber(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function addDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Statuses where the facility is closed and no longer owes anything. */
const DEAD_LOAN_STATUSES = new Set(["settled", "cancelled", "written_off"]);

export function summariseLoanRegister(
  loans: OpsLoan[],
  repaymentsByLoan: Map<string, OpsLoanRepayment[]>,
  today = getOpsFinanceTodayIso(),
): OpsLoanRegister {
  const horizon = addDays(today, 30);
  const positions: OpsLoanPosition[] = [];
  const byProvider = new Map<string, OpsLoanRegister["by_provider"][number]>();

  let totalOutstanding = 0;
  let totalPrincipal = 0;
  let dueNext30 = 0;
  let totalArrears = 0;
  let arrearsCount = 0;

  for (const loan of loans) {
    const repayments = repaymentsByLoan.get(loan.id) ?? [];
    const outstanding = outstandingLoanBalance(loan.principal, repayments);
    const live = !DEAD_LOAN_STATUSES.has(loan.status);

    // Unpaid, and the date has passed. `waived` is excluded deliberately: a
    // lender who has forgiven an instalment is not owed it.
    const arrears = repayments.filter(
      (repayment) =>
        (repayment.status === "scheduled" || repayment.status === "missed") &&
        repayment.due_date < today,
    );

    const upcoming = repayments
      .filter((repayment) => repayment.status === "scheduled" && repayment.due_date >= today)
      .sort((a, b) => a.due_date.localeCompare(b.due_date));

    const loanArrearsValue = roundMoney(
      arrears.reduce((sum, repayment) => sum + repayment.total_amount, 0),
    );

    positions.push({
      ...loan,
      arrears_count: arrears.length,
      arrears_value: loanArrearsValue,
      interest_paid: roundMoney(
        repayments
          .filter((repayment) => repayment.status === "paid")
          .reduce((sum, repayment) => sum + repayment.interest_portion, 0),
      ),
      next_due: upcoming[0] ?? null,
      outstanding,
      repaid_percent:
        loan.principal > 0
          ? Math.round(((loan.principal - outstanding) / loan.principal) * 1000) / 10
          : null,
      repayments,
      scheduled_interest: roundMoney(
        repayments.reduce((sum, repayment) => sum + repayment.interest_portion, 0),
      ),
    });

    if (!live) {
      continue;
    }

    totalOutstanding = roundMoney(totalOutstanding + outstanding);
    totalPrincipal = roundMoney(totalPrincipal + loan.principal);
    totalArrears = roundMoney(totalArrears + loanArrearsValue);
    arrearsCount += arrears.length;

    for (const repayment of repayments) {
      if (
        repayment.status === "scheduled" &&
        repayment.due_date >= today &&
        repayment.due_date <= horizon
      ) {
        dueNext30 = roundMoney(dueNext30 + repayment.total_amount);
      }
    }

    const entry =
      byProvider.get(loan.provider_id) ??
      {
        kind: loan.provider_kind,
        loan_count: 0,
        outstanding: 0,
        provider_id: loan.provider_id,
        provider_name: loan.provider_name,
      };
    entry.loan_count += 1;
    entry.outstanding = roundMoney(entry.outstanding + outstanding);
    byProvider.set(loan.provider_id, entry);
  }

  // Arrears first, then largest debt — this list is read to decide what needs
  // attention, and a missed instalment outranks a big but current facility.
  positions.sort((a, b) => {
    if (a.arrears_value !== b.arrears_value) return b.arrears_value - a.arrears_value;
    return b.outstanding - a.outstanding;
  });

  return {
    arrears_count: arrearsCount,
    by_provider: [...byProvider.values()].sort((a, b) => b.outstanding - a.outstanding),
    due_next_30_days: dueNext30,
    loans: positions,
    total_arrears: totalArrears,
    total_outstanding: totalOutstanding,
    total_principal: totalPrincipal,
  };
}

type RawLoan = {
  archived_at: string | null;
  currency_code: string;
  drawdown_date: string | null;
  first_payment_date: string | null;
  id: string;
  interest_rate: number | string;
  kind: string;
  loan_number: string;
  principal: number | string;
  provider_id: string;
  purpose: string;
  rate_basis: OpsLoanRateBasis;
  reference: string;
  repayment_frequency: string;
  security_notes: string;
  status: OpsLoanStatus;
  term_months: number;
  provider: { name: string; kind: string } | { name: string; kind: string }[] | null;
};

export async function fetchOpsLoanRegister(
  today = getOpsFinanceTodayIso(),
): Promise<OpsLoanRegister> {
  const supabase = getOpsSupabaseServiceClient();

  const [loanResult, repaymentResult] = await Promise.all([
    supabase
      .from("loans")
      .select(
        "id, loan_number, provider_id, reference, purpose, kind, principal, currency_code, drawdown_date, interest_rate, rate_basis, term_months, repayment_frequency, first_payment_date, status, security_notes, archived_at, provider:loan_providers!loans_provider_id_fkey(name, kind)",
      )
      .is("archived_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("loan_repayments")
      .select(
        "id, loan_id, instalment_number, due_date, paid_on, reference, total_amount, principal_portion, interest_portion, fees, status",
      )
      .order("instalment_number", { ascending: true }),
  ]);

  if (loanResult.error) {
    throw loanResult.error;
  }
  if (repaymentResult.error) {
    throw repaymentResult.error;
  }

  const repaymentsByLoan = new Map<string, OpsLoanRepayment[]>();
  for (const row of (repaymentResult.data ?? []) as Array<
    Record<string, unknown> & { loan_id: string }
  >) {
    const list = repaymentsByLoan.get(row.loan_id) ?? [];
    list.push({
      due_date: row.due_date as string,
      fees: toNumber(row.fees as number),
      id: row.id as string,
      instalment_number: row.instalment_number as number,
      interest_portion: toNumber(row.interest_portion as number),
      paid_on: (row.paid_on as string | null) ?? null,
      principal_portion: toNumber(row.principal_portion as number),
      reference: (row.reference as string) ?? "",
      status: row.status as OpsLoanRepayment["status"],
      total_amount: toNumber(row.total_amount as number),
    });
    repaymentsByLoan.set(row.loan_id, list);
  }

  const loans = ((loanResult.data ?? []) as unknown as RawLoan[]).map((row) => {
    const provider = Array.isArray(row.provider) ? (row.provider[0] ?? null) : row.provider;
    return {
      archived_at: row.archived_at,
      currency_code: row.currency_code,
      drawdown_date: row.drawdown_date,
      first_payment_date: row.first_payment_date,
      id: row.id,
      interest_rate: toNumber(row.interest_rate),
      kind: row.kind,
      loan_number: row.loan_number,
      principal: toNumber(row.principal),
      provider_id: row.provider_id,
      provider_kind: provider?.kind ?? "other",
      provider_name: provider?.name ?? "Lender unavailable",
      purpose: row.purpose,
      rate_basis: row.rate_basis,
      reference: row.reference,
      repayment_frequency: row.repayment_frequency,
      security_notes: row.security_notes,
      status: row.status,
      term_months: row.term_months,
    } satisfies OpsLoan;
  });

  return summariseLoanRegister(loans, repaymentsByLoan, today);
}

export async function fetchOpsLoanProviderOptions() {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("loan_providers")
    .select("id, name, kind")
    .eq("is_active", true)
    .order("name");

  if (error) {
    throw error;
  }

  return (data ?? []) as Array<{ id: string; name: string; kind: string }>;
}

// ---------------------------------------------------------------------------
// Arrears sweep (L5)
// ---------------------------------------------------------------------------

/**
 * Mark overdue instalments as missed, and tell Finance.
 *
 * A missed loan repayment is the one thing on this module nobody discovers by
 * opening a page — it happens on a date, in silence, and the consequence
 * (penalty interest, a default notice) lands weeks later. So it is swept daily
 * alongside the other escalations rather than left to be noticed.
 *
 * `missed` rather than deleted or auto-paid: the instalment is still owed, it
 * still counts in arrears, and the status records that the date went by. Only
 * an ACTIVE facility is swept — a draft has not been drawn down, and a settled
 * or written-off one is closed.
 */
export async function sweepOpsLoanArrears(now = new Date()): Promise<{
  arrearsValue: number;
  facilitiesAffected: number;
  markedMissed: number;
  notificationsQueued: number;
}> {
  const supabase = getOpsSupabaseServiceClient();
  const today = getOpsFinanceTodayIso(now);

  const { data: overdue, error } = await supabase
    .from("loan_repayments")
    .select(
      "id, loan_id, instalment_number, due_date, total_amount, loan:loans!loan_repayments_loan_id_fkey(loan_number, status, provider:loan_providers!loans_provider_id_fkey(name))",
    )
    .eq("status", "scheduled")
    .lt("due_date", today);

  if (error) {
    throw error;
  }

  type Row = {
    id: string;
    loan_id: string;
    instalment_number: number;
    due_date: string;
    total_amount: number | string;
    loan:
      | { loan_number: string; status: string; provider: { name: string } | { name: string }[] | null }
      | Array<{ loan_number: string; status: string; provider: { name: string } | { name: string }[] | null }>
      | null;
  };

  const rows = ((overdue ?? []) as unknown as Row[]).filter((row) => {
    const loan = Array.isArray(row.loan) ? row.loan[0] : row.loan;
    return loan?.status === "active";
  });

  if (rows.length === 0) {
    return { arrearsValue: 0, facilitiesAffected: 0, markedMissed: 0, notificationsQueued: 0 };
  }

  const { error: markError } = await supabase
    .from("loan_repayments")
    .update({ status: "missed" })
    .in(
      "id",
      rows.map((row) => row.id),
    )
    .eq("status", "scheduled");

  if (markError) {
    throw markError;
  }

  // One notice per facility, not per instalment. Three missed months on one
  // loan is a single conversation with the bank, and three separate alerts is
  // how people learn to ignore them.
  const byLoan = new Map<string, { count: number; loanNumber: string; provider: string; value: number }>();

  for (const row of rows) {
    const loan = Array.isArray(row.loan) ? row.loan[0] : row.loan;
    const provider = Array.isArray(loan?.provider) ? loan?.provider[0] : loan?.provider;
    const entry =
      byLoan.get(row.loan_id) ??
      {
        count: 0,
        loanNumber: loan?.loan_number ?? "loan",
        provider: provider?.name ?? "the lender",
        value: 0,
      };
    entry.count += 1;
    entry.value = roundMoney(entry.value + toNumber(row.total_amount));
    byLoan.set(row.loan_id, entry);
  }

  const recipients = await fanoutToOpsRoles(["finance_manager", "managing_director"], {});
  let queued = 0;

  for (const [loanId, entry] of byLoan) {
    for (const recipient of recipients) {
      try {
        await queueOpsNotification({
          actionHref: "/ops/loans#loan-register",
          body: `${entry.count} instalment${entry.count === 1 ? "" : "s"} on ${entry.loanNumber} (${entry.provider}) ${entry.count === 1 ? "is" : "are"} past due, totalling ${entry.value.toFixed(2)}. Missed repayments usually carry penalty interest.`,
          // Keyed on the facility and the count, so a notice reappears when
          // another instalment slips but does not repeat every morning for the
          // same arrears — the dated-key mistake the notification audit found.
          idempotencyKey: `loan-arrears:${loanId}:${entry.count}:${recipient.id}`,
          moduleKey: "loans",
          recipientId: recipient.id,
          sourceId: loanId,
          sourceTable: "loans",
          title: `Loan in arrears: ${entry.loanNumber}`,
        });
        queued += 1;
      } catch {
        // A notification failure must not undo the arrears marking.
      }
    }
  }

  return {
    arrearsValue: roundMoney([...byLoan.values()].reduce((sum, entry) => sum + entry.value, 0)),
    facilitiesAffected: byLoan.size,
    markedMissed: rows.length,
    notificationsQueued: queued,
  };
}
