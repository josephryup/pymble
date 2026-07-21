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
  // Should resolve to the highest year in the table (currently 2025) and
  // mention the fallback in the citation
  assert.equal(future.year, 2025);
  assert.match(future.citation, /not yet confirmed/i);
});

const RATES_2025 = ZAMBIAN_TAX_YEARS["2025"];
const AUGUST_2025 = new Date("2025-08-15T00:00:00+02:00");

test("NHIMA helpers compute 1/1 of gross under 2025 rates", () => {
  assert.equal(computeNhimaEmployee(31_000, RATES_2025), 310);
  assert.equal(computeNhimaEmployer(31_000, RATES_2025), 310);
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
  assert.equal(slip.nhimaEmployee, 310);
  assert.equal(slip.advanceDeduction, 0);
  assert.equal(slip.totalEmployeeDeductions, 10_748);
  assert.equal(slip.net, 20_252);
});

test("computeStaffPayslip never lets a staff advance push net below zero", () => {
  const slip = computeStaffPayslip({
    basic: 20_000,
    housing: 11_000,
    advanceDeduction: 100_000, // far more than remaining pay
    periodDate: AUGUST_2025,
  });
  // Statutory deductions take K10,748. Advance is capped at the remainder.
  assert.equal(slip.advanceDeduction, 31_000 - 10_748);
  assert.equal(slip.net, 0);
});

test("computeStaffPayslip can exclude NAPSA, NHIMA, and WCF per employee", () => {
  const slip = computeStaffPayslip({
    basic: 20_000,
    housing: 11_000,
    periodDate: AUGUST_2025,
    statutoryContributionsEnabled: false,
  });

  assert.equal(slip.paye, 9_096);
  assert.equal(slip.napsaEmployee, 0);
  assert.equal(slip.napsaEmployer, 0);
  assert.equal(slip.nhimaEmployee, 0);
  assert.equal(slip.nhimaEmployer, 0);
  assert.equal(slip.wcfEmployer, 0);
  assert.equal(slip.net, 21_904);
});
