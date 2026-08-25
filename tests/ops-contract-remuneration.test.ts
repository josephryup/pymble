import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { buildOpsContractRemuneration } from "../src/lib/ops/contract-remuneration";
import {
  opsContractHasSection,
  opsContractSectionForField,
  OPS_CONTRACT_KIND_SECTIONS,
  OPS_CONTRACT_MERGE_TOKENS,
  OPS_CONTRACT_SECTION_FIELDS,
  type OpsContractSection,
} from "../src/lib/ops/contract-types";
import {
  listOpsOtherAllowances,
  readOpsEmployeePayStructure,
  sumOpsOtherAllowances,
} from "../src/lib/ops/employee-pay";
import { computeStaffPayslip } from "../src/lib/ops/statutory/calculator";

const root = join(import.meta.dirname, "..");

function readSource(relativePath: string) {
  return readFileSync(join(root, relativePath), "utf8");
}

const actionsSource = readSource("src/lib/ops/contract-actions.ts");
const contractsSource = readSource("src/lib/ops/contracts.ts");
// Phase 3 moved the page bodies into shared components; the route files are
// thin wrappers that fix the kind. The section logic under test lives here.
const detailPageSource = readSource("src/components/ops/OpsContractDetailPage.tsx");
const payrollSource = readSource("src/lib/ops/staff-payroll-actions.ts");
const remunerationMigration = readSource(
  "supabase/migrations/20260825091000_pymble_ops_contract_remuneration.sql",
);
const templateMigration = readSource(
  "supabase/migrations/20260825092000_pymble_ops_employment_template_v2.sql",
);

const PERIOD = "2026-08-31";

const PAY_ROW = {
  id: "11111111-1111-1111-1111-111111111111",
  contract_number: "EC-20260801-ABC123",
  status: "active",
  pay_frequency: "monthly",
  leave_rate_per_month: 2.5,
  basic_pay: 12000,
  housing_allowance: 3000,
  other_allowances: [
    { label: "Transport", amount: 1200 },
    { label: "Phone", amount: 300 },
  ],
};

describe("reading a pay structure", () => {
  it("sums the itemised allowances", () => {
    assert.equal(sumOpsOtherAllowances(PAY_ROW.other_allowances), 1500);
  });

  it("ignores a null column rather than throwing", () => {
    // The column defaults to '[]' but predates a NOT NULL on older rows. A
    // payroll run must not fail because one contract has a null here.
    assert.equal(sumOpsOtherAllowances(null), 0);
    assert.equal(sumOpsOtherAllowances(undefined), 0);
    assert.equal(sumOpsOtherAllowances("not an array"), 0);
  });

  it("ignores a negative entry — that is a deduction, not an allowance", () => {
    assert.equal(sumOpsOtherAllowances([{ amount: 500 }, { amount: -200 }]), 500);
  });

  it("derives gross as basic + housing + allowances", () => {
    const structure = readOpsEmployeePayStructure(PAY_ROW);
    assert.equal(structure.basic, 12000);
    assert.equal(structure.housing, 3000);
    assert.equal(structure.otherAllowances, 1500);
    assert.equal(structure.gross, 16500);
  });

  it("names each allowance for the contract schedule", () => {
    const items = listOpsOtherAllowances(PAY_ROW.other_allowances);
    assert.deepEqual(
      items.map((item) => item.label),
      ["Transport", "Phone"],
    );
  });
});

describe("the contract and the payslip cannot disagree", () => {
  it("computes the same figures the payroll run would", () => {
    // Not a re-implementation check — a same-source check. Both call
    // computeStaffPayslip through the same allowance reader, so if either side
    // ever grows its own copy of the arithmetic this fails.
    const schedule = buildOpsContractRemuneration({
      payRow: PAY_ROW,
      statutoryApplies: true,
      periodDate: PERIOD,
    });

    const payslip = computeStaffPayslip({
      basic: 12000,
      housing: 3000,
      otherAllowances: 1500,
      advanceDeduction: 0,
      periodDate: PERIOD,
      statutoryContributionsEnabled: true,
    });

    assert.equal(schedule.gross, payslip.gross);
    assert.equal(schedule.paye, payslip.paye);
    assert.equal(schedule.napsa_employee, payslip.napsaEmployee);
    assert.equal(schedule.nhima_employee, payslip.nhimaEmployee);
    assert.equal(schedule.net, payslip.net);
  });

  it("reads the allowance column through the shared function on both sides", () => {
    assert.match(payrollSource, /sumOpsOtherAllowances/);
    assert.match(payrollSource, /from "@\/lib\/ops\/employee-pay"/);
    // The private copy is gone, so the two cannot drift.
    assert.equal(
      /function sumOtherAllowances/.test(payrollSource),
      false,
      "staff-payroll-actions must not keep its own allowance summer",
    );
  });

  it("does not deduct advances — those belong to a payroll run, not a contract", () => {
    const schedule = buildOpsContractRemuneration({
      payRow: PAY_ROW,
      statutoryApplies: true,
      periodDate: PERIOD,
    });
    const withoutAdvance = computeStaffPayslip({
      basic: 12000,
      housing: 3000,
      otherAllowances: 1500,
      periodDate: PERIOD,
      statutoryContributionsEnabled: true,
    });
    assert.equal(schedule.net, withoutAdvance.net);
  });
});

