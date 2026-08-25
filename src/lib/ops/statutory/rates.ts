/**
 * Zambian statutory rates for payroll and tax computation.
 *
 * IMPORTANT: every rate in this file is set by the Zambia Revenue Authority
 * (PAYE), NAPSA (National Pension Scheme Authority), or the Workers'
 * Compensation Fund. They CHANGE EVERY YEAR — usually in January via the
 * national budget. Before relying on these for live payroll, confirm against:
 *
 *   * https://www.zra.org.zm  (PAYE bands + VAT)
 *   * https://www.napsa.co.zm  (NAPSA contribution rate + ceiling)
 *   * https://www.wcfcb.co.zm  (Workers' Compensation Fund rates per industry)
 *
 * To update for a new tax year:
 *   1. Add a new entry to `ZAMBIAN_TAX_YEARS` keyed by the year string
 *   2. The active year is resolved from the payroll period date — historical
 *      runs continue to compute against the year they were originally run
 *   3. Update `CURRENT_TAX_YEAR` only after confirming the new bands are in
 *      force (usually 1 January)
 *
 * All amounts are in Zambian Kwacha (ZMW). All percentages are decimal
 * (e.g. 0.05 = 5%).
 */

export type PayeBand = {
  /** Lower bound of monthly taxable income, inclusive. */
  from: number;
  /** Upper bound, exclusive. Use Number.POSITIVE_INFINITY for the top band. */
  to: number;
  /** Marginal rate applied to income inside this band. */
  rate: number;
};

export type ZambianTaxYearRates = {
  /** Calendar year these rates apply to. */
  year: number;
  /** Monthly PAYE bands, sorted ascending. */
  payeMonthlyBands: PayeBand[];
  /** Mandatory employee NAPSA contribution rate. */
  napsaEmployeeRate: number;
  /** Mandatory employer NAPSA contribution rate. */
  napsaEmployerRate: number;
  /**
   * Monthly NAPSA contribution ceiling per side (employee, employer). When
   * the computed contribution exceeds this, cap it.
   */
  napsaMonthlyCeiling: number;
  /**
   * National Health Insurance Scheme (NHIMA) employee contribution rate.
   * Applied on basic pay per Pymble's policy decision.
   */
  nhimaEmployeeRate: number;
  /** NHIMA employer contribution rate (paid on top of basic pay, not deducted). */
  nhimaEmployerRate: number;
  /**
   * Workers' Compensation Fund employer rate. Construction-industry default.
   * Update if the WCF reassessment moves Pymble into a different band.
   */
  wcfEmployerRate: number;
  /** Standard VAT rate (charged on invoices, claimed on inputs). */
  vatRate: number;
  /**
   * Citation note shown in the payslip footer so the worker knows which set
   * of rules was applied.
   */
  citation: string;
};

/**
 * Tax year rates. Add new entries here when ZRA publishes the next budget.
 * Old entries are kept so historical payroll runs reproduce identically.
 */
