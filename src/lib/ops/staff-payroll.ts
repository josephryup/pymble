import { requireOpsUser } from "@/lib/ops/auth";
import { isLeadershipRole, isHumanResourceRole } from "@/lib/ops/roles";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type { OpsPayoutStatus, OpsPayrollStatus, OpsUserRole } from "@/lib/ops/types";

/**
 * Staff payroll data layer (separate from worker payroll).
 *
 * Staff are paid a contract-based salary (basic + housing + allowances) with
 * NHIMA on top of the existing PAYE + NAPSA + WCF deductions. Identity snapshot
 * fields (employee_number, full_name, NRC, NAPSA No.) are stored on the item so
 * payslips replay even if the employee record changes later.
 */

export type OpsStaffPayrollItem = {
  id: string;
  staff_payroll_run_id: string;
  employee_id: string;
  employee_number: string;
  full_name: string;
  job_title: string;
  department: string;
  nrc_number: string;
  napsa_number: string;
  basic_pay: number;
  housing_allowance: number;
  other_allowances: number;
  gross_pay: number;
  paye_amount: number;
  napsa_employee: number;
  napsa_employer: number;
  nhima_employee: number;
  nhima_employer: number;
  wcf_employer: number;
  advance_deduction: number;
  net_pay: number;
  payout_status: OpsPayoutStatus;
  payout_reference: string | null;
  tax_year: number | null;
  statutory_citation: string | null;
  bank_name: string;
  bank_branch: string;
  bank_account_number: string;
  created_at: string;
};

export type OpsStaffPayrollRun = {
  id: string;
  period_label: string;
  period_start: string;
  period_end: string;
  status: OpsPayrollStatus;
  total_basic: number;
  total_gross: number;
  total_advances: number;
  total_net: number;
  approved_at: string | null;
  disbursed_at: string | null;
  archived_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  items: OpsStaffPayrollItem[];
};

export type OpsStaffAdvance = {
  id: string;
  employee_id: string;
  amount: number;
  note: string;
  issued_at: string;
  deducted_in_run_id: string | null;
  archived_at: string | null;
  created_at: string;
  employee: {
    id: string;
    employee_number: string;
    full_name: string;
  } | null;
};

export type OpsStaffPayrollEmployee = {
  id: string;
  employee_number: string;
  full_name: string;
  job_title: string;
  department: string;
  statutory_contributions_enabled: boolean;
  bank_name: string;
  bank_branch: string;
  bank_account_number: string;
};

const MONEY_KEYS = [
  "basic_pay",
  "housing_allowance",
  "other_allowances",
  "gross_pay",
  "paye_amount",
  "napsa_employee",
  "napsa_employer",
  "nhima_employee",
  "nhima_employer",
  "wcf_employer",
  "advance_deduction",
  "net_pay",
] as const;

type RawItem = Record<string, unknown>;

function num(value: unknown): number {
  return Number(value ?? 0);
}

function normalizeItem(row: RawItem): OpsStaffPayrollItem {
  const item = { ...row } as Record<string, unknown>;
  for (const key of MONEY_KEYS) {
    item[key] = num(row[key]);
  }
  item.tax_year = row.tax_year == null ? null : Number(row.tax_year);
  return item as unknown as OpsStaffPayrollItem;
}

function normalizeRelation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

/**
 * Back-office staff payroll viewers: leadership, HR, finance. Anyone else is
 * routed to their own slips through the self-service path.
 */
export function canViewOpsStaffPayroll(role: OpsUserRole) {
  return (
    isLeadershipRole(role) ||
    isHumanResourceRole(role) ||
    role === "finance_manager" ||
    role === "accountant"
  );
}

/** Leadership, HR, and the Finance Manager manage staff payroll runs. */
export function canManageOpsStaffPayroll(role: OpsUserRole) {
  return (
    isLeadershipRole(role) ||
    isHumanResourceRole(role) ||
    role === "finance_manager"
  );
}

