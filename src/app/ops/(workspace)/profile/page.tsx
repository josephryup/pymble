import {
  BriefcaseBusiness,
  CalendarCheck,
  Download,
  FileCheck2,
  GraduationCap,
  KeyRound,
  Plus,
  ShieldCheck,
  Upload,
  UserCircle,
} from "lucide-react";
import { OpsLogoutButton } from "@/components/ops/OpsLogoutButton";
import { requireOpsUser } from "@/lib/ops/auth";
import { uploadEmployeeDocumentAction } from "@/lib/ops/hr-actions";
import { fetchMyOpsEmployeeSelfServiceProfile, type OpsEmployeeDocumentSummary } from "@/lib/ops/hr";
import { fetchMyPayslipAccess, fetchMyStaffPayslips } from "@/lib/ops/staff-payroll";
import {
  createMyLeaveRequestAction,
  updateMyPasswordAction,
  updateMyProfileAction,
} from "@/lib/ops/profile-actions";
import {
  firstParam,
  noticeFromParams,
  OPS_FOCUS_CLASS,
  OPS_INPUT_CLASS,
  OPS_LABEL_CLASS,
  OPS_PRIMARY_BUTTON_CLASS,
  type OpsSearchParams,
  OPS_NOTICE_WARNING_CLASS,
  opsStatusBadgeClass,
  type OpsStatusTone,
} from "@/lib/ops/ui";
import { formatOpsProfileName, formatOpsRole } from "@/lib/ops/roles";
import type {
  OpsEmployeeDocumentStatus,
  OpsLeaveType,
  OpsSafetyTrainingStatus,
} from "@/lib/ops/types";
import { todayInLusaka, formatOpsLabel as formatLabel, formatOpsDate as formatDate } from "@/lib/ops/format";

type PageProps = {
  searchParams?: Promise<OpsSearchParams>;
};

const LEAVE_TYPE_OPTIONS: Array<{ label: string; value: OpsLeaveType }> = [
  { label: "Annual", value: "annual" },
  { label: "Sick", value: "sick" },
  { label: "Compassionate", value: "compassionate" },
  { label: "Unpaid", value: "unpaid" },
  { label: "Maternity", value: "maternity" },
  { label: "Paternity", value: "paternity" },
  { label: "Study", value: "study" },
  { label: "Other", value: "other" },
];

function profileNotice(params: OpsSearchParams) {
  const baseNotice = noticeFromParams(params, "profile", "Profile updated.");

  if (baseNotice) {
    return baseNotice;
  }

  if (firstParam(params.updated) === "password") {
    return {
      tone: "success" as const,
      message: "Password updated.",
    };
  }

  if (firstParam(params.updated) === "welcome") {
    return {
      tone: "success" as const,
      message: "Welcome to Pymble Operations. Set a password here so you can sign in normally next time.",
    };
  }

  if (firstParam(params.updated) === "profile") {
    return {
      tone: "success" as const,
      message: "Profile updated.",
    };
  }

  if (firstParam(params.updated) === "self_leave") {
    return {
      tone: "success" as const,
      message: "Leave request submitted to HR.",
    };
  }

  if (firstParam(params.created) === "employee_document") {
    return {
      tone: "success" as const,
      message: "Employee document uploaded for HR review.",
    };
  }

  return null;
}

function trainingStatusTone(status: OpsSafetyTrainingStatus, expiryDate: string | null): OpsStatusTone {
  const today = new Date().toISOString().slice(0, 10);
  if (status === "expired" || (expiryDate && expiryDate < today)) {
    return "negative";
  }
  if (status === "completed") {
    return "positive";
  }
  return "neutral";
}

function employeeDocumentStatusTone(status: OpsEmployeeDocumentStatus, expiryDate: string | null): OpsStatusTone {
  const today = new Date().toISOString().slice(0, 10);
  if (status === "rejected" || status === "expired" || (expiryDate && expiryDate < today)) {
    return "negative";
  }
  if (status === "accepted") {
    return "positive";
  }
  if (status === "submitted") {
    return "attention";
  }
  return "neutral";
}

function currentEmployeeDocumentVersion(document: OpsEmployeeDocumentSummary) {
  return document.version ?? null;
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 font-bold text-foreground">{value}</dd>
    </div>
  );
}

function formatZmwShort(value: number) {
  return new Intl.NumberFormat("en-ZM", {
    style: "currency",
    currency: "ZMW",
    maximumFractionDigits: 2,
  }).format(value);
}

