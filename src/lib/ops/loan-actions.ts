"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeOpsActionErrorMessage } from "@/lib/ops/action-errors";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import { requireOpsUser } from "@/lib/ops/auth";
import { buildOpsLoanSchedule } from "@/lib/ops/loan-schedule";
import {
  canManageOpsLoans,
  canRecordOpsLoanRepayment,
} from "@/lib/ops/loan-permissions";
import {
  postLoanDrawdownJournalSafe,
  postLoanRepaymentJournalSafe,
  reverseOpsJournalSafe,
} from "@/lib/ops/gl-posting";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

const LOANS_ROUTE = "/ops/loans";

function loanError(message: string): never {
  redirect(`${LOANS_ROUTE}?error=${encodeURIComponent(safeOpsActionErrorMessage(message))}`);
}

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

const providerSchema = z.object({
  contact_email: z.string().trim().max(160).default(""),
  contact_name: z.string().trim().max(160).default(""),
  contact_phone: z.string().trim().max(60).default(""),
  kind: z.enum(["bank", "microfinance", "asset_financier", "shareholder", "other"]),
  name: z.string().trim().min(2, "Lender name is required.").max(180),
  notes: z.string().trim().max(400).default(""),
});

const loanSchema = z.object({
  drawdown_date: z.string().trim().default(""),
  first_payment_date: z.string().trim().default(""),
  interest_rate: z.coerce
    .number()
    .min(0, "Interest rate cannot be negative.")
    .max(200, "Check the interest rate — that is above 200%."),
  kind: z.enum(["term_loan", "asset_finance", "shareholder"]),
  principal: z.coerce.number().positive("Enter the amount borrowed."),
  provider_id: z.string().uuid("Choose the lender."),
  purpose: z.string().trim().max(400).default(""),
  rate_basis: z.enum(["flat", "reducing_balance"]),
  reference: z.string().trim().max(120).default(""),
  repayment_frequency: z.enum(["monthly", "quarterly"]),
  security_notes: z.string().trim().max(400).default(""),
  // Zero is valid — a director's loan repayable on demand has no schedule.
  term_months: z.coerce
    .number()
    .int("Term must be a whole number of months.")
    .min(0)
    .max(600, "Check the term — that is over fifty years."),
});