export const ZAMBIAN_TAX_YEARS: Record<string, ZambianTaxYearRates> = {
  "2024": {
    year: 2024,
    payeMonthlyBands: [
      { from: 0, to: 5_100, rate: 0 },
      { from: 5_100, to: 7_100, rate: 0.2 },
      { from: 7_100, to: 9_200, rate: 0.3 },
      { from: 9_200, to: Number.POSITIVE_INFINITY, rate: 0.375 },
    ],
    napsaEmployeeRate: 0.05,
    napsaEmployerRate: 0.05,
    napsaMonthlyCeiling: 1_377.3,
    nhimaEmployeeRate: 0.01,
    nhimaEmployerRate: 0.01,
    wcfEmployerRate: 0.02,
    vatRate: 0.16,
    citation:
      "PAYE per ZRA 2024 budget; NAPSA 5/5 capped at K1,377.30; NHIMA 1/1 on basic pay; WCF construction 2%; VAT 16%.",
  },
  "2025": {
    year: 2025,
    // 2025 ZRA budget: same bracket boundaries, top marginal rate reduced
    // from 37.5% to 37%. Reconciled against the August 2025 PCL payslip
    // sample (gross K31,000 → PAYE K9,096).
    payeMonthlyBands: [
      { from: 0, to: 5_100, rate: 0 },
      { from: 5_100, to: 7_100, rate: 0.2 },
      { from: 7_100, to: 9_200, rate: 0.3 },
      { from: 9_200, to: Number.POSITIVE_INFINITY, rate: 0.37 },
    ],
    napsaEmployeeRate: 0.05,
    napsaEmployerRate: 0.05,
    // 2025 NAPSA contribution ceiling (5% of an insurable-earnings cap of
    // K26,840). Reconciled against the PCL payslip sample (NAPSA K1,342).
    napsaMonthlyCeiling: 1_342,
    nhimaEmployeeRate: 0.01,
    nhimaEmployerRate: 0.01,
    wcfEmployerRate: 0.02,
    vatRate: 0.16,
    citation:
      "PAYE per ZRA 2025 budget (top band 37%); NAPSA 5/5 capped at K1,342; NHIMA 1/1 on basic pay; WCF construction 2%; VAT 16%.",
  },
  "2026": {
    year: 2026,
    // 2026 charge year: the PAYE bands are UNCHANGED from 2025. Confirmed
    // against PwC Worldwide Tax Summaries, which lists the 2026 annual bands as
    // 0–61,200 at 0%, 61,201–85,200 at 20%, 85,201–110,400 at 30% and above
    // 110,400 at 37% — exactly the 2025 monthly figures below (61,200/12 =
    // 5,100; 85,200/12 = 7,100; 110,400/12 = 9,200).
    //
    // Several public "Zambia PAYE calculator 2026" sites claim a 25% second
    // band, a 9,900 third threshold and a 37.5% top rate. They disagree with
    // PwC and with each other; they were NOT used. If ZRA publishes something
    // different, that is the source to follow — not an aggregator.
    payeMonthlyBands: [
      { from: 0, to: 5_100, rate: 0 },
      { from: 5_100, to: 7_100, rate: 0.2 },
      { from: 7_100, to: 9_200, rate: 0.3 },
      { from: 9_200, to: Number.POSITIVE_INFINITY, rate: 0.37 },
    ],
    napsaEmployeeRate: 0.05,
    napsaEmployerRate: 0.05,
    // THE ONE THING THAT MOVED. NAPSA revised the contribution ceiling from
    // 1 January 2026 after the Zambia Statistics Agency adjusted National
    // Average Earnings: the insurable-earnings cap rose from K26,840 to
    // K37,236 per month, so 5% of it is K1,861.80 per side (K3,723.60 total).
    //
    // That is a 38.7% jump, which is large enough to be worth a second look
    // before the first live run — but it is what NAPSA's own notice says and
    // what payroll vendors have implemented. It only affects anyone earning
    // above K26,840 a month; below that the contribution is 5% of gross and
    // the ceiling never binds.
    napsaMonthlyCeiling: 1_861.8,
    // Unchanged. NHIMA remains 1% each side. Note this codebase applies it to
    // BASIC pay rather than gross — a Pymble policy decision recorded when the
    // module was built, deliberately left alone here.
    nhimaEmployeeRate: 0.01,
    nhimaEmployerRate: 0.01,
    // Unchanged, and industry-assessed per employer rather than set nationally.
    // Revisit only if a WCF reassessment moves Pymble into a different band.
    wcfEmployerRate: 0.02,
    vatRate: 0.16,
    citation:
      "PAYE per ZRA 2026 charge year (bands unchanged from 2025, top band 37%); NAPSA 5/5 capped at K1,861.80 (ceiling K37,236 from 1 January 2026); NHIMA 1/1 on basic pay; WCF construction 2%; VAT 16%.",
  },
};

/**
 * Year used by default when a payroll period date can't be parsed.
 *
 * Computed dynamically: it's the highest year present in
 * `ZAMBIAN_TAX_YEARS` that is not in the future. When 2026 rates are added,
 * this automatically follows once the calendar tips over — no annual code
 * bump. Until then it stays on 2025 (the most recent confirmed year).
 */
export function currentTaxYear(): string {
  const today = new Date().getFullYear();
  const known = Object.keys(ZAMBIAN_TAX_YEARS)
    .map((key) => Number(key))
    .filter((year) => year <= today)
    .sort((a, b) => b - a);
  // Fall back to the highest known year if every entry is in the future
  // (shouldn't happen, but keeps the result well-defined).
  const resolved =
    known[0] ?? Math.max(...Object.keys(ZAMBIAN_TAX_YEARS).map((k) => Number(k)));
  return String(resolved);
}

/** @deprecated Use {@link currentTaxYear} — kept for backwards compatibility. */
export const CURRENT_TAX_YEAR = currentTaxYear();

/**
 * Resolve the rate table for a given payroll period.
 *
 * Looks up by calendar year. If the year isn't yet in the table (e.g. a
 * payroll run is started before the new year's rates are confirmed), falls
 * back to the most recent known year and logs a hint in the citation.
 */
export function resolveZambianTaxYear(forDate: Date | string): ZambianTaxYearRates {
  const date = typeof forDate === "string" ? new Date(forDate) : forDate;
  const year = String(
    Number.isNaN(date.getTime()) ? Number(currentTaxYear()) : date.getFullYear(),
  );
  if (year in ZAMBIAN_TAX_YEARS) {
    return ZAMBIAN_TAX_YEARS[year];
  }
  const fallbackYear = String(
    Math.max(
      ...Object.keys(ZAMBIAN_TAX_YEARS).map((key) => Number(key)),
    ),
  );
  const fallback = ZAMBIAN_TAX_YEARS[fallbackYear];
  return {
    ...fallback,
    citation: `${fallback.citation} (rates for ${year} not yet confirmed; using ${fallbackYear})`,
  };
}
