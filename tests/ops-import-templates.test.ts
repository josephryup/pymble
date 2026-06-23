import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as XLSX from "xlsx";
import { parseCsvRows } from "../src/lib/ops/boq-imports";
import {
  buildOpsImportTemplateCsv,
  buildOpsImportTemplateXlsx,
  isOpsImportTemplateKind,
  OPS_IMPORT_TEMPLATE_KINDS,
  OPS_IMPORT_TEMPLATES,
} from "../src/lib/ops/import-templates";

describe("import templates", () => {
  it("recognises only the known kinds", () => {
    assert.equal(isOpsImportTemplateKind("requisitions"), true);
    assert.equal(isOpsImportTemplateKind("material-requests"), true);
    assert.equal(isOpsImportTemplateKind("boq"), true);
    assert.equal(isOpsImportTemplateKind("nope"), false);
  });

  it("every kind defines required columns and an example row", () => {
    for (const kind of OPS_IMPORT_TEMPLATE_KINDS) {
      const template = OPS_IMPORT_TEMPLATES[kind];
      assert.ok(template.columns.length > 0, `${kind} has columns`);
      assert.ok(
        template.columns.some((column) => column.required),
        `${kind} has at least one required column`,
      );
      for (const column of template.columns) {
        assert.ok(column.header.length > 0, `${kind} header non-empty`);
      }
    }
  });

  it("CSV is a header row plus one example row matching the column definitions", () => {
    for (const kind of OPS_IMPORT_TEMPLATE_KINDS) {
      const rows = parseCsvRows(buildOpsImportTemplateCsv(kind)).filter((row) =>
        row.some((cell) => cell.trim().length > 0),
      );
      const template = OPS_IMPORT_TEMPLATES[kind];
      assert.equal(rows.length, 2, `${kind} has header + example`);
      assert.deepEqual(
        rows[0],
        template.columns.map((column) => column.header),
      );
      assert.deepEqual(
        rows[1],
        template.columns.map((column) => column.example),
      );
    }
  });

  it("XLSX round-trips the same header row", () => {
    for (const kind of OPS_IMPORT_TEMPLATE_KINDS) {
      const workbook = XLSX.read(buildOpsImportTemplateXlsx(kind), { type: "buffer" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const grid = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });
      assert.deepEqual(
        grid[0],
        OPS_IMPORT_TEMPLATES[kind].columns.map((column) => column.header),
      );
    }
  });
});
