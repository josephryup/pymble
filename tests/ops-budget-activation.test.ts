import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  describeBudgetActivation,
  type BudgetActivationReconciliation,
} from "../src/lib/ops/budget-activation";

function result(
  patch: Partial<BudgetActivationReconciliation> = {},
): BudgetActivationReconciliation {
  return {
    requestsExamined: 0,
    requestsLinked: 0,
    itemsCoded: 0,
    linkedValue: 0,
    itemsUnresolved: 0,
    ...patch,
  };
}

/**
 * Activation is a reconciliation, not a flag (workflow audit F3).
 *
 * It used to set `status = 'active'`, stamp two columns and write an audit row
 * — and because the availability check funded a cost code from draft, active
 * and locked budgets equally, it was ALSO a no-op for every control. Both
 * halves of "budgets when activated are not linking automatically" were true
 * at once: it linked nothing, and the linking would not have mattered.
 */
describe("describeBudgetActivation", () => {
  it("says plainly when there was nothing to link", () => {
    // Silence here would read as failure. A new site with no requests yet is
    // the normal case, not a problem.
    const message = describeBudgetActivation(result());
    assert.match(message, /No open requests/);
  });

  it("reports how many requests came under the budget", () => {
    const message = describeBudgetActivation(
      result({ requestsExamined: 24, requestsLinked: 24, linkedValue: 59_720 }),
    );

    assert.match(message, /24 open requests/);
    assert.match(message, /59,720/);
  });

  it("counts items it had to code", () => {
    const message = describeBudgetActivation(
      result({ requestsExamined: 10, itemsCoded: 37, linkedValue: 137_550 }),
    );

    assert.match(message, /37 line item\(s\) were given a cost code/);
  });

  it("says what it could not resolve rather than hiding it", () => {
    // Reporting only successes is how a reconciliation becomes untrustworthy.
    const message = describeBudgetActivation(
      result({ requestsExamined: 5, itemsCoded: 2, itemsUnresolved: 3 }),
    );

    assert.match(message, /3 item\(s\) could not be resolved/);
  });

  it("uses the singular for one request", () => {
    const message = describeBudgetActivation(
      result({ requestsExamined: 1, requestsLinked: 1 }),
    );

    assert.match(message, /1 open request\b/);
    assert.doesNotMatch(message, /1 open requests/);
  });
});

const ACTIVATION_SOURCE = readFileSync(
  join(import.meta.dirname, "..", "src", "lib", "ops", "budget-activation.ts"),
  "utf8",
);

const FINANCE_SOURCE = readFileSync(
  join(import.meta.dirname, "..", "src", "lib", "ops", "finance-actions.ts"),
  "utf8",
);

describe("budget activation behaviour (F3, F4)", () => {
  it("only fills gaps — it never recodes deliberate work", () => {
    // Activation must not silently move spend somebody charged on purpose.
    assert.match(ACTIVATION_SOURCE, /\.is\("budget_line_id", null\)/);
    assert.match(ACTIVATION_SOURCE, /\.is\("cost_code_id", null\)/);
  });

  it("ignores requests that have already finished", () => {
    // A closed or cancelled request cannot be governed by a budget activated
    // afterwards, and rewriting it would rewrite history.
    const statuses = ACTIVATION_SOURCE.slice(
      ACTIVATION_SOURCE.indexOf("OPEN_REQUEST_STATUSES"),
      ACTIVATION_SOURCE.indexOf("];", ACTIVATION_SOURCE.indexOf("OPEN_REQUEST_STATUSES")),
    );

    assert.ok(!statuses.includes('"closed"'), "closed requests must not be relinked");
    assert.ok(!statuses.includes('"cancelled"'), "cancelled requests must not be relinked");
    assert.ok(statuses.includes('"approved"'));
    assert.ok(statuses.includes('"pricing_pending"'));
  });

  it("refuses to activate a budget whose lines fund nothing (F4)", () => {
    // A line with no cost code is invisible to every control, so activating it
    // announces governance the system cannot deliver.
    const activate = FINANCE_SOURCE.indexOf("export async function activateProjectBudgetAction");
    const next = FINANCE_SOURCE.indexOf("export async function", activate + 10);
    const body = FINANCE_SOURCE.slice(activate, next);

    assert.match(body, /\.is\("cost_code_id", null\)/);
    assert.match(body, /would fund nothing/);
  });

  it("runs the reconciliation as part of activating", () => {
    const activate = FINANCE_SOURCE.indexOf("export async function activateProjectBudgetAction");
    const next = FINANCE_SOURCE.indexOf("export async function", activate + 10);
    const body = FINANCE_SOURCE.slice(activate, next);

    assert.match(body, /reconcileSiteToActivatedBudget\(/);
    assert.match(body, /describeBudgetActivation\(/);
  });
});
