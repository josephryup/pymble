import test from "node:test";
import { strict as assert } from "node:assert";
import * as XLSX from "xlsx";
import {
  buildStaffPayrollExportXlsx,
  staffPayrollExportFilename,
} from "@/lib/ops/staff-payroll-export";
import type { OpsStaffPayrollItem } from "@/lib/ops/staff-payroll";

function item(overrides: Partial<OpsStaffPayrollItem>): OpsStaffPayrollItem {
  return {
    id: "item",
    staff_payroll_run_id: "run",
    employee_id: "employee",
    employee_number: "PCL-001",
    full_name: "Jane Doe",
    job_title: "Engineer",
    department: "Engineering",
    nrc_number: "",
    napsa_number: "",
    basic_pay: 1_000,
    housing_allowance: 100,
    other_allowances: 0,
    gross_pay: 1_100,
    paye_amount: 110,
    napsa_employee: 55,
    napsa_employer: 55,
    nhima_employee: 11,
    nhima_employer: 11,
    wcf_employer: 22,
    advance_deduction: 0,
    net_pay: 924,
    payout_status: "pending",
    payout_reference: null,
    tax_year: 2025,
    statutory_citation: null,
    bank_name: "",
    bank_branch: "",
    bank_account_number: "",
    created_at: "2025-08-31T00:00:00Z",
    ...overrides,
  };
}

test("staff payroll export contains one register sheet with statutory totals", async () => {
  const workbookBuffer = await buildStaffPayrollExportXlsx(
    { period_label: "August 2025", period_start: "2025-08-01", period_end: "2025-08-31", status: "draft" },
    [item({}), item({ id: "item-2", employee_number: "PCL-002", gross_pay: 2_200, paye_amount: 220, napsa_employee: 110, napsa_employer: 110, nhima_employee: 22, nhima_employer: 22, wcf_employer: 44, basic_pay: 2_000, housing_allowance: 200, net_pay: 1_848 })],
  );
  const workbook = XLSX.read(workbookBuffer, { type: "buffer" });
  const rows = XLSX.utils.sheet_to_json<Array<string | number>>(workbook.Sheets["Payroll register"], { header: 1 });

  assert.deepEqual(workbook.SheetNames, ["Payroll register"]);
  assert.equal(rows[0][3], "PYMBLE CONSTRUCTION");
  assert.equal(rows[1][3], "STAFF PAYROLL REGISTER");
  assert.equal(rows[5][0], 3_300);
  assert.equal(rows[7][0], "Employee details");
  assert.equal(rows[11][7], 3_300);
  assert.equal(rows[11][8], 330);
  assert.equal(rows[11][9], 165);
  assert.equal(rows[11][15], 66);
});

test("staff payroll export filename is safe for downloads", () => {
  assert.equal(staffPayrollExportFilename("August / 2025"), "pymble-staff-payroll-august-2025.xlsx");
});
