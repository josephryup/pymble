"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeOpsActionErrorMessage } from "@/lib/ops/action-errors";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import { notifyOpsWorkflowEvent } from "@/lib/ops/workflow-notifications";
import { requireOpsUser } from "@/lib/ops/auth";
import { sumOpsOtherAllowances } from "@/lib/ops/employee-pay";
import { postStaffPayrollRunJournalSafe } from "@/lib/ops/gl-posting";
import { logOpsServerError, swallowOpsError } from "@/lib/ops/log";
import { writeStaffPayrollCostEntry } from "@/lib/ops/payroll-cost-entries";
import { queueOpsNotification } from "@/lib/ops/notifications";
import { canManageOpsStaffPayroll } from "@/lib/ops/staff-payroll";
import { computeStaffPayslip } from "@/lib/ops/statutory/calculator";
import { sendStaffPayslipEmailsForRun } from "@/lib/ops/staff-payslip-email";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

const STAFF_PAYROLL_ROUTE = "/ops/staff-payroll";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date.");

const createRunSchema = z
  .object({
    period_label: z.string().trim().min(3, "Period label is required.").max(80),
    period_start: dateSchema,
    period_end: dateSchema,
    employee_ids: z.array(z.string().uuid()).min(1, "Select at least one employee."),
  })
  .refine((value) => value.period_end >= value.period_start, {
    message: "Period end must be the same day or later than the start date.",
    path: ["period_end"],
  });

const runIdSchema = z.object({ id: z.string().uuid("Select a payroll run.") });

const staffPayrollItemEditSchema = z.object({
  item_id: z.string().uuid("Select a payroll item."),
  basic_pay: z.coerce.number().min(0, "Basic pay cannot be negative."),
  housing_allowance: z.coerce.number().min(0, "Housing allowance cannot be negative."),
  other_allowances: z.coerce.number().min(0, "Other allowances cannot be negative."),
});

const advanceSchema = z.object({
  employee_id: z.string().uuid("Select an employee."),
  amount: z.coerce.number().positive("Amount must be greater than zero."),
  note: z.string().trim().max(200).default(""),
  issued_at: dateSchema,
});

const advanceIdSchema = z.object({ id: z.string().uuid("Select an advance.") });

const statutoryContributionsSchema = z.object({
  employee_id: z.string().uuid("Select an employee."),
  enabled: z.enum(["true", "false"]),
});

const bankDetailsSchema = z.object({
  employee_id: z.string().uuid("Select an employee."),
  bank_name: z.string().trim().max(120).default(""),
  bank_branch: z.string().trim().max(120).default(""),
  bank_account_number: z.string().trim().max(80).default(""),
});

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function staffPayrollError(message: string): never {
  redirect(
    `${STAFF_PAYROLL_ROUTE}?error=${encodeURIComponent(safeOpsActionErrorMessage(message))}`,
  );
}

type EmployeeForPayroll = {
  id: string;
  employee_number: string;
  full_name: string;
  job_title: string;
  department: string;
  nrc_number: string;
  napsa_number: string;
  tpin: string;
  bank_name: string;
  bank_branch: string;
  bank_account_number: string;
  status: string;
};

type ActiveContractForPayroll = {
  employee_id: string;
  basic_pay: number | string;
  housing_allowance: number | string;
  other_allowances: unknown;
  status: string;
  start_date: string;
};

/**
 * Create a staff payroll run and compute one item per active employee that has
 * an active contract. Open staff advances are applied to net pay automatically
 * and the advance is linked to this run so it can't be deducted again.
 */
