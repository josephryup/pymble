export type OpsPaymentChargeTarget = "site" | "legacy_project" | "overhead";

export type OpsLegacyCostTreatment = "opening_balance" | "current_period";

/**
 * Resolving what a payable is charged to.
 *
 * Every payable names exactly one thing it belongs to, from a closed set:
 *
 *   site           live project work
 *   legacy_project a completed project in the legacy register
 *   overhead       a cost centre; company cost with no project at all
 *
 * The database enforces this with a CHECK constraint, which is what makes it
 * actually true. This module exists so the app can say *why* something is
 * wrong before the database refuses it — a constraint violation is a correct
 * answer and a useless error message.
 *
 * The pair is deliberate: the constraint is the guarantee, this is the
 * explanation. Neither replaces the other.
 */

export type OpsResolvedChargeTarget = {
  charge_target: OpsPaymentChargeTarget;
  cost_centre_id: string | null;
  cost_treatment: OpsLegacyCostTreatment | null;
  legacy_project_id: string | null;
  site_id: string | null;
};

export type OpsChargeTargetInput = {
  budgetLineId?: string | null;
  chargeTarget: string;
  costCentreId?: string | null;
  /** Default inherited from the legacy project; may be overridden per payable. */
  costTreatment?: string | null;
  legacyProjectId?: string | null;
  siteId?: string | null;
};

const TARGETS = new Set<OpsPaymentChargeTarget>(["site", "legacy_project", "overhead"]);
const TREATMENTS = new Set<OpsLegacyCostTreatment>(["opening_balance", "current_period"]);

function blank(value: string | null | undefined) {
  return !value || value.trim().length === 0;
}

export function resolveOpsChargeTarget(
  input: OpsChargeTargetInput,
): { ok: true; value: OpsResolvedChargeTarget } | { ok: false; message: string } {
  if (!TARGETS.has(input.chargeTarget as OpsPaymentChargeTarget)) {
    return { ok: false, message: "Choose what this payment is charged to." };
  }

  const target = input.chargeTarget as OpsPaymentChargeTarget;

  if (target === "site") {
    if (blank(input.siteId)) {
      return { ok: false, message: "Select the site this payment belongs to." };
    }

    return {
      ok: true,
      value: {
        charge_target: "site",
        cost_centre_id: null,
        cost_treatment: null,
        legacy_project_id: null,
        site_id: input.siteId!,
      },
    };
  }

  // Neither a completed project nor an overhead cost has a live project budget
  // to consume. Silently dropping the budget line would be worse than
  // refusing: budget availability drives the procurement gates, and a payable
  // that quietly consumed nothing is exactly the kind of drift the finance
  // spine audit was about.
  if (!blank(input.budgetLineId)) {
    return {
      ok: false,
      message:
        target === "legacy_project"
          ? "A completed project has no live budget, so this payable cannot use a budget line."
          : "Overhead costs are not project budget spend, so this payable cannot use a budget line.",
    };
  }

  if (target === "legacy_project") {
    if (blank(input.legacyProjectId)) {
      return { ok: false, message: "Select the completed project this payable belongs to." };
    }

    if (!TREATMENTS.has(input.costTreatment as OpsLegacyCostTreatment)) {
      return {
        ok: false,
        message:
          "Choose how this cost is treated: an opening balance, or a cost for the current year.",
      };
    }

    return {
      ok: true,
      value: {
        charge_target: "legacy_project",
        cost_centre_id: null,
        cost_treatment: input.costTreatment as OpsLegacyCostTreatment,
        legacy_project_id: input.legacyProjectId!,
        site_id: null,
      },
    };
  }

  if (blank(input.costCentreId)) {
    return { ok: false, message: "Select the cost centre this overhead belongs to." };
  }

  return {
    ok: true,
    value: {
      charge_target: "overhead",
      cost_centre_id: input.costCentreId!,
      cost_treatment: null,
      legacy_project_id: null,
      site_id: null,
    },
  };
}

/** Human label for the thing a payable is charged to. */
export function formatOpsChargeTarget(target: OpsPaymentChargeTarget) {
  switch (target) {
    case "site":
      return "Site";
    case "legacy_project":
      return "Completed project";
    case "overhead":
      return "Overhead";
  }
}

export function formatOpsCostTreatment(treatment: OpsLegacyCostTreatment) {
  return treatment === "opening_balance"
    ? "Opening balance (prior year)"
    : "Current year cost";
}

/**
 * Does this payable move current-year profit?
 *
 * Used by reporting so an operations backlog being loaded onto the books does
 * not read as this year's costs having exploded.
 */
export function affectsCurrentYearProfit(resolved: {
  charge_target: OpsPaymentChargeTarget;
  cost_treatment: OpsLegacyCostTreatment | null;
}) {
  return !(
    resolved.charge_target === "legacy_project" &&
    resolved.cost_treatment === "opening_balance"
  );
}
