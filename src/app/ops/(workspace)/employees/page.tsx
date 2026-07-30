import {
  AlertTriangle,
  Archive,
  ArrowRight,
  BriefcaseBusiness,
  CalendarCheck,
  CheckCircle2,
  Download,
  FileCheck2,
  FileText,
  FileWarning,
  FolderKanban,
  GraduationCap,
  ListChecks,
  NotebookTabs,
  Pencil,
  Plus,
  Send,
  Star,
  Upload,
  UserCheck,
  Users,
  Wallet,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OpsConfirmSubmitButton } from "@/components/ops/OpsConfirmSubmitButton";
import { OpsDashboardPanel } from "@/components/ops/OpsDashboardPanel";
import { OpsKpiCard } from "@/components/ops/OpsKpiCard";
import { OpsListControls, OpsPaginationControls } from "@/components/ops/OpsListControls";
import { OpsRecordActivityPanel } from "@/components/ops/OpsRecordActivityPanel";
import { requireOpsUser } from "@/lib/ops/auth";
import {
  approveLeaveRequestAction,
  acceptEmployeeDocumentAction,
  archiveEmployeeDocumentAction,
  cancelEmployeeOnboardingItemAction,
  cancelLeaveRequestAction,
  completeEmployeeOnboardingItemAction,
  completeLeaveRequestAction,
  createEmployeeAction,
  createEmployeeContractAction,
  createEmployeeOnboardingItemAction,
  createHrDocumentCategoryAction,
  createLeaveRequestAction,
  createPerformanceAppraisalAction,
  createRecruitmentRequisitionAction,
  rejectLeaveRequestAction,
  rejectEmployeeDocumentAction,
  startEmployeeOnboardingItemAction,
  submitLeaveRequestAction,
  updateEmployeeAction,
  updateEmployeeContractAction,
  updateEmployeeContractStatusAction,
  updateEmployeeStatusAction,
  updateRecruitmentRequisitionStatusAction,
  uploadEmployeeDocumentAction,
  waiveEmployeeOnboardingItemAction,
  upsertLeaveBalanceAction,
} from "@/lib/ops/hr-actions";
import {
  canApproveOpsLeaveRequest,
  canCancelOpsEmployeeOnboardingItem,
  canCancelOpsLeaveRequest,
  canCompleteOpsEmployeeOnboardingItem,
  canCompleteOpsLeaveRequest,
  canCreateOpsEmployee,
  canCreateOpsEmployeeContract,
  canManageOpsEmployeeContract,
  canCreateOpsEmployeeOnboardingItem,
  canCreateOpsLeaveRequest,
  canCreateOpsPerformanceAppraisal,
  canCreateOpsRecruitmentRequisition,
  canManageOpsHrDocumentCategory,
  canManageOpsLeaveBalance,
  canManageOpsRecruitmentRequisition,
  canRejectOpsLeaveRequest,
  canReviewOpsEmployeeDocument,
  canArchiveOpsEmployeeDocument,
  canStartOpsEmployeeOnboardingItem,
  canSubmitOpsLeaveRequest,
  canUpdateOpsEmployeeStatus,
  canWaiveOpsEmployeeOnboardingItem,
} from "@/lib/ops/hr-permissions";
import {
  buildOpsHrDashboardActions,
  fetchActiveEmployeeOptions,
  fetchHrDocumentCategories,
  fetchHrUserOptions,
  fetchOpsHrDocumentCoverageReport,
  fetchOpsHrStats,
  fetchPaginatedOpsEmployees,
  fetchRecentHrTrainingRenewals,
  fetchRecentRecruitmentRequisitions,
  type OpsEmployeeContractSummary,
  type OpsEmployeeDocumentSummary,
  type OpsEmployeeOnboardingItemSummary,
  type OpsEmployeeSummary,
  type OpsHrDashboardAction,
  type OpsHrDocumentCategorySummary,
  type OpsHrDocumentCoverageReport,
  type OpsHrTrainingRenewalSummary,
  type OpsLeaveRequestSummary,
  type OpsRecruitmentRequisitionSummary,
} from "@/lib/ops/hr";
import { parseOpsListState } from "@/lib/ops/listing";
import { canAccessOpsHref } from "@/lib/ops/permissions";
import { fetchActiveSiteOptions } from "@/lib/ops/sites";
import {
  firstParam,
  noticeFromParams,
  OPS_DANGER_BUTTON_CLASS,
  OPS_FOCUS_CLASS,
  OPS_INPUT_CLASS,
  OPS_LABEL_CLASS,
  OPS_PRIMARY_BUTTON_CLASS,
  OPS_SECONDARY_BUTTON_CLASS,
  type OpsSearchParams,
  OPS_NOTICE_SUCCESS_CLASS,
  OPS_NOTICE_WARNING_CLASS,
  opsStatusBadgeClass,
  type OpsStatusTone,
} from "@/lib/ops/ui";
import type {
  OpsEmployeeContractStatus,
  OpsEmployeeDocumentStatus,
  OpsEmployeeStatus,
  OpsEmploymentType,
  OpsLeaveType,
  OpsPayFrequency,
  OpsPerformanceAppraisalStatus,
  OpsPriority,
  OpsRecruitmentRequisitionStatus,
  OpsSafetyTrainingStatus,
  OpsUserRole,
} from "@/lib/ops/types";
import { todayInLusaka, formatOpsLabel as formatLabel, formatOpsDate as formatDate } from "@/lib/ops/format";

type PageProps = {
  searchParams?: Promise<OpsSearchParams>;
};

const HR_ROUTE = "/ops/employees";

const EMPLOYEE_STATUS_OPTIONS: Array<{ label: string; value: OpsEmployeeStatus | "" }> = [
  { label: "All statuses", value: "" },
  { label: "Active", value: "active" },
  { label: "Probation", value: "probation" },
  { label: "On leave", value: "on_leave" },
  { label: "Suspended", value: "suspended" },
  { label: "Exited", value: "exited" },
];

const EMPLOYMENT_TYPE_OPTIONS: Array<{ label: string; value: OpsEmploymentType }> = [
  { label: "Full time", value: "full_time" },
  { label: "Fixed term", value: "fixed_term" },
  { label: "Casual", value: "casual" },
  { label: "Contractor", value: "contractor" },
  { label: "Intern", value: "intern" },
];

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

const PRIORITY_OPTIONS: Array<{ label: string; value: OpsPriority }> = [
  { label: "Low", value: "low" },
  { label: "Normal", value: "normal" },
  { label: "High", value: "high" },
  { label: "Urgent", value: "urgent" },
];

const RECRUITMENT_STATUS_OPTIONS: Array<{ label: string; value: OpsRecruitmentRequisitionStatus }> = [
  { label: "Draft", value: "draft" },
  { label: "Submitted", value: "submitted" },
  { label: "Approved", value: "approved" },
  { label: "Open", value: "open" },
  { label: "Interviewing", value: "interviewing" },
  { label: "Offered", value: "offered" },
  { label: "Filled", value: "filled" },
  { label: "Cancelled", value: "cancelled" },
];

const CONTRACT_STATUS_OPTIONS: Array<{ label: string; value: OpsEmployeeContractStatus }> = [
  { label: "Draft", value: "draft" },
  { label: "Active", value: "active" },
  { label: "Expired", value: "expired" },
  { label: "Terminated", value: "terminated" },
  { label: "Superseded", value: "superseded" },
  { label: "Cancelled", value: "cancelled" },
];

const PAY_FREQUENCY_OPTIONS: Array<{ label: string; value: OpsPayFrequency }> = [
  { label: "Monthly", value: "monthly" },
  { label: "Weekly", value: "weekly" },
  { label: "Daily", value: "daily" },
  { label: "Hourly", value: "hourly" },
  { label: "Contract sum", value: "contract_sum" },
];

const APPRAISAL_STATUS_OPTIONS: Array<{ label: string; value: OpsPerformanceAppraisalStatus }> = [
  { label: "Planned", value: "planned" },
  { label: "In progress", value: "in_progress" },
  { label: "Completed", value: "completed" },
  { label: "Cancelled", value: "cancelled" },
];

function statusFromParam(value: string | undefined) {
  return EMPLOYEE_STATUS_OPTIONS.some((status) => status.value === value)
    ? (value as OpsEmployeeStatus | "")
    : "";
}

function hrNotice(params: OpsSearchParams) {
  const created = noticeFromParams(params, "employee", "Employee record created.");

  if (created) {
    return created;
  }

  const createdValue = firstParam(params.created);
  const updatedValue = firstParam(params.updated);
  const messages: Record<string, string> = {
    attachment: "HR attachment uploaded.",
    appraisal: "Performance appraisal created.",
    appraisal_completed: "Performance appraisal completed.",
    comment: "HR comment added.",
    contract: "Employee contract saved.",
    contract_status: "Employee contract status updated.",
    employee: "Employee record updated.",
    employee_status: "Employee status updated.",
    employee_document: "Employee document uploaded.",
    employee_document_archived: "Employee document archived.",
    employee_document_reviewed: "Employee document review updated.",
    hr_document_category: "HR document category created.",
    leave: "Leave request created.",
    leave_approved: "Leave request approved.",
    leave_balance: "Leave balance saved.",
    leave_cancelled: "Leave request cancelled.",
    leave_completed: "Leave request completed.",
    leave_rejected: "Leave request rejected.",
    leave_submitted: "Leave request submitted.",
    onboarding_cancelled: "Onboarding checklist item cancelled.",
    onboarding_completed: "Onboarding checklist item completed.",
    onboarding_item: "Onboarding checklist item created.",
    onboarding_started: "Onboarding checklist item started.",
    onboarding_waived: "Onboarding checklist item waived.",
    recruitment: "Recruitment requisition created.",
    recruitment_status: "Recruitment requisition status updated.",
  };
  const key = createdValue ?? updatedValue ?? "";

  return key && messages[key]
    ? {
        message: messages[key],
        tone: "success" as const,
      }
    : null;
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

function formatNumber(value: number) {
  return value.toLocaleString("en-ZM", { maximumFractionDigits: 2 });
}

function currentEmployeeDocumentVersion(document: OpsEmployeeDocumentSummary) {
  return document.version ?? null;
}

function requiredDocumentCoverage(
  employee: OpsEmployeeSummary,
  categories: OpsHrDocumentCategorySummary[],
) {
  const requiredCategories = categories.filter(
    (category) => category.is_active && category.is_required,
  );
  const today = new Date().toISOString().slice(0, 10);
  const covered = requiredCategories.filter((category) =>
    employee.documents.some(
      (document) =>
        document.category_id === category.id &&
        (document.status === "submitted" || document.status === "accepted") &&
        (!document.expiry_date || document.expiry_date >= today),
    ),
  ).length;

  return {
    covered,
    missing: Math.max(requiredCategories.length - covered, 0),
    total: requiredCategories.length,
  };
}

function StatusPill({ value, tone }: { value: string; tone?: OpsStatusTone }) {
  return (
    <span className={`w-fit ${opsStatusBadgeClass(value, tone)}`}>{formatLabel(value)}</span>
  );
}

function HrMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 font-bold text-foreground">{value}</dd>
    </div>
  );
}

