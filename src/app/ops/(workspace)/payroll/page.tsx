import {
  BadgeDollarSign,
  Banknote,
  Check,
  CircleDollarSign,
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
import { requireOpsUser } from "@/lib/ops/auth";
import {
  approvePayrollRunAction,
  completePayrollRunAction,
  createCashAdvanceAction,
  createPayrollRunAction,
} from "@/lib/ops/payroll-actions";
import { fetchOpsCashAdvances, fetchOpsPayrollRuns, type OpsPayrollRun } from "@/lib/ops/payroll";
import { canAccessOpsHref, canManageOps } from "@/lib/ops/permissions";
import { fetchAttendanceWorkerOptions } from "@/lib/ops/attendance";
import {
  firstParam,
  formatZmw,
  noticeFromParams,
  OPS_INPUT_CLASS,
  OPS_LABEL_CLASS,
  OPS_PRIMARY_BUTTON_CLASS,
  OPS_SECONDARY_BUTTON_CLASS,
  OPS_TABLE_SCROLL_CLASS,
  type OpsSearchParams,
} from "@/lib/ops/ui";

type PageProps = {
  searchParams?: Promise<OpsSearchParams>;
};

function todayInLusaka() {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Africa/Lusaka",
    year: "numeric",
  }).format(new Date());
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-ZM", {
    dateStyle: "medium",
    timeZone: "Africa/Lusaka",
  }).format(new Date(`${value}T00:00:00+02:00`));
}

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

  return null;
}

function statusClass(status: OpsPayrollRun["status"]) {
  if (status === "completed") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "approved" || status === "disbursing") {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }

  return "border-orange-200 bg-orange-50 text-orange-700";
}

