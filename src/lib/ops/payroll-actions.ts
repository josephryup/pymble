"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeOpsActionErrorMessage } from "@/lib/ops/action-errors";
import { createOpsServerSessionClient, requireOpsUser } from "@/lib/ops/auth";
import { postPayrollRunJournalSafe } from "@/lib/ops/gl-posting";
import { writeCasualPayrollCostEntries } from "@/lib/ops/payroll-cost-entries";
import { canManagePayrollRun } from "@/lib/ops/permissions";
import { notifyOpsWorkflowEvent } from "@/lib/ops/workflow-notifications";
import { computePayslip } from "@/lib/ops/statutory/calculator";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const cashAdvanceSchema = z.object({
  worker_id: z.string().uuid("Select a Pymble worker."),
  amount: z.coerce.number().positive("Advance amount must be greater than zero."),
  note: z.string().trim().max(160).default(""),
  issued_at: dateSchema,
});

const payrollRunSchema = z
  .object({
    period_label: z.string().trim().min(3, "Period label is required.").max(80),
    period_start: dateSchema,
    period_end: dateSchema,
  })
  .refine((value) => value.period_end >= value.period_start, {
    message: "Period end must be the same day or later than the start date.",
    path: ["period_end"],
  });

const payrollRunIdSchema = z.object({
  id: z.string().uuid("Select a payroll run."),
});

type AttendanceForPayroll = {
  id: string;
  worker_id: string;
  amount_earned: number | string;
  overtime_hours: number | string;
  overtime_amount: number | string;
};

type CashAdvanceForPayroll = {
  id: string;
  worker_id: string;
  amount: number | string;
};

type PayrollItemForPayout = {
  id: string;
  worker_id: string;
  worker: { worker_code: string | null } | { worker_code: string | null }[] | null;
};

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function payrollError(message: string): never {
  redirect(`/ops/payroll?error=${encodeURIComponent(safeOpsActionErrorMessage(message))}`);
}

function roundToTwo(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function getPeriodRange(periodStart: string, periodEnd: string) {
  return {
    endIso: new Date(`${periodEnd}T23:59:59.999+02:00`).toISOString(),
    startIso: new Date(`${periodStart}T00:00:00+02:00`).toISOString(),
  };
}

function payoutWorkerCode(worker: PayrollItemForPayout["worker"], fallback: string) {
  const normalized = Array.isArray(worker) ? (worker[0] ?? null) : worker;
  return (normalized?.worker_code ?? fallback.slice(0, 4)).toUpperCase();
}

export async function createCashAdvanceAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canManagePayrollRun(profile.role)) {
    payrollError("Your role cannot record cash advances yet.");
  }

  const parsed = cashAdvanceSchema.safeParse({
    worker_id: field(formData, "worker_id"),
    amount: field(formData, "amount"),
    note: field(formData, "note"),
    issued_at: field(formData, "issued_at"),
  });

  if (!parsed.success) {
    payrollError(parsed.error.issues[0]?.message ?? "Check the cash advance details.");
  }

  const supabase = await createOpsServerSessionClient();
  const { data, error } = await supabase
    .from("cash_advances")
    .insert({
      worker_id: parsed.data.worker_id,
      amount: roundToTwo(parsed.data.amount),
      note: parsed.data.note,
      issued_at: parsed.data.issued_at,
      created_by: profile.id,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !data) {
    payrollError(error?.message ?? "The cash advance could not be recorded.");
  }

  await supabase.from("audit_events").insert({
    actor_user_id: profile.id,
    action: "cash_advance.created",
    entity_type: "cash_advance",
    entity_id: data.id,
    metadata: {
      amount: parsed.data.amount,
      worker_id: parsed.data.worker_id,
    },
  });

  revalidatePath("/ops/payroll");
  redirect("/ops/payroll?created=advance");
}

