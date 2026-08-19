import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const SOURCE = readFileSync(
  join(import.meta.dirname, "..", "src", "lib", "ops", "workflow-integrity.ts"),
  "utf8",
);

const CRON_SOURCE = readFileSync(
  join(
    import.meta.dirname,
    "..",
    "src",
    "app",
    "api",
    "ops",
    "cron",
    "workflow-integrity",
    "route.ts",
  ),
  "utf8",
);

const VERCEL = JSON.parse(
  readFileSync(join(import.meta.dirname, "..", "vercel.json"), "utf8"),
) as { crons: Array<{ path: string; schedule: string }> };

/**
 * The watchdog for the workflow audit's findings.
 *
 * Every defect in the audit had been live for weeks and every one was findable
 * with a single query. The audit's own conclusion was that nothing was
 * watching. These tests check that the watching exists, covers each finding,
 * and actually runs.
 */
describe("workflow integrity suite", () => {
  it("covers every finding that can silently come back", () => {
    // Each of these was true in production on 19 Aug 2026.
    const required = [
      "ordered_requests_have_commitment", // F2
      "no_close_against_unissued_order", // F10
      "postable_entries_have_journals", // F8
      "budget_lines_have_cost_codes", // F4
      "site_items_have_cost_codes", // F6
      "overhead_requests_have_cost_centres", // F7
      "spend_has_a_live_budget", // F3
      "no_pending_steps_on_dead_approvals", // F10
    ];

    for (const key of required) {
      assert.ok(SOURCE.includes(`"${key}"`), `no integrity check for ${key}`);
    }
  });

  it("names the finding each check guards against", () => {
    // A failing check has to explain itself, or the next person reads it as
    // noise and turns it off.
    const findings = SOURCE.match(/finding: "F\d+/g) ?? [];
    assert.ok(findings.length >= 8, "each check should cite the finding it guards");
  });

  it("reports and never repairs", () => {
    // A watchdog that quietly fixes things hides how often the thing it fixes
    // goes wrong.
    const body = SOURCE.slice(SOURCE.indexOf("export async function runOpsWorkflowIntegrityChecks"));
    assert.doesNotMatch(body, /\.update\(/);
    assert.doesNotMatch(body, /\.insert\(/);
    assert.doesNotMatch(body, /\.delete\(/);
  });

  it("is scheduled to actually run", () => {
    // The whole failure mode being guarded against is a check nobody runs.
    const cron = VERCEL.crons.find((entry) =>
      entry.path.endsWith("/cron/workflow-integrity"),
    );
    assert.ok(cron, "workflow-integrity cron is not registered in vercel.json");
    assert.match(cron.schedule, /^\S+ \S+ \S+ \S+ \S+$/);
  });

  it("requires the cron secret", () => {
    assert.match(CRON_SOURCE, /timingSafeEqualString/);
    assert.match(CRON_SOURCE, /CRON_SECRET/);
  });

  it("stays quiet when everything passes", () => {
    // A nightly "all clear" is how a channel becomes noise, and a noisy
    // channel hides the night it matters.
    assert.match(CRON_SOURCE, /if \(!report\.clean\)/);
  });

  it("reminds once a day rather than stacking", () => {
    // A break that persists for a week should not produce seven notifications
    // per person per check.
    assert.match(CRON_SOURCE, /workflow-integrity:\$\{report\.ranAt\.slice\(0, 10\)\}/);
  });
});

describe("re-derivation after schedules arrive", () => {
  const DERIVATION = readFileSync(
    join(import.meta.dirname, "..", "src", "lib", "ops", "cost-code-derivation.ts"),
    "utf8",
  );

  it("exists, because derivation never reaches backwards", () => {
    // 465 of 468 items charge contingency only because the schedules are
    // empty. When they are populated those items stay put unless something
    // re-asks the question.
    assert.match(DERIVATION, /export async function rederiveContingencyCodedItems/);
  });

  it("only moves items sitting on contingency", () => {
    // An item somebody coded deliberately must never be shuffled.
    const body = DERIVATION.slice(DERIVATION.indexOf("rederiveContingencyCodedItems"));
    assert.match(body, /\.in\("cost_code_id", Array\.from\(contingencyIds\)\)/);
  });

  it("supports a dry run", () => {
    // Nobody should have to guess what a bulk recode will do before running it.
    assert.match(DERIVATION, /dryRun\?: boolean/);
    assert.match(DERIVATION, /if \(!input\.dryRun\)/);
  });
});