export default async function OpsPayrollPage({ searchParams }: PageProps) {
  const [params, auth] = await Promise.all([searchParams ?? Promise.resolve({}), requireOpsUser()]);

  if (!canAccessOpsHref(auth.profile.role, "/ops/payroll")) {
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
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="rounded-lg border border-primary-dark/10 bg-white p-5 md:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-blue">
              Pymble Payroll
            </p>
            <h1 className="mt-2 font-heading text-3xl font-bold text-primary-dark">
              Payroll loop
            </h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-primary-dark/68">
              Convert approved attendance into payroll runs, deduct open cash advances, and track
              payout status.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-md border border-primary-dark/10 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-dark/45">
                Open advances
              </p>
              <p className="mt-1 font-heading text-2xl font-bold text-primary-dark">
                {formatZmw(openAdvanceTotal)}
              </p>
            </div>
            <div className="rounded-md border border-primary-dark/10 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-dark/45">
                Draft runs
              </p>
              <p className="mt-1 font-heading text-2xl font-bold text-primary-dark">{draftRuns}</p>
            </div>
            <div className="rounded-md border border-primary-dark/10 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-dark/45">
                Latest net
              </p>
              <p className="mt-1 font-heading text-2xl font-bold text-primary-dark">
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

      {canManage ? (
        <section className="grid gap-5 xl:grid-cols-2">
          <div className="rounded-lg border border-primary-dark/10 bg-white p-5">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-md bg-primary-blue text-white">
                <Plus className="size-5" aria-hidden="true" />
              </div>
              <div>
                <h2 className="font-heading text-xl font-bold text-primary-dark">
                  Record cash advance
                </h2>
                <p className="text-sm text-primary-dark/60">
                  Open advances are deducted from the next payroll run.
                </p>
              </div>
            </div>
            {workerOptions.length === 0 ? (
              <div className="rounded-md border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
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

          <div className="rounded-lg border border-primary-dark/10 bg-white p-5">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-md bg-primary-blue text-white">
                <ReceiptText className="size-5" aria-hidden="true" />
              </div>
              <div>
                <h2 className="font-heading text-xl font-bold text-primary-dark">
                  Create payroll run
                </h2>
                <p className="text-sm text-primary-dark/60">
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
        <div className="rounded-md border border-primary-dark/10 bg-white px-4 py-3 text-sm text-primary-dark/65">
          Your role does not have payroll management permissions. Contact your manager to request
          access.
        </div>
      )}

      <section className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
        <div className="rounded-lg border border-primary-dark/10 bg-white">
          <div className="border-b border-primary-dark/10 p-5">
            <h2 className="font-heading text-xl font-bold text-primary-dark">Cash advances</h2>
          </div>
          <div className="divide-y divide-primary-dark/10">
            {advances.length > 0 ? (
              advances.map((advance) => (
                <div className="flex items-start gap-3 p-5" key={advance.id}>
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary-dark text-white">
                    <Banknote className="size-4" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="font-bold text-primary-dark">
                          {advance.worker?.full_name ?? "Worker record unavailable"}
                        </p>
                        <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-primary-dark/45">
                          {advance.worker?.worker_code ?? "Worker code unavailable"} -{" "}
                          {formatDate(advance.issued_at)}
                        </p>
                      </div>
                      <p className="font-heading text-lg font-bold text-primary-dark">
                        {formatZmw(advance.amount)}
                      </p>
                    </div>
                    <p className="mt-2 text-sm text-primary-dark/62">
                      {advance.note || "Advance note not recorded"}
                    </p>
                    <span
                      className={`mt-3 inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${
                        advance.deducted_in_run_id
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-orange-200 bg-orange-50 text-orange-700"
                      }`}
                    >
                      {advance.deducted_in_run_id ? "Deducted" : "Open"}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center">
                <Banknote className="mx-auto size-10 text-primary-blue" aria-hidden="true" />
                <p className="mt-3 font-heading text-xl font-bold text-primary-dark">
                  No cash advances recorded
                </p>
                <p className="mt-2 text-sm text-primary-dark/60">
                  Cash advances will appear here after they are recorded.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-primary-dark/10 bg-white">
          <div className="border-b border-primary-dark/10 p-5">
            <h2 className="font-heading text-xl font-bold text-primary-dark">Payroll runs</h2>
          </div>
          <div className="divide-y divide-primary-dark/10">
            {payrollRuns.length > 0 ? (
              payrollRuns.map((run) => (
                <div className="p-5" key={run.id}>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="font-heading text-lg font-bold text-primary-dark">
                        {run.period_label}
                      </p>
                      <p className="mt-1 text-sm text-primary-dark/60">
                        {formatDate(run.period_start)} - {formatDate(run.period_end)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${statusClass(run.status)}`}
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

                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <div className="rounded-md border border-primary-dark/10 px-3 py-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary-dark/45">
                        Gross
                      </p>
                      <p className="mt-1 font-bold text-primary-dark">
                        {formatZmw(run.total_gross)}
                      </p>
                    </div>
                    <div className="rounded-md border border-primary-dark/10 px-3 py-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary-dark/45">
                        Advances
                      </p>
                      <p className="mt-1 font-bold text-primary-dark">
                        {formatZmw(run.total_advances)}
                      </p>
                    </div>
                    <div className="rounded-md border border-primary-dark/10 px-3 py-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary-dark/45">
                        Net
                      </p>
                      <p className="mt-1 font-bold text-primary-dark">
                        {formatZmw(run.total_net)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 md:hidden">
                    <OpsMobileRecordList>
                      {run.line_items.map((item) => (
                        <OpsMobileRecordCard key={item.id}>
                          <div>
                            <p className="font-heading text-lg font-bold text-primary-dark">
                              {item.worker?.full_name ?? "Worker record unavailable"}
                            </p>
                            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-primary-dark/45">
                              {item.worker?.worker_code ?? "Worker code unavailable"}
                            </p>
                          </div>
                          <OpsMobileRecordRow label="Gross">
                            {formatZmw(item.gross_pay)}
                          </OpsMobileRecordRow>
                          <OpsMobileRecordRow label="Deducted">
                            {formatZmw(item.advance_deduction)}
                          </OpsMobileRecordRow>
                          <OpsMobileRecordRow label="Net">
                            {formatZmw(item.net_pay)}
                          </OpsMobileRecordRow>
                          <OpsMobileRecordRow label="Payout">
                            <span className="inline-flex rounded-full border border-primary-dark/10 bg-primary-dark/[0.03] px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-primary-dark/70">
                              {item.payout_status}
                            </span>
                            <p className="mt-1 text-xs text-primary-dark/50">
                              {item.payout_reference ?? "Awaiting payout reference"}
                            </p>
                          </OpsMobileRecordRow>
                        </OpsMobileRecordCard>
                      ))}
                    </OpsMobileRecordList>
                  </div>
                  <div
                    aria-label={`${run.period_label} payroll line items table`}
                    className={`mt-4 hidden rounded-md border border-primary-dark/10 md:block ${OPS_TABLE_SCROLL_CLASS}`}
                    tabIndex={0}
                  >
                    <table className="min-w-full divide-y divide-primary-dark/10 text-sm">
                      <caption className="sr-only">
                        Payroll line items for {run.period_label}, including gross pay,
                        deductions, net pay, and payout status.
                      </caption>
                      <thead className="bg-primary-dark/[0.03] text-left text-xs uppercase tracking-[0.12em] text-primary-dark/52">
                        <tr>
                          <th className="px-4 py-3" scope="col">
                            Worker
                          </th>
                          <th className="px-4 py-3" scope="col">
                            Gross
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
                      <tbody className="divide-y divide-primary-dark/10">
                        {run.line_items.map((item) => (
                          <tr key={item.id}>
                            <td className="px-4 py-3">
                              <p className="font-bold text-primary-dark">
                                {item.worker?.full_name ?? "Worker record unavailable"}
                              </p>
                              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary-dark/45">
                                {item.worker?.worker_code ?? "Worker code unavailable"}
                              </p>
                            </td>
                            <td className="px-4 py-3 text-primary-dark/70">
                              {formatZmw(item.gross_pay)}
                            </td>
                            <td className="px-4 py-3 text-primary-dark/70">
                              {formatZmw(item.advance_deduction)}
                            </td>
                            <td className="px-4 py-3 font-semibold text-primary-dark">
                              <span className="inline-flex items-center gap-2">
                                <BadgeDollarSign className="size-4 text-primary-blue" aria-hidden="true" />
                                {formatZmw(item.net_pay)}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="inline-flex rounded-full border border-primary-dark/10 bg-primary-dark/[0.03] px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-primary-dark/70">
                                {item.payout_status}
                              </span>
                              <p className="mt-1 text-xs text-primary-dark/50">
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
                <p className="mt-3 font-heading text-xl font-bold text-primary-dark">
                  No payroll runs yet
                </p>
                <p className="mt-2 text-sm text-primary-dark/60">
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
