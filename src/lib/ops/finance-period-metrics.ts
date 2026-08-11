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
export type OpsReportWindow = { startIso: string; endIso: string };

export function opsReportWindow(periodStart: string, periodEnd: string): OpsReportWindow {
  return {
    startIso: `${periodStart}T00:00:00.000Z`,
    endIso: `${periodEnd}T23:59:59.999Z`,
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