export async function createStaffPayrollRunAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canManageOpsStaffPayroll(profile.role)) {
    staffPayrollError("Your role cannot create staff payroll runs.");
  }

  const parsed = createRunSchema.safeParse({
    period_label: field(formData, "period_label"),
    period_start: field(formData, "period_start"),
    period_end: field(formData, "period_end"),
    employee_ids: formData.getAll("employee_ids").filter((value): value is string => typeof value === "string"),
  });

  if (!parsed.success) {
    staffPayrollError(parsed.error.issues[0]?.message ?? "Check the payroll period.");
  }

  const supabase = getOpsSupabaseServiceClient();

  // Active employees. Contracts are fetched separately below so an older
  // expired/draft contract cannot be returned ahead of the active contract
  // by PostgREST's relationship ordering.
  const { data: employeesData, error: employeesError } = await supabase
    .from("employees")
    .select(
      [
        "id",
        "employee_number",
        "full_name",
        "job_title",
        "department",
        "nrc_number",
        "napsa_number",
        "tpin",
        "bank_name",
        "bank_branch",
        "bank_account_number",
        "status",
      ].join(", "),
    )
    .eq("status", "active")
    .in("id", parsed.data.employee_ids);

  if (employeesError) {
    staffPayrollError(employeesError.message);
  }

  const employees = (employeesData ?? []) as unknown as EmployeeForPayroll[];
  if (employees.length !== parsed.data.employee_ids.length) {
    staffPayrollError("One or more selected employees are no longer active.");
  }

  const { data: contractsData, error: contractsError } = await supabase
    .from("employee_contracts")
    .select("employee_id, basic_pay, housing_allowance, other_allowances, status, start_date")
    .in("employee_id", parsed.data.employee_ids)
    .eq("status", "active")
    .order("start_date", { ascending: false });

  if (contractsError) {
    staffPayrollError(contractsError.message);
  }

  // If data contains overlapping active contracts, use the latest-starting
  // one consistently for this run.
  const activeContractByEmployeeId = new Map<string, ActiveContractForPayroll>();
  for (const contract of (contractsData ?? []) as ActiveContractForPayroll[]) {
    if (!activeContractByEmployeeId.has(contract.employee_id)) {
      activeContractByEmployeeId.set(contract.employee_id, contract);
    }
  }

  const withActiveContract = employees
    .map((employee) => ({
      employee,
      contract: activeContractByEmployeeId.get(employee.id) ?? null,
    }))
    .filter((row) => row.contract);

  if (withActiveContract.length === 0) {
    staffPayrollError(
      "No active employees with an active contract were found. Add or activate a contract first.",
    );
  }

  // Drop employees whose contract has no pay structure — silently writing K0
  // line items would produce useless payslips.
  const skippedZeroPay: string[] = [];
  const payable = withActiveContract.filter(({ employee, contract }) => {
    if (!contract) return false;
    const totalPay =
      Number(contract.basic_pay) +
      Number(contract.housing_allowance) +
      sumOpsOtherAllowances(contract.other_allowances);
    if (totalPay <= 0) {
      skippedZeroPay.push(employee.full_name || employee.employee_number);
      return false;
    }
    return true;
  });

  if (payable.length === 0) {
    staffPayrollError(
      `Payroll not generated — every active employee's contract has zero pay set. Open each contract and enter basic pay + housing allowance first. (${skippedZeroPay.join(", ")})`,
    );
  }

  // Open advances per employee (deducted in this run).
  const employeeIds = payable.map((row) => row.employee.id);
  const { data: statutoryData, error: statutoryError } = await supabase
    .from("employees")
    .select("id, statutory_contributions_enabled")
    .in("id", employeeIds);
  if (statutoryError) {
    staffPayrollError(statutoryError.message);
  }
  const statutoryByEmployeeId = new Map(
    (statutoryData ?? []).map((employee) => [
      employee.id as string,
      employee.statutory_contributions_enabled !== false,
    ]),
  );

  const { data: advanceData, error: advanceError } = await supabase
    .from("staff_advances")
    .select("id, employee_id, amount")
    .in("employee_id", employeeIds)
    .is("deducted_in_run_id", null)
    .is("archived_at", null);

  if (advanceError) {
    staffPayrollError(advanceError.message);
  }

  const openAdvancesByEmployeeId = new Map<
    string,
    Array<{ id: string; amount: number }>
  >();
  for (const advance of (advanceData ?? []) as Array<{
    id: string;
    employee_id: string;
    amount: number | string;
  }>) {
    const list = openAdvancesByEmployeeId.get(advance.employee_id) ?? [];
    list.push({ id: advance.id, amount: Number(advance.amount) });
    openAdvancesByEmployeeId.set(advance.employee_id, list);
  }

  // Create the run header first; items reference it.
  const { data: run, error: runError } = await supabase
    .from("staff_payroll_runs")
    .insert({
      period_label: parsed.data.period_label,
      period_start: parsed.data.period_start,
      period_end: parsed.data.period_end,
      status: "draft",
      created_by: profile.id,
    })
    .select("id")
    .single<{ id: string }>();

  if (runError || !run) {
    staffPayrollError(runError?.message ?? "The payroll run could not be created.");
  }

  let totalBasic = 0;
  let totalGross = 0;
  let totalAdvances = 0;
  let totalNet = 0;
  const advanceIdsToLink: string[] = [];
  const inserts: Array<Record<string, unknown>> = [];

  for (const { employee, contract } of payable) {
    if (!contract) continue;
    const advances = openAdvancesByEmployeeId.get(employee.id) ?? [];
    const advanceTotal = advances.reduce((sum, item) => sum + item.amount, 0);

    const slip = computeStaffPayslip({
      basic: Number(contract.basic_pay),
      housing: Number(contract.housing_allowance),
      otherAllowances: sumOpsOtherAllowances(contract.other_allowances),
      advanceDeduction: advanceTotal,
      periodDate: parsed.data.period_end,
      statutoryContributionsEnabled: statutoryByEmployeeId.get(employee.id) !== false,
    });

    totalBasic += slip.basic;
    totalGross += slip.gross;
    totalAdvances += slip.advanceDeduction;
    totalNet += slip.net;
    advances.forEach((advance) => advanceIdsToLink.push(advance.id));

    inserts.push({
      staff_payroll_run_id: run.id,
      employee_id: employee.id,
      employee_number: employee.employee_number ?? "",
      full_name: employee.full_name ?? "",
      job_title: employee.job_title ?? "",
      department: employee.department ?? "",
      nrc_number: employee.nrc_number ?? "",
      napsa_number: employee.napsa_number ?? "",
      // Snapshot, not a join: the payslip keeps the TPIN it was issued with.
      tpin: employee.tpin ?? "",
      bank_name: employee.bank_name ?? "",
      bank_branch: employee.bank_branch ?? "",
      bank_account_number: employee.bank_account_number ?? "",
      basic_pay: slip.basic,
      housing_allowance: slip.housing,
      other_allowances: slip.otherAllowances,
      gross_pay: slip.gross,
      paye_amount: slip.paye,
      napsa_employee: slip.napsaEmployee,
      napsa_employer: slip.napsaEmployer,
      nhima_employee: slip.nhimaEmployee,
      nhima_employer: slip.nhimaEmployer,
      wcf_employer: slip.wcfEmployer,
      advance_deduction: slip.advanceDeduction,
      net_pay: slip.net,
      tax_year: slip.taxYear,
      statutory_citation: slip.citation,
    });
  }

  if (inserts.length === 0) {
    // Clean up the orphan run header.
    await supabase.from("staff_payroll_runs").delete().eq("id", run.id);
    staffPayrollError("No staff items could be computed for this run.");
  }

  const { error: itemError } = await supabase.from("staff_payroll_items").insert(inserts);
  if (itemError) {
    await supabase.from("staff_payroll_runs").delete().eq("id", run.id);
    staffPayrollError(itemError.message);
  }

  // Link the open advances to this run (they're now considered deducted).
  if (advanceIdsToLink.length > 0) {
    const { error: linkError } = await supabase
      .from("staff_advances")
      .update({ deducted_in_run_id: run.id })
      .in("id", advanceIdsToLink);
    if (linkError) {
      staffPayrollError(linkError.message);
    }
  }

  await supabase
    .from("staff_payroll_runs")
    .update({
      // Round the accumulated totals so stored figures match the sum of the
      // (already-rounded) line items exactly and don't carry float drift.
      total_basic: Math.round(totalBasic * 100) / 100,
      total_gross: Math.round(totalGross * 100) / 100,
      total_advances: Math.round(totalAdvances * 100) / 100,
      total_net: Math.round(totalNet * 100) / 100,
    })
    .eq("id", run.id);

  await recordOpsAuditEvent({
    action: "staff_payroll_run.created",
    actorUserId: profile.id,
    entityId: run.id,
    entityType: "staff_payroll_run",
    metadata: {
      period_label: parsed.data.period_label,
      employees: inserts.length,
      total_net: Math.round(totalNet * 100) / 100,
    },
    moduleKey: "staff_payroll",
    sourceId: run.id,
    sourceTable: "staff_payroll_runs",
    summary: `Created staff payroll run ${parsed.data.period_label} (${inserts.length} employees)`,
  }).catch(() => null);

  await notifyOpsWorkflowEvent({
    actorId: profile.id,
    actionNeededRoles: ["managing_director", "general_manager"],
    title: `Approve staff payroll run: ${parsed.data.period_label}`,
    body: `${profile.full_name} prepared the ${parsed.data.period_label} staff payroll run. Approval needed before completion.`,
    actionHref: STAFF_PAYROLL_ROUTE,
    moduleKey: "staff_payroll",
    sourceTable: "staff_payroll_runs",
    sourceId: run.id,
    eventKey: "created",
  });

  revalidatePath(STAFF_PAYROLL_ROUTE);
  redirect(
    `${STAFF_PAYROLL_ROUTE}?created=run&included=${payable.length}&skipped=${skippedZeroPay.length}`,
  );
}

export async function updateStaffStatutoryContributionsAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  if (!canManageOpsStaffPayroll(profile.role)) {
    staffPayrollError("Your role cannot update statutory contribution settings.");
  }

  const parsed = statutoryContributionsSchema.safeParse({
    employee_id: field(formData, "employee_id"),
    enabled: field(formData, "enabled"),
  });
  if (!parsed.success) {
    staffPayrollError(parsed.error.issues[0]?.message ?? "Check the contribution setting.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("employees")
    .update({ statutory_contributions_enabled: parsed.data.enabled === "true" })
    .eq("id", parsed.data.employee_id)
    .eq("status", "active");
  if (error) staffPayrollError(error.message);

  await recordOpsAuditEvent({
    action: "employee.statutory_contributions_updated",
    actorUserId: profile.id,
    entityId: parsed.data.employee_id,
    entityType: "employee",
    metadata: { statutory_contributions_enabled: parsed.data.enabled === "true" },
    moduleKey: "staff_payroll",
    sourceId: parsed.data.employee_id,
    sourceTable: "employees",
    summary: `Updated statutory contributions for an employee`,
  }).catch(() => null);

  revalidatePath(STAFF_PAYROLL_ROUTE);
  redirect(`${STAFF_PAYROLL_ROUTE}?updated=statutory_contributions`);
}

/** Approve a draft staff payroll run (manager+leadership only). */
export async function approveStaffPayrollRunAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  if (!canManageOpsStaffPayroll(profile.role)) {
    staffPayrollError("Your role cannot approve staff payroll runs.");
  }
  const parsed = runIdSchema.safeParse({ id: field(formData, "id") });
  if (!parsed.success) {
    staffPayrollError("Select a staff payroll run.");
  }
  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("staff_payroll_runs")
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: profile.id,
    })
    .eq("id", parsed.data.id)
    .eq("status", "draft");
  if (error) {
    staffPayrollError(error.message);
  }
  await recordOpsAuditEvent({
    action: "staff_payroll_run.approved",
    actorUserId: profile.id,
    entityId: parsed.data.id,
    entityType: "staff_payroll_run",
    moduleKey: "staff_payroll",
    sourceId: parsed.data.id,
    sourceTable: "staff_payroll_runs",
    summary: "Approved staff payroll run",
  }).catch(() => null);
  await notifyOpsWorkflowEvent({
    actorId: profile.id,
    actionNeededRoles: ["finance_manager", "accountant"],
    title: "Staff payroll run approved — ready to complete",
    body: `${profile.full_name} approved a staff payroll run. Complete it to record the disbursement.`,
    actionHref: STAFF_PAYROLL_ROUTE,
    moduleKey: "staff_payroll",
    sourceTable: "staff_payroll_runs",
    sourceId: parsed.data.id,
    eventKey: "approved",
  });

  await notifyStaffOfReleasedPayslips(parsed.data.id, profile.full_name);

  revalidatePath(STAFF_PAYROLL_ROUTE);
  revalidatePath("/ops/profile");
  redirect(`${STAFF_PAYROLL_ROUTE}?updated=approved`);
}