describe("the statutory basis", () => {
  it("withholds nothing when contributions do not apply", () => {
    const schedule = buildOpsContractRemuneration({
      payRow: PAY_ROW,
      statutoryApplies: false,
      periodDate: PERIOD,
    });

    assert.equal(schedule.statutory_applies, false);
    assert.equal(schedule.paye, 0);
    assert.equal(schedule.napsa_employee, 0);
    assert.equal(schedule.nhima_employee, 0);
    assert.equal(schedule.total_deductions, 0);
    // Paid gross, and costing the employer exactly that.
    assert.equal(schedule.net, schedule.gross);
    assert.equal(schedule.employer_total_cost, schedule.gross);
  });

  it("withholds PAYE and both contributions when it applies", () => {
    const schedule = buildOpsContractRemuneration({
      payRow: PAY_ROW,
      statutoryApplies: true,
      periodDate: PERIOD,
    });

    assert.ok(schedule.paye > 0, "PAYE is withheld");
    assert.ok(schedule.napsa_employee > 0, "NAPSA is deducted");
    assert.ok(schedule.nhima_employee > 0, "NHIMA is deducted");
    assert.ok(schedule.net < schedule.gross, "net is below gross");
    // The employer side is paid on top, never deducted from the worker.
    assert.ok(schedule.employer_total_cost > schedule.gross);
  });

  it("defaults to applying when the setting is absent", () => {
    // An accidental NULL must not quietly hand somebody their gross.
    assert.match(
      readSource("src/lib/ops/contract-remuneration.ts"),
      /statutory_contributions_enabled !== false/,
    );
  });

  it("carries the rate year and citation so the schedule can be audited", () => {
    const schedule = buildOpsContractRemuneration({
      payRow: PAY_ROW,
      statutoryApplies: true,
      periodDate: PERIOD,
    });

    // The 2026 rates were loaded on 2026-08-25. Before that this schedule
    // resolved to 2025 and carried a "not yet confirmed" disclaimer, which the
    // contract printed verbatim — correct behaviour, but not a state to leave a
    // signed instrument in.
    assert.equal(schedule.tax_year, 2026);
    assert.equal(
      /not yet confirmed/.test(schedule.citation),
      false,
      "an approved contract must not carry a provisional-rates disclaimer",
    );
    assert.match(schedule.citation, /ZRA 2026 charge year/);
  });
});

describe("the schedule freezes at approval", () => {
  it("freezes alongside the counterparty, in the same update", () => {
    assert.match(actionsSource, /buildOpsContractRemunerationSnapshot\(contract\)/);
    assert.match(actionsSource, /remuneration_snapshot: remunerationSnapshot,/);
  });

  it("refuses to approve an employment contract with no schedule", () => {
    assert.match(
      actionsSource,
      /This employment contract has no pay schedule\. Link it to the employee's pay record before approving\./,
    );
  });

  it("has the database enforce the same rule", () => {
    assert.match(
      remunerationMigration,
      /contracts_employment_approved_has_remuneration/,
    );
    assert.match(remunerationMigration, /remuneration_snapshot \? 'net'/);
  });

  it("prefers the frozen snapshot over a live recompute", () => {
    const source = readSource("src/lib/ops/contract-remuneration.ts");
    assert.match(source, /Frozen wins whenever it exists/);
    assert.match(source, /"net" in \(snapshot as object\)/);
  });
});

