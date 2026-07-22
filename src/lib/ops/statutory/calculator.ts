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

export type StaffPayslipInput = {
  /** Contract basic pay. */
  basic: number;
  /** Housing allowance. */
  housing: number;
  /** All other monthly allowances (transport, phone, etc.) totalled. */
  otherAllowances?: number;
  /** Open staff advances applied to this run (deducted from net). */
  advanceDeduction?: number;
  /** Payroll period date used to pick the right ZRA rates. */
  periodDate: Date | string;
  /** Whether NAPSA, NHIMA, and WCF contributions apply to this employee. */
  statutoryContributionsEnabled?: boolean;
};

export type StaffPayslipBreakdown = PayslipBreakdown & {
  /** Earnings breakdown (sum equals gross). */
  basic: number;
  housing: number;
  otherAllowances: number;
  /** NHIMA employee contribution (deducted from worker, 1% of basic pay). */
  nhimaEmployee: number;
  /** NHIMA employer contribution (paid on top, 1% of basic pay). */
  nhimaEmployer: number;
  /** Staff advance applied this run (deducted from net pay). */
  advanceDeduction: number;
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

export function computeNhimaEmployee(
  monthlyBasic: number,
  rates: ZambianTaxYearRates,
): number {
  if (monthlyBasic <= 0) return 0;
  return roundToCents(monthlyBasic * rates.nhimaEmployeeRate);
}

export function computeNhimaEmployer(
  monthlyBasic: number,
  rates: ZambianTaxYearRates,
): number {
  if (monthlyBasic <= 0) return 0;
  return roundToCents(monthlyBasic * rates.nhimaEmployerRate);
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

/**
 * Compute a full staff payslip: earnings (basic + housing + other) plus every
 * statutory deduction the PCL payslip shows — PAYE, NAPSA (employee), NHIMA
 * (employee) — plus the staff advance applied this run. NAPSA-employer, NHIMA-
 * employer, and WCF are tracked separately for company-cost reporting.
 */
export function computeStaffPayslip(input: StaffPayslipInput): StaffPayslipBreakdown {
  const rates = resolveZambianTaxYear(input.periodDate);

  const basic = roundToCents(Math.max(input.basic, 0));
  const housing = roundToCents(Math.max(input.housing, 0));
  const otherAllowances = roundToCents(Math.max(input.otherAllowances ?? 0, 0));
  const gross = roundToCents(basic + housing + otherAllowances);

  const paye = computePaye(gross, rates);
  const statutoryContributionsEnabled = input.statutoryContributionsEnabled !== false;
  const napsaEmployee = statutoryContributionsEnabled ? computeNapsaEmployee(gross, rates) : 0;
  const napsaEmployer = statutoryContributionsEnabled ? computeNapsaEmployer(gross, rates) : 0;
  const nhimaEmployee = statutoryContributionsEnabled ? computeNhimaEmployee(basic, rates) : 0;
  const nhimaEmployer = statutoryContributionsEnabled ? computeNhimaEmployer(basic, rates) : 0;
  const wcfEmployer = statutoryContributionsEnabled ? computeWcfEmployer(gross, rates) : 0;

  const requestedAdvance = roundToCents(Math.max(input.advanceDeduction ?? 0, 0));
  const statutoryDeductions = roundToCents(paye + napsaEmployee + nhimaEmployee);
  // Don't let an advance push net below zero — cap at remaining pay.
  const advanceDeduction = Math.min(
    requestedAdvance,
    roundToCents(Math.max(gross - statutoryDeductions, 0)),
  );

  const totalEmployeeDeductions = roundToCents(statutoryDeductions + advanceDeduction);
  const net = roundToCents(gross - totalEmployeeDeductions);
  const employerTotalCost = roundToCents(gross + napsaEmployer + nhimaEmployer + wcfEmployer);

  return {
    taxYear: rates.year,
    citation: rates.citation,
    gross,
    basic,
    housing,
    otherAllowances,
    paye,
    napsaEmployee,
    napsaEmployer,
    nhimaEmployee,
    nhimaEmployer,
    wcfEmployer,
    advanceDeduction,
    totalEmployeeDeductions,
    net,
    employerTotalCost,
  };
}
