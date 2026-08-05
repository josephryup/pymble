import {
  BadgeDollarSign,
  Banknote,
  Check,
  CircleDollarSign,
  Pencil,
  Plus,
  ReceiptText,
  Send,
} from "lucide-react";
import { notFound } from "next/navigation";
import { OpsConfirmSubmitButton } from "@/components/ops/OpsConfirmSubmitButton";
import {
  OpsMobileRecordCard,
  OpsMobileRecordList,
  OpsMobileRecordRow,
} from "@/components/ops/OpsMobileRecord";
import { fetchOpsModuleAccessOverrides } from "@/lib/ops/module-access";
import { requireOpsUser } from "@/lib/ops/auth";
import {
  approvePayrollRunAction,
  archiveCashAdvanceAction,
  completePayrollRunAction,
  createCashAdvanceAction,
  createPayrollRunAction,
  updateCashAdvanceAction,
  updatePayrollRunAction,
} from "@/lib/ops/payroll-actions";
import { fetchOpsCashAdvances, fetchOpsPayrollRuns } from "@/lib/ops/payroll";
import { OPS_CHART_COLORS, OpsTrendChart } from "@/components/ops/OpsAnalyticsCharts";
import { canAccessOpsHref, canManageOps } from "@/lib/ops/permissions";
import { fetchAttendanceWorkerOptions } from "@/lib/ops/attendance";
import {
  firstParam,
  formatZmw,
  noticeFromParams,
  OPS_DANGER_BUTTON_CLASS,
  OPS_INPUT_CLASS,
  OPS_LABEL_CLASS,
  OPS_PRIMARY_BUTTON_CLASS,
  OPS_SECONDARY_BUTTON_CLASS,
  OPS_TABLE_SCROLL_CLASS,
  type OpsSearchParams,
  OPS_NOTICE_WARNING_CLASS,
  opsStatusBadgeClass,
} from "@/lib/ops/ui";
import { todayInLusaka, formatOpsDate as formatDate } from "@/lib/ops/format";

type PageProps = {
  searchParams?: Promise<OpsSearchParams>;
};

function payrollNotice(params: OpsSearchParams) {
  const createdAdvance = noticeFromParams(
    params,
    "advance",
    "Cash advance recorded successfully.",
  );

  if (createdAdvance) {
    return createdAdvance;
  }

  const createdPayroll = noticeFromParams(
    params,
    "payroll",
    "Payroll run created from approved attendance.",
  );

  if (createdPayroll) {
    return createdPayroll;
  }

  if (firstParam(params.updated) === "approved") {
    return {
      tone: "success" as const,
      message: "Payroll run approved.",
    };
  }

  if (firstParam(params.updated) === "paid") {
    return {
      tone: "success" as const,
      message: "Payroll run marked as paid.",
    };
  }

  if (firstParam(params.updated) === "advance_archived") {
    return {
      tone: "success" as const,
      message: "Cash advance archived.",
    };
  }

  if (firstParam(params.updated) === "advance_updated") {
    return { tone: "success" as const, message: "Cash advance updated." };
  }

  if (firstParam(params.updated) === "run_updated") {
    return { tone: "success" as const, message: "Payroll run updated." };
  }

  return null;
}

