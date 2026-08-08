import {
  CONTINGENCY_LIBRARY_CODE,
  fetchOpsContingencyCostCodeIdsFor,
  isOpsContingencyCostCode,
} from "@/lib/ops/cost-code-picker";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

/**
 * Budget availability control — Phase 2 of
 * docs/pymble-ops-project-finance-spine-audit.md.
 *
 * Answers the question an approver actually has, which today's system cannot:
 * "if I approve this, what is left?" (audit D8 — `overBudget` was computed
 * AFTER the approval was written and only decorated a notification).
 *
 * Business decision §7.2: spend is **never blocked**. Site delivery must never
 * be held hostage to a stale budget. But no over-budget spend is silent
 * either — the bands escalate instead:
 *
 *   ≤ warn      pass silently
 *   warn–reason pass, show the approver the remaining figure
 *   reason–esc. pass, require a written reason, notify Finance
 *   > escalate  pass, require a reason, escalate to MD/GM
 *
 * All the arithmetic is pure so the bands are testable without a database —
 * same pattern as boq-actuals.ts, finance-leaks.ts and cost-codes.ts.
 */

export type OpsBudgetControlThresholds = {
  warnPercent: number;
  reasonPercent: number;
  escalatePercent: number;
};

export const DEFAULT_BUDGET_CONTROL_THRESHOLDS: OpsBudgetControlThresholds = {
  warnPercent: 90,
  reasonPercent: 100,
  escalatePercent: 110,
};

/** Lifecycle states that hold budget. `released` is inert history. */
export const LIVE_LIFECYCLE_STATES = [
  "reserved",
  "committed",
  "accrued",
  "actual",
  "paid",
] as const;

export type OpsCostLifecycleState = (typeof LIVE_LIFECYCLE_STATES)[number] | "released";

export type BudgetPositionInput = {
  budgeted: number;
  reserved: number;
  committed: number;
  accrued: number;
  actual: number;
  paid: number;
};

export const EMPTY_BUDGET_POSITION: BudgetPositionInput = {
  budgeted: 0,
  reserved: 0,
  committed: 0,
  accrued: 0,
  actual: 0,
  paid: 0,
};

export type BudgetAvailability = {
  budgeted: number;
  /**
   * Everything the budget is already answering for, across every live station.
   * Because advancing a station relieves the prior one, these never
   * double-count — that invariant is what makes this figure meaningful.
   */
  consumed: number;
  /** budgeted − consumed. Negative means already overspent. */
  available: number;
  /** 0 when nothing is budgeted, since any spend is then unbudgeted. */
  usedPercent: number | null;
};

export type BudgetControlBand = "ok" | "warn" | "reason_required" | "escalate";

export type BudgetControlDecision = {
  band: BudgetControlBand;
  /** Never false. Recorded explicitly so the intent survives future edits. */
  allowed: true;
  requiresReason: boolean;
  escalateToLeadership: boolean;
  /** Position after the proposed amount is added. */
  projected: BudgetAvailability;
  /** Position before it. */
  current: BudgetAvailability;
  /** Approver-facing sentence. Plain language, no jargon. */
  message: string;
};

