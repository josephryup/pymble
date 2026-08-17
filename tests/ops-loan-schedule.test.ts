import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  buildLoanDrawdownJournal,
  buildLoanRepaymentJournal,
} from "../src/lib/ops/gl-journal-builders";
import {
  addMonthsClamped,
  buildOpsLoanSchedule,
  outstandingLoanBalance,
} from "../src/lib/ops/loan-schedule";
import { summariseLoanRegister, type OpsLoan, type OpsLoanRepayment } from "../src/lib/ops/loans";

/**
 * Loan schedules (L1).
 *
 * Interest is the only part of a repayment that reaches the P&L, so an error
 * here misstates profit every month in the same direction. Proved against
 * worked examples: there are no loans in the system yet, and there will never
 * be a better time to pin the arithmetic than before the first one is keyed.
 */

/**
 * One exported action's source, from its signature to the next export.
 *
 * The loan actions are asserted against as text because they are server
 * actions over a live client — there is nothing to call without a database.
 * Slicing to one action keeps those assertions honest: a rule that holds for
 * the reversal path is not a rule about the whole file.
 */
function actionBody(source: string, name: string) {
  const start = source.indexOf(`export async function ${name}(`);
  assert.ok(start >= 0, `${name} was not found in loan-actions.ts`);
  const next = source.indexOf("\nexport ", start + 1);
  return source.slice(start, next === -1 ? source.length : next);
}

describe("flat rate", () => {
  // K500,000 at 20% over 3 years, monthly.
  //   interest = 500,000 × 0.20 × 3 = 300,000
  //   36 instalments of 13,888.89 principal + 8,333.33 interest
  const schedule = buildOpsLoanSchedule({
    annualRatePercent: 20,
    firstPaymentDate: "2026-09-01",
    frequency: "monthly",
    principal: 500_000,
    rateBasis: "flat",
    termMonths: 36,
  });

  it("charges interest on the original principal for the whole term", () => {
    assert.equal(schedule.totalInterest, 300_000);
    assert.equal(schedule.totalPayable, 800_000);
    assert.equal(schedule.instalments, 36);
  });

  it("splits every instalment evenly", () => {
    assert.equal(schedule.entries[0].principal, 13_888.89);
    assert.equal(schedule.entries[0].interest, 8_333.33);
    assert.equal(schedule.entries[0].total, 22_222.22);
  });

  it("clears to exactly zero, with the last instalment absorbing rounding", () => {
    // A loan that never quite clears is how people stop trusting a ledger.
    const last = schedule.entries[schedule.entries.length - 1];
    assert.equal(last.closingBalance, 0);

    const principalSum = schedule.entries.reduce((sum, entry) => sum + entry.principal, 0);
    assert.equal(Math.round(principalSum * 100) / 100, 500_000);
  });

  it("does not reduce the interest as the balance falls — that is the point", () => {
    // The defining property, and the contrast with reducing balance, where the
    // final instalment's interest is a small fraction of the first.
    //
    // Compared proportionally rather than to the cent: the last instalment
    // deliberately absorbs the term's rounding, so it lands a few tetebwe off
    // the others. Asserting exact equality would fail on arithmetic that is
    // working correctly.
    const first = schedule.entries[0].interest;
    const last = schedule.entries[schedule.entries.length - 1].interest;

    assert.ok(
      last / first > 0.999 && last / first < 1.001,
      `flat interest stays level: first ${first}, last ${last}`,
    );
  });
});

describe("reducing balance", () => {
  const schedule = buildOpsLoanSchedule({
    annualRatePercent: 20,
    firstPaymentDate: "2026-09-01",
    frequency: "monthly",
    principal: 500_000,
    rateBasis: "reducing_balance",
    termMonths: 36,
  });

  it("costs far less than the same headline rate charged flat", () => {
    // ~K167,000 against K300,000. The decision that made L-D1 worth asking.
    assert.ok(
      schedule.totalInterest > 160_000 && schedule.totalInterest < 175_000,
      `expected roughly K167,000 of interest, got ${schedule.totalInterest}`,
    );
  });

  it("charges the first period on the full balance", () => {
    // 500,000 × (20% / 12) = 8,333.33 — the same as flat's monthly figure,
    // which is exactly why the two are so easy to confuse at instalment one.
    assert.equal(schedule.entries[0].interest, 8_333.33);
  });

  it("shifts from interest to principal as the balance falls", () => {
    const first = schedule.entries[0];
    const last = schedule.entries[schedule.entries.length - 1];

    assert.ok(last.interest < first.interest, "interest falls");
    assert.ok(last.principal > first.principal, "principal rises");
  });

  it("clears to exactly zero", () => {
    const last = schedule.entries[schedule.entries.length - 1];
    assert.equal(last.closingBalance, 0);
  });

  it("keeps the payment level across the term", () => {
    const totals = schedule.entries.slice(0, -1).map((entry) => entry.total);
    const spread = Math.max(...totals) - Math.min(...totals);
    assert.ok(spread < 0.05, `level payment expected, spread was ${spread}`);
  });
});

