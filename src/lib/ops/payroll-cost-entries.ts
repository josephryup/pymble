import { upsertProjectCostEntry } from "@/lib/ops/project-cost-entries";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

/**
 * Labour into the cost spine — decision D2, step 1.
 *
 * Until now `project_cost_entries` only ever held materials, transport and
 * payables. Labour, usually a contractor's largest cost line, was absent
 * entirely, so every "project spend" figure in the system understated the
 * truth by the whole wage bill.
 *
 * Two engines, two attributions, and the difference is deliberate:
 *
 *   • **Casual site workers** are attributable. `attendance_records` carries
 *     `site_id` and `amount_earned` per day, so a run's cost splits across the
 *     sites the work was actually done on.
 *   • **Salaried staff** are not. Nobody can honestly say which project the
 *     accountant worked on this month, so staff pay charges the HR cost centre
 *     as overhead. A fabricated site split would be worse than an honest
 *     overhead: it would look like project data and be fiction.
 *
 * **Step 1 writes `budget_line_id: null` on purpose.** The entries appear in
 * reporting as unbudgeted labour and consume no project budget. Attaching them
 * to labour budget lines is step 2, once those lines are confirmed to cover the
 * wage bill — do both at once and every active budget's consumed figure jumps
 * overnight, anything past 110% escalates, and the first thing the new metrics
 * do is flood the MD with alarms about a change in accounting rather than a
 * change in spending.
 */

function toNumber(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Cost centre the salaried wage bill charges to, by code. */
const STAFF_PAYROLL_COST_CENTRE_CODE = "HR";

type AttendanceRow = {
  amount_earned: number | string | null;
  overtime_amount: number | string | null;
  site_id: string | null;
};

/**
 * One cost entry per site for a disbursed casual payroll run.
 *
 * Split by attendance rather than headcount: two workers on different sites
 * for different numbers of days do not cost those sites the same, and the
 * attendance ledger already knows the answer.
 *
 * Best-effort — the run is already paid by the time this is called, so a
 * ledger failure must not roll back a disbursement.
 */
export async function writeCasualPayrollCostEntries(input: {
  actorUserId: string;
  costDate: string;
  periodLabel: string;
  runId: string;
}): Promise<number> {
  const supabase = getOpsSupabaseServiceClient();

  const { data, error } = await supabase
    .from("attendance_records")
    .select("site_id, amount_earned, overtime_amount")
    .eq("payroll_run_id", input.runId)
    .is("cancelled_at", null);

  if (error) {
    throw error;
  }

  const bySite = new Map<string, number>();
  for (const row of (data ?? []) as AttendanceRow[]) {
    if (!row.site_id) continue;
    const earned = toNumber(row.amount_earned) + toNumber(row.overtime_amount);
    if (earned <= 0) continue;
    bySite.set(row.site_id, roundMoney((bySite.get(row.site_id) ?? 0) + earned));
  }

  for (const [siteId, amount] of bySite) {
    await upsertProjectCostEntry({
      actorUserId: input.actorUserId,
      // One entry per run per site: re-running the disbursement rewrites
      // rather than duplicates.
      match: {
        source_table: "payroll_runs",
        source_id: input.runId,
        site_id: siteId,
      },
      payload: {
        amount,
        // Step 1: unbudgeted by design — see this module's header.
        budget_id: null,
        budget_line_id: null,
        cost_date: input.costDate,
        cost_type: "labour",
        description: `Site wages ${input.periodLabel}`,
        site_id: siteId,
        source_id: input.runId,
        source_table: "payroll_runs",
      },
      // Wages are paid at the moment they are disbursed — there is no accrual
      // step between deciding to pay and the money leaving.
      lifecycleState: "paid",
      status: "posted",
    });
  }

  return bySite.size;
}

/**
 * One overhead cost entry for a disbursed staff payroll run.
 *
 * Charged to the HR cost centre, not to any site. If that cost centre is
 * missing the entry is skipped rather than guessed at — a wage bill silently
 * charged to the wrong place is worse than one visibly absent.
 */
export async function writeStaffPayrollCostEntry(input: {
  actorUserId: string;
  costDate: string;
  employerCost: number;
  periodLabel: string;
  runId: string;
}): Promise<boolean> {
  if (input.employerCost <= 0) {
    return false;
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data: costCentre, error } = await supabase
    .from("cost_centres")
    .select("id")
    .eq("code", STAFF_PAYROLL_COST_CENTRE_CODE)
    .eq("is_active", true)
    .maybeSingle<{ id: string }>();

  if (error) {
    throw error;
  }
  if (!costCentre) {
    return false;
  }

  await upsertProjectCostEntry({
    actorUserId: input.actorUserId,
    match: { source_table: "staff_payroll_runs", source_id: input.runId },
    payload: {
      amount: roundMoney(input.employerCost),
      budget_id: null,
      budget_line_id: null,
      cost_centre_id: costCentre.id,
      cost_date: input.costDate,
      cost_type: "payroll",
      description: `Staff salaries ${input.periodLabel}`,
      // Overhead belongs to no project, so no site — the same rule the
      // payables charge target follows.
      site_id: null,
      source_id: input.runId,
      source_table: "staff_payroll_runs",
    },
    lifecycleState: "paid",
    status: "posted",
  });

  return true;
}
