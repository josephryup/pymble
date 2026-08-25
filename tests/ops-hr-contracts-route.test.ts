import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { OPS_MODULES } from "../src/lib/ops/constants";
import {
  canDraftOpsContractSubject,
  canIssueOpsContract,
  canViewOpsContracts,
  canViewOpsPersonalContracts,
} from "../src/lib/ops/contract-permissions";
import { opsContractHref, OPS_CONTRACT_ROUTES } from "../src/lib/ops/contract-types";
import {
  canCreateOpsEmployee,
  canApproveOpsLeaveRequest,
  canRejectOpsLeaveRequest,
  canLinkOpsEmployeeAccount,
  canViewOpsHr,
} from "../src/lib/ops/hr-permissions";
import { isSensitiveOpsModule } from "../src/lib/ops/module-access-core";
import { canAccessOpsHref } from "../src/lib/ops/permissions";
import type { OpsUserRole } from "../src/lib/ops/types";

const root = join(import.meta.dirname, "..");

function readSource(relativePath: string) {
  return readFileSync(join(root, relativePath), "utf8");
}

const detailSource = readSource("src/components/ops/OpsContractDetailPage.tsx");
const registerSource = readSource("src/components/ops/OpsContractRegisterPage.tsx");
const actionsSource = readSource("src/lib/ops/contract-actions.ts");
const hrMigration = readSource(
  "supabase/migrations/20260825093000_pymble_ops_hr_operations_manager.sql",
);

const OM: OpsUserRole = "operations_manager";

describe("the two kinds live on two routes", () => {
  it("routes each kind to its own register", () => {
    assert.equal(OPS_CONTRACT_ROUTES.subcontract, "/ops/contracts");
    assert.equal(OPS_CONTRACT_ROUTES.employment, "/ops/hr/contracts");
    assert.equal(opsContractHref("employment", "abc"), "/ops/hr/contracts/abc");
  });

  it("has a page file for all four routes", () => {
    for (const path of [
      "src/app/ops/(workspace)/contracts/page.tsx",
      "src/app/ops/(workspace)/contracts/[contractId]/page.tsx",
      "src/app/ops/(workspace)/hr/contracts/page.tsx",
      "src/app/ops/(workspace)/hr/contracts/[contractId]/page.tsx",
    ]) {
      assert.equal(existsSync(join(root, path)), true, `${path} is missing`);
    }
  });

  it("registers both modules, each in the right group", () => {
    const subcontracts = OPS_MODULES.find((m) => m.id === "contracts");
    const employment = OPS_MODULES.find((m) => m.id === "hr-contracts");

    assert.ok(subcontracts, "the subcontract module must still exist");
    assert.ok(employment, "the employment module must be registered");
    assert.equal(subcontracts.group, "operations");
    assert.equal(employment.group, "hr");
    assert.equal(employment.href, "/ops/hr/contracts");
  });

  it("forwards a contract that reaches the wrong route instead of 404ing", () => {
    // Audit-log deep links, bookmarks, and the action error redirects that fire
    // before a kind is known all land on the subcontract route.
    assert.match(detailSource, /if \(contract\.kind !== kind\)/);
    assert.match(detailSource, /redirect\(`\$\{opsContractHref\(contract\.kind, contract\.id\)\}\$\{suffix\}`\)/);
  });

  it("carries the query string through the forward, so the error survives", () => {
    const start = detailSource.indexOf("if (contract.kind !== kind)");
    const block = detailSource.slice(start, start + 600);
    assert.match(block, /new URLSearchParams\(\)/);
    assert.match(block, /query\.set\(key, first\)/);
  });
});