describe("an interest-free shareholder loan", () => {
  it("degenerates to equal principal instalments, not a divide by zero", () => {
    // The annuity formula divides by zero at 0%. This is the correct answer
    // rather than a special case bolted on.
    const schedule = buildOpsLoanSchedule({
      annualRatePercent: 0,
      firstPaymentDate: "2026-09-01",
      frequency: "monthly",
      principal: 120_000,
      rateBasis: "reducing_balance",
      termMonths: 12,
    });

    assert.equal(schedule.totalInterest, 0);
    assert.equal(schedule.totalPayable, 120_000);
    assert.equal(schedule.entries[0].principal, 10_000);
    assert.equal(schedule.entries[0].interest, 0);
    assert.equal(schedule.entries[11].closingBalance, 0);
  });

  it("has no schedule at all when it is repayable on demand", () => {
    // A director's loan with no term is a real liability. Refusing to model it
    // would push it out of the system entirely.
    const schedule = buildOpsLoanSchedule({
      annualRatePercent: 0,
      firstPaymentDate: "2026-09-01",
      frequency: "monthly",
      principal: 250_000,
      rateBasis: "reducing_balance",
      termMonths: 0,
    });

    assert.deepEqual(schedule.entries, []);
    assert.equal(schedule.instalments, 0);
  });
});

describe("quarterly repayment", () => {
  it("counts periods, not months", () => {
    const schedule = buildOpsLoanSchedule({
      annualRatePercent: 12,
      firstPaymentDate: "2026-09-30",
      frequency: "quarterly",
      principal: 400_000,
      rateBasis: "reducing_balance",
      termMonths: 24,
    });

    assert.equal(schedule.instalments, 8);
    assert.equal(schedule.entries[1].dueDate, "2026-12-30");
  });
});

describe("instalment dates", () => {
  it("clamps a month-end drawdown instead of rolling into the next month", () => {
    // Naive date arithmetic turns 31 January into 3 March. Every lender
    // clamps; this must too.
    assert.equal(addMonthsClamped("2026-01-31", 1), "2026-02-28");
    assert.equal(addMonthsClamped("2026-01-31", 3), "2026-04-30");
    assert.equal(addMonthsClamped("2028-01-31", 1), "2028-02-29");
  });

  it("crosses a year boundary", () => {
    assert.equal(addMonthsClamped("2026-11-15", 3), "2027-02-15");
  });

  it("puts the first instalment on the date given, not a month later", () => {
    const schedule = buildOpsLoanSchedule({
      annualRatePercent: 10,
      firstPaymentDate: "2026-10-05",
      frequency: "monthly",
      principal: 60_000,
      rateBasis: "flat",
      termMonths: 6,
    });

    assert.equal(schedule.entries[0].dueDate, "2026-10-05");
    assert.equal(schedule.entries[5].dueDate, "2027-03-05");
  });
});

describe("outstanding balance", () => {
  it("counts the principal repaid, never the total paid", () => {
    // Summing totals would clear the loan early by the entire interest bill —
    // the single easiest way to get this wrong.
    const balance = outstandingLoanBalance(500_000, [
      { principal_portion: 13_888.89, status: "paid" },
      { principal_portion: 13_888.89, status: "paid" },
    ]);

    assert.equal(balance, 472_222.22);
  });

  it("ignores instalments that have not been paid", () => {
    const balance = outstandingLoanBalance(500_000, [
      { principal_portion: 13_888.89, status: "paid" },
      { principal_portion: 13_888.89, status: "scheduled" },
      { principal_portion: 13_888.89, status: "missed" },
    ]);

    assert.equal(balance, 486_111.11);
  });

  it("floors at zero rather than reporting a negative liability", () => {
    const balance = outstandingLoanBalance(1_000, [
      { principal_portion: 1_200, status: "paid" },
    ]);

    assert.equal(balance, 0);
  });
});

