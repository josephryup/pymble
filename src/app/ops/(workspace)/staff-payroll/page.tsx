import {
  Banknote,
  Check,
  CircleDollarSign,
  Download,
  Plus,
  Send,
} from "lucide-react";
import { notFound } from "next/navigation";
import { OpsConfirmSubmitButton } from "@/components/ops/OpsConfirmSubmitButton";
import { OpsEmptyState } from "@/components/ops/OpsEmptyState";
import { OpsPageHeader } from "@/components/ops/OpsPageHeader";
import { requireOpsUser } from "@/lib/ops/auth";
import { canAccessOpsHref } from "@/lib/ops/permissions";
import {
  canManageOpsStaffPayroll,
  canViewOpsStaffPayroll,
  fetchOpsStaffAdvances,
  fetchOpsStaffPayrollRuns,
  type OpsStaffPayrollRun,
} from "@/lib/ops/staff-payroll";
import {
  approveStaffPayrollRunAction,
  archiveStaffAdvanceAction,
  completeStaffPayrollRunAction,
  createStaffAdvanceAction,
  createStaffPayrollRunAction,
} from "@/lib/ops/staff-payroll-actions";
import {
  firstParam,
  formatZmw,
  OPS_DANGER_BUTTON_CLASS,
  OPS_INPUT_CLASS,
  OPS_LABEL_CLASS,
  OPS_PRIMARY_BUTTON_CLASS,
  OPS_SECONDARY_BUTTON_CLASS,
  type OpsSearchParams,
} from "@/lib/ops/ui";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<OpsSearchParams>;
};

function statusClass(status: OpsStaffPayrollRun["status"]) {
  if (status === "completed") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "approved") return "border-sky-200 bg-sky-50 text-sky-700";
  if (status === "disbursing") return "border-orange-200 bg-orange-50 text-orange-700";
  return "border-primary-dark/15 bg-primary-dark/[0.04] text-primary-dark/65";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const slice = value.length >= 10 ? value.slice(0, 10) : value;
  const parsed = new Date(`${slice}T00:00:00+02:00`);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("en-ZM", {
    dateStyle: "medium",
    timeZone: "Africa/Lusaka",
  }).format(parsed);
}

function pageNotice(params: OpsSearchParams) {
  const created = firstParam(params.created);
  const updated = firstParam(params.updated);
  const error = firstParam(params.error);
  if (error) return { tone: "error" as const, message: error };
  if (created === "run") return { tone: "success" as const, message: "Staff payroll run created." };
  if (created === "advance") return { tone: "success" as const, message: "Staff advance recorded." };
  if (updated === "approved") return { tone: "success" as const, message: "Staff payroll run approved." };
  if (updated === "completed") return { tone: "success" as const, message: "Staff payroll run marked paid." };
  if (updated === "advance_archived") return { tone: "success" as const, message: "Staff advance archived." };
  return null;
}

