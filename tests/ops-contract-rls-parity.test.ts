import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  canViewOpsContracts,
  canViewOpsPersonalContracts,
} from "../src/lib/ops/contract-permissions";
import { canViewOpsHr } from "../src/lib/ops/hr-permissions";
import { OPS_ROLE_LABELS } from "../src/lib/ops/roles";
import type { OpsUserRole } from "../src/lib/ops/types";

/** Every role in the system. OPS_ROLE_LABELS is keyed by the full union. */
const ALL_ROLES = Object.keys(OPS_ROLE_LABELS) as OpsUserRole[];

/**
 * RLS and the code that reads through it must agree.
 *
 * The standing finding across this codebase is that policies drift WIDER than
 * the TypeScript gate in front of them — and because every app read of
 * `contracts` goes through the service-role client, a policy that is too wide
 * is invisible until something finally reads through RLS.
 *
 * These tests parse the role list out of each SQL helper and compare it to the
 * list the application uses, so the two cannot part company unnoticed. That is
 * exactly how `admin_receptionist` ended up admitted by the contract policy but
 * refused by the code on 2026-08-25.
 */

const root = join(import.meta.dirname, "..");
const migrationsDir = join(root, "supabase/migrations");

/**
 * The role list from the LAST migration that defines this function.
 *
 * Last, not first: these helpers are redefined with `create or replace`, so the
 * newest definition is the one in the database.
 */
function rolesInSqlFunction(functionName: string): Set<string> {
  const files = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  let latest: string | null = null;
  for (const file of files) {
    // Strip `--` comments first. The role lists carry explanatory comments
    // between entries, and a comment containing a bracket truncates a
    // non-greedy match — which silently reported a role as MISSING from SQL
    // when it was present two lines further down.
    const sql = readFileSync(join(migrationsDir, file), "utf8").replace(
      /--.*$/gm,
      "",
    );
    const marker = `function private.${functionName}(`;
    const at = sql.indexOf(marker);
    if (at === -1) continue;
    const body = sql.slice(at);
    const listMatch = body.match(/current_user_role\(\)::text in \(([\s\S]*?)\)/);
    if (listMatch) latest = listMatch[1];
  }

  assert.ok(latest, `no migration defines private.${functionName}`);
  return new Set(
    latest
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.startsWith("'"))
      .map((part) => part.replace(/^'|'$/g, "")),
  );
}

/** The roles for which a TypeScript gate returns true. */
function rolesAllowedBy(gate: (role: OpsUserRole) => boolean): Set<string> {
  return new Set(ALL_ROLES.filter((role) => gate(role)));
}

function describeDifference(sql: Set<string>, code: Set<string>) {
  const onlySql = [...sql].filter((role) => !code.has(role));
  const onlyCode = [...code].filter((role) => !sql.has(role));
  return [
    onlySql.length > 0 ? `RLS is WIDER — allows ${onlySql.join(", ")}` : "",
    onlyCode.length > 0 ? `code is wider — allows ${onlyCode.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("; ");
}

describe("the contract register gate matches its policy", () => {
  it("admits exactly the same roles in SQL and in TypeScript", () => {
    const sql = rolesInSqlFunction("can_access_contracts");
    const code = rolesAllowedBy(canViewOpsContracts);
    assert.deepEqual(
      [...sql].sort(),
      [...code].sort(),
      `can_access_contracts() and canViewOpsContracts disagree: ${describeDifference(sql, code)}`,
    );
  });
});

describe("the personal-contract gate matches its policy", () => {
  it("admits exactly the same roles in SQL and in TypeScript", () => {
    const sql = rolesInSqlFunction("can_access_personal_contracts");
    const code = rolesAllowedBy(canViewOpsPersonalContracts);
    assert.deepEqual(
      [...sql].sort(),
      [...code].sort(),
      `can_access_personal_contracts() and canViewOpsPersonalContracts disagree: ${describeDifference(sql, code)}`,
    );
  });

  it("is narrower than the general HR gate, and deliberately so", () => {
    // can_access_hr_maturity() admits admin_receptionist for the directory and
    // the leave diary. Salaries are not in that bargain, and reusing it for
    // contracts is what made the policy wider than the code.
    const personal = rolesInSqlFunction("can_access_personal_contracts");
    const hr = rolesInSqlFunction("can_access_hr_maturity");

    assert.equal(hr.has("admin_receptionist"), true);
    assert.equal(
      personal.has("admin_receptionist"),
      false,
      "the receptionist must not reach a contract carrying pay",
    );
    for (const role of personal) {
      assert.equal(hr.has(role), true, `${role} is in the contract gate but not in HR`);
    }
  });

  it("is the function the contract policy actually calls", () => {
    const migration = readFileSync(
      join(migrationsDir, "20260825094000_pymble_ops_personal_contract_gate.sql"),
      "utf8",
    );
    assert.match(migration, /create policy contracts_select_ops/);
    assert.match(migration, /or private\.can_access_personal_contracts\(\)/);
    // And can_read_contract, which guards the six child tables.
    assert.match(migration, /function private\.can_read_contract\(target_contract_id uuid\)/);

    const policyBlock = migration.slice(migration.indexOf("create policy contracts_select_ops"));
    assert.equal(
      policyBlock.includes("can_access_hr_maturity"),
      false,
      "the contract policy must not fall back to the general HR gate",
    );
  });
});

describe("the HR gate matches its policy", () => {
  it("admits exactly the same roles in SQL and in TypeScript", () => {
    const sql = rolesInSqlFunction("can_access_hr_maturity");
    const code = rolesAllowedBy(canViewOpsHr);
    assert.deepEqual(
      [...sql].sort(),
      [...code].sort(),
      `can_access_hr_maturity() and canViewOpsHr disagree: ${describeDifference(sql, code)}`,
    );
  });
});

describe("the integrity checks watch the contract invariants", () => {
  const integrity = readFileSync(
    join(root, "src/lib/ops/workflow-integrity.ts"),
    "utf8",
  );

  it("watches for the mismatched subject the leak depended on", () => {
    // The database refuses the row outright now. This watches anyway: a CHECK
    // can be dropped by a migration, and the whole premise of that file is that
    // nothing was watching the last time an invariant quietly stopped holding.
    assert.match(integrity, /key: "contract_kind_matches_counterparty"/);
    assert.match(integrity, /severity: "critical"/);
  });

  it("watches for an executed employment contract with no schedule", () => {
    assert.match(integrity, /key: "employment_contracts_carry_their_schedule"/);
  });

  it("watches for a contract quoting another employee's pay record", () => {
    assert.match(integrity, /key: "contract_pay_record_matches_employee"/);
  });

  it("reports without repairing", () => {
    // A watchdog that quietly fixes things hides how often the thing it fixes
    // goes wrong. The file says so; this holds it to it.
    const checksBlock = integrity.slice(integrity.indexOf("runOpsWorkflowIntegrityChecks"));
    assert.equal(
      /\.update\(|\.insert\(|\.delete\(|\.upsert\(/.test(checksBlock),
      false,
      "the integrity checks must stay read-only",
    );
  });
});