// ---------------------------------------------------------------------------
// The register (L2)
// ---------------------------------------------------------------------------


const TODAY = "2026-08-11";

const loan = (overrides: Partial<OpsLoan> = {}): OpsLoan => ({
  archived_at: null,
  currency_code: "ZMW",
  drawdown_date: "2026-01-01",
  first_payment_date: "2026-02-01",
  id: crypto.randomUUID(),
  interest_rate: 20,
  kind: "term_loan",
  loan_number: "LN-0001",
  principal: 500_000,
  provider_id: "p1",
  provider_kind: "bank",
  provider_name: "STANBIC",
  purpose: "",
  rate_basis: "reducing_balance",
  reference: "",
  repayment_frequency: "monthly",
  security_notes: "",
  status: "active",
  term_months: 36,
  ...overrides,
});

const instalment = (
  n: number,
  dueDate: string,
  principal: number,
  interest: number,
  status: OpsLoanRepayment["status"] = "scheduled",
): OpsLoanRepayment => ({
  due_date: dueDate,
  fees: 0,
  id: `${n}-${dueDate}`,
  instalment_number: n,
  interest_portion: interest,
  paid_on: status === "paid" ? dueDate : null,
  principal_portion: principal,
  reference: "",
  status,
  total_amount: principal + interest,
});

describe("the loan register", () => {
  it("reduces the debt by principal repaid, never by the total paid", () => {
    // Two instalments of 22,222.22 paid, but only 13,888.89 each is principal.
    // Summing totals would clear the loan early by the whole interest bill.
    const one = loan({ principal: 500_000 });
    const register = summariseLoanRegister(
      [one],
      new Map([
        [
          one.id,
          [
            instalment(1, "2026-06-01", 13_888.89, 8_333.33, "paid"),
            instalment(2, "2026-07-01", 13_888.89, 8_333.33, "paid"),
            instalment(3, "2026-09-01", 13_888.89, 8_333.33),
          ],
        ],
      ]),
      TODAY,
    );

    assert.equal(register.total_outstanding, 472_222.22);
    assert.equal(register.loans[0].interest_paid, 16_666.66);
  });

  it("flags an instalment past its date and still unpaid", () => {
    const one = loan();
    const register = summariseLoanRegister(
      [one],
      new Map([[one.id, [instalment(1, "2026-07-01", 10_000, 2_000)]]]),
      TODAY,
    );

    assert.equal(register.arrears_count, 1);
    assert.equal(register.total_arrears, 12_000);
  });

  it("does not treat a waived instalment as arrears", () => {
    // A lender who has forgiven an instalment is not owed it.
    const one = loan();
    const register = summariseLoanRegister(
      [one],
      new Map([[one.id, [instalment(1, "2026-07-01", 10_000, 2_000, "waived")]]]),
      TODAY,
    );

    assert.equal(register.arrears_count, 0);
  });

  it("totals only what falls due in the next thirty days", () => {
    const one = loan();
    const register = summariseLoanRegister(
      [one],
      new Map([
        [
          one.id,
          [
            instalment(1, "2026-08-20", 10_000, 2_000),
            instalment(2, "2026-09-05", 10_000, 2_000),
            // Beyond the horizon.
            instalment(3, "2026-10-20", 10_000, 2_000),
          ],
        ],
      ]),
      TODAY,
    );

    assert.equal(register.due_next_30_days, 24_000);
  });

  it("drops a settled facility out of the totals but keeps it on the register", () => {
    const one = loan({ status: "settled" });
    const register = summariseLoanRegister([one], new Map([[one.id, []]]), TODAY);

    assert.equal(register.total_outstanding, 0);
    assert.equal(register.total_principal, 0);
    assert.equal(register.loans.length, 1, "history stays visible");
  });

  it("adds up exposure per lender across facilities", () => {
    // The question free text cannot answer, and why the lender master exists.
    const a = loan({ principal: 300_000, provider_id: "stanbic", provider_name: "STANBIC" });
    const b = loan({ principal: 200_000, provider_id: "stanbic", provider_name: "STANBIC" });
    const c = loan({ principal: 100_000, provider_id: "zanaco", provider_name: "ZANACO" });

    const register = summariseLoanRegister(
      [a, b, c],
      new Map([
        [a.id, []],
        [b.id, []],
        [c.id, []],
      ]),
      TODAY,
    );

    assert.equal(register.by_provider.length, 2);
    assert.equal(register.by_provider[0].provider_name, "STANBIC");
    assert.equal(register.by_provider[0].outstanding, 500_000);
    assert.equal(register.by_provider[0].loan_count, 2);
  });

  it("puts a facility in arrears above a larger one that is current", () => {
    const behind = loan({ loan_number: "LN-SMALL", principal: 50_000 });
    const big = loan({ loan_number: "LN-BIG", principal: 900_000 });

    const register = summariseLoanRegister(
      [big, behind],
      new Map([
        [big.id, [instalment(1, "2026-09-01", 20_000, 5_000)]],
        [behind.id, [instalment(1, "2026-07-01", 5_000, 1_000)]],
      ]),
      TODAY,
    );

    assert.equal(register.loans[0].loan_number, "LN-SMALL");
  });

  it("reports a loan repayable on demand without a schedule", () => {
    const director = loan({ interest_rate: 0, kind: "shareholder", principal: 250_000, term_months: 0 });
    const register = summariseLoanRegister([director], new Map([[director.id, []]]), TODAY);

    assert.equal(register.total_outstanding, 250_000);
    assert.equal(register.loans[0].next_due, null);
    assert.equal(register.loans[0].scheduled_interest, 0);
  });
});

