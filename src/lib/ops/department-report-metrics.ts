import type { OpsDepartmentKey } from "@/lib/ops/department-report-permissions";
import {
  fetchOpsBudgetConsumption,
  fetchOpsMaterialRequestFunnel,
  fetchOpsPayableRelease,
  fetchOpsPayrollPeriod,
  fetchOpsUnplannedSpend,
} from "@/lib/ops/finance-period-metrics";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

/**
 * Suggested metric values for a department report, computed from live system
 * records for the chosen period. Best-effort by design: every query degrades
 * to "no suggestion" rather than failing the page, and the head can overtype
 * any figure — the system suggests, the human owns the report.
 *
 * Keys here MUST match `auto: true` fields in department-report-templates.ts.
 */

type ServiceClient = ReturnType<typeof getOpsSupabaseServiceClient>;

function dayStart(date: string) {
  return `${date}T00:00:00.000Z`;
}

function dayEnd(date: string) {
  return `${date}T23:59:59.999Z`;
}

function headCount(builder: PromiseLike<{ count: number | null; error: unknown }>) {
  return Promise.resolve(builder)
    .then((result) => (result.error ? null : (result.count ?? 0)))
    .catch(() => null);
}

async function sumColumn(
  builder: PromiseLike<{ data: unknown; error: unknown }>,
  column: string,
) {
  try {
    const { data, error } = await builder;
    if (error || !Array.isArray(data)) return null;
    const total = data.reduce((sum: number, row) => {
      const value = Number((row as Record<string, unknown>)[column] ?? 0);
      return sum + (Number.isFinite(value) ? value : 0);
    }, 0);
    return Math.round(total * 100) / 100;
  } catch {
    return null;
  }
}

async function resolveEntries(
  entries: Array<[string, Promise<number | null>]>,
): Promise<Record<string, number>> {
  const settled = await Promise.all(entries.map(async ([key, run]) => [key, await run] as const));
  const metrics: Record<string, number> = {};
  for (const [key, value] of settled) {
    if (value !== null) metrics[key] = value;
  }
  return metrics;
}

function operationsMetrics(supabase: ServiceClient, start: string, end: string) {
  return resolveEntries([
    [
      "sites_active",
      headCount(
        supabase.from("sites").select("id", { count: "exact", head: true }).eq("is_active", true),
      ),
    ],
    [
      "site_reports_filed",
      headCount(
        supabase
          .from("daily_site_reports")
          .select("id", { count: "exact", head: true })
          .gte("report_date", start)
          .lte("report_date", end),
      ),
    ],
    [
      "attendance_entries",
      headCount(
        supabase
          .from("attendance_records")
          .select("id", { count: "exact", head: true })
          .gte("created_at", dayStart(start))
          .lte("created_at", dayEnd(end)),
      ),
    ],
    [
      "delivery_exceptions_reported",
      headCount(
        supabase
          .from("delivery_exceptions")
          .select("id", { count: "exact", head: true })
          .gte("reported_at", start)
          .lte("reported_at", end),
      ),
    ],
  ]);
}

function engineeringMetrics(supabase: ServiceClient, start: string, end: string) {
  return resolveEntries([
    [
      "sites_active",
      headCount(
        supabase.from("sites").select("id", { count: "exact", head: true }).eq("is_active", true),
      ),
    ],
    [
      "site_reports_filed",
      headCount(
        supabase
          .from("daily_site_reports")
          .select("id", { count: "exact", head: true })
          .gte("report_date", start)
          .lte("report_date", end),
      ),
    ],
    [
      "material_requests_raised",
      headCount(
        supabase
          .from("material_requests")
          .select("id", { count: "exact", head: true })
          .gte("created_at", dayStart(start))
          .lte("created_at", dayEnd(end)),
      ),
    ],
  ]);
}