describe("the kind is the route, not a dropdown", () => {
  it("posts the kind as a hidden field fixed by the route", () => {
    assert.match(registerSource, /<input type="hidden" name="kind" value=\{kind\} \/>/);
  });

  it("no longer renders a kind or counterparty-type select", () => {
    // Those two independent dropdowns are what made the leaking pair
    // constructible in the first place.
    assert.equal(
      /id="kind"|name="counterparty_type"/.test(registerSource),
      false,
      "the register must not offer kind or counterparty_type as choices",
    );
  });

  it("offers only the counterparty its route can have", () => {
    assert.match(registerSource, /\{isEmployment \? \(/);
    assert.match(registerSource, /htmlFor="employee_id"/);
    assert.match(registerSource, /htmlFor="subcontractor_id"/);
  });

  it("loads the staff list only on the employment route", () => {
    assert.match(
      registerSource,
      /canDraft && isEmployment\s*\n?\s*\? fetchActiveEmployeeOptions\(\)/,
    );
  });

  it("gates the employment register on the pay-visibility rule too", () => {
    assert.match(
      registerSource,
      /isEmployment && !canViewOpsPersonalContracts\(profile\.role\)\) notFound\(\)/,
    );
  });
});

describe("moving to the hr group is the security win", () => {
  it("puts employment contracts behind a group IT cannot widen", () => {
    const employment = OPS_MODULES.find((m) => m.id === "hr-contracts");
    assert.ok(employment);
    assert.equal(
      isSensitiveOpsModule(employment),
      true,
      "an IT Manager must not be able to widen access to employment contracts",
    );
  });

  it("leaves the subcontract register where the commercial roles reach it", () => {
    const subcontracts = OPS_MODULES.find((m) => m.id === "contracts");
    assert.ok(subcontracts);
    // Burying works orders under HR would put them behind OPS_HR_ROLES, where
    // the QS and procurement cannot get at them.
    for (const role of ["quantity_surveyor", "procurement_manager"] as OpsUserRole[]) {
      assert.equal(
        canAccessOpsHref(role, "/ops/contracts"),
        true,
        `${role} must keep the subcontract register`,
      );
      assert.equal(
        canAccessOpsHref(role, "/ops/hr/contracts"),
        false,
        `${role} must not reach employment contracts`,
      );
    }
  });
});

describe("the Operations Manager joins HR", () => {
  it("can see and manage HR", () => {
    assert.equal(canViewOpsHr(OM), true);
    assert.equal(canCreateOpsEmployee(OM), true);
    const submitted = { created_by: null, status: "submitted" as const };
    assert.equal(canApproveOpsLeaveRequest(OM, submitted), true);
    assert.equal(canRejectOpsLeaveRequest(OM, submitted), true);
  });

  it("can draw up and issue employment contracts", () => {
    assert.equal(canViewOpsContracts(OM), true);
    assert.equal(canViewOpsPersonalContracts(OM), true);
    assert.equal(
      canDraftOpsContractSubject(OM, {
        kind: "employment",
        counterparty_type: "employee",
      }),
      true,
    );
    assert.equal(canIssueOpsContract(OM), true);
  });

  it("reaches both registers", () => {
    assert.equal(canAccessOpsHref(OM, "/ops/contracts"), true);
    assert.equal(canAccessOpsHref(OM, "/ops/hr/contracts"), true);
    assert.equal(canAccessOpsHref(OM, "/ops/employees"), true);
  });

  it("still cannot link an employee record to a login account", () => {
    // The one carve-out. employees.user_id is the only bridge the payslip
    // self-service gate reads, so mis-linking two employees exposes one
    // person's pay to another. Widening HR admin is a workload decision;
    // this is not.
    assert.equal(
      canLinkOpsEmployeeAccount(OM),
      false,
      "the OM must not be able to bind an employee to a login account",
    );
    // And the narrower list is genuinely narrower, not just narrower today.
    assert.equal(canLinkOpsEmployeeAccount("general_manager"), false);
    assert.equal(canLinkOpsEmployeeAccount("manager"), false);
    assert.equal(canLinkOpsEmployeeAccount("human_resource"), true);
    assert.equal(canLinkOpsEmployeeAccount("managing_director"), true);
  });

  it("has the database agree with the code", () => {
    // Four lists carry this addition. The SQL one is the only one that can
    // disagree silently — the app uses the service-role client, so a mismatch
    // shows up only when something reads through RLS.
    assert.match(hrMigration, /can_access_hr_maturity/);
    assert.match(hrMigration, /'operations_manager'/);
  });

  it("does not quietly widen the commercial side", () => {
    // The OM was already in can_access_contracts() and the subcontract module.
    // Nothing here should have handed them approval authority.
    const approvers = readSource("src/lib/ops/contract-permissions.ts");
    const start = approvers.indexOf("const APPROVE_ROLES");
    const block = approvers.slice(start, approvers.indexOf("];", start));
    assert.equal(
      block.includes("operations_manager"),
      false,
      "approval stays with leadership",
    );
  });
});

describe("nobody else gained employment contracts", () => {
  const outsiders: OpsUserRole[] = [
    "quantity_surveyor",
    "procurement_manager",
    "procurement",
    "finance_manager",
    "accountant",
    "projects_manager",
    "engineer",
    "supervisor",
    "it_manager",
  ];

  it("keeps them out of the register and the pay figures", () => {
    for (const role of outsiders) {
      assert.equal(
        canViewOpsPersonalContracts(role),
        false,
        `${role} must not see a contract with a person`,
      );
      assert.equal(
        canAccessOpsHref(role, "/ops/hr/contracts"),
        false,
        `${role} must not reach the employment register`,
      );
    }
  });

  it("keeps the admin/receptionist out of pay while leaving them in HR", () => {
    // They sit in OPS_HR_ROLES for the directory and the leave diary, not for
    // salaries.
    assert.equal(canViewOpsHr("admin_receptionist"), true);
    assert.equal(canViewOpsPersonalContracts("admin_receptionist"), false);
    assert.equal(canAccessOpsHref("admin_receptionist", "/ops/hr/contracts"), false);
  });
});

describe("redirects follow the contract to its own route", () => {
  it("builds every success redirect from the kind", () => {
    assert.equal(
      /redirect\(`\$\{ROUTE\}\/\$\{contract\.id\}/.test(actionsSource),
      false,
      "no success redirect may hardcode the subcontract route",
    );
    assert.match(actionsSource, /opsContractHref\(contract\.kind, contract\.id\)/);
  });

  it("revalidates both registers rather than guessing", () => {
    assert.match(actionsSource, /for \(const base of Object\.values\(OPS_CONTRACT_ROUTES\)\)/);
  });

  it("sends an addendum to the route its parent lives on", () => {
    assert.match(actionsSource, /opsContractHref\(parent\.kind, child\.id\)/);
  });
});