// ---------------------------------------------------------------------------
// Drawdown and repayment postings (L3)
// ---------------------------------------------------------------------------

describe("a drawdown is not a cost", () => {
  const journal = buildLoanDrawdownJournal(
    {
      id: "loan-1",
      liability_account_code: "2510",
      loan_number: "LN-0001",
      principal: 500_000,
      provider_name: "STANBIC",
    },
    "2026-09-01",
  );

  it("puts cash in the bank against a liability, with no expense line", () => {
    // The single thing keying a loan as a payable would have got wrong: the
    // whole principal would have hit profit.
    assert.equal(journal.lines.length, 2);
    assert.equal(journal.lines[0].account_code, "1010");
    assert.equal(journal.lines[0].debit, 500_000);
    assert.equal(journal.lines[1].account_code, "2510");
    assert.equal(journal.lines[1].credit, 500_000);
  });

  it("balances", () => {
    const debits = journal.lines.reduce((sum, line) => sum + (line.debit ?? 0), 0);
    const credits = journal.lines.reduce((sum, line) => sum + (line.credit ?? 0), 0);
    assert.equal(debits, credits);
  });

  it("uses the facility's own liability account, so asset finance stays apart", () => {
    const assetFinance = buildLoanDrawdownJournal(
      {
        id: "loan-2",
        liability_account_code: "2520",
        loan_number: "LN-0002",
        principal: 200_000,
        provider_name: "FINANCIER",
      },
      "2026-09-01",
    );

    assert.equal(assetFinance.lines[1].account_code, "2520");
  });
});

describe("a repayment splits three ways", () => {
  const journal = buildLoanRepaymentJournal({
    fees: 150,
    id: "rep-1",
    interest: 8_333.33,
    liability_account_code: "2510",
    loan_number: "LN-0001",
    paid_on: "2026-10-01",
    principal: 13_888.89,
    total: 22_372.22,
  });

  it("reduces the liability by the principal, never expenses it", () => {
    const liability = journal.lines.find((line) => line.account_code === "2510");
    assert.equal(liability?.debit, 13_888.89);
  });

  it("sends only the interest to the profit and loss", () => {
    const interest = journal.lines.find((line) => line.account_code === "6120");
    assert.equal(interest?.debit, 8_333.33);
  });

  it("puts lender fees in bank charges rather than interest", () => {
    const fees = journal.lines.find((line) => line.account_code === "6090");
    assert.equal(fees?.debit, 150);
  });

  it("takes the whole payment out of the bank", () => {
    const bank = journal.lines.find((line) => line.account_code === "1010");
    assert.equal(bank?.credit, 22_372.22);
  });

  it("balances", () => {
    const debits = journal.lines.reduce((sum, line) => sum + (line.debit ?? 0), 0);
    const credits = journal.lines.reduce((sum, line) => sum + (line.credit ?? 0), 0);
    assert.equal(Math.round(debits * 100) / 100, Math.round(credits * 100) / 100);
  });

  it("is dated when the money left, not when it was keyed", () => {
    // What makes a bank reconciliation possible.
    assert.equal(journal.entryDate, "2026-10-01");
  });

  it("omits the fee line entirely when the lender charged none", () => {
    // Every line stays single-sided; a zero line is noise in the ledger.
    const clean = buildLoanRepaymentJournal({
      fees: 0,
      id: "rep-2",
      interest: 1_000,
      liability_account_code: "2510",
      loan_number: "LN-0001",
      paid_on: "2026-10-01",
      principal: 9_000,
      total: 10_000,
    });

    assert.equal(clean.lines.length, 3);
    assert.ok(!clean.lines.some((line) => line.account_code === "6090"));
  });

  it("omits the interest line on an interest-free loan", () => {
    const free = buildLoanRepaymentJournal({
      fees: 0,
      id: "rep-3",
      interest: 0,
      liability_account_code: "2510",
      loan_number: "LN-DIR",
      paid_on: "2026-10-01",
      principal: 10_000,
      total: 10_000,
    });

    assert.equal(free.lines.length, 2);
    assert.ok(!free.lines.some((line) => line.account_code === "6120"));
  });

  it("keys on the repayment, so one instalment can be reversed alone", () => {
    assert.equal(journal.sourceTable, "loan_repayments");
    assert.equal(journal.sourceId, "rep-1");
  });
});

