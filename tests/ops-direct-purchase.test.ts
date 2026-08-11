import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  deriveRequestFulfilment,
  type PurchaseOrderLineForFulfilment,
  type RequestItemForFulfilment,
} from "../src/lib/ops/procurement-fulfilment";

/**
 * Direct purchases — the second door to "procured" (decision D1,
 * docs/pymble-ops-finance-report-metrics-2026-08.md §8).
 *
 * The sourced RFQ→PO path went six weeks and 24 cost-approved requests without
 * one use, because much site material is bought over the counter. Recording
 * those buys is what makes the procurement funnel measure something.
 *
 * The arithmetic tests below matter because a direct purchase is priced from a
 * receipt, not an estimate: the amount paid overwrites what was expected, and
 * the budget must follow the receipt.
 */

const SOURCE = readFileSync(
  join(import.meta.dirname, "..", "src", "lib", "ops", "procure-actions.ts"),
  "utf8",
);

const item = (
  id: string,
  approvedValue: number,
  overrides: Partial<RequestItemForFulfilment> = {},
): RequestItemForFulfilment => ({
  approvedValue,
  declineCount: 0,
  decision: "ordered",
  id,
  itemName: `Item ${id}`,
  quantity: 1,
  ...overrides,
});

const line = (
  materialRequestItemId: string,
  unitRate: number,
): PurchaseOrderLineForFulfilment => ({
  isLive: true,
  materialRequestItemId,
  quantity: 1,
  unitRate,
});

describe("a receipt outranks the estimate", () => {
  it("commits what was actually paid, not what was expected", () => {
    // Cement estimated at 1,200; the receipt says 1,450.
    const fulfilment = deriveRequestFulfilment([item("a", 1_450)], [line("a", 1_450)]);

    assert.equal(fulfilment.orderedValue, 1_450);
    assert.equal(fulfilment.retainedReservation, 0);
    assert.ok(fulfilment.isComplete, "a fully-bought request is complete");
  });

  it("keeps the reservation for lines not bought yet", () => {
    // Two lines approved, one bought in cash today.
    const fulfilment = deriveRequestFulfilment(
      [item("a", 1_450), item("b", 3_000, { decision: "pending" })],
      [line("a", 1_450)],
    );

    assert.equal(fulfilment.orderedValue, 1_450);
    assert.equal(fulfilment.retainedReservation, 3_000);
    assert.ok(fulfilment.isPartial, "a part-bought request is partially ordered");
    assert.ok(!fulfilment.isComplete);
  });

  it("never counts a line twice when a second purchase is recorded", () => {
    // The idempotency rule: line "a" already has a live purchase record, so a
    // repeat submit must not add its value again.
    const fulfilment = deriveRequestFulfilment(
      [item("a", 1_450), item("b", 3_000)],
      [line("a", 1_450), line("b", 3_000)],
    );

    assert.equal(fulfilment.orderedValue, 4_450);
  });
});

describe("recordDirectPurchaseAction", () => {
  /** Body of `function name(...)`, skipping the parameter list's own braces. */
  function bodyOf(name: string) {
    const start = SOURCE.search(new RegExp(`function\\s+${name}\\s*\\(`));
    assert.notEqual(start, -1, `${name} not found in procure-actions.ts`);

    let parens = 0;
    let cursor = SOURCE.indexOf("(", start);
    for (; cursor < SOURCE.length; cursor++) {
      if (SOURCE[cursor] === "(") parens++;
      else if (SOURCE[cursor] === ")" && --parens === 0) break;
    }

    const open = SOURCE.indexOf("{", cursor);
    let depth = 0;
    for (let scan = open; scan < SOURCE.length; scan++) {
      if (SOURCE[scan] === "{") depth++;
      else if (SOURCE[scan] === "}" && --depth === 0) return SOURCE.slice(open, scan + 1);
    }
    throw new Error(`unbalanced braces in ${name}`);
  }

  const body = bodyOf("recordDirectPurchaseAction");

  it("authenticates and authorises before touching anything", () => {
    assert.match(body, /requireOpsUser\(\)/);
    assert.match(body, /canAttachMaterialRequestPricing\(profile\.role\)/);
  });

  it("only accepts a request Finance has approved", () => {
    assert.match(body, /request\.status !== "approved"/);
    assert.match(body, /request\.status !== "partially_ordered"/);
  });

  it("writes the order as issued, not draft", () => {
    // The purchase already happened. A draft would invite someone to "issue" a
    // buy made last Tuesday.
    assert.match(body, /status:\s*"issued"/);
    assert.doesNotMatch(body, /status:\s*"draft"/);
  });

  it("marks the purchase kind so the register stays honest", () => {
    assert.match(body, /purchase_kind:\s*"direct"/);
  });

  it("records a self-approval instead of refusing it", () => {
    // Refusing here would not un-spend the money; it would only lose the
    // record. So the breach is logged and Finance is told.
    assert.match(body, /selfApproved/);
    assert.match(body, /self_approved:\s*selfApproved/);
    assert.doesNotMatch(
      body,
      /segregationOfDutiesBreach/,
      "the sourced path's hard refusal must not be copied here",
    );
  });

  it("skips lines a live purchase record already covers", () => {
    assert.match(body, /alreadyCovered/);
    assert.match(body, /already has a purchase recorded/);
  });

  it("tells Finance when the receipt beats the approval", () => {
    assert.match(body, /purchaseValue > approvedValue/);
    assert.match(body, /fanoutToOpsRoles\(\["finance_manager", "managing_director"\]/);
  });

  it("settles through the same path as a sourced round", () => {
    // One copy of the fulfilment/station arithmetic, or the two doors to
    // "procured" will drift apart.
    assert.match(body, /settleProcurementRound\(/);
  });
});

describe("both doors to procured share one settlement", () => {
  it("neither action recomputes stations for itself", () => {
    for (const action of ["procureMaterialRequestAction", "recordDirectPurchaseAction"]) {
      const start = SOURCE.indexOf(`export async function ${action}`);
      assert.notEqual(start, -1, `${action} not found`);
    }

    // `deriveRequestFulfilment` and the committed/reserved upserts must appear
    // exactly once in the file — inside settleProcurementRound.
    const derives = SOURCE.match(/deriveRequestFulfilment\(/g) ?? [];
    assert.equal(
      derives.length,
      1,
      "fulfilment must be derived in one place only, or the two paths can disagree",
    );

    const committed = SOURCE.match(/lifecycleState:\s*"committed"/g) ?? [];
    assert.equal(committed.length, 1, "the committed station is written in one place only");
  });
});
