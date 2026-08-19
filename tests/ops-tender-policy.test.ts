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
    itemsWithRegisteredSupplier: 3,
    itemsWithUnregisteredSupplier: 0,
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
    assert.equal(result.trigger, "none");
  });

  it("requires competitive prices at or above the threshold", () => {
    const atThreshold = evaluate({ requestValue: 50_000 });
    assert.equal(atThreshold.required, true);
    assert.equal(atThreshold.satisfied, false);
    assert.equal(atThreshold.trigger, "over_threshold");
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
    const result = evaluate({ itemsWithRegisteredSupplier: 0 });
    assert.equal(result.required, true);
    assert.equal(result.trigger, "no_supplier");
    assert.match(result.reason, /No line names a supplier/);
  });

  it("requires a tender when a supplier is not on the approved register", () => {
    const result = evaluate({ itemsWithUnapprovedSupplier: 1 });
    assert.equal(result.required, true);
    assert.equal(result.trigger, "not_approved");
    assert.match(result.reason, /on hold or archived/);
  });

  it("does not demand a supplier on an empty request", () => {
    // An empty request is blocked earlier for having no lines; the tender
    // policy must not invent a second, confusing reason.
    const result = evaluate({
      itemCount: 0,
      itemsWithRegisteredSupplier: 0,
      requestValue: 0,
    });
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
      itemsWithRegisteredSupplier: 0,
      itemsWithUnapprovedSupplier: 2,
    });
    assert.equal(result.required, true);
    assert.equal(result.trigger, "over_threshold");
    assert.match(result.reason, /tender threshold/);
  });
});

// ── Audit F1 ───────────────────────────────────────────────────────────────
// A line may name its supplier either by register row (`supplier_id`) or by
// typed text (`supplier_name_freeform`). The request screen shows the typed
// name as "Supplier: MTN (not in master list)", so the request plainly DOES
// name a supplier. Counting only register rows made the screen and the gate
// contradict each other, and sent the reader to the most expensive remedy.
describe("evaluateTenderRequirement — typed suppliers (F1)", () => {
  it("does not claim 'no supplier' when one was typed rather than picked", () => {
    const result = evaluate({
      itemCount: 1,
      requestValue: 1_000,
      itemsWithRegisteredSupplier: 0,
      itemsWithUnregisteredSupplier: 1,
      unregisteredSupplierNames: ["MTN"],
    });

    assert.equal(result.trigger, "unregistered");
    assert.doesNotMatch(result.reason, /No line names a supplier/);
    assert.match(result.reason, /MTN/);
    assert.match(result.reason, /not on the approved supplier register/);
  });

  it("offers registering the supplier as a remedy below the threshold", () => {
    const result = evaluate({
      itemCount: 1,
      requestValue: 1_000,
      itemsWithRegisteredSupplier: 0,
      itemsWithUnregisteredSupplier: 1,
      unregisteredSupplierNames: ["MTN"],
    });

    // The cheap fix must be offered: an RFQ is not the only way through.
    assert.equal(result.rfqIsOnlyRemedy, false);
    assert.match(result.remedy, /supplier register/);
  });

  it("clears entirely once the typed supplier is registered", () => {
    // Exactly what happens when Procurement adds MTN to the register: the
    // line's supplier_id fills in and the freeform name is dropped.
    const before = evaluate({
      itemCount: 1,
      requestValue: 1_000,
      itemsWithRegisteredSupplier: 0,
      itemsWithUnregisteredSupplier: 1,
      unregisteredSupplierNames: ["MTN"],
    });
    const after = evaluate({
      itemCount: 1,
      requestValue: 1_000,
      itemsWithRegisteredSupplier: 1,
      itemsWithUnregisteredSupplier: 0,
    });

    assert.equal(before.required, true);
    assert.equal(after.required, false);
  });

  it("still demands competition above the threshold, register or not", () => {
    const result = evaluate({
      requestValue: 500_000,
      itemsWithRegisteredSupplier: 3,
      itemsWithUnregisteredSupplier: 0,
    });

    assert.equal(result.required, true);
    assert.equal(result.trigger, "over_threshold");
    assert.equal(result.rfqIsOnlyRemedy, true);
  });

  it("names several typed suppliers readably", () => {
    const result = evaluate({
      itemCount: 3,
      requestValue: 1_000,
      itemsWithRegisteredSupplier: 0,
      itemsWithUnregisteredSupplier: 3,
      unregisteredSupplierNames: ["MTN", "Airtel", "Zamtel"],
    });

    assert.match(result.reason, /MTN, Airtel and Zamtel/);
  });

  it("reports 'no supplier' only when neither kind is present", () => {
    const result = evaluate({
      itemCount: 2,
      requestValue: 1_000,
      itemsWithRegisteredSupplier: 0,
      itemsWithUnregisteredSupplier: 0,
    });

    assert.equal(result.trigger, "no_supplier");
    assert.equal(result.rfqIsOnlyRemedy, false);
    assert.match(result.remedy, /Name the supplier on each line/);
  });

  it("always states a remedy whenever it blocks", () => {
    // The old gate could refuse with a reason and no actionable next step.
    for (const overrides of [
      { itemsWithRegisteredSupplier: 0 },
      { itemsWithUnapprovedSupplier: 1 },
      { requestValue: 500_000 },
      {
        itemsWithRegisteredSupplier: 0,
        itemsWithUnregisteredSupplier: 1,
        unregisteredSupplierNames: ["MTN"],
      },
    ]) {
      const result = evaluate(overrides);
      assert.equal(result.required, true);
      assert.ok(result.reason.length > 0, `no reason for ${JSON.stringify(overrides)}`);
      assert.ok(result.remedy.length > 0, `no remedy for ${JSON.stringify(overrides)}`);
    }
  });
});