describe("pay never reaches a list read", () => {
  it("keeps remuneration_snapshot out of the shared contract select", () => {
    // A column never selected on the list path is a column no list read can
    // leak. The detail fetch reads it separately, by id, after the gate.
    const selectBlock = contractsSource.slice(
      contractsSource.indexOf("const CONTRACT_SELECT"),
      contractsSource.indexOf("].join(\", \");", contractsSource.indexOf("const CONTRACT_SELECT")),
    );
    assert.equal(
      selectBlock.includes("remuneration_snapshot"),
      false,
      "remuneration_snapshot must not be in CONTRACT_SELECT",
    );
  });

  it("attaches the schedule only after the visibility gate", () => {
    const gateAt = contractsSource.indexOf("canViewOpsContractSubject(profile.role, contract)");
    const attachAt = contractsSource.indexOf("resolveOpsContractRemuneration({");
    assert.ok(gateAt > 0 && attachAt > 0);
    assert.ok(
      attachAt > gateAt,
      "remuneration must be resolved after the gate, not before",
    );
  });

  it("only loads someone's pay history for an editor", () => {
    assert.match(
      detailPageSource,
      /canEdit && contract\.kind === "employment"\s*\n?\s*\? fetchOpsEmployeePayRecordOptions/,
    );
  });
});

describe("a pay record must belong to the contract's employee", () => {
  it("refuses one that belongs to somebody else", () => {
    // Without this a contract could quote a colleague's salary: employee_id is
    // on the contract, and employee_contract_id would be free to point anywhere.
    assert.match(actionsSource, /That pay record belongs to a different employee\./);
  });

  it("refuses a superseded or terminated record", () => {
    assert.match(actionsSource, /That pay record is no longer current\./);
  });

  it("keeps the figures out of the audit metadata", () => {
    const start = actionsSource.indexOf('action: "contract.remuneration_updated"');
    const block = actionsSource.slice(start, start + 700);
    assert.equal(/basic|gross|net_pay|salary/.test(block), false);
  });
});

describe("the section registry decides what each kind shows", () => {
  it("gives a subcontract its commercial sections and no pay schedule", () => {
    assert.equal(opsContractHasSection("subcontract", "commercial_terms"), true);
    assert.equal(opsContractHasSection("subcontract", "priced_lines"), true);
    assert.equal(opsContractHasSection("subcontract", "milestones"), true);
    assert.equal(opsContractHasSection("subcontract", "remuneration"), false);
    assert.equal(opsContractHasSection("subcontract", "employment_terms"), false);
  });

  it("gives an employment contract terms and pay, and none of the works sections", () => {
    assert.equal(opsContractHasSection("employment", "remuneration"), true);
    assert.equal(opsContractHasSection("employment", "employment_terms"), true);
    assert.equal(opsContractHasSection("employment", "commercial_terms"), false);
    assert.equal(opsContractHasSection("employment", "scope_of_works"), false);
    assert.equal(opsContractHasSection("employment", "priced_lines"), false);
    assert.equal(opsContractHasSection("employment", "milestones"), false);
    assert.equal(opsContractHasSection("employment", "min_workers"), false);
  });

  it("gives both kinds the programme and the instrument", () => {
    for (const kind of ["subcontract", "employment"] as const) {
      assert.equal(opsContractHasSection(kind, "programme"), true);
      assert.equal(opsContractHasSection(kind, "instrument"), true);
    }
  });

  it("maps every declared field back to exactly one section", () => {
    const seen = new Map<string, OpsContractSection>();
    for (const [section, fields] of Object.entries(OPS_CONTRACT_SECTION_FIELDS)) {
      for (const field of fields) {
        assert.equal(
          seen.has(field),
          false,
          `${field} is claimed by both ${seen.get(field)} and ${section}`,
        );
        seen.set(field, section as OpsContractSection);
        assert.equal(opsContractSectionForField(field), section);
      }
    }
  });

  it("declares a field list for every section a kind can own", () => {
    const declared = new Set(Object.keys(OPS_CONTRACT_SECTION_FIELDS));
    for (const sections of Object.values(OPS_CONTRACT_KIND_SECTIONS)) {
      for (const section of sections) {
        assert.equal(declared.has(section), true, `${section} has no field list`);
      }
    }
  });
});

describe("the write side refuses a field the kind does not own", () => {
  it("checks posted fields against the same registry the page renders from", () => {
    // Hiding an input is a presentation decision; a Server Action takes
    // whatever FormData reaches it — a stale tab or a hand-made POST alike.
    assert.match(actionsSource, /function assertOpsContractSectionAllowed/);
    assert.match(
      actionsSource,
      /assertOpsContractSectionAllowed\(contract, formData\);/,
    );
    assert.match(
      actionsSource,
      /An employment contract has no retention, penalties or priced works\./,
    );
  });

  it("builds the update from the registry rather than writing every column", () => {
    for (const section of [
      "commercial_terms",
      "min_workers",
      "employment_terms",
      "scope_of_works",
    ]) {
      assert.match(
        actionsSource,
        new RegExp(`opsContractHasSection\\(contract\\.kind, "${section}"\\)`),
        `the terms action must gate ${section}`,
      );
    }
  });

  it("refuses a pay schedule on a subcontract", () => {
    assert.match(actionsSource, /A subcontract has no pay schedule\./);
  });
});