export async function fetchOpsStaffPayrollEmployees(): Promise<OpsStaffPayrollEmployee[]> {
  const { profile } = await requireOpsUser();
  if (!canManageOpsStaffPayroll(profile.role)) {
    return [];
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("employees")
    .select("id, employee_number, full_name, job_title, department, statutory_contributions_enabled, bank_name, bank_branch, bank_account_number")
    .eq("status", "active")
    .order("full_name", { ascending: true });

  if (error) throw error;

  return ((data ?? []) as unknown as OpsStaffPayrollEmployee[]).map((employee) => ({
    ...employee,
    statutory_contributions_enabled: employee.statutory_contributions_enabled !== false,
  }));
}

export async function fetchOpsStaffPayrollRuns(): Promise<OpsStaffPayrollRun[]> {
  const { profile } = await requireOpsUser();
  if (!canViewOpsStaffPayroll(profile.role)) {
    return [];
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("staff_payroll_runs")
    .select(
      [
        "id",
        "period_label",
        "period_start",
        "period_end",
        "status",
        "total_basic",
        "total_gross",
        "total_advances",
        "total_net",
        "approved_at",
        "disbursed_at",
        "archived_at",
        "cancelled_at",
        "created_at",
        "updated_at",
      ].join(", "),
    )
    .is("archived_at", null)
    .order("period_end", { ascending: false })
    .limit(36);

  if (error) {
    throw error;
  }

  const runs = ((data ?? []) as unknown) as Array<Record<string, unknown>>;
  const runIds = runs.map((row) => row.id as string);
  const itemsByRunId = await fetchItemsByRun(runIds);

  return runs.map((row) => ({
    ...(row as unknown as OpsStaffPayrollRun),
    total_basic: num(row.total_basic),
    total_gross: num(row.total_gross),
    total_advances: num(row.total_advances),
    total_net: num(row.total_net),
    items: itemsByRunId.get(row.id as string) ?? [],
  }));
}

async function fetchItemsByRun(runIds: string[]) {
  const grouped = new Map<string, OpsStaffPayrollItem[]>();
  if (runIds.length === 0) {
    return grouped;
  }
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("staff_payroll_items")
    .select("*")
    .in("staff_payroll_run_id", runIds)
    .order("full_name", { ascending: true });

  if (error) {
    throw error;
  }

  for (const raw of ((data ?? []) as unknown) as RawItem[]) {
    const item = normalizeItem(raw);
    grouped.set(item.staff_payroll_run_id, [
      ...(grouped.get(item.staff_payroll_run_id) ?? []),
      item,
    ]);
  }
  return grouped;
}

export async function fetchOpsStaffAdvances(): Promise<OpsStaffAdvance[]> {
  const { profile } = await requireOpsUser();
  if (!canViewOpsStaffPayroll(profile.role)) {
    return [];
  }
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("staff_advances")
    .select(
      "id, employee_id, amount, note, issued_at, deducted_in_run_id, archived_at, created_at, employee:employees!staff_advances_employee_id_fkey(id, employee_number, full_name)",
    )
    .is("archived_at", null)
    .order("issued_at", { ascending: false })
    .limit(200);

  if (error) {
    throw error;
  }

  return (((data ?? []) as unknown) as Array<Record<string, unknown>>).map((row) => ({
    ...(row as unknown as OpsStaffAdvance),
    amount: num(row.amount),
    employee: normalizeRelation(
      row.employee as OpsStaffAdvance["employee"] | OpsStaffAdvance["employee"][] | null,
    ),
  }));
}

/**
 * Year-to-date roll-up across a single employee's prior staff payroll items.
 * Drives the YTD block at the top of the PCL payslip — Gross / Taxable /
 * Tax-paid YTD. Free pay YTD is computed by the caller from the bands.
 */
export type OpsStaffPayslipYtd = {
  grossYtd: number;
  taxableYtd: number;
  paye_ytd: number;
  /**
   * Number of YTD runs counted (used by the PDF to compute Free Pay YTD —
   * threshold × number of months actually paid, instead of calendar month).
   */
  runsCounted: number;
};

/**
 * Self-service: the signed-in user's own payslip rows, newest first. Returns
 * an empty list if the user has no linked employee record. No role check —
 * callers always get only their own data.
 */
/**
 * Run statuses an employee may see their own payslip for — every value of
 * ops_payroll_status except 'draft'. Approval is the release gate: before it,
 * the numbers are not final and must not reach the employee.
 */
export const SELF_SERVICE_RUN_STATUSES = new Set([
  "approved",
  "disbursing",
  "completed",
]);

export async function fetchMyStaffPayslips(): Promise<
  Array<{
    id: string;
    period_label: string;
    period_start: string;
    period_end: string;
    net_pay: number;
    gross_pay: number;
    payout_status: string;
  }>
> {
  const { profile } = await requireOpsUser();
  const supabase = getOpsSupabaseServiceClient();
  const { data: employee } = await supabase
    .from("employees")
    .select("id")
    .eq("user_id", profile.id)
    .maybeSingle<{ id: string }>();
  if (!employee) {
    // An account with no employee record behind it. The caller distinguishes
    // this from "no payslips yet" via fetchMyPayslipAccess — see the note
    // there on why an empty list alone is a misleading answer (audit §5).
    return [];
  }
  const { data, error } = await supabase
    .from("staff_payroll_items")
    .select(
      "id, gross_pay, net_pay, payout_status, payroll_run:staff_payroll_runs!staff_payroll_items_staff_payroll_run_id_fkey(period_label, period_start, period_end, status, archived_at, cancelled_at)",
    )
    .eq("employee_id", employee.id)
    .order("created_at", { ascending: false })
    .limit(24);
  if (error) {
    throw error;
  }
  return (
    ((data ?? []) as unknown) as Array<{
      id: string;
      gross_pay: number | string;
      net_pay: number | string;
      payout_status: string;
      payroll_run:
        | {
            period_label: string;
            period_start: string;
            period_end: string;
            status: string;
            archived_at: string | null;
            cancelled_at: string | null;
          }
        | Array<{
            period_label: string;
            period_start: string;
            period_end: string;
            status: string;
            archived_at: string | null;
            cancelled_at: string | null;
          }>
        | null;
    }>
  )
    .map((row) => {
      const run = normalizeRelation(row.payroll_run);
      if (!run || run.archived_at || run.cancelled_at) return null;
      // Only released runs. `status` was already being selected and then
      // dropped, so a draft run's payslip was listed and downloadable before
      // anyone approved it — figures that can still change.
      if (!SELF_SERVICE_RUN_STATUSES.has(run.status)) return null;
      return {
        id: row.id,
        period_label: run.period_label,
        period_start: run.period_start,
        period_end: run.period_end,
        gross_pay: num(row.gross_pay),
        net_pay: num(row.net_pay),
        payout_status: row.payout_status,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
}

export type OpsMyPayslipAccess =
  /** No employee record points at this account — nothing can ever be shown. */
  | { state: "no_employee_record" }
  /** Linked, but the employee record is not active. */
  | { state: "inactive_employee"; employeeNumber: string }
  /** Linked and active; an empty list genuinely means no payslips yet. */
  | { state: "linked"; employeeNumber: string };

/**
 * Why a person's payslip list is empty (audit §5).
 *
 * `fetchMyStaffPayslips` returns `[]` both when someone has no payslips and
 * when their account is not linked to an employee record — and those are
 * completely different problems with completely different fixes. The second
 * one silently affects real people: five active employees currently have no
 * account link, so the payroll module has nothing to match them to.
 *
 * Rendering the same "no payslips" message for both tells the wrong person to
 * wait for something that will never arrive. This lets the page say "your
 * account is not linked to an employee record — ask HR", which is actionable.
 *
 * Deliberately reveals nothing about pay: only whether a link exists.
 */
export async function fetchMyPayslipAccess(): Promise<OpsMyPayslipAccess> {
  const { profile } = await requireOpsUser();
  const supabase = getOpsSupabaseServiceClient();

  const { data: employee } = await supabase
    .from("employees")
    .select("employee_number, status")
    .eq("user_id", profile.id)
    .maybeSingle<{ employee_number: string; status: string }>();

  if (!employee) {
    return { state: "no_employee_record" };
  }
  if (employee.status === "exited") {
    return { state: "inactive_employee", employeeNumber: employee.employee_number };
  }
  return { state: "linked", employeeNumber: employee.employee_number };
}

export async function fetchOpsStaffPayslipYtd(
  employeeId: string,
  year: number,
): Promise<OpsStaffPayslipYtd> {
  const supabase = getOpsSupabaseServiceClient();
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const { data, error } = await supabase
    .from("staff_payroll_items")
    .select(
      "gross_pay, paye_amount, staff_payroll_run:staff_payroll_runs!staff_payroll_items_staff_payroll_run_id_fkey(period_end, archived_at, cancelled_at, status)",
    )
    .eq("employee_id", employeeId);

  if (error) {
    throw error;
  }

  // Approved+ runs only — drafts should not move YTD figures during testing.
  const PAID_STATUSES = new Set(["approved", "disbursing", "completed"]);
  let grossYtd = 0;
  let payeYtd = 0;
  let runsCounted = 0;
  for (const row of (data ?? []) as Array<{
    gross_pay: number | string;
    paye_amount: number | string;
    staff_payroll_run:
      | {
          period_end: string;
          archived_at: string | null;
          cancelled_at: string | null;
          status: string;
        }
      | Array<{
          period_end: string;
          archived_at: string | null;
          cancelled_at: string | null;
          status: string;
        }>
      | null;
  }>) {
    const run = normalizeRelation(row.staff_payroll_run);
    if (!run || run.archived_at || run.cancelled_at) continue;
    if (!PAID_STATUSES.has(run.status)) continue;
    if (run.period_end < yearStart || run.period_end > yearEnd) continue;
    grossYtd += num(row.gross_pay);
    payeYtd += num(row.paye_amount);
    runsCounted += 1;
  }

  return {
    grossYtd: Math.round(grossYtd * 100) / 100,
    // In the current model Gross = Taxable (no non-taxable allowances yet)
    taxableYtd: Math.round(grossYtd * 100) / 100,
    paye_ytd: Math.round(payeYtd * 100) / 100,
    runsCounted,
  };
}
