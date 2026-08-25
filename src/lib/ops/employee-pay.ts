/**
 * Reading a pay structure off an employee_contracts row.
 *
 * Extracted so the contract register and the payroll run compute from the SAME
 * function. They used to have their own copies of the allowance-summing rule,
 * which is how a contract could promise one gross and a payslip pay another —
 * the two would agree on the day they were written and drift the first time
 * either changed.
 *
 * No server imports here: the shapes are plain data, so a client component can
 * pull the types without dragging the service-role client into the bundle.
 */

/** One entry in employee_contracts.other_allowances (jsonb array). */
export type OpsOtherAllowance = {
  label?: string;
  amount?: number | string;
};

/**
 * The pay columns as they come back from Postgres — numerics arrive as strings
 * over PostgREST, and the columns are nullable on rows written before the
 * staff-payroll migration added them.
 */
export type OpsEmployeePayStructureRow = {
  basic_pay?: number | string | null;
  housing_allowance?: number | string | null;
  other_allowances?: unknown;
};

export type OpsEmployeePayStructure = {
  basic: number;
  housing: number;
  otherAllowances: number;
  /** basic + housing + other. The figure every downstream calculation starts from. */
  gross: number;
};

/**
 * Sum the itemised allowances.
 *
 * Non-array input yields 0 rather than throwing: the column defaults to '[]'
 * but predates a NOT NULL on older rows, and a payroll run must not fail
 * because one contract has a null where a list should be. Negative and
 * non-finite entries are ignored — an "allowance" that reduces pay is a
 * deduction and does not belong in this column.
 */
export function sumOpsOtherAllowances(value: unknown): number {
  if (!Array.isArray(value)) return 0;

  let total = 0;
  for (const entry of value as OpsOtherAllowance[]) {
    const amount = Number(entry?.amount ?? 0);
    if (Number.isFinite(amount) && amount > 0) {
      total += amount;
    }
  }
  return total;
}

/** The itemised allowances, for a contract schedule that has to name each one. */
export function listOpsOtherAllowances(value: unknown): Array<{ label: string; amount: number }> {
  if (!Array.isArray(value)) return [];

  return (value as OpsOtherAllowance[])
    .map((entry) => ({
      label: String(entry?.label ?? "").trim() || "Allowance",
      amount: Number(entry?.amount ?? 0),
    }))
    .filter((entry) => Number.isFinite(entry.amount) && entry.amount > 0);
}

/** Read the pay structure off a contract row. */
export function readOpsEmployeePayStructure(
  row: OpsEmployeePayStructureRow | null | undefined,
): OpsEmployeePayStructure {
  const basic = Number(row?.basic_pay ?? 0) || 0;
  const housing = Number(row?.housing_allowance ?? 0) || 0;
  const otherAllowances = sumOpsOtherAllowances(row?.other_allowances);

  return {
    basic,
    housing,
    otherAllowances,
    gross: basic + housing + otherAllowances,
  };
}

/** Does this contract actually state a wage? A K0 structure is not a pay offer. */
export function hasOpsEmployeePay(row: OpsEmployeePayStructureRow | null | undefined) {
  return readOpsEmployeePayStructure(row).gross > 0;
}
