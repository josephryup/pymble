import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  leafCostCodeOptions,
  optionalCostCodeIdSchema,
  type OpsCostCodeOption,
} from "../src/lib/ops/cost-code-picker";

function option(patch: Partial<OpsCostCodeOption>): OpsCostCodeOption {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    path: "GEN.03.30",
    name: "Concrete works",
    label: "GEN.03.30 · Concrete works",
    isPhase: false,
    isContingency: false,
    ...patch,
  };
}

describe("optionalCostCodeIdSchema", () => {
  // An unset <select> submits "", and that has to mean "not coded" rather than
  // a validation failure — otherwise the picker becomes mandatory everywhere
  // it appears, including on projects that have no WBS yet.
  it("treats an empty submission as not-coded rather than invalid", () => {
    const parsed = optionalCostCodeIdSchema.safeParse("");
    assert.equal(parsed.success, true);
    assert.equal(parsed.success && parsed.data, null);
  });

  it("treats whitespace as not-coded", () => {
    const parsed = optionalCostCodeIdSchema.safeParse("   ");
    assert.equal(parsed.success, true);
    assert.equal(parsed.success && parsed.data, null);
  });

  it("accepts a uuid", () => {
    const id = "22222222-2222-4222-8222-222222222222";
    const parsed = optionalCostCodeIdSchema.safeParse(id);
    assert.equal(parsed.success, true);
    assert.equal(parsed.success && parsed.data, id);
  });

  it("rejects anything that is not a uuid", () => {
    // Guards against a free-text code being posted straight through — the
    // exact drift the WBS replaced.
    for (const value of ["CIV-001", "GEN.03.30", "not-a-uuid", "1234"]) {
      const parsed = optionalCostCodeIdSchema.safeParse(value);
      assert.equal(parsed.success, false, `expected ${value} to be rejected`);
    }
  });
});

describe("leafCostCodeOptions", () => {
  // Spend must charge a leaf: a phase's total is the roll-up of the leaves
  // beneath it, so booking at both levels on one branch double-counts.
  it("drops phase nodes and keeps leaves", () => {
    const options = [
      option({ id: "a", isPhase: true, path: "P1", label: "P1 · Phase 1" }),
      option({ id: "b", isPhase: false }),
      option({ id: "c", isPhase: false, isContingency: true }),
    ];

    const leaves = leafCostCodeOptions(options);

    assert.deepEqual(
      leaves.map((leaf) => leaf.id),
      ["b", "c"],
    );
  });

  it("returns an empty list when a project has only phases", () => {
    const leaves = leafCostCodeOptions([option({ isPhase: true })]);
    assert.deepEqual(leaves, []);
  });
});
