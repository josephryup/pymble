import * as XLSX from "xlsx";

/**
 * Downloadable import templates.
 *
 * Each template's header row uses column names that the matching importer's
 * header-alias map recognises (case-insensitively), so a file downloaded here,
 * edited, and re-uploaded imports cleanly. Keep these in sync with:
 *   - material-requests → MR_IMPORT_HEADER_ALIASES (material-request-actions.ts)
 *   - requisitions      → RFQ_IMPORT_HEADER_ALIASES (rfq-po-actions.ts)
 *   - boq               → CSV_HEADER_ALIASES (boq-actions.ts)
 */

export type OpsImportTemplateColumn = {
  /** Header text written to the file (must be a recognised importer header). */
  header: string;
  /** Whether the importer requires this column. */
  required: boolean;
  /** Example value for the sample row. */
  example: string;
};

export type OpsImportTemplate = {
  /** Human title shown in the UI. */
  title: string;
  /** Base file name (without extension). */
  filename: string;
  /** One-line description of what to do with the file. */
  description: string;
  columns: OpsImportTemplateColumn[];
};

export const OPS_IMPORT_TEMPLATE_KINDS = [
  "material-requests",
  "requisitions",
  "boq",
] as const;

export type OpsImportTemplateKind = (typeof OPS_IMPORT_TEMPLATE_KINDS)[number];

export function isOpsImportTemplateKind(value: string): value is OpsImportTemplateKind {
  return (OPS_IMPORT_TEMPLATE_KINDS as readonly string[]).includes(value);
}

export const OPS_IMPORT_TEMPLATES: Record<OpsImportTemplateKind, OpsImportTemplate> = {
  "material-requests": {
    title: "Material request items",
    filename: "pymble-material-request-items-template",
    description:
      "One row per material line. Item and Quantity are required; the rest are optional.",
    columns: [
      { header: "Item", required: true, example: "Cement 42.5N" },
      { header: "Unit", required: false, example: "bags" },
      { header: "Quantity", required: true, example: "120" },
      { header: "Estimate", required: false, example: "145.00" },
      { header: "Supplier", required: false, example: "Lafarge" },
      { header: "Specification", required: false, example: "50kg bags" },
      { header: "Notes", required: false, example: "For block work" },
    ],
  },
  requisitions: {
    title: "Requisition items",
    filename: "pymble-requisition-items-template",
    description:
      "One row per requisition line. Item and Quantity are required; the rest are optional.",
    columns: [
      { header: "Item", required: true, example: "Cement 42.5N" },
      { header: "Unit", required: false, example: "bags" },
      { header: "Quantity", required: true, example: "120" },
      { header: "Estimated Price", required: false, example: "145.00" },
      { header: "Actual Price", required: false, example: "150.00" },
      { header: "Supplier", required: false, example: "Lafarge" },
      { header: "Specification", required: false, example: "50kg bags" },
      { header: "Notes", required: false, example: "Quoted by supplier" },
    ],
  },
  boq: {
    title: "Material schedule lines",
    filename: "pymble-boq-lines-template",
    description:
      "One row per BOQ line. Description, Unit, Quantity, and Rate are required; the rest are optional.",
    columns: [
      { header: "Description", required: true, example: "Concrete grade 25" },
      { header: "Unit", required: true, example: "m3" },
      { header: "Quantity", required: true, example: "50" },
      { header: "Rate", required: true, example: "1850.00" },
      { header: "Actual Quantity", required: false, example: "0" },
      { header: "Supplier", required: false, example: "Local supplier" },
    ],
  },
};

function escapeCsvCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Build a CSV string: a header row plus one example row. */
export function buildOpsImportTemplateCsv(kind: OpsImportTemplateKind): string {
  const template = OPS_IMPORT_TEMPLATES[kind];
  const header = template.columns.map((column) => escapeCsvCell(column.header));
  const example = template.columns.map((column) => escapeCsvCell(column.example));
  return `${header.join(",")}\r\n${example.join(",")}\r\n`;
}

/** Build an .xlsx workbook (as a Node Buffer): a header row plus one example row. */
export function buildOpsImportTemplateXlsx(kind: OpsImportTemplateKind): Buffer {
  const template = OPS_IMPORT_TEMPLATES[kind];
  const rows = [
    template.columns.map((column) => column.header),
    template.columns.map((column) => column.example),
  ];
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  // Give the columns a sensible width so the template is readable in Excel.
  worksheet["!cols"] = template.columns.map((column) => ({
    wch: Math.max(column.header.length, column.example.length, 12) + 2,
  }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Template");
  return XLSX.write(workbook, { bookType: "xlsx", type: "buffer" }) as Buffer;
}