/**
 * Tell each employee in the run that their own payslip is available.
 *
 * One notification per employee, addressed to their own user account and
 * deep-linked to their payslip list. Nothing about anyone else's pay is in the
 * title, body or link — the amount is deliberately omitted, because a
 * notification preview can appear on a lock screen.
 *
 * Employees with no linked login (employees.user_id is null) simply get no
 * notification; the count is recorded on the audit event so HR can see who is
 * missing an account rather than it failing silently.
 */
async function notifyStaffOfReleasedPayslips(runId: string, actorName: string) {
  const supabase = getOpsSupabaseServiceClient();

  const { data, error } = await supabase
    .from("staff_payroll_items")
    .select(
      "id, employee_id, employee:employees!staff_payroll_items_employee_id_fkey(user_id)",
    )
    .eq("staff_payroll_run_id", runId);

  if (error) {
    logOpsServerError(error, {
      module: "staff_payroll",
      action: "notifyStaffOfReleasedPayslips",
      entityId: runId,
    });
    return;
  }

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    employee_id: string;
    employee: { user_id: string | null } | Array<{ user_id: string | null }> | null;
  }>;

  let notified = 0;
  let withoutLogin = 0;

  await Promise.all(
    rows.map(async (row) => {
      const employee = Array.isArray(row.employee) ? row.employee[0] : row.employee;
      const userId = employee?.user_id ?? null;
      if (!userId) {
        withoutLogin += 1;
        return;
      }

      notified += 1;
      await queueOpsNotification({
        actionHref: "/ops/profile#my-payslips",
        body: `Your payslip has been approved and is ready to download. Approved by ${actorName}.`,
        // Keyed per payslip so re-approving cannot spam anyone.
        idempotencyKey: `staff-payslip-released:${row.id}`,
        moduleKey: "staff_payroll",
        recipientId: userId,
        sourceId: row.id,
        sourceTable: "staff_payroll_items",
        title: "Your payslip is ready",
      }).catch(
        swallowOpsError({
          module: "staff_payroll",
          action: "notifyStaffOfReleasedPayslips",
          entityId: row.id,
        }),
      );
    }),
  );

  await recordOpsAuditEvent({
    action: "staff_payroll_run.payslips_released",
    entityId: runId,
    entityType: "staff_payroll_run",
    metadata: {
      payslips: rows.length,
      notified,
      employees_without_login: withoutLogin,
    },
    moduleKey: "staff_payroll",
    sourceId: runId,
    sourceTable: "staff_payroll_runs",
    summary: `${notified} of ${rows.length} employees notified that their payslip is available`,
  }).catch(
    swallowOpsError({ module: "staff_payroll", action: "notifyStaffOfReleasedPayslips.audit" }),
  );
}

