import {
  computeBudgetAvailability,
  decideBudgetControl,
  EMPTY_BUDGET_POSITION,
  fetchOpsBudgetControlThresholds,
  type BudgetControlBand,
  type BudgetPositionInput,
  type OpsBudgetControlThresholds,
} from "@/lib/ops/budget-availability";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

/**
 * Finance figures for a reporting period.
 *
 * Phase 1 of docs/pymble-ops-finance-report-metrics-2026-08.md: the material
 * request funnel, from what Finance approved to what was actually bought.
 *
 * Pure core, thin fetcher — the same shape as budget-availability.ts,
 * boq-actuals.ts and procurement-fulfilment.ts. That split matters more here
 * than usual: most of these figures read zero against live data, because the
 * workflow states they measure have only just become reachable. Fixtures are
 * the only way to prove the arithmetic before the data arrives.
 */

// ---------------------------------------------------------------------------
// Period window
// ---------------------------------------------------------------------------

/**
 * A reporting window as instants.
 *
 * Bounds are UTC days, matching department-report-metrics.ts. Lusaka is UTC+2,
 * so a record keyed in the first two hours of a local day falls in the
 * previous UTC day — accepted deliberately, because one convention that every
 * department's metrics share beats finance quietly using a different one and
 * the totals never reconciling.
 */
export type OpsReportWindow = {
  startIso: string;
  endIso: string;
  /**
   * The same bounds as plain dates, for comparing against DATE columns like
   * `project_cost_entries.cost_date`. Comparing a date against an instant
   * drags the timezone question into a column that does not have one.
   */
  startDate: string;
  endDate: string;
};

export function opsReportWindow(periodStart: string, periodEnd: string): OpsReportWindow {
  return {
    startIso: `${periodStart}T00:00:00.000Z`,
    endIso: `${periodEnd}T23:59:59.999Z`,
    startDate: periodStart,
    endDate: periodEnd,
  };
}

function withinWindow(timestamp: string | null, window: OpsReportWindow) {
  if (!timestamp) return false;
  return timestamp >= window.startIso && timestamp <= window.endIso;
}

