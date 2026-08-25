import {
  listOpsOtherAllowances,
  readOpsEmployeePayStructure,
  type OpsEmployeePayStructureRow,
} from "@/lib/ops/employee-pay";
import { logOpsServerError } from "@/lib/ops/log";
import { computeStaffPayslip } from "@/lib/ops/statutory/calculator";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type {
  OpsContractRemuneration,
  OpsContractRemunerationAllowance,
} from "@/lib/ops/contract-types";

/**
 * The remuneration schedule on an employment contract.
 *
 * Two sources, deliberately:
 *
 *   * A DRAFT computes live from the linked employee_contracts row, so HR sees
 *     the effect of a pay change while they are still drafting.
 *   * An APPROVED contract reads remuneration_snapshot, frozen at approval
 *     alongside counterparty_snapshot. A pay review next year must not rewrite
 *     a contract signed this year.
 *
 * Every figure comes from computeStaffPayslip — the same function the payroll
 * run uses — through the same allowance reader. A contract that promised one
 * net and a payslip that paid another would be worse than showing nothing.
 */

const MODULE = "contracts";

/** Advances are a payroll-run concern, not a contract term. */
const NO_ADVANCE = 0;

type EmployeeContractPayRow = OpsEmployeePayStructureRow & {
  id: string;
  status: string;
  contract_number: string;
  pay_frequency: string;
  leave_rate_per_month: number | string | null;
};

/**
 * Compute the schedule from a pay record.
 *
 * `periodDate` picks the ZRA rate year. For a draft that is today; for a
 * snapshot it is the approval date, so a contract approved in one tax year
 * keeps that year's bands even if it is read in the next.
 */
export function buildOpsContractRemuneration(input: {
  payRow: EmployeeContractPayRow;
  statutoryApplies: boolean;
  periodDate: Date | string;
}): OpsContractRemuneration {
  const { payRow, statutoryApplies, periodDate } = input;
  const structure = readOpsEmployeePayStructure(payRow);

  const slip = computeStaffPayslip({
    basic: structure.basic,
    housing: structure.housing,
    otherAllowances: structure.otherAllowances,
    advanceDeduction: NO_ADVANCE,
    periodDate,
    statutoryContributionsEnabled: statutoryApplies,
  });

  const allowances: OpsContractRemunerationAllowance[] = listOpsOtherAllowances(
    payRow.other_allowances,
  );

  return {
    source_employee_contract_id: payRow.id,
    source_contract_number: payRow.contract_number,
    pay_frequency: payRow.pay_frequency,
    leave_rate_per_month: Number(payRow.leave_rate_per_month ?? 0) || 0,
    basic: slip.basic,
    housing: slip.housing,
    other_allowances: slip.otherAllowances,
    allowance_items: allowances,
    gross: slip.gross,
    statutory_applies: statutoryApplies,
    paye: slip.paye,
    napsa_employee: slip.napsaEmployee,
    napsa_employer: slip.napsaEmployer,
    nhima_employee: slip.nhimaEmployee,
    nhima_employer: slip.nhimaEmployer,
    wcf_employer: slip.wcfEmployer,
    total_deductions: slip.totalEmployeeDeductions,
    net: slip.net,
    employer_total_cost: slip.employerTotalCost,
    tax_year: slip.taxYear,
    citation: slip.citation,
    computed_at: new Date(periodDate).toISOString(),
    frozen: false,
  };
}

/**
 * Whether the statutory basis applies to this contract.
 *
 * The contract's own `statutory_contributions_apply` wins when set; NULL falls
 * back to the employee's standing setting. Both default to true — the ordinary
 * case is an employee on PAYE, and an accidental NULL must not quietly hand
 * someone their gross.
 */
export async function resolveOpsContractStatutoryBasis(input: {
  contractSetting: boolean | null;
  employeeId: string | null;
}): Promise<boolean> {
  if (input.contractSetting !== null && input.contractSetting !== undefined) {
    return input.contractSetting;
  }
  if (!input.employeeId) return true;

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("employees")
    .select("statutory_contributions_enabled")
    .eq("id", input.employeeId)
    .maybeSingle<{ statutory_contributions_enabled: boolean | null }>();

  if (error) {
    logOpsServerError(error, {
      module: MODULE,
      action: "resolveOpsContractStatutoryBasis",
      entityId: input.employeeId,
    });
    return true;
  }

  return data?.statutory_contributions_enabled !== false;
}

