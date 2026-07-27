import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  aggregateBoqLineActuals,
  boqLineVariance,
  EMPTY_BOQ_LINE_ACTUALS,
  type BoqLineActualsRow,
} from "../src/lib/ops/boq-actuals";
import type { OpsMaterialRequestStatus } from "../src/lib/ops/types";

function row(
  overrides: Partial<BoqLineActualsRow> & { lineId?: string; status?: OpsMaterialRequestStatus },
): BoqLineActualsRow {
  const { lineId = "line-1", status = "approved", ...rest } = overrides;
  return {
    boq_line_item_id: lineId,
    quantity: 10,
    estimated_total: 1000,
    actual_total: 0,
    request: { id: `req-${status}`, request_number: "MR-001", status },
    ...rest,
  };
}

describe("aggregateBoqLineActuals", () => {
  it("sums quantity and value per schedule line", () => {
    const result = aggregateBoqLineActuals([
      row({ quantity: 10, estimated_total: 1000 }),
      row({ quantity: 5, estimated_total: 500, request: { id: "req-2", request_number: "MR-002", status: "submitted" } }),
    ]);

    const line = result.get("line-1");
    assert.ok(line);
    assert.equal(line.requestedQuantity, 15);
    assert.equal(line.requestedValue, 1500);
    assert.equal(line.requestCount, 2);
  });

  it("prefers the priced total over the engineer estimate", () => {
    const result = aggregateBoqLineActuals([
      row({ estimated_total: 1000, actual_total: 1250 }),
    ]);

    const line = result.get("line-1");
    assert.ok(line);
    assert.equal(line.requestedValue, 1250);
    assert.equal(line.requests[0].isPriced, true);
  });

  it("falls back to the estimate when procurement has not priced yet", () => {
    const result = aggregateBoqLineActuals([row({ estimated_total: 900, actual_total: 0 })]);

    const line = result.get("line-1");
    assert.ok(line);
    assert.equal(line.requestedValue, 900);
    assert.equal(line.requests[0].isPriced, false);
  });

  it("ignores rejected and cancelled requests", () => {
    const result = aggregateBoqLineActuals([
      row({ quantity: 10, request: { id: "r1", request_number: "MR-1", status: "rejected" } }),
      row({ quantity: 7, request: { id: "r2", request_number: "MR-2", status: "cancelled" } }),
      row({ quantity: 3, request: { id: "r3", request_number: "MR-3", status: "approved" } }),
    ]);

    const line = result.get("line-1");
    assert.ok(line);
    assert.equal(line.requestedQuantity, 3);
    assert.equal(line.requestCount, 1);
  });

  it("counts delivered and closed requests as delivered quantity", () => {
    const result = aggregateBoqLineActuals([
      row({ quantity: 4, request: { id: "r1", request_number: "MR-1", status: "delivered" } }),
      row({ quantity: 6, request: { id: "r2", request_number: "MR-2", status: "closed" } }),
      row({ quantity: 5, request: { id: "r3", request_number: "MR-3", status: "approved" } }),
    ]);

    const line = result.get("line-1");
    assert.ok(line);
    assert.equal(line.requestedQuantity, 15);
    assert.equal(line.deliveredQuantity, 10);
  });

  it("keeps separate schedule lines separate", () => {
    const result = aggregateBoqLineActuals([
      row({ lineId: "line-a", quantity: 2 }),
      row({ lineId: "line-b", quantity: 8 }),
    ]);

    assert.equal(result.get("line-a")?.requestedQuantity, 2);
    assert.equal(result.get("line-b")?.requestedQuantity, 8);
  });

  it("skips rows with no linked schedule line or no request", () => {
    const result = aggregateBoqLineActuals([
      row({ boq_line_item_id: null }),
      row({ request: null }),
    ]);

    assert.equal(result.size, 0);
  });
});

describe("boqLineVariance", () => {
  it("reports the requested share of a partly consumed line", () => {
    const variance = boqLineVariance({
      plannedQuantity: 100,
      plannedValue: 10000,
      actuals: { ...EMPTY_BOQ_LINE_ACTUALS, requestedQuantity: 25, requestedValue: 2500 },
    });

    assert.equal(variance.requestedPercent, 25);
    assert.equal(variance.remainingQuantity, 75);
    assert.equal(variance.isOverRequested, false);
    assert.equal(variance.valueVariance, 7500);
    assert.equal(variance.isOverValue, false);
  });

  it("flags over-requested quantity and floors remaining at zero", () => {
    const variance = boqLineVariance({
      plannedQuantity: 10,
      plannedValue: 1000,
      actuals: { ...EMPTY_BOQ_LINE_ACTUALS, requestedQuantity: 14, requestedValue: 1400 },
    });

    assert.equal(variance.isOverRequested, true);
    assert.equal(variance.remainingQuantity, 0);
    assert.equal(variance.valueVariance, -400);
    assert.equal(variance.isOverValue, true);
  });

  it("flags value overrun even when quantity is within plan", () => {
    // Same quantity, but procurement priced it above the schedule rate.
    const variance = boqLineVariance({
      plannedQuantity: 10,
      plannedValue: 1000,
      actuals: { ...EMPTY_BOQ_LINE_ACTUALS, requestedQuantity: 8, requestedValue: 1200 },
    });

    assert.equal(variance.isOverRequested, false);
    assert.equal(variance.isOverValue, true);
    assert.equal(variance.valueVariance, -200);
  });

  it("does not divide by zero on a zero-quantity line", () => {
    const variance = boqLineVariance({
      plannedQuantity: 0,
      plannedValue: 0,
      actuals: { ...EMPTY_BOQ_LINE_ACTUALS, requestedQuantity: 5, requestedValue: 500 },
    });

    assert.equal(variance.requestedPercent, 0);
    assert.equal(variance.isOverRequested, true);
  });
});
