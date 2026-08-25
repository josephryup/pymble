import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  canDraftOpsContractSubject,
  canViewOpsContracts,
  canViewOpsContractSubject,
  canViewOpsPersonalContracts,
} from "../src/lib/ops/contract-permissions";
import {
  isOpsContractSubjectConsistent,
  isOpsPersonalContract,
  type OpsContractSubject,
} from "../src/lib/ops/contract-types";
import type { OpsUserRole } from "../src/lib/ops/types";

const root = join(import.meta.dirname, "..");

function readSource(relativePath: string) {
  return readFileSync(join(root, relativePath), "utf8");
}

const permissionsSource = readSource("src/lib/ops/contract-permissions.ts");
const contractsSource = readSource("src/lib/ops/contracts.ts");
const actionsSource = readSource("src/lib/ops/contract-actions.ts");
const pdfRouteSource = readSource("src/app/api/ops/pdf/contract/[id]/route.ts");
const docxRouteSource = readSource("src/app/api/ops/docx/contract/[id]/route.ts");
const migrationSource = readSource(
  "supabase/migrations/20260825090000_pymble_ops_contract_subject_gate.sql",
);

const SUBCONTRACT: OpsContractSubject = {
  kind: "subcontract",
  counterparty_type: "subcontractor",
};
const EMPLOYMENT: OpsContractSubject = {
  kind: "employment",
  counterparty_type: "employee",
};
/**
 * The row that used to be constructible: a works order pointed at a person.
 * Every gate read `kind`, so this passed as commercial data while carrying an
 * employee's name, phone and email in counterparty_snapshot.
 */
const SMUGGLED_EMPLOYEE: OpsContractSubject = {
  kind: "subcontract",
  counterparty_type: "employee",
};

/**
 * Roles that can see contracts but have no business seeing a colleague's pay.
 *
 * The Operations Manager was in this list until 2026-08-25, when they were
 * given the full HR view by explicit decision. They are deliberately absent
 * now — see the OM coverage in ops-hr-contracts-route.test.ts, which asserts
 * the access they gained AND the account-link carve-out they did not.
 */
const COMMERCIAL_ONLY_ROLES: OpsUserRole[] = [
  "quantity_surveyor",
  "procurement_manager",
  "finance_manager",
  "accountant",
  "projects_manager",
];

describe("a contract with a person is recognised by either column", () => {
  it("treats the employment kind as personal", () => {
    assert.equal(isOpsPersonalContract(EMPLOYMENT), true);
  });

  it("treats an employee counterparty as personal whatever the kind says", () => {
    assert.equal(isOpsPersonalContract(SMUGGLED_EMPLOYEE), true);
  });

  it("leaves an ordinary subcontract commercial", () => {
    assert.equal(isOpsPersonalContract(SUBCONTRACT), false);
  });
});

describe("the two halves of the subject must agree", () => {
  it("accepts the two legitimate pairings", () => {
    assert.equal(isOpsContractSubjectConsistent(SUBCONTRACT), true);
    assert.equal(isOpsContractSubjectConsistent(EMPLOYMENT), true);
  });

  it("rejects a subcontract naming an employee", () => {
    assert.equal(isOpsContractSubjectConsistent(SMUGGLED_EMPLOYEE), false);
  });

  it("rejects an employment contract naming a subcontractor", () => {
    assert.equal(
      isOpsContractSubjectConsistent({
        kind: "employment",
        counterparty_type: "subcontractor",
      }),
      false,
    );
  });
});

describe("the commercial roles cannot read a contract with a person", () => {
  it("lets them see ordinary subcontracts", () => {
    for (const role of COMMERCIAL_ONLY_ROLES) {
      assert.equal(canViewOpsContracts(role), true, `${role} reaches the register`);
      assert.equal(
        canViewOpsContractSubject(role, SUBCONTRACT),
        true,
        `${role} can read a subcontract`,
      );
    }
  });

  it("refuses them an employment contract", () => {
    for (const role of COMMERCIAL_ONLY_ROLES) {
      assert.equal(
        canViewOpsContractSubject(role, EMPLOYMENT),
        false,
        `${role} must not read an employment contract`,
      );
    }
  });

  it("refuses them a subcontract-kind row that names an employee", () => {
    // This is the regression the whole change exists for. Before 2026-08-25
    // this assertion would have failed for every role in the list.
    for (const role of COMMERCIAL_ONLY_ROLES) {
      assert.equal(
        canViewOpsContractSubject(role, SMUGGLED_EMPLOYEE),
        false,
        `${role} must not read an employee's details off a works order`,
      );
    }
  });

  it("refuses them the right to draft one either", () => {
    for (const role of COMMERCIAL_ONLY_ROLES) {
      assert.equal(canDraftOpsContractSubject(role, SMUGGLED_EMPLOYEE), false);
      assert.equal(canDraftOpsContractSubject(role, EMPLOYMENT), false);
    }
  });
});