export async function createPayrollRunAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canManagePayrollRun(profile.role)) {
    payrollError("Your role cannot create payroll runs yet.");
  }

  const parsed = payrollRunSchema.safeParse({
    period_label: field(formData, "period_label"),
    period_start: field(formData, "period_start"),
    period_end: field(formData, "period_end"),
  });

  if (!parsed.success) {
    payrollError(parsed.error.issues[0]?.message ?? "Check the payroll period.");
  }

  const { startIso, endIso } = getPeriodRange(parsed.data.period_start, parsed.data.period_end);
  const supabase = await createOpsServerSessionClient();
  const { data: attendanceData, error: attendanceError } = await supabase
    .from("attendance_records")
    .select("id, worker_id, amount_earned, overtime_hours, overtime_amount")
    .eq("is_active", true)
    .not("approved_at", "is", null)
    .is("payroll_run_id", null)
    .gte("clock_in_at", startIso)
    .lte("clock_in_at", endIso);

  if (attendanceError) {
    payrollError(attendanceError.message);
  }

  const approvedRecords = (attendanceData ?? []) as AttendanceForPayroll[];

  if (!approvedRecords.length) {
    payrollError("Approved attendance is not available for that payroll period.");
  }

  const workerIds = [...new Set(approvedRecords.map((record) => record.worker_id))];
  const { data: advanceData, error: advanceError } = await supabase
    .from("cash_advances")
    .select("id, worker_id, amount")
    .is("deducted_in_run_id", null)
    .is("archived_at", null)
    .in("worker_id", workerIds);

  if (advanceError) {
    payrollError(advanceError.message);
  }

  const openAdvances = (advanceData ?? []) as CashAdvanceForPayroll[];
  const lineItems = workerIds.map((workerId) => {
    const workerRecords = approvedRecords.filter(
      (record) => record.worker_id === workerId,
    );
    const grossPay = roundToTwo(
      workerRecords.reduce((sum, record) => sum + Number(record.amount_earned), 0),
    );
    const overtimeHours = roundToTwo(
      workerRecords.reduce(
        (sum, record) => sum + Number(record.overtime_hours ?? 0),
        0,
      ),
    );
    const overtimeAmount = roundToTwo(
      workerRecords.reduce(
        (sum, record) => sum + Number(record.overtime_amount ?? 0),
        0,
      ),
    );
    const advanceDeduction = roundToTwo(
      openAdvances
        .filter((advance) => advance.worker_id === workerId)
        .reduce((sum, advance) => sum + Number(advance.amount), 0),
    );

    // Apply Zambian statutory deductions (PAYE / NAPSA / WCF) per the rule
    // set for the payroll period. Numbers are stored on the row so payslips
    // and historical replays are stable.
    const statutory = computePayslip(grossPay, parsed.data.period_end);
    const netPay = roundToTwo(
      Math.max(statutory.gross - statutory.totalEmployeeDeductions - advanceDeduction, 0),
    );

    return {
      advance_deduction: advanceDeduction,
      gross_pay: grossPay,
      net_pay: netPay,
      paye_amount: statutory.paye,
      napsa_employee: statutory.napsaEmployee,
      napsa_employer: statutory.napsaEmployer,
      wcf_employer: statutory.wcfEmployer,
      overtime_hours: overtimeHours,
      overtime_amount: overtimeAmount,
      tax_year: statutory.taxYear,
      statutory_citation: statutory.citation,
      payout_status: "pending" as const,
      worker_id: workerId,
    };
  });

  const totalGross = roundToTwo(lineItems.reduce((sum, item) => sum + item.gross_pay, 0));
  const totalAdvances = roundToTwo(
    lineItems.reduce((sum, item) => sum + item.advance_deduction, 0),
  );
  const totalNet = roundToTwo(lineItems.reduce((sum, item) => sum + item.net_pay, 0));

  const { data: createdRun, error: runError } = await supabase
    .from("payroll_runs")
    .insert({
      period_label: parsed.data.period_label,
      period_start: parsed.data.period_start,
      period_end: parsed.data.period_end,
      status: "draft",
      total_gross: totalGross,
      total_advances: totalAdvances,
      total_net: totalNet,
      created_by: profile.id,
    })
    .select("id")
    .single<{ id: string }>();

  if (runError || !createdRun) {
    payrollError(runError?.message ?? "The payroll run could not be created.");
  }

  const { error: itemsError } = await supabase.from("payroll_run_items").insert(
    lineItems.map((item) => ({
      payroll_run_id: createdRun.id,
      ...item,
    })),
  );

  if (itemsError) {
    payrollError(itemsError.message);
  }

  const { data: claimedAttendance, error: attendanceUpdateError } = await supabase
    .from("attendance_records")
    .update({ payroll_run_id: createdRun.id })
    .is("payroll_run_id", null)
    .in(
      "id",
      approvedRecords.map((record) => record.id),
    )
    .select("id");

  if (attendanceUpdateError) {
    payrollError(attendanceUpdateError.message);
  }

  if ((claimedAttendance?.length ?? 0) !== approvedRecords.length) {
    // A concurrent (or double-submitted) payroll run claimed some of this
    // attendance between our read and this write. Roll back the run we just
    // created so the same attendance is never paid in two runs, then ask the
    // operator to retry. The `payroll_run_id IS NULL` guard above guarantees we
    // only ever claim still-unpaid rows, so releasing ours is safe.
    await supabase
      .from("attendance_records")
      .update({ payroll_run_id: null })
      .eq("payroll_run_id", createdRun.id);
    await supabase.from("payroll_run_items").delete().eq("payroll_run_id", createdRun.id);
    await supabase.from("payroll_runs").delete().eq("id", createdRun.id);
    payrollError(
      "Some attendance was already included in another payroll run. No changes were saved — please retry.",
    );
  }

  if (openAdvances.length > 0) {
    const { error: advancesUpdateError } = await supabase
      .from("cash_advances")
      .update({ deducted_in_run_id: createdRun.id })
      .is("deducted_in_run_id", null)
      .in(
        "id",
        openAdvances.map((advance) => advance.id),
      );

    if (advancesUpdateError) {
      payrollError(advancesUpdateError.message);
    }
  }

  await supabase.from("audit_events").insert({
    actor_user_id: profile.id,
    action: "payroll_run.created",
    entity_type: "payroll_run",
    entity_id: createdRun.id,
    metadata: {
      period_label: parsed.data.period_label,
      total_advances: totalAdvances,
      total_gross: totalGross,
      total_net: totalNet,
    },
  });

  await notifyOpsWorkflowEvent({
    actorId: profile.id,
    actionNeededRoles: ["managing_director", "general_manager"],
    title: `Approve payroll run: ${parsed.data.period_label}`,
    body: `${profile.full_name} prepared the ${parsed.data.period_label} workers payroll run (net ZMW ${totalNet.toLocaleString("en-ZM")}). Approval needed before disbursement.`,
    actionHref: "/ops/payroll",
    moduleKey: "payroll",
    sourceTable: "payroll_runs",
    sourceId: createdRun.id,
    eventKey: "created",
  });

  revalidatePath("/ops");
  revalidatePath("/ops/attendance");
  revalidatePath("/ops/payroll");
  redirect("/ops/payroll?created=payroll");
}

