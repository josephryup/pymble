import { recordOpsAuditEvent } from "@/lib/ops/audit";
import { ensureSiteContingencyCostCode } from "@/lib/ops/cost-code-derivation";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

/**
 * Activating a project budget, as a reconciliation rather than a flag.
 *
 * ── What activation used to do (workflow audit F3) ────────────────────────
 * It set `status = 'active'`, stamped two columns, and wrote an audit row.
 * That was the whole of it. It did not provision cost codes, did not resolve
 * budget lines on requests already in flight, did not link anything to the
 * material schedule, and did not re-stamp uncoded items.
 *
 * And because the availability check funded a cost code from `draft`,
 * `active` and `locked` budgets equally, activation was ALSO a no-op for every
 * control in the system. Both halves of "budgets when activated are not
 * linking automatically" were true at once: it linked nothing, and the linking
 * would not have mattered.
 *
 * ── What it does now ──────────────────────────────────────────────────────
 * The other half is fixed in budget-availability.ts — only `active` and
 * `locked` budgets fund anything. This module is the linking half: at the
 * moment a budget goes live, every request already open on that site is
 * attached to it, so the budget starts governing the work that is actually
 * happening rather than only the work booked after it.
 *
 * The result is reported back to the person who activated it. A reconciliation
 * nobody sees is indistinguishable from the flag this replaces.
 */

export type BudgetActivationReconciliation = {
  /** Requests on the site that were still open when the budget went live. */
  requestsExamined: number;
  /** Requests given a budget line they did not have. */
  requestsLinked: number;
  /** Line items given a cost code they did not have. */
  itemsCoded: number;
  /** Money on those requests, so the reader knows the scale of what moved. */
  linkedValue: number;
  /** Items that could not be resolved to anything — reported, not hidden. */
  itemsUnresolved: number;
};

/** Requests that have not finished, and so can still be governed by a budget. */
const OPEN_REQUEST_STATUSES = [
  "draft",
  "submitted",
  "in_review",
  "pricing_pending",
  "priced",
  "md_review",
  "approved",
  "partially_ordered",
  "ordered",
  "delivered",
];

function toNumber(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

/**
 * Attach a site's in-flight requests to the budget that has just gone live.
 *
 * Deliberately conservative: it only FILLS GAPS. A request that already has a
 * budget line keeps it, and an item that already has a cost code keeps it.
 * Activation must never silently recode work someone has already charged
 * somewhere deliberately.
 */
export async function reconcileSiteToActivatedBudget(input: {
  budgetId: string;
  siteId: string;
  actorUserId: string;
}): Promise<BudgetActivationReconciliation> {
  const supabase = getOpsSupabaseServiceClient();
  const result: BudgetActivationReconciliation = {
    requestsExamined: 0,
    requestsLinked: 0,
    itemsCoded: 0,
    linkedValue: 0,
    itemsUnresolved: 0,
  };

  const { data: budgetLines } = await supabase
    .from("project_budget_lines")
    .select("id, category, cost_code_id")
    .eq("budget_id", input.budgetId);

  const lines = (budgetLines ?? []) as Array<{
    id: string;
    category: string;
    cost_code_id: string | null;
  }>;
  if (lines.length === 0) {
    return result;
  }

  // The general-purpose line a request attaches to when nothing more specific
  // applies: the site's unplanned/contingency line, or failing that the first.
  const contingencyCostCodeId = await ensureSiteContingencyCostCode(
    input.siteId,
    input.actorUserId,
  ).catch(() => null);
  const fallbackLine =
    lines.find((line) => line.cost_code_id === contingencyCostCodeId) ??
    lines.find((line) => line.category === "unplanned") ??
    lines[0];

  const { data: requestRows } = await supabase
    .from("material_requests")
    .select("id, request_number, budget_line_id")
    .eq("site_id", input.siteId)
    .in("status", OPEN_REQUEST_STATUSES);

  const requests = (requestRows ?? []) as Array<{
    id: string;
    request_number: string;
    budget_line_id: string | null;
  }>;
  result.requestsExamined = requests.length;

  const unlinked = requests.filter((request) => !request.budget_line_id);
  if (unlinked.length > 0) {
    const { error } = await supabase
      .from("material_requests")
      .update({ budget_line_id: fallbackLine.id })
      .in(
        "id",
        unlinked.map((request) => request.id),
      )
      .is("budget_line_id", null);
    if (!error) {
      result.requestsLinked = unlinked.length;
    }
  }

  // Value of everything now drawing against this budget, so the report says
  // how much money just came under governance.
  const requestIds = requests.map((request) => request.id);
  if (requestIds.length > 0) {
    const { data: itemRows } = await supabase
      .from("material_request_items")
      .select("id, actual_total, estimated_total, cost_code_id")
      .in("request_id", requestIds);

    const items = (itemRows ?? []) as Array<{
      id: string;
      actual_total: number | string | null;
      estimated_total: number | string | null;
      cost_code_id: string | null;
    }>;

    for (const item of items) {
      const priced = toNumber(item.actual_total);
      result.linkedValue += priced > 0 ? priced : toNumber(item.estimated_total);
    }

    const uncoded = items.filter((item) => !item.cost_code_id);
    if (uncoded.length > 0) {
      const target = fallbackLine.cost_code_id ?? contingencyCostCodeId;
      if (target) {
        const { error } = await supabase
          .from("material_request_items")
          .update({ cost_code_id: target })
          .in(
            "id",
            uncoded.map((item) => item.id),
          )
          .is("cost_code_id", null);
        result.itemsCoded = error ? 0 : uncoded.length;
        result.itemsUnresolved = error ? uncoded.length : 0;
      } else {
        result.itemsUnresolved = uncoded.length;
      }
    }
  }

  result.linkedValue = Math.round((result.linkedValue + Number.EPSILON) * 100) / 100;

  await recordOpsAuditEvent({
    action: "project_budget.reconciled_on_activation",
    actorUserId: input.actorUserId,
    entityId: input.budgetId,
    entityType: "project_budget",
    metadata: { ...result },
    moduleKey: "project_budgets",
    sourceId: input.budgetId,
    sourceTable: "project_budgets",
    summary: `Activation linked ${result.requestsLinked} request(s) and coded ${result.itemsCoded} item(s) to the new budget`,
  }).catch(() => null);

  return result;
}

/** One sentence a person can read, for the redirect banner. */
export function describeBudgetActivation(
  result: BudgetActivationReconciliation,
): string {
  if (result.requestsExamined === 0) {
    return "Budget activated. No open requests on this site yet, so nothing needed linking.";
  }

  const parts = [
    `Budget activated and linked to ${result.requestsExamined} open request${result.requestsExamined === 1 ? "" : "s"}`,
  ];
  if (result.linkedValue > 0) {
    parts.push(
      `worth ZMW ${result.linkedValue.toLocaleString("en-ZM", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    );
  }
  if (result.itemsCoded > 0) {
    parts.push(`${result.itemsCoded} line item(s) were given a cost code`);
  }
  if (result.itemsUnresolved > 0) {
    parts.push(`${result.itemsUnresolved} item(s) could not be resolved — check them`);
  }

  return `${parts.join(", ")}.`;
}