function atOrBefore(timestamp: string | null, window: OpsReportWindow) {
  if (!timestamp) return false;
  return timestamp <= window.endIso;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toNumber(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function dayGap(fromIso: string, toIso: string) {
  return Math.floor(
    (new Date(toIso).getTime() - new Date(fromIso).getTime()) / (24 * 60 * 60 * 1000),
  );
}

// ---------------------------------------------------------------------------
// The material request funnel
// ---------------------------------------------------------------------------

/** Statuses where the request is dead and its money is not owed. */
const DEAD_STATUSES = new Set(["cancelled", "rejected"]);

/** Priced and sitting on Finance's desk, waiting for a cost decision. */
const AWAITING_FINANCE_STATUSES = new Set(["priced", "md_review"]);

export type OpsMaterialRequestForFunnel = {
  /**
   * When FINANCE approved the cost — not `approved_at`, which the Operations
   * chain also writes and which therefore says nothing about whether Finance
   * has decided. Reading the wrong one counted requests still out for pricing
   * as approved spend.
   */
  cost_approved_at: string | null;
  delivered_at: string | null;
  id: string;
  ordered_at: string | null;
  priced_at: string | null;
  status: string;
  /** Priced total where priced, else the engineer's estimate. */
  value: number;
};

export type OpsMaterialRequestFunnel = {
  /** FLOW — approved within the window. */
  approved_value: number;
  approved_count: number;
  /** FLOW — reached a purchase record within the window (PO or direct). */
  procured_value: number;
  procured_count: number;
  /** FLOW — goods confirmed received within the window. */
  delivered_value: number;
  /**
   * STOCK at the window's end — approved, still alive, still with nothing
   * bought against it. Deliberately not a flow: the question is "how much
   * authorised money is sitting unspent right now", and an answer scoped to
   * the window would hide everything authorised before it.
   */
  approved_not_procured_value: number;
  approved_not_procured_count: number;
  /** STOCK at the window's end — priced, awaiting a Finance cost decision. */
  awaiting_finance_value: number;
  awaiting_finance_count: number;
  /** Longest wait on that queue, in days. Null when the queue is empty. */
  awaiting_finance_days_max: number | null;
  /** Mean approved → procured, over requests that made it. Null if none did. */
  procurement_days_avg: number | null;
  procurement_sample: number;
  /**
   * Procured ÷ approved for the window, as a percent.
   *
   * Ships beside the pair so a zero reads as "0% of approved value reached a
   * purchase" rather than "no activity" — the difference between a finding and
   * a number people learn to skip. Null when nothing was approved.
   */
  procured_coverage_percent: number | null;
};

export function summariseMaterialRequestFunnel(
  rows: OpsMaterialRequestForFunnel[],
  window: OpsReportWindow,
): OpsMaterialRequestFunnel {
  let approvedValue = 0;
  let approvedCount = 0;
  let procuredValue = 0;
  let procuredCount = 0;
  let deliveredValue = 0;
  let notProcuredValue = 0;
  let notProcuredCount = 0;
  let awaitingValue = 0;
  let awaitingCount = 0;
  let awaitingDaysMax: number | null = null;
  let procurementDaysTotal = 0;
  let procurementSample = 0;

  for (const row of rows) {
    const alive = !DEAD_STATUSES.has(row.status);

    if (withinWindow(row.cost_approved_at, window)) {
      approvedValue = roundMoney(approvedValue + row.value);
      approvedCount += 1;
    }

    if (withinWindow(row.ordered_at, window)) {
      procuredValue = roundMoney(procuredValue + row.value);
      procuredCount += 1;
    }

    if (withinWindow(row.delivered_at, window)) {
      deliveredValue = roundMoney(deliveredValue + row.value);
    }

    // Approved by the window's end and nothing bought by then. `ordered_at`
    // after the end still counts as unspent AT the end, which is the whole
    // point of measuring a stock rather than a flow.
    if (
      alive &&
      atOrBefore(row.cost_approved_at, window) &&
      !atOrBefore(row.ordered_at, window)
    ) {
      notProcuredValue = roundMoney(notProcuredValue + row.value);
      notProcuredCount += 1;
    }

    if (alive && AWAITING_FINANCE_STATUSES.has(row.status) && atOrBefore(row.priced_at, window)) {
      awaitingValue = roundMoney(awaitingValue + row.value);
      awaitingCount += 1;
      const waited = dayGap(row.priced_at!, window.endIso);
      if (waited >= 0 && (awaitingDaysMax === null || waited > awaitingDaysMax)) {
        awaitingDaysMax = waited;
      }
    }

    if (row.cost_approved_at && row.ordered_at) {
      const days = dayGap(row.cost_approved_at, row.ordered_at);
      if (days >= 0) {
        procurementDaysTotal += days;
        procurementSample += 1;
      }
    }
  }

  return {
    approved_value: approvedValue,
    approved_count: approvedCount,
    procured_value: procuredValue,
    procured_count: procuredCount,
    delivered_value: deliveredValue,
    approved_not_procured_value: notProcuredValue,
    approved_not_procured_count: notProcuredCount,
    awaiting_finance_value: awaitingValue,
    awaiting_finance_count: awaitingCount,
    awaiting_finance_days_max: awaitingDaysMax,
    procurement_days_avg:
      procurementSample > 0 ? Math.round(procurementDaysTotal / procurementSample) : null,
    procurement_sample: procurementSample,
    procured_coverage_percent:
      approvedValue > 0 ? Math.round((procuredValue / approvedValue) * 1000) / 10 : null,
  };
}

// ---------------------------------------------------------------------------
// Cash release — what Finance authorised against what actually left the bank
// ---------------------------------------------------------------------------

/** A payable that will never be paid holds nothing and waits for nobody. */
const DEAD_PAYABLE_STATUSES = new Set(["cancelled", "rejected"]);

/** Submitted and waiting for a Finance decision. */
const AWAITING_APPROVAL_STATUSES = new Set(["submitted", "finance_review"]);

export type OpsPayableForRelease = {
  amount: number;
  approved_at: string | null;
  id: string;
  paid_at: string | null;
  payment_type: string;
  status: string;
  submitted_at: string | null;
};

export type OpsPayableReleaseSummary = {
  /** FLOW — approved within the window. Authorised, not necessarily paid. */
  approved_value: number;
  approved_count: number;
  /** FLOW — cash left the bank within the window. */
  released_value: number;
  released_count: number;
  /**
   * Released in the window, split by payment type.
   *
   * Returned for the finance page's table, deliberately NOT flattened into
   * report metrics: a breakdown is a table, and six near-empty scalar fields
   * would bury the four figures that matter (§5).
   */
  released_by_type: Record<string, number>;
  /** STOCK at the window's end — approved, unpaid, still alive. */
  awaiting_release_value: number;
  awaiting_release_count: number;
  /** How long the oldest approved-unpaid payable has waited, in days. */
  awaiting_release_days_max: number | null;
  /** STOCK at the window's end — submitted, no Finance decision yet. */
  awaiting_approval_value: number;
  awaiting_approval_count: number;
  awaiting_approval_days_max: number | null;
  /** Mean approved → paid, over payables that were paid. */
  release_days_avg: number | null;
  release_sample: number;
};

/**
 * There is deliberately no "released ÷ approved" coverage figure here, unlike
 * the material request funnel.
 *
 * The two are different cohorts, not two stages of one: a payable approved in
 * June and paid in July would push July's ratio above 100% while telling you
 * nothing. The honest reading is the pair plus the two waiting positions —
 * what was authorised, what was paid, and who is still owed.
 */
export function summarisePayableRelease(
  rows: OpsPayableForRelease[],
  window: OpsReportWindow,
): OpsPayableReleaseSummary {
  let approvedValue = 0;
  let approvedCount = 0;
  let releasedValue = 0;
  let releasedCount = 0;
  let awaitingReleaseValue = 0;
  let awaitingReleaseCount = 0;
  let awaitingReleaseDaysMax: number | null = null;
  let awaitingApprovalValue = 0;
  let awaitingApprovalCount = 0;
  let awaitingApprovalDaysMax: number | null = null;
  let releaseDaysTotal = 0;
  let releaseSample = 0;
  const releasedByType: Record<string, number> = {};

  for (const row of rows) {
    const alive = !DEAD_PAYABLE_STATUSES.has(row.status);

    if (withinWindow(row.approved_at, window)) {
      approvedValue = roundMoney(approvedValue + row.amount);
      approvedCount += 1;
    }

    if (withinWindow(row.paid_at, window)) {
      releasedValue = roundMoney(releasedValue + row.amount);
      releasedCount += 1;
      releasedByType[row.payment_type] = roundMoney(
        (releasedByType[row.payment_type] ?? 0) + row.amount,
      );
    }

    // Approved by the window's end, not paid by then. A payment made after the
    // end was still outstanding AT the end — that is what a position means.
    if (alive && atOrBefore(row.approved_at, window) && !atOrBefore(row.paid_at, window)) {
      awaitingReleaseValue = roundMoney(awaitingReleaseValue + row.amount);
      awaitingReleaseCount += 1;
      const waited = dayGap(row.approved_at!, window.endIso);
      if (waited >= 0 && (awaitingReleaseDaysMax === null || waited > awaitingReleaseDaysMax)) {
        awaitingReleaseDaysMax = waited;
      }
    }

    if (
      alive &&
      AWAITING_APPROVAL_STATUSES.has(row.status) &&
      atOrBefore(row.submitted_at, window)
    ) {
      awaitingApprovalValue = roundMoney(awaitingApprovalValue + row.amount);
      awaitingApprovalCount += 1;
      const waited = dayGap(row.submitted_at!, window.endIso);
      if (waited >= 0 && (awaitingApprovalDaysMax === null || waited > awaitingApprovalDaysMax)) {
        awaitingApprovalDaysMax = waited;
      }
    }

    if (row.approved_at && row.paid_at) {
      const days = dayGap(row.approved_at, row.paid_at);
      if (days >= 0) {
        releaseDaysTotal += days;
        releaseSample += 1;
      }
    }
  }

  return {
    approved_value: approvedValue,
    approved_count: approvedCount,
    released_value: releasedValue,
    released_count: releasedCount,
    released_by_type: releasedByType,
    awaiting_release_value: awaitingReleaseValue,
    awaiting_release_count: awaitingReleaseCount,
    awaiting_release_days_max: awaitingReleaseDaysMax,
    awaiting_approval_value: awaitingApprovalValue,
    awaiting_approval_count: awaitingApprovalCount,
    awaiting_approval_days_max: awaitingApprovalDaysMax,
    release_days_avg:
      releaseSample > 0 ? Math.round(releaseDaysTotal / releaseSample) : null,
    release_sample: releaseSample,
  };
}

// ---------------------------------------------------------------------------
// Budget consumption — where the money was allocated, and how much is left
// ---------------------------------------------------------------------------

/**
 * Consumption in a period against remaining on a budget.
 *
 * These are on DIFFERENT TIME BASES and that is the whole difficulty of the
 * figure. `consumed_period` is a flow inside the window; `remaining` is a
 * position at its end, measured against a lifetime budget. They do not add up,
 * they do not reconcile, and putting them in one row without saying so is the
 * standard way a budget report misleads its reader. Both are named for what
 * they are, and the report labels them.
 */
export type OpsBudgetPeriodPosition = {
  band: BudgetControlBand;
  budget_id: string;
  budget_number: string;
  /** Lifetime, including the header contingency allowance. */
  budgeted: number;
  /** FLOW — non-released entries dated inside the window. */
  consumed_period: number;
  /** STOCK — every non-released entry dated on or before the window's end. */
  consumed_to_date: number;
  /** STOCK — budgeted − consumed_to_date. Negative means overspent. */
  remaining: number;
  site_code: string;
  site_id: string | null;
  status: string;
  title: string;
  used_percent: number | null;
};

export type OpsBudgetConsumption = {
  /** Every open budget, worst position first — the table (§5). */
  budgets: OpsBudgetPeriodPosition[];
  /** Roll-up across ACTIVE budgets only. Draft and locked are excluded. */
  active_budgeted: number;
  active_consumed_period: number;
  active_consumed_to_date: number;
  active_remaining: number;
  active_used_percent: number | null;
  /** Active budgets past the warn band — the ones needing a look. */
  budgets_over_threshold: number;
  /**
   * Open budgets carrying spend with nothing budgeted at all.
   *
   * Counted separately because a percentage cannot express it: no denominator
   * exists. One such budget today holds K133,850 against K0.
   */
  unfunded_budget_count: number;
  unfunded_budget_value: number;
};

export type OpsBudgetForConsumption = {
  budget_id: string;
  budget_number: string;
  budgeted: number;
  contingency: number;
  site_code: string;
  site_id: string | null;
  status: string;
  title: string;
};

export type OpsCostEntryForConsumption = {
  amount: number;
  budget_id: string;
  /** Date only, matching the column. */
  cost_date: string;
  lifecycle_state: string;
};

export function summariseBudgetConsumption(
  budgets: OpsBudgetForConsumption[],
  entries: OpsCostEntryForConsumption[],
  window: OpsReportWindow,
  thresholds?: OpsBudgetControlThresholds,
): OpsBudgetConsumption {
  const periodByBudget = new Map<string, number>();
  const toDateByBudget = new Map<string, BudgetPositionInput>();

  for (const entry of entries) {
    if (entry.lifecycle_state === "released") continue;
    // Anything dated after the window's end has not happened yet as far as
    // this report is concerned — a later cost must not move a closed period.
    if (entry.cost_date > window.endDate) continue;

    const position =
      toDateByBudget.get(entry.budget_id) ?? { ...EMPTY_BUDGET_POSITION };
    switch (entry.lifecycle_state) {
      case "reserved":
        position.reserved = roundMoney(position.reserved + entry.amount);
        break;
      case "committed":
        position.committed = roundMoney(position.committed + entry.amount);
        break;
      case "accrued":
        position.accrued = roundMoney(position.accrued + entry.amount);
        break;
      case "actual":
        position.actual = roundMoney(position.actual + entry.amount);
        break;
      case "paid":
        position.paid = roundMoney(position.paid + entry.amount);
        break;
      default:
        break;
    }
    toDateByBudget.set(entry.budget_id, position);

    if (entry.cost_date >= window.startDate) {
      periodByBudget.set(
        entry.budget_id,
        roundMoney((periodByBudget.get(entry.budget_id) ?? 0) + entry.amount),
      );
    }
  }

  const rows: OpsBudgetPeriodPosition[] = budgets.map((budget) => {
    const position = toDateByBudget.get(budget.budget_id) ?? { ...EMPTY_BUDGET_POSITION };
    position.budgeted = roundMoney(budget.budgeted + budget.contingency);

    const availability = computeBudgetAvailability(position);
    const decision = decideBudgetControl({ position, amount: 0, thresholds });

    return {
      band: decision.band,
      budget_id: budget.budget_id,
      budget_number: budget.budget_number,
      budgeted: availability.budgeted,
      consumed_period: periodByBudget.get(budget.budget_id) ?? 0,
      consumed_to_date: availability.consumed,
      remaining: availability.available,
      site_code: budget.site_code,
      site_id: budget.site_id,
      status: budget.status,
      title: budget.title,
      used_percent: availability.usedPercent,
    };
  });

  // Worst first: overspent budgets are the reason anyone opens this table.
  rows.sort((a, b) => {
    if (a.remaining !== b.remaining) return a.remaining - b.remaining;
    return b.consumed_to_date - a.consumed_to_date;
  });

  const active = rows.filter((row) => row.status === "active");
  const activeBudgeted = roundMoney(active.reduce((sum, row) => sum + row.budgeted, 0));
  const activeConsumedToDate = roundMoney(
    active.reduce((sum, row) => sum + row.consumed_to_date, 0),
  );
  const unfunded = rows.filter((row) => row.budgeted <= 0 && row.consumed_to_date > 0);

  return {
    budgets: rows,
    active_budgeted: activeBudgeted,
    active_consumed_period: roundMoney(
      active.reduce((sum, row) => sum + row.consumed_period, 0),
    ),
    active_consumed_to_date: activeConsumedToDate,
    active_remaining: roundMoney(activeBudgeted - activeConsumedToDate),
    active_used_percent:
      activeBudgeted > 0
        ? Math.round((activeConsumedToDate / activeBudgeted) * 1000) / 10
        : null,
    budgets_over_threshold: active.filter((row) => row.band !== "ok").length,
    unfunded_budget_count: unfunded.length,
    unfunded_budget_value: roundMoney(
      unfunded.reduce((sum, row) => sum + row.consumed_to_date, 0),
    ),
  };
}

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

type RawItem = {
  request_id: string;
  actual_total: number | string | null;
  estimated_total: number | string | null;
};

type RawRequest = {
  id: string;
  status: string;
  cost_approved_at: string | null;
  ordered_at: string | null;
  delivered_at: string | null;
  priced_at: string | null;
};

/**
 * Every non-archived material request with its value, ready for the funnel.
 *
 * Unfiltered by date on purpose: two of the figures are positions at the
 * window's end, so a request approved months earlier and still unbought must
 * be in the set. Filtering to the window would silently drop exactly the
 * backlog the metric exists to surface.
 */
export async function fetchOpsMaterialRequestFunnel(
  periodStart: string,
  periodEnd: string,
): Promise<OpsMaterialRequestFunnel> {
  const supabase = getOpsSupabaseServiceClient();
  const window = opsReportWindow(periodStart, periodEnd);

  const [{ data: requests, error: requestError }, { data: items, error: itemError }] =
    await Promise.all([
      supabase
        .from("material_requests")
        .select("id, status, cost_approved_at, ordered_at, delivered_at, priced_at")
        .is("archived_at", null),
      supabase
        .from("material_request_items")
        .select("request_id, actual_total, estimated_total"),
    ]);

  if (requestError) {
    throw requestError;
  }
  if (itemError) {
    throw itemError;
  }

  const valueByRequest = new Map<string, number>();
  for (const item of (items ?? []) as RawItem[]) {
    const priced = toNumber(item.actual_total);
    const value = priced > 0 ? priced : toNumber(item.estimated_total);
    valueByRequest.set(
      item.request_id,
      roundMoney((valueByRequest.get(item.request_id) ?? 0) + value),
    );
  }

  return summariseMaterialRequestFunnel(
    ((requests ?? []) as RawRequest[]).map((row) => ({
      ...row,
      value: valueByRequest.get(row.id) ?? 0,
    })),
    window,
  );
}

type RawPayable = {
  approved_at: string | null;
  id: string;
  paid_at: string | null;
  payment_type: string;
  requested_amount: number | string | null;
  status: string;
  submitted_at: string | null;
};

/**
 * Every non-archived payable, ready for the release summary.
 *
 * Unfiltered by date for the same reason as the funnel: two figures are
 * positions at the window's end, so a payable approved months ago and still
 * unpaid has to be in the set. Filtering to the window would drop precisely
 * the suppliers who have been waiting longest.
 */
export async function fetchOpsPayableRelease(
  periodStart: string,
  periodEnd: string,
): Promise<OpsPayableReleaseSummary> {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("payment_requests")
    .select("id, status, payment_type, requested_amount, submitted_at, approved_at, paid_at")
    .is("archived_at", null);

  if (error) {
    throw error;
  }

  return summarisePayableRelease(
    ((data ?? []) as RawPayable[]).map((row) => ({
      amount: toNumber(row.requested_amount),
      approved_at: row.approved_at,
      id: row.id,
      paid_at: row.paid_at,
      payment_type: row.payment_type,
      status: row.status,
      submitted_at: row.submitted_at,
    })),
    opsReportWindow(periodStart, periodEnd),
  );
}

type RawBudget = {
  budget_number: string;
  contingency_amount: number | string | null;
  id: string;
  site: { code: string } | { code: string }[] | null;
  site_id: string | null;
  status: string;
  title: string;
};

type RawBudgetLine = { budget_id: string; budgeted_amount: number | string | null };

type RawCostEntry = {
  amount: number | string | null;
  budget_id: string | null;
  cost_date: string;
  lifecycle_state: string;
};

function relation<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

/**
 * Budget positions for a period — the one genuinely new piece of query work in
 * the plan.
 *
 * `fetchOpsCostCodePosition` answers the same shape of question for a single
 * cost code, but only over all time: it has no date filter, because an
 * approver asking "what is left?" means right now. A report asking "what was
 * used in July?" needs the ledger sliced by `cost_date`, which is why this
 * exists rather than reusing that.
 *
 * Draft, active and locked budgets are all fetched — the same set
 * fetchOpsCostCodePosition treats as funding a cost code. Scalar metrics roll
 * up ACTIVE only, but the table shows all of them, because a draft budget
 * carrying real spend is a finding rather than something to filter away.
 */
export async function fetchOpsBudgetConsumption(
  periodStart: string,
  periodEnd: string,
): Promise<OpsBudgetConsumption> {
  const supabase = getOpsSupabaseServiceClient();
  const window = opsReportWindow(periodStart, periodEnd);

  const { data: budgetRows, error: budgetError } = await supabase
    .from("project_budgets")
    .select(
      "id, budget_number, title, status, site_id, contingency_amount, site:sites!project_budgets_site_id_fkey(code)",
    )
    .in("status", ["draft", "active", "locked"]);

  if (budgetError) {
    throw budgetError;
  }

  const budgetIds = ((budgetRows ?? []) as RawBudget[]).map((row) => row.id);

  if (budgetIds.length === 0) {
    return summariseBudgetConsumption([], [], window);
  }

  const [{ data: lineRows, error: lineError }, { data: entryRows, error: entryError }, thresholds] =
    await Promise.all([
      supabase
        .from("project_budget_lines")
        .select("budget_id, budgeted_amount")
        .in("budget_id", budgetIds),
      supabase
        .from("project_cost_entries")
        .select("budget_id, amount, cost_date, lifecycle_state")
        .in("budget_id", budgetIds)
        .neq("lifecycle_state", "released"),
      fetchOpsBudgetControlThresholds().catch(() => undefined),
    ]);

  if (lineError) {
    throw lineError;
  }
  if (entryError) {
    throw entryError;
  }

  const budgetedById = new Map<string, number>();
  for (const line of (lineRows ?? []) as RawBudgetLine[]) {
    budgetedById.set(
      line.budget_id,
      roundMoney((budgetedById.get(line.budget_id) ?? 0) + toNumber(line.budgeted_amount)),
    );
  }

  return summariseBudgetConsumption(
    ((budgetRows ?? []) as RawBudget[]).map((row) => ({
      budget_id: row.id,
      budget_number: row.budget_number,
      budgeted: budgetedById.get(row.id) ?? 0,
      contingency: toNumber(row.contingency_amount),
      site_code: relation(row.site)?.code ?? "—",
      site_id: row.site_id,
      status: row.status,
      title: row.title,
    })),
    ((entryRows ?? []) as RawCostEntry[])
      .filter((row): row is RawCostEntry & { budget_id: string } => Boolean(row.budget_id))
      .map((row) => ({
        amount: toNumber(row.amount),
        budget_id: row.budget_id,
        cost_date: row.cost_date,
        lifecycle_state: row.lifecycle_state,
      })),
    window,
    thresholds,
  );
}
