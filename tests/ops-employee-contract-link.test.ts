import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const root = join(import.meta.dirname, "..");

function readSource(relativePath: string) {
  return readFileSync(join(root, relativePath), "utf8");
}

const contractsSource = readSource("src/lib/ops/contracts.ts");
const employeesPageSource = readSource("src/app/ops/(workspace)/employees/page.tsx");
const detailSource = readSource("src/components/ops/OpsContractDetailPage.tsx");
const remunerationMigration = readSource(
  "supabase/migrations/20260825091000_pymble_ops_contract_remuneration.sql",
);

/**
 * The body of one top-level function, bounded by the next one.
 *
 * A fixed byte window overran into the neighbouring EmployeeContractsPanel,
 * which legitimately renders pay — so the "no pay figures here" assertion was
 * reading the wrong function and failing for the wrong reason.
 */
function functionBody(source: string, name: string) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start > -1, `${name} not found`);
  const next = source.slice(start + 1).search(/^function /m);
  return source.slice(start, next === -1 ? undefined : start + 1 + next);
}

describe("the employee record shows the signed instruments", () => {
  it("fetches them for the listed employees", () => {
    assert.match(employeesPageSource, /fetchOpsEmployeeContractDocuments\(/);
    assert.match(
      employeesPageSource,
      /employeePage\.items\.map\(\(employee\) => employee\.id\)/,
    );
  });

  it("renders them separately from the pay records", () => {
    // Two different things: employee_contracts is what payroll pays against,
    // contracts is the document signed. Showing them as one list is how the
    // two systems came to be confused for each other in the first place.
    assert.match(employeesPageSource, /function EmployeeContractDocumentsPanel/);
    assert.match(employeesPageSource, /Pay records/);
    assert.match(employeesPageSource, /Signed contracts/);
  });

  it("links each one to the HR contract route", () => {
    assert.match(employeesPageSource, /opsContractHref\("employment", document\.id\)/);
  });

  it("shows signature progress without naming who signed", () => {
    // "Is this executed yet?" is an employee-record question. Who signed and
    // when belongs on the contract page, behind its own gate and audit trail.
    const block = functionBody(employeesPageSource, "EmployeeContractDocumentsPanel");
    assert.match(
      block,
      /\$\{document\.signatures_signed\} of \$\{document\.signatures_total\} signed/,
    );
    assert.equal(
      /signed_name|signed_by_user_id|verification_code/.test(block),
      false,
      "the employee panel must not expose signatory identity",
    );
  });

  it("carries no pay figures on the employee page", () => {
    // The schedule lives on the contract, behind the contract's gate. A
    // salary rendered here would ride on the employee page's wider access.
    const block = functionBody(employeesPageSource, "EmployeeContractDocumentsPanel");
    // Field reads, not the English word — the panel's own copy mentions the
    // "remuneration schedule" to say where the figures live, which is the
    // opposite of leaking them.
    for (const field of [
      "basic",
      "housing",
      "gross",
      "net",
      "paye",
      "napsa",
      "nhima",
      "salary_amount",
      "remuneration_snapshot",
      "employee_contract_id",
    ]) {
      assert.equal(
        new RegExp(`document\\.${field}\\b`).test(block),
        false,
        `the signed-contracts panel must not read ${field}`,
      );
    }
    // And no currency is formatted here at all.
    assert.equal(
      /formatZmw|ZMW/.test(block),
      false,
      "no money may be rendered in the signed-contracts panel",
    );
  });
});

describe("the fetcher gates before it reads", () => {
  it("refuses a role that cannot see pay, and returns empty rather than throwing", () => {
    const start = contractsSource.indexOf("export async function fetchOpsEmployeeContractDocuments");
    const block = contractsSource.slice(start, start + 900);
    assert.match(block, /if \(!canViewOpsContracts\(profile\.role\)\) return empty;/);
    assert.match(block, /if \(!canViewOpsPersonalContracts\(profile\.role\)\) return empty;/);
    // Empty, not an error: the Admin/Receptionist reaches this page legitimately
    // for the directory and the leave diary. An empty list is the honest
    // answer for them, and leaves nothing to probe.
  });

  it("reads only employment contracts", () => {
    const start = contractsSource.indexOf("export async function fetchOpsEmployeeContractDocuments");
    const block = contractsSource.slice(start, start + 1400);
    assert.match(block, /\.eq\("kind", "employment"\)/);
    assert.match(block, /\.is\("archived_at", null\)/);
  });

  it("selects no pay column", () => {
    const start = contractsSource.indexOf("export async function fetchOpsEmployeeContractDocuments");
    const block = contractsSource.slice(start, start + 1400);
    assert.equal(
      /remuneration_snapshot|employee_contract_id/.test(block),
      false,
      "the employee-page fetcher must not pull pay columns",
    );
  });
});

describe("the contract links back to the employee", () => {
  it("offers a way back to the employee record", () => {
    assert.match(detailSource, /Open the employee record/);
    assert.match(detailSource, /\/ops\/employees\?q=/);
  });

  it("names the pay record the schedule came from", () => {
    assert.match(detailSource, /remuneration\.source_contract_number/);
  });
});

describe("the link cannot outlive what it points at", () => {
  it("restricts deletion of a pay record a contract depends on", () => {
    // A signed contract must not lose the figures behind it because somebody
    // tidied the HR register.
    assert.match(
      remunerationMigration,
      /employee_contract_id uuid\s*\n?\s*references public\.employee_contracts\(id\) on delete restrict/,
    );
  });

  it("indexes the link so the employee page stays cheap", () => {
    assert.match(remunerationMigration, /contracts_employee_contract_idx/);
  });
});