/** Read one pay record, or null when the contract is not linked to one yet. */
export async function fetchOpsEmployeeContractPayRow(
  employeeContractId: string | null,
): Promise<EmployeeContractPayRow | null> {
  if (!employeeContractId) return null;

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("employee_contracts")
    .select(
      "id, contract_number, status, basic_pay, housing_allowance, other_allowances, leave_rate_per_month, pay_frequency",
    )
    .eq("id", employeeContractId)
    .maybeSingle();

  if (error) {
    logOpsServerError(error, {
      module: MODULE,
      action: "fetchOpsEmployeeContractPayRow",
      entityId: employeeContractId,
    });
    return null;
  }

  return (data as EmployeeContractPayRow | null) ?? null;
}

/**
 * The schedule as the contract page should show it.
 *
 * Returns null when there is nothing to show — not an empty schedule, which
 * would read as "this person is paid nothing" rather than "no pay record is
 * linked yet".
 *
 * CALLERS MUST GATE. This function returns pay figures for whoever asks; the
 * visibility rule lives in canViewOpsContractSubject and is applied by
 * fetchOpsContractById before this is ever reached.
 */
export async function resolveOpsContractRemuneration(contract: {
  id: string;
  kind: string;
  status: string;
  employee_id: string | null;
  employee_contract_id: string | null;
  statutory_contributions_apply: boolean | null;
  remuneration_snapshot: unknown;
  approved_at: string | null;
}): Promise<OpsContractRemuneration | null> {
  if (contract.kind !== "employment") return null;

  // Frozen wins whenever it exists. An approved contract shows what it was
  // approved with, full stop — recomputing would defeat the snapshot.
  const snapshot = contract.remuneration_snapshot;
  if (snapshot && typeof snapshot === "object" && "net" in (snapshot as object)) {
    return { ...(snapshot as OpsContractRemuneration), frozen: true };
  }

  const payRow = await fetchOpsEmployeeContractPayRow(contract.employee_contract_id);
  if (!payRow) return null;

  const statutoryApplies = await resolveOpsContractStatutoryBasis({
    contractSetting: contract.statutory_contributions_apply,
    employeeId: contract.employee_id,
  });

  return buildOpsContractRemuneration({
    payRow,
    statutoryApplies,
    periodDate: contract.approved_at ?? new Date(),
  });
}

/**
 * Freeze the schedule onto the contract. Called at approval, next to
 * buildCounterpartySnapshot, and returns the value to store.
 *
 * Throws nothing: a contract with no linked pay record freezes an empty object,
 * and the database constraint contracts_employment_approved_has_remuneration is
 * what refuses to let that reach approval. Two layers, one rule — the check
 * gives the guarantee, this gives the message.
 */
export async function buildOpsContractRemunerationSnapshot(contract: {
  id: string;
  kind: string;
  employee_id: string | null;
  employee_contract_id: string | null;
  statutory_contributions_apply: boolean | null;
}): Promise<OpsContractRemuneration | Record<string, never>> {
  if (contract.kind !== "employment") return {};

  const payRow = await fetchOpsEmployeeContractPayRow(contract.employee_contract_id);
  if (!payRow) return {};

  const statutoryApplies = await resolveOpsContractStatutoryBasis({
    contractSetting: contract.statutory_contributions_apply,
    employeeId: contract.employee_id,
  });

  return {
    ...buildOpsContractRemuneration({
      payRow,
      statutoryApplies,
      // Approval time, not the pay record's start date: this is the moment the
      // figures stop moving.
      periodDate: new Date(),
    }),
    frozen: true,
  };
}

/**
 * The pay records an employment contract may be drawn from.
 *
 * Draft and active only. A terminated or superseded record describes what
 * someone USED to be paid, and offering it here is how a contract ends up
 * quoting a salary nobody agreed to.
 */
export async function fetchOpsEmployeePayRecordOptions(employeeId: string | null) {
  if (!employeeId) return [];

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("employee_contracts")
    .select(
      "id, contract_number, title, status, start_date, basic_pay, housing_allowance, other_allowances",
    )
    .eq("employee_id", employeeId)
    .in("status", ["draft", "active"])
    .order("start_date", { ascending: false })
    .limit(20);

  if (error) {
    logOpsServerError(error, {
      module: MODULE,
      action: "fetchOpsEmployeePayRecordOptions",
      entityId: employeeId,
    });
    return [];
  }

  type PayRecordOption = OpsEmployeePayStructureRow & {
    id: string;
    contract_number: string;
    title: string;
    status: string;
    start_date: string;
  };

  return ((data ?? []) as unknown as PayRecordOption[]).map((row) => ({
    id: row.id,
    contract_number: row.contract_number,
    title: row.title,
    status: row.status,
    start_date: row.start_date,
    gross: readOpsEmployeePayStructure(row).gross,
  }));
}
