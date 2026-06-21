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
    wcfEmployerRate: 0.02,
    vatRate: 0.16,
    citation:
      "PAYE per ZRA 2024 budget; NAPSA 5/5 capped at K1,377.30; WCF construction 2%; VAT 16%.",
  },
  "2025": {
    year: 2025,
    payeMonthlyBands: [
      { from: 0, to: 5_100, rate: 0 },
      { from: 5_100, to: 7_100, rate: 0.2 },
      { from: 7_100, to: 9_200, rate: 0.3 },
      { from: 9_200, to: Number.POSITIVE_INFINITY, rate: 0.375 },
    ],
    napsaEmployeeRate: 0.05,
    napsaEmployerRate: 0.05,
    napsaMonthlyCeiling: 1_377.3,
    wcfEmployerRate: 0.02,
    vatRate: 0.16,
    citation:
      "PAYE per ZRA 2025 budget; NAPSA 5/5 capped at K1,377.30; WCF construction 2%; VAT 16%. Verify against the latest ZRA Practice Note before payroll run.",
  },
};

/**
 * Year used by default for new payroll runs. Bump when a new budget lands
 * and the rates have been confirmed.
 */
export const CURRENT_TAX_YEAR = "2025";

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
    Number.isNaN(date.getTime()) ? Number(CURRENT_TAX_YEAR) : date.getFullYear(),
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
