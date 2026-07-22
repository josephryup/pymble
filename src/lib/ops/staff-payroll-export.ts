import { readFile } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import type { OpsStaffPayrollItem, OpsStaffPayrollRun } from "@/lib/ops/staff-payroll";

type ExportRun = Pick<OpsStaffPayrollRun, "period_label" | "period_start" | "period_end" | "status">;

const NAVY = "17365D";
const BLUE = "1F4E78";
const PALE_BLUE = "D9EAF7";
const PALE_YELLOW = "FFF2CC";
const PALE_GREEN = "E2F0D9";
const PALE_GREY = "F3F6F9";
const WHITE = "FFFFFF";
const CURRENCY_FORMAT = '[$ZMW] #,##0.00';
const HEADER_ROW = 9;
const DATA_ROW = HEADER_ROW + 1;

const COLUMNS = [
  ["Employee no.", 16], ["Employee name", 28], ["Department", 20], ["Job title", 24],
  ["Basic pay", 16], ["Housing allowance", 18], ["Other allowances", 18], ["Gross pay", 16],
  ["PAYE", 14], ["NAPSA (employee)", 18], ["NHIMA (employee)", 18], ["Advance deduction", 18], ["Net pay", 16],
  ["NAPSA (employer)", 18], ["NHIMA (employer)", 18], ["WCF (employer)", 18], ["Total employer cost", 20],
  ["Bank name", 20], ["Branch", 18], ["Account number", 22],
] as const;

const money = (value: number) => Math.round(value * 100) / 100;

function total(items: OpsStaffPayrollItem[], selector: (item: OpsStaffPayrollItem) => number) {
  return money(items.reduce((sum, item) => sum + selector(item), 0));
}

function styleCell(cell: ExcelJS.Cell, options: Partial<ExcelJS.Style>) {
  cell.style = { ...cell.style, ...options };
}

export function staffPayrollExportFilename(periodLabel: string) {
  const safePeriod = periodLabel.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
  return `pymble-staff-payroll-${safePeriod || "run"}.xlsx`;
}

