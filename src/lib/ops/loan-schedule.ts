/**
 * Loan repayment schedules.
 *
 * L1 of docs/pymble-ops-loans-design-2026-08.md. Pure — no database, no
 * Supabase — because this is the arithmetic that decides how much of every
 * instalment is interest, and interest is the only part that reaches the P&L.
 * Getting it wrong misstates profit every month in the same direction, so it
 * is proved against worked examples rather than against production data.
 *
 * Two bases, decided L-D1, and they are genuinely different loans rather than
 * a presentation choice:
 *
 *   flat              interest = principal × rate × years, split evenly.
 *                     Total repayable is fixed at signing. Common in Zambian
 *                     microfinance and asset finance.
 *   reducing_balance  interest each period = outstanding × periodic rate.
 *                     Standard bank amortisation; interest falls as the
 *                     principal is repaid.
 *
 * On K500,000 at 20% over 3 years that is K300,000 of interest against roughly
 * K167,000 — about 80% apart.
 */

export type OpsLoanRateBasis = "flat" | "reducing_balance";
export type OpsLoanFrequency = "monthly" | "quarterly";

export type OpsLoanScheduleInput = {
  /** Percent per year, e.g. 20 for 20%. Zero is valid — see shareholder loans. */
  annualRatePercent: number;
  /** ISO date of the first instalment. */
  firstPaymentDate: string;
  frequency: OpsLoanFrequency;
  principal: number;
  rateBasis: OpsLoanRateBasis;
  termMonths: number;
};

export type OpsLoanScheduleEntry = {
  closingBalance: number;
  dueDate: string;
  instalment: number;
  interest: number;
  openingBalance: number;
  principal: number;
  total: number;
};

export type OpsLoanSchedule = {
  entries: OpsLoanScheduleEntry[];
  totalInterest: number;
  totalPayable: number;
  /** Instalment count. Zero when the loan has no term (repayable on demand). */
  instalments: number;
};

const MONTHS_PER_PERIOD: Record<OpsLoanFrequency, number> = {
  monthly: 1,
  quarterly: 3,
};

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Advance a date by whole months, clamping to the end of the target month.
 *
 * A loan drawn on the 31st has instalments on the 30th, or the 28th in
 * February — every lender does this, and naive date arithmetic silently rolls
 * 31 January into 3 March.
 */
export function addMonthsClamped(isoDate: string, months: number) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const targetMonthIndex = month - 1 + months;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;

  // Day 0 of the following month is the last day of the target month.
  const lastDayOfTarget = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const clampedDay = Math.min(day, lastDayOfTarget);

  return new Date(Date.UTC(targetYear, targetMonth, clampedDay))
    .toISOString()
    .slice(0, 10);
}

/**
 * Build the repayment schedule.
 *
 * Returns an empty schedule — not an error — when there is no term. A
 * shareholder loan repayable on demand is a real liability with no instalments,
 * and refusing to model it would push it out of the system entirely.
 *
 * Rounding is absorbed by the FINAL instalment so the closing balance lands
 * exactly on zero. Spreading it would leave a loan that never quite clears, and
 * a balance of K0.03 outstanding forever is the kind of thing that makes people
 * stop trusting a ledger.
 */