describe("the repayment action", () => {
  const ACTIONS = readFileSync(
    join(import.meta.dirname, "..", "src", "lib", "ops", "loan-actions.ts"),
    "utf8",
  );

  it("refuses a split that does not add up to what was paid", () => {
    // Otherwise post_journal_entry rejects the unbalanced entry AFTER the
    // instalment is already marked paid — a loan that looks repaid with
    // nothing in the ledger behind it.
    assert.match(ACTIONS, /if \(parts !== round2\(parsed\.data\.total_amount\)\)/);
    assert.match(ACTIONS, /must agree, or the ledger entry will not balance/);
  });

  it("will not accept a repayment before the drawdown is posted", () => {
    assert.match(ACTIONS, /loan\?\.status === "draft"/);
    assert.match(ACTIONS, /the money has not arrived yet/);
  });

  it("will not pay the same instalment twice", () => {
    assert.match(ACTIONS, /repayment\.status === "paid"/);
    assert.match(ACTIONS, /\.neq\("status", "paid"\)/);
  });

  it("only amends an instalment that has not been paid", () => {
    assert.match(ACTIONS, /\.eq\("status", "scheduled"\)/);
    assert.match(ACTIONS, /needs a reversal, not an edit/);
  });

  it("settles the facility once nothing is left owing", () => {
    assert.match(ACTIONS, /\.in\("status", \["scheduled", "missed"\]\)/);
    assert.match(ACTIONS, /status: "settled"/);
  });
});

// ---------------------------------------------------------------------------
// Correcting a facility that has not been drawn down
// ---------------------------------------------------------------------------

