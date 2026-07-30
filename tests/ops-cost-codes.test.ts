import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canManageOpsCostCodeLibrary,
  canManageOpsProjectCostCodes,
  canRequestOpsCostCode,
} from "../src/lib/ops/cost-code-permissions";
import {
  flattenCostCodeTree,
  rollUpCostCodeTree,
  type CostCodeAmounts,
  type OpsProjectCostCodeRow,
} from "../src/lib/ops/cost-codes";

function node(
  overrides: Partial<OpsProjectCostCodeRow> & { id: string },
): OpsProjectCostCodeRow {
  return {
    site_id: "site-1",
    parent_id: null,
    library_code_id: null,
    code: overrides.id,
    path: overrides.id,
    name: overrides.id,
    sort_order: 0,
    is_active: true,
    ...overrides,
  };
}

function leaf(id: string, parentId: string, code: string): OpsProjectCostCodeRow {
  return node({
    id,
    parent_id: parentId,
    library_code_id: `lib-${code}`,
    code,
    path: `${parentId}.${code}`,
    name: code,
  });
}

function amounts(patch: Partial<CostCodeAmounts>): CostCodeAmounts {
  return { budgeted: 0, committed: 0, actual: 0, ...patch };
}

describe("rollUpCostCodeTree", () => {
  it("rolls leaf amounts up into their phase", () => {
    const nodes = [
      node({ id: "P1", code: "P1", path: "P1", name: "Phase 1" }),
      leaf("l1", "P1", "03.30"),
      leaf("l2", "P1", "03.20"),
    ];
    const map = new Map([
      ["l1", amounts({ budgeted: 100_000, committed: 40_000 })],
      ["l2", amounts({ budgeted: 50_000, actual: 25_000 })],
    ]);

    const { roots, totals } = rollUpCostCodeTree(nodes, map);

    assert.equal(roots.length, 1);
    const phase = roots[0];
    assert.equal(phase.isPhase, true);
    // A phase holds no money of its own — only the sum beneath it.
    assert.deepEqual(phase.own, amounts({}));
    assert.deepEqual(phase.total, amounts({ budgeted: 150_000, committed: 40_000, actual: 25_000 }));
    assert.deepEqual(totals, phase.total);
  });

  it("keeps two phases independent (the per-phase schedule shape)", () => {
    const nodes = [
      node({ id: "P1", code: "P1", path: "P1", name: "Phase 1" }),
      leaf("l1", "P1", "03.30"),
      node({ id: "P2", code: "P2", path: "P2", name: "Phase 2" }),
      leaf("l2", "P2", "07.10"),
    ];
    const map = new Map([
      ["l1", amounts({ budgeted: 500_000 })],
      ["l2", amounts({ budgeted: 320_000 })],
    ]);

    const { roots, totals } = rollUpCostCodeTree(nodes, map);

    assert.equal(roots.length, 2);
    assert.equal(roots[0].total.budgeted, 500_000);
    assert.equal(roots[1].total.budgeted, 320_000);
    assert.equal(totals.budgeted, 820_000);
  });

  it("surfaces an orphaned leaf at the root rather than dropping its money", () => {
    const nodes = [
      node({ id: "P1", code: "P1", path: "P1", name: "Phase 1" }),
      leaf("l1", "P1", "03.30"),
      // Parent phase absent from the set (e.g. pruned as inactive).
      leaf("l-orphan", "P-missing", "09.20"),
    ];
    const map = new Map([
      ["l1", amounts({ budgeted: 100 })],
      ["l-orphan", amounts({ budgeted: 999 })],
    ]);

    const { roots, totals } = rollUpCostCodeTree(nodes, map);

    assert.equal(roots.length, 2);
    assert.equal(totals.budgeted, 1099);
  });

  it("never lets a phase's own amount break the sum-of-leaves invariant", () => {
    const nodes = [
      node({ id: "P1", code: "P1", path: "P1", name: "Phase 1" }),
      leaf("l1", "P1", "03.30"),
    ];
    // A document wrongly points at the phase node itself.
    const map = new Map([
      ["P1", amounts({ budgeted: 7_777 })],
      ["l1", amounts({ budgeted: 100 })],
    ]);

    const { roots } = rollUpCostCodeTree(nodes, map);

    assert.deepEqual(roots[0].own, amounts({}));
    // The stray amount still surfaces in the total — money is never hidden.
    assert.equal(roots[0].total.budgeted, 7_877);
  });

  it("returns empty totals for a site with no WBS yet", () => {
    const { roots, totals } = rollUpCostCodeTree([], new Map());
    assert.deepEqual(roots, []);
    assert.deepEqual(totals, amounts({}));
  });

  it("rounds money rather than accumulating float drift", () => {
    const nodes = [
      node({ id: "P1", code: "P1", path: "P1", name: "P1" }),
      leaf("a", "P1", "01.10"),
      leaf("b", "P1", "01.20"),
      leaf("c", "P1", "01.30"),
    ];
    const map = new Map([
      ["a", amounts({ budgeted: 0.1 })],
      ["b", amounts({ budgeted: 0.2 })],
      ["c", amounts({ budgeted: 0.3 })],
    ]);

    const { totals } = rollUpCostCodeTree(nodes, map);
    assert.equal(totals.budgeted, 0.6);
  });
});

describe("flattenCostCodeTree", () => {
  it("emits parents before children with depth", () => {
    const nodes = [
      node({ id: "P1", code: "P1", path: "P1", name: "Phase 1" }),
      leaf("l2", "P1", "09.20"),
      leaf("l1", "P1", "03.30"),
    ];
    const { roots } = rollUpCostCodeTree(nodes, new Map());
    const flat = flattenCostCodeTree(roots);

    assert.deepEqual(
      flat.map((row) => [row.code, row.depth]),
      [
        ["P1", 0],
        ["03.30", 1],
        ["09.20", 1],
      ],
    );
  });
});

describe("cost code permissions", () => {
  it("gives the library to Finance Manager and the MD only", () => {
    assert.equal(canManageOpsCostCodeLibrary("finance_manager"), true);
    assert.equal(canManageOpsCostCodeLibrary("managing_director"), true);
    // Delivery leadership runs projects, not the ledger.
    assert.equal(canManageOpsCostCodeLibrary("general_manager"), false);
    assert.equal(canManageOpsCostCodeLibrary("operations_manager"), false);
    assert.equal(canManageOpsCostCodeLibrary("quantity_surveyor"), false);
    assert.equal(canManageOpsCostCodeLibrary("accountant"), false);
  });

  it("gives the project WBS to the QS and Projects Manager", () => {
    assert.equal(canManageOpsProjectCostCodes("quantity_surveyor"), true);
    assert.equal(canManageOpsProjectCostCodes("projects_manager"), true);
    assert.equal(canManageOpsProjectCostCodes("engineer"), false);
    assert.equal(canManageOpsProjectCostCodes("procurement"), false);
  });

  it("lets the people who spend money ask for a code they need", () => {
    assert.equal(canRequestOpsCostCode("engineer"), true);
    assert.equal(canRequestOpsCostCode("procurement"), true);
    assert.equal(canRequestOpsCostCode("quantity_surveyor"), true);
    assert.equal(canRequestOpsCostCode("crew"), false);
  });
});
