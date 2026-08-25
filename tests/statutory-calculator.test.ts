 import test from "node:test";
import { strict as assert } from "node:assert";
import {
  computeNapsaEmployee,
  computeNapsaEmployer,
  computeNhimaEmployee,
  computeNhimaEmployer,
  computePaye,
  computePayslip,
  computeStaffPayslip,
  computeWcfEmployer,
} from "@/lib/ops/statutory/calculator";
import {
  resolveZambianTaxYear,
  ZAMBIAN_TAX_YEARS,
} from "@/lib/ops/statutory/rates";

const RATES_2024 = ZAMBIAN_TAX_YEARS["2024"];

test("computePaye applies marginal bands correctly", () => {
  // Below first tax band → no PAYE
  assert.equal(computePaye(4000, RATES_2024), 0);

  // K6,000: tax-free up to K5,100, then 20% on the K900 above
  // 900 * 0.20 = 180
  assert.equal(computePaye(6000, RATES_2024), 180);

  // K8,000: 0% up to 5,100; 20% on (7,100-5,100)=2,000 = 400; 30% on (8,000-7,100)=900 = 270
  // total = 670
  assert.equal(computePaye(8000, RATES_2024), 670);

  // K10,000: 0 + 400 + 30% on 2,100 = 630, + 37.5% on 800 = 300
  // total = 1330
  assert.equal(computePaye(10000, RATES_2024), 1330);

  // Negative or zero gross → no PAYE
  assert.equal(computePaye(0, RATES_2024), 0);
  assert.equal(computePaye(-500, RATES_2024), 0);
});

test("computeNapsa applies the rate then caps at the monthly ceiling", () => {
  // K10,000 * 5% = K500 (well under ceiling)
  assert.equal(computeNapsaEmployee(10000, RATES_2024), 500);
  assert.equal(computeNapsaEmployer(10000, RATES_2024), 500);

  // K50,000 * 5% = K2,500 → capped at K1,377.30
  assert.equal(computeNapsaEmployee(50000, RATES_2024), 1377.3);
  assert.equal(computeNapsaEmployer(50000, RATES_2024), 1377.3);

  // Zero or negative gross
  assert.equal(computeNapsaEmployee(0, RATES_2024), 0);
  assert.equal(computeNapsaEmployer(-100, RATES_2024), 0);
});

test("computeWcfEmployer applies the construction sector rate", () => {
  assert.equal(computeWcfEmployer(10000, RATES_2024), 200);
  assert.equal(computeWcfEmployer(0, RATES_2024), 0);
});

test("computePayslip produces a full breakdown for a representative wage", () => {
  // K8,000 monthly, computed for a 2024 payroll period
  const slip = computePayslip(8000, "2024-06-15");

  assert.equal(slip.taxYear, 2024);
  assert.equal(slip.gross, 8000);
  assert.equal(slip.paye, 670);
  assert.equal(slip.napsaEmployee, 400); // 8000 * 5%
  assert.equal(slip.napsaEmployer, 400);
  assert.equal(slip.wcfEmployer, 160); // 8000 * 2%
  assert.equal(slip.totalEmployeeDeductions, 1070); // PAYE + NAPSA employee
  assert.equal(slip.net, 6930); // 8000 - 1070
  assert.equal(slip.employerTotalCost, 8560); // 8000 + 400 + 160
});

test("resolveZambianTaxYear falls back to the most recent year for unknown years", () => {
  const future = resolveZambianTaxYear("2099-01-01");
  // The highest year in the table, whichever that is — asserting a literal
  // year here means this test fails every time a new charge year is added,
  // which is exactly when nobody wants a spurious red.
  const newest = Math.max(...Object.keys(ZAMBIAN_TAX_YEARS).map(Number));
  assert.equal(future.year, newest);
  // And it must say so, so a payslip computed on provisional bands admits it.
  assert.match(future.citation, /not yet confirmed/i);
});

const RATES_2025 = ZAMBIAN_TAX_YEARS["2025"];
const AUGUST_2025 = new Date("2025-08-15T00:00:00+02:00");

test("NHIMA helpers compute 1/1 of basic pay under 2025 rates", () => {
  assert.equal(computeNhimaEmployee(20_000, RATES_2025), 200);
  assert.equal(computeNhimaEmployer(20_000, RATES_2025), 200);
  assert.equal(computeNhimaEmployee(0, RATES_2025), 0);
});