export default async function OpsProfilePage({ searchParams }: PageProps) {
  const [params, auth, selfService, myPayslips, payslipAccess] = await Promise.all([
    searchParams ?? Promise.resolve({}),
    requireOpsUser(),
    fetchMyOpsEmployeeSelfServiceProfile(),
    fetchMyStaffPayslips(),
    fetchMyPayslipAccess(),
  ]);
  const notice = profileNotice(params);
  const profileName = formatOpsProfileName(auth.profile.full_name, auth.profile.role);
  const today = todayInLusaka();

  return (
    <div className="w-full max-w-none space-y-6">
      <section className="rounded-lg border border-border bg-card p-5 md:p-7">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-blue">
          My Account
        </p>
        <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground md:text-4xl">
              Profile
            </h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-foreground/68">
              Manage your Pymble account details and password.
            </p>
          </div>
          <div className="rounded-md border border-border px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Access role
            </p>
            <p className="mt-1 font-heading text-xl font-bold text-foreground">
              {formatOpsRole(auth.profile.role)}
            </p>
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

      <section
        className="scroll-mt-24 rounded-lg border border-border bg-card p-5"
        id="employee-self-service"
      >
        <div className="flex flex-col gap-3 border-b border-border pb-5 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-blue text-white">
              <BriefcaseBusiness className="size-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-blue">
                Employee Self-Service
              </p>
              <h2 className="mt-1 font-heading text-xl font-bold text-foreground">
                My employment workspace
              </h2>
            </div>
          </div>
          {selfService.employee ? (
            <span
              className={`w-fit ${opsStatusBadgeClass(selfService.employee.status)}`}
            >
              {formatLabel(selfService.employee.status)}
            </span>
          ) : null}
        </div>

        {selfService.employee ? (
          <div className="grid gap-5 pt-5">
            <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <DetailMetric label="Employee no." value={selfService.employee.employee_number} />
              <DetailMetric
                label="Job title"
                value={selfService.employee.job_title || "Not recorded"}
              />
              <DetailMetric
                label="Department"
                value={selfService.employee.department || "Not recorded"}
              />
              <DetailMetric
                label="Site"
                value={
                  selfService.employee.site
                    ? `${selfService.employee.site.code} - ${selfService.employee.site.name}`
                    : "No site"
                }
              />
            </dl>

            <div className="grid gap-5 lg:grid-cols-2">
              <section className="scroll-mt-24 rounded-md border border-border" id="my-leave">
                <div className="flex items-center gap-3 border-b border-border p-4">
                  <div className="flex size-9 items-center justify-center rounded-md bg-sky-50 text-sky-700">
                    <CalendarCheck className="size-5" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="font-heading text-lg font-bold text-foreground">
                      My leave
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Balances and recent requests.
                    </p>
                  </div>
                </div>
                <div className="grid gap-4 p-4">
                  {selfService.employee.leave_balances.length > 0 ? (
                    <dl className="grid gap-3 sm:grid-cols-2">
                      {selfService.employee.leave_balances.slice(0, 4).map((balance) => (
                        <DetailMetric
                          key={balance.id}
                          label={`${formatLabel(balance.leave_type)} ${balance.balance_year}`}
                          value={`${balance.available_days.toLocaleString("en-ZM", {
                            maximumFractionDigits: 2,
                          })} days`}
                        />
                      ))}
                    </dl>
                  ) : (
                    <div className="rounded-md border border-border px-4 py-3 text-sm text-muted-foreground">
                      Leave balances have not been posted yet.
                    </div>
                  )}

                  <div className="grid gap-2">
                    {selfService.employee.leave_requests.slice(0, 4).map((request) => (
                      <article
                        className="rounded-md border border-border px-4 py-3"
                        key={request.id}
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary-blue">
                              {request.leave_number}
                            </p>
                            <p className="mt-1 font-bold text-foreground">
                              {formatDate(request.start_date)} to {formatDate(request.end_date)}
                            </p>
                          </div>
                          <span
                            className={`w-fit ${opsStatusBadgeClass(request.status)}`}
                          >
                            {formatLabel(request.status)}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {formatLabel(request.leave_type)} /{" "}
                          {request.days_requested.toLocaleString("en-ZM", {
                            maximumFractionDigits: 2,
                          })}{" "}
                          day{request.days_requested === 1 ? "" : "s"}
                        </p>
                      </article>
                    ))}
                  </div>

                  <details className="rounded-md border border-border">
                    <summary className={`flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-bold text-foreground [&::-webkit-details-marker]:hidden ${OPS_FOCUS_CLASS}`}>
                      <span>Request leave</span>
                      <Plus className="size-4 text-primary-blue" aria-hidden="true" />
                    </summary>
                    <form
                      action={createMyLeaveRequestAction}
                      className="grid gap-3 border-t border-border p-4 sm:grid-cols-2"
                    >
                      <label className={OPS_LABEL_CLASS}>
                        Leave type
                        <select className={OPS_INPUT_CLASS} defaultValue="annual" name="leave_type">
                          {LEAVE_TYPE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className={OPS_LABEL_CLASS}>
                        Days
                        <input className={OPS_INPUT_CLASS} min="0" name="days_requested" step="0.5" type="number" />
                      </label>
                      <label className={OPS_LABEL_CLASS}>
                        Start date
                        <input className={OPS_INPUT_CLASS} defaultValue={today} name="start_date" type="date" />
                      </label>
                      <label className={OPS_LABEL_CLASS}>
                        End date
                        <input className={OPS_INPUT_CLASS} defaultValue={today} name="end_date" type="date" />
                      </label>
                      <label className={`${OPS_LABEL_CLASS} sm:col-span-2`}>
                        Reason
                        <textarea className={`${OPS_INPUT_CLASS} min-h-20`} name="reason" />
                      </label>
                      <label className={`${OPS_LABEL_CLASS} sm:col-span-2`}>
                        Handover notes
                        <textarea className={`${OPS_INPUT_CLASS} min-h-20`} name="handover_notes" />
                      </label>
                      <button className={`${OPS_PRIMARY_BUTTON_CLASS} sm:col-span-2`} type="submit">
                        <Plus className="size-4" aria-hidden="true" />
                        Submit leave request
                      </button>
                    </form>
                  </details>
                </div>
              </section>

              <section className="scroll-mt-24 rounded-md border border-border" id="my-training">
                <div className="flex items-center gap-3 border-b border-border p-4">
                  <div className="flex size-9 items-center justify-center rounded-md bg-orange-50 text-orange-700">
                    <GraduationCap className="size-5" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="font-heading text-lg font-bold text-foreground">
                      My training
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Safety training and certificate renewal status.
                    </p>
                  </div>
                </div>
                <div className="grid gap-3 p-4">
                  {selfService.trainingRecords.length > 0 ? (
                    selfService.trainingRecords.map((training) => (
                      <article
                        className="rounded-md border border-border px-4 py-3"
                        key={training.id}
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary-blue">
                              {training.training_number}
                            </p>
                            <p className="mt-1 font-bold text-foreground">
                              {training.training_title}
                            </p>
                          </div>
                          <span
                            className={`w-fit ${opsStatusBadgeClass(training.status, trainingStatusTone(training.status, training.expiry_date))}`}
                          >
                            {training.status === "completed" &&
                            training.expiry_date &&
                            training.expiry_date < today
                              ? "expired"
                              : formatLabel(training.status)}
                          </span>
                        </div>
                        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                          <DetailMetric label="Completed" value={formatDate(training.completed_date)} />
                          <DetailMetric label="Expiry" value={formatDate(training.expiry_date)} />
                        </dl>
                      </article>
                    ))
                  ) : (
                    <div className="rounded-md border border-border px-4 py-3 text-sm text-muted-foreground">
                      No safety training records linked yet.
                    </div>
                  )}
                </div>
              </section>

              <section className="scroll-mt-24 rounded-md border border-border lg:col-span-2" id="my-payslips">
                <div className="flex items-center gap-3 border-b border-border p-4">
                  <div className="flex size-9 items-center justify-center rounded-md bg-primary-blue/10 text-primary-blue">
                    <Download className="size-5" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="font-heading text-lg font-bold text-foreground">
                      My payslips
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Download your monthly payslip PDFs. Only you and HR / Finance / Leadership can see them.
                    </p>
                  </div>
                </div>
                {myPayslips.length === 0 ? (
                  /* An empty list has three different causes and only one of
                     them means "wait" (audit §5). Telling someone whose account
                     is not linked to an employee record to wait for a payslip
                     sends them waiting for something that will never arrive. */
                  payslipAccess.state === "no_employee_record" ? (
                    <div className="m-4 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm dark:border-amber-900/50 dark:bg-amber-950/30">
                      <p className="font-bold text-amber-800 dark:text-amber-200">
                        Your account is not linked to an employee record
                      </p>
                      <p className="mt-1 leading-6 text-amber-800/90 dark:text-amber-200/90">
                        Payslips are matched to your employee record, and yours has not
                        been connected to this login yet — so nothing can appear here,
                        however many payroll runs are completed. Ask HR or the Managing
                        Director to link your staff account, and your payslips will
                        appear straight away.
                      </p>
                    </div>
                  ) : payslipAccess.state === "inactive_employee" ? (
                    <p className="p-4 text-sm text-muted-foreground">
                      Your employee record ({payslipAccess.employeeNumber}) is marked as
                      exited, so no new payslips will be issued. Contact HR if that is
                      not right.
                    </p>
                  ) : (
                    <p className="p-4 text-sm text-muted-foreground">
                      No payslips yet. Once your monthly staff payroll run is created and
                      approved, your payslip will appear here.
                    </p>
                  )
                ) : (
                  <ul className="divide-y divide-border">
                    {myPayslips.map((slip) => (
                      <li
                        className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
                        key={slip.id}
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground">{slip.period_label}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Gross {formatZmwShort(slip.gross_pay)} · Net{" "}
                            <span className="font-semibold text-foreground">{formatZmwShort(slip.net_pay)}</span>
                          </p>
                        </div>
                        <a
                          className={`${OPS_PRIMARY_BUTTON_CLASS} w-full sm:w-auto`}
                          href={`/api/ops/pdf/staff-payslip/${slip.id}`}
                        >
                          <Download className="size-4" aria-hidden="true" />
                          Download
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="scroll-mt-24 rounded-md border border-border lg:col-span-2" id="my-documents">
                <div className="flex items-center gap-3 border-b border-border p-4">
                  <div className="flex size-9 items-center justify-center rounded-md bg-emerald-50 text-emerald-700">
                    <FileCheck2 className="size-5" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="font-heading text-lg font-bold text-foreground">
                      My HR documents
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Required employee files, review status, and private downloads.
                    </p>
                  </div>
                </div>
                <div className="grid gap-4 p-4">
                  {selfService.documentCategories.length > 0 ? (
                    <details className="rounded-md border border-border">
                      <summary className={`flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-bold text-foreground [&::-webkit-details-marker]:hidden ${OPS_FOCUS_CLASS}`}>
                        <span>Upload HR document</span>
                        <Upload className="size-4 text-primary-blue" aria-hidden="true" />
                      </summary>
                      <form
                        action={uploadEmployeeDocumentAction}
                        className="grid gap-3 border-t border-border p-4 sm:grid-cols-2"
                      >
                        <input name="employee_id" type="hidden" value={selfService.employee.id} />
                        <input name="return_to" type="hidden" value="/ops/profile#my-documents" />
                        <label className={OPS_LABEL_CLASS}>
                          Category
                          <select className={OPS_INPUT_CLASS} name="category_id" required>
                            <option value="">Select category</option>
                            {selfService.documentCategories
                              .filter((category) => category.is_active)
                              .map((category) => (
                                <option key={category.id} value={category.id}>
                                  {category.name}
                                  {category.is_required ? " - required" : ""}
                                </option>
                              ))}
                          </select>
                        </label>
                        <label className={OPS_LABEL_CLASS}>
                          Expiry date
                          <input className={OPS_INPUT_CLASS} name="expiry_date" type="date" />
                        </label>
                        <label className={`${OPS_LABEL_CLASS} sm:col-span-2`}>
                          Title
                          <input className={OPS_INPUT_CLASS} name="title" placeholder="Leave blank to use the category name" />
                        </label>
                        <label className={`${OPS_LABEL_CLASS} sm:col-span-2`}>
                          File
                          <input className={OPS_INPUT_CLASS} name="document" required type="file" />
                        </label>
                        <button className={`${OPS_PRIMARY_BUTTON_CLASS} sm:col-span-2`} type="submit">
                          <Upload className="size-4" aria-hidden="true" />
                          Upload for review
                        </button>
                      </form>
                    </details>
                  ) : (
                    <div className="rounded-md border border-border px-4 py-3 text-sm text-muted-foreground">
                      HR document categories have not been configured yet.
                    </div>
                  )}

                  {selfService.documents.length > 0 ? (
                    <div className="grid gap-3 lg:grid-cols-2">
                      {selfService.documents.map((document) => {
                        const version = currentEmployeeDocumentVersion(document);
                        const isExpired =
                          document.expiry_date !== null && document.expiry_date < today;

                        return (
                          <article
                            className="rounded-md border border-border px-4 py-3"
                            key={document.id}
                          >
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary-blue">
                                  {document.category?.category_code ?? "hr"}
                                </p>
                                <p className="mt-1 font-bold text-foreground">
                                  {document.document?.title ?? document.category?.name ?? "Employee document"}
                                </p>
                              </div>
                              <span
                                className={`w-fit ${opsStatusBadgeClass(document.status, employeeDocumentStatusTone(document.status, document.expiry_date))}`}
                              >
                                {isExpired ? "Expired" : formatLabel(document.status)}
                              </span>
                            </div>
                            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                              <DetailMetric label="Uploaded" value={formatDate(document.created_at.slice(0, 10))} />
                              <DetailMetric label="Expiry" value={formatDate(document.expiry_date)} />
                            </dl>
                            {document.review_notes ? (
                              <p className="mt-3 rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-sm leading-6 text-orange-800">
                                {document.review_notes}
                              </p>
                            ) : null}
                            {version ? (
                              <a
                                className={`${OPS_PRIMARY_BUTTON_CLASS} mt-3 w-full justify-center sm:w-auto`}
                                href={`/api/ops/documents/${version.id}/download`}
                              >
                                <Download className="size-4" aria-hidden="true" />
                                Download
                              </a>
                            ) : null}
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-md border border-border px-4 py-3 text-sm text-muted-foreground">
                      No HR documents linked to your employee record yet.
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>
        ) : (
          <div className="pt-5">
            <div className={OPS_NOTICE_WARNING_CLASS}>
              No employee record is linked to this account yet.
            </div>
          </div>
        )}
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <form
          action={updateMyProfileAction}
          className="rounded-lg border border-border bg-card p-5"
        >
          <div className="mb-5 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-md bg-primary-blue text-white">
              <UserCircle className="size-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="font-heading text-xl font-bold text-foreground">
                Personal details
              </h2>
              <p className="text-sm text-muted-foreground">
                These details appear in the ops workspace and activity records.
              </p>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className={OPS_LABEL_CLASS}>
              Full name
              <input
                className={OPS_INPUT_CLASS}
                defaultValue={profileName}
                name="full_name"
                required
              />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Phone
              <input
                className={OPS_INPUT_CLASS}
                defaultValue={auth.profile.phone ?? ""}
                name="phone"
              />
            </label>
            <label className={`${OPS_LABEL_CLASS} md:col-span-2`}>
              Email
              <input
                className={`${OPS_INPUT_CLASS} bg-muted/40 text-muted-foreground`}
                defaultValue={auth.profile.email ?? auth.authUser.email ?? ""}
                disabled
              />
            </label>
          </div>
          <button
            className={`${OPS_PRIMARY_BUTTON_CLASS} mt-5`}
            type="submit"
          >
            Save profile
          </button>
        </form>

        <div className="space-y-5">
          <form
            action={updateMyPasswordAction}
            className="rounded-lg border border-border bg-card p-5"
            id="password"
          >
            <div className="mb-5 flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-md bg-primary-dark text-white">
                <KeyRound className="size-5" aria-hidden="true" />
              </div>
              <div>
                <h2 className="font-heading text-xl font-bold text-foreground">
                  Password
                </h2>
                <p className="text-sm text-muted-foreground">
                  Choose a new password for your login.
                </p>
              </div>
            </div>
            <div className="grid gap-4">
              <label className={OPS_LABEL_CLASS}>
                New password
                <input
                  autoComplete="new-password"
                  className={OPS_INPUT_CLASS}
                  minLength={12}
                  name="password"
                  required
                  type="password"
                />
                <span className="mt-1 block text-xs text-muted-foreground">
                  At least 12 characters with an uppercase letter, a lowercase letter, and a digit.
                </span>
              </label>
              <label className={OPS_LABEL_CLASS}>
                Confirm password
                <input
                  autoComplete="new-password"
                  className={OPS_INPUT_CLASS}
                  minLength={12}
                  name="confirm_password"
                  required
                  type="password"
                />
              </label>
            </div>
            <button
              className={`${OPS_PRIMARY_BUTTON_CLASS} mt-5`}
              type="submit"
            >
              Reset password
            </button>
          </form>

          <section className="rounded-lg border border-border bg-card p-5">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-md bg-emerald-50 text-emerald-700">
                <ShieldCheck className="size-5" aria-hidden="true" />
              </div>
              <div>
                <h2 className="font-heading text-xl font-bold text-foreground">
                  Session
                </h2>
                <p className="text-sm text-muted-foreground">
                  Sign out of this browser when you finish.
                </p>
              </div>
            </div>
            <OpsLogoutButton />
          </section>
        </div>
      </section>
    </div>
  );
}