export async function approvePayrollRunAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canManagePayrollRun(profile.role)) {
    payrollError("Your role cannot approve payroll runs yet.");
  }

  const parsed = payrollRunIdSchema.safeParse({ id: field(formData, "id") });

  if (!parsed.success) {
    payrollError(parsed.error.issues[0]?.message ?? "Select a payroll run.");
  }

  const supabase = await createOpsServerSessionClient();
  const { data, error } = await supabase
    .from("payroll_runs")
    .update({
      approved_at: new Date().toISOString(),
      approved_by: profile.id,
      status: "approved",
    })
    .eq("id", parsed.data.id)
    .eq("status", "draft")
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error || !data) {
    payrollError(error?.message ?? "Only draft payroll runs can be approved.");
  }

  await supabase.from("audit_events").insert({
    actor_user_id: profile.id,
    action: "payroll_run.approved",
    entity_type: "payroll_run",
    entity_id: data.id,
  });

  await notifyOpsWorkflowEvent({
    actorId: profile.id,
    actionNeededRoles: ["finance_manager", "accountant"],
    title: "Payroll run approved — ready to disburse",
    body: `${profile.full_name} approved a workers payroll run. Complete it to record the disbursement.`,
    actionHref: "/ops/payroll",
    moduleKey: "payroll",
    sourceTable: "payroll_runs",
    sourceId: data.id,
    eventKey: "approved",
  });

  revalidatePath("/ops/payroll");
  redirect("/ops/payroll?updated=approved");
}

