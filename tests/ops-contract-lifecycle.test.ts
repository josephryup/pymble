import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  canApproveOpsContract,
  canCertifyOpsContractMilestone,
  canIssueOpsContract,
  canTerminateOpsContract,
} from "../src/lib/ops/contract-permissions";
import type { OpsUserRole } from "../src/lib/ops/types";

const root = join(import.meta.dirname, "..");

function readSource(relativePath: string) {
  return readFileSync(join(root, relativePath), "utf8");
}

const financeSource = readSource("src/lib/ops/contract-finance.ts");
const actionsSource = readSource("src/lib/ops/contract-actions.ts");
const lifecycleSource = readSource("src/lib/ops/contract-lifecycle.ts");
const docxSource = readSource("src/lib/ops/contract-docx.ts");

describe("separation of duties on certification", () => {
  it("does not let Finance certify the work it will then pay for", () => {
    // Certifying is a statement that the work is done; approving the payment is
    // a separate judgement. The same person doing both is the classic control
    // failure this split exists to prevent.
    assert.equal(canCertifyOpsContractMilestone("finance_manager"), false);
    assert.equal(canCertifyOpsContractMilestone("accountant"), false);
  });

  it("lets the people who can judge the works certify them", () => {
    const certifiers: OpsUserRole[] = [
      "quantity_surveyor",
      "projects_manager",
      "engineering_manager",
      "operations_manager",
    ];

    for (const role of certifiers) {
      assert.equal(canCertifyOpsContractMilestone(role), true, role);
    }
  });

  it("keeps crew and admin roles out of certification entirely", () => {
    const outsiders: OpsUserRole[] = ["crew", "supervisor", "admin_receptionist", "engineer"];

    for (const role of outsiders) {
      assert.equal(canCertifyOpsContractMilestone(role), false, role);
    }
  });

  it("reserves approval and termination for leadership", () => {
    assert.equal(canApproveOpsContract("quantity_surveyor"), false);
    assert.equal(canTerminateOpsContract("quantity_surveyor"), false);
    assert.equal(canApproveOpsContract("managing_director"), true);
    assert.equal(canTerminateOpsContract("general_manager"), true);
  });

  it("keeps issuing with HR and leadership", () => {
    assert.equal(canIssueOpsContract("human_resource"), true);
    assert.equal(canIssueOpsContract("quantity_surveyor"), false);
  });
});

describe("the money chain routes through payables, not the dead-end table", () => {
  it("raises a payment_request rather than a subcontractor_payment", () => {
    // subcontractor_payments has no GL posting, no cost code and no budget
    // link. Routing certified milestones through it would build a second
    // payables spine beside the one that works.
    assert.match(financeSource, /from\("payment_requests"\)\s*\.insert/);
    assert.ok(
      !financeSource.includes('from("subcontractor_payments")'),
      "contract finance must not write to subcontractor_payments",
    );
  });

  it("tags the payable as subcontractor so it lands in its own payable account", () => {
    // 'subcontractor' maps to 2050 Subcontractor Payable rather than collapsing
    // into trade payables — retention-bearing balances behave differently.
    assert.match(financeSource, /payment_type: "subcontractor"/);
  });

  it("submits the payable rather than leaving it a draft", () => {
    // A certified stage is a claim Finance must act on. A draft would sit
    // invisible until someone remembered to submit it.
    assert.match(financeSource, /status: "submitted"/);
  });

  it("does not post a journal from certification", () => {
    // Certification creates a claim; the existing payables approval decides
    // when it becomes an accounting fact. A site engineer certifying work must
    // not be able to move the general ledger.
    assert.ok(
      !financeSource.includes("postOpsJournalEntry"),
      "certification must not post to the GL directly",
    );
    assert.ok(
      !actionsSource.includes("postOpsJournalEntry"),
      "contract actions must not post to the GL directly",
    );
  });

  it("cancels a commitment rather than deleting it", () => {
    // A budget that silently loses a commitment cannot answer "what happened
    // to that money?".
    assert.match(financeSource, /status: "cancelled"/);
    assert.ok(
      !financeSource.includes('from("project_cost_entries")\n    .delete'),
      "commitments are cancelled, never deleted",
    );
  });
});

describe("retention cannot be released early", () => {
  it("blocks certifying retention as an ordinary stage", () => {
    assert.match(
      actionsSource,
      /milestone\.is_retention && !contract\.completed_at/,
      "retention must not be certifiable before completion",
    );
  });

  it("requires completion before the release action will run", () => {
    assert.match(
      actionsSource,
      /if \(!contract\.completed_at\) \{\s*contractError\(\s*"Retention is released after the contract is completed/,
    );
  });

  it("dates the release from completion plus the defects liability period", () => {
    assert.match(actionsSource, /releaseDue\.setMonth\(\s*releaseDue\.getMonth\(\) \+ Number\(contract\.defects_liability_months/);
  });
});

describe("the daily sweep does not become noise", () => {
  it("stamps a notified marker so a warning is sent once, not every morning", () => {
    assert.match(lifecycleSource, /expiry_notified_at: new Date\(\)\.toISOString\(\)/);
    assert.match(lifecycleSource, /release_notified_at: new Date\(\)\.toISOString\(\)/);
    assert.match(lifecycleSource, /warranty_notified_at: new Date\(\)\.toISOString\(\)/);
  });

  it("keys idempotency on the record, never on the date", () => {
    // A dated idempotency key regenerates every day and re-notifies — the
    // mechanism behind an earlier 88%-duplicate-notification finding.
    const keys = lifecycleSource.match(/idempotencyKey: `[^`]+`/g) ?? [];
    assert.ok(keys.length >= 3, "every sweep branch should carry an idempotency key");

    for (const key of keys) {
      assert.ok(
        !/toISOString|today\(\)|Date\(\)/.test(key),
        `idempotency key must not embed a date: ${key}`,
      );
    }
  });
});

describe("word export is a working copy, not the record", () => {
  it("stamps the document so it cannot be mistaken for authoritative", () => {
    assert.match(docxSource, /WORKING COPY — NOT THE SYSTEM RECORD/);
  });

  it("offers no import path back into the system", () => {
    // Parsing edited Word back into structured clauses would bypass both the
    // template diff and the signature hash.
    assert.ok(!docxSource.includes("patchDocument"), "no DOCX round-trip");
    assert.ok(!docxSource.includes("mammoth"), "no DOCX parsing");
  });
});

describe("an issued contract is varied, never edited", () => {
  it("refuses an addendum against anything still editable", () => {
    assert.match(
      actionsSource,
      /if \(!\["issued", "signed", "active"\]\.includes\(parent\.status\)\)/,
    );
  });

  it("refuses an addendum on an addendum", () => {
    // Otherwise the chain of what varies what becomes unreadable.
    assert.match(actionsSource, /if \(parent\.parent_contract_id\)/);
  });

  it("baselines the child's clauses on the parent's wording", () => {
    // So the approver's diff reads "what changed from the contract being
    // varied", not "what changed from the master template".
    assert.match(actionsSource, /template_body_snapshot: clause\.body_markdown/);
  });
});
