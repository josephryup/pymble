import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  boqDiffKey,
  diffBoqRevision,
  summarizeBoqRevisionDiff,
  type BoqDiffLine,
} from "../src/lib/ops/boq-revisions";

function line(overrides: Partial<BoqDiffLine> = {}): BoqDiffLine {
  const quantity = overrides.quantity ?? 10;
  const unitRate = overrides.unitRate ?? 100;
  return {
    description: "Cement 32.5N",
    unit: "bag",
    category: "structure",
    transportCost: 0,
    ...overrides,
    quantity,
    unitRate,
    total: overrides.total ?? quantity * unitRate,
  };
}

describe("boqDiffKey", () => {
  it("matches lines regardless of case and surrounding whitespace", () => {
    assert.equal(
      boqDiffKey({ description: "  Cement 32.5N ", unit: "Bag" }),
      boqDiffKey({ description: "cement 32.5n", unit: "bag" }),
    );
  });

  it("treats a different unit as a different line", () => {
    assert.notEqual(
      boqDiffKey({ description: "Cement", unit: "bag" }),
      boqDiffKey({ description: "Cement", unit: "tonne" }),
    );
  });
});

describe("diffBoqRevision", () => {
  it("reports no changes for an identical revision", () => {
    const diff = diffBoqRevision([line()], [line()]);
    assert.equal(diff.hasChanges, false);
    assert.equal(diff.unchanged, 1);
    assert.equal(diff.totalDelta, 0);
    assert.deepEqual(diff.categoryDeltas, []);
  });

  it("detects an added line and its cost", () => {
    const diff = diffBoqRevision(
      [line()],
      [line(), line({ description: "Rebar Y12", unit: "tonne", quantity: 2, unitRate: 15000 })],
    );

    assert.equal(diff.added.length, 1);
    assert.equal(diff.added[0].description, "Rebar Y12");
    assert.equal(diff.totalDelta, 30000);
    assert.equal(diff.hasChanges, true);
  });

  it("detects a removed line as a negative delta", () => {
    const diff = diffBoqRevision([line(), line({ description: "Sand", unit: "m3" })], [line()]);

    assert.equal(diff.removed.length, 1);
    assert.equal(diff.removed[0].description, "Sand");
    assert.equal(diff.totalDelta, -1000);
  });

  it("detects a quantity change and reports the movement", () => {
    const diff = diffBoqRevision([line({ quantity: 10 })], [line({ quantity: 25 })]);

    assert.equal(diff.changed.length, 1);
    assert.equal(diff.changed[0].quantityDelta, 15);
    assert.equal(diff.changed[0].rateDelta, 0);
    assert.equal(diff.changed[0].totalDelta, 1500);
    assert.equal(diff.totalDelta, 1500);
  });

  it("detects a repricing with unchanged quantity", () => {
    const diff = diffBoqRevision([line({ unitRate: 100 })], [line({ unitRate: 120 })]);

    assert.equal(diff.changed.length, 1);
    assert.equal(diff.changed[0].quantityDelta, 0);
    assert.equal(diff.changed[0].rateDelta, 20);
    assert.equal(diff.totalDelta, 200);
  });

  it("flags a reclassified line even when the money is identical", () => {
    const diff = diffBoqRevision(
      [line({ category: "structure" })],
      [line({ category: "finishes" })],
    );

    assert.equal(diff.changed.length, 1);
    assert.equal(diff.changed[0].categoryChanged, true);
    assert.equal(diff.changed[0].totalDelta, 0);
    // The money moved between categories even though the total did not change.
    assert.equal(diff.totalDelta, 0);
    assert.deepEqual(
      diff.categoryDeltas.map((entry) => entry.category).sort(),
      ["finishes", "structure"],
    );
  });

  it("reads a re-described line as a removal plus an addition", () => {
    const diff = diffBoqRevision(
      [line({ description: "Cement" })],
      [line({ description: "Cement 42.5N" })],
    );

    assert.equal(diff.added.length, 1);
    assert.equal(diff.removed.length, 1);
    assert.equal(diff.changed.length, 0);
  });

  it("summarises per-category movement, largest first", () => {
    const diff = diffBoqRevision(
      [line({ category: "structure", quantity: 10, unitRate: 100 })],
      [
        line({ category: "structure", quantity: 12, unitRate: 100 }),
        line({ description: "Paint", unit: "L", category: "finishes", quantity: 100, unitRate: 50 }),
      ],
    );

    assert.equal(diff.categoryDeltas[0].category, "finishes");
    assert.equal(diff.categoryDeltas[0].delta, 5000);
    assert.equal(diff.categoryDeltas[1].category, "structure");
    assert.equal(diff.categoryDeltas[1].delta, 200);
  });

  it("handles a first-ever revision against an empty predecessor", () => {
    const diff = diffBoqRevision([], [line()]);
    assert.equal(diff.added.length, 1);
    assert.equal(diff.previousTotal, 0);
    assert.equal(diff.revisedTotal, 1000);
  });

  it("handles a revision that strips every line", () => {
    const diff = diffBoqRevision([line()], []);
    assert.equal(diff.removed.length, 1);
    assert.equal(diff.revisedTotal, 0);
    assert.equal(diff.totalDelta, -1000);
  });
});

describe("summarizeBoqRevisionDiff", () => {
  it("describes an increase", () => {
    const diff = diffBoqRevision([line()], [line({ quantity: 20 })]);
    assert.equal(summarizeBoqRevisionDiff(diff), "1 changed — increase of 1000.00");
  });

  it("describes a decrease", () => {
    const diff = diffBoqRevision([line()], [line({ quantity: 5 })]);
    assert.equal(summarizeBoqRevisionDiff(diff), "1 changed — decrease of 500.00");
  });

  it("describes an unchanged revision", () => {
    const diff = diffBoqRevision([line()], [line()]);
    assert.equal(summarizeBoqRevisionDiff(diff), "no line changes — no change of 0.00");
  });
});
