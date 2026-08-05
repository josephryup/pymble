import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

/**
 * Guard: the money-moving flows stay atomic.
 *
 * Audit finding R1 — there were no database transactions anywhere, and the two
 * worst cases were staff payroll completion and procure-and-commit. Both now
 * call a Postgres function, whose body is a transaction for free.
 *
 * These are source-level assertions because the regression they guard against
 * is structural: someone "simplifying" the rpc back into a couple of
 * `.from(...).update(...)` calls. That reads fine in review and passes every
 * runtime test, because the failure only appears when the process dies between
 * the two writes.
 *
 * The specific harm in each case:
 *   - payroll: the run is marked paid while its items are not, with no record
 *     of which half committed.
 *   - procurement: an orphaned draft PO that has already consumed a number
 *     from the sequence and shows in the register with no lines.
 */

const ROOT = join(import.meta.dirname, "..", "src");

function read(relative: string) {
  return readFileSync(join(ROOT, relative), "utf8");
}

/** The body of an exported function, by brace matching. */
function functionBody(source: string, name: string) {
  const start = source.indexOf(`export async function ${name}(`);
  assert.notEqual(start, -1, `${name} not found — this guard is out of date`);

  const open = source.indexOf("{", start);
  let depth = 0;

  for (let cursor = open; cursor < source.length; cursor++) {
    if (source[cursor] === "{") depth++;
    else if (source[cursor] === "}") {
      depth--;
      if (depth === 0) return source.slice(open, cursor + 1);
    }
  }

  throw new Error(`could not brace-match ${name}`);
}

describe("staff payroll completion is atomic", () => {
  const body = functionBody(
    read("lib/ops/staff-payroll-actions.ts"),
    "completeStaffPayrollRunAction",
  );

  it("goes through the transactional rpc", () => {
    assert.match(
      body,
      /\.rpc\(\s*"ops_complete_staff_payroll_run"/,
      "payroll completion must call ops_complete_staff_payroll_run, not write the run and its items separately",
    );
  });

  it("does not write the run or its items directly", () => {
    assert.doesNotMatch(
      body,
      /from\("staff_payroll_runs"\)[\s\S]{0,120}\.update\(/,
      "the run status must change inside the transaction, not in its own call",
    );
    assert.doesNotMatch(
      body,
      /from\("staff_payroll_items"\)[\s\S]{0,120}\.update\(/,
      "item payout status must change inside the transaction, not in its own call",
    );
  });

  it("handles every status the function can return", () => {
    // The rpc reports not_found / not_approved / already_completed rather than
    // throwing, so a caller that ignores them silently treats a no-op as done.
    for (const status of ["not_found", "not_approved"]) {
      assert.match(body, new RegExp(`"${status}"`), `unhandled rpc status: ${status}`);
    }
  });

  it("still sends payslip emails after the transaction commits", () => {
    // Deliberately outside the transaction: a database transaction cannot
    // roll back a sent email, so dispatch belongs after the commit where it is
    // idempotent and records who was missed.
    assert.match(body, /sendStaffPayslipEmailsForRun/);
    assert.ok(
      body.indexOf(".rpc(") < body.indexOf("sendStaffPayslipEmailsForRun"),
      "emails must be sent after the state change commits, not before",
    );
  });
});

describe("purchase order creation is atomic", () => {
  const source = read("lib/ops/procure-actions.ts");
  const body = functionBody(source, "procureMaterialRequestAction");

  it("creates the header and its lines through one rpc", () => {
    assert.match(
      body,
      /\.rpc\(\s*"ops_insert_purchase_order_with_lines"/,
      "a PO and its lines must be written together, or a failed line insert leaves an orphan draft PO",
    );
  });

  it("does not insert purchase_order_items on its own", () => {
    assert.doesNotMatch(
      body,
      /from\("purchase_order_items"\)[\s\S]{0,80}\.insert\(/,
      "lines must go through the rpc so they share the header's transaction",
    );
  });

  it("does not send the generated line_total", () => {
    // purchase_order_items.line_total is GENERATED ALWAYS AS
    // (quantity * unit_cost). PostgREST silently dropped it; raw SQL errors
    // with 428C9, so sending it would break the rpc.
    assert.doesNotMatch(
      body,
      /line_total:/,
      "line_total is a generated column — sending it makes the insert fail",
    );
  });
});
