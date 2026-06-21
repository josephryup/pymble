import {
  resolveZambianTaxYear,
  type ZambianTaxYearRates,
} from "@/lib/ops/statutory/rates";

export type PayslipBreakdown = {
  /** Tax year used for the calculation (resolved from the payroll period). */
  taxYear: number;
  /**
   * Citation string suitable for the payslip footer. Tells the worker which
   * version of the rules was applied.
   */
  citation: string;
  /** Gross pay before any deductions. */
  gross: number;
  /** Income tax (PAYE) owed by the worker. */
  paye: number;
  /** Employee NAPSA contribution (deducted from worker). */
  napsaEmployee: number;
  /** Employer NAPSA contribution (paid on top, not deducted). */
  napsaEmployer: number;
  /** Workers' Compensation Fund employer contribution. */
  wcfEmployer: number;
  /** Sum of every deduction that comes off the worker's gross. */
  totalEmployeeDeductions: number;
  /** Net pay the worker actually receives. */
  net: number;
  /**
   * What the company pays in total to and for this worker — gross plus the
   * employer-side contributions (NAPSA employer + WCF). Useful for project
   * cost tracking.
   */
  employerTotalCost: number;
};

function roundToCents(amount: number) {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

/**
 * Compute monthly PAYE using marginal-band semantics. Each Kwacha is taxed
 * at the rate of the band it falls into. The result is the sum across bands.
 */
export function computePaye(
  monthlyGross: number,
  rates: ZambianTaxYearRates,
): number {
  if (monthlyGross <= 0) return 0;
  let tax = 0;
  for (const band of rates.payeMonthlyBands) {
    if (monthlyGross <= band.from) break;
    const taxableInBand = Math.min(monthlyGross, band.to) - band.from;
    if (taxableInBand <= 0) continue;
    tax += taxableInBand * band.rate;
  }
  return roundToCents(tax);
}

export function computeNapsaEmployee(
  monthlyGross: number,
  rates: ZambianTaxYearRates,
): number {
  if (monthlyGross <= 0) return 0;
  return roundToCents(
    Math.min(monthlyGross * rates.napsaEmployeeRate, rates.napsaMonthlyCeiling),
  );
}

export function computeNapsaEmployer(
  monthlyGross: number,
  rates: ZambianTaxYearRates,
): number {
  if (monthlyGross <= 0) return 0;
  return roundToCents(
    Math.min(monthlyGross * rates.napsaEmployerRate, rates.napsaMonthlyCeiling),
  );
}

export function computeWcfEmployer(
  monthlyGross: number,
  rates: ZambianTaxYearRates,
): number {
  if (monthlyGross <= 0) return 0;
  return roundToCents(monthlyGross * rates.wcfEmployerRate);
}

/**
 * One-shot helper for a single worker's payslip. Pass the gross pay for the
 * period plus the period date (used to resolve which tax year's rules apply).
 */
export function computePayslip(
  monthlyGross: number,
  periodDate: Date | string,
): PayslipBreakdown {
  const rates = resolveZambianTaxYear(periodDate);
  const gross = roundToCents(Math.max(monthlyGross, 0));
  const paye = computePaye(gross, rates);
  const napsaEmployee = computeNapsaEmployee(gross, rates);
  const napsaEmployer = computeNapsaEmployer(gross, rates);
  const wcfEmployer = computeWcfEmployer(gross, rates);
  const totalEmployeeDeductions = roundToCents(paye + napsaEmployee);
  const net = roundToCents(gross - totalEmployeeDeductions);
  const employerTotalCost = roundToCents(gross + napsaEmployer + wcfEmployer);

  return {
    taxYear: rates.year,
    citation: rates.citation,
    gross,
    paye,
    napsaEmployee,
    napsaEmployer,
    wcfEmployer,
    totalEmployeeDeductions,
    net,
    employerTotalCost,
  };
}