export async function createLoanProviderAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canManageOpsLoans(profile.role)) {
    loanError("Your role cannot add a lender.");
  }

  const parsed = providerSchema.safeParse({
    contact_email: field(formData, "contact_email"),
    contact_name: field(formData, "contact_name"),
    contact_phone: field(formData, "contact_phone"),
    kind: field(formData, "kind") || "bank",
    name: field(formData, "name"),
    notes: field(formData, "notes"),
  });

  if (!parsed.success) {
    loanError(parsed.error.issues[0]?.message ?? "Check the lender details.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("loan_providers")
    .insert({ ...parsed.data, created_by: profile.id })
    .select("id")
    .single<{ id: string }>();

  if (error || !data) {
    loanError(
      error?.code === "23505"
        ? "A lender with that name already exists."
        : (error?.message ?? "Could not add the lender."),
    );
  }

  await recordOpsAuditEvent({
    action: "loan_provider.created",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "loan_provider",
    metadata: { kind: parsed.data.kind, name: parsed.data.name },
    moduleKey: "loans",
    sourceId: data.id,
    sourceTable: "loan_providers",
    summary: `Added lender ${parsed.data.name}`,
  }).catch(() => null);

  revalidatePath(LOANS_ROUTE);
  redirect(`${LOANS_ROUTE}?created=provider`);
}

/**
 * Record a facility, and lay out its instalments.
 *
 * The schedule is generated here rather than derived on every read, because it
 * is a contract: the lender's own schedule is the authority, and generating it
 * once gives something to correct against their paper. The BALANCE stays
 * derived from what has actually been repaid — the schedule is the plan, the
 * repayments are the fact.
 *
 * A loan with no term gets no instalments and that is not an error. A
 * director's loan repayable on demand is a real liability; refusing to record
 * it would push it out of the system entirely.
 */
/**
 * Lays out (or re-lays) the instalments for a facility.
 *
 * Every existing row is cleared first rather than patched. Changing the
 * principal, rate or term changes every instalment after the first, and a
 * partial rewrite would leave a schedule that is half the old terms and half
 * the new — which reads as a lender's amendment rather than a correction.
 *
 * Only ever called against a draft, where no instalment can have been paid.
 */
async function replaceLoanSchedule(
  supabase: ReturnType<typeof getOpsSupabaseServiceClient>,
  loanId: string,
  terms: {
    firstPaymentDate: string;
    frequency: "monthly" | "quarterly";
    interestRate: number;
    principal: number;
    rateBasis: "flat" | "reducing_balance";
    termMonths: number;
  },
) {
  const { error: clearError } = await supabase
    .from("loan_repayments")
    .delete()
    .eq("loan_id", loanId);

  if (clearError) {
    return { error: clearError.message, schedule: null };
  }

  const schedule = buildOpsLoanSchedule({
    annualRatePercent: terms.interestRate,
    firstPaymentDate: terms.firstPaymentDate || new Date().toISOString().slice(0, 10),
    frequency: terms.frequency,
    principal: terms.principal,
    rateBasis: terms.rateBasis,
    termMonths: terms.termMonths,
  });

  if (schedule.entries.length === 0) {
    return { error: null, schedule };
  }

  const { error: scheduleError } = await supabase.from("loan_repayments").insert(
    schedule.entries.map((entry) => ({
      due_date: entry.dueDate,
      instalment_number: entry.instalment,
      interest_portion: entry.interest,
      loan_id: loanId,
      principal_portion: entry.principal,
      status: "scheduled",
      total_amount: entry.total,
    })),
  );

  return { error: scheduleError?.message ?? null, schedule };
}

export async function createLoanAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canManageOpsLoans(profile.role)) {
    loanError("Your role cannot record a loan.");
  }

  const parsed = loanSchema.safeParse({
    drawdown_date: field(formData, "drawdown_date"),
    first_payment_date: field(formData, "first_payment_date"),
    interest_rate: field(formData, "interest_rate") || "0",
    kind: field(formData, "kind") || "term_loan",
    principal: field(formData, "principal"),
    provider_id: field(formData, "provider_id"),
    purpose: field(formData, "purpose"),
    rate_basis: field(formData, "rate_basis") || "reducing_balance",
    reference: field(formData, "reference"),
    repayment_frequency: field(formData, "repayment_frequency") || "monthly",
    security_notes: field(formData, "security_notes"),
    term_months: field(formData, "term_months") || "0",
  });

  if (!parsed.success) {
    loanError(parsed.error.issues[0]?.message ?? "Check the loan details.");
  }

  if (parsed.data.term_months > 0 && !parsed.data.first_payment_date) {
    loanError("Give the first payment date so the schedule can be laid out.");
  }

  const supabase = getOpsSupabaseServiceClient();

  // Asset finance sits in its own liability account, so plant financing is
  // never mixed in with bank borrowing on the balance sheet.
  const liabilityCode = parsed.data.kind === "asset_finance" ? "2520" : "2510";
  const { data: account } = await supabase
    .from("chart_of_accounts")
    .select("id")
    .eq("code", liabilityCode)
    .maybeSingle<{ id: string }>();

  const { data: loan, error } = await supabase
    .from("loans")
    .insert({
      created_by: profile.id,
      drawdown_date: parsed.data.drawdown_date || null,
      first_payment_date: parsed.data.first_payment_date || null,
      gl_liability_account_id: account?.id ?? null,
      interest_rate: parsed.data.interest_rate,
      kind: parsed.data.kind,
      principal: parsed.data.principal,
      provider_id: parsed.data.provider_id,
      purpose: parsed.data.purpose,
      rate_basis: parsed.data.rate_basis,
      reference: parsed.data.reference,
      repayment_frequency: parsed.data.repayment_frequency,
      security_notes: parsed.data.security_notes,
      // Draft until the drawdown is posted (L3) — recording the terms is not
      // the same as the money having arrived.
      status: "draft",
      term_months: parsed.data.term_months,
    })
    .select("id, loan_number")
    .single<{ id: string; loan_number: string }>();

  if (error || !loan) {
    loanError(error?.message ?? "Could not record the loan.");
  }

  const { error: scheduleError, schedule } = await replaceLoanSchedule(supabase, loan.id, {
    firstPaymentDate: parsed.data.first_payment_date,
    frequency: parsed.data.repayment_frequency,
    interestRate: parsed.data.interest_rate,
    principal: parsed.data.principal,
    rateBasis: parsed.data.rate_basis,
    termMonths: parsed.data.term_months,
  });

  if (scheduleError || !schedule) {
    // A facility with no schedule is worse than none at all — it would
    // silently report zero due, forever. Undo rather than half-record.
    await supabase.from("loans").delete().eq("id", loan.id);
    loanError(scheduleError ?? "The repayment schedule could not be laid out.");
  }

  await recordOpsAuditEvent({
    action: "loan.created",
    actorUserId: profile.id,
    entityId: loan.id,
    entityType: "loan",
    metadata: {
      instalments: schedule.instalments,
      interest_rate: parsed.data.interest_rate,
      kind: parsed.data.kind,
      loan_number: loan.loan_number,
      principal: parsed.data.principal,
      rate_basis: parsed.data.rate_basis,
      // Recorded because the basis is what decides it, and the two differ by
      // roughly 80% at typical rates.
      total_interest: schedule.totalInterest,
      total_payable: schedule.totalPayable,
    },
    moduleKey: "loans",
    sourceId: loan.id,
    sourceTable: "loans",
    summary: `Recorded ${loan.loan_number}: ${parsed.data.principal} over ${
      parsed.data.term_months
    } months, ${parsed.data.rate_basis === "flat" ? "flat" : "reducing balance"}`,
  }).catch(() => null);

  revalidatePath(LOANS_ROUTE);
  redirect(`${LOANS_ROUTE}?created=loan`);
}