function toNumber(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function formatZmw(value: number) {
  return `ZMW ${Math.abs(value).toLocaleString("en-ZM", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function computeBudgetAvailability(
  position: BudgetPositionInput,
): BudgetAvailability {
  const budgeted = roundMoney(position.budgeted);
  const consumed = roundMoney(
    position.reserved +
      position.committed +
      position.accrued +
      position.actual +
      position.paid,
  );

  return {
    budgeted,
    consumed,
    available: roundMoney(budgeted - consumed),
    usedPercent:
      budgeted > 0 ? Math.round((consumed / budgeted) * 1000) / 10 : consumed > 0 ? null : 0,
  };
}

/**
 * Decide the control band for adding `amount` to a cost code's position.
 *
 * A zero or absent budget is treated as the escalate band whenever real money
 * is involved: spending against a cost code nobody has funded is exactly the
 * situation that produced K971,031 of requests against a K0 budget on site
 * 0003, and it should reach the MD rather than pass silently. It is still not
 * blocked.
 *
 * `isContingencyCode` is the one exception, and it exists because the rule
 * above misfired at scale. The contingency leaf is the designed destination for
 * off-schedule spend, so it legitimately receives requests all day; when its
 * own allowance is zero, "unfunded" fired on EVERY request routed there —
 * 232 of them on one site alone. An escalation that never varies is not a
 * control, it is noise the MD learns to skip, which is worse than silence
 * because it hides the genuine cases. So an unfunded contingency asks for a
 * written reason instead, and only escalates once it exceeds an allowance that
 * actually exists.
 */
export function decideBudgetControl(input: {
  position: BudgetPositionInput;
  amount: number;
  /** True when the code is the site's unplanned/contingency leaf. */
  isContingencyCode?: boolean;
  thresholds?: OpsBudgetControlThresholds;
}): BudgetControlDecision {
  const thresholds = input.thresholds ?? DEFAULT_BUDGET_CONTROL_THRESHOLDS;
  const amount = roundMoney(input.amount);
  const current = computeBudgetAvailability(input.position);
  const projected = computeBudgetAvailability({
    ...input.position,
    // The proposed spend behaves as a new reservation.
    reserved: input.position.reserved + amount,
  });

  const unfunded = projected.budgeted <= 0 && projected.consumed > 0;
  const usedPercent = projected.usedPercent;

  const isContingency = input.isContingencyCode ?? false;

  let band: BudgetControlBand = "ok";
  if (unfunded) {
    band = isContingency ? "reason_required" : "escalate";
  } else if (usedPercent === null) {
    band = isContingency ? "reason_required" : "escalate";
  } else if (usedPercent > thresholds.escalatePercent) {
    band = "escalate";
  } else if (usedPercent > thresholds.reasonPercent) {
    band = "reason_required";
  } else if (usedPercent > thresholds.warnPercent) {
    band = "warn";
  }

  let message: string;
  if ((unfunded || usedPercent === null) && isContingency) {
    message =
      "This is off-schedule spend and the contingency allowance is not set, so there is nothing to measure it against. Record why it is needed, and set a contingency amount on the budget so the next one can be judged.";
  } else if (unfunded || usedPercent === null) {
    message =
      "This cost code has no budget. The spend is allowed but will be reported to the Managing Director — set a budget for this code to clear the flag.";
  } else if (band === "ok") {
    message = `${formatZmw(projected.available)} would remain on this cost code (${usedPercent}% used).`;
  } else if (band === "warn") {
    message = `Only ${formatZmw(projected.available)} would remain — ${usedPercent}% of this cost code's budget used.`;
  } else if (band === "reason_required") {
    message = `This takes the cost code ${formatZmw(-projected.available)} over budget (${usedPercent}% used). Approval is allowed, but record why.`;
  } else {
    message = `This takes the cost code ${formatZmw(-projected.available)} over budget (${usedPercent}% used) — beyond the ${thresholds.escalatePercent}% tolerance. Approval is allowed and will be escalated to the Managing Director.`;
  }

  return {
    band,
    allowed: true,
    requiresReason: band === "reason_required" || band === "escalate",
    escalateToLeadership: band === "escalate",
    projected,
    current,
    message,
  };
}

/** Management thresholds, falling back to the documented defaults. */
export async function fetchOpsBudgetControlThresholds(): Promise<OpsBudgetControlThresholds> {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("budget_control_settings")
    .select("warn_percent, reason_percent, escalate_percent")
    .limit(1)
    .maybeSingle<{
      warn_percent: number | string;
      reason_percent: number | string;
      escalate_percent: number | string;
    }>();

  if (error || !data) {
    return DEFAULT_BUDGET_CONTROL_THRESHOLDS;
  }

  return {
    warnPercent: toNumber(data.warn_percent),
    reasonPercent: toNumber(data.reason_percent),
    escalatePercent: toNumber(data.escalate_percent),
  };
}

/**
 * How a cost code is funded, beyond its own budget lines.
 *
 * The contingency leaf is special: nobody writes a budget line for "unplanned",
 * but every budget already carries a `contingency_amount` on its header, which
 * until now funded nothing at all. Treating that header figure as the
 * contingency leaf's budget is what gives off-schedule spend something real to
 * be measured against, instead of every such request reporting a zero budget.
 */