/** Mark an approved run as paid. */
export async function completeStaffPayrollRunAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  if (!canManageOpsStaffPayroll(profile.role)) {
    staffPayrollError("Your role cannot mark staff payroll runs paid.");
  }
  const parsed = runIdSchema.safeParse({ id: field(formData, "id") });
  if (!parsed.success) {
    staffPayrollError("Select a staff payroll run.");
  }
  const supabase = getOpsSupabaseServiceClient();

  // One transaction for the run status, every line item's payout status, and
  // the audit row (audit finding R1). Previously these were three separate
  // PostgREST calls: a failure or timeout between them left the run marked
  // paid while its items were not, with nothing recording which half landed.
  //
  // It also closes a quieter bug. The old code guarded with
  // `.eq("status", "approved")`, but PostgREST does not error when an UPDATE
  // matches zero rows — so completing a draft or an already-completed run did
  // nothing to the run and then marked every item 'sent' anyway. The status
  // check now happens in SQL, against a locked row.
  const { data: completion, error } = await supabase
    .rpc("ops_complete_staff_payroll_run", {
      p_run_id: parsed.data.id,
      p_actor_id: profile.id,
    })
    .single<{ status: string; items_marked: number }>();

  if (error) {
    staffPayrollError(error.message);
  }

  if (completion?.status === "not_found") {
    staffPayrollError("That staff payroll run no longer exists.");
  }

  if (completion?.status === "not_approved") {
    staffPayrollError("Only an approved staff payroll run can be marked paid.");
  }

  // `already_completed` is not an error — it is what a retry after a timeout
  // looks like. Fall through so the payslip emails below still go out; they
  // are idempotent, so a genuine duplicate press costs nothing.

  // Post to the general ledger and the cost spine. Staff payroll did neither
  // until now: `postPayrollRunJournalSafe` only ever handled the casual
  // engine, so a completed staff run left no accounting trace at all.
  //
  // Both are best-effort and both are idempotent — the run is already marked
  // paid above, and neither a GL outage nor a ledger hiccup may roll back a
  // disbursement that has happened.
  await postStaffPayrollRunJournalSafe(parsed.data.id, profile.id);

  const { data: runTotals } = await supabase
    .from("staff_payroll_runs")
    .select("period_label, total_gross")
    .eq("id", parsed.data.id)
    .maybeSingle<{ period_label: string; total_gross: number | string | null }>();

  if (runTotals) {
    const { data: employerRows } = await supabase
      .from("staff_payroll_items")
      .select("napsa_employer, nhima_employer, wcf_employer")
      .eq("staff_payroll_run_id", parsed.data.id);

    const employerStatutory = (
      (employerRows ?? []) as Array<{
        napsa_employer: number | string | null;
        nhima_employer: number | string | null;
        wcf_employer: number | string | null;
      }>
    ).reduce(
      (sum, row) =>
        sum +
        Number(row.napsa_employer ?? 0) +
        Number(row.nhima_employer ?? 0) +
        Number(row.wcf_employer ?? 0),
      0,
    );

    await writeStaffPayrollCostEntry({
      actorUserId: profile.id,
      costDate: new Date().toISOString().slice(0, 10),
      // Cost to company, not net pay — the employer burden is real money.
      employerCost: Number(runTotals.total_gross ?? 0) + employerStatutory,
      periodLabel: runTotals.period_label,
      runId: parsed.data.id,
    }).catch(() => null);
  }

  // Email each person their own payslip (audit §10). Marked paid is the right
  // trigger: it is the point at which the money has actually moved, so the
  // message ("your salary has been paid") is true when it arrives.
  //
  // Best-effort and never awaited into a failure: payroll has already been
  // marked paid in the database above, and an email provider outage must not
  // roll that back or block the redirect. The outcome is recorded so HR can
  // see who was missed.
  const emailOutcome = await sendStaffPayslipEmailsForRun({
    runId: parsed.data.id,
    actorUserId: profile.id,
  }).catch((emailError: unknown) => {
    logOpsServerError(emailError, {
      module: "staff_payroll",
      action: "completeStaffPayrollRunAction.payslipEmails",
      entityId: parsed.data.id,
    });
    return null;
  });

  if (emailOutcome) {
    await recordOpsAuditEvent({
      action: "staff_payroll_run.payslips_emailed",
      actorUserId: profile.id,
      entityId: parsed.data.id,
      entityType: "staff_payroll_run",
      metadata: {
        sent: emailOutcome.sent,
        skipped_no_email: emailOutcome.skippedNoEmail.length,
        skipped_shared_mailbox: emailOutcome.skippedSharedMailbox.length,
        shared_mailbox_names: emailOutcome.skippedSharedMailbox.map(
          (entry) => `${entry.employeeNumber} ${entry.fullName} (${entry.address})`,
        ),
        failed: emailOutcome.failed.length,
        not_configured: emailOutcome.notConfigured,
        // Named, because "3 people did not get their payslip" is only
        // actionable if HR knows which three.
        skipped_names: emailOutcome.skippedNoEmail.map(
          (entry) => `${entry.employeeNumber} ${entry.fullName}`,
        ),
      },
      moduleKey: "staff_payroll",
      sourceId: parsed.data.id,
      sourceTable: "staff_payroll_runs",
      summary: emailOutcome.notConfigured
        ? "Payslip emails skipped — email is not configured"
        : `Emailed ${emailOutcome.sent} payslip(s)${
            emailOutcome.skippedNoEmail.length > 0
              ? `, ${emailOutcome.skippedNoEmail.length} skipped with no email on record`
              : ""
          }${
            emailOutcome.skippedSharedMailbox.length > 0
              ? `, ${emailOutcome.skippedSharedMailbox.length} skipped (shared mailbox — needs a personal address)`
              : ""
          }${emailOutcome.failed.length > 0 ? `, ${emailOutcome.failed.length} failed` : ""}`,
    }).catch(() => null);
  }
  await notifyOpsWorkflowEvent({
    actorId: profile.id,
    actionNeededRoles: ["finance_manager", "accountant"],
    oversightRoles: ["managing_director"],
    title: "Staff payroll run completed",
    body: `${profile.full_name} completed a staff payroll run — salaries disbursed and posted.`,
    actionHref: STAFF_PAYROLL_ROUTE,
    moduleKey: "staff_payroll",
    sourceTable: "staff_payroll_runs",
    sourceId: parsed.data.id,
    eventKey: "completed",
    category: "info",
  });

  revalidatePath(STAFF_PAYROLL_ROUTE);
  redirect(`${STAFF_PAYROLL_ROUTE}?updated=completed`);
}

