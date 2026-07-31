import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_TENDER_POLICY,
  evaluateTenderRequirement,
} from "../src/lib/ops/tender-policy";

function evaluate(overrides: Partial<Parameters<typeof evaluateTenderRequirement>[0]> = {}) {
  return evaluateTenderRequirement({
    requestValue: 10_000,
    itemCount: 3,
    itemsWithSupplier: 3,
    itemsWithUnapprovedSupplier: 0,
    competitiveQuotesRecorded: 0,
    policy: DEFAULT_TENDER_POLICY,
    ...overrides,
  });
}

describe("evaluateTenderRequirement", () => {
  it("lets a small request with a known supplier price directly", () => {
    // What already happens in practice, and it is fine.
    const result = evaluate();
    assert.equal(result.required, false);
    assert.equal(result.satisfied, true);
  });

  it("requires competitive prices at or above the threshold", () => {
    const atThreshold = evaluate({ requestValue: 50_000 });
    assert.equal(atThreshold.required, true);
    assert.equal(atThreshold.satisfied, false);
    assert.match(atThreshold.reason, /tender threshold/);

    const justBelow = evaluate({ requestValue: 49_999 });
    assert.equal(justBelow.required, false);
  });

  it("is satisfied once comparison prices are recorded", () => {
    const result = evaluate({ requestValue: 500_000, competitiveQuotesRecorded: 1 });
    assert.equal(result.required, true);
    assert.equal(result.satisfied, true);
  });

  it("requires a tender when no item names a supplier", () => {
    const result = evaluate({ itemsWithSupplier: 0 });
    assert.equal(result.required, true);
    assert.match(result.reason, /No item names a supplier/);
  });

  it("requires a tender when a supplier is not on the approved register", () => {
    const result = evaluate({ itemsWithUnapprovedSupplier: 1 });
    assert.equal(result.required, true);
    assert.match(result.reason, /not on the approved register/);
  });

  it("does not demand a supplier on an empty request", () => {
    // An empty request is blocked earlier for having no lines; the tender
    // policy must not invent a second, confusing reason.
    const result = evaluate({ itemCount: 0, itemsWithSupplier: 0, requestValue: 0 });
    assert.equal(result.required, false);
  });

  it("honours a management-configured threshold", () => {
    const result = evaluate({
      requestValue: 20_000,
      policy: { thresholdZmw: 15_000, unitPriceTolerancePercent: 5 },
    });
    assert.equal(result.required, true);
  });

  it("prefers the value reason when several triggers fire at once", () => {
    const result = evaluate({
      requestValue: 500_000,
      itemsWithSupplier: 0,
      itemsWithUnapprovedSupplier: 2,
    });
    assert.equal(result.required, true);
    assert.match(result.reason, /tender threshold/);
  });
});
