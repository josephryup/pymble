import {
  Archive,
  Banknote,
  Building2,
  Check,
  CircleDollarSign,
  Download,
  Plus,
  Send,
} from "lucide-react";
import { notFound } from "next/navigation";
import { OpsInlineEmpty } from "@/components/ops/OpsInlineEmpty";
import { OpsConfirmSubmitButton } from "@/components/ops/OpsConfirmSubmitButton";
import { OpsEmptyState } from "@/components/ops/OpsEmptyState";
import { OpsPageHeader } from "@/components/ops/OpsPageHeader";
import { fetchOpsModuleAccessOverrides } from "@/lib/ops/module-access";
import { requireOpsUser } from "@/lib/ops/auth";
import { canAccessOpsHref } from "@/lib/ops/permissions";
import {
  canManageOpsStaffPayroll,
  fetchOpsStaffPayrollEmployees,
  canViewOpsStaffPayroll,
  fetchOpsStaffAdvances,
  fetchOpsStaffPayrollRuns,
} from "@/lib/ops/staff-payroll";
import {
  approveStaffPayrollRunAction,
  archiveStaffAdvanceAction,
  archiveStaffPayrollRunAction,
  completeStaffPayrollRunAction,
  createStaffAdvanceAction,
  createStaffPayrollRunAction,
  updateStaffBankDetailsAction,
  updateStaffStatutoryContributionsAction,
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
  opsStatusBadgeClass,
} from "@/lib/ops/ui";
import { formatOpsDate } from "@/lib/ops/format";

const formatDate = (value: string | null | undefined) => formatOpsDate(value, "—");

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<OpsSearchParams>;
};

function pageNotice(params: OpsSearchParams) {
  const created = firstParam(params.created);
  const updated = firstParam(params.updated);
  const error = firstParam(params.error);
  if (error) return { tone: "error" as const, message: error };
  if (created === "run") {
    const included = firstParam(params.included) ?? "0";
    const skipped = firstParam(params.skipped) ?? "0";
    return {
      tone: "success" as const,
      message:
        skipped !== "0"
          ? `Staff payroll run created with ${included} employees. ${skipped} employee${skipped === "1" ? "" : "s"} skipped — pay structure not set on their contract.`
          : `Staff payroll run created with ${included} employees.`,
    };
  }
  if (created === "advance") return { tone: "success" as const, message: "Staff advance recorded." };
  if (updated === "approved") return { tone: "success" as const, message: "Staff payroll run approved." };
  if (updated === "completed") return { tone: "success" as const, message: "Staff payroll run marked paid." };
  if (updated === "archived") return { tone: "success" as const, message: "Draft staff payroll run archived. Its advances are available for the next run." };
  if (updated === "advance_archived") return { tone: "success" as const, message: "Staff advance archived." };
  if (updated === "statutory_contributions") return { tone: "success" as const, message: "Statutory contribution setting updated." };
  if (updated === "bank_details") return { tone: "success" as const, message: "Bank details updated." };
  return null;
}