/** Delete an unpaid run. Paid payroll is immutable and cannot be deleted. */
export async function deleteStaffPayrollRunAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  if (!canManageOpsStaffPayroll(profile.role)) {
    staffPayrollError("Your role cannot delete staff payroll runs.");
  }
  const parsed = runIdSchema.safeParse({ id: field(formData, "id") });
  if (!parsed.success) {
    staffPayrollError("Select a staff payroll run.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data: archivedRun, error } = await supabase
    .from("staff_payroll_runs")
    .update({ archived_at: new Date().toISOString(), archived_by: profile.id })
    .eq("id", parsed.data.id)
    .in("status", ["draft", "approved"])
    .is("archived_at", null)
    .select("id")
    .maybeSingle<{ id: string }>();
  if (error || !archivedRun) {
    staffPayrollError(error?.message ?? "Only an unpaid payroll run can be deleted.");
  }

  // A draft's advances have not been paid, so make them available to the next run.
  const { error: advanceError } = await supabase
    .from("staff_advances")
    .update({ deducted_in_run_id: null })
    .eq("deducted_in_run_id", parsed.data.id);
  if (advanceError) {
    staffPayrollError(advanceError.message);
  }

  await recordOpsAuditEvent({
    action: "staff_payroll_run.deleted",
    actorUserId: profile.id,
    entityId: parsed.data.id,
    entityType: "staff_payroll_run",
    moduleKey: "staff_payroll",
    sourceId: parsed.data.id,
    sourceTable: "staff_payroll_runs",
    summary: "Deleted unpaid staff payroll run and released its advances",
  }).catch(() => null);

  revalidatePath(STAFF_PAYROLL_ROUTE);
  redirect(`${STAFF_PAYROLL_ROUTE}?updated=deleted`);
}

// Keep the old server-action name available for any callers outside the page.
export const archiveStaffPayrollRunAction = deleteStaffPayrollRunAction;

/** Edit one line of an approved run. Paid runs are intentionally immutable. */
export async function editStaffPayrollItemAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  if (!canManageOpsStaffPayroll(profile.role)) {
    staffPayrollError("Your role cannot edit staff payroll runs.");
  }

  const parsed = staffPayrollItemEditSchema.safeParse({
    item_id: field(formData, "item_id"),
    basic_pay: field(formData, "basic_pay"),
    housing_allowance: field(formData, "housing_allowance"),
    other_allowances: field(formData, "other_allowances"),
  });
  if (!parsed.success) {
    staffPayrollError(parsed.error.issues[0]?.message ?? "Check the payroll item.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data: item, error: itemError } = await supabase
    .from("staff_payroll_items")
    .select("id, staff_payroll_run_id, employee_id, advance_deduction")
    .eq("id", parsed.data.item_id)
    .maybeSingle<{
      id: string;
      staff_payroll_run_id: string;
      employee_id: string;
      advance_deduction: number | string | null;
    }>();
  if (itemError || !item) {
    staffPayrollError(itemError?.message ?? "That payroll item no longer exists.");
  }

  const { data: run, error: runError } = await supabase
    .from("staff_payroll_runs")
    .select("id, status, period_end")
    .eq("id", item.staff_payroll_run_id)
    .maybeSingle<{ id: string; status: string; period_end: string }>();
  if (runError || !run) {
    staffPayrollError(runError?.message ?? "That payroll run no longer exists.");
  }
  if (run.status !== "approved") {
    staffPayrollError("Only an approved, unpaid payroll run can be edited.");
  }

  const { data: employee, error: employeeError } = await supabase
    .from("employees")
    .select("statutory_contributions_enabled")
    .eq("id", item.employee_id)
    .maybeSingle<{ statutory_contributions_enabled: boolean | null }>();
  if (employeeError) {
    staffPayrollError(employeeError.message);
  }

  const slip = computeStaffPayslip({
    basic: parsed.data.basic_pay,
    housing: parsed.data.housing_allowance,
    otherAllowances: parsed.data.other_allowances,
    // Preserve any advance already attached to this run. Editing pay must not
    // silently forgive an advance that was already deducted.
    advanceDeduction: Number(item.advance_deduction ?? 0),
    periodDate: run.period_end,
    statutoryContributionsEnabled: employee?.statutory_contributions_enabled !== false,
  });

  const { error: updateError } = await supabase
    .from("staff_payroll_items")
    .update({
      basic_pay: slip.basic,
      housing_allowance: slip.housing,
      other_allowances: slip.otherAllowances,
      gross_pay: slip.gross,
      paye_amount: slip.paye,
      napsa_employee: slip.napsaEmployee,
      napsa_employer: slip.napsaEmployer,
      nhima_employee: slip.nhimaEmployee,
      nhima_employer: slip.nhimaEmployer,
      wcf_employer: slip.wcfEmployer,
      net_pay: slip.net,
      tax_year: slip.taxYear,
      statutory_citation: slip.citation,
    })
    .eq("id", item.id)
    .eq("staff_payroll_run_id", run.id);
  if (updateError) {
    staffPayrollError(updateError.message);
  }

  const { data: items, error: totalsError } = await supabase
    .from("staff_payroll_items")
    .select("basic_pay, gross_pay, advance_deduction, net_pay")
    .eq("staff_payroll_run_id", run.id);
  if (totalsError) {
    staffPayrollError(totalsError.message);
  }
  const totals = ((items ?? []) as Array<Record<string, number | string | null>>).reduce<{
    basic: number;
    gross: number;
    advances: number;
    net: number;
  }>(
    (sum, row) => ({
      basic: sum.basic + Number(row.basic_pay ?? 0),
      gross: sum.gross + Number(row.gross_pay ?? 0),
      advances: sum.advances + Number(row.advance_deduction ?? 0),
      net: sum.net + Number(row.net_pay ?? 0),
    }),
    { basic: 0, gross: 0, advances: 0, net: 0 },
  );
  const { error: totalsUpdateError } = await supabase
    .from("staff_payroll_runs")
    .update({
      total_basic: totals.basic,
      total_gross: totals.gross,
      total_advances: totals.advances,
      total_net: totals.net,
    })
    .eq("id", run.id)
    .eq("status", "approved");
  if (totalsUpdateError) {
    staffPayrollError(totalsUpdateError.message);
  }

  await recordOpsAuditEvent({
    action: "staff_payroll_item.edited",
    actorUserId: profile.id,
    entityId: item.id,
    entityType: "staff_payroll_item",
    metadata: { staff_payroll_run_id: run.id },
    moduleKey: "staff_payroll",
    sourceId: run.id,
    sourceTable: "staff_payroll_runs",
    summary: "Edited an approved staff payroll item",
  }).catch(() => null);

  revalidatePath(STAFF_PAYROLL_ROUTE);
  redirect(`${STAFF_PAYROLL_ROUTE}?updated=edited`);
}

export async function createStaffAdvanceAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  if (!canManageOpsStaffPayroll(profile.role)) {
    staffPayrollError("Your role cannot record staff advances.");
  }
  const parsed = advanceSchema.safeParse({
    employee_id: field(formData, "employee_id"),
    amount: field(formData, "amount"),
    note: field(formData, "note"),
    issued_at: field(formData, "issued_at"),
  });
  if (!parsed.success) {
    staffPayrollError(parsed.error.issues[0]?.message ?? "Check the advance.");
  }
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("staff_advances")
    .insert({
      employee_id: parsed.data.employee_id,
      amount: parsed.data.amount,
      note: parsed.data.note,
      issued_at: parsed.data.issued_at,
      created_by: profile.id,
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) {
    staffPayrollError(error?.message ?? "The advance could not be recorded.");
  }
  await recordOpsAuditEvent({
    action: "staff_advance.created",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "staff_advance",
    metadata: { amount: parsed.data.amount, employee_id: parsed.data.employee_id },
    moduleKey: "staff_payroll",
    sourceId: data.id,
    sourceTable: "staff_advances",
    summary: "Recorded staff advance",
  }).catch(() => null);
  revalidatePath(STAFF_PAYROLL_ROUTE);
  redirect(`${STAFF_PAYROLL_ROUTE}?created=advance`);
}

export async function archiveStaffAdvanceAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  if (!canManageOpsStaffPayroll(profile.role)) {
    staffPayrollError("Your role cannot archive staff advances.");
  }
  const parsed = advanceIdSchema.safeParse({ id: field(formData, "id") });
  if (!parsed.success) {
    staffPayrollError("Select an advance.");
  }
  const supabase = getOpsSupabaseServiceClient();
  // Only archive advances that haven't been deducted yet.
  const { error } = await supabase
    .from("staff_advances")
    .update({ archived_at: new Date().toISOString(), archived_by: profile.id })
    .eq("id", parsed.data.id)
    .is("deducted_in_run_id", null);
  if (error) {
    staffPayrollError(error.message);
  }
  revalidatePath(STAFF_PAYROLL_ROUTE);
  redirect(`${STAFF_PAYROLL_ROUTE}?updated=advance_archived`);
}

/** Update bank details for a staff employee (finance use). */
export async function updateStaffBankDetailsAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  if (!canManageOpsStaffPayroll(profile.role)) {
    staffPayrollError("Your role cannot update staff bank details.");
  }

  const parsed = bankDetailsSchema.safeParse({
    employee_id: field(formData, "employee_id"),
    bank_name: field(formData, "bank_name"),
    bank_branch: field(formData, "bank_branch"),
    bank_account_number: field(formData, "bank_account_number"),
  });
  if (!parsed.success) {
    staffPayrollError(parsed.error.issues[0]?.message ?? "Check the bank details.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("employees")
    .update({
      bank_name: parsed.data.bank_name,
      bank_branch: parsed.data.bank_branch,
      bank_account_number: parsed.data.bank_account_number,
    })
    .eq("id", parsed.data.employee_id)
    .eq("status", "active");
  if (error) staffPayrollError(error.message);

  await recordOpsAuditEvent({
    action: "employee.bank_details_updated",
    actorUserId: profile.id,
    entityId: parsed.data.employee_id,
    entityType: "employee",
    metadata: { bank_name: parsed.data.bank_name },
    moduleKey: "staff_payroll",
    sourceId: parsed.data.employee_id,
    sourceTable: "employees",
    summary: "Updated bank details for an employee",
  }).catch(() => null);

  revalidatePath(STAFF_PAYROLL_ROUTE);
  redirect(`${STAFF_PAYROLL_ROUTE}?updated=bank_details`);
}