export async function completePayrollRunAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canManagePayrollRun(profile.role)) {
    payrollError("Your role cannot mark payroll as paid yet.");
  }

  const parsed = payrollRunIdSchema.safeParse({ id: field(formData, "id") });

  if (!parsed.success) {
    payrollError(parsed.error.issues[0]?.message ?? "Select a payroll run.");
  }

  const supabase = await createOpsServerSessionClient();
  const { data: run, error: runLoadError } = await supabase
    .from("payroll_runs")
    .select("id, status, period_label")
    .eq("id", parsed.data.id)
    .single<{ id: string; status: string; period_label: string }>();

  if (runLoadError || !run) {
    payrollError(runLoadError?.message ?? "Payroll run not found.");
  }

  if (run.status !== "approved") {
    payrollError("Only approved payroll runs can be marked as paid.");
  }

  const { data: itemData, error: itemsLoadError } = await supabase
    .from("payroll_run_items")
    .select("id, worker_id, worker:workers!payroll_run_items_worker_id_fkey(worker_code)")
    .eq("payroll_run_id", run.id);

  if (itemsLoadError) {
    payrollError(itemsLoadError.message);
  }

  const items = (itemData ?? []) as unknown as PayrollItemForPayout[];

  const payoutUpdates = await Promise.all(
    items.map((item) =>
      supabase
        .from("payroll_run_items")
        .update({
          payout_reference: `SIM-${run.id.slice(0, 6).toUpperCase()}-${payoutWorkerCode(
            item.worker,
            item.worker_id,
          )}`,
          payout_status: "sent",
        })
        .eq("id", item.id),
    ),
  );
  const payoutError = payoutUpdates.find((result) => result.error)?.error;

  if (payoutError) {
    payrollError(payoutError.message);
  }

  const { error: updateError } = await supabase
    .from("payroll_runs")
    .update({
      disbursed_at: new Date().toISOString(),
      disbursed_by: profile.id,
      status: "completed",
    })
    .eq("id", run.id)
    .eq("status", "approved");

  if (updateError) {
    payrollError(updateError.message);
  }

  await postPayrollRunJournalSafe(run.id, profile.id);

  // Labour into the cost spine (D2 step 1). Split across sites by attendance,
  // with no budget line — see payroll-cost-entries.ts. Best-effort: the run is
  // already paid, so a ledger hiccup must not undo a disbursement.
  await writeCasualPayrollCostEntries({
    actorUserId: profile.id,
    costDate: new Date().toISOString().slice(0, 10),
    periodLabel: run.period_label,
    runId: run.id,
  }).catch(() => null);

  await supabase.from("audit_events").insert({
    actor_user_id: profile.id,
    action: "payroll_run.completed",
    entity_type: "payroll_run",
    entity_id: run.id,
    module_key: "payroll",
    source_table: "payroll_runs",
    source_id: run.id,
  });

  await notifyOpsWorkflowEvent({
    actorId: profile.id,
    actionNeededRoles: ["finance_manager", "accountant"],
    oversightRoles: ["managing_director"],
    title: "Payroll run disbursed",
    body: `${profile.full_name} completed a workers payroll run — wages disbursed and posted to the ledger.`,
    actionHref: "/ops/payroll",
    moduleKey: "payroll",
    sourceTable: "payroll_runs",
    sourceId: run.id,
    eventKey: "completed",
    category: "info",
  });

  revalidatePath("/ops");
  revalidatePath("/ops/payroll");
  redirect("/ops/payroll?updated=paid");
}

// =============================================================================
// J4: Cancel / archive / delete actions for payroll runs.
// Reuses the existing `payrollRunIdSchema` and `payrollError` helpers above.
// =============================================================================

async function fetchPayrollRunStatus(runId: string) {
  const supabase = await createOpsServerSessionClient();
  const { data, error } = await supabase
    .from("payroll_runs")
    .select("id, status")
    .eq("id", runId)
    .maybeSingle<{ id: string; status: "draft" | "approved" | "disbursing" | "completed" }>();
  if (error) {
    throw error;
  }
  return data;
}

