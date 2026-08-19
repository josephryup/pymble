import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { MATCHABLE_SCHEDULE_STATUSES } from "../src/lib/ops/cost-code-derivation";

const DERIVATION_SOURCE = readFileSync(
  join(import.meta.dirname, "..", "src", "lib", "ops", "cost-code-derivation.ts"),
  "utf8",
);

const ACTIONS_SOURCE = readFileSync(
  join(import.meta.dirname, "..", "src", "lib", "ops", "material-request-actions.ts"),
  "utf8",
);

/**
 * Cost codes are derived, not typed (workflow audit F6, F7).
 *
 * 107 of 491 line items had no cost code, on six of eleven sites the picker had
 * nothing in it to choose, and the only automatic linking ran on CSV import
 * against `issued` schedules — of which the database held exactly one, with no
 * lines on it. The chain below is what replaced asking.
 */
describe("cost code derivation", () => {
  it("matches schedules that are priced as well as issued (F6)", () => {
    // Requiring `issued` left one usable schedule in the whole system, and it
    // had zero lines — which is why all 491 items are unlinked. Generating a
    // BUDGET still waits for issue; knowing which planned line an item is for
    // does not have to.
    assert.ok(MATCHABLE_SCHEDULE_STATUSES.includes("issued"));
    assert.ok(MATCHABLE_SCHEDULE_STATUSES.includes("priced"));
    assert.equal(MATCHABLE_SCHEDULE_STATUSES.length, 2);

    // Draft schedules stay out: a draft is not yet a plan anyone agreed to.
    assert.ok(!(MATCHABLE_SCHEDULE_STATUSES as readonly string[]).includes("draft"));
  });

  it("tries the sources in specific-to-general order", () => {
    // The order is the design: an explicit choice beats a match, a match beats
    // a budget line, and contingency is the floor so the answer is never
    // "nowhere".
    // Matched as bare quoted literals: the last two branches emit their
    // source through a ternary, so `source: "x"` would not appear verbatim.
    const order = ["explicit", "schedule_line", "budget_line", "contingency"];
    const positions = order.map((source) => DERIVATION_SOURCE.indexOf(`"${source}"`));

    for (const [index, position] of positions.entries()) {
      assert.notEqual(position, -1, `no branch returns ${order[index]}`);
      if (index > 0) {
        assert.ok(
          position > positions[index - 1],
          `${order[index]} must be tried after ${order[index - 1]}`,
        );
      }
    }
  });

  it("never overrides a cost code the user picked", () => {
    // Deriving is a convenience, not an opinion. The explicit branch has to
    // return before anything else is consulted.
    const explicitAt = DERIVATION_SOURCE.indexOf('"explicit"');
    const firstQuery = DERIVATION_SOURCE.indexOf('.from("boq_line_items")');
    assert.ok(explicitAt !== -1 && firstQuery !== -1);
    assert.ok(
      explicitAt < firstQuery,
      "the explicit choice must be returned before any derivation runs",
    );
  });

  it("sends requests with no site to a cost centre, not a cost code (F7)", () => {
    // IT and general purchasing have no project WBS to charge. The screen used
    // to promise those requests would "charge the unplanned / contingency
    // budget" — a destination that cannot exist without a site.
    assert.match(DERIVATION_SOURCE, /if \(!input\.siteId\)/);
    assert.match(DERIVATION_SOURCE, /"cost_centre"/);
    assert.match(DERIVATION_SOURCE, /it: "IT"/);
    assert.match(DERIVATION_SOURCE, /general: "HO"/);
  });

  it("derives when the line is written, not when the request is submitted", () => {
    // Submit-time stamping was too late to be useful: the request was built and
    // reviewed before anyone learned it could not be charged anywhere.
    const addItem = ACTIONS_SOURCE.indexOf("export async function addMaterialRequestItemAction");
    const nextAction = ACTIONS_SOURCE.indexOf("export async function", addItem + 10);
    const body = ACTIONS_SOURCE.slice(addItem, nextAction);

    assert.match(body, /deriveMaterialRequestItemCostCode\(/);
    assert.match(body, /cost_code_id: derived\.costCodeId/);
  });

  it("links the line to whatever schedule line it matched", () => {
    // The manual add-item form used to link nothing at all — only the CSV
    // importer did — so planned-vs-actual had nothing to compare.
    const addItem = ACTIONS_SOURCE.indexOf("export async function addMaterialRequestItemAction");
    const nextAction = ACTIONS_SOURCE.indexOf("export async function", addItem + 10);
    const body = ACTIONS_SOURCE.slice(addItem, nextAction);

    assert.match(body, /boq_line_item_id: derived\.boqLineItemId/);
  });

  it("records how the charge was decided", () => {
    // A surprising cost code has to be explicable, or the next person to see
    // one will go back to typing them by hand.
    assert.match(ACTIONS_SOURCE, /cost_code_source: derived\.source/);
    assert.match(DERIVATION_SOURCE, /note:/);
  });

  it("always returns a source, so 'uncoded' is never silent", () => {
    // `none` exists precisely so the caller can tell "could not derive" from
    // "derived nothing", which is the distinction null destroyed.
    assert.match(DERIVATION_SOURCE, /source: costCentreId \? "cost_centre" : "none"/);
    assert.match(DERIVATION_SOURCE, /source: contingencyId \? "contingency" : "none"/);
  });
});