function hrActionClass(tone: OpsHrDashboardAction["tone"]) {
  if (tone === "urgent") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (tone === "watch") {
    return "border-orange-200 bg-orange-50 text-orange-700";
  }

  return "border-border bg-card text-foreground/68";
}

function HrDashboardActionQueue({ actions }: { actions: OpsHrDashboardAction[] }) {
  return (
    <OpsDashboardPanel eyebrow="HR Queue" title="People actions">
      {actions.length > 0 ? (
        <div className="grid gap-2">
          {actions.map((action) => (
            <Link
              className={`flex items-center gap-3 rounded-md border px-4 py-3 text-sm font-semibold transition hover:translate-x-0.5 ${OPS_FOCUS_CLASS} ${hrActionClass(
                action.tone,
              )}`}
              href={action.href}
              key={action.label}
            >
              <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-foreground">{action.label}</span>
                <span className="mt-0.5 block text-xs font-bold uppercase tracking-[0.08em] opacity-70">
                  {action.detail}
                </span>
              </span>
              <span className="font-heading text-2xl font-bold">{action.value}</span>
              <ArrowRight className="size-4 shrink-0 opacity-50" aria-hidden="true" />
            </Link>
          ))}
        </div>
      ) : (
        <div className={OPS_NOTICE_SUCCESS_CLASS}>
          HR queue clear.
        </div>
      )}
    </OpsDashboardPanel>
  );
}

function HrSignalPanel({ stats }: { stats: Awaited<ReturnType<typeof fetchOpsHrStats>> }) {
  return (
    <OpsDashboardPanel eyebrow="Workforce" title="HR signals">
      <dl className="grid gap-3 sm:grid-cols-2">
        <HrMetric label="Open recruitment" value={String(stats.openRecruitment)} />
        <HrMetric label="Active contracts" value={String(stats.activeContracts)} />
        <HrMetric label="Due appraisals" value={String(stats.dueAppraisals)} />
        <HrMetric label="Low leave balances" value={String(stats.lowLeaveBalances)} />
      </dl>
    </OpsDashboardPanel>
  );
}

function HrDocumentCoveragePanel({ report }: { report: OpsHrDocumentCoverageReport }) {
  const coverage =
    report.totalRequiredSlots === 0
      ? 100
      : Math.round((report.coveredRequiredSlots / report.totalRequiredSlots) * 100);

  return (
    <OpsDashboardPanel eyebrow="HR Documents" title="Document coverage">
      <div className="grid gap-3 sm:grid-cols-3">
        <HrMetric label="Required coverage" value={`${coverage}%`} />
        <HrMetric label="Missing required" value={String(report.missingRequiredSlots)} />
        <HrMetric label="Pending review" value={String(report.submittedDocuments)} />
      </div>
      <div className="mt-4 grid gap-2">
        {report.categoryRows.slice(0, 5).map((row) => (
          <div className="rounded-md border border-border px-4 py-3" key={row.categoryId}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-bold text-foreground">{row.categoryName}</p>
                <p className="mt-1 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  {row.required ? "Required" : "Optional"} / {row.categoryCode}
                </p>
              </div>
              <span className="font-heading text-xl font-bold text-foreground">
                {row.covered}/{row.totalEmployees}
              </span>
            </div>
          </div>
        ))}
      </div>
      {report.departmentRows.length > 0 ? (
        <div className="mt-4 rounded-md border border-border px-4 py-3 text-sm text-foreground/68">
          Highest gap:{" "}
          <span className="font-bold text-foreground">
            {report.departmentRows[0]?.department}
          </span>{" "}
          with {report.departmentRows[0]?.missingRequiredSlots ?? 0} missing required file slots.
        </div>
      ) : null}
    </OpsDashboardPanel>
  );
}

function EmployeeDocumentReviewControls({
  document,
  role,
}: {
  document: OpsEmployeeDocumentSummary;
  role: OpsUserRole;
}) {
  const returnTo = `${HR_ROUTE}#employee-register`;
  const canReview = canReviewOpsEmployeeDocument(role, document);

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {canReview ? (
        <form action={acceptEmployeeDocumentAction}>
          <input name="employee_document_id" type="hidden" value={document.id} />
          <input name="return_to" type="hidden" value={returnTo} />
          <button className={OPS_SECONDARY_BUTTON_CLASS} type="submit">
            <FileCheck2 className="size-4" aria-hidden="true" />
            Accept
          </button>
        </form>
      ) : null}
      {canReview ? (
        <details className="w-full rounded-md border border-border sm:w-auto sm:min-w-72">
          <summary className={`cursor-pointer list-none px-3 py-3 text-sm font-bold text-foreground [&::-webkit-details-marker]:hidden ${OPS_FOCUS_CLASS}`}>
            Reject document
          </summary>
          <form action={rejectEmployeeDocumentAction} className="grid gap-3 border-t border-border p-3">
            <input name="employee_document_id" type="hidden" value={document.id} />
            <input name="return_to" type="hidden" value={returnTo} />
            <label className={OPS_LABEL_CLASS}>
              Review notes
              <textarea className={`${OPS_INPUT_CLASS} min-h-20`} name="review_notes" />
            </label>
            <button className={`${OPS_DANGER_BUTTON_CLASS} min-h-11 justify-center`} type="submit">
              <FileWarning className="size-4" aria-hidden="true" />
              Reject
            </button>
          </form>
        </details>
      ) : null}
      {canArchiveOpsEmployeeDocument(role, document) ? (
        <form action={archiveEmployeeDocumentAction}>
          <input name="employee_document_id" type="hidden" value={document.id} />
          <input name="return_to" type="hidden" value={returnTo} />
          <OpsConfirmSubmitButton
            className={`${OPS_DANGER_BUTTON_CLASS} min-h-11 justify-center`}
            confirmText="Archive employee document"
          >
            <Archive className="size-4" aria-hidden="true" />
            Archive
          </OpsConfirmSubmitButton>
        </form>
      ) : null}
    </div>
  );
}