export async function cancelPayrollRunAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (
    profile.role !== "managing_director" &&
    profile.role !== "owner" &&
    profile.role !== "developer"
  ) {
    payrollError("Only the Managing Director or Developer can cancel a payroll run.");
  }

  const parsed = payrollRunIdSchema.safeParse({ id: field(formData, "id") });
  if (!parsed.success) {
    payrollError(parsed.error.issues[0]?.message ?? "Select a payroll run.");
  }

  const run = await fetchPayrollRunStatus(parsed.data.id);
  if (!run) {
    payrollError("Payroll run was not found.");
  }
  if (run.status === "completed" || run.status === "disbursing") {
    payrollError("A payroll run that has been disbursed cannot be cancelled.");
  }

  const supabase = await createOpsServerSessionClient();
  // Detach worker cash advances first so they can be re-included next time.
  await supabase
    .from("cash_advances")
    .update({ payroll_run_id: null })
    .eq("deducted_in_run_id", run.id);

  const { error } = await supabase
    .from("payroll_runs")
    .update({ cancelled_at: new Date().toISOString(), cancelled_by: profile.id })
    .eq("id", run.id);
  if (error) {
    payrollError(error.message);
  }

  await supabase.from("audit_events").insert({
    actor_user_id: profile.id,
    action: "payroll_run.cancelled",
    entity_type: "payroll_run",
    entity_id: run.id,
    module_key: "payroll",
    source_table: "payroll_runs",
    source_id: run.id,
  });

  revalidatePath("/ops/payroll");
  redirect("/ops/payroll?updated=cancelled");
}

export async function archivePayrollRunAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (
    profile.role !== "managing_director" &&
    profile.role !== "owner" &&
    profile.role !== "developer"
  ) {
    payrollError("Only the Managing Director or Developer can archive a payroll run.");
  }

  const parsed = payrollRunIdSchema.safeParse({ id: field(formData, "id") });
  if (!parsed.success) {
    payrollError(parsed.error.issues[0]?.message ?? "Select a payroll run.");
  }

  const run = await fetchPayrollRunStatus(parsed.data.id);
  if (!run) {
    payrollError("Payroll run was not found.");
  }
  if (run.status !== "completed") {
    payrollError("Payroll runs can only be archived once completed.");
  }

  const supabase = await createOpsServerSessionClient();
  const { error } = await supabase
    .from("payroll_runs")
    .update({ archived_at: new Date().toISOString(), archived_by: profile.id })
    .eq("id", run.id);
  if (error) {
    payrollError(error.message);
  }

  await supabase.from("audit_events").insert({
    actor_user_id: profile.id,
    action: "payroll_run.archived",
    entity_type: "payroll_run",
    entity_id: run.id,
    module_key: "payroll",
    source_table: "payroll_runs",
    source_id: run.id,
  });

  revalidatePath("/ops/payroll");
  redirect("/ops/payroll?updated=archived");
}

export async function deletePayrollRunAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (profile.role !== "developer") {
    payrollError("Only the Developer can permanently delete a payroll run.");
  }

  const parsed = payrollRunIdSchema.safeParse({ id: field(formData, "id") });
  if (!parsed.success) {
    payrollError(parsed.error.issues[0]?.message ?? "Select a payroll run.");
  }

  const supabase = await createOpsServerSessionClient();
  await supabase
    .from("cash_advances")
    .update({ payroll_run_id: null, deducted_in_run_id: null })
    .eq("deducted_in_run_id", parsed.data.id);
  await supabase.from("payroll_run_items").delete().eq("payroll_run_id", parsed.data.id);

  const { error } = await supabase
    .from("payroll_runs")
    .delete()
    .eq("id", parsed.data.id);
  if (error) {
    payrollError(error.message);
  }

  await supabase.from("audit_events").insert({
    actor_user_id: profile.id,
    action: "payroll_run.deleted",
    entity_type: "payroll_run",
    entity_id: parsed.data.id,
    module_key: "payroll",
    source_table: "payroll_runs",
    source_id: parsed.data.id,
  });

  revalidatePath("/ops/payroll");
  redirect("/ops/payroll?updated=deleted");
}

const cashAdvanceIdSchema = z.object({
  id: z.string().uuid("Select a cash advance."),
});

export async function archiveCashAdvanceAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canManagePayrollRun(profile.role)) {
    payrollError("Your role cannot archive cash advances.");
  }

  const parsed = cashAdvanceIdSchema.safeParse({ id: field(formData, "id") });
  if (!parsed.success) {
    payrollError(parsed.error.issues[0]?.message ?? "Select a cash advance.");
  }

  const supabase = await createOpsServerSessionClient();
  const { data: advance, error: loadError } = await supabase
    .from("cash_advances")
    .select("id, deducted_in_run_id")
    .eq("id", parsed.data.id)
    .maybeSingle<{ id: string; deducted_in_run_id: string | null }>();

  if (loadError || !advance) {
    payrollError("Cash advance was not found.");
  }

  if (advance.deducted_in_run_id) {
    payrollError("This advance has already been deducted in a payroll run and cannot be archived.");
  }

  const { error } = await supabase
    .from("cash_advances")
    .update({ archived_at: new Date().toISOString(), archived_by: profile.id })
    .eq("id", advance.id)
    .is("deducted_in_run_id", null);

  if (error) {
    payrollError(error.message);
  }

  await supabase.from("audit_events").insert({
    actor_user_id: profile.id,
    action: "cash_advance.archived",
    entity_type: "cash_advance",
    entity_id: advance.id,
    module_key: "payroll",
    source_table: "cash_advances",
    source_id: advance.id,
  });

  revalidatePath("/ops/payroll");
  redirect("/ops/payroll?updated=advance_archived");
}