/** Builds a branded, print-ready single-sheet payroll register for stakeholders. */
export async function buildStaffPayrollExportXlsx(run: ExportRun, items: OpsStaffPayrollItem[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Pymble Construction Operations";
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet("Payroll register", {
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
    views: [{ state: "frozen", ySplit: HEADER_ROW }],
    properties: { defaultRowHeight: 18 },
  });
  worksheet.views = [{ showGridLines: false, state: "frozen", ySplit: HEADER_ROW }];
  worksheet.columns = COLUMNS.map(([, width]) => ({ width }));
  worksheet.pageSetup.margins = { left: 0.25, right: 0.25, top: 0.4, bottom: 0.4, header: 0.15, footer: 0.15 };

  const logo = (await readFile(path.join(process.cwd(), "public", "logo.png"))).toString("base64");
  const logoId = workbook.addImage({ base64: logo, extension: "png" });
  worksheet.addImage(logoId, "A1:C3");

  worksheet.mergeCells("D1:T1");
  worksheet.mergeCells("D2:T2");
  worksheet.mergeCells("D3:T3");
  worksheet.getCell("D1").value = "PYMBLE CONSTRUCTION";
  worksheet.getCell("D2").value = "STAFF PAYROLL REGISTER";
  worksheet.getCell("D3").value = `Payroll period: ${run.period_label}  |  ${run.period_start} to ${run.period_end}  |  Status: ${run.status.toUpperCase()}`;
  worksheet.getRow(1).height = 26;
  worksheet.getRow(2).height = 24;
  worksheet.getRow(3).height = 22;
  styleCell(worksheet.getCell("D1"), { font: { bold: true, size: 16, color: { argb: WHITE } }, fill: { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } }, alignment: { vertical: "middle" } });
  styleCell(worksheet.getCell("D2"), { font: { bold: true, size: 13, color: { argb: NAVY } }, alignment: { vertical: "middle" } });
  styleCell(worksheet.getCell("D3"), { font: { italic: true, color: { argb: "404040" } }, alignment: { vertical: "middle" } });

  const employeeStatutory = total(items, (item) => item.napsa_employee + item.nhima_employee);
  const employerStatutory = total(items, (item) => item.napsa_employer + item.nhima_employer + item.wcf_employer);
  const cards = [
    ["A5:C5", "A6:C6", "Total gross pay", total(items, (item) => item.gross_pay), PALE_BLUE],
    ["D5:F5", "D6:F6", "Total net pay", total(items, (item) => item.net_pay), PALE_GREEN],
    ["G5:I5", "G6:I6", "PAYE payable", total(items, (item) => item.paye_amount), PALE_YELLOW],
    ["J5:L5", "J6:L6", "Employee statutory", employeeStatutory, PALE_YELLOW],
    ["M5:O5", "M6:O6", "Employer statutory", employerStatutory, PALE_YELLOW],
  ] as const;
  for (const [labelRange, valueRange, label, value, color] of cards) {
    worksheet.mergeCells(labelRange);
    worksheet.mergeCells(valueRange);
    const labelCell = worksheet.getCell(labelRange.slice(0, 2));
    const valueCell = worksheet.getCell(valueRange.slice(0, 2));
    labelCell.value = label;
    valueCell.value = value;
    styleCell(labelCell, { font: { bold: true, size: 10, color: { argb: NAVY } }, fill: { type: "pattern", pattern: "solid", fgColor: { argb: color } }, alignment: { horizontal: "center", vertical: "middle" } });
    styleCell(valueCell, { font: { bold: true, size: 13, color: { argb: NAVY } }, fill: { type: "pattern", pattern: "solid", fgColor: { argb: color } }, alignment: { horizontal: "center", vertical: "middle" }, numFmt: CURRENCY_FORMAT });
  }
  worksheet.getCell("Q5").value = "Employees";
  worksheet.getCell("Q6").value = items.length;
  styleCell(worksheet.getCell("Q5"), { font: { bold: true, color: { argb: NAVY } }, fill: { type: "pattern", pattern: "solid", fgColor: { argb: PALE_GREY } }, alignment: { horizontal: "center" } });
  styleCell(worksheet.getCell("Q6"), { font: { bold: true, size: 13, color: { argb: NAVY } }, fill: { type: "pattern", pattern: "solid", fgColor: { argb: PALE_GREY } }, alignment: { horizontal: "center" } });

  const groups = [["A8:D8", "Employee details"], ["E8:H8", "Earnings"], ["I8:M8", "Employee deductions"], ["N8:Q8", "Employer contributions"], ["R8:T8", "Bank details"]] as const;
  for (const [range, label] of groups) {
    worksheet.mergeCells(range);
    const cell = worksheet.getCell(range.slice(0, 2));
    cell.value = label;
    styleCell(cell, { font: { bold: true, color: { argb: WHITE } }, fill: { type: "pattern", pattern: "solid", fgColor: { argb: BLUE } }, alignment: { horizontal: "center", vertical: "middle" } });
  }
  worksheet.getRow(8).height = 20;
  worksheet.getRow(HEADER_ROW).values = COLUMNS.map(([header]) => header);
  worksheet.getRow(HEADER_ROW).height = 32;
  worksheet.getRow(HEADER_ROW).eachCell((cell, columnNumber) => {
    styleCell(cell, { font: { bold: true, color: { argb: WHITE } }, fill: { type: "pattern", pattern: "solid", fgColor: { argb: columnNumber >= 9 && columnNumber <= 17 ? "806000" : NAVY } }, alignment: { horizontal: "center", vertical: "middle", wrapText: true }, border: { bottom: { style: "medium", color: { argb: NAVY } } } });
  });

  items.forEach((item, index) => {
    const row = worksheet.getRow(DATA_ROW + index);
    row.values = [
      item.employee_number, item.full_name, item.department, item.job_title,
      item.basic_pay, item.housing_allowance, item.other_allowances, item.gross_pay,
      item.paye_amount, item.napsa_employee, item.nhima_employee, item.advance_deduction, item.net_pay,
      item.napsa_employer, item.nhima_employer, item.wcf_employer,
      money(item.gross_pay + item.napsa_employer + item.nhima_employer + item.wcf_employer),
      item.bank_name ?? "", item.bank_branch ?? "", item.bank_account_number ?? "",
    ];
    row.eachCell((cell, columnNumber) => {
      const fill = columnNumber === 13 ? PALE_GREEN : columnNumber >= 9 && columnNumber <= 17 ? PALE_YELLOW : index % 2 === 0 ? WHITE : PALE_GREY;
      styleCell(cell, { fill: { type: "pattern", pattern: "solid", fgColor: { argb: fill } }, alignment: { vertical: "middle", horizontal: columnNumber >= 5 && columnNumber <= 17 ? "right" : "left" }, border: { bottom: { style: "hair", color: { argb: "D9E2F3" } } } });
      if (columnNumber >= 5 && columnNumber <= 17) cell.numFmt = CURRENCY_FORMAT;
    });
  });

  const totalRow = worksheet.getRow(DATA_ROW + items.length);
  totalRow.values = [
    "TOTAL", "", "", "",
    total(items, (item) => item.basic_pay), total(items, (item) => item.housing_allowance), total(items, (item) => item.other_allowances), total(items, (item) => item.gross_pay),
    total(items, (item) => item.paye_amount), total(items, (item) => item.napsa_employee), total(items, (item) => item.nhima_employee), total(items, (item) => item.advance_deduction), total(items, (item) => item.net_pay),
    total(items, (item) => item.napsa_employer), total(items, (item) => item.nhima_employer), total(items, (item) => item.wcf_employer), total(items, (item) => item.gross_pay + item.napsa_employer + item.nhima_employer + item.wcf_employer),
    "", "", "",
  ];
  totalRow.height = 22;
  totalRow.eachCell((cell, columnNumber) => {
    styleCell(cell, { font: { bold: true, color: { argb: NAVY } }, fill: { type: "pattern", pattern: "solid", fgColor: { argb: PALE_BLUE } }, border: { top: { style: "medium", color: { argb: NAVY } } }, alignment: { horizontal: columnNumber >= 5 && columnNumber <= 17 ? "right" : "left", vertical: "middle" } });
    if (columnNumber >= 5 && columnNumber <= 17) cell.numFmt = CURRENCY_FORMAT;
  });
  worksheet.autoFilter = `A${HEADER_ROW}:T${DATA_ROW + items.length - 1}`;
  worksheet.headerFooter.oddFooter = "Generated by Pymble Operations · Page &P of &N";

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