function EmployeeContractsPanel({
  contracts,
  canManage,
}: {
  contracts: OpsEmployeeContractSummary[];
  canManage: boolean;
}) {
  if (contracts.length === 0) {
    return (
      <div className="mt-4 rounded-md border border-border px-4 py-3 text-sm text-muted-foreground">
        No employment contracts recorded yet.
      </div>
    );
  }

  return (
    <div className="mt-4 grid gap-3 md:grid-cols-2">
      {contracts.map((contract) => (
        <article className="rounded-md border border-border p-4" key={contract.id}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary-blue">
                {contract.contract_number}
              </p>
              <h4 className="mt-1 font-bold text-foreground">
                {contract.title || formatLabel(contract.contract_type)}
              </h4>
            </div>
            <span
              className={`w-fit ${opsStatusBadgeClass(contract.status)}`}
            >
              {formatLabel(contract.status)}
            </span>
          </div>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <HrMetric label="Type" value={formatLabel(contract.contract_type)} />
            <HrMetric
              label="Total salary"
              value={`ZMW ${formatNumber(contract.salary_amount)} / ${formatLabel(contract.pay_frequency)}`}
            />
            <HrMetric label="Basic pay" value={`ZMW ${formatNumber(contract.basic_pay)}`} />
            <HrMetric
              label="Housing allowance"
              value={`ZMW ${formatNumber(contract.housing_allowance)}`}
            />
            <HrMetric
              label="Other allowances"
              value={`ZMW ${formatNumber(contract.other_allowances_total)}`}
            />
            <HrMetric
              label="Leave rate"
              value={`${formatNumber(contract.leave_rate_per_month)} days / month`}
            />
            <HrMetric label="Start" value={formatDate(contract.start_date)} />
            <HrMetric label="End" value={formatDate(contract.end_date)} />
            <HrMetric label="Probation end" value={formatDate(contract.probation_end_date)} />
            <HrMetric label="Signed" value={formatDate(contract.signed_at)} />
          </dl>
          {contract.termination_reason ? (
            <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm leading-6 text-red-800">
              {contract.termination_reason}
            </p>
          ) : contract.notes ? (
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{contract.notes}</p>
          ) : null}
          {canManage && contract.status !== "cancelled" ? (
            <details className="mt-3 rounded-md border border-border">
              <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-bold text-foreground transition hover:text-primary-blue [&::-webkit-details-marker]:hidden">
                <Pencil className="size-4" aria-hidden="true" />
                Edit pay structure
              </summary>
              <form
                action={updateEmployeeContractAction}
                className="grid gap-3 border-t border-border p-3 sm:grid-cols-2"
              >
                <input name="contract_id" type="hidden" value={contract.id} />
                <input name="employee_id" type="hidden" value={contract.employee_id} />
                <input name="status" type="hidden" value={contract.status} />
                <label className={OPS_LABEL_CLASS}>
                  Basic pay (ZMW)
                  <input
                    className={OPS_INPUT_CLASS}
                    defaultValue={String(contract.basic_pay)}
                    min="0"
                    name="basic_pay"
                    required
                    step="0.01"
                    type="number"
                  />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Housing allowance (ZMW)
                  <input
                    className={OPS_INPUT_CLASS}
                    defaultValue={String(contract.housing_allowance)}
                    min="0"
                    name="housing_allowance"
                    step="0.01"
                    type="number"
                  />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Other allowances total (ZMW)
                  <input
                    className={OPS_INPUT_CLASS}
                    defaultValue={String(contract.other_allowances_total)}
                    min="0"
                    name="other_allowances_amount"
                    step="0.01"
                    type="number"
                  />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Leave rate (days / month)
                  <input
                    className={OPS_INPUT_CLASS}
                    defaultValue={String(contract.leave_rate_per_month)}
                    min="0"
                    name="leave_rate_per_month"
                    step="0.01"
                    type="number"
                  />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Type
                  <select
                    className={OPS_INPUT_CLASS}
                    defaultValue={contract.contract_type}
                    name="contract_type"
                  >
                    <option value="full_time">Full-time</option>
                    <option value="part_time">Part-time</option>
                    <option value="contractor">Contractor</option>
                    <option value="intern">Intern</option>
                  </select>
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Pay frequency
                  <select
                    className={OPS_INPUT_CLASS}
                    defaultValue={contract.pay_frequency}
                    name="pay_frequency"
                  >
                    {PAY_FREQUENCY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Title
                  <input
                    className={OPS_INPUT_CLASS}
                    defaultValue={contract.title}
                    name="title"
                  />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Start date
                  <input
                    className={OPS_INPUT_CLASS}
                    defaultValue={contract.start_date}
                    name="start_date"
                    type="date"
                  />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  End date
                  <input
                    className={OPS_INPUT_CLASS}
                    defaultValue={contract.end_date ?? ""}
                    name="end_date"
                    type="date"
                  />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Probation end
                  <input
                    className={OPS_INPUT_CLASS}
                    defaultValue={contract.probation_end_date ?? ""}
                    name="probation_end_date"
                    type="date"
                  />
                </label>
                <label className={`${OPS_LABEL_CLASS} sm:col-span-2`}>
                  Notes
                  <textarea
                    className={`${OPS_INPUT_CLASS} min-h-20`}
                    defaultValue={contract.notes}
                    name="notes"
                  />
                </label>
                <div className="sm:col-span-2">
                  <button className={OPS_SECONDARY_BUTTON_CLASS} type="submit">
                    <Pencil className="size-4" aria-hidden="true" />
                    Save contract
                  </button>
                </div>
              </form>
            </details>
          ) : null}
          {canManage && contract.status !== "cancelled" ? (
            <form
              action={updateEmployeeContractStatusAction}
              className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end"
            >
              <input name="contract_id" type="hidden" value={contract.id} />
              <label className={`${OPS_LABEL_CLASS} flex-1`}>
                Update status
                <select className={OPS_INPUT_CLASS} defaultValue={contract.status} name="status">
                  {CONTRACT_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={`${OPS_LABEL_CLASS} flex-1`}>
                Termination reason
                <input
                  className={OPS_INPUT_CLASS}
                  name="termination_reason"
                  placeholder="Required when terminating"
                />
              </label>
              <button className={OPS_SECONDARY_BUTTON_CLASS} type="submit">
                Save
              </button>
            </form>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function EmployeeDocumentsPanel({
  categories,
  documents,
  role,
}: {
  categories: OpsHrDocumentCategorySummary[];
  documents: OpsEmployeeDocumentSummary[];
  role: OpsUserRole;
}) {
  if (documents.length === 0) {
    return (
      <div className="mt-4 rounded-md border border-border px-4 py-3 text-sm text-muted-foreground">
        No HR documents linked yet.
      </div>
    );
  }

  return (
    <div className="mt-4 grid gap-3 md:grid-cols-2">
      {documents.map((document) => {
        const version = currentEmployeeDocumentVersion(document);
        const category =
          document.category ??
          categories.find((item) => item.id === document.category_id) ??
          null;

        return (
          <article className="rounded-md border border-border p-4" key={document.id}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary-blue">
                  {category?.category_code ?? "hr"}
                </p>
                <h4 className="mt-1 font-bold text-foreground">
                  {document.document?.title ?? category?.name ?? "Employee document"}
                </h4>
              </div>
              <span className={`w-fit ${opsStatusBadgeClass(document.status, employeeDocumentStatusTone(document.status, document.expiry_date))}`}>
                {document.expiry_date && document.expiry_date < new Date().toISOString().slice(0, 10)
                  ? "Expired"
                  : formatLabel(document.status)}
              </span>
            </div>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <HrMetric label="Uploaded" value={formatDate(document.created_at.slice(0, 10))} />
              <HrMetric label="Expiry" value={formatDate(document.expiry_date)} />
            </dl>
            {document.review_notes ? (
              <p className="mt-3 rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-sm leading-6 text-orange-800">
                {document.review_notes}
              </p>
            ) : null}
            {version ? (
              <a
                className={`${OPS_SECONDARY_BUTTON_CLASS} mt-3 w-full justify-center sm:w-auto`}
                href={`/api/ops/documents/${version.id}/download`}
              >
                <Download className="size-4" aria-hidden="true" />
                Download
              </a>
            ) : null}
            <EmployeeDocumentReviewControls document={document} role={role} />
          </article>
        );
      })}
    </div>
  );
}

function LeaveControls({
  actorId,
  leaveRequest,
  role,
}: {
  actorId: string;
  leaveRequest: OpsLeaveRequestSummary & { employee_user_id?: string | null };
  role: OpsUserRole;
}) {
  const canSubmit = canSubmitOpsLeaveRequest(actorId, role, leaveRequest);
  const canApprove = canApproveOpsLeaveRequest(role, leaveRequest);
  const canReject = canRejectOpsLeaveRequest(role, leaveRequest);
  const canCancel = canCancelOpsLeaveRequest(actorId, role, leaveRequest);
  const canComplete = canCompleteOpsLeaveRequest(role, leaveRequest);

  return (
    <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
      {canSubmit ? (
        <form action={submitLeaveRequestAction}>
          <input name="leave_request_id" type="hidden" value={leaveRequest.id} />
          <button className={`${OPS_PRIMARY_BUTTON_CLASS} w-full`} type="submit">
            <Send className="size-4" aria-hidden="true" />
            Submit
          </button>
        </form>
      ) : null}
      {canApprove ? (
        <form action={approveLeaveRequestAction}>
          <input name="leave_request_id" type="hidden" value={leaveRequest.id} />
          <button className={`${OPS_PRIMARY_BUTTON_CLASS} w-full`} type="submit">
            <CheckCircle2 className="size-4" aria-hidden="true" />
            Approve
          </button>
        </form>
      ) : null}
      {canComplete ? (
        <form action={completeLeaveRequestAction}>
          <input name="leave_request_id" type="hidden" value={leaveRequest.id} />
          <button className={`${OPS_SECONDARY_BUTTON_CLASS} w-full`} type="submit">
            <CalendarCheck className="size-4" aria-hidden="true" />
            Complete
          </button>
        </form>
      ) : null}
      {canReject ? (
        <details className="rounded-md border border-border md:col-span-2">
          <summary className={`cursor-pointer list-none px-3 py-3 text-sm font-bold text-foreground [&::-webkit-details-marker]:hidden ${OPS_FOCUS_CLASS}`}>
            Reject request
          </summary>
          <form action={rejectLeaveRequestAction} className="grid gap-3 border-t border-border p-3">
            <input name="leave_request_id" type="hidden" value={leaveRequest.id} />
            <label className={OPS_LABEL_CLASS}>
              Rejection reason
              <textarea className={`${OPS_INPUT_CLASS} min-h-20`} name="rejection_reason" />
            </label>
            <button className={`${OPS_DANGER_BUTTON_CLASS} min-h-11 justify-center`} type="submit">
              <XCircle className="size-4" aria-hidden="true" />
              Reject
            </button>
          </form>
        </details>
      ) : null}
      {canCancel ? (
        <form action={cancelLeaveRequestAction}>
          <input name="leave_request_id" type="hidden" value={leaveRequest.id} />
          <OpsConfirmSubmitButton
            className={`${OPS_DANGER_BUTTON_CLASS} min-h-11 w-full justify-center`}
            confirmText="Cancel leave request"
          >
            <XCircle className="size-4" aria-hidden="true" />
            Cancel
          </OpsConfirmSubmitButton>
        </form>
      ) : null}
    </div>
  );
}

function OnboardingControls({
  item,
  role,
}: {
  item: OpsEmployeeOnboardingItemSummary;
  role: OpsUserRole;
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {canStartOpsEmployeeOnboardingItem(role, item) ? (
        <form action={startEmployeeOnboardingItemAction}>
          <input name="onboarding_item_id" type="hidden" value={item.id} />
          <button className={OPS_SECONDARY_BUTTON_CLASS} type="submit">
            Start
          </button>
        </form>
      ) : null}
      {canCompleteOpsEmployeeOnboardingItem(role, item) ? (
        <details className="w-full rounded-md border border-border">
          <summary className={`cursor-pointer list-none px-3 py-3 text-sm font-bold text-foreground [&::-webkit-details-marker]:hidden ${OPS_FOCUS_CLASS}`}>
            Complete item
          </summary>
          <form action={completeEmployeeOnboardingItemAction} className="grid gap-3 border-t border-border p-3">
            <input name="onboarding_item_id" type="hidden" value={item.id} />
            <label className={OPS_LABEL_CLASS}>
              Completion notes
              <textarea className={`${OPS_INPUT_CLASS} min-h-20`} name="completion_notes" />
            </label>
            <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
              Complete
            </button>
          </form>
        </details>
      ) : null}
      {canWaiveOpsEmployeeOnboardingItem(role, item) ? (
        <form action={waiveEmployeeOnboardingItemAction}>
          <input name="onboarding_item_id" type="hidden" value={item.id} />
          <button className={OPS_SECONDARY_BUTTON_CLASS} type="submit">
            Waive
          </button>
        </form>
      ) : null}
      {canCancelOpsEmployeeOnboardingItem(role, item) ? (
        <form action={cancelEmployeeOnboardingItemAction}>
          <input name="onboarding_item_id" type="hidden" value={item.id} />
          <OpsConfirmSubmitButton
            className={`${OPS_DANGER_BUTTON_CLASS} min-h-11 justify-center`}
            confirmText="Cancel onboarding item"
          >
            Cancel
          </OpsConfirmSubmitButton>
        </form>
      ) : null}
    </div>
  );
}

function RecruitmentControls({
  requisition,
  role,
}: {
  requisition: OpsRecruitmentRequisitionSummary;
  role: OpsUserRole;
}) {
  if (!canManageOpsRecruitmentRequisition(role, requisition)) {
    return null;
  }

  return (
    <form action={updateRecruitmentRequisitionStatusAction} className="mt-3 grid gap-2 min-[520px]:grid-cols-[1fr_auto]">
      <input name="requisition_id" type="hidden" value={requisition.id} />
      <label className="sr-only" htmlFor={`requisition-status-${requisition.id}`}>
        Recruitment status
      </label>
      <select
        className={OPS_INPUT_CLASS}
        defaultValue={requisition.status}
        id={`requisition-status-${requisition.id}`}
        name="status"
      >
        {RECRUITMENT_STATUS_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <button className={OPS_SECONDARY_BUTTON_CLASS} type="submit">
        Save
      </button>
    </form>
  );
}

export default async function OpsEmployeesPage({ searchParams }: PageProps) {
  const [params, auth] = await Promise.all([
    searchParams ?? Promise.resolve({} as OpsSearchParams),
    requireOpsUser(),
  ]);

  if (!canAccessOpsHref(auth.profile.role, "/ops/employees")) {
    notFound();
  }

  const listState = parseOpsListState(params, { defaultPageSize: 8 });
  const status = statusFromParam(firstParam(params.status));
  const [
    employeePage,
    stats,
    siteOptions,
    userOptions,
    employeeOptions,
    recruitmentRequisitions,
    hrDocumentCategories,
    hrDocumentCoverage,
    trainingRenewals,
  ] = await Promise.all([
    fetchPaginatedOpsEmployees({
      listState,
      query: listState.query,
      status: status || undefined,
    }),
    fetchOpsHrStats(),
    fetchActiveSiteOptions(),
    fetchHrUserOptions(),
    fetchActiveEmployeeOptions(),
    fetchRecentRecruitmentRequisitions(),
    fetchHrDocumentCategories(),
    fetchOpsHrDocumentCoverageReport(),
    fetchRecentHrTrainingRenewals(),
  ]);
  const notice = hrNotice(params);
  const canCreateEmployee = canCreateOpsEmployee(auth.profile.role);
  const canCreateLeave = canCreateOpsLeaveRequest(auth.profile.role);
  const canCreateRecruitment = canCreateOpsRecruitmentRequisition(auth.profile.role);
  const canCreateContract = canCreateOpsEmployeeContract(auth.profile.role);
  const canViewContracts = canManageOpsEmployeeContract(auth.profile.role);
  const canCreateAppraisal = canCreateOpsPerformanceAppraisal(auth.profile.role);
  const canCreateOnboarding = canCreateOpsEmployeeOnboardingItem(auth.profile.role);
  const canManageLeaveBalance = canManageOpsLeaveBalance(auth.profile.role);
  const canManageHrCategory = canManageOpsHrDocumentCategory(auth.profile.role);
  const canUpdateStatus = canUpdateOpsEmployeeStatus(auth.profile.role);
  const canOpenHseTraining = canAccessOpsHref(auth.profile.role, "/ops/hse-compliance");
  const hasActiveListFilter = listState.query.length > 0 || Boolean(status);
  const createPanel = firstParam(params.create);
  const openEmployeePanel = createPanel === "employee";
  const openLeavePanel = createPanel === "leave";
  const openRecruitmentPanel = createPanel === "recruitment";
  const openContractPanel = createPanel === "contract";
  const openAppraisalPanel = createPanel === "appraisal";
  const openOnboardingPanel = createPanel === "onboarding";
  const openBalancePanel = createPanel === "balance";
  const openCategoryPanel = createPanel === "category";
  const openDocumentPanel = createPanel === "document";
  const hrDashboardActions = buildOpsHrDashboardActions(stats);
  const today = todayInLusaka();

  return (
    <div className="w-full max-w-none space-y-6">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-blue">
            Admin and HR
          </p>
          <h1 className="mt-2 font-heading text-3xl font-bold text-foreground">
            Employees, leave, and HR controls
          </h1>
          <p className="mt-3 max-w-3xl text-base leading-7 text-foreground/68">
            Maintain employee records, recruitment, contracts, appraisals, leave balances, and HR documents.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canCreateEmployee ? (
            <Link className={OPS_PRIMARY_BUTTON_CLASS} href="/ops/employees?create=employee#employee-create-panel">
              <Plus className="size-4" aria-hidden="true" />
              New employee
            </Link>
          ) : null}
          {canCreateLeave ? (
            <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/employees?create=leave#leave-create-panel">
              <CalendarCheck className="size-4" aria-hidden="true" />
              Leave request
            </Link>
          ) : null}
          {canCreateRecruitment ? (
            <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/employees?create=recruitment#recruitment-create-panel">
              <FolderKanban className="size-4" aria-hidden="true" />
              Recruitment
            </Link>
          ) : null}
          {canCreateContract ? (
            <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/employees?create=contract#contract-create-panel">
              <FileText className="size-4" aria-hidden="true" />
              Contract
            </Link>
          ) : null}
          {canCreateAppraisal ? (
            <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/employees?create=appraisal#appraisal-create-panel">
              <Star className="size-4" aria-hidden="true" />
              Appraisal
            </Link>
          ) : null}
          {canCreateOnboarding ? (
            <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/employees?create=onboarding#onboarding-create-panel">
              <ListChecks className="size-4" aria-hidden="true" />
              Onboarding
            </Link>
          ) : null}
          {canManageLeaveBalance ? (
            <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/employees?create=balance#leave-balance-panel">
              <Wallet className="size-4" aria-hidden="true" />
              Balance
            </Link>
          ) : null}
          {canManageHrCategory ? (
            <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/employees?create=category#hr-document-category-panel">
              <NotebookTabs className="size-4" aria-hidden="true" />
              HR docs
            </Link>
          ) : null}
          {canManageHrCategory ? (
            <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/employees?create=document#employee-document-panel">
              <Upload className="size-4" aria-hidden="true" />
              Upload file
            </Link>
          ) : null}
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

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <OpsKpiCard
          href="/ops/employees?status=active#employee-register"
          icon={Users}
          label="Active employees"
          tone="good"
          hint="Active/probation"
          value={String(stats.activeEmployees)}
        />
        <OpsKpiCard
          href="/ops/employees?status=on_leave#employee-register"
          icon={CalendarCheck}
          label="On leave"
          tone={stats.onLeave > 0 ? "warn" : "default"}
          hint="Current status"
          value={String(stats.onLeave)}
        />
        <OpsKpiCard
          href="/ops/employees#employee-register"
          icon={ListChecks}
          label="Onboarding open"
          tone={stats.overdueOnboardingItems > 0 ? "warn" : "default"}
          trend={`${stats.overdueOnboardingItems} overdue`}
          value={String(stats.openOnboardingItems)}
        />
        <OpsKpiCard
          href="/ops/employees#training-renewals"
          icon={GraduationCap}
          label="Training renewal"
          tone={stats.expiredTraining > 0 || stats.trainingDueSoon > 0 ? "warn" : "default"}
          trend={`${stats.expiredTraining} expired`}
          value={String(stats.trainingDueSoon)}
        />
        <OpsKpiCard
          href="/ops/employees#hr-document-coverage"
          icon={FileCheck2}
          label="HR documents"
          tone={hrDocumentCoverage.missingRequiredSlots > 0 ? "warn" : "default"}
          trend={`${hrDocumentCoverage.submittedDocuments} pending review`}
          value={String(hrDocumentCoverage.missingRequiredSlots)}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-3" id="hr-document-coverage">
        <HrDashboardActionQueue actions={hrDashboardActions} />
        <HrSignalPanel stats={stats} />
        <HrDocumentCoveragePanel report={hrDocumentCoverage} />
      </section>

      {canCreateEmployee ? (
        <details
          className="scroll-mt-24 rounded-lg border border-border bg-card"
          id="employee-create-panel"
          open={openEmployeePanel}
        >
          <summary className={`flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden ${OPS_FOCUS_CLASS}`}>
            <span className="flex size-10 items-center justify-center rounded-md bg-primary-blue text-white">
              <UserCheck className="size-5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-heading text-xl font-bold text-foreground">
                Create employee record
              </span>
              <span className="mt-1 block text-sm text-muted-foreground">
                Capture job, department, site, contact, emergency contact, and optional staff-user link.
              </span>
            </span>
            <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Open
            </span>
          </summary>
          <form action={createEmployeeAction} className="grid gap-4 border-t border-border p-5 min-[520px]:grid-cols-2 lg:grid-cols-6">
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
              Full name
              <input className={OPS_INPUT_CLASS} name="full_name" required />
            </label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
              Job title
              <input className={OPS_INPUT_CLASS} name="job_title" />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Department
              <input className={OPS_INPUT_CLASS} name="department" />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Start date
              <input className={OPS_INPUT_CLASS} defaultValue={today} name="start_date" type="date" />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Employment type
              <select className={OPS_INPUT_CLASS} defaultValue="full_time" name="employment_type">
                {EMPLOYMENT_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={OPS_LABEL_CLASS}>
              Status
              <select className={OPS_INPUT_CLASS} defaultValue="active" name="status">
                {EMPLOYEE_STATUS_OPTIONS.filter((option) => option.value).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
              Site
              <select className={OPS_INPUT_CLASS} name="site_id">
                <option value="">No site assignment</option>
                {siteOptions.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.code} - {site.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
              Staff user link
              <select className={OPS_INPUT_CLASS} name="user_id">
                <option value="">No user link</option>
                {userOptions.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.full_name} / {formatLabel(user.role)}
                  </option>
                ))}
              </select>
            </label>
            <label className={OPS_LABEL_CLASS}>
              Phone
              <input className={OPS_INPUT_CLASS} name="phone" />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Email
              <input className={OPS_INPUT_CLASS} name="email" type="email" />
            </label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
              Emergency contact
              <input className={OPS_INPUT_CLASS} name="emergency_contact_name" />
            </label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
              Emergency phone
              <input className={OPS_INPUT_CLASS} name="emergency_contact_phone" />
            </label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
              NRC No.
              <input className={OPS_INPUT_CLASS} maxLength={32} name="nrc_number" />
            </label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
              NAPSA Security No.
              <input className={OPS_INPUT_CLASS} maxLength={32} name="napsa_number" />
            </label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
              TPIN
              <input className={OPS_INPUT_CLASS} maxLength={32} name="tpin" />
              <span className="mt-1 block text-xs font-normal text-muted-foreground">
                ZRA Taxpayer Identification Number. Appears on the employee&apos;s payslip.
              </span>
            </label>
            <label className={`${OPS_LABEL_CLASS} min-[520px]:col-span-2 lg:col-span-6`}>
              Notes
              <textarea className={`${OPS_INPUT_CLASS} min-h-24`} name="notes" />
            </label>
            <div className="flex items-end min-[520px]:col-span-2 lg:col-span-6">
              <button className={`${OPS_PRIMARY_BUTTON_CLASS} w-full md:w-auto`} type="submit">
                <Plus className="size-4" aria-hidden="true" />
                Create employee
              </button>
            </div>
          </form>
        </details>
      ) : null}

      {canCreateLeave ? (
        <details
          className="scroll-mt-24 rounded-lg border border-border bg-card"
          id="leave-create-panel"
          open={openLeavePanel}
        >
          <summary className={`flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden ${OPS_FOCUS_CLASS}`}>
            <span className="flex size-10 items-center justify-center rounded-md bg-primary-dark text-white">
              <CalendarCheck className="size-5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-heading text-xl font-bold text-foreground">
                Create leave request
              </span>
              <span className="mt-1 block text-sm text-muted-foreground">
                Record dates, leave type, requested days, reason, and handover notes.
              </span>
            </span>
            <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Open
            </span>
          </summary>
          {employeeOptions.length === 0 ? (
            <div className="border-t border-border p-5">
              <div className={OPS_NOTICE_WARNING_CLASS}>
                Create an active employee record before adding leave requests.
              </div>
            </div>
          ) : (
            <form action={createLeaveRequestAction} className="grid gap-4 border-t border-border p-5 min-[520px]:grid-cols-2 lg:grid-cols-6">
              <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
                Employee
                <select className={OPS_INPUT_CLASS} name="employee_id" required>
                  <option value="">Select employee</option>
                  {employeeOptions.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.employee_number} - {employee.full_name}
                    </option>
                  ))}
                </select>
              </label>
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
                Start date
                <input className={OPS_INPUT_CLASS} defaultValue={today} name="start_date" type="date" />
              </label>
              <label className={OPS_LABEL_CLASS}>
                End date
                <input className={OPS_INPUT_CLASS} defaultValue={today} name="end_date" type="date" />
              </label>
              <label className={OPS_LABEL_CLASS}>
                Days
                <input className={OPS_INPUT_CLASS} min="0" name="days_requested" step="0.5" type="number" />
              </label>
              <label className={`${OPS_LABEL_CLASS} min-[520px]:col-span-2 lg:col-span-3`}>
                Reason
                <textarea className={`${OPS_INPUT_CLASS} min-h-24`} name="reason" />
              </label>
              <label className={`${OPS_LABEL_CLASS} min-[520px]:col-span-2 lg:col-span-3`}>
                Handover notes
                <textarea className={`${OPS_INPUT_CLASS} min-h-24`} name="handover_notes" />
              </label>
              <div className="flex items-end min-[520px]:col-span-2 lg:col-span-6">
                <button className={`${OPS_PRIMARY_BUTTON_CLASS} w-full md:w-auto`} type="submit">
                  <Plus className="size-4" aria-hidden="true" />
                  Create leave request
                </button>
              </div>
            </form>
          )}
        </details>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-2">
        {canCreateRecruitment ? (
          <details
            className="scroll-mt-24 rounded-lg border border-border bg-card"
            id="recruitment-create-panel"
            open={openRecruitmentPanel}
          >
            <summary className={`flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden ${OPS_FOCUS_CLASS}`}>
              <span className="flex size-10 items-center justify-center rounded-md bg-primary-blue text-white">
                <FolderKanban className="size-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-heading text-xl font-bold text-foreground">
                  Recruitment requisition
                </span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  Request headcount by site, department, priority, and target start date.
                </span>
              </span>
              <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                Open
              </span>
            </summary>
            <form action={createRecruitmentRequisitionAction} className="grid gap-4 border-t border-border p-5 min-[520px]:grid-cols-2">
              <label className={`${OPS_LABEL_CLASS} min-[520px]:col-span-2`}>
                Job title
                <input className={OPS_INPUT_CLASS} name="job_title" required />
              </label>
              <label className={OPS_LABEL_CLASS}>
                Department
                <input className={OPS_INPUT_CLASS} name="department" />
              </label>
              <label className={OPS_LABEL_CLASS}>
                Employment type
                <select className={OPS_INPUT_CLASS} defaultValue="full_time" name="employment_type">
                  {EMPLOYMENT_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={OPS_LABEL_CLASS}>
                Positions
                <input className={OPS_INPUT_CLASS} defaultValue="1" min="1" name="positions_count" type="number" />
              </label>
              <label className={OPS_LABEL_CLASS}>
                Priority
                <select className={OPS_INPUT_CLASS} defaultValue="normal" name="priority">
                  {PRIORITY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={OPS_LABEL_CLASS}>
                Target start
                <input className={OPS_INPUT_CLASS} name="target_start_date" type="date" />
              </label>
              <label className={OPS_LABEL_CLASS}>
                Salary range
                <input className={OPS_INPUT_CLASS} name="salary_range" />
              </label>
              <label className={OPS_LABEL_CLASS}>
                Site
                <select className={OPS_INPUT_CLASS} name="site_id">
                  <option value="">No site link</option>
                  {siteOptions.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.code} - {site.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={OPS_LABEL_CLASS}>
                Hiring manager
                <select className={OPS_INPUT_CLASS} name="hiring_manager_id">
                  <option value="">Unassigned</option>
                  {userOptions.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.full_name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={`${OPS_LABEL_CLASS} min-[520px]:col-span-2`}>
                Justification
                <textarea className={`${OPS_INPUT_CLASS} min-h-24`} name="justification" />
              </label>
              <button className={`${OPS_PRIMARY_BUTTON_CLASS} min-[520px]:col-span-2`} type="submit">
                <Plus className="size-4" aria-hidden="true" />
                Create requisition
              </button>
            </form>
          </details>
        ) : null}

        {canCreateContract ? (
          <details
            className="scroll-mt-24 rounded-lg border border-border bg-card"
            id="contract-create-panel"
            open={openContractPanel}
          >
            <summary className={`flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden ${OPS_FOCUS_CLASS}`}>
              <span className="flex size-10 items-center justify-center rounded-md bg-primary-dark text-white">
                <FileText className="size-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-heading text-xl font-bold text-foreground">
                  Employee contract
                </span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  Register contract type, dates, pay basis, salary, and signing status.
                </span>
              </span>
              <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                Open
              </span>
            </summary>
            {employeeOptions.length === 0 ? (
              <div className="border-t border-border p-5">
                <div className={OPS_NOTICE_WARNING_CLASS}>
                  Create an active employee record before adding contracts.
                </div>
              </div>
            ) : (
              <form action={createEmployeeContractAction} className="grid gap-4 border-t border-border p-5 min-[520px]:grid-cols-2">
                <label className={`${OPS_LABEL_CLASS} min-[520px]:col-span-2`}>
                  Employee
                  <select className={OPS_INPUT_CLASS} name="employee_id" required>
                    <option value="">Select employee</option>
                    {employeeOptions.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.employee_number} - {employee.full_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Contract type
                  <select className={OPS_INPUT_CLASS} defaultValue="full_time" name="contract_type">
                    {EMPLOYMENT_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Status
                  <select className={OPS_INPUT_CLASS} defaultValue="draft" name="status">
                    {CONTRACT_STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Start date
                  <input className={OPS_INPUT_CLASS} defaultValue={today} name="start_date" type="date" />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  End date
                  <input className={OPS_INPUT_CLASS} name="end_date" type="date" />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Probation end
                  <input className={OPS_INPUT_CLASS} name="probation_end_date" type="date" />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Pay frequency
                  <select className={OPS_INPUT_CLASS} defaultValue="monthly" name="pay_frequency">
                    {PAY_FREQUENCY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Basic pay (ZMW)
                  <input
                    className={OPS_INPUT_CLASS}
                    min="0"
                    name="basic_pay"
                    required
                    step="0.01"
                    type="number"
                  />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Housing allowance (ZMW)
                  <input
                    className={OPS_INPUT_CLASS}
                    min="0"
                    name="housing_allowance"
                    step="0.01"
                    type="number"
                  />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Other allowances total (ZMW)
                  <input
                    className={OPS_INPUT_CLASS}
                    min="0"
                    name="other_allowances_amount"
                    step="0.01"
                    type="number"
                  />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Leave rate (days per month)
                  <input
                    className={OPS_INPUT_CLASS}
                    defaultValue="2.5"
                    min="0"
                    name="leave_rate_per_month"
                    step="0.01"
                    type="number"
                  />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Title
                  <input className={OPS_INPUT_CLASS} name="title" />
                </label>
                <label className={`${OPS_LABEL_CLASS} min-[520px]:col-span-2`}>
                  Notes
                  <textarea className={`${OPS_INPUT_CLASS} min-h-24`} name="notes" />
                </label>
                <button className={`${OPS_PRIMARY_BUTTON_CLASS} min-[520px]:col-span-2`} type="submit">
                  <Plus className="size-4" aria-hidden="true" />
                  Create contract
                </button>
              </form>
            )}
          </details>
        ) : null}

        {canCreateAppraisal ? (
          <details
            className="scroll-mt-24 rounded-lg border border-border bg-card"
            id="appraisal-create-panel"
            open={openAppraisalPanel}
          >
            <summary className={`flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden ${OPS_FOCUS_CLASS}`}>
              <span className="flex size-10 items-center justify-center rounded-md bg-primary-blue text-white">
                <Star className="size-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-heading text-xl font-bold text-foreground">
                  Performance appraisal
                </span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  Plan appraisal cycles with reviewer, period, status, and goals.
                </span>
              </span>
              <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                Open
              </span>
            </summary>
            {employeeOptions.length === 0 ? (
              <div className="border-t border-border p-5">
                <div className={OPS_NOTICE_WARNING_CLASS}>
                  Create an active employee record before adding appraisals.
                </div>
              </div>
            ) : (
              <form action={createPerformanceAppraisalAction} className="grid gap-4 border-t border-border p-5 min-[520px]:grid-cols-2">
                <label className={`${OPS_LABEL_CLASS} min-[520px]:col-span-2`}>
                  Employee
                  <select className={OPS_INPUT_CLASS} name="employee_id" required>
                    <option value="">Select employee</option>
                    {employeeOptions.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.employee_number} - {employee.full_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Cycle
                  <input className={OPS_INPUT_CLASS} name="cycle_name" placeholder="2026 mid-year" />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Status
                  <select className={OPS_INPUT_CLASS} defaultValue="planned" name="status">
                    {APPRAISAL_STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Period start
                  <input className={OPS_INPUT_CLASS} defaultValue={today} name="period_start" type="date" />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Period end
                  <input className={OPS_INPUT_CLASS} defaultValue={today} name="period_end" type="date" />
                </label>
                <label className={`${OPS_LABEL_CLASS} min-[520px]:col-span-2`}>
                  Reviewer
                  <select className={OPS_INPUT_CLASS} name="reviewer_id">
                    <option value="">Unassigned</option>
                    {userOptions.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.full_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={`${OPS_LABEL_CLASS} min-[520px]:col-span-2`}>
                  Goals
                  <textarea className={`${OPS_INPUT_CLASS} min-h-24`} name="goals" />
                </label>
                <button className={`${OPS_PRIMARY_BUTTON_CLASS} min-[520px]:col-span-2`} type="submit">
                  <Plus className="size-4" aria-hidden="true" />
                  Create appraisal
                </button>
              </form>
            )}
          </details>
        ) : null}

        {canManageLeaveBalance ? (
          <details
            className="scroll-mt-24 rounded-lg border border-border bg-card"
            id="leave-balance-panel"
            open={openBalancePanel}
          >
            <summary className={`flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden ${OPS_FOCUS_CLASS}`}>
              <span className="flex size-10 items-center justify-center rounded-md bg-primary-dark text-white">
                <Wallet className="size-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-heading text-xl font-bold text-foreground">
                  Leave balance
                </span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  Set annual, sick, unpaid, or other leave balances per employee and year.
                </span>
              </span>
              <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                Open
              </span>
            </summary>
            {employeeOptions.length === 0 ? (
              <div className="border-t border-border p-5">
                <div className={OPS_NOTICE_WARNING_CLASS}>
                  Create an active employee record before setting balances.
                </div>
              </div>
            ) : (
              <form action={upsertLeaveBalanceAction} className="grid gap-4 border-t border-border p-5 min-[520px]:grid-cols-2">
                <label className={`${OPS_LABEL_CLASS} min-[520px]:col-span-2`}>
                  Employee
                  <select className={OPS_INPUT_CLASS} name="employee_id" required>
                    <option value="">Select employee</option>
                    {employeeOptions.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.employee_number} - {employee.full_name}
                      </option>
                    ))}
                  </select>
                </label>
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
                  Year
                  <input className={OPS_INPUT_CLASS} defaultValue={new Date().getFullYear()} name="balance_year" type="number" />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Opening
                  <input className={OPS_INPUT_CLASS} name="opening_balance" step="0.5" type="number" />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Accrued
                  <input className={OPS_INPUT_CLASS} name="accrued_days" step="0.5" type="number" />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Used
                  <input className={OPS_INPUT_CLASS} min="0" name="used_days" step="0.5" type="number" />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Adjustment
                  <input className={OPS_INPUT_CLASS} name="adjustment_days" step="0.5" type="number" />
                </label>
                <label className={`${OPS_LABEL_CLASS} min-[520px]:col-span-2`}>
                  Notes
                  <textarea className={`${OPS_INPUT_CLASS} min-h-20`} name="notes" />
                </label>
                <button className={`${OPS_PRIMARY_BUTTON_CLASS} min-[520px]:col-span-2`} type="submit">
                  Save leave balance
                </button>
              </form>
            )}
          </details>
        ) : null}

        {canManageHrCategory ? (
          <details
            className="scroll-mt-24 rounded-lg border border-border bg-card"
            id="hr-document-category-panel"
            open={openCategoryPanel}
          >
            <summary className={`flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden ${OPS_FOCUS_CLASS}`}>
              <span className="flex size-10 items-center justify-center rounded-md bg-primary-blue text-white">
                <NotebookTabs className="size-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-heading text-xl font-bold text-foreground">
                  HR document category
                </span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  Standardize employee document categories and retention expectations.
                </span>
              </span>
              <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                Open
              </span>
            </summary>
            <form action={createHrDocumentCategoryAction} className="grid gap-4 border-t border-border p-5 min-[520px]:grid-cols-2">
              <label className={OPS_LABEL_CLASS}>
                Code
                <input className={OPS_INPUT_CLASS} name="category_code" placeholder="training" required />
              </label>
              <label className={OPS_LABEL_CLASS}>
                Name
                <input className={OPS_INPUT_CLASS} name="name" required />
              </label>
              <label className={OPS_LABEL_CLASS}>
                Retention years
                <input className={OPS_INPUT_CLASS} min="0" name="retention_years" type="number" />
              </label>
              <label className="flex min-h-11 items-center gap-3 rounded-md border border-border px-3 py-2 text-sm font-semibold text-foreground">
                <input className="size-4" name="is_required" type="checkbox" />
                Required category
              </label>
              <label className={`${OPS_LABEL_CLASS} min-[520px]:col-span-2`}>
                Description
                <textarea className={`${OPS_INPUT_CLASS} min-h-20`} name="description" />
              </label>
              <button className={`${OPS_PRIMARY_BUTTON_CLASS} min-[520px]:col-span-2`} type="submit">
                Add category
              </button>
            </form>
          </details>
        ) : null}

        {canManageHrCategory ? (
          <details
            className="scroll-mt-24 rounded-lg border border-border bg-card"
            id="employee-document-panel"
            open={openDocumentPanel}
          >
            <summary className={`flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden ${OPS_FOCUS_CLASS}`}>
              <span className="flex size-10 items-center justify-center rounded-md bg-primary-dark text-white">
                <Upload className="size-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-heading text-xl font-bold text-foreground">
                  Upload employee document
                </span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  Link private HR evidence to an employee, category, file version, and review status.
                </span>
              </span>
              <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                Open
              </span>
            </summary>
            {employeeOptions.length === 0 || hrDocumentCategories.length === 0 ? (
              <div className="border-t border-border p-5">
                <div className={OPS_NOTICE_WARNING_CLASS}>
                  Create an active employee and HR document category before uploading employee files.
                </div>
              </div>
            ) : (
              <form
                action={uploadEmployeeDocumentAction}
                className="grid gap-4 border-t border-border p-5 min-[520px]:grid-cols-2 lg:grid-cols-6"
              >
                <input name="return_to" type="hidden" value="/ops/employees#employee-register" />
                <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
                  Employee
                  <select className={OPS_INPUT_CLASS} name="employee_id" required>
                    <option value="">Select employee</option>
                    {employeeOptions.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.employee_number} - {employee.full_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
                  Category
                  <select className={OPS_INPUT_CLASS} name="category_id" required>
                    <option value="">Select category</option>
                    {hrDocumentCategories
                      .filter((category) => category.is_active)
                      .map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                          {category.is_required ? " - required" : ""}
                        </option>
                      ))}
                  </select>
                </label>
                <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
                  Expiry date
                  <input className={OPS_INPUT_CLASS} name="expiry_date" type="date" />
                </label>
                <label className={`${OPS_LABEL_CLASS} lg:col-span-3`}>
                  Title
                  <input className={OPS_INPUT_CLASS} name="title" placeholder="Leave blank to use category and employee name" />
                </label>
                <label className={`${OPS_LABEL_CLASS} lg:col-span-3`}>
                  File
                  <input
                    className={OPS_INPUT_CLASS}
                    name="document"
                    required
                    type="file"
                  />
                </label>
                <button className={`${OPS_PRIMARY_BUTTON_CLASS} min-[520px]:col-span-2 lg:col-span-6`} type="submit">
                  <Upload className="size-4" aria-hidden="true" />
                  Upload employee document
                </button>
              </form>
            )}
          </details>
        ) : null}
      </section>

      {canCreateOnboarding ? (
        <details
          className="scroll-mt-24 rounded-lg border border-border bg-card"
          id="onboarding-create-panel"
          open={openOnboardingPanel}
        >
          <summary className={`flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden ${OPS_FOCUS_CLASS}`}>
            <span className="flex size-10 items-center justify-center rounded-md bg-primary-blue text-white">
              <ListChecks className="size-5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-heading text-xl font-bold text-foreground">
                Onboarding checklist item
              </span>
              <span className="mt-1 block text-sm text-muted-foreground">
                Assign induction, document, PPE, training, or policy acknowledgement tasks to an employee.
              </span>
            </span>
            <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Open
            </span>
          </summary>
          {employeeOptions.length === 0 ? (
            <div className="border-t border-border p-5">
              <div className={OPS_NOTICE_WARNING_CLASS}>
                Create an active employee record before adding onboarding checklist items.
              </div>
            </div>
          ) : (
            <form action={createEmployeeOnboardingItemAction} className="grid gap-4 border-t border-border p-5 min-[520px]:grid-cols-2 lg:grid-cols-6">
              <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
                Employee
                <select className={OPS_INPUT_CLASS} name="employee_id" required>
                  <option value="">Select employee</option>
                  {employeeOptions.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.employee_number} - {employee.full_name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
                Title
                <input className={OPS_INPUT_CLASS} name="title" required />
              </label>
              <label className={OPS_LABEL_CLASS}>
                Category
                <input className={OPS_INPUT_CLASS} defaultValue="general" name="category" />
              </label>
              <label className={OPS_LABEL_CLASS}>
                Due date
                <input className={OPS_INPUT_CLASS} name="due_date" type="date" />
              </label>
              <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
                Owner
                <select className={OPS_INPUT_CLASS} name="owner_user_id">
                  <option value="">Unassigned</option>
                  {userOptions.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.full_name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={`${OPS_LABEL_CLASS} min-[520px]:col-span-2 lg:col-span-6`}>
                Description
                <textarea className={`${OPS_INPUT_CLASS} min-h-24`} name="description" />
              </label>
              <div className="flex items-end min-[520px]:col-span-2 lg:col-span-6">
                <button className={`${OPS_PRIMARY_BUTTON_CLASS} w-full md:w-auto`} type="submit">
                  <Plus className="size-4" aria-hidden="true" />
                  Create onboarding item
                </button>
              </div>
            </form>
          )}
        </details>
      ) : null}

      <section className="scroll-mt-24 rounded-lg border border-border bg-card" id="training-renewals">
        <div className="flex items-center justify-between gap-3 border-b border-border p-5">
          <div>
            <h2 className="font-heading text-xl font-bold text-foreground">
              Training renewal watch
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              HSE training records due within 45 days or already expired.
            </p>
          </div>
          <GraduationCap className="size-5 text-primary-blue" aria-hidden="true" />
        </div>
        <div className="grid gap-3 p-5 lg:grid-cols-2">
          {trainingRenewals.length > 0 ? (
            trainingRenewals.map((training: OpsHrTrainingRenewalSummary) => {
              const isExpired =
                training.status === "expired" ||
                (training.expiry_date !== null && training.expiry_date < today);

              return (
                <article className="rounded-md border border-border p-4" key={training.id}>
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary-blue">
                        {training.training_number}
                      </p>
                      <h3 className="mt-1 font-bold text-foreground">
                        {training.training_title || formatLabel(training.training_type)}
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {training.employee
                          ? `${training.employee.employee_number} - ${training.employee.full_name}`
                          : training.trainee_name || "No trainee recorded"}
                      </p>
                    </div>
                    <span className={`w-fit ${opsStatusBadgeClass(training.status, trainingStatusTone(training.status, training.expiry_date))}`}>
                      {isExpired ? "Expired" : "Due soon"}
                    </span>
                  </div>
                  <dl className="mt-4 grid gap-3 sm:grid-cols-3">
                    <HrMetric label="Type" value={formatLabel(training.training_type)} />
                    <HrMetric label="Completed" value={formatDate(training.completed_date)} />
                    <HrMetric label="Expiry" value={formatDate(training.expiry_date)} />
                  </dl>
                  <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                    <HrMetric label="Provider" value={training.provider || "Not recorded"} />
                    <HrMetric
                      label="Site"
                      value={training.site ? `${training.site.code} - ${training.site.name}` : "No site"}
                    />
                  </dl>
                  {canOpenHseTraining ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Link
                        className={OPS_SECONDARY_BUTTON_CLASS}
                        href="/ops/hse-compliance?create=training#training-create-panel"
                      >
                        <GraduationCap className="size-4" aria-hidden="true" />
                        Create renewal
                      </Link>
                      <Link
                        className={OPS_SECONDARY_BUTTON_CLASS}
                        href="/ops/hse-compliance#training-panel"
                      >
                        Training register
                      </Link>
                    </div>
                  ) : null}
                </article>
              );
            })
          ) : (
            <div className="rounded-md border border-border p-5 text-sm text-muted-foreground lg:col-span-2">
              No training renewal alerts at the moment.
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between gap-3 border-b border-border p-5">
            <div>
              <h2 className="font-heading text-xl font-bold text-foreground">
                Recruitment pipeline
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Recent requisitions and hiring status.
              </p>
            </div>
            <FolderKanban className="size-5 text-primary-blue" aria-hidden="true" />
          </div>
          <div className="grid gap-3 p-5">
            {recruitmentRequisitions.length > 0 ? (
              recruitmentRequisitions.map((requisition) => (
                <article className="rounded-md border border-border p-4" key={requisition.id}>
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary-blue">
                        {requisition.requisition_number}
                      </p>
                      <h3 className="mt-1 font-bold text-foreground">{requisition.job_title}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {requisition.department || "No department"} / {requisition.site ? `${requisition.site.code} - ${requisition.site.name}` : "No site"}
                      </p>
                    </div>
                    <StatusPill value={requisition.status} />
                  </div>
                  <dl className="mt-4 grid gap-3 sm:grid-cols-3">
                    <HrMetric label="Positions" value={String(requisition.positions_count)} />
                    <HrMetric label="Priority" value={formatLabel(requisition.priority)} />
                    <HrMetric label="Target" value={formatDate(requisition.target_start_date)} />
                  </dl>
                  {requisition.justification ? (
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">
                      {requisition.justification}
                    </p>
                  ) : null}
                  <RecruitmentControls requisition={requisition} role={auth.profile.role} />
                  <OpsRecordActivityPanel
                    canManage={canManageOpsRecruitmentRequisition(auth.profile.role, requisition)}
                    sourceId={requisition.id}
                    sourceTable="recruitment_requisitions"
                  />
                </article>
              ))
            ) : (
              <div className="rounded-md border border-border p-5 text-sm text-muted-foreground">
                No recruitment requisitions yet.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between gap-3 border-b border-border p-5">
            <div>
              <h2 className="font-heading text-xl font-bold text-foreground">
                HR document categories
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Required and optional HR file categories for employee evidence.
              </p>
            </div>
            <NotebookTabs className="size-5 text-primary-blue" aria-hidden="true" />
          </div>
          <div className="grid gap-3 p-5">
            {hrDocumentCategories.length > 0 ? (
              hrDocumentCategories.map((category) => (
                <article className="rounded-md border border-border p-4" key={category.id}>
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary-blue">
                        {category.category_code}
                      </p>
                      <h3 className="mt-1 font-bold text-foreground">{category.name}</h3>
                    </div>
                    <span className={`w-fit rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${
                      category.is_required
                        ? "border-orange-200 bg-orange-50 text-orange-700"
                        : "border-border bg-muted/40 text-muted-foreground"
                    }`}>
                      {category.is_required ? "Required" : "Optional"}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {category.description || "No description recorded."}
                  </p>
                  <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Retention: {category.retention_years === null ? "Not set" : `${category.retention_years} years`}
                  </p>
                </article>
              ))
            ) : (
              <div className="rounded-md border border-border p-5 text-sm text-muted-foreground">
                No HR document categories yet.
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="scroll-mt-24 rounded-lg border border-border bg-card" id="employee-register">
        <div className="flex items-center justify-between gap-3 border-b border-border p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              HR register
            </p>
            <h2 className="font-heading text-xl font-bold text-foreground">
              Employee records
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {employeePage.pagination.total} matching employee records.
            </p>
          </div>
          <BriefcaseBusiness className="size-6 shrink-0 text-primary-blue" aria-hidden="true" />
        </div>
        <OpsListControls
          action="/ops/employees"
          filters={[
            {
              label: "Status",
              name: "status",
              options: EMPLOYEE_STATUS_OPTIONS,
              value: status,
            },
          ]}
          placeholder="Search employee number, name, job title, department, phone, or email"
          query={listState.query}
          resultLabel="employees"
        />

        {employeePage.items.length > 0 ? (
          <div className="divide-y divide-border">
            {employeePage.items.map((employee: OpsEmployeeSummary) => (
              <article className="p-5" key={employee.id}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-heading text-lg font-bold text-foreground">
                        {employee.employee_number}
                      </h3>
                      <span className={opsStatusBadgeClass(employee.status)}>
                        {formatLabel(employee.status)}
                      </span>
                    </div>
                    <p className="mt-2 font-bold text-foreground">{employee.full_name}</p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {employee.job_title || "No job title"} / {employee.department || "No department"}
                    </p>
                  </div>
                  {canUpdateStatus ? (
                    <form action={updateEmployeeStatusAction} className="grid gap-2 min-[520px]:grid-cols-[1fr_auto] lg:min-w-80">
                      <input name="employee_id" type="hidden" value={employee.id} />
                      <label className="sr-only" htmlFor={`status-${employee.id}`}>
                        Update employee status
                      </label>
                      <select
                        className={OPS_INPUT_CLASS}
                        defaultValue={employee.status}
                        id={`status-${employee.id}`}
                        name="status"
                      >
                        {EMPLOYEE_STATUS_OPTIONS.filter((option) => option.value).map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <button className={OPS_SECONDARY_BUTTON_CLASS} type="submit">
                        Save
                      </button>
                    </form>
                  ) : null}
                </div>

                <dl className="mt-4 grid gap-3 md:grid-cols-4">
                  <HrMetric label="Type" value={formatLabel(employee.employment_type)} />
                  <HrMetric label="Start" value={formatDate(employee.start_date)} />
                  <HrMetric label="Site" value={employee.site ? `${employee.site.code} - ${employee.site.name}` : "Unassigned"} />
                  <HrMetric label="User link" value={employee.user?.full_name ?? "Not linked"} />
                </dl>

                <dl className="mt-3 grid gap-3 md:grid-cols-4">
                  <HrMetric label="Phone" value={employee.phone || "Not recorded"} />
                  <HrMetric label="Email" value={employee.email || "Not recorded"} />
                  <HrMetric label="Emergency" value={employee.emergency_contact_name || "Not recorded"} />
                  <HrMetric label="Emergency phone" value={employee.emergency_contact_phone || "Not recorded"} />
                  <HrMetric label="NRC No." value={employee.nrc_number || "Not recorded"} />
                  <HrMetric label="NAPSA Security No." value={employee.napsa_number || "Not recorded"} />
                  <HrMetric label="TPIN" value={employee.tpin || "Not recorded"} />
                </dl>

                {canUpdateStatus ? (
                  <details className="mt-3 rounded-md border border-border">
                    <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-bold text-foreground transition hover:text-primary-blue [&::-webkit-details-marker]:hidden">
                      <Pencil className="size-4" aria-hidden="true" />
                      Edit employee details
                    </summary>
                    <form
                      action={updateEmployeeAction}
                      className="grid gap-3 border-t border-border p-3 sm:grid-cols-2 lg:grid-cols-3"
                    >
                      <input name="employee_id" type="hidden" value={employee.id} />
                      <input name="status" type="hidden" value={employee.status} />
                      <input name="user_id" type="hidden" value={employee.user?.id ?? ""} />
                      <label className={OPS_LABEL_CLASS}>
                        Full name
                        <input
                          className={OPS_INPUT_CLASS}
                          defaultValue={employee.full_name}
                          name="full_name"
                          required
                        />
                      </label>
                      <label className={OPS_LABEL_CLASS}>
                        Job title
                        <input
                          className={OPS_INPUT_CLASS}
                          defaultValue={employee.job_title}
                          name="job_title"
                        />
                      </label>
                      <label className={OPS_LABEL_CLASS}>
                        Department
                        <input
                          className={OPS_INPUT_CLASS}
                          defaultValue={employee.department}
                          name="department"
                        />
                      </label>
                      <label className={OPS_LABEL_CLASS}>
                        Employment type
                        <select
                          className={OPS_INPUT_CLASS}
                          defaultValue={employee.employment_type}
                          name="employment_type"
                        >
                          {EMPLOYMENT_TYPE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className={OPS_LABEL_CLASS}>
                        Phone
                        <input
                          className={OPS_INPUT_CLASS}
                          defaultValue={employee.phone}
                          name="phone"
                        />
                      </label>
                      <label className={OPS_LABEL_CLASS}>
                        Email
                        <input
                          className={OPS_INPUT_CLASS}
                          defaultValue={employee.email}
                          name="email"
                          type="email"
                        />
                      </label>
                      <label className={OPS_LABEL_CLASS}>
                        NRC No.
                        <input
                          className={OPS_INPUT_CLASS}
                          defaultValue={employee.nrc_number}
                          maxLength={32}
                          name="nrc_number"
                        />
                      </label>
                      <label className={OPS_LABEL_CLASS}>
                        NAPSA Security No.
                        <input
                          className={OPS_INPUT_CLASS}
                          defaultValue={employee.napsa_number}
                          maxLength={32}
                          name="napsa_number"
                        />
                      </label>
                      <label className={OPS_LABEL_CLASS}>
                        TPIN
                        <input
                          className={OPS_INPUT_CLASS}
                          defaultValue={employee.tpin}
                          maxLength={32}
                          name="tpin"
                        />
                      </label>
                      <label className={OPS_LABEL_CLASS}>
                        Emergency contact
                        <input
                          className={OPS_INPUT_CLASS}
                          defaultValue={employee.emergency_contact_name}
                          name="emergency_contact_name"
                        />
                      </label>
                      <label className={OPS_LABEL_CLASS}>
                        Emergency phone
                        <input
                          className={OPS_INPUT_CLASS}
                          defaultValue={employee.emergency_contact_phone}
                          name="emergency_contact_phone"
                        />
                      </label>
                      <label className={OPS_LABEL_CLASS}>
                        Start date
                        <input
                          className={OPS_INPUT_CLASS}
                          defaultValue={employee.start_date}
                          name="start_date"
                          type="date"
                        />
                      </label>
                      <label className={OPS_LABEL_CLASS}>
                        Site
                        <select
                          className={OPS_INPUT_CLASS}
                          defaultValue={employee.site_id ?? ""}
                          name="site_id"
                        >
                          <option value="">Unassigned</option>
                          {siteOptions.map((site) => (
                            <option key={site.id} value={site.id}>
                              {site.code} - {site.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className={`${OPS_LABEL_CLASS} sm:col-span-2 lg:col-span-3`}>
                        Notes
                        <textarea
                          className={`${OPS_INPUT_CLASS} min-h-20`}
                          defaultValue={employee.notes}
                          name="notes"
                        />
                      </label>
                      <div className="sm:col-span-2 lg:col-span-3">
                        <button className={OPS_SECONDARY_BUTTON_CLASS} type="submit">
                          <Pencil className="size-4" aria-hidden="true" />
                          Save employee
                        </button>
                      </div>
                    </form>
                  </details>
                ) : null}

                <dl className="mt-3 grid gap-3 md:grid-cols-5">
                  <HrMetric
                    label="Contracts"
                    value={`${employee.contracts.filter((contract) => contract.status === "active").length} active / ${employee.contracts.length} total`}
                  />
                  <HrMetric
                    label="Leave balance"
                    value={
                      employee.leave_balances.length > 0
                        ? `${formatNumber(employee.leave_balances[0]?.available_days ?? 0)} days`
                        : "Not recorded"
                    }
                  />
                  <HrMetric
                    label="Appraisals"
                    value={`${employee.appraisals.filter((appraisal) => appraisal.status !== "completed" && appraisal.status !== "cancelled").length} open / ${employee.appraisals.length} total`}
                  />
                  <HrMetric
                    label="Onboarding"
                    value={`${employee.onboarding_items.filter((item) => item.status === "pending" || item.status === "in_progress").length} open / ${employee.onboarding_items.length} total`}
                  />
                  <HrMetric
                    label="HR docs"
                    value={`${requiredDocumentCoverage(employee, hrDocumentCategories).covered}/${requiredDocumentCoverage(employee, hrDocumentCategories).total} required`}
                  />
                </dl>

                {canViewContracts ? (
                  <div className="mt-4">
                    <h3 className="font-heading text-sm font-bold uppercase tracking-[0.12em] text-muted-foreground">
                      Employment contracts
                    </h3>
                    <EmployeeContractsPanel
                      canManage={canViewContracts}
                      contracts={employee.contracts}
                    />
                  </div>
                ) : null}

                {canManageHrCategory ? (
                  <EmployeeDocumentsPanel
                    categories={hrDocumentCategories}
                    documents={employee.documents}
                    role={auth.profile.role}
                  />
                ) : null}

                {employee.onboarding_items.length > 0 ? (
                  <div className="mt-4 space-y-3">
                    {employee.onboarding_items.map((item) => (
                      <div className="rounded-md border border-border p-4" key={item.id}>
                        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                          <div className="min-w-0">
                            <p className="font-bold text-foreground">
                              {item.item_number} - {item.title}
                            </p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {formatLabel(item.category)} / Due {formatDate(item.due_date)}
                            </p>
                          </div>
                          <span className={`w-fit ${opsStatusBadgeClass(item.status)}`}>
                            {formatLabel(item.status)}
                          </span>
                        </div>
                        <dl className="mt-4 grid gap-3 md:grid-cols-3">
                          <HrMetric label="Owner" value={item.owner?.full_name ?? "Unassigned"} />
                          <HrMetric label="Created" value={formatDate(item.created_at.slice(0, 10))} />
                          <HrMetric
                            label="Closed"
                            value={formatDate(
                              item.completed_at?.slice(0, 10) ??
                                item.waived_at?.slice(0, 10) ??
                                item.cancelled_at?.slice(0, 10) ??
                                null,
                            )}
                          />
                        </dl>
                        {item.description ? (
                          <p className="mt-3 text-sm leading-6 text-muted-foreground">
                            {item.description}
                          </p>
                        ) : null}
                        {item.completion_notes ? (
                          <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm leading-6 text-emerald-800">
                            {item.completion_notes}
                          </p>
                        ) : null}
                        <OnboardingControls item={item} role={auth.profile.role} />
                        <OpsRecordActivityPanel
                          canManage={canCreateOnboarding}
                          sourceId={item.id}
                          sourceTable="employee_onboarding_items"
                        />
                      </div>
                    ))}
                  </div>
                ) : null}

                {employee.leave_requests.length > 0 ? (
                  <div className="mt-4 space-y-3">
                    {employee.leave_requests.map((leaveRequest) => {
                      const leaveWithUser = {
                        ...leaveRequest,
                        employee_user_id: employee.user_id,
                      };

                      return (
                        <div className="rounded-md border border-border p-4" key={leaveRequest.id}>
                          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                            <div>
                              <p className="font-bold text-foreground">
                                {leaveRequest.leave_number} - {formatLabel(leaveRequest.leave_type)}
                              </p>
                              <p className="mt-1 text-sm text-muted-foreground">
                                {formatDate(leaveRequest.start_date)} to {formatDate(leaveRequest.end_date)} /{" "}
                                {leaveRequest.days_requested.toLocaleString("en-ZM", {
                                  maximumFractionDigits: 1,
                                })}{" "}
                                days
                              </p>
                            </div>
                            <span className={`w-fit ${opsStatusBadgeClass(leaveRequest.status)}`}>
                              {formatLabel(leaveRequest.status)}
                            </span>
                          </div>
                          {leaveRequest.reason ? (
                            <p className="mt-3 text-sm leading-6 text-muted-foreground">
                              {leaveRequest.reason}
                            </p>
                          ) : null}
                          <LeaveControls
                            actorId={auth.profile.id}
                            leaveRequest={leaveWithUser}
                            role={auth.profile.role}
                          />
                          <OpsRecordActivityPanel
                            canManage={canCreateLeave}
                            sourceId={leaveRequest.id}
                            sourceTable="leave_requests"
                          />
                        </div>
                      );
                    })}
                  </div>
                ) : null}

                <OpsRecordActivityPanel
                  canManage={canCreateEmployee}
                  sourceId={employee.id}
                  sourceTable="employees"
                />
              </article>
            ))}
          </div>
        ) : (
          <div className="flex min-h-56 flex-col items-center justify-center gap-3 p-8 text-center">
            <Users className="size-10 text-primary-blue" aria-hidden="true" />
            <div>
              <p className="font-heading text-xl font-bold text-foreground">
                {hasActiveListFilter ? "No matching employees" : "No employees yet"}
              </p>
              <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
                {hasActiveListFilter
                  ? "Adjust the search or status filter to widen the register."
                  : "Create the first HR employee record to begin the HR foundation."}
              </p>
            </div>
          </div>
        )}
        <OpsPaginationControls
          basePath="/ops/employees"
          filters={[{ label: "Status", name: "status", options: [], value: status }]}
          pagination={employeePage.pagination}
          query={listState.query}
          resultLabel="employees"
        />
      </section>
    </div>
  );
}