/**
 * Correct a facility that has not been drawn down yet.
 *
 * A draft is a record of terms being agreed, and terms get typed wrong — the
 * rate basis in particular, which changes the total interest by roughly 80% at
 * Zambian rates. Until the drawdown is posted nothing has reached the ledger
 * and no instalment can have been paid, so the whole agreement is still safe
 * to restate; after it, it is not, and this action refuses.
 *
 * The schedule is rebuilt from the corrected terms rather than left alone,
 * because a schedule computed from superseded terms is exactly the kind of
 * wrong number nobody re-checks.
 */
export async function updateLoanAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canManageOpsLoans(profile.role)) {
    loanError("Your role cannot amend a loan.");
  }

  const loanId = field(formData, "loan_id");

  if (!UUID.test(loanId)) {
    loanError("Select a loan.");
  }

  const parsed = loanSchema.safeParse({
    drawdown_date: field(formData, "drawdown_date"),
    first_payment_date: field(formData, "first_payment_date"),
    interest_rate: field(formData, "interest_rate") || "0",
    kind: field(formData, "kind") || "term_loan",
    principal: field(formData, "principal"),
    provider_id: field(formData, "provider_id"),
    purpose: field(formData, "purpose"),
    rate_basis: field(formData, "rate_basis") || "reducing_balance",
    reference: field(formData, "reference"),
    repayment_frequency: field(formData, "repayment_frequency") || "monthly",
    security_notes: field(formData, "security_notes"),
    term_months: field(formData, "term_months") || "0",
  });

  if (!parsed.success) {
    loanError(parsed.error.issues[0]?.message ?? "Check the loan details.");
  }

  if (parsed.data.term_months > 0 && !parsed.data.first_payment_date) {
    loanError("Give the first payment date so the schedule can be laid out.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data: loan, error } = await supabase
    .from("loans")
    .select("id, loan_number, status, principal, kind, interest_rate, rate_basis, term_months")
    .eq("id", loanId)
    .maybeSingle<{
      id: string;
      loan_number: string;
      status: string;
      principal: number;
      kind: string;
      interest_rate: number;
      rate_basis: string;
      term_months: number;
    }>();

  if (error) {
    loanError(error.message);
  }
  if (!loan) {
    loanError("Loan was not found.");
  }
  if (loan.status !== "draft") {
    loanError(
      "Only a draft facility can be amended. This one is drawn down — amend the instalments instead, so the ledger and the schedule stay in step.",
    );
  }

  // The liability account follows the kind: asset finance sits apart from bank
  // borrowing on the balance sheet, so changing the kind has to move it.
  const liabilityCode = parsed.data.kind === "asset_finance" ? "2520" : "2510";
  const { data: account } = await supabase
    .from("chart_of_accounts")
    .select("id")
    .eq("code", liabilityCode)
    .maybeSingle<{ id: string }>();

  const { error: updateError } = await supabase
    .from("loans")
    .update({
      drawdown_date: parsed.data.drawdown_date || null,
      first_payment_date: parsed.data.first_payment_date || null,
      gl_liability_account_id: account?.id ?? null,
      interest_rate: parsed.data.interest_rate,
      kind: parsed.data.kind,
      principal: parsed.data.principal,
      provider_id: parsed.data.provider_id,
      purpose: parsed.data.purpose,
      rate_basis: parsed.data.rate_basis,
      reference: parsed.data.reference,
      repayment_frequency: parsed.data.repayment_frequency,
      security_notes: parsed.data.security_notes,
      term_months: parsed.data.term_months,
    })
    .eq("id", loan.id)
    // Re-checked in SQL: the drawdown could have been posted between the read
    // above and this write, and that would leave the ledger holding one
    // principal and the register another.
    .eq("status", "draft");

  if (updateError) {
    loanError(updateError.message);
  }

  const { error: scheduleError, schedule } = await replaceLoanSchedule(supabase, loan.id, {
    firstPaymentDate: parsed.data.first_payment_date,
    frequency: parsed.data.repayment_frequency,
    interestRate: parsed.data.interest_rate,
    principal: parsed.data.principal,
    rateBasis: parsed.data.rate_basis,
    termMonths: parsed.data.term_months,
  });

  if (scheduleError || !schedule) {
    loanError(scheduleError ?? "The repayment schedule could not be re-laid.");
  }

  await recordOpsAuditEvent({
    action: "loan.amended",
    actorUserId: profile.id,
    entityId: loan.id,
    entityType: "loan",
    metadata: {
      instalments: schedule.instalments,
      loan_number: loan.loan_number,
      // Both sides recorded: an amendment is only readable against what it
      // replaced, and these four are what move the money.
      was: {
        interest_rate: Number(loan.interest_rate),
        kind: loan.kind,
        principal: Number(loan.principal),
        rate_basis: loan.rate_basis,
        term_months: Number(loan.term_months),
      },
      now: {
        interest_rate: parsed.data.interest_rate,
        kind: parsed.data.kind,
        principal: parsed.data.principal,
        rate_basis: parsed.data.rate_basis,
        term_months: parsed.data.term_months,
      },
      total_interest: schedule.totalInterest,
      total_payable: schedule.totalPayable,
    },
    moduleKey: "loans",
    sourceId: loan.id,
    sourceTable: "loans",
    summary: `Amended ${loan.loan_number} before drawdown: ${loan.principal} to ${parsed.data.principal}`,
  }).catch(() => null);

  revalidatePath(LOANS_ROUTE);
  redirect(`${LOANS_ROUTE}?updated=amended`);
}

/**
 * Drop a draft that should never have been recorded.
 *
 * Cancelled and archived rather than deleted: the facility was entered by
 * somebody, and "who recorded a K6.5m facility against Stanbic and then
 * withdrew it" is a question the audit trail should be able to answer. It
 * leaves the register either way, because `archived_at` is what the register
 * filters on.
 *
 * Restricted to drafts. Once drawn down there is cash and a journal behind the
 * facility, and the way out is settlement or write-off, not a delete.
 */
export async function discardLoanAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canManageOpsLoans(profile.role)) {
    loanError("Your role cannot withdraw a loan.");
  }

  const loanId = field(formData, "loan_id");
  const reason = field(formData, "reason");

  if (!UUID.test(loanId)) {
    loanError("Select a loan.");
  }
  if (reason.length < 3) {
    loanError("Say why the facility is being withdrawn.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data: loan, error } = await supabase
    .from("loans")
    .select("id, loan_number, status, principal")
    .eq("id", loanId)
    .maybeSingle<{ id: string; loan_number: string; status: string; principal: number }>();

  if (error) {
    loanError(error.message);
  }
  if (!loan) {
    loanError("Loan was not found.");
  }
  if (loan.status !== "draft") {
    loanError(
      "Only a draft facility can be withdrawn. This one has been drawn down — settle it or write it off instead.",
    );
  }

  const { error: discardError } = await supabase
    .from("loans")
    .update({
      archived_at: new Date().toISOString(),
      archived_by: profile.id,
      notes: reason,
      status: "cancelled",
    })
    .eq("id", loan.id)
    .eq("status", "draft");

  if (discardError) {
    loanError(discardError.message);
  }

  // The instalments were only ever a projection of terms that were never
  // taken up, and leaving them behind would keep the facility showing in
  // "due next 30 days" arithmetic that reads loans by id.
  await supabase.from("loan_repayments").delete().eq("loan_id", loan.id);

  await recordOpsAuditEvent({
    action: "loan.withdrawn",
    actorUserId: profile.id,
    entityId: loan.id,
    entityType: "loan",
    metadata: {
      loan_number: loan.loan_number,
      principal: Number(loan.principal),
      reason,
    },
    moduleKey: "loans",
    sourceId: loan.id,
    sourceTable: "loans",
    summary: `Withdrew draft ${loan.loan_number}: ${reason}`,
  }).catch(() => null);

  revalidatePath(LOANS_ROUTE);
  redirect(`${LOANS_ROUTE}?updated=withdrawn`);
}

// ---------------------------------------------------------------------------
// Drawdown and repayment (L3)
// ---------------------------------------------------------------------------

/**
 * The money arrived.
 *
 * Separate from recording the facility because they are separate events: the
 * terms are agreed at signing, the cash lands later, and the ledger should say
 * when. Posting the drawdown is what moves a loan from `draft` to `active`.
 */
export async function recordLoanDrawdownAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canManageOpsLoans(profile.role)) {
    loanError("Your role cannot post a drawdown.");
  }

  const loanId = field(formData, "loan_id");
  const drawdownDate = field(formData, "drawdown_date");

  if (!UUID.test(loanId)) {
    loanError("Select a loan.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(drawdownDate)) {
    loanError("Give the date the money arrived.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data: loan, error } = await supabase
    .from("loans")
    .select("id, loan_number, status, principal")
    .eq("id", loanId)
    .maybeSingle<{ id: string; loan_number: string; status: string; principal: number }>();

  if (error) {
    loanError(error.message);
  }
  if (!loan) {
    loanError("Loan was not found.");
  }
  if (loan.status !== "draft") {
    loanError("Only a draft facility can be drawn down. This one is already active.");
  }

  const { error: updateError } = await supabase
    .from("loans")
    .update({ drawdown_date: drawdownDate, status: "active" })
    .eq("id", loan.id)
    .eq("status", "draft");

  if (updateError) {
    loanError(updateError.message);
  }

  // Dr Bank / Cr the facility's liability account. No expense line — borrowing
  // is not a cost.
  await postLoanDrawdownJournalSafe(loan.id, profile.id);

  await recordOpsAuditEvent({
    action: "loan.drawn_down",
    actorUserId: profile.id,
    entityId: loan.id,
    entityType: "loan",
    metadata: {
      drawdown_date: drawdownDate,
      loan_number: loan.loan_number,
      principal: loan.principal,
    },
    moduleKey: "loans",
    sourceId: loan.id,
    sourceTable: "loans",
    summary: `Drew down ${loan.loan_number}`,
  }).catch(() => null);

  revalidatePath(LOANS_ROUTE);
  redirect(`${LOANS_ROUTE}?updated=drawn_down`);
}

const repaymentSchema = z.object({
  fees: z.coerce.number().min(0, "Fees cannot be negative.").default(0),
  interest_portion: z.coerce.number().min(0, "Interest cannot be negative."),
  paid_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Give the date the payment left the bank."),
  principal_portion: z.coerce.number().min(0, "Principal cannot be negative."),
  reference: z.string().trim().max(120).default(""),
  repayment_id: z.string().regex(UUID, "Select an instalment."),
  total_amount: z.coerce.number().positive("Enter what was actually paid."),
});

/**
 * Record an instalment as paid.
 *
 * The split is entered, not assumed. A lender's actual debit routinely differs
 * from the generated schedule by a few kwacha, and by more when a penalty or
 * arrangement fee is added — so the figures come off the bank statement and
 * the schedule is only the default.
 *
 * The three parts must add up to what left the account. Without that check the
 * journal would not balance, and `post_journal_entry` would refuse it AFTER
 * the instalment had already been marked paid — leaving a loan that looks
 * repaid with nothing in the ledger to show for it.
 */
export async function recordLoanRepaymentAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canRecordOpsLoanRepayment(profile.role)) {
    loanError("Your role cannot record a loan repayment.");
  }

  const parsed = repaymentSchema.safeParse({
    fees: field(formData, "fees") || "0",
    interest_portion: field(formData, "interest_portion") || "0",
    paid_on: field(formData, "paid_on"),
    principal_portion: field(formData, "principal_portion") || "0",
    reference: field(formData, "reference"),
    repayment_id: field(formData, "repayment_id"),
    total_amount: field(formData, "total_amount"),
  });

  if (!parsed.success) {
    loanError(parsed.error.issues[0]?.message ?? "Check the repayment details.");
  }

  const parts = round2(
    parsed.data.principal_portion + parsed.data.interest_portion + parsed.data.fees,
  );

  if (parts !== round2(parsed.data.total_amount)) {
    loanError(
      `Principal, interest and fees come to ${parts.toFixed(2)} but the payment was ${parsed.data.total_amount.toFixed(2)}. They must agree, or the ledger entry will not balance.`,
    );
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data: repayment, error } = await supabase
    .from("loan_repayments")
    .select(
      "id, loan_id, instalment_number, status, loan:loans!loan_repayments_loan_id_fkey(loan_number, status)",
    )
    .eq("id", parsed.data.repayment_id)
    .maybeSingle<{
      id: string;
      loan_id: string;
      instalment_number: number;
      status: string;
      loan:
        | { loan_number: string; status: string }
        | Array<{ loan_number: string; status: string }>
        | null;
    }>();

  if (error) {
    loanError(error.message);
  }
  if (!repayment) {
    loanError("Instalment was not found.");
  }
  if (repayment.status === "paid") {
    loanError("That instalment is already recorded as paid.");
  }

  const loan = Array.isArray(repayment.loan) ? repayment.loan[0] : repayment.loan;

  if (loan?.status === "draft") {
    loanError("Post the drawdown first — the money has not arrived yet.");
  }

  const { error: payError } = await supabase
    .from("loan_repayments")
    .update({
      fees: parsed.data.fees,
      interest_portion: parsed.data.interest_portion,
      paid_on: parsed.data.paid_on,
      principal_portion: parsed.data.principal_portion,
      recorded_by: profile.id,
      reference: parsed.data.reference,
      status: "paid",
      total_amount: parsed.data.total_amount,
    })
    .eq("id", repayment.id)
    .neq("status", "paid");

  if (payError) {
    loanError(payError.message);
  }

  // Dr liability + Dr interest + Dr charges / Cr bank.
  await postLoanRepaymentJournalSafe(repayment.id, profile.id);

  // Settled once nothing is left scheduled or missed.
  const { data: remaining } = await supabase
    .from("loan_repayments")
    .select("id")
    .eq("loan_id", repayment.loan_id)
    .in("status", ["scheduled", "missed"]);

  if ((remaining ?? []).length === 0) {
    await supabase
      .from("loans")
      .update({ status: "settled" })
      .eq("id", repayment.loan_id)
      .eq("status", "active");
  }

  await recordOpsAuditEvent({
    action: "loan.repayment_recorded",
    actorUserId: profile.id,
    entityId: repayment.loan_id,
    entityType: "loan",
    metadata: {
      fees: parsed.data.fees,
      instalment: repayment.instalment_number,
      // Kept apart because only the interest reaches the P&L.
      interest: parsed.data.interest_portion,
      loan_number: loan?.loan_number ?? "",
      paid_on: parsed.data.paid_on,
      principal: parsed.data.principal_portion,
      total: parsed.data.total_amount,
    },
    moduleKey: "loans",
    sourceId: repayment.id,
    sourceTable: "loan_repayments",
    summary: `Paid instalment ${repayment.instalment_number} on ${loan?.loan_number ?? "loan"}`,
  }).catch(() => null);

  revalidatePath(LOANS_ROUTE);
  redirect(`${LOANS_ROUTE}?updated=repaid`);
}