export default async function OpsStaffPayrollPage({ searchParams }: PageProps) {
  const params = (await (searchParams ?? Promise.resolve({} as OpsSearchParams))) ?? {};
  const { profile } = await requireOpsUser();
  if (!canAccessOpsHref(profile.role, "/ops/staff-payroll") || !canViewOpsStaffPayroll(profile.role)) {
    notFound();
  }

  const canManage = canManageOpsStaffPayroll(profile.role);
  const [runs, advances] = await Promise.all([
    fetchOpsStaffPayrollRuns(),
    fetchOpsStaffAdvances(),
  ]);
  const notice = pageNotice(params);
  const openAdvances = advances.filter((advance) => !advance.deducted_in_run_id);
  const employeeOptions = Array.from(
    new Map(
      advances.flatMap((advance) =>
        advance.employee ? [[advance.employee.id, advance.employee] as const] : [],
      ),
    ).values(),
  );

  return (
    <div className="w-full max-w-none space-y-6">
      <OpsPageHeader
        eyebrow="Payroll"
        title="Staff payroll"
        description="Monthly staff payslips driven by contract pay structure (basic + housing + allowances), with statutory ZRA / NAPSA / NHIMA deductions."
      />

      {notice ? (
        <div
          className={`rounded-md border px-4 py-3 text-sm font-medium ${
            notice.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
          role={notice.tone === "error" ? "alert" : "status"}
        >
          {notice.message}
        </div>
      ) : null}

      {canManage ? (
        <section className="rounded-lg border border-primary-dark/10 bg-white p-5">
          <div className="mb-4 flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-md bg-primary-blue text-white">
              <Plus className="size-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-heading text-xl font-bold text-primary-dark">
                Generate a payroll run
              </h2>
              <p className="text-sm text-primary-dark/60">
                One line item is generated for every active employee with an active contract.
                Open staff advances are deducted automatically.
              </p>
            </div>
          </div>
          <form action={createStaffPayrollRunAction} className="grid gap-3 md:grid-cols-4">
            <label className={OPS_LABEL_CLASS}>
              Period label
              <input
                className={OPS_INPUT_CLASS}
                maxLength={80}
                name="period_label"
                placeholder="e.g. August 2025"
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
            <div className="flex items-end">
              <button className={`${OPS_PRIMARY_BUTTON_CLASS} w-full`} type="submit">
                <Banknote className="size-4" aria-hidden="true" />
                Generate run
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {canManage && employeeOptions.length > 0 ? (
        <section className="rounded-lg border border-primary-dark/10 bg-white p-5">
          <h2 className="font-heading text-xl font-bold text-primary-dark">
            Record a staff advance
          </h2>
          <p className="text-sm text-primary-dark/60">
            Advances are deducted from net pay on the next staff payroll run.
          </p>
          <form action={createStaffAdvanceAction} className="mt-3 grid gap-3 md:grid-cols-4">
            <label className={OPS_LABEL_CLASS}>
              Employee
              <select className={OPS_INPUT_CLASS} defaultValue="" name="employee_id" required>
                <option value="" disabled>
                  Select employee
                </option>
                {employeeOptions.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.employee_number} - {employee.full_name}
                  </option>
                ))}
              </select>
            </label>
            <label className={OPS_LABEL_CLASS}>
              Amount (ZMW)
              <input
                className={OPS_INPUT_CLASS}
                min="0.01"
                name="amount"
                required
                step="0.01"
                type="number"
              />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Issued on
              <input className={OPS_INPUT_CLASS} name="issued_at" required type="date" />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Note
              <input className={OPS_INPUT_CLASS} name="note" />
            </label>
            <div className="md:col-span-4">
              <button className={OPS_SECONDARY_BUTTON_CLASS} type="submit">
                <CircleDollarSign className="size-4" aria-hidden="true" />
                Record advance
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="rounded-lg border border-primary-dark/10 bg-white">
        <div className="border-b border-primary-dark/10 p-5">
          <h2 className="font-heading text-xl font-bold text-primary-dark">Open staff advances</h2>
        </div>
        <div className="divide-y divide-primary-dark/10">
          {openAdvances.length > 0 ? (
            openAdvances.map((advance) => (
              <div className="flex items-start gap-3 p-5" key={advance.id}>
                <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary-dark text-white">
                  <Banknote className="size-4" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="font-bold text-primary-dark">
                      {advance.employee?.full_name ?? "Employee record unavailable"}
                    </p>
                    <p className="font-heading text-lg font-bold text-primary-dark">
                      {formatZmw(advance.amount)}
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-primary-dark/55">
                    {advance.employee?.employee_number ?? ""} · Issued {formatDate(advance.issued_at)}
                  </p>
                  {advance.note ? (
                    <p className="mt-2 text-sm text-primary-dark/65">{advance.note}</p>
                  ) : null}
                  {canManage ? (
                    <form action={archiveStaffAdvanceAction} className="mt-3">
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
              </div>
            ))
          ) : (
            <div className="p-5 text-sm text-primary-dark/55">
              No open staff advances. Record one above when needed.
            </div>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-primary-dark/10 bg-white">
        <div className="border-b border-primary-dark/10 p-5">
          <h2 className="font-heading text-xl font-bold text-primary-dark">Payroll runs</h2>
        </div>
        <div className="divide-y divide-primary-dark/10">
          {runs.length === 0 ? (
            <div className="p-5">
              <OpsEmptyState
                icon={Banknote}
                title="No staff payroll runs yet"
                description="Use the form above to generate the first run from active employee contracts."
                actions={[]}
              />
            </div>
          ) : (
            runs.map((run) => (
              <div className="p-5" key={run.id}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="font-heading text-lg font-bold text-primary-dark">
                      {run.period_label}
                    </p>
                    <p className="mt-1 text-xs text-primary-dark/55">
                      {formatDate(run.period_start)} → {formatDate(run.period_end)} · {run.items.length} employee
                      {run.items.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-start gap-2">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${statusClass(run.status)}`}
                    >
                      {run.status}
                    </span>
                    {canManage && run.status === "draft" ? (
                      <form action={approveStaffPayrollRunAction}>
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
                      <form action={completeStaffPayrollRunAction}>
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
                <dl className="mt-4 grid gap-3 md:grid-cols-4">
                  <div className="rounded-md border border-primary-dark/10 px-3 py-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary-dark/45">
                      Basic
                    </p>
                    <p className="mt-1 font-bold text-primary-dark">{formatZmw(run.total_basic)}</p>
                  </div>
                  <div className="rounded-md border border-primary-dark/10 px-3 py-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary-dark/45">
                      Gross
                    </p>
                    <p className="mt-1 font-bold text-primary-dark">{formatZmw(run.total_gross)}</p>
                  </div>
                  <div className="rounded-md border border-primary-dark/10 px-3 py-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary-dark/45">
                      Advances
                    </p>
                    <p className="mt-1 font-bold text-primary-dark">{formatZmw(run.total_advances)}</p>
                  </div>
                  <div className="rounded-md border border-primary-dark/10 px-3 py-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary-dark/45">
                      Net
                    </p>
                    <p className="mt-1 font-bold text-primary-dark">{formatZmw(run.total_net)}</p>
                  </div>
                </dl>

                {run.items.length > 0 ? (
                  <ul className="mt-4 divide-y divide-primary-dark/10 rounded-md border border-primary-dark/10">
                    {run.items.map((item) => (
                      <li
                        className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
                        key={item.id}
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-primary-dark">{item.full_name}</p>
                          <p className="text-xs text-primary-dark/55">
                            {item.employee_number}
                            {item.job_title ? ` · ${item.job_title}` : ""}
                            {item.department ? ` · ${item.department}` : ""}
                          </p>
                          <p className="mt-1 text-xs text-primary-dark/55">
                            Gross {formatZmw(item.gross_pay)} · PAYE {formatZmw(item.paye_amount)}
                            {" · "}NAPSA {formatZmw(item.napsa_employee)} · NHIMA{" "}
                            {formatZmw(item.nhima_employee)}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="font-heading text-base font-bold text-primary-dark">
                            {formatZmw(item.net_pay)}
                          </span>
                          <a
                            className={OPS_SECONDARY_BUTTON_CLASS}
                            href={`/api/ops/pdf/staff-payslip/${item.id}`}
                          >
                            <Download className="size-3.5" aria-hidden="true" />
                            Payslip
                          </a>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