function procurementMetrics(supabase: ServiceClient, start: string, end: string) {
  return resolveEntries([
    [
      "material_requests_received",
      headCount(
        supabase
          .from("material_requests")
          .select("id", { count: "exact", head: true })
          .gte("created_at", dayStart(start))
          .lte("created_at", dayEnd(end)),
      ),
    ],
    [
      "rfqs_created",
      headCount(
        supabase
          .from("rfqs")
          .select("id", { count: "exact", head: true })
          .gte("created_at", dayStart(start))
          .lte("created_at", dayEnd(end)),
      ),
    ],
    [
      "purchase_orders_issued",
      headCount(
        supabase
          .from("purchase_orders")
          .select("id", { count: "exact", head: true })
          .gte("issued_at", dayStart(start))
          .lte("issued_at", dayEnd(end)),
      ),
    ],
    [
      "purchase_order_value_zmw",
      sumColumn(
        supabase
          .from("purchase_orders")
          .select("total_amount")
          .gte("issued_at", dayStart(start))
          .lte("issued_at", dayEnd(end))
          .limit(1000),
        "total_amount",
      ),
    ],
  ]);
}

/**
 * The material request funnel, folded into the flat metric map.
 *
 * One query set behind eight figures, so it is fetched once rather than as
 * eight independent `resolveEntries` rows. Best-effort like everything else
 * here: a failure yields no suggestions rather than a broken report page.
 */
async function materialRequestFunnelMetrics(start: string, end: string) {
  try {
    const funnel = await fetchOpsMaterialRequestFunnel(start, end);
    const metrics: Record<string, number> = {
      mr_approved_value_zmw: funnel.approved_value,
      mr_approved_not_procured_zmw: funnel.approved_not_procured_value,
      mr_awaiting_finance_zmw: funnel.awaiting_finance_value,
      mr_delivered_value_zmw: funnel.delivered_value,
      mr_procured_value_zmw: funnel.procured_value,
    };

    // Null means "nothing to measure", which is not the same as zero and must
    // not be suggested as one — an empty queue and a queue waiting zero days
    // would otherwise read alike.
    if (funnel.procured_coverage_percent !== null) {
      metrics.mr_procured_coverage_pct = funnel.procured_coverage_percent;
    }
    if (funnel.procurement_days_avg !== null) {
      metrics.mr_procurement_days_avg = funnel.procurement_days_avg;
    }
    if (funnel.awaiting_finance_days_max !== null) {
      metrics.mr_awaiting_finance_days_max = funnel.awaiting_finance_days_max;
    }

    return metrics;
  } catch {
    return {};
  }
}

/**
 * Cash release. Same best-effort contract as the funnel: one query behind
 * seven figures, and a failure suggests nothing rather than breaking the page.
 */
async function payableReleaseMetrics(start: string, end: string) {
  try {
    const release = await fetchOpsPayableRelease(start, end);
    const metrics: Record<string, number> = {
      payments_approved_zmw: release.approved_value,
      payments_awaiting_approval_zmw: release.awaiting_approval_value,
      payments_awaiting_release_zmw: release.awaiting_release_value,
      payments_released_zmw: release.released_value,
    };

    // Null is "no queue", which must not be suggested as a zero-day wait.
    if (release.awaiting_release_days_max !== null) {
      metrics.payments_awaiting_release_days_max = release.awaiting_release_days_max;
    }
    if (release.awaiting_approval_days_max !== null) {
      metrics.payments_awaiting_approval_days_max = release.awaiting_approval_days_max;
    }
    if (release.release_days_avg !== null) {
      metrics.payment_release_days_avg = release.release_days_avg;
    }

    return metrics;
  } catch {
    return {};
  }
}

/**
 * Budget consumption. The scalars only; the per-budget breakdown is a table
 * and lives on /ops/finance, not in six more numeric fields.
 */
async function budgetConsumptionMetrics(start: string, end: string) {
  try {
    const consumption = await fetchOpsBudgetConsumption(start, end);
    const metrics: Record<string, number> = {
      active_budget_total_zmw: consumption.active_budgeted,
      budget_consumed_period_zmw: consumption.active_consumed_period,
      budget_remaining_zmw: consumption.active_remaining,
      budgets_over_threshold: consumption.budgets_over_threshold,
      unfunded_budget_spend_zmw: consumption.unfunded_budget_value,
    };

    // Null when nothing is budgeted — a 0% "used" against no budget would read
    // as healthy when it is the opposite.
    if (consumption.active_used_percent !== null) {
      metrics.budget_used_pct = consumption.active_used_percent;
    }

    return metrics;
  } catch {
    return {};
  }
}