describe("the detail page branches on kind", () => {
  it("reads the section flags from the registry", () => {
    for (const flag of [
      "showCommercialTerms",
      "showScopeOfWorks",
      "showPricedLines",
      "showMilestones",
      "showMinWorkers",
      "showEmploymentTerms",
      "showRemuneration",
    ]) {
      assert.match(detailPageSource, new RegExp(`const ${flag} = opsContractHasSection`));
    }
  });

  it("gates the three subcontract-only sections", () => {
    assert.match(detailPageSource, /\{showScopeOfWorks && \(contract\.scope_items/);
    assert.match(detailPageSource, /\{showPricedLines && \(contract\.lines/);
    assert.match(detailPageSource, /\{showMilestones && \(contract\.milestones/);
  });
});

describe("the clause wording now points at something real", () => {
  it("has merge tokens for the pay figures", () => {
    for (const token of [
      "basic_pay",
      "housing_allowance",
      "gross_pay",
      "net_pay",
      "statutory_basis",
      "job_title",
      "probation_months",
      "notice_period_days",
      "annual_leave_days",
    ] as const) {
      assert.ok(
        (OPS_CONTRACT_MERGE_TOKENS as readonly string[]).includes(token),
        `${token} must be a merge token`,
      );
    }
  });

  it("resolves the pay tokens to a dash when the reader has no schedule", () => {
    // Never an empty string: a blank salary line reads as zero, which is worse
    // than reading as absent.
    assert.match(contractsSource, /basic_pay: remuneration \? money\(remuneration\.basic\) : "—"/);
    assert.match(contractsSource, /net_pay: remuneration \? money\(remuneration\.net\) : "—"/);
  });

  it("publishes a v2 template rather than editing v1", () => {
    assert.match(templateMigration, /'employment_contract',\s*\n\s*'Employment contract',\s*\n\s*'employment',\s*\n\s*2,/);
    assert.match(templateMigration, /set is_active = false\s*\n\s*where template_code = 'employment_contract'\s*\n\s*and version = 1;/);
  });

  it("keeps the legal-review flag on, because counsel still has not read it", () => {
    // Adding a pay schedule does not make the wording vetted.
    assert.equal(
      /requires_legal_review\s*=\s*false/.test(templateMigration),
      false,
      "v2 must not clear requires_legal_review",
    );
  });

  it("gives v2 a remuneration schedule clause", () => {
    assert.match(templateMigration, /'schedule_remuneration'/);
    assert.match(templateMigration, /\{\{gross_pay\}\}/);
    assert.match(templateMigration, /\{\{net_pay\}\}/);
  });
});

describe("the signature covers the schedule", () => {
  it("hashes the pay figures that appear on the document", () => {
    // A signature attests to a DOCUMENT. On an employment contract the schedule
    // is the substance of it, so a hash that omitted the salary would verify
    // nothing anyone cared about.
    const start = contractsSource.indexOf("export function toOpsContractSignableContent");
    const block = contractsSource.slice(start, start + 3000);
    assert.match(block, /remuneration: detail\.remuneration/);
    assert.match(block, /gross: Number\(detail\.remuneration\.gross \?\? 0\)/);
    assert.match(block, /net: Number\(detail\.remuneration\.net \?\? 0\)/);
  });

  it("leaves read metadata out of the hash", () => {
    // frozen/computed_at describe THIS read, not the agreement. Hashing them
    // would make a signature go stale for no reason visible on the page.
    const start = contractsSource.indexOf("export function toOpsContractSignableContent");
    const block = contractsSource.slice(start, start + 3000);
    assert.equal(/frozen:|computed_at:/.test(block), false);
  });
});

describe("the migration guards the columns it adds", () => {
  it("ties a pay record to the employment kind", () => {
    assert.match(remunerationMigration, /contracts_pay_record_is_employment/);
    assert.match(
      remunerationMigration,
      /employee_contract_id is null or kind = 'employment'/,
    );
  });

  it("restricts rather than cascades on the pay record", () => {
    // A signed contract must not lose the figures behind it because somebody
    // tidied the HR register.
    assert.match(
      remunerationMigration,
      /references public\.employee_contracts\(id\) on delete restrict/,
    );
  });

  it("bounds the employment terms the way the Employment Code does", () => {
    assert.match(remunerationMigration, /probation_months >= 0 and probation_months <= 12/);
    assert.match(remunerationMigration, /hours_per_week >= 0 and hours_per_week <= 168/);
  });
});