const updateCashAdvanceSchema = cashAdvanceIdSchema.merge(cashAdvanceSchema);

export async function updateCashAdvanceAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canManagePayrollRun(profile.role)) {
    payrollError("Your role cannot edit cash advances.");
  }

  const parsed = updateCashAdvanceSchema.safeParse({
    id: field(formData, "id"),
    worker_id: field(formData, "worker_id"),
    amount: field(formData, "amount"),
    note: field(formData, "note"),
    issued_at: field(formData, "issued_at"),
  });

  if (!parsed.success) {
    payrollError(parsed.error.issues[0]?.message ?? "Check the cash advance details.");
  }

  const supabase = await createOpsServerSessionClient();
  const { data: advance, error: loadError } = await supabase
    .from("cash_advances")
    .select("id, deducted_in_run_id, archived_at")
    .eq("id", parsed.data.id)
    .maybeSingle<{ id: string; deducted_in_run_id: string | null; archived_at: string | null }>();

  if (loadError || !advance) {
    payrollError("Cash advance was not found.");
  }

  if (advance.deducted_in_run_id) {
    payrollError("This advance has already been deducted in a payroll run and can no longer be edited.");
  }

  if (advance.archived_at) {
    payrollError("Restore this advance before editing it.");
  }

  const { error } = await supabase
    .from("cash_advances")
    .update({
      worker_id: parsed.data.worker_id,
      amount: roundToTwo(parsed.data.amount),
      note: parsed.data.note,
      issued_at: parsed.data.issued_at,
    })
    .eq("id", advance.id)
    .is("deducted_in_run_id", null);

  if (error) {
    payrollError(error.message);
  }

  await supabase.from("audit_events").insert({
    actor_user_id: profile.id,
    action: "cash_advance.updated",
    entity_type: "cash_advance",
    entity_id: advance.id,
    module_key: "payroll",
    source_table: "cash_advances",
    source_id: advance.id,
    metadata: { amount: parsed.data.amount, worker_id: parsed.data.worker_id },
  });

  revalidatePath("/ops/payroll");
  redirect("/ops/payroll?updated=advance_updated");
}

const updatePayrollRunSchema = payrollRunIdSchema.extend({
  period_label: z.string().trim().min(3, "Period label is required.").max(80),
});

export async function updatePayrollRunAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canManagePayrollRun(profile.role)) {
    payrollError("Your role cannot edit payroll runs.");
  }

  const parsed = updatePayrollRunSchema.safeParse({
    id: field(formData, "id"),
    period_label: field(formData, "period_label"),
  });

  if (!parsed.success) {
    payrollError(parsed.error.issues[0]?.message ?? "Check the payroll run details.");
  }

  const run = await fetchPayrollRunStatus(parsed.data.id);

  if (!run) {
    payrollError("Payroll run was not found.");
  }

  // Amounts are computed from approved attendance, so only the label is editable
  // and only while the run is still a draft.
  if (run.status !== "draft") {
    payrollError("Only draft payroll runs can be edited.");
  }

  const supabase = await createOpsServerSessionClient();
  const { error } = await supabase
    .from("payroll_runs")
    .update({ period_label: parsed.data.period_label })
    .eq("id", run.id)
    .eq("status", "draft");

  if (error) {
    payrollError(error.message);
  }

  await supabase.from("audit_events").insert({
    actor_user_id: profile.id,
    action: "payroll_run.updated",
    entity_type: "payroll_run",
    entity_id: run.id,
    module_key: "payroll",
    source_table: "payroll_runs",
    source_id: run.id,
    metadata: { period_label: parsed.data.period_label },
  });

  revalidatePath("/ops/payroll");
  redirect("/ops/payroll?updated=run_updated");
}