test("PAYE for 2025 uses the 37% top band (PCL August 2025 sample)", () => {
  // From the PCL Aug 2025 payslip: gross K31,000 → PAYE K9,096
  assert.equal(computePaye(31_000, RATES_2025), 9_096);
});

test("computeStaffPayslip reproduces the PCL August 2025 payslip", () => {
  const slip = computeStaffPayslip({
    basic: 20_000,
    housing: 11_000,
    periodDate: AUGUST_2025,
  });
  assert.equal(slip.taxYear, 2025);
  assert.equal(slip.basic, 20_000);
  assert.equal(slip.housing, 11_000);
  assert.equal(slip.otherAllowances, 0);
  assert.equal(slip.gross, 31_000);
  assert.equal(slip.paye, 9_096);
  assert.equal(slip.napsaEmployee, 1_342);
  assert.equal(slip.nhimaEmployee, 200);
  assert.equal(slip.advanceDeduction, 0);
  assert.equal(slip.totalEmployeeDeductions, 10_638);
  assert.equal(slip.net, 20_362);
});

test("computeStaffPayslip never lets a staff advance push net below zero", () => {
  const slip = computeStaffPayslip({
    basic: 20_000,
    housing: 11_000,
    advanceDeduction: 100_000, // far more than remaining pay
    periodDate: AUGUST_2025,
  });
  // Statutory deductions take K10,638. Advance is capped at the remainder.
  assert.equal(slip.advanceDeduction, 31_000 - 10_638);
  assert.equal(slip.net, 0);
});

test("opting out of statutory deductions pays the full gross — PAYE included", () => {
  // The flag used to drop only NAPSA/NHIMA/WCF and still withhold PAYE. For a
  // non-employment engagement that is wrong: they invoice gross and settle
  // their own tax with ZRA.
  const slip = computeStaffPayslip({
    basic: 20_000,
    housing: 11_000,
    periodDate: AUGUST_2025,
    statutoryContributionsEnabled: false,
  });

  assert.equal(slip.gross, 31_000);
  assert.equal(slip.paye, 0);
  assert.equal(slip.napsaEmployee, 0);
  assert.equal(slip.napsaEmployer, 0);
  assert.equal(slip.nhimaEmployee, 0);
  assert.equal(slip.nhimaEmployer, 0);
  assert.equal(slip.wcfEmployer, 0);
  assert.equal(slip.totalEmployeeDeductions, 0);
  assert.equal(slip.net, slip.gross);
});

test("an opted-out person costs the employer exactly their gross", () => {
  const slip = computeStaffPayslip({
    basic: 18_000,
    housing: 4_000,
    otherAllowances: 3_000,
    periodDate: AUGUST_2025,
    statutoryContributionsEnabled: false,
  });

  assert.equal(slip.employerTotalCost, slip.gross);
  assert.equal(slip.employerTotalCost, 25_000);
});

test("advances are still recovered from an opted-out person", () => {
  // Repaying an advance is not a deduction — it is money already received.
  const slip = computeStaffPayslip({
    basic: 20_000,
    housing: 0,
    advanceDeduction: 5_000,
    periodDate: AUGUST_2025,
    statutoryContributionsEnabled: false,
  });

  assert.equal(slip.paye, 0);
  assert.equal(slip.advanceDeduction, 5_000);
  assert.equal(slip.totalEmployeeDeductions, 5_000);
  assert.equal(slip.net, 15_000);
});

test("opting out does not change anyone else's payslip", () => {
  const optedIn = computeStaffPayslip({
    basic: 20_000,
    housing: 11_000,
    periodDate: AUGUST_2025,
  });

  // Same inputs as the opted-out case above; PAYE and contributions still apply.
  assert.equal(optedIn.gross, 31_000);
  assert.ok(optedIn.paye > 0);
  assert.ok(optedIn.napsaEmployee > 0);
  assert.ok(optedIn.net < optedIn.gross);
});

// ---------------------------------------------------------------------------
// 2026 charge year
// ---------------------------------------------------------------------------
//
// Added 2026-08-25, when the table still stopped at 2025 and every payslip run
// this year was silently falling back to the 2025 bands with a disclaimer
// appended to the citation.

const AUGUST_2026 = "2026-08-31";

