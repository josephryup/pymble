import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  statusForLifecycleState,
  type OpsCostLifecycleState,
} from "../src/lib/ops/project-cost-entries";
import {
  computeBudgetAvailability,
  EMPTY_BUDGET_POSITION,
} from "../src/lib/ops/budget-availability";

describe("statusForLifecycleState", () => {
  it("maps every station exactly as the database check constraint does", () => {
    // This mapping mirrors project_cost_entries_lifecycle_status_agree. If the
    // two ever drift, inserts fail loudly — but this test catches it first.
    const expected: Record<OpsCostLifecycleState, string> = {
      reserved: "committed",
      committed: "committed",
      accrued: "committed",
      actual: "posted",
      paid: "posted",
      released: "cancelled",
    };

    for (const [state, status] of Object.entries(expected)) {
      assert.equal(
        statusForLifecycleState(state as OpsCostLifecycleState),
        status,
        `station ${state} must summarise as ${status}`,
      );
    }
  });

  it("covers every enum member — a new station must be mapped deliberately", () => {
    const states: OpsCostLifecycleState[] = [
      "reserved",
      "committed",
      "accrued",
      "actual",
      "paid",
      "released",
    ];
    for (const state of states) {
      assert.ok(
        ["committed", "posted", "cancelled"].includes(statusForLifecycleState(state)),
        `${state} produced an unknown status`,
      );
    }
  });
});

describe("relief keeps exposure honest", () => {
  // These model what releaseSupersededCostStations achieves, as arithmetic:
  // the whole reason relief exists is that without it the same money would be
  // counted twice against one budget.

  it("counts a partial procurement once, not twice", () => {
    // Approved K287,211 (reserved). 60% procured → K180,000 committed, and the
    // reservation is relieved to the un-procured remainder.
    const withRelief = computeBudgetAvailability({
      ...EMPTY_BUDGET_POSITION,
      budgeted: 500_000,
      reserved: 107_211,
      committed: 180_000,
    });

    assert.equal(withRelief.consumed, 287_211);
    assert.equal(withRelief.available, 212_789);
  });

  it("shows what NOT relieving would cost — the double-count", () => {
    // The same moment with the reservation left standing at its full value.
    const withoutRelief = computeBudgetAvailability({
      ...EMPTY_BUDGET_POSITION,
      budgeted: 500_000,
      reserved: 287_211,
      committed: 180_000,
    });

    assert.equal(withoutRelief.consumed, 467_211);
    // K180,000 of phantom consumption — the budget would look nearly spent.
    assert.equal(withoutRelief.consumed - 287_211, 180_000);
  });

  it("returns funds to the budget when everything is released", () => {
    const cancelled = computeBudgetAvailability({
      ...EMPTY_BUDGET_POSITION,
      budgeted: 500_000,
      // Every station released, so none of them appear here at all.
    });

    assert.equal(cancelled.consumed, 0);
    assert.equal(cancelled.available, 500_000);
    assert.equal(cancelled.usedPercent, 0);
  });

  it("treats a fully-delivered request as actual only, never actual plus reserved", () => {
    const delivered = computeBudgetAvailability({
      ...EMPTY_BUDGET_POSITION,
      budgeted: 300_000,
      actual: 287_211,
    });

    assert.equal(delivered.consumed, 287_211);
    assert.equal(delivered.usedPercent, 95.7);
  });
});

/**
 * Guard: each payable action books the station its event actually means.
 *
 * The stations are only worth having if the right one is written. Before this,
 * every payable action passed the coarse `status` alone and let
 * `upsertProjectCostEntry` infer the station — so approval booked `reserved`
 * and settlement booked `actual`, leaving "money actually released"
 * unanswerable because a paid payable looked exactly like an accrued one.
 *
 * Source-level because the mistake is silent: the wrong station is a perfectly
 * valid row, it passes the CHECK constraint, and it consumes budget identically.
 * Nothing fails. The figures just quietly mean something else. Only reading the
 * call site tells you which event was recorded.
 */
describe("payable actions book the station their event means", () => {
  const source = readFileSync(
    join(import.meta.dirname, "..", "src", "lib", "ops", "finance-actions.ts"),
    "utf8",
  );

  /**
   * Body of `function name(...)`, by brace matching.
   *
   * The parameter list is walked by paren depth first. Taking the next `{`
   * after the function name instead would find the brace of an inline
   * parameter type — `input: { … }` — and return the signature rather than
   * the body.
   */
  function bodyOf(name: string) {
    const start = source.search(new RegExp(`function\\s+${name}\\s*\\(`));
    assert.notEqual(start, -1, `${name} not found in finance-actions.ts`);

    const paramsOpen = source.indexOf("(", start);
    let parens = 0;
    let cursor = paramsOpen;
    for (; cursor < source.length; cursor++) {
      if (source[cursor] === "(") parens++;
      else if (source[cursor] === ")" && --parens === 0) break;
    }

    const open = source.indexOf("{", cursor);
    let depth = 0;
    for (let scan = open; scan < source.length; scan++) {
      if (source[scan] === "{") depth++;
      else if (source[scan] === "}" && --depth === 0) {
        return source.slice(open, scan + 1);
      }
    }
    throw new Error(`unbalanced braces in ${name}`);
  }

  const expected: Array<[action: string, station: string, why: string]> = [
    [
      "approvePaymentRequestAction",
      "accrued",
      "the obligation is real and dated, but no cash has moved",
    ],
    ["markPaymentRequestPaidAction", "paid", "cash has left the bank"],
    ["rejectPaymentRequestAction", "released", "the money goes back to the budget"],
    ["cancelPaymentRequestAction", "released", "the money goes back to the budget"],
  ];

  for (const [action, station, why] of expected) {
    it(`${action} books ${station} — ${why}`, () => {
      assert.match(
        bodyOf(action),
        new RegExp(`lifecycleState:\\s*"${station}"`),
        `${action} must pass lifecycleState: "${station}"`,
      );
    });
  }

  it("derives status from the station rather than accepting both", () => {
    const helper = bodyOf("upsertPaymentCostEntry");

    assert.match(
      helper,
      /status:\s*statusForLifecycleState\(/,
      "status must be derived, so a caller cannot pass a station and status that disagree",
    );
  });
});
