import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  opsContractSignatoryRoles,
  opsContractSignatorySlotForRole,
  OPS_CONTRACT_INTERNAL_SIGNATORIES,
} from "../src/lib/ops/contract-permissions";
import { getOpsInboxRecordRoute, getOpsRecordLabel } from "../src/lib/ops/inbox-routes";
import type { OpsUserRole } from "../src/lib/ops/types";

const root = join(import.meta.dirname, "..");

function readSource(relativePath: string) {
  return readFileSync(join(root, relativePath), "utf8");
}

const queueSource = readSource("src/lib/ops/overview-queue.ts");
const lifecycleSource = readSource("src/lib/ops/contract-lifecycle.ts");
const reminderMigration = readSource(
  "supabase/migrations/20260825095000_pymble_ops_contract_signature_reminder.sql",
);

/**
 * F7 — "an unsigned contract chases nobody".
 *
 * Approval fired a one-time notification and nothing followed it, so an
 * approved contract could sit unsigned indefinitely. Two things chase it now:
 * a standing My Queue entry, and a single nudge from the daily sweep.
 */

describe("My Queue counts contracts waiting on your signature", () => {
  it("has an entry for each register", () => {
    assert.match(queueSource, /contracts_awaiting_signature_\$\{kind\}/);
    assert.match(queueSource, /Employment contracts awaiting your signature/);
    assert.match(queueSource, /Subcontracts awaiting your signature/);
  });

  it("links to the register the contract actually lives on", () => {
    assert.match(queueSource, /href: opsContractHref\(kind\)/);
  });

  it("counts a slot assigned by name as well as one filled by office", () => {
    // A slot can name a person directly; the office match is the fallback for
    // an unassigned one. Counting only one of the two misses half the work.
    assert.match(queueSource, /assigned_user_id\.eq\.\$\{userId\}/);
    assert.match(queueSource, /and\(assigned_user_id\.is\.null,signatory_role\.eq\.\$\{officeSlot\}\)/);
  });

  it("counts contracts rather than slots", () => {
    // Three pending slots on one contract is one thing to go and do.
    assert.match(queueSource, /const seen = new Map<string, OpsContractKind>\(\)/);
  });

  it("only counts a contract that is actually open for signature", () => {
    assert.match(queueSource, /\["approved", "issued"\]\.includes\(contract\.status\)/);
    assert.match(queueSource, /if \(contract\.archived_at\) continue;/);
  });

  it("applies the subject gate even though every signatory can see pay today", () => {
    // A queue that reads a table directly is exactly where a future widening
    // would leak silently.
    assert.match(queueSource, /canViewOpsContractSubject\(role, \{/);
  });
});

describe("the signature slot matrix reads both ways", () => {
  it("maps every internal slot to the roles that fill it", () => {
    for (const slot of OPS_CONTRACT_INTERNAL_SIGNATORIES) {
      const roles = opsContractSignatoryRoles(slot);
      assert.ok(roles.length > 0, `${slot} has nobody who can fill it`);
      for (const role of roles) {
        assert.equal(
          opsContractSignatorySlotForRole(role),
          slot,
          `${role} should fill ${slot} by office`,
        );
      }
    }
  });

  it("leaves the counterparty and witness slots to nobody internal", () => {
    // The counterparty signs on paper; witnesses are recorded, not clicked.
    for (const slot of ["counterparty", "witness_internal", "witness_counterparty"] as const) {
      assert.deepEqual(opsContractSignatoryRoles(slot), []);
    }
  });

  it("returns a copy, so a caller cannot edit the matrix", () => {
    const roles = opsContractSignatoryRoles("hr");
    roles.push("crew" as OpsUserRole);
    assert.equal(opsContractSignatoryRoles("hr").includes("crew" as OpsUserRole), false);
  });
});

describe("the daily sweep nudges once, not every morning", () => {
  it("waits before nudging at all", () => {
    assert.match(lifecycleSource, /const SIGNATURE_REMINDER_DAYS = 7;/);
    assert.match(lifecycleSource, /\.lte\("approved_at", isoDaysAgo\(SIGNATURE_REMINDER_DAYS\)\)/);
  });

  it("skips anything already nudged", () => {
    assert.match(lifecycleSource, /\.is\("signature_reminder_notified_at", null\)/);
  });

  it("stamps after sending, so it does not re-send", () => {
    // Without the stamp the sweep re-sends every morning until someone signs,
    // which is how people learn to ignore a notification channel entirely.
    const branch = lifecycleSource.slice(
      lifecycleSource.indexOf("Contracts waiting too long on a signature"),
    );
    assert.match(branch, /signature_reminder_notified_at: new Date\(\)\.toISOString\(\)/);
  });

  it("keys idempotency on the contract, never on the date", () => {
    // A dated key regenerates daily and re-notifies — 88% of notifications were
    // duplicates once before, for exactly that reason.
    assert.match(
      lifecycleSource,
      /idempotencyKey: `contract-signature:\$\{contract\.id\}:\$\{recipient\.id\}`/,
    );
  });

  it("aims at the people holding the pending slots, not a department", () => {
    const branch = lifecycleSource.slice(
      lifecycleSource.indexOf("Contracts waiting too long on a signature"),
    );
    assert.match(branch, /\.eq\("status", "pending"\)/);
    assert.match(branch, /\.eq\("is_required", true\)/);
    assert.match(branch, /opsContractSignatoryRoles\(slot\.signatory_role\)/);
    assert.match(branch, /extraUserIds: namedUserIds/);
  });

  it("stamps and moves on when nothing internal is outstanding", () => {
    // Waiting on the counterparty's ink is not something to chase us about,
    // but it should stop being examined every morning.
    const branch = lifecycleSource.slice(
      lifecycleSource.indexOf("Contracts waiting too long on a signature"),
    );
    assert.match(branch, /if \(pending\.length === 0\)/);
  });

  it("reports the count so the cron can be watched", () => {
    assert.match(lifecycleSource, /awaitingSignature: number;/);
    assert.match(lifecycleSource, /result\.awaitingSignature \+= 1;/);
  });

  it("has the column and a partial index behind it", () => {
    assert.match(reminderMigration, /add column if not exists signature_reminder_notified_at timestamptz/);
    assert.match(reminderMigration, /create index if not exists contracts_awaiting_signature_idx/);
  });
});

describe("a contract notification links somewhere real", () => {
  it("routes the contracts source table to a register", () => {
    assert.equal(
      getOpsInboxRecordRoute("contracts", "abc"),
      "/ops/contracts#rc-abc",
    );
    assert.equal(getOpsRecordLabel("contracts"), "Contract");
  });
});