/**
 * Unplanned and off-budget spend. Four distinct failures, kept apart — see
 * OpsUnplannedSpend for why summing them would be meaningless.
 */
async function unplannedSpendMetrics(
  start: string,
  end: string,
): Promise<Record<string, number>> {
  try {
    const spend = await fetchOpsUnplannedSpend(start, end);
    return {
      contingency_spend_zmw: spend.contingency_value,
      escalated_approvals_zmw: spend.escalated_value,
      general_request_value_zmw: spend.general_request_value,
      it_request_value_zmw: spend.it_request_value,
      overhead_spend_zmw: spend.overhead_value,
      unbudgeted_spend_zmw: spend.unbudgeted_value,
      uncoded_spend_zmw: spend.uncoded_value,
    };
  } catch {
    return {};
  }
}

/** Payroll, straight off the payroll tables — it does not reach the spine. */
async function payrollMetrics(
  start: string,
  end: string,
): Promise<Record<string, number>> {
  try {
    const payroll = await fetchOpsPayrollPeriod(start, end);
    return {
      advances_outstanding_zmw: payroll.advances_outstanding,
      headcount_paid: payroll.headcount_paid,
      payroll_casual_paid_zmw: payroll.casual_net,
      payroll_employer_cost_zmw: payroll.employer_cost,
      payroll_staff_paid_zmw: payroll.staff_net,
      payroll_statutory_due_zmw: payroll.statutory_due,
    };
  } catch {
    return {};
  }
}

async function financeMetrics(supabase: ServiceClient, start: string, end: string) {
  const [base, funnel, release, budgets, unplanned, payroll] = await Promise.all([
    baseFinanceMetrics(supabase, start, end),
    materialRequestFunnelMetrics(start, end),
    payableReleaseMetrics(start, end),
    budgetConsumptionMetrics(start, end),
    unplannedSpendMetrics(start, end),
    payrollMetrics(start, end),
  ]);

  return { ...base, ...funnel, ...release, ...budgets, ...unplanned, ...payroll };
}

function baseFinanceMetrics(supabase: ServiceClient, start: string, end: string) {
  return resolveEntries([
    [
      "payment_requests_received",
      headCount(
        supabase
          .from("payment_requests")
          .select("id", { count: "exact", head: true })
          .gte("created_at", dayStart(start))
          .lte("created_at", dayEnd(end)),
      ),
    ],
    [
      "payment_request_value_zmw",
      sumColumn(
        supabase
          .from("payment_requests")
          .select("requested_amount")
          .gte("created_at", dayStart(start))
          .lte("created_at", dayEnd(end))
          .limit(1000),
        "requested_amount",
      ),
    ],
    [
      "invoices_issued",
      headCount(
        supabase
          .from("invoices")
          .select("id", { count: "exact", head: true })
          .gte("issued_at", start)
          .lte("issued_at", end),
      ),
    ],
    [
      "invoice_value_zmw",
      sumColumn(
        supabase
          .from("invoices")
          .select("total_amount")
          .gte("issued_at", start)
          .lte("issued_at", end)
          .limit(1000),
        "total_amount",
      ),
    ],
  ]);
}

function commercialMetrics(supabase: ServiceClient, start: string, end: string) {
  return resolveEntries([
    [
      "claims_submitted",
      headCount(
        supabase
          .from("commercial_claims")
          .select("id", { count: "exact", head: true })
          .gte("created_at", dayStart(start))
          .lte("created_at", dayEnd(end)),
      ),
    ],
    [
      "claim_value_zmw",
      sumColumn(
        supabase
          .from("commercial_claims")
          .select("claimed_amount")
          .gte("created_at", dayStart(start))
          .lte("created_at", dayEnd(end))
          .limit(1000),
        "claimed_amount",
      ),
    ],
    [
      "invoices_issued",
      headCount(
        supabase
          .from("invoices")
          .select("id", { count: "exact", head: true })
          .gte("issued_at", start)
          .lte("issued_at", end),
      ),
    ],
  ]);
}