describe("amending and withdrawing a draft facility", () => {
  const ACTIONS = readFileSync(
    join(import.meta.dirname, "..", "src", "lib", "ops", "loan-actions.ts"),
    "utf8",
  );
  const amend = actionBody(ACTIONS, "updateLoanAction");
  const withdraw = actionBody(ACTIONS, "discardLoanAction");

  it("only amends a draft, and re-checks that in SQL", () => {
    // Read-then-write: the drawdown could be posted in between, which would
    // leave the ledger holding one principal and the register another.
    assert.match(amend, /loan\.status !== "draft"/);
    assert.match(amend, /\.eq\("status", "draft"\)/);
  });

  it("re-lays the schedule from the corrected terms", () => {
    // A schedule computed from superseded terms is the kind of wrong number
    // nobody re-checks, because it looks generated rather than typed.
    assert.match(amend, /replaceLoanSchedule\(/);
    assert.match(ACTIONS, /async function replaceLoanSchedule\(/);
  });

  it("records what the terms were as well as what they became", () => {
    assert.match(amend, /action: "loan\.amended"/);
    assert.match(amend, /was: \{/);
    assert.match(amend, /rate_basis: loan\.rate_basis/);
  });

  it("moves the liability account when the facility type changes", () => {
    // Asset finance sits in 2520, bank borrowing in 2510. Leaving the old
    // account would post the drawdown to the wrong line of the balance sheet.
    assert.match(amend, /kind === "asset_finance" \? "2520" : "2510"/);
  });

  it("cancels a withdrawn draft rather than deleting the facility", () => {
    assert.match(withdraw, /status: "cancelled"/);
    assert.match(withdraw, /archived_at: new Date\(\)\.toISOString\(\)/);
    assert.doesNotMatch(withdraw, /from\("loans"\)\s*\n?\s*\.delete\(/);
  });

  it("demands a reason and refuses anything drawn down", () => {
    assert.match(withdraw, /reason\.length < 3/);
    assert.match(withdraw, /loan\.status !== "draft"/);
    assert.match(withdraw, /settle it or write it off instead/);
  });

  it("keeps both to the roles that may commit the company", () => {
    assert.match(amend, /canManageOpsLoans\(profile\.role\)/);
    assert.match(withdraw, /canManageOpsLoans\(profile\.role\)/);
  });
});

// ---------------------------------------------------------------------------
// Reversal, and the payables boundary (L4)
// ---------------------------------------------------------------------------

describe("reversing a repayment", () => {
  const ACTIONS = readFileSync(
    join(import.meta.dirname, "..", "src", "lib", "ops", "loan-actions.ts"),
    "utf8",
  );

  it("contras the journal rather than deleting it", () => {
    // An entry that simply vanished would leave the bank reconciliation with
    // an unexplained gap.
    assert.match(ACTIONS, /reverseOpsJournalSafe\(\s*"loan_repayments",/);
    // Scoped to the reversal itself rather than the whole file: clearing
    // instalments IS legitimate on a draft, where nothing can have been paid
    // and the schedule is only a projection of terms still being corrected.
    // On a live facility it would erase the cause of a posted journal.
    assert.doesNotMatch(actionBody(ACTIONS, "reverseLoanRepaymentAction"), /\.delete\(/);
    assert.doesNotMatch(actionBody(ACTIONS, "recordLoanRepaymentAction"), /\.delete\(/);
  });

  it("puts the instalment back on the schedule", () => {
    assert.match(ACTIONS, /status: "scheduled",/);
    assert.match(ACTIONS, /paid_on: null,/);
  });

  it("reopens a facility that the payment had settled", () => {
    assert.match(ACTIONS, /\.eq\("status", "settled"\)/);
  });

  it("only reverses something actually paid, and demands a reason", () => {
    assert.match(ACTIONS, /repayment\.status !== "paid"/);
    assert.match(ACTIONS, /cannot be explained later/);
  });

  it("sits with the narrower manage roles, not with whoever records a payment", () => {
    // Reversing moves cash back into the ledger.
    const body = ACTIONS.slice(
      ACTIONS.indexOf("export async function reverseLoanRepaymentAction"),
      ACTIONS.indexOf("const scheduleEditSchema"),
    );
    assert.match(body, /canManageOpsLoans\(profile\.role\)/);
    assert.doesNotMatch(body, /canRecordOpsLoanRepayment/);
  });
});

describe("loans reach the payables cash picture without becoming payables", () => {
  const PAYABLES = readFileSync(
    join(import.meta.dirname, "..", "src", "app", "ops", "(workspace)", "payment-requests", "page.tsx"),
    "utf8",
  );

  it("shows debt service in the 30-day signal", () => {
    // They compete for the same cash, which is the whole reason to show them
    // together (loans design §2).
    assert.match(PAYABLES, /fetchOpsLoanRegister/);
    assert.match(PAYABLES, /Debt service/);
  });

  it("hides it from roles who cannot see the loan register", () => {
    // The payables view is open to Operations, Projects, Procurement and the
    // QS. The company's debt position is not theirs to see.
    assert.match(PAYABLES, /canViewOpsLoans\(auth\.profile\.role\)/);
    assert.match(PAYABLES, /\{loanSignal \?/);
  });

  it("does not query the register at all for those roles", () => {
    // Gating the render but still fetching would leak it into logs and cost a
    // query for nothing.
    assert.match(
      PAYABLES,
      /canViewOpsLoans\(auth\.profile\.role\)\s*\?\s*await fetchOpsLoanRegister\(\)/,
    );
  });

  it("never turns an instalment into a payment_requests row", () => {
    // The line the whole module rests on: a loan is not a payable.
    const LOAN_ACTIONS = readFileSync(
      join(import.meta.dirname, "..", "src", "lib", "ops", "loan-actions.ts"),
      "utf8",
    );
    assert.doesNotMatch(LOAN_ACTIONS, /payment_requests/);
  });
});
