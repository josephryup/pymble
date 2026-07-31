import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matchLine, summariseMatch, type MatchLine } from "../src/lib/ops/three-way-match";

function line(overrides: Partial<MatchLine> = {}): MatchLine {
  return {
    requestItemId: "item-1",
    itemName: "Cement 42.5N",
    unit: "bag",
    requestedQuantity: 100,
    orderedQuantity: 100,
    receivedQuantity: 100,
    rejectedQuantity: 0,
    orderedValue: 14_500,
    receivedValue: 14_500,
    ...overrides,
  };
}

describe("matchLine", () => {
  it("passes a line where all three agree", () => {
    const result = matchLine(line());
    assert.equal(result.isClean, true);
    assert.equal(result.exposureValue, 0);
    assert.equal(result.outstandingQuantity, 0);
  });

  it("flags short delivery without inventing a cost exposure", () => {
    // You pay for what arrived — short delivery is a delivery problem.
    const result = matchLine(line({ receivedQuantity: 80 }));

    assert.equal(result.shortDelivered, true);
    assert.equal(result.outstandingQuantity, 20);
    assert.equal(result.exposureValue, 0);
    assert.equal(result.isClean, false);
  });

  it("prices over-receipt, because the supplier can bill for it", () => {
    const result = matchLine(line({ receivedQuantity: 110 }));

    assert.equal(result.overReceived, true);
    // 10 bags at 145 each.
    assert.equal(result.exposureValue, 1_450);
  });

  it("treats rejected goods as not received", () => {
    const result = matchLine(line({ receivedQuantity: 110, rejectedQuantity: 10 }));

    assert.equal(result.overReceived, false);
    assert.equal(result.shortDelivered, false);
    // Rejections still make the line an exception worth looking at.
    assert.equal(result.isClean, false);
  });

  it("flags ordering beyond what was requested", () => {
    const result = matchLine(
      line({ requestedQuantity: 100, orderedQuantity: 120, receivedQuantity: 120 }),
    );

    assert.equal(result.overOrdered, true);
    assert.equal(result.isClean, false);
    // Over-ordering is an authority problem, not a receipt exposure.
    assert.equal(result.exposureValue, 0);
  });

  it("does not call a nothing-ordered line clean", () => {
    const result = matchLine(
      line({ requestedQuantity: 0, orderedQuantity: 0, receivedQuantity: 0 }),
    );
    assert.equal(result.isClean, false);
  });
});

describe("summariseMatch", () => {
  it("blocks payment only when something was over-received", () => {
    const short = summariseMatch([line({ receivedQuantity: 80 })]);
    assert.equal(short.readyToPay, true, "short delivery still pays for what arrived");

    const over = summariseMatch([line({ receivedQuantity: 110 })]);
    assert.equal(over.readyToPay, false);
    assert.equal(over.overReceivedValue, 1_450);
  });

  it("counts clean lines against exceptions", () => {
    const result = summariseMatch([
      line({ requestItemId: "a" }),
      line({ requestItemId: "b", receivedQuantity: 90 }),
      line({ requestItemId: "c", receivedQuantity: 130 }),
    ]);

    assert.equal(result.cleanCount, 1);
    assert.equal(result.exceptionCount, 2);
    assert.equal(result.shortDeliveredQuantity, 10);
  });

  it("never reports an empty receipt as ready to pay", () => {
    const result = summariseMatch([]);
    assert.equal(result.readyToPay, false);
  });
});