/**
 * Reverse a repayment keyed in error.
 *
 * Everything else in this ledger has a reversal path — receipts, payables,
 * journals — and a mis-keyed loan payment is just as likely as any of them.
 * Without one the only remedy is editing a paid row, which would leave the
 * general ledger describing a payment that never happened.
 *
 * The instalment goes back to `scheduled` with its schedule figures intact,
 * and the journal is contra'd rather than deleted: the correction is part of
 * the record, and an entry that simply vanished would leave the bank
 * reconciliation with an unexplained gap.
 */
export async function reverseLoanRepaymentAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  // Reversing moves cash back into the ledger, so it sits with the narrower
  // manage roles rather than with whoever may record a payment.
  if (!canManageOpsLoans(profile.role)) {
    loanError("Only Finance leadership can reverse a loan repayment.");
  }

  const repaymentId = field(formData, "repayment_id");
  const reason = field(formData, "reason");

  if (!UUID.test(repaymentId)) {
    loanError("Select an instalment.");
  }
  if (reason.length === 0) {
    loanError("Give a reason — a reversed repayment without one cannot be explained later.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data: repayment, error } = await supabase
    .from("loan_repayments")
    .select("id, loan_id, instalment_number, status, total_amount")
    .eq("id", repaymentId)
    .maybeSingle<{
      id: string;
      loan_id: string;
      instalment_number: number;
      status: string;
      total_amount: number;
    }>();

  if (error) {
    loanError(error.message);
  }
  if (!repayment) {
    loanError("Instalment was not found.");
  }
  if (repayment.status !== "paid") {
    loanError("Only a recorded payment can be reversed.");
  }

  const { error: revertError } = await supabase
    .from("loan_repayments")
    .update({
      journal_entry_id: null,
      notes: reason.slice(0, 400),
      paid_on: null,
      reference: "",
      status: "scheduled",
    })
    .eq("id", repayment.id)
    .eq("status", "paid");

  if (revertError) {
    loanError(revertError.message);
  }

  await reverseOpsJournalSafe(
    "loan_repayments",
    repayment.id,
    "loan_repayment",
    profile.id,
  );

  // The facility owes money again, so it is no longer settled.
  await supabase
    .from("loans")
    .update({ status: "active" })
    .eq("id", repayment.loan_id)
    .eq("status", "settled");

  await recordOpsAuditEvent({
    action: "loan.repayment_reversed",
    actorUserId: profile.id,
    entityId: repayment.loan_id,
    entityType: "loan",
    metadata: {
      amount: repayment.total_amount,
      instalment: repayment.instalment_number,
      reason,
    },
    moduleKey: "loans",
    sourceId: repayment.id,
    sourceTable: "loan_repayments",
    summary: `Reversed the payment on instalment ${repayment.instalment_number}`,
  }).catch(() => null);

  revalidatePath(LOANS_ROUTE);
  redirect(`${LOANS_ROUTE}?updated=repayment_reversed`);
}

const scheduleEditSchema = z.object({
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Give the due date."),
  interest_portion: z.coerce.number().min(0),
  principal_portion: z.coerce.number().min(0),
  repayment_id: z.string().regex(UUID, "Select an instalment."),
});

/**
 * Correct a scheduled instalment against the lender's own schedule.
 *
 * The generated schedule is a good default, not the contract. Banks round
 * differently, load an arrangement fee onto the first instalment, and shift
 * dates off weekends — so a computed figure that disagrees with their paper by
 * a few kwacha otherwise costs somebody an afternoon every year.
 *
 * Only a SCHEDULED instalment can be amended. A paid one has posted a journal,
 * and editing it would leave the ledger describing a payment that did not
 * happen; that needs a reversal, not an edit.
 */
export async function updateLoanScheduleEntryAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canManageOpsLoans(profile.role)) {
    loanError("Your role cannot amend a repayment schedule.");
  }

  const parsed = scheduleEditSchema.safeParse({
    due_date: field(formData, "due_date"),
    interest_portion: field(formData, "interest_portion") || "0",
    principal_portion: field(formData, "principal_portion") || "0",
    repayment_id: field(formData, "repayment_id"),
  });

  if (!parsed.success) {
    loanError(parsed.error.issues[0]?.message ?? "Check the instalment.");
  }

  const total = round2(parsed.data.principal_portion + parsed.data.interest_portion);

  if (total <= 0) {
    loanError("An instalment must be worth something.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("loan_repayments")
    .update({
      due_date: parsed.data.due_date,
      interest_portion: parsed.data.interest_portion,
      principal_portion: parsed.data.principal_portion,
      total_amount: total,
    })
    .eq("id", parsed.data.repayment_id)
    .eq("status", "scheduled")
    .select("id, loan_id, instalment_number")
    .maybeSingle<{ id: string; loan_id: string; instalment_number: number }>();

  if (error) {
    loanError(error.message);
  }
  if (!data) {
    loanError(
      "That instalment is no longer scheduled — a paid one needs a reversal, not an edit.",
    );
  }

  await recordOpsAuditEvent({
    action: "loan.schedule_amended",
    actorUserId: profile.id,
    entityId: data.loan_id,
    entityType: "loan",
    metadata: {
      due_date: parsed.data.due_date,
      instalment: data.instalment_number,
      interest: parsed.data.interest_portion,
      principal: parsed.data.principal_portion,
      total,
    },
    moduleKey: "loans",
    sourceId: data.id,
    sourceTable: "loan_repayments",
    summary: `Amended instalment ${data.instalment_number} to match the lender's schedule`,
  }).catch(() => null);

  revalidatePath(LOANS_ROUTE);
  redirect(`${LOANS_ROUTE}?updated=schedule_amended`);
}