export default async function OpsPayrollPage({ searchParams }: PageProps) {
  const [params, auth] = await Promise.all([searchParams ?? Promise.resolve({}), requireOpsUser()]);

  if (!canAccessOpsHref(auth.profile.role, "/ops/payroll", await fetchOpsModuleAccessOverrides())) {
    notFound();
  }

  const [advances, payrollRuns, workerOptions] = await Promise.all([
    fetchOpsCashAdvances(),
    fetchOpsPayrollRuns(),
    fetchAttendanceWorkerOptions(),
  ]);
  const canManage = canManageOps(auth.profile.role);
  const notice = payrollNotice(params);
  const openAdvances = advances.filter((advance) => !advance.deducted_in_run_id);
  const openAdvanceTotal = openAdvances.reduce((sum, advance) => sum + advance.amount, 0);
  const draftRuns = payrollRuns.filter((run) => run.status === "draft").length;
  const latestNet = payrollRuns[0]?.total_net ?? 0;

  return (
    <div className="w-full max-w-none space-y-6">
      <section className="rounded-lg border border-border bg-card p-5 md:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-blue">
              Pymble Payroll
            </p>
            <h1 className="mt-2 font-heading text-3xl font-bold text-foreground">
              Payroll loop
            </h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-foreground/68">
              Convert approved attendance into payroll runs, deduct open cash advances, and track
              payout status.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-md border border-border px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Open advances
              </p>
              <p className="mt-1 font-heading text-2xl font-bold text-foreground">
                {formatZmw(openAdvanceTotal)}
              </p>
            </div>
            <div className="rounded-md border border-border px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Draft runs
              </p>
              <p className="mt-1 font-heading text-2xl font-bold text-foreground">{draftRuns}</p>
            </div>
            <div className="rounded-md border border-border px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Latest net
              </p>
              <p className="mt-1 font-heading text-2xl font-bold text-foreground">
                {formatZmw(latestNet)}
              </p>
            </div>
          </div>
        </div>
      </section>

      {notice ? (
        <div
          className={`rounded-md border px-4 py-3 text-sm font-semibold ${
            notice.tone === "error"
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
          role={notice.tone === "error" ? "alert" : "status"}
        >
          {notice.message}
        </div>
      ) : null}

      {payrollRuns.length > 1 ? (
        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="font-heading text-xl font-bold text-foreground">
            Payroll run trend
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Gross pay, advance deductions and net payout per run (oldest to latest, last 12 runs).
          </p>
          <div className="mt-4">
            <OpsTrendChart
              ariaLabel="Gross, advances and net totals per payroll run"
              points={payrollRuns
                .slice(0, 12)
                .reverse()
                .map((run) => ({
                  label: run.period_label,
                  gross: run.total_gross,
                  advances: run.total_advances,
                  net: run.total_net,
                }))}
              series={[
                { key: "gross", label: "Gross", color: OPS_CHART_COLORS.blue, kind: "bar" },
                { key: "advances", label: "Advances", color: OPS_CHART_COLORS.amber, kind: "bar" },
                { key: "net", label: "Net", color: OPS_CHART_COLORS.emerald, kind: "line" },
              ]}
              valueKind="zmw"
            />
          </div>
        </section>
      ) : null}

      {canManage ? (
        <section className="grid gap-5 xl:grid-cols-2">
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-md bg-primary-blue text-white">
                <Plus className="size-5" aria-hidden="true" />
              </div>
              <div>
                <h2 className="font-heading text-xl font-bold text-foreground">
                  Record cash advance
                </h2>
                <p className="text-sm text-muted-foreground">
                  Open advances are deducted from the next payroll run.
                </p>
              </div>
            </div>
            {workerOptions.length === 0 ? (
              <div className={OPS_NOTICE_WARNING_CLASS}>
                Add at least one worker before recording advances.
              </div>
            ) : (
              <form action={createCashAdvanceAction} className="grid gap-4 md:grid-cols-2">
                <label className={`${OPS_LABEL_CLASS} md:col-span-2`}>
                  Worker
                  <select className={OPS_INPUT_CLASS} defaultValue="" name="worker_id" required>
                    <option value="" disabled>
                      Select Pymble worker
                    </option>
                    {workerOptions.map((worker) => (
                      <option key={worker.id} value={worker.id}>
                        {worker.worker_code} - {worker.full_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Amount
                  <input
                    className={OPS_INPUT_CLASS}
                    min="1"
                    name="amount"
                    required
                    step="0.01"
                    type="number"
                  />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Issued at
                  <input
                    className={OPS_INPUT_CLASS}
                    defaultValue={todayInLusaka()}
                    name="issued_at"
                    required
                    type="date"
                  />
                </label>
                <label className={`${OPS_LABEL_CLASS} md:col-span-2`}>
                  Note
                  <input className={OPS_INPUT_CLASS} name="note" />
                </label>
                <button
                  className={`${OPS_PRIMARY_BUTTON_CLASS} md:col-span-2`}
                  type="submit"
                >
                  <Plus className="size-4" aria-hidden="true" />
                  Record advance
                </button>
              </form>
            )}
          </div>

          <div className="rounded-lg border border-border bg-card p-5">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-md bg-primary-blue text-white">
                <ReceiptText className="size-5" aria-hidden="true" />
              </div>
              <div>
                <h2 className="font-heading text-xl font-bold text-foreground">
                  Create payroll run
                </h2>
                <p className="text-sm text-muted-foreground">
                  Uses approved attendance that is not already in payroll.
                </p>
              </div>
            </div>
            <form action={createPayrollRunAction} className="grid gap-4 md:grid-cols-2">
              <label className={`${OPS_LABEL_CLASS} md:col-span-2`}>
                Period label
                <input
                  className={OPS_INPUT_CLASS}
                  name="period_label"
                  required
                />
              </label>
              <label className={OPS_LABEL_CLASS}>
                Period start
                <input className={OPS_INPUT_CLASS} name="period_start" required type="date" />
              </label>
              <label className={OPS_LABEL_CLASS}>
                Period end
                <input className={OPS_INPUT_CLASS} name="period_end" required type="date" />
              </label>
              <button
                className={`${OPS_PRIMARY_BUTTON_CLASS} md:col-span-2`}
                type="submit"
              >
                <ReceiptText className="size-4" aria-hidden="true" />
                Create run
              </button>
            </form>
          </div>
        </section>
      ) : (
        <div className="rounded-md border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          Your role does not have payroll management permissions. Contact your manager to request
          access.
        </div>
      )}

      <section className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
        <div className="rounded-lg border border-border bg-card">
          <div className="border-b border-border p-5">
            <h2 className="font-heading text-xl font-bold text-foreground">Cash advances</h2>
          </div>
          <div className="divide-y divide-border">
            {advances.length > 0 ? (
              advances.map((advance) => (
                <div className="flex items-start gap-3 p-5" key={advance.id}>
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary-dark text-white">
                    <Banknote className="size-4" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="font-bold text-foreground">
                          {advance.worker?.full_name ?? "Worker record unavailable"}
                        </p>
                        <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                          {advance.worker?.worker_code ?? "Worker code unavailable"} -{" "}
                          {formatDate(advance.issued_at)}
                        </p>
                      </div>
                      <p className="font-heading text-lg font-bold text-foreground">
                        {formatZmw(advance.amount)}
                      </p>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {advance.note || "Advance note not recorded"}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${
                          advance.deducted_in_run_id
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-orange-200 bg-orange-50 text-orange-700"
                        }`}
                      >
                        {advance.deducted_in_run_id ? "Deducted" : "Open"}
                      </span>
                      {canManage && !advance.deducted_in_run_id ? (
                        <form action={archiveCashAdvanceAction}>
                          <input name="id" type="hidden" value={advance.id} />
                          <OpsConfirmSubmitButton
                            className={OPS_DANGER_BUTTON_CLASS}
                            confirmText="Confirm archive"
                          >
                            Archive
                          </OpsConfirmSubmitButton>
                        </form>
                      ) : null}
                    </div>
                    {canManage && !advance.deducted_in_run_id ? (
                      <details className="mt-3 rounded-md border border-border">
                        <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-bold text-foreground transition hover:text-primary-blue [&::-webkit-details-marker]:hidden">
                          <Pencil className="size-4" aria-hidden="true" />
                          Edit advance
                        </summary>
                        <form
                          action={updateCashAdvanceAction}
                          className="grid gap-3 border-t border-border p-3 md:grid-cols-2"
                        >
                          <input name="id" type="hidden" value={advance.id} />
                          <label className={OPS_LABEL_CLASS}>
                            Worker
                            <select
                              className={OPS_INPUT_CLASS}
                              defaultValue={advance.worker_id}
                              name="worker_id"
                              required
                            >
                              {workerOptions.map((worker) => (
                                <option key={worker.id} value={worker.id}>
                                  {worker.worker_code} - {worker.full_name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className={OPS_LABEL_CLASS}>
                            Amount (ZMW)
                            <input
                              className={OPS_INPUT_CLASS}
                              defaultValue={String(advance.amount)}
                              min="0.01"
                              name="amount"
                              required
                              step="0.01"
                              type="number"
                            />
                          </label>
                          <label className={OPS_LABEL_CLASS}>
                            Issued on
                            <input
                              className={OPS_INPUT_CLASS}
                              defaultValue={advance.issued_at}
                              name="issued_at"
                              required
                              type="date"
                            />
                          </label>
                          <label className={OPS_LABEL_CLASS}>
                            Note
                            <input
                              className={OPS_INPUT_CLASS}
                              defaultValue={advance.note}
                              name="note"
                            />
                          </label>
                          <div className="md:col-span-2">
                            <button className={OPS_SECONDARY_BUTTON_CLASS} type="submit">
                              <Pencil className="size-4" aria-hidden="true" />
                              Save changes
                            </button>
                          </div>
                        </form>
                      </details>
                    ) : null}
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center">
                <Banknote className="mx-auto size-10 text-primary-blue" aria-hidden="true" />
                <p className="mt-3 font-heading text-xl font-bold text-foreground">
                  No cash advances recorded
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Cash advances will appear here after they are recorded.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card">
          <div className="border-b border-border p-5">
            <h2 className="font-heading text-xl font-bold text-foreground">Payroll runs</h2>
          </div>
          <div className="divide-y divide-border">
            {payrollRuns.length > 0 ? (
              payrollRuns.map((run) => (
                <div className="p-5" key={run.id}>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="font-heading text-lg font-bold text-foreground">
                        {run.period_label}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {formatDate(run.period_start)} - {formatDate(run.period_end)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span
                        className={opsStatusBadgeClass(run.status)}
                      >
                        {run.status}
                      </span>
                      {canManage && run.status === "draft" ? (
                        <form action={approvePayrollRunAction}>
                          <input name="id" type="hidden" value={run.id} />
                          <OpsConfirmSubmitButton
                            className={OPS_SECONDARY_BUTTON_CLASS}
                            confirmText="Confirm approval"
                          >
                            <Check className="size-3" aria-hidden="true" />
                            Approve
                          </OpsConfirmSubmitButton>
                        </form>
                      ) : null}
                      {canManage && run.status === "approved" ? (
                        <form action={completePayrollRunAction}>
                          <input name="id" type="hidden" value={run.id} />
                          <OpsConfirmSubmitButton
                            className={OPS_PRIMARY_BUTTON_CLASS}
                            confirmText="Confirm paid"
                          >
                            <Send className="size-3" aria-hidden="true" />
                            Mark paid
                          </OpsConfirmSubmitButton>
                        </form>
                      ) : null}
                    </div>
                  </div>

                  {canManage && run.status === "draft" ? (
                    <details className="mt-3 rounded-md border border-border">
                      <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-bold text-foreground transition hover:text-primary-blue [&::-webkit-details-marker]:hidden">
                        <Pencil className="size-4" aria-hidden="true" />
                        Edit period label
                      </summary>
                      <form
                        action={updatePayrollRunAction}
                        className="flex flex-col gap-3 border-t border-border p-3 sm:flex-row sm:items-end"
                      >
                        <input name="id" type="hidden" value={run.id} />
                        <label className={`${OPS_LABEL_CLASS} flex-1`}>
                          Period label
                          <input
                            className={OPS_INPUT_CLASS}
                            defaultValue={run.period_label}
                            maxLength={80}
                            name="period_label"
                            required
                          />
                        </label>
                        <button className={OPS_SECONDARY_BUTTON_CLASS} type="submit">
                          <Pencil className="size-4" aria-hidden="true" />
                          Save
                        </button>
                      </form>
                    </details>
                  ) : null}

                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <div className="rounded-md border border-border px-3 py-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        Gross
                      </p>
                      <p className="mt-1 font-bold text-foreground">
                        {formatZmw(run.total_gross)}
                      </p>
                    </div>
                    <div className="rounded-md border border-border px-3 py-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        Advances
                      </p>
                      <p className="mt-1 font-bold text-foreground">
                        {formatZmw(run.total_advances)}
                      </p>
                    </div>
                    <div className="rounded-md border border-border px-3 py-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        Net
                      </p>
                      <p className="mt-1 font-bold text-foreground">
                        {formatZmw(run.total_net)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 md:hidden">
                    <OpsMobileRecordList>
                      {run.line_items.map((item) => (
                        <OpsMobileRecordCard key={item.id}>
                          <div>
                            <p className="font-heading text-lg font-bold text-foreground">
                              {item.worker?.full_name ?? "Worker record unavailable"}
                            </p>
                            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                              {item.worker?.worker_code ?? "Worker code unavailable"}
                            </p>
                          </div>
                          <OpsMobileRecordRow label="Gross">
                            {formatZmw(item.gross_pay)}
                          </OpsMobileRecordRow>
                          {item.overtime_hours > 0 ? (
                            <OpsMobileRecordRow label="OT Hours">
                              {item.overtime_hours}h
                            </OpsMobileRecordRow>
                          ) : null}
                          {item.overtime_amount > 0 ? (
                            <OpsMobileRecordRow label="OT Pay">
                              {formatZmw(item.overtime_amount)}
                            </OpsMobileRecordRow>
                          ) : null}
                          <OpsMobileRecordRow label="Deducted">
                            {formatZmw(item.advance_deduction)}
                          </OpsMobileRecordRow>
                          <OpsMobileRecordRow label="Net">
                            {formatZmw(item.net_pay)}
                          </OpsMobileRecordRow>
                          <OpsMobileRecordRow label="Payout">
                            <span className="inline-flex rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-foreground/70">
                              {item.payout_status}
                            </span>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {item.payout_reference ?? "Awaiting payout reference"}
                            </p>
                          </OpsMobileRecordRow>
                        </OpsMobileRecordCard>
                      ))}
                    </OpsMobileRecordList>
                  </div>
                  <div
                    aria-label={`${run.period_label} payroll line items table`}
                    className={`mt-4 hidden rounded-md border border-border md:block ${OPS_TABLE_SCROLL_CLASS}`}
                    tabIndex={0}
                  >
                    <table className="min-w-full divide-y divide-border text-sm">
                      <caption className="sr-only">
                        Payroll line items for {run.period_label}, including gross pay,
                        deductions, net pay, and payout status.
                      </caption>
                      <thead className="bg-muted/40 text-left text-xs uppercase tracking-[0.12em] text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3" scope="col">
                            Worker
                          </th>
                          <th className="px-4 py-3" scope="col">
                            Gross
                          </th>
                          <th className="px-4 py-3" scope="col">
                            OT Hours
                          </th>
                          <th className="px-4 py-3" scope="col">
                            OT Pay
                          </th>
                          <th className="px-4 py-3" scope="col">
                            Deducted
                          </th>
                          <th className="px-4 py-3" scope="col">
                            Net
                          </th>
                          <th className="px-4 py-3" scope="col">
                            Payout
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {run.line_items.map((item) => (
                          <tr key={item.id}>
                            <td className="px-4 py-3">
                              <p className="font-bold text-foreground">
                                {item.worker?.full_name ?? "Worker record unavailable"}
                              </p>
                              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                                {item.worker?.worker_code ?? "Worker code unavailable"}
                              </p>
                            </td>
                            <td className="px-4 py-3 text-foreground/70">
                              {formatZmw(item.gross_pay)}
                            </td>
                            <td className="px-4 py-3 text-foreground/70">
                              {item.overtime_hours > 0 ? `${item.overtime_hours}h` : "—"}
                            </td>
                            <td className="px-4 py-3 text-foreground/70">
                              {item.overtime_amount > 0 ? formatZmw(item.overtime_amount) : "—"}
                            </td>
                            <td className="px-4 py-3 text-foreground/70">
                              {formatZmw(item.advance_deduction)}
                            </td>
                            <td className="px-4 py-3 font-semibold text-foreground">
                              <span className="inline-flex items-center gap-2">
                                <BadgeDollarSign className="size-4 text-primary-blue" aria-hidden="true" />
                                {formatZmw(item.net_pay)}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="inline-flex rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-foreground/70">
                                {item.payout_status}
                              </span>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {item.payout_reference ?? "Awaiting payout reference"}
                              </p>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center">
                <CircleDollarSign className="mx-auto size-10 text-primary-blue" aria-hidden="true" />
                <p className="mt-3 font-heading text-xl font-bold text-foreground">
                  No payroll runs yet
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Payroll runs will appear here after approved attendance is processed.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
