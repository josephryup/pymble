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
 */
export function decideBudgetControl(input: {
  position: BudgetPositionInput;
  amount: number;
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

  let band: BudgetControlBand = "ok";
  if (unfunded) {
    band = "escalate";
  } else if (usedPercent === null) {
    band = "escalate";
  } else if (usedPercent > thresholds.escalatePercent) {
    band = "escalate";
  } else if (usedPercent > thresholds.reasonPercent) {
    band = "reason_required";
  } else if (usedPercent > thresholds.warnPercent) {
    band = "warn";
  }

  let message: string;
  if (unfunded || usedPercent === null) {
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
 * The live position of one cost code: budgeted from the site's open budget
 * lines, consumed from non-released ledger entries grouped by station.
 */
export async function fetchOpsCostCodePosition(
  costCodeId: string,
): Promise<BudgetPositionInput> {
  const supabase = getOpsSupabaseServiceClient();

  const [budgetResult, entriesResult] = await Promise.all([
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
  ]);

  if (budgetResult.error) {
    throw budgetResult.error;
  }
  if (entriesResult.error) {
    throw entriesResult.error;
  }

  const position: BudgetPositionInput = { ...EMPTY_BUDGET_POSITION };

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
  const [position, thresholds] = await Promise.all([
    fetchOpsCostCodePosition(input.costCodeId),
    fetchOpsBudgetControlThresholds(),
  ]);

  return decideBudgetControl({ position, amount: input.amount, thresholds });
}

export type OpsRequestBudgetPosition = {
  requestId: string;
  costCodeId: string;
  costCodeLabel: string;
  decision: BudgetControlDecision;
};

/**
 * Budget position for a batch of pending material requests, so the approvals
 * screen can show every approver what remains BEFORE they decide (audit D8).
 *
 * Batched deliberately: one query per table rather than per request, because
 * this runs on a list page. Requests whose items carry no cost code are simply
 * absent from the result — the caller renders nothing rather than a zero,
 * since "no code" and "no budget" are different problems.
 */
export async function fetchOpsRequestBudgetPositions(
  requestIds: string[],
): Promise<Map<string, OpsRequestBudgetPosition>> {
  const out = new Map<string, OpsRequestBudgetPosition>();
  if (requestIds.length === 0) {
    return out;
  }

  const supabase = getOpsSupabaseServiceClient();

  const { data: itemRows, error: itemError } = await supabase
    .from("material_request_items")
    .select("request_id, cost_code_id, actual_total, estimated_total")
    .in("request_id", requestIds)
    .not("cost_code_id", "is", null);

  if (itemError) {
    throw itemError;
  }

  // Dominant cost code per request, plus the amount to test against it.
  const perRequest = new Map<
    string,
    { counts: Map<string, number>; amount: number }
  >();
  for (const row of (itemRows ?? []) as Array<{
    request_id: string;
    cost_code_id: string;
    actual_total: number | string | null;
    estimated_total: number | string | null;
  }>) {
    const entry =
      perRequest.get(row.request_id) ?? { counts: new Map<string, number>(), amount: 0 };
    entry.counts.set(row.cost_code_id, (entry.counts.get(row.cost_code_id) ?? 0) + 1);
    const priced = toNumber(row.actual_total);
    entry.amount = roundMoney(entry.amount + (priced > 0 ? priced : toNumber(row.estimated_total)));
    perRequest.set(row.request_id, entry);
  }

  const costCodeIds = Array.from(
    new Set(
      Array.from(perRequest.values()).flatMap((entry) => Array.from(entry.counts.keys())),
    ),
  );
  if (costCodeIds.length === 0) {
    return out;
  }

  const [thresholds, labelResult] = await Promise.all([
    fetchOpsBudgetControlThresholds(),
    supabase
      .from("project_cost_codes")
      .select("id, path, name")
      .in("id", costCodeIds),
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
    if (!costCodeId || !position) continue;

    out.set(requestId, {
      requestId,
      costCodeId,
      costCodeLabel: labelById.get(costCodeId) ?? "Cost code",
      decision: decideBudgetControl({ position, amount: entry.amount, thresholds }),
    });
  }

  return out;
}
