import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  costCodeChoiceValue,
  leafCostCodeChoices,
  optionalCostCodeSelectionSchema,
  type OpsCostCodeChoice,
} from "../src/lib/ops/cost-code-picker";

const NODE_ID = "11111111-1111-4111-8111-111111111111";
const LIB_ID = "22222222-2222-4222-8222-222222222222";

function choice(patch: Partial<OpsCostCodeChoice>): OpsCostCodeChoice {
  return {
    value: `node:${NODE_ID}`,
    label: "GEN.03.30 · Concrete works",
    group: "project",
    division: null,
    isPhase: false,
    isContingency: false,
    ...patch,
  };
}

describe("optionalCostCodeSelectionSchema", () => {
  // An unset <select> submits "", and that has to mean "not coded" rather than
  // a validation failure — otherwise the picker becomes mandatory everywhere it
  // appears, including on records that legitimately carry no cost.
  it("treats an empty submission as not-coded rather than invalid", () => {
    const parsed = optionalCostCodeSelectionSchema.safeParse("");
    assert.equal(parsed.success, true);
    assert.equal(parsed.success && parsed.data, null);
  });

  it("treats whitespace as not-coded", () => {
    const parsed = optionalCostCodeSelectionSchema.safeParse("   ");
    assert.equal(parsed.success, true);
    assert.equal(parsed.success && parsed.data, null);
  });

  it("accepts an existing project node reference", () => {
    const parsed = optionalCostCodeSelectionSchema.safeParse(`node:${NODE_ID}`);
    assert.equal(parsed.success, true);
    assert.equal(parsed.success && parsed.data, `node:${NODE_ID}`);
  });

  it("accepts a library reference, which is provisioned onto the project", () => {
    const parsed = optionalCostCodeSelectionSchema.safeParse(`lib:${LIB_ID}`);
    assert.equal(parsed.success, true);
    assert.equal(parsed.success && parsed.data, `lib:${LIB_ID}`);
  });

  it("rejects a bare uuid with no kind prefix", () => {
    // Guards the old single-kind format from silently reaching the resolver,
    // where it would be read as neither a node nor a library code.
    const parsed = optionalCostCodeSelectionSchema.safeParse(NODE_ID);
    assert.equal(parsed.success, false);
  });

  it("rejects an unknown prefix and a malformed id", () => {
    for (const value of [
      `phase:${NODE_ID}`,
      "node:not-a-uuid",
      "lib:",
      "CIV-001",
      "GEN.03.30",
    ]) {
      const parsed = optionalCostCodeSelectionSchema.safeParse(value);
      assert.equal(parsed.success, false, `expected ${value} to be rejected`);
    }
  });
});

describe("costCodeChoiceValue", () => {
  // Round-trips a saved cost code back into the form value that preselects it.
  it("prefixes a saved id so the select matches its option", () => {
    assert.equal(costCodeChoiceValue(NODE_ID), `node:${NODE_ID}`);
  });

  it("maps an unset code to the empty option", () => {
    assert.equal(costCodeChoiceValue(null), "");
    assert.equal(costCodeChoiceValue(undefined), "");
  });
});

describe("leafCostCodeChoices", () => {
  // Spend must charge a leaf: a phase's total is the roll-up of the leaves
  // beneath it, so booking at both levels on one branch double-counts.
  it("drops phase nodes and keeps leaves", () => {
    const choices = [
      choice({ value: "node:a", isPhase: true, label: "P1 · Phase 1" }),
      choice({ value: "node:b" }),
      choice({ value: `lib:${LIB_ID}`, group: "library", division: "Concrete" }),
    ];

    assert.deepEqual(
      leafCostCodeChoices(choices).map((leaf) => leaf.value),
      ["node:b", `lib:${LIB_ID}`],
    );
  });

  // The whole point of the library group: a project with no work breakdown of
  // its own still gets a full list, so the picker is never an empty dead end.
  it("keeps library choices when the project has no leaves of its own", () => {
    const choices = [
      choice({ value: "node:a", isPhase: true }),
      choice({ value: `lib:${LIB_ID}`, group: "library", division: "Concrete" }),
    ];

    const leaves = leafCostCodeChoices(choices);
    assert.equal(leaves.length, 1);
    assert.equal(leaves[0]?.group, "library");
  });
});