describe("the roles that carry HR keep their access", () => {
  const hrRoles: OpsUserRole[] = [
    "human_resource",
    "hr",
    "managing_director",
    "general_manager",
    "owner",
    "manager",
    "developer",
  ];

  it("can read a contract with a person", () => {
    for (const role of hrRoles) {
      assert.equal(canViewOpsPersonalContracts(role), true, `${role} sees pay`);
      assert.equal(canViewOpsContractSubject(role, EMPLOYMENT), true);
      assert.equal(canViewOpsContractSubject(role, SMUGGLED_EMPLOYEE), true);
    }
  });
});

describe("the gate is the same one everywhere it matters", () => {
  it("has no caller left reading the kind alone", () => {
    // The old kind-only helpers are gone by name, so a new call site cannot
    // reintroduce the narrow test by copying an existing line.
    for (const [label, source] of [
      ["contract-permissions.ts", permissionsSource],
      ["contracts.ts", contractsSource],
      ["contract-actions.ts", actionsSource],
      ["pdf route", pdfRouteSource],
      ["docx route", docxRouteSource],
    ] as const) {
      assert.equal(
        /canViewOpsContractKind|canDraftOpsContractKind/.test(source),
        false,
        `${label} still uses a kind-only contract gate`,
      );
    }
  });

  it("filters both columns out of the register query, not just the kind", () => {
    // Filtering in SQL rather than in memory keeps the list and its counts
    // consistent; filtering on both columns is what closes the leak.
    assert.match(contractsSource, /canViewOpsPersonalContracts\(profile\.role\)/);
    assert.match(contractsSource, /\.neq\("kind", "employment"\)/);
    assert.match(contractsSource, /\.neq\("counterparty_type", "employee"\)/);
  });

  it("gates the PDF and DOCX routes on the whole contract", () => {
    assert.match(pdfRouteSource, /canViewOpsContractSubject\(profile\.role, contract\)/);
    assert.match(docxRouteSource, /canViewOpsContractSubject\(profile\.role, contract\)/);
  });
});

describe("the draft action does not trust the request", () => {
  it("derives the counterparty type from the kind rather than reading it", () => {
    assert.match(actionsSource, /counterpartyTypeForKind\(input\.kind\)/);
    assert.match(actionsSource, /counterparty_type: counterpartyType,/);
    // The posted value is no longer what lands in the row.
    assert.equal(
      /counterparty_type: input\.counterparty_type/.test(actionsSource),
      false,
      "the posted counterparty_type must not reach the insert",
    );
  });

  it("refuses a smuggled employee_id instead of nulling it out silently", () => {
    // The employee <select> is hidden from a quantity surveyor, but a Server
    // Action accepts whatever FormData is posted to it. Hiding is not a gate.
    assert.match(
      actionsSource,
      /An employee can only be named on an employment contract\./,
    );
    assert.match(actionsSource, /A subcontractor can only be named on a subcontract\./);
  });

  it("refuses a posted counterparty_type that disagrees with the kind", () => {
    assert.match(actionsSource, /isOpsContractSubjectConsistent/);
  });
});

describe("the database carries the same rule as the code", () => {
  it("constrains the pairing", () => {
    assert.match(
      migrationSource,
      /check \(\(kind = 'employment'\) = \(counterparty_type = 'employee'\)\)/,
    );
  });

  it("widens both read gates to test the counterparty as well as the kind", () => {
    // The standing finding across this codebase is that RLS drifts WIDER than
    // the code reading through it. Both gates are asserted here so the two
    // cannot part company unnoticed.
    const widened =
      /kind <> 'employment' and c?\.?counterparty_type <> 'employee'/g;
    const matches = migrationSource.match(widened) ?? [];
    assert.equal(
      matches.length,
      2,
      "can_read_contract and contracts_select_ops must both test both columns",
    );
  });

  it("refuses to apply over rows that already disagree", () => {
    assert.match(migrationSource, /raise exception/);
  });
});