export function buildOpsLoanSchedule(input: OpsLoanScheduleInput): OpsLoanSchedule {
  const monthsPerPeriod = MONTHS_PER_PERIOD[input.frequency];
  const principal = round2(input.principal);

  if (principal <= 0 || input.termMonths <= 0) {
    return { entries: [], instalments: 0, totalInterest: 0, totalPayable: 0 };
  }

  const count = Math.max(1, Math.round(input.termMonths / monthsPerPeriod));
  const periodsPerYear = 12 / monthsPerPeriod;
  const annualRate = input.annualRatePercent / 100;

  const entries: OpsLoanScheduleEntry[] =
    input.rateBasis === "flat"
      ? flatSchedule(principal, annualRate, input.termMonths, count)
      : reducingSchedule(principal, annualRate / periodsPerYear, count);

  let balance = principal;
  let totalInterest = 0;
  let totalPayable = 0;

  for (const [index, entry] of entries.entries()) {
    entry.instalment = index + 1;
    entry.dueDate = addMonthsClamped(input.firstPaymentDate, index * monthsPerPeriod);
    entry.openingBalance = round2(balance);
    balance = round2(balance - entry.principal);
    entry.closingBalance = round2(balance);
    totalInterest = round2(totalInterest + entry.interest);
    totalPayable = round2(totalPayable + entry.total);
  }

  return { entries, instalments: entries.length, totalInterest, totalPayable };
}

/**
 * Flat rate. Interest is charged on the ORIGINAL principal for the whole term
 * regardless of what has been repaid, which is exactly why it costs more than
 * the headline rate suggests.
 */
function flatSchedule(
  principal: number,
  annualRate: number,
  termMonths: number,
  count: number,
): OpsLoanScheduleEntry[] {
  const totalInterest = round2(principal * annualRate * (termMonths / 12));
  const principalPer = round2(principal / count);
  const interestPer = round2(totalInterest / count);

  return Array.from({ length: count }, (_, index) => {
    const isLast = index === count - 1;
    // The last instalment carries whatever rounding left behind, so the
    // schedule sums to the principal and the interest exactly.
    const principalPortion = isLast
      ? round2(principal - principalPer * (count - 1))
      : principalPer;
    const interestPortion = isLast
      ? round2(totalInterest - interestPer * (count - 1))
      : interestPer;

    return {
      closingBalance: 0,
      dueDate: "",
      instalment: 0,
      interest: interestPortion,
      openingBalance: 0,
      principal: principalPortion,
      total: round2(principalPortion + interestPortion),
    };
  });
}

/**
 * Reducing balance, as a level-payment annuity.
 *
 * At a zero rate the annuity formula divides by zero, so it degenerates to
 * equal principal instalments with no interest — which is the correct answer
 * for an interest-free shareholder loan, not a special case bolted on.
 */
function reducingSchedule(
  principal: number,
  periodicRate: number,
  count: number,
): OpsLoanScheduleEntry[] {
  const payment =
    periodicRate === 0
      ? round2(principal / count)
      : round2(
          (principal * periodicRate) / (1 - Math.pow(1 + periodicRate, -count)),
        );

  const entries: OpsLoanScheduleEntry[] = [];
  let balance = principal;

  for (let index = 0; index < count; index++) {
    const isLast = index === count - 1;
    const interest = round2(balance * periodicRate);
    // The final instalment clears whatever is left, so rounding drift across
    // the term cannot leave a residual balance.
    const principalPortion = isLast ? round2(balance) : round2(payment - interest);

    entries.push({
      closingBalance: 0,
      dueDate: "",
      instalment: 0,
      interest,
      openingBalance: 0,
      principal: principalPortion,
      total: round2(principalPortion + interest),
    });

    balance = round2(balance - principalPortion);
  }

  return entries;
}

/**
 * What is still owed.
 *
 * Derived from the principal actually repaid, never stored — the same rule as
 * receivables (decision D6). A stored balance and a list of repayments are two
 * records of one fact, and the stored one is always the one that goes stale.
 *
 * Note it is the PRINCIPAL portions that reduce the debt. Summing the total
 * paid would clear the loan early by the whole interest bill, which is the
 * single easiest way to get this wrong.
 */
export function outstandingLoanBalance(
  principal: number,
  repayments: Array<{ principal_portion: number; status: string }>,
) {
  const repaid = repayments
    .filter((repayment) => repayment.status === "paid")
    .reduce((sum, repayment) => sum + repayment.principal_portion, 0);

  return round2(Math.max(principal - repaid, 0));
}
