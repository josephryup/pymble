import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

/**
 * Guards for the payables/receivables split
 * (docs/pymble-ops-payables-receivables-split-2026-08.md).
 *
 * Two of these protect a tax record and one protects a boundary that took an
 * audit to find. All three are source-level because all three fail silently:
 * a duplicate invoice number is a valid row, an edited one is a valid update,
 * and a receivables panel on the payables page renders perfectly well. Nothing
 * throws; the meaning is just wrong.
 */

const ROOT = join(import.meta.dirname, "..", "src");

function read(...parts: string[]) {
  return readFileSync(join(ROOT, ...parts), "utf8");
}

const INVOICE_ACTIONS = read("lib", "ops", "invoice-actions.ts");
const PAYABLES_PAGE = read("app", "ops", "(workspace)", "payment-requests", "page.tsx");
const INVOICES_PAGE = read("app", "ops", "(workspace)", "invoices", "page.tsx");
const CONSTANTS = read("lib", "ops", "constants.ts");

describe("the invoice number is allocated, never supplied", () => {
  it("is always generated on create", () => {
    assert.match(
      INVOICE_ACTIONS,
      /const invoiceNumber = await nextInvoiceNumber\(/,
      "the number must come from the counter unconditionally",
    );
  });

  it("cannot be supplied by the create form", () => {
    // An override bypassed ops_next_invoice_number entirely, so two invoices
    // could share a number — a ZRA problem, not a cosmetic one.
    const createSchema = INVOICE_ACTIONS.slice(
      INVOICE_ACTIONS.indexOf("const createInvoiceSchema"),
      INVOICE_ACTIONS.indexOf("const invoiceIdSchema"),
    );

    assert.doesNotMatch(
      createSchema,
      /invoice_number/,
      "createInvoiceSchema must not accept an invoice number",
    );
  });

  it("cannot be changed by an edit", () => {
    // Per ZRA a consumed number stays on file even when voided, so editing it
    // would let someone reuse or reorder a filed tax number.
    const updateSchema = INVOICE_ACTIONS.slice(
      INVOICE_ACTIONS.indexOf("const updateInvoiceSchema"),
      INVOICE_ACTIONS.indexOf("const voidInvoiceSchema"),
    );

    assert.doesNotMatch(
      updateSchema,
      /invoice_number/,
      "updateInvoiceSchema must not accept an invoice number",
    );
  });

  it("is not read off the form by either action, so a crafted POST cannot set it", () => {
    assert.doesNotMatch(
      INVOICE_ACTIONS,
      /field\(formData, "invoice_number"\)/,
      "no action may read invoice_number from the form",
    );
  });
});

describe("the BOQ link is gone from invoices", () => {
  it("is not read from the form or written to the row", () => {
    // Matched as code, not as the word: the header comment in invoice-actions
    // explains why boq_id was dropped, and a guard that trips on its own
    // explanation is a guard people delete.
    assert.doesNotMatch(
      INVOICE_ACTIONS,
      /field\(formData, "boq_id"\)/,
      "invoice-actions must not read boq_id from the form",
    );
    assert.doesNotMatch(
      INVOICE_ACTIONS,
      /^\s*boq_id:/m,
      "invoice-actions must not write boq_id — source/source_id replaces it",
    );
  });

  it("is not offered by the invoice form", () => {
    assert.doesNotMatch(INVOICES_PAGE, /name="boq_id"/);
    assert.doesNotMatch(INVOICES_PAGE, /fetchOpsBoqOptions/);
  });
});

describe("payables and receivables stay apart", () => {
  it("the payables page shows nothing a client owes", () => {
    // The whole point of the split. Receivables ageing, open receivables and
    // the receivables mix all lived here because Finance had no receivables
    // page — and the two were impossible to read apart.
    assert.doesNotMatch(
      PAYABLES_PAGE,
      /fetchOpsReceivablesAgeing/,
      "the payables page must not fetch receivables ageing",
    );

    for (const field of ["openReceivables", "draftReceivables", "sentReceivables"]) {
      assert.doesNotMatch(
        PAYABLES_PAGE,
        new RegExp(`cashflowDashboard\\.${field}`),
        `the payables page must not read ${field}`,
      );
    }
  });

  it("the invoice register is where receivables ageing lives now", () => {
    assert.match(INVOICES_PAGE, /fetchOpsReceivablesAgeing/);
    assert.match(INVOICES_PAGE, /Receivables ageing/);
  });
});

describe("nav placement", () => {
  /** The nav entry object for a module id, by brace matching backwards. */
  function navEntry(id: string) {
    const marker = `id: "${id}",`;
    const at = CONSTANTS.indexOf(marker);
    assert.notEqual(at, -1, `nav entry ${id} not found`);

    const start = CONSTANTS.lastIndexOf("{", at);
    let depth = 0;
    for (let cursor = start; cursor < CONSTANTS.length; cursor++) {
      if (CONSTANTS[cursor] === "{") depth++;
      else if (CONSTANTS[cursor] === "}" && --depth === 0) {
        return CONSTANTS.slice(start, cursor + 1);
      }
    }
    throw new Error(`unbalanced braces around ${id}`);
  }

  it("invoices and customers sit in finance, not commercial", () => {
    // Filing them under Commercial is the root cause the audit found: the
    // finance side of receivables had nowhere to live, so it was bolted onto
    // the payables page.
    for (const id of ["invoices", "customers"]) {
      assert.match(navEntry(id), /group: "finance"/, `${id} belongs in the finance group`);
    }
  });

  it("payables keeps its route while carrying the new label", () => {
    const entry = navEntry("payment-requests");

    assert.match(entry, /title: "Payables"/);
    // The route is load-bearing: delivered notification hrefs, module_access
    // keys, and every audit event's module_key point at it.
    assert.match(entry, /href: "\/ops\/payment-requests"/);
  });
});