function hseMetrics(supabase: ServiceClient, start: string, end: string) {
  return resolveEntries([
    [
      "incidents_reported",
      headCount(
        supabase
          .from("hse_incidents")
          .select("id", { count: "exact", head: true })
          .gte("occurred_at", dayStart(start))
          .lte("occurred_at", dayEnd(end)),
      ),
    ],
    [
      "inspections_completed",
      headCount(
        supabase
          .from("hse_inspections")
          .select("id", { count: "exact", head: true })
          .gte("created_at", dayStart(start))
          .lte("created_at", dayEnd(end)),
      ),
    ],
    [
      "risk_assessments_done",
      headCount(
        supabase
          .from("hse_risk_assessments")
          .select("id", { count: "exact", head: true })
          .gte("created_at", dayStart(start))
          .lte("created_at", dayEnd(end)),
      ),
    ],
  ]);
}

function hrMetrics(supabase: ServiceClient, start: string, end: string) {
  return resolveEntries([
    [
      "employees_on_record",
      headCount(supabase.from("employees").select("id", { count: "exact", head: true })),
    ],
    [
      "workers_active",
      headCount(
        supabase.from("workers").select("id", { count: "exact", head: true }).eq("is_active", true),
      ),
    ],
    [
      "leave_requests_received",
      headCount(
        supabase
          .from("leave_requests")
          .select("id", { count: "exact", head: true })
          .gte("created_at", dayStart(start))
          .lte("created_at", dayEnd(end)),
      ),
    ],
    [
      "applications_received",
      headCount(
        supabase
          .from("job_applications")
          .select("id", { count: "exact", head: true })
          .gte("created_at", dayStart(start))
          .lte("created_at", dayEnd(end)),
      ),
    ],
  ]);
}

function itMetrics(supabase: ServiceClient, start: string, end: string) {
  return resolveEntries([
    [
      "tickets_raised",
      headCount(
        supabase
          .from("it_tickets")
          .select("id", { count: "exact", head: true })
          .gte("created_at", dayStart(start))
          .lte("created_at", dayEnd(end)),
      ),
    ],
    [
      "tickets_resolved",
      headCount(
        supabase
          .from("it_tickets")
          .select("id", { count: "exact", head: true })
          .gte("resolved_at", dayStart(start))
          .lte("resolved_at", dayEnd(end)),
      ),
    ],
    [
      "tickets_open",
      headCount(
        supabase
          .from("it_tickets")
          .select("id", { count: "exact", head: true })
          .in("status", ["open", "in_progress"]),
      ),
    ],
    [
      "assets_under_repair",
      headCount(
        supabase
          .from("it_assets")
          .select("id", { count: "exact", head: true })
          .eq("status", "repair"),
      ),
    ],
  ]);
}

/**
 * Suggested figures for the report form. Snapshot metrics (active sites, open
 * tickets) reflect "now"; flow metrics (requests received, invoices issued)
 * are filtered to the period. Returns {} for departments with no automatable
 * metrics (executive) or when queries fail.
 */
export async function fetchOpsDepartmentMetricPrefill(
  department: OpsDepartmentKey,
  periodStart: string,
  periodEnd: string,
): Promise<Record<string, number>> {
  const supabase = getOpsSupabaseServiceClient();

  switch (department) {
    case "operations":
      return operationsMetrics(supabase, periodStart, periodEnd);
    case "engineering":
      return engineeringMetrics(supabase, periodStart, periodEnd);
    case "procurement":
      return procurementMetrics(supabase, periodStart, periodEnd);
    case "finance":
      return financeMetrics(supabase, periodStart, periodEnd);
    case "commercial":
      return commercialMetrics(supabase, periodStart, periodEnd);
    case "hse":
      return hseMetrics(supabase, periodStart, periodEnd);
    case "hr":
      return hrMetrics(supabase, periodStart, periodEnd);
    case "it":
      return itMetrics(supabase, periodStart, periodEnd);
    default:
      return {};
  }
}