async function fetchContingencyAllowance(costCodeId: string): Promise<number> {
  const supabase = getOpsSupabaseServiceClient();

  const { data: node, error: nodeError } = await supabase
    .from("project_cost_codes")
    .select(
      "site_id, library:cost_code_library!project_cost_codes_library_code_id_fkey(code)",
    )
    .eq("id", costCodeId)
    .maybeSingle();

  if (nodeError) {
    throw nodeError;
  }

  const row = node as unknown as {
    site_id: string;
    library: { code: string } | { code: string }[] | null;
  } | null;
  if (!row) {
    return 0;
  }
  const library = Array.isArray(row.library) ? (row.library[0] ?? null) : row.library;
  if (library?.code !== CONTINGENCY_LIBRARY_CODE) {
    return 0;
  }

  const { data: budgets, error: budgetError } = await supabase
    .from("project_budgets")
    .select("contingency_amount")
    .eq("site_id", row.site_id)
    .in("status", ["draft", "active", "locked"]);

  if (budgetError) {
    throw budgetError;
  }

  return ((budgets ?? []) as Array<{ contingency_amount: number | string | null }>).reduce(
    (sum, budget) => roundMoney(sum + toNumber(budget.contingency_amount)),
    0,
  );
}

/**
 * The live position of one cost code: budgeted from the site's open budget
 * lines (plus the budget's contingency allowance when this IS the contingency
 * leaf), consumed from non-released ledger entries grouped by station.
 */
export async function fetchOpsCostCodePosition(
  costCodeId: string,
): Promise<BudgetPositionInput> {
  const supabase = getOpsSupabaseServiceClient();

  const [budgetResult, entriesResult, contingencyAllowance] = await Promise.all([
    supabase
      .from("project_budget_lines")
      .select("budgeted_amount, budget:project_budgets!inner(status)")
      .eq("cost_code_id", costCodeId)
      .in("budget.status", ["draft", "active", "locked"]),
    supabase
      .from("project_cost_entries")
      .select("amount, lifecycle_state")
      .eq("cost_code_id", costCodeId)
      .neq("lifecycle_state", "released"),
    fetchContingencyAllowance(costCodeId).catch(() => 0),
  ]);

  if (budgetResult.error) {
    throw budgetResult.error;
  }
  if (entriesResult.error) {
    throw entriesResult.error;
  }

  const position: BudgetPositionInput = { ...EMPTY_BUDGET_POSITION };
  position.budgeted = contingencyAllowance;

  for (const row of (budgetResult.data ?? []) as Array<{
    budgeted_amount: number | string | null;
  }>) {
    position.budgeted = roundMoney(position.budgeted + toNumber(row.budgeted_amount));
  }

  for (const row of (entriesResult.data ?? []) as Array<{
    amount: number | string | null;
    lifecycle_state: OpsCostLifecycleState;
  }>) {
    const amount = toNumber(row.amount);
    switch (row.lifecycle_state) {
      case "reserved":
        position.reserved = roundMoney(position.reserved + amount);
        break;
      case "committed":
        position.committed = roundMoney(position.committed + amount);
        break;
      case "accrued":
        position.accrued = roundMoney(position.accrued + amount);
        break;
      case "actual":
        position.actual = roundMoney(position.actual + amount);
        break;
      case "paid":
        position.paid = roundMoney(position.paid + amount);
        break;
      default:
        break;
    }
  }

  return position;
}

/**
 * Full check for a proposed spend on a cost code. Callers use this BEFORE
 * writing an approval, so the decision is shown to the approver rather than
 * discovered afterwards.
 */
export async function checkOpsBudgetAvailability(input: {
  costCodeId: string;
  amount: number;
}): Promise<BudgetControlDecision> {
  const [position, thresholds, isContingencyCode] = await Promise.all([
    fetchOpsCostCodePosition(input.costCodeId),
    fetchOpsBudgetControlThresholds(),
    isOpsContingencyCostCode(input.costCodeId).catch(() => false),
  ]);

  return decideBudgetControl({
    position,
    amount: input.amount,
    isContingencyCode,
    thresholds,
  });
}

export type OpsRequestBudgetPosition = {
  requestId: string;
  /** Null when not one item on the request carries a cost code. */
  costCodeId: string | null;
  costCodeLabel: string | null;
  /** Items with no cost code — money that will charge the unplanned bucket. */
  uncodedItemCount: number;
  totalItemCount: number;
  /** Null when there is no code to judge a position against. */
  decision: BudgetControlDecision | null;
};