export default async function OpsStaffPayrollPage({ searchParams }: PageProps) {
  const params = (await (searchParams ?? Promise.resolve({} as OpsSearchParams))) ?? {};
  const { profile } = await requireOpsUser();
  if (!canAccessOpsHref(profile.role, "/ops/staff-payroll", await fetchOpsModuleAccessOverrides()) || !canViewOpsStaffPayroll(profile.role)) {
    notFound();
  }

  const canManage = canManageOpsStaffPayroll(profile.role);
  const [runs, advances, employees] = await Promise.all([
    fetchOpsStaffPayrollRuns(),
    fetchOpsStaffAdvances(),
    fetchOpsStaffPayrollEmployees(),
  ]);
  const notice = pageNotice(params);
  const openAdvances = advances.filter((advance) => !advance.deducted_in_run_id);
  const employeeOptions = employees;

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
        <section className="rounded-lg border border-border bg-card p-5">
          <div className="mb-4 flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-md bg-primary-blue text-white">
              <Plus className="size-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-heading text-xl font-bold text-foreground">
                Generate a payroll run
              </h2>
              <p className="text-sm text-muted-foreground">
                Select the staff to include. Open staff advances are deducted automatically.
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
            <fieldset className="md:col-span-4">
              <legend className={OPS_LABEL_CLASS}>Staff to include</legend>
              <div className="mt-2 grid gap-2 rounded-md border border-border p-3 sm:grid-cols-2 lg:grid-cols-3">
                {employees.map((employee) => (
                  <label className="flex items-center gap-2 text-sm text-foreground" key={employee.id}>
                    <input defaultChecked name="employee_ids" type="checkbox" value={employee.id} />
                    <span>{employee.employee_number} - {employee.full_name}</span>
                  </label>
                ))}
                {employees.length === 0 ? (
                  <OpsInlineEmpty>No active staff are available.</OpsInlineEmpty>
                ) : null}
              </div>
            </fieldset>
          </form>
        </section>
      ) : null}

      {canManage && employees.length > 0 ? (
        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="font-heading text-xl font-bold text-foreground">Statutory contributions</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Set whether statutory deductions apply to each person. Opting someone out removes
            PAYE, NAPSA, NHIMA and WCF entirely — they are paid their full gross and settle their
            own tax with ZRA. Use it only for engagements that are not employment for tax purposes;
            advances are still recovered.
          </p>
          <div className="mt-3 divide-y divide-border rounded-md border border-border">
            {employees.map((employee) => (
              <form action={updateStaffStatutoryContributionsAction} className="flex items-center justify-between gap-3 p-3" key={employee.id}>
                <input name="employee_id" type="hidden" value={employee.id} />
                <div>
                  <p className="font-semibold text-foreground">{employee.full_name}</p>
                  <p className="text-xs text-muted-foreground">{employee.employee_number}{employee.job_title ? ` · ${employee.job_title}` : ""}</p>
                </div>
                <select className={OPS_INPUT_CLASS} defaultValue={String(employee.statutory_contributions_enabled)} name="enabled">
                  <option value="true">PAYE + contributions apply</option>
                  <option value="false">None — paid gross</option>
                </select>
                <button className={OPS_SECONDARY_BUTTON_CLASS} type="submit">Save</button>
              </form>
            ))}
          </div>
        </section>
      ) : null}

      {canManage && employees.length > 0 ? (
        <section className="rounded-lg border border-border bg-card p-5">
          <div className="mb-4 flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-md bg-primary-blue text-white">
              <Building2 className="size-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-heading text-xl font-bold text-foreground">Bank details</h2>
              <p className="text-sm text-muted-foreground">
                Set where each employee&apos;s payroll payment should be sent. These are snapshotted on each payroll run.
              </p>
            </div>
          </div>
          <div className="divide-y divide-border rounded-md border border-border">
            {employees.map((employee) => (
              <form action={updateStaffBankDetailsAction} className="grid gap-3 p-3 md:grid-cols-5" key={`bank-${employee.id}`}>
                <input name="employee_id" type="hidden" value={employee.id} />
                <div className="flex flex-col justify-center">
                  <p className="font-semibold text-foreground">{employee.full_name}</p>
                  <p className="text-xs text-muted-foreground">{employee.employee_number}</p>
                </div>
                <label className={OPS_LABEL_CLASS}>
                  Bank name
                  <input className={OPS_INPUT_CLASS} defaultValue={employee.bank_name} name="bank_name" placeholder="e.g. Zanaco" />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Branch
                  <input className={OPS_INPUT_CLASS} defaultValue={employee.bank_branch} name="bank_branch" placeholder="e.g. Lusaka Main" />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Account number
                  <input className={OPS_INPUT_CLASS} defaultValue={employee.bank_account_number} name="bank_account_number" />
                </label>
                <div className="flex items-end">
                  <button className={`${OPS_SECONDARY_BUTTON_CLASS} w-full`} type="submit">Save</button>
                </div>
              </form>
            ))}
          </div>
        </section>
      ) : null}

      {canManage && employeeOptions.length > 0 ? (
        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="font-heading text-xl font-bold text-foreground">
            Record a staff advance
          </h2>
          <p className="text-sm text-muted-foreground">
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

      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-border p-5">
          <h2 className="font-heading text-xl font-bold text-foreground">Open staff advances</h2>
        </div>
        <div className="divide-y divide-border">
          {openAdvances.length > 0 ? (
            openAdvances.map((advance) => (
              <div className="flex items-start gap-3 p-5" key={advance.id}>
                <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary-dark text-white">
                  <Banknote className="size-4" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="font-bold text-foreground">
                      {advance.employee?.full_name ?? "Employee record unavailable"}
                    </p>
                    <p className="font-heading text-lg font-bold text-foreground">
                      {formatZmw(advance.amount)}
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {advance.employee?.employee_number ?? ""} · Issued {formatDate(advance.issued_at)}
                  </p>
                  {advance.note ? (
                    <p className="mt-2 text-sm text-muted-foreground">{advance.note}</p>
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
            <OpsInlineEmpty>No open staff advances. Record one above when needed.</OpsInlineEmpty>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-border p-5">
          <h2 className="font-heading text-xl font-bold text-foreground">Payroll runs</h2>
        </div>
        <div className="divide-y divide-border">
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
                    <p className="font-heading text-lg font-bold text-foreground">
                      {run.period_label}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDate(run.period_start)} → {formatDate(run.period_end)} · {run.items.length} employee
                      {run.items.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-start gap-2">
                    <span
                      className={opsStatusBadgeClass(run.status)}
                    >
                      {run.status}
                    </span>
                    <a
                      className={OPS_SECONDARY_BUTTON_CLASS}
                      href={`/api/ops/staff-payroll/${run.id}/export`}
                    >
                      <Download className="size-3" aria-hidden="true" />
                      Excel
                    </a>
                    {canManage && run.status === "draft" ? (
                      <>
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
                        <form action={archiveStaffPayrollRunAction}>
                          <input name="id" type="hidden" value={run.id} />
                          <OpsConfirmSubmitButton
                            className={OPS_DANGER_BUTTON_CLASS}
                            confirmText="Confirm archive"
                          >
                            <Archive className="size-3" aria-hidden="true" />
                            Archive draft
                          </OpsConfirmSubmitButton>
                        </form>
                      </>
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
                  <div className="rounded-md border border-border px-3 py-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Basic
                    </p>
                    <p className="mt-1 font-bold text-foreground">{formatZmw(run.total_basic)}</p>
                  </div>
                  <div className="rounded-md border border-border px-3 py-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Gross
                    </p>
                    <p className="mt-1 font-bold text-foreground">{formatZmw(run.total_gross)}</p>
                  </div>
                  <div className="rounded-md border border-border px-3 py-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Advances
                    </p>
                    <p className="mt-1 font-bold text-foreground">{formatZmw(run.total_advances)}</p>
                  </div>
                  <div className="rounded-md border border-border px-3 py-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Net
                    </p>
                    <p className="mt-1 font-bold text-foreground">{formatZmw(run.total_net)}</p>
                  </div>
                </dl>

                {run.items.length > 0 ? (
                  <ul className="mt-4 divide-y divide-border rounded-md border border-border">
                    {run.items.map((item) => (
                      <li
                        className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
                        key={item.id}
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground">{item.full_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.employee_number}
                            {item.job_title ? ` · ${item.job_title}` : ""}
                            {item.department ? ` · ${item.department}` : ""}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Gross {formatZmw(item.gross_pay)} · PAYE {formatZmw(item.paye_amount)}
                            {" · "}NAPSA {formatZmw(item.napsa_employee)} · NHIMA{" "}
                            {formatZmw(item.nhima_employee)}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="font-heading text-base font-bold text-foreground">
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