test("2026 resolves to its own rates, not a fallback", () => {
  const rates = resolveZambianTaxYear(AUGUST_2026);
  assert.equal(rates.year, 2026);
  // The fallback path appends this; its absence is the point of the change.
  assert.equal(
    /not yet confirmed/.test(rates.citation),
    false,
    "2026 must no longer be computed on provisional bands",
  );
});

test("2026 PAYE bands are unchanged from 2025", () => {
  // PwC Worldwide Tax Summaries lists the 2026 annual bands as 0–61,200 at 0%,
  // 61,201–85,200 at 20%, 85,201–110,400 at 30%, above 110,400 at 37% — the
  // same figures as 2025 once divided by twelve. Several public "2026 PAYE
  // calculator" sites claim a 25% band and a 37.5% top rate; they disagree with
  // PwC and with each other, and are not what this table follows.
  assert.deepEqual(
    ZAMBIAN_TAX_YEARS["2026"].payeMonthlyBands,
    ZAMBIAN_TAX_YEARS["2025"].payeMonthlyBands,
  );

  // Annual thresholds, checked directly against the published table.
  const bands = ZAMBIAN_TAX_YEARS["2026"].payeMonthlyBands;
  assert.equal(bands[0].to * 12, 61_200);
  assert.equal(bands[1].to * 12, 85_200);
  assert.equal(bands[2].to * 12, 110_400);
  assert.equal(bands[3].rate, 0.37);
});

test("PAYE is identical in 2025 and 2026 for the same gross", () => {
  for (const gross of [4_000, 12_000, 16_500, 26_840, 40_000]) {
    const y2025 = computeStaffPayslip({ basic: gross, housing: 0, periodDate: AUGUST_2025 });
    const y2026 = computeStaffPayslip({ basic: gross, housing: 0, periodDate: AUGUST_2026 });
    assert.equal(y2026.paye, y2025.paye, `PAYE moved at gross ${gross}`);
  }
});

test("the 2026 NAPSA ceiling rose to K1,861.80", () => {
  // NAPSA revised the insurable-earnings cap from K26,840 to K37,236 a month
  // effective 1 January 2026, following a ZamStats adjustment to National
  // Average Earnings. 5% of K37,236 is K1,861.80 per side.
  const rates = ZAMBIAN_TAX_YEARS["2026"];
  assert.equal(rates.napsaMonthlyCeiling, 1_861.8);
  assert.equal(rates.napsaMonthlyCeiling, roundCents(37_236 * 0.05));

  // The cap binds at the ceiling and not before.
  assert.equal(computeNapsaEmployee(37_236, rates), 1_861.8);
  assert.equal(computeNapsaEmployee(100_000, rates), 1_861.8);
  assert.equal(computeNapsaEmployee(20_000, rates), 1_000);
});

test("nobody below the old ceiling sees any change at all", () => {
  // The only thing that moved for 2026 is a cap that binds above K26,840, so
  // most of the payroll must be penny-identical year on year.
  for (const gross of [4_000, 12_000, 16_500, 26_840]) {
    const y2025 = computeStaffPayslip({ basic: gross, housing: 0, periodDate: AUGUST_2025 });
    const y2026 = computeStaffPayslip({ basic: gross, housing: 0, periodDate: AUGUST_2026 });
    assert.equal(y2026.net, y2025.net, `net moved at gross ${gross}`);
    assert.equal(y2026.napsaEmployee, y2025.napsaEmployee);
  }
});

test("above the old ceiling, more NAPSA is withheld and net falls", () => {
  const y2025 = computeStaffPayslip({ basic: 40_000, housing: 0, periodDate: AUGUST_2025 });
  const y2026 = computeStaffPayslip({ basic: 40_000, housing: 0, periodDate: AUGUST_2026 });

  assert.equal(y2025.napsaEmployee, 1_342);
  assert.equal(y2026.napsaEmployee, 1_861.8);
  // The extra contribution is the whole of the difference — PAYE did not move.
  assert.equal(
    Number((y2025.net - y2026.net).toFixed(2)),
    Number((1_861.8 - 1_342).toFixed(2)),
  );
  // And the employer pays the same increase on its own side.
  assert.equal(y2026.napsaEmployer, 1_861.8);
});

function roundCents(value: number) {
  return Math.round(value * 100) / 100;
}