/**
 * Budget position for a batch of pending material requests, so the approvals
 * screen can show every approver what remains BEFORE they decide (audit D8).
 *
 * Batched deliberately: one query per table rather than per request, because
 * this runs on a list page.
 *
 * Requests whose items carry no cost code used to be absent from the result
 * entirely, on the reasoning that "no code" and "no budget" are different
 * problems. True — but the consequence was that the more serious of the two
 * rendered as nothing at all, and an approver saw a clean screen for a request
 * that could not be charged anywhere. Both are reported now: `decision` stays
 * null when there is no code to judge, and `uncodedItemCount` says why.
 */
export async function fetchOpsRequestBudgetPositions(
  requestIds: string[],
): Promise<Map<string, OpsRequestBudgetPosition>> {
  const out = new Map<string, OpsRequestBudgetPosition>();
  if (requestIds.length === 0) {
    return out;
  }

  const supabase = getOpsSupabaseServiceClient();

  // Every item, coded or not — the uncoded ones are the finding, so they can
  // no longer be filtered out of the query that decides what an approver sees.
  const { data: itemRows, error: itemError } = await supabase
    .from("material_request_items")
    .select("request_id, cost_code_id, actual_total, estimated_total")
    .in("request_id", requestIds);

  if (itemError) {
    throw itemError;
  }

  // Dominant cost code per request, plus the amount to test against it.
  const perRequest = new Map<
    string,
    { counts: Map<string, number>; amount: number; uncoded: number; total: number }
  >();
  for (const row of (itemRows ?? []) as Array<{
    request_id: string;
    cost_code_id: string | null;
    actual_total: number | string | null;
    estimated_total: number | string | null;
  }>) {
    const entry =
      perRequest.get(row.request_id) ??
      { counts: new Map<string, number>(), amount: 0, uncoded: 0, total: 0 };
    entry.total += 1;
    if (row.cost_code_id) {
      entry.counts.set(row.cost_code_id, (entry.counts.get(row.cost_code_id) ?? 0) + 1);
    } else {
      entry.uncoded += 1;
    }
    const priced = toNumber(row.actual_total);
    entry.amount = roundMoney(entry.amount + (priced > 0 ? priced : toNumber(row.estimated_total)));
    perRequest.set(row.request_id, entry);
  }

  const costCodeIds = Array.from(
    new Set(
      Array.from(perRequest.values()).flatMap((entry) => Array.from(entry.counts.keys())),
    ),
  );

  const [thresholds, labelResult, contingencyIds] = await Promise.all([
    fetchOpsBudgetControlThresholds(),
    costCodeIds.length > 0
      ? supabase.from("project_cost_codes").select("id, path, name").in("id", costCodeIds)
      : Promise.resolve({ data: [], error: null }),
    fetchOpsContingencyCostCodeIdsFor(costCodeIds).catch(() => new Set<string>()),
  ]);

  if (labelResult.error) {
    throw labelResult.error;
  }

  const labelById = new Map(
    ((labelResult.data ?? []) as Array<{ id: string; path: string; name: string }>).map(
      (row) => [row.id, `${row.path} · ${row.name}`],
    ),
  );

  const positions = new Map<string, BudgetPositionInput>();
  await Promise.all(
    costCodeIds.map(async (costCodeId) => {
      positions.set(costCodeId, await fetchOpsCostCodePosition(costCodeId));
    }),
  );

  for (const [requestId, entry] of perRequest) {
    const costCodeId = Array.from(entry.counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
    const position = costCodeId ? positions.get(costCodeId) : null;

    if (!costCodeId || !position) {
      // Nothing to judge, but the request still needs to be reported: every
      // one of its items will charge the unplanned bucket.
      out.set(requestId, {
        requestId,
        costCodeId: null,
        costCodeLabel: null,
        uncodedItemCount: entry.uncoded,
        totalItemCount: entry.total,
        decision: null,
      });
      continue;
    }

    out.set(requestId, {
      requestId,
      costCodeId,
      costCodeLabel: labelById.get(costCodeId) ?? "Cost code",
      uncodedItemCount: entry.uncoded,
      totalItemCount: entry.total,
      decision: decideBudgetControl({
        position,
        amount: entry.amount,
        isContingencyCode: contingencyIds.has(costCodeId),
        thresholds,
      }),
    });
  }

  return out;
}
