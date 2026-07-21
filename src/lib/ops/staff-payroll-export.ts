import * as XLSX from "xlsx";
import type { OpsStaffPayrollItem, OpsStaffPayrollRun } from "@/lib/ops/staff-payroll";

type ExportRun = Pick<
  OpsStaffPayrollRun,
  "period_label" | "period_start" | "period_end" | "status"
>;

const CURRENCY_FORMAT = '[$ZMW] #,##0.00';
const HEADER_ROW = 8;
const COLUMN_HEADERS = [
  "Employee no.",
  "Employee name",
  "Department",
  "Job title",
  "Basic pay",
  "Housing allowance",
  "Other allowances",
  "Gross pay",
  "PAYE",
  "NAPSA (employee)",
  "NHIMA (employee)",
  "Advance deduction",
  "Net pay",
  "NAPSA (employer)",
  "NHIMA (employer)",
  "WCF (employer)",
  "Total employer cost",
];

const MONEY_COLUMNS = new Set([4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);

function money(value: number) {
  return Math.round(value * 100) / 100;
}

export function staffPayrollExportFilename(periodLabel: string) {
  const safePeriod = periodLabel
    .trim()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `pymble-staff-payroll-${safePeriod || "run"}.xlsx`;
}

/** Builds a single-sheet, finance-ready staff payroll register. */
export function buildStaffPayrollExportXlsx(run: ExportRun, items: OpsStaffPayrollItem[]): Buffer {
  const statutory = items.reduce(
    (totals, item) => ({
      paye: totals.paye + item.paye_amount,
      napsaEmployee: totals.napsaEmployee + item.napsa_employee,
      nhimaEmployee: totals.nhimaEmployee + item.nhima_employee,
      napsaEmployer: totals.napsaEmployer + item.napsa_employer,
      nhimaEmployer: totals.nhimaEmployer + item.nhima_employer,
      wcfEmployer: totals.wcfEmployer + item.wcf_employer,
    }),
    { paye: 0, napsaEmployee: 0, nhimaEmployee: 0, napsaEmployer: 0, nhimaEmployer: 0, wcfEmployer: 0 },
  );

  const rows: Array<Array<string | number>> = [
    ["PYMBLE CONSTRUCTION — STAFF PAYROLL REGISTER"],
    [`Payroll period: ${run.period_label}`],
    [`${run.period_start} to ${run.period_end} · Status: ${run.status}`],
    [],
    ["Employees", items.length, "Gross pay", money(items.reduce((sum, item) => sum + item.gross_pay, 0)), "Net pay", money(items.reduce((sum, item) => sum + item.net_pay, 0))],
    ["PAYE", money(statutory.paye), "NAPSA (employee)", money(statutory.napsaEmployee), "NHIMA (employee)", money(statutory.nhimaEmployee), "Advance deductions", money(items.reduce((sum, item) => sum + item.advance_deduction, 0))],
    ["NAPSA (employer)", money(statutory.napsaEmployer), "NHIMA (employer)", money(statutory.nhimaEmployer), "WCF (employer)", money(statutory.wcfEmployer)],
    COLUMN_HEADERS,
    ...items.map((item) => [
      item.employee_number,
      item.full_name,
      item.department,
      item.job_title,
      item.basic_pay,
      item.housing_allowance,
      item.other_allowances,
      item.gross_pay,
      item.paye_amount,
      item.napsa_employee,
      item.nhima_employee,
      item.advance_deduction,
      item.net_pay,
      item.napsa_employer,
      item.nhima_employer,
      item.wcf_employer,
      money(item.gross_pay + item.napsa_employer + item.nhima_employer + item.wcf_employer),
    ]),
    [
      "TOTAL",
      "",
      "",
      "",
      ...Array.from({ length: 13 }, (_, index) => {
        const columnIndex = index + 4;
        return money(items.reduce((sum, item) => {
          const values = [item.basic_pay, item.housing_allowance, item.other_allowances, item.gross_pay, item.paye_amount, item.napsa_employee, item.nhima_employee, item.advance_deduction, item.net_pay, item.napsa_employer, item.nhima_employer, item.wcf_employer, item.gross_pay + item.napsa_employer + item.nhima_employer + item.wcf_employer];
          return sum + values[columnIndex - 4];
        }, 0));
      }),
    ],
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  worksheet["!merges"] = [
    XLSX.utils.decode_range("A1:Q1"),
    XLSX.utils.decode_range("A2:Q2"),
    XLSX.utils.decode_range("A3:Q3"),
  ];
  worksheet["!cols"] = [
    { wch: 16 }, { wch: 28 }, { wch: 20 }, { wch: 24 },
    ...Array.from({ length: 13 }, () => ({ wch: 17 })),
  ];
  worksheet["!autofilter"] = { ref: `A${HEADER_ROW}:Q${HEADER_ROW + items.length}` };
  worksheet["!freeze"] = { xSplit: 0, ySplit: HEADER_ROW };

  for (let column = 0; column < COLUMN_HEADERS.length; column += 1) {
    const cell = worksheet[XLSX.utils.encode_cell({ r: HEADER_ROW - 1, c: column })];
    if (cell) cell.s = { fill: { fgColor: { rgb: "17365D" } }, font: { bold: true, color: { rgb: "FFFFFF" } }, alignment: { horizontal: "center", vertical: "center", wrapText: true } };
  }
  for (let row = HEADER_ROW; row <= HEADER_ROW + items.length; row += 1) {
    for (const column of MONEY_COLUMNS) {
      const cell = worksheet[XLSX.utils.encode_cell({ r: row, c: column })];
      if (cell) cell.z = CURRENCY_FORMAT;
    }
  }
  for (const address of ["A1", "A2", "A3"]) {
    const cell = worksheet[address];
    if (cell) cell.s = { font: { bold: address === "A1", sz: address === "A1" ? 16 : 11, color: { rgb: address === "A1" ? "17365D" : "404040" } } };
  }
  const totalRow = HEADER_ROW + items.length + 1;
  for (let column = 0; column < COLUMN_HEADERS.length; column += 1) {
    const cell = worksheet[XLSX.utils.encode_cell({ r: totalRow - 1, c: column })];
    if (cell) cell.s = { fill: { fgColor: { rgb: "D9EAF7" } }, font: { bold: true } };
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Payroll register");
  return XLSX.write(workbook, { bookType: "xlsx", type: "buffer", cellStyles: true }) as Buffer;
}
