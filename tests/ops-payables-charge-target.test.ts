import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  affectsCurrentYearProfit,
  resolveOpsChargeTarget,
} from "../src/lib/ops/payables-core";

/**
 * Every payable is charged to exactly one thing.
 *
 * The database CHECK constraint is the guarantee; this resolver is what turns a
 * violation into a sentence someone can act on. These tests pin both the
 * invariant and the specific refusals that stop a payable being attached to
 * something it does not belong to.
 */

const SITE = "11111111-1111-4111-8111-111111111111";
const LEGACY = "22222222-2222-4222-8222-222222222222";
const CENTRE = "33333333-3333-4333-8333-333333333333";
const BUDGET_LINE = "44444444-4444-4444-8444-444444444444";

const ok = (result: ReturnType<typeof resolveOpsChargeTarget>) => {
  assert.equal(result.ok, true, result.ok === false ? result.message : "");
  return result.ok === true ? result.value : null!;
};

describe("site payables are unchanged", () => {
  it("resolves with only site_id set", () => {
    const value = ok(resolveOpsChargeTarget({ chargeTarget: "site", siteId: SITE }));
    assert.deepEqual(value, {
      charge_target: "site",
      cost_centre_id: null,
      cost_treatment: null,
      legacy_project_id: null,
      site_id: SITE,
    });
  });

  it("still allows a budget line", () => {
    assert.equal(
      resolveOpsChargeTarget({
        budgetLineId: BUDGET_LINE,
        chargeTarget: "site",
        siteId: SITE,
      }).ok,
      true,
    );
  });

  it("refuses a site payable with no site", () => {
    const result = resolveOpsChargeTarget({ chargeTarget: "site", siteId: "" });
    assert.equal(result.ok, false);
  });
});

describe("legacy project payables", () => {
  it("resolves with only the legacy project and a treatment", () => {
    const value = ok(
      resolveOpsChargeTarget({
        chargeTarget: "legacy_project",
        costTreatment: "opening_balance",
        legacyProjectId: LEGACY,
      }),
    );
    assert.equal(value.legacy_project_id, LEGACY);
    assert.equal(value.site_id, null);
    assert.equal(value.cost_centre_id, null);
    assert.equal(value.cost_treatment, "opening_balance");
  });

  it("refuses without a project selected", () => {
    assert.equal(
      resolveOpsChargeTarget({
        chargeTarget: "legacy_project",
        costTreatment: "opening_balance",
      }).ok,
      false,
    );
  });

  it("refuses without a cost treatment", () => {
    // Defaulting silently here would pick an accounting policy on the user's
    // behalf and move — or fail to move — this year's profit without anyone
    // deciding to.
    const result = resolveOpsChargeTarget({
      chargeTarget: "legacy_project",
      legacyProjectId: LEGACY,
    });
    assert.equal(result.ok, false);
    assert.match(result.ok === false ? result.message : "", /opening balance|current year/i);
  });

  it("refuses an unknown cost treatment", () => {
    assert.equal(
      resolveOpsChargeTarget({
        chargeTarget: "legacy_project",
        costTreatment: "whatever",
        legacyProjectId: LEGACY,
      }).ok,
      false,
    );
  });

  it("refuses a budget line, with a reason that explains why", () => {
    const result = resolveOpsChargeTarget({
      budgetLineId: BUDGET_LINE,
      chargeTarget: "legacy_project",
      costTreatment: "opening_balance",
      legacyProjectId: LEGACY,
    });
    assert.equal(result.ok, false);
    assert.match(result.ok === false ? result.message : "", /completed project has no live budget/i);
  });
});

describe("overhead payables", () => {
  it("resolves with only the cost centre", () => {
    const value = ok(
      resolveOpsChargeTarget({ chargeTarget: "overhead", costCentreId: CENTRE }),
    );
    assert.equal(value.cost_centre_id, CENTRE);
    assert.equal(value.site_id, null);
    assert.equal(value.legacy_project_id, null);
    assert.equal(value.cost_treatment, null);
  });

  it("refuses without a cost centre", () => {
    assert.equal(resolveOpsChargeTarget({ chargeTarget: "overhead" }).ok, false);
  });

  it("refuses a budget line", () => {
    assert.equal(
      resolveOpsChargeTarget({
        budgetLineId: BUDGET_LINE,
        chargeTarget: "overhead",
        costCentreId: CENTRE,
      }).ok,
      false,
    );
  });
});

describe("the invariant itself", () => {
  it("never returns more than one attribution", () => {
    // Even when every id is supplied, exactly one survives. This is what stops
    // a payable being charged to two places at once.
    for (const chargeTarget of ["site", "legacy_project", "overhead"]) {
      const result = resolveOpsChargeTarget({
        chargeTarget,
        costCentreId: CENTRE,
        costTreatment: "opening_balance",
        legacyProjectId: LEGACY,
        siteId: SITE,
      });

      assert.equal(result.ok, true, chargeTarget);
      const value = result.ok === true ? result.value : null!;
      const set = [value.site_id, value.legacy_project_id, value.cost_centre_id].filter(Boolean);
      assert.equal(set.length, 1, `${chargeTarget} produced ${set.length} attributions`);
    }
  });

  it("rejects an unknown charge target rather than guessing", () => {
    assert.equal(resolveOpsChargeTarget({ chargeTarget: "" }).ok, false);
    assert.equal(resolveOpsChargeTarget({ chargeTarget: "project" }).ok, false);
  });
});

describe("current-year profit impact", () => {
  it("an opening-balance legacy payable does not move this year's profit", () => {
    assert.equal(
      affectsCurrentYearProfit({
        charge_target: "legacy_project",
        cost_treatment: "opening_balance",
      }),
      false,
    );
  });

  it("everything else does", () => {
    assert.equal(
      affectsCurrentYearProfit({
        charge_target: "legacy_project",
        cost_treatment: "current_period",
      }),
      true,
    );
    assert.equal(
      affectsCurrentYearProfit({ charge_target: "site", cost_treatment: null }),
      true,
    );
    assert.equal(
      affectsCurrentYearProfit({ charge_target: "overhead", cost_treatment: null }),
      true,
    );
  });
});
