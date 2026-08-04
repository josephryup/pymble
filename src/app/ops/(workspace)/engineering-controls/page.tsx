import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  FileText,
  GitPullRequest,
  Link as LinkIcon,
  ListChecks,
  Plus,
  Send,
  XCircle,
} from "lucide-react";
import { notFound } from "next/navigation";
import { OpsConfirmSubmitButton } from "@/components/ops/OpsConfirmSubmitButton";
import { OpsDashboardPanel } from "@/components/ops/OpsDashboardPanel";
import { OpsEmptyState } from "@/components/ops/OpsEmptyState";
import { OpsInlineEmpty } from "@/components/ops/OpsInlineEmpty";
import { OpsKpiCard } from "@/components/ops/OpsKpiCard";
import { OpsListControls, OpsPaginationControls } from "@/components/ops/OpsListControls";
import { OpsRecordActivityPanel } from "@/components/ops/OpsRecordActivityPanel";
import { requireOpsUser } from "@/lib/ops/auth";
import {
  acknowledgeSiteInstructionAction,
  addQaInspectionItemAction,
  archiveDrawingRecordAction,
  cancelMaterialTestAction,
  cancelProgrammeMilestoneAction,
  cancelQaInspectionAction,
  cancelSiteInstructionAction,
  cancelSiteInstructionFollowUpAction,
  cancelSnagItemAction,
  closeQaInspectionAction,
  closeSiteInstructionAction,
  closeSiteInstructionFollowUpAction,
  completeProgrammeMilestoneAction,
  completeQaInspectionAction,
  createDrawingRecordAction,
  createMaterialTestAction,
  createProgrammeMilestoneAction,
  createQaInspectionAction,
  createSiteInstructionAction,
  createSiteInstructionFollowUpAction,
  createSnagItemAction,
  issueSiteInstructionAction,
  requireQaInspectionActionAction as requireQaInspectionAction,
  resolveSnagItemAction,
  startSiteInstructionFollowUpAction,
  startSnagItemAction,
  supersedeDrawingRecordAction,
  updateMaterialTestResultAction,
  updateProgrammeMilestoneAction,
  verifySnagItemAction,
} from "@/lib/ops/engineering-controls-actions";
import {
  canAcknowledgeOpsSiteInstruction,
  canArchiveOpsDrawingRecord,
  canCancelOpsMaterialTest,
  canCancelOpsProgrammeMilestone,
  canCancelOpsQaInspection,
  canCancelOpsSiteInstruction,
  canCancelOpsSiteInstructionFollowUp,
  canCancelOpsSnagItem,
  canCloseOpsQaInspection,
  canCloseOpsSiteInstruction,
  canCloseOpsSiteInstructionFollowUp,
  canCompleteOpsProgrammeMilestone,
  canCompleteOpsQaInspection,
  canCreateOpsEngineeringControl,
  canIssueOpsSiteInstruction,
  canRequireOpsQaInspectionAction,
  canResolveOpsSnagItem,
  canStartOpsSiteInstructionFollowUp,
  canStartOpsSnagItem,
  canSupersedeOpsDrawingRecord,
  canUpdateOpsMaterialTest,
  canUpdateOpsProgrammeMilestone,
  canVerifyOpsSnagItem,
} from "@/lib/ops/engineering-controls-permissions";
import {
  fetchDrawingDocumentVersionOptions,
  fetchEngineeringUserOptions,
  fetchOpsEngineeringControlStats,
  fetchOpsEngineeringProgrammePressureReport,
  fetchOpsEngineeringQaCategoryReport,
  fetchOpsSiteInstructionFollowUpsForInstructions,
  fetchPaginatedOpsSiteInstructions,
  fetchQaInspectionOptions,
  fetchRecentOpsSiteInstructionFollowUps,
  fetchRecentOpsDrawingRecords,
  fetchRecentOpsMaterialTests,
  fetchRecentOpsProgrammeMilestones,
  fetchRecentOpsQaInspections,
  fetchRecentOpsSnagItems,
  type OpsDrawingDocumentVersionOption,
  type OpsDrawingRecordSummary,
  type OpsEngineeringUserSummary,
  type OpsMaterialTestSummary,
  type OpsProgrammeMilestoneSummary,
  type OpsQaInspectionItemSummary,
  type OpsQaInspectionSummary,
  type OpsSiteInstructionFollowUpSummary,
  type OpsSiteInstructionSummary,
  type OpsSnagItemSummary,
} from "@/lib/ops/engineering-controls";
import type {
  OpsEngineeringProgrammePressureReport,
  OpsEngineeringQaCategoryRow,
} from "@/lib/ops/engineering-controls-reporting";
import { parseOpsListState } from "@/lib/ops/listing";
import { canAccessOpsHref } from "@/lib/ops/permissions";
import { fetchActiveSiteOptions, type OpsSiteOption } from "@/lib/ops/sites";
import type {
  OpsPriority,
  OpsProgrammeMilestoneStatus,
  OpsQaFindingCategory,
  OpsQaInspectionItemResult,
  OpsSiteInstructionFollowUpType,
  OpsSiteInstructionStatus,
  OpsUserRole,
} from "@/lib/ops/types";
import {
  firstParam,
  noticeFromParams,
  OPS_DANGER_BUTTON_CLASS,
  OPS_INPUT_CLASS,
  OPS_LABEL_CLASS,
  OPS_PRIMARY_BUTTON_CLASS,
  OPS_SECONDARY_BUTTON_CLASS,
  type OpsSearchParams,
  opsStatusBadgeClass,
  type OpsStatusTone,
} from "@/lib/ops/ui";
import { todayInLusaka, formatOpsLabel as formatLabel, formatOpsDate as formatDate, formatOpsDateTime as formatDateTime } from "@/lib/ops/format";

type PageProps = {
  searchParams?: Promise<OpsSearchParams>;
};

type QaInspectionOption = Awaited<ReturnType<typeof fetchQaInspectionOptions>>[number];

const ROUTE = "/ops/engineering-controls";

const INSTRUCTION_STATUS_OPTIONS: Array<{ label: string; value: OpsSiteInstructionStatus | "" }> = [
  { label: "All statuses", value: "" },
  { label: "Draft", value: "draft" },
  { label: "Issued", value: "issued" },
  { label: "Acknowledged", value: "acknowledged" },
  { label: "Closed", value: "closed" },
  { label: "Cancelled", value: "cancelled" },
];

const PRIORITY_OPTIONS: Array<{ label: string; value: OpsPriority }> = [
  { label: "Low", value: "low" },
  { label: "Normal", value: "normal" },
  { label: "High", value: "high" },
  { label: "Urgent", value: "urgent" },
];

const QA_ITEM_RESULT_OPTIONS: Array<{ label: string; value: OpsQaInspectionItemResult }> = [
  { label: "Pending", value: "pending" },
  { label: "Pass", value: "pass" },
  { label: "Fail", value: "fail" },
  { label: "Observation", value: "observation" },
  { label: "Not applicable", value: "not_applicable" },
];

const QA_FINDING_CATEGORY_OPTIONS: Array<{ label: string; value: OpsQaFindingCategory }> = [
  { label: "Workmanship", value: "workmanship" },
  { label: "Material", value: "material" },
  { label: "Design", value: "design" },
  { label: "Safety", value: "safety" },
  { label: "Environmental", value: "environmental" },
  { label: "Documentation", value: "documentation" },
  { label: "Dimensional", value: "dimensional" },
  { label: "Testing", value: "testing" },
  { label: "Coordination", value: "coordination" },
  { label: "Other", value: "other" },
];

const MATERIAL_TEST_STATUS_OPTIONS: Array<{ label: string; value: "submitted" | "passed" | "failed" }> = [
  { label: "Submitted", value: "submitted" },
  { label: "Passed", value: "passed" },
  { label: "Failed", value: "failed" },
];

const FOLLOW_UP_TYPE_OPTIONS: Array<{ label: string; value: OpsSiteInstructionFollowUpType }> = [
  { label: "QA inspection", value: "qa_inspection" },
  { label: "Snag", value: "snag" },
  { label: "Material test", value: "material_test" },
  { label: "Drawing update", value: "drawing_update" },
  { label: "Programme update", value: "programme_update" },
  { label: "Other", value: "other" },
];

const MILESTONE_UPDATE_STATUS_OPTIONS: Array<{
  label: string;
  value: Exclude<OpsProgrammeMilestoneStatus, "completed" | "cancelled">;
}> = [
  { label: "Planned", value: "planned" },
  { label: "On track", value: "on_track" },
  { label: "Delayed", value: "delayed" },
];

function statusFromParam(value: string | undefined) {
  return INSTRUCTION_STATUS_OPTIONS.some((status) => status.value === value)
    ? (value as OpsSiteInstructionStatus | "")
    : "";
}

function engineeringNotice(params: OpsSearchParams) {
  const created = noticeFromParams(params, "instruction", "Site instruction created.");

  if (created) {
    return created;
  }

  const createdValue = firstParam(params.created);
  const updatedValue = firstParam(params.updated);
  const messages: Record<string, string> = {
    attachment: "Engineering attachment uploaded.",
    comment: "Engineering comment added.",
    drawing: "Drawing record created.",
    drawing_archived: "Drawing record archived.",
    drawing_superseded: "Drawing record superseded.",
    follow_up_cancelled: "Follow-up task cancelled.",
    follow_up_closed: "Follow-up task closed.",
    follow_up_started: "Follow-up task started.",
    inspection: "QA inspection created.",
    inspection_action_required: "QA inspection marked action required.",
    inspection_cancelled: "QA inspection cancelled.",
    inspection_closed: "QA inspection closed.",
    inspection_completed: "QA inspection completed.",
    inspection_item: "QA checklist item added.",
    instruction_acknowledged: "Site instruction acknowledged.",
    instruction_cancelled: "Site instruction cancelled.",
    instruction_closed: "Site instruction closed.",
    instruction_follow_up: "Instruction follow-up task created.",
    instruction_issued: "Site instruction issued.",
    material_test: "Material test created.",
    material_test_cancelled: "Material test cancelled.",
    material_test_updated: "Material test updated.",
    milestone: "Programme milestone created.",
    milestone_cancelled: "Programme milestone cancelled.",
    milestone_completed: "Programme milestone completed.",
    milestone_updated: "Programme milestone updated.",
    snag: "Snag item created.",
    snag_cancelled: "Snag item cancelled.",
    snag_resolved: "Snag item resolved.",
    snag_started: "Snag item moved to in progress.",
    snag_verified: "Snag item verified.",
  };
  const key = createdValue ?? updatedValue ?? "";

  return key && messages[key]
    ? {
        message: messages[key],
        tone: "success" as const,
      }
    : null;
}

function formatPercent(value: number) {
  return `${value.toLocaleString("en-ZM", { maximumFractionDigits: 1 })}%`;
}

function StatusBadge({ value, tone }: { value: string; tone?: OpsStatusTone }) {
  return <span className={opsStatusBadgeClass(value, tone)}>{formatLabel(value)}</span>;
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

function QaCategoryPressurePanel({
  rows,
}: {
  rows: OpsEngineeringQaCategoryRow[];
}) {
  return (
    <OpsDashboardPanel eyebrow="QA finding categories" title="Quality pressure">
      {rows.length > 0 ? (
        <ul className="grid gap-2">
          {rows.slice(0, 6).map((row) => (
            <li className="rounded-md border border-border px-3 py-3" key={row.category}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <StatusBadge value={row.category} />
                  <p className="mt-2 font-bold text-foreground">{row.total} items</p>
                </div>
                <div className="grid grid-cols-3 gap-3 text-right">
                  <DetailItem label="Action" value={String(row.action_required)} />
                  <DetailItem label="Fail" value={String(row.failed)} />
                  <DetailItem label="Obs" value={String(row.observations)} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <OpsInlineEmpty>No categorized QA findings requiring attention.</OpsInlineEmpty>
      )}
    </OpsDashboardPanel>
  );
}

function ProgrammePressurePanel({
  report,
}: {
  report: OpsEngineeringProgrammePressureReport;
}) {
  return (
    <OpsDashboardPanel eyebrow="Programme dashboard" title="Milestone pressure">
      <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DetailItem label="Milestones" value={String(report.totals.milestones)} />
        <DetailItem label="Delayed" value={String(report.totals.delayedMilestones)} />
        <DetailItem label="Overdue" value={String(report.totals.overdueMilestones)} />
        <DetailItem label="Slip days" value={String(report.totals.forecastSlipDays)} />
      </dl>
      <div className="mt-4">
        {report.siteRows.length > 0 ? (
          <ul className="divide-y divide-border rounded-md border border-border">
            {report.siteRows.map((site) => (
              <li className="px-3 py-3" key={site.site_id}>
                <div className="flex flex-col gap-3 min-[520px]:flex-row min-[520px]:items-start min-[520px]:justify-between">
                  <div>
                    <p className="font-bold text-foreground">
                      {site.site_code} - {site.site_name}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Next due {formatDate(site.next_due_date)}
                    </p>
                  </div>
                  <StatusBadge
                    tone={site.overdue > 0 || site.delayed > 0 ? "attention" : "positive"}
                    value={`${formatPercent(site.progress_percent)} avg`}
                  />
                </div>
                <dl className="mt-3 grid gap-3 sm:grid-cols-4">
                  <DetailItem label="Items" value={String(site.milestones)} />
                  <DetailItem label="Delayed" value={String(site.delayed)} />
                  <DetailItem label="Overdue" value={String(site.overdue)} />
                  <DetailItem label="Slip" value={`${site.forecast_slip_days} days`} />
                </dl>
              </li>
            ))}
          </ul>
        ) : (
          <OpsInlineEmpty>No programme milestones available for pressure reporting.</OpsInlineEmpty>
        )}
      </div>
    </OpsDashboardPanel>
  );
}

function ActiveFollowUpsPanel({
  followUps,
  role,
  userId,
}: {
  followUps: OpsSiteInstructionFollowUpSummary[];
  role: OpsUserRole;
  userId: string;
}) {
  return (
    <OpsDashboardPanel eyebrow="Instruction follow-ups" title="Task handoff">
      {followUps.length > 0 ? (
        <ul className="grid gap-2">
          {followUps.map((followUp) => (
            <li className="rounded-md border border-border px-3 py-3" key={followUp.id}>
              <div className="flex flex-col gap-3 min-[520px]:flex-row min-[520px]:items-start min-[520px]:justify-between">
                <div>
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge value={followUp.status} />
                    <StatusBadge
                      value={followUp.task_type}
                    />
                  </div>
                  <p className="mt-2 font-bold text-foreground">{followUp.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {followUp.instruction?.instruction_number ?? "Instruction"} / {followUp.site?.code ?? "Site"}
                  </p>
                </div>
                <DetailItem label="Due" value={formatDate(followUp.due_date)} />
              </div>
              <FollowUpActions followUp={followUp} role={role} userId={userId} />
            </li>
          ))}
        </ul>
      ) : (
        <OpsInlineEmpty>No active site instruction follow-up tasks.</OpsInlineEmpty>
      )}
    </OpsDashboardPanel>
  );
}

function InlineActionForm({
  action,
  buttonClass,
  children,
  confirmText,
  hidden,
}: {
  action: (formData: FormData) => Promise<void>;
  buttonClass: string;
  children: React.ReactNode;
  confirmText: string;
  hidden: Record<string, string>;
}) {
  return (
    <form action={action}>
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} name={name} type="hidden" value={value} />
      ))}
      <OpsConfirmSubmitButton className={buttonClass} confirmText={confirmText}>
        {children}
      </OpsConfirmSubmitButton>
    </form>
  );
}

function SiteOptions({ sites }: { sites: OpsSiteOption[] }) {
  return (
    <>
      <option value="">Select site</option>
      {sites.map((site) => (
        <option key={site.id} value={site.id}>
          {site.code} - {site.name}
        </option>
      ))}
    </>
  );
}

function UserOptions({ users }: { users: OpsEngineeringUserSummary[] }) {
  return (
    <>
      <option value="">Unassigned</option>
      {users.map((user) => (
        <option key={user.id} value={user.id}>
          {user.full_name} ({formatLabel(user.role)})
        </option>
      ))}
    </>
  );
}

function QaInspectionOptions({ inspections }: { inspections: QaInspectionOption[] }) {
  return (
    <>
      <option value="">No inspection link</option>
      {inspections.map((inspection) => (
        <option key={inspection.id} value={inspection.id}>
          {inspection.inspection_number} - {inspection.title}
        </option>
      ))}
    </>
  );
}

function DrawingDocumentVersionOptions({
  versions,
}: {
  versions: OpsDrawingDocumentVersionOption[];
}) {
  return (
    <>
      <option value="">No document version link</option>
      {versions.map((version) => (
        <option key={version.version_id} value={version.version_id}>
          {version.document_title} / v{version.version_number} / {version.file_name}
        </option>
      ))}
    </>
  );
}

function CreateSiteInstructionForm({
  canCreate,
  sites,
  users,
}: {
  canCreate: boolean;
  sites: OpsSiteOption[];
  users: OpsEngineeringUserSummary[];
}) {
  if (!canCreate) {
    return null;
  }

  return (
    <details className="rounded-lg border border-border bg-card" id="instruction-create">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-sm font-bold text-foreground transition hover:text-primary-blue [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-2">
          <Plus className="size-4" aria-hidden="true" />
          Create site instruction
        </span>
        <span className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Open</span>
      </summary>
      <form action={createSiteInstructionAction} className="grid gap-3 border-t border-border p-5 md:grid-cols-2 xl:grid-cols-6">
        <label className={`${OPS_LABEL_CLASS} xl:col-span-2`}>
          Project/site
          <select className={OPS_INPUT_CLASS} name="site_id" required>
            <SiteOptions sites={sites} />
          </select>
        </label>
        <label className={`${OPS_LABEL_CLASS} xl:col-span-2`}>
          Title
          <input className={OPS_INPUT_CLASS} name="title" required />
        </label>
        <label className={OPS_LABEL_CLASS}>
          Instruction date
          <input className={OPS_INPUT_CLASS} defaultValue={todayInLusaka()} name="instruction_date" type="date" required />
        </label>
        <label className={OPS_LABEL_CLASS}>
          Required by
          <input className={OPS_INPUT_CLASS} name="required_by" type="date" />
        </label>
        <label className={OPS_LABEL_CLASS}>
          Type
          <input className={OPS_INPUT_CLASS} defaultValue="general" name="instruction_type" />
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
        <label className={`${OPS_LABEL_CLASS} md:col-span-2 xl:col-span-2`}>
          Assigned to
          <select className={OPS_INPUT_CLASS} name="assigned_to">
            <UserOptions users={users} />
          </select>
        </label>
        <label className={`${OPS_LABEL_CLASS} md:col-span-2 xl:col-span-6`}>
          Description
          <textarea className={OPS_INPUT_CLASS} name="description" rows={3} />
        </label>
        <div className="md:col-span-2 xl:col-span-2">
          <button className={`${OPS_PRIMARY_BUTTON_CLASS} w-full`} type="submit">
            <Plus className="size-4" aria-hidden="true" />
            Save instruction
          </button>
        </div>
      </form>
    </details>
  );
}

function CreateQaInspectionForm({
  canCreate,
  sites,
  users,
}: {
  canCreate: boolean;
  sites: OpsSiteOption[];
  users: OpsEngineeringUserSummary[];
}) {
  if (!canCreate) {
    return null;
  }

  return (
    <details className="rounded-lg border border-border bg-card" id="qa-inspection-create">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-sm font-bold text-foreground transition hover:text-primary-blue [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-2">
          <ClipboardCheck className="size-4" aria-hidden="true" />
          Create QA inspection
        </span>
        <span className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Open</span>
      </summary>
      <form action={createQaInspectionAction} className="grid gap-3 border-t border-border p-5 md:grid-cols-2 xl:grid-cols-6">
        <label className={`${OPS_LABEL_CLASS} xl:col-span-2`}>
          Project/site
          <select className={OPS_INPUT_CLASS} name="site_id" required>
            <SiteOptions sites={sites} />
          </select>
        </label>
        <label className={`${OPS_LABEL_CLASS} xl:col-span-2`}>
          Title
          <input className={OPS_INPUT_CLASS} name="title" required />
        </label>
        <label className={OPS_LABEL_CLASS}>
          Date
          <input className={OPS_INPUT_CLASS} defaultValue={todayInLusaka()} name="inspection_date" type="date" required />
        </label>
        <label className={OPS_LABEL_CLASS}>
          Type
          <input className={OPS_INPUT_CLASS} defaultValue="general" name="inspection_type" />
        </label>
        <label className={`${OPS_LABEL_CLASS} md:col-span-2 xl:col-span-2`}>
          Inspector
          <select className={OPS_INPUT_CLASS} name="inspector_id">
            <UserOptions users={users} />
          </select>
        </label>
        <div className="md:col-span-2 xl:col-span-2">
          <button className={`${OPS_PRIMARY_BUTTON_CLASS} w-full`} type="submit">
            <Plus className="size-4" aria-hidden="true" />
            Save inspection
          </button>
        </div>
      </form>
    </details>
  );
}

function CreateLinkedRecordsForm({
  canCreate,
  documentVersions,
  inspections,
  sites,
  users,
}: {
  canCreate: boolean;
  documentVersions: OpsDrawingDocumentVersionOption[];
  inspections: QaInspectionOption[];
  sites: OpsSiteOption[];
  users: OpsEngineeringUserSummary[];
}) {
  if (!canCreate) {
    return null;
  }

  return (
    <div className="grid gap-4">
      <details className="rounded-lg border border-border bg-card" id="material-test-create">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-sm font-bold text-foreground transition hover:text-primary-blue [&::-webkit-details-marker]:hidden">
          <span className="inline-flex items-center gap-2">
            <AlertTriangle className="size-4" aria-hidden="true" />
            Create material test
          </span>
          <span className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Open</span>
        </summary>
        <form action={createMaterialTestAction} className="grid gap-3 border-t border-border p-5 md:grid-cols-2 xl:grid-cols-6">
          <label className={`${OPS_LABEL_CLASS} xl:col-span-2`}>
            Project/site
            <select className={OPS_INPUT_CLASS} name="site_id" required>
              <SiteOptions sites={sites} />
            </select>
          </label>
          <label className={`${OPS_LABEL_CLASS} xl:col-span-2`}>
            Test type
            <input className={OPS_INPUT_CLASS} name="test_type" required />
          </label>
          <label className={OPS_LABEL_CLASS}>
            Test date
            <input className={OPS_INPUT_CLASS} defaultValue={todayInLusaka()} name="test_date" type="date" required />
          </label>
          <label className={OPS_LABEL_CLASS}>
            Required by
            <input className={OPS_INPUT_CLASS} name="required_by" type="date" />
          </label>
          <label className={OPS_LABEL_CLASS}>
            Sample ref
            <input className={OPS_INPUT_CLASS} name="sample_reference" />
          </label>
          <label className={OPS_LABEL_CLASS}>
            Lab ref
            <input className={OPS_INPUT_CLASS} name="lab_reference" />
          </label>
          <label className={`${OPS_LABEL_CLASS} xl:col-span-2`}>
            QA inspection
            <select className={OPS_INPUT_CLASS} name="qa_inspection_id">
              <QaInspectionOptions inspections={inspections} />
            </select>
          </label>
          <label className={`${OPS_LABEL_CLASS} xl:col-span-2`}>
            Location
            <input className={OPS_INPUT_CLASS} name="location" />
          </label>
          <label className={`${OPS_LABEL_CLASS} xl:col-span-2`}>
            Standard reference
            <input className={OPS_INPUT_CLASS} name="standard_reference" />
          </label>
          <label className={`${OPS_LABEL_CLASS} xl:col-span-2`}>
            Tested by
            <input className={OPS_INPUT_CLASS} name="tested_by" />
          </label>
          <div className="md:col-span-2 xl:col-span-2">
            <button className={`${OPS_PRIMARY_BUTTON_CLASS} w-full`} type="submit">
              <Plus className="size-4" aria-hidden="true" />
              Save test
            </button>
          </div>
        </form>
      </details>

      <details className="rounded-lg border border-border bg-card" id="snag-create">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-sm font-bold text-foreground transition hover:text-primary-blue [&::-webkit-details-marker]:hidden">
          <span className="inline-flex items-center gap-2">
            <ListChecks className="size-4" aria-hidden="true" />
            Create snag item
          </span>
          <span className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Open</span>
        </summary>
        <form action={createSnagItemAction} className="grid gap-3 border-t border-border p-5 md:grid-cols-2 xl:grid-cols-6">
          <label className={`${OPS_LABEL_CLASS} xl:col-span-2`}>
            Project/site
            <select className={OPS_INPUT_CLASS} name="site_id" required>
              <SiteOptions sites={sites} />
            </select>
          </label>
          <label className={`${OPS_LABEL_CLASS} xl:col-span-2`}>
            Title
            <input className={OPS_INPUT_CLASS} name="title" required />
          </label>
          <label className={OPS_LABEL_CLASS}>
            Due date
            <input className={OPS_INPUT_CLASS} name="due_date" type="date" />
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
          <label className={`${OPS_LABEL_CLASS} xl:col-span-2`}>
            QA inspection
            <select className={OPS_INPUT_CLASS} name="qa_inspection_id">
              <QaInspectionOptions inspections={inspections} />
            </select>
          </label>
          <label className={`${OPS_LABEL_CLASS} xl:col-span-2`}>
            Assigned to
            <select className={OPS_INPUT_CLASS} name="assigned_to">
              <UserOptions users={users} />
            </select>
          </label>
          <label className={`${OPS_LABEL_CLASS} xl:col-span-2`}>
            Location
            <input className={OPS_INPUT_CLASS} name="location" />
          </label>
          <label className={`${OPS_LABEL_CLASS} md:col-span-2 xl:col-span-6`}>
            Description
            <textarea className={OPS_INPUT_CLASS} name="description" rows={3} />
          </label>
          <div className="md:col-span-2 xl:col-span-2">
            <button className={`${OPS_PRIMARY_BUTTON_CLASS} w-full`} type="submit">
              <Plus className="size-4" aria-hidden="true" />
              Save snag
            </button>
          </div>
        </form>
      </details>

      <details className="rounded-lg border border-border bg-card" id="drawing-create">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-sm font-bold text-foreground transition hover:text-primary-blue [&::-webkit-details-marker]:hidden">
          <span className="inline-flex items-center gap-2">
            <FileText className="size-4" aria-hidden="true" />
            Create drawing record
          </span>
          <span className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Open</span>
        </summary>
        <form action={createDrawingRecordAction} className="grid gap-3 border-t border-border p-5 md:grid-cols-2 xl:grid-cols-6">
          <label className={`${OPS_LABEL_CLASS} xl:col-span-2`}>
            Project/site
            <select className={OPS_INPUT_CLASS} name="site_id" required>
              <SiteOptions sites={sites} />
            </select>
          </label>
          <label className={OPS_LABEL_CLASS}>
            Drawing number
            <input className={OPS_INPUT_CLASS} name="drawing_number" required />
          </label>
          <label className={OPS_LABEL_CLASS}>
            Revision
            <input className={OPS_INPUT_CLASS} defaultValue="0" name="revision" />
          </label>
          <label className={`${OPS_LABEL_CLASS} xl:col-span-2`}>
            Title
            <input className={OPS_INPUT_CLASS} name="title" required />
          </label>
          <label className={OPS_LABEL_CLASS}>
            Received date
            <input className={OPS_INPUT_CLASS} defaultValue={todayInLusaka()} name="received_date" type="date" required />
          </label>
          <label className={OPS_LABEL_CLASS}>
            Issued date
            <input className={OPS_INPUT_CLASS} name="issued_date" type="date" />
          </label>
          <label className={`${OPS_LABEL_CLASS} xl:col-span-2`}>
            Discipline
            <input className={OPS_INPUT_CLASS} name="discipline" />
          </label>
          <label className={`${OPS_LABEL_CLASS} xl:col-span-2`}>
            Document version
            <select className={OPS_INPUT_CLASS} name="document_version_id">
              <DrawingDocumentVersionOptions versions={documentVersions} />
            </select>
          </label>
          <label className={`${OPS_LABEL_CLASS} md:col-span-2 xl:col-span-6`}>
            Notes
            <input className={OPS_INPUT_CLASS} name="notes" />
          </label>
          <div className="md:col-span-2 xl:col-span-2">
            <button className={`${OPS_PRIMARY_BUTTON_CLASS} w-full`} type="submit">
              <Plus className="size-4" aria-hidden="true" />
              Save drawing
            </button>
          </div>
        </form>
      </details>

      <details className="rounded-lg border border-border bg-card" id="programme-milestone-create">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-sm font-bold text-foreground transition hover:text-primary-blue [&::-webkit-details-marker]:hidden">
          <span className="inline-flex items-center gap-2">
            <ClipboardList className="size-4" aria-hidden="true" />
            Create programme milestone
          </span>
          <span className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Open</span>
        </summary>
        <form action={createProgrammeMilestoneAction} className="grid gap-3 border-t border-border p-5 md:grid-cols-2 xl:grid-cols-6">
          <label className={`${OPS_LABEL_CLASS} xl:col-span-2`}>
            Project/site
            <select className={OPS_INPUT_CLASS} name="site_id" required>
              <SiteOptions sites={sites} />
            </select>
          </label>
          <label className={`${OPS_LABEL_CLASS} xl:col-span-2`}>
            Title
            <input className={OPS_INPUT_CLASS} name="title" required />
          </label>
          <label className={OPS_LABEL_CLASS}>
            Baseline date
            <input className={OPS_INPUT_CLASS} defaultValue={todayInLusaka()} name="baseline_date" type="date" required />
          </label>
          <label className={OPS_LABEL_CLASS}>
            Forecast date
            <input className={OPS_INPUT_CLASS} name="forecast_date" type="date" />
          </label>
          <label className={`${OPS_LABEL_CLASS} xl:col-span-2`}>
            Owner
            <select className={OPS_INPUT_CLASS} name="owner_id">
              <UserOptions users={users} />
            </select>
          </label>
          <label className={OPS_LABEL_CLASS}>
            Progress %
            <input className={OPS_INPUT_CLASS} defaultValue="0" max="100" min="0" name="progress_percent" type="number" />
          </label>
          <label className={`${OPS_LABEL_CLASS} md:col-span-2 xl:col-span-3`}>
            Notes
            <input className={OPS_INPUT_CLASS} name="notes" />
          </label>
          <div className="md:col-span-2 xl:col-span-2">
            <button className={`${OPS_PRIMARY_BUTTON_CLASS} w-full`} type="submit">
              <Plus className="size-4" aria-hidden="true" />
              Save milestone
            </button>
          </div>
        </form>
      </details>
    </div>
  );
}

function InstructionActions({
  instruction,
  role,
  userId,
}: {
  instruction: OpsSiteInstructionSummary;
  role: OpsUserRole;
  userId: string;
}) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {canIssueOpsSiteInstruction(role, instruction) ? (
        <InlineActionForm
          action={issueSiteInstructionAction}
          buttonClass={OPS_PRIMARY_BUTTON_CLASS}
          confirmText="Issue this site instruction?"
          hidden={{ instruction_id: instruction.id }}
        >
          <Send className="size-4" aria-hidden="true" />
          Issue
        </InlineActionForm>
      ) : null}
      {canAcknowledgeOpsSiteInstruction(userId, role, instruction) ? (
        <details className="w-full rounded-md border border-border p-3">
          <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">
            Acknowledge
          </summary>
          <form action={acknowledgeSiteInstructionAction} className="mt-3 grid gap-3">
            <input name="instruction_id" type="hidden" value={instruction.id} />
            <label className={OPS_LABEL_CLASS}>
              Response notes
              <textarea className={OPS_INPUT_CLASS} name="response_notes" rows={2} />
            </label>
            <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              Acknowledge
            </button>
          </form>
        </details>
      ) : null}
      {canCloseOpsSiteInstruction(role, instruction) ? (
        <InlineActionForm
          action={closeSiteInstructionAction}
          buttonClass={OPS_SECONDARY_BUTTON_CLASS}
          confirmText="Close this site instruction?"
          hidden={{ instruction_id: instruction.id }}
        >
          <CheckCircle2 className="size-4" aria-hidden="true" />
          Close
        </InlineActionForm>
      ) : null}
      {canCancelOpsSiteInstruction(role, instruction) ? (
        <InlineActionForm
          action={cancelSiteInstructionAction}
          buttonClass={OPS_DANGER_BUTTON_CLASS}
          confirmText="Cancel this site instruction?"
          hidden={{ instruction_id: instruction.id }}
        >
          <XCircle className="size-4" aria-hidden="true" />
          Cancel
        </InlineActionForm>
      ) : null}
    </div>
  );
}

function FollowUpActions({
  followUp,
  role,
  userId,
}: {
  followUp: OpsSiteInstructionFollowUpSummary;
  role: OpsUserRole;
  userId: string;
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {canStartOpsSiteInstructionFollowUp(userId, role, followUp) ? (
        <InlineActionForm
          action={startSiteInstructionFollowUpAction}
          buttonClass={OPS_SECONDARY_BUTTON_CLASS}
          confirmText="Start this follow-up task?"
          hidden={{ follow_up_id: followUp.id }}
        >
          Start
        </InlineActionForm>
      ) : null}
      {canCloseOpsSiteInstructionFollowUp(userId, role, followUp) ? (
        <InlineActionForm
          action={closeSiteInstructionFollowUpAction}
          buttonClass={OPS_PRIMARY_BUTTON_CLASS}
          confirmText="Close this follow-up task?"
          hidden={{ follow_up_id: followUp.id }}
        >
          Close
        </InlineActionForm>
      ) : null}
      {canCancelOpsSiteInstructionFollowUp(role, followUp) ? (
        <InlineActionForm
          action={cancelSiteInstructionFollowUpAction}
          buttonClass={OPS_DANGER_BUTTON_CLASS}
          confirmText="Cancel this follow-up task?"
          hidden={{ follow_up_id: followUp.id }}
        >
          Cancel
        </InlineActionForm>
      ) : null}
    </div>
  );
}

function InstructionFollowUps({
  canCreate,
  followUps,
  instruction,
  role,
  userId,
  users,
}: {
  canCreate: boolean;
  followUps: OpsSiteInstructionFollowUpSummary[];
  instruction: OpsSiteInstructionSummary;
  role: OpsUserRole;
  userId: string;
  users: OpsEngineeringUserSummary[];
}) {
  return (
    <div className="mt-4 grid gap-3">
      {followUps.length > 0 ? (
        <ul className="grid gap-2">
          {followUps.map((followUp) => (
            <li className="rounded-md border border-border p-3" key={followUp.id}>
              <div className="flex flex-col gap-3 min-[520px]:flex-row min-[520px]:items-start min-[520px]:justify-between">
                <div>
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge value={followUp.status} />
                    <StatusBadge
                      value={followUp.task_type}
                    />
                  </div>
                  <p className="mt-2 font-bold text-foreground">{followUp.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {followUp.assigned_to_user?.full_name ?? "Unassigned"} / Due {formatDate(followUp.due_date)}
                  </p>
                </div>
                <DetailItem label="Created" value={formatDateTime(followUp.created_at)} />
              </div>
              {followUp.description ? (
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{followUp.description}</p>
              ) : null}
              <FollowUpActions followUp={followUp} role={role} userId={userId} />
            </li>
          ))}
        </ul>
      ) : null}
      {canCreate && !["closed", "cancelled"].includes(instruction.status) ? (
        <details className="rounded-md border border-border">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-bold text-foreground transition hover:text-primary-blue [&::-webkit-details-marker]:hidden">
            <span className="inline-flex items-center gap-2">
              <GitPullRequest className="size-4" aria-hidden="true" />
              Add follow-up task
            </span>
            <span className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Open</span>
          </summary>
          <form action={createSiteInstructionFollowUpAction} className="grid gap-3 border-t border-border p-4 md:grid-cols-2 xl:grid-cols-6">
            <input name="instruction_id" type="hidden" value={instruction.id} />
            <label className={`${OPS_LABEL_CLASS} xl:col-span-2`}>
              Title
              <input className={OPS_INPUT_CLASS} name="title" required />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Task type
              <select className={OPS_INPUT_CLASS} defaultValue="other" name="task_type">
                {FOLLOW_UP_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={OPS_LABEL_CLASS}>
              Due date
              <input className={OPS_INPUT_CLASS} name="due_date" type="date" />
            </label>
            <label className={`${OPS_LABEL_CLASS} xl:col-span-2`}>
              Assigned to
              <select className={OPS_INPUT_CLASS} name="assigned_to">
                <UserOptions users={users} />
              </select>
            </label>
            <label className={`${OPS_LABEL_CLASS} md:col-span-2 xl:col-span-4`}>
              Description
              <input className={OPS_INPUT_CLASS} name="description" />
            </label>
            <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
              <Plus className="size-4" aria-hidden="true" />
              Add task
            </button>
          </form>
        </details>
      ) : null}
    </div>
  );
}

function QaInspectionActions({
  inspection,
  role,
}: {
  inspection: OpsQaInspectionSummary;
  role: OpsUserRole;
}) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {canCompleteOpsQaInspection(role, inspection) ? (
        <details className="w-full rounded-md border border-border p-3">
          <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">
            Complete inspection
          </summary>
          <form action={completeQaInspectionAction} className="mt-3 grid gap-3 md:grid-cols-3">
            <input name="inspection_id" type="hidden" value={inspection.id} />
            <label className={OPS_LABEL_CLASS}>
              Score
              <input className={OPS_INPUT_CLASS} defaultValue={inspection.score} max="100" min="0" name="score" type="number" />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Findings
              <input className={OPS_INPUT_CLASS} defaultValue={inspection.findings_count} min="0" name="findings_count" type="number" />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Actions
              <input className={OPS_INPUT_CLASS} defaultValue={inspection.action_count} min="0" name="action_count" type="number" />
            </label>
            <label className={`${OPS_LABEL_CLASS} md:col-span-3`}>
              Summary
              <textarea className={OPS_INPUT_CLASS} name="summary" rows={2} />
            </label>
            <button className={`${OPS_PRIMARY_BUTTON_CLASS} md:col-span-1`} type="submit">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              Complete
            </button>
          </form>
        </details>
      ) : null}
      {canRequireOpsQaInspectionAction(role, inspection) ? (
        <details className="w-full rounded-md border border-orange-100 p-3">
          <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.1em] text-orange-700">
            Require action
          </summary>
          <form action={requireQaInspectionAction} className="mt-3 grid gap-3">
            <input name="inspection_id" type="hidden" value={inspection.id} />
            <label className={OPS_LABEL_CLASS}>
              Action required
              <textarea className={OPS_INPUT_CLASS} name="action_required" rows={2} required />
            </label>
            <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
              <AlertTriangle className="size-4" aria-hidden="true" />
              Mark action required
            </button>
          </form>
        </details>
      ) : null}
      {canCloseOpsQaInspection(role, inspection) ? (
        <InlineActionForm
          action={closeQaInspectionAction}
          buttonClass={OPS_SECONDARY_BUTTON_CLASS}
          confirmText="Close this QA inspection?"
          hidden={{ inspection_id: inspection.id }}
        >
          <CheckCircle2 className="size-4" aria-hidden="true" />
          Close
        </InlineActionForm>
      ) : null}
      {canCancelOpsQaInspection(role, inspection) ? (
        <InlineActionForm
          action={cancelQaInspectionAction}
          buttonClass={OPS_DANGER_BUTTON_CLASS}
          confirmText="Cancel this QA inspection?"
          hidden={{ inspection_id: inspection.id }}
        >
          <XCircle className="size-4" aria-hidden="true" />
          Cancel
        </InlineActionForm>
      ) : null}
    </div>
  );
}

function QaInspectionItems({
  canCreate,
  inspection,
  users,
}: {
  canCreate: boolean;
  inspection: OpsQaInspectionSummary;
  users: OpsEngineeringUserSummary[];
}) {
  return (
    <div className="mt-4 grid gap-3">
      {inspection.items.length > 0 ? (
        <ul className="grid gap-2">
          {inspection.items.map((item: OpsQaInspectionItemSummary) => (
            <li className="rounded-md border border-border p-3" key={item.id}>
              <div className="flex flex-col gap-2 min-[520px]:flex-row min-[520px]:items-start min-[520px]:justify-between">
                <div>
                  <p className="font-bold text-foreground">
                    {item.line_number}. {item.checklist_item}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Owner: {item.responsible_user?.full_name ?? "Unassigned"} / Due {formatDate(item.due_date)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <StatusBadge tone={item.finding_category === "safety" || item.finding_category === "environmental" ? "negative" : "neutral"} value={item.finding_category} />
                  <StatusBadge value={item.result} />
                  {item.action_required ? (
                    <StatusBadge tone="attention" value="action required" />
                  ) : null}
                </div>
              </div>
              {item.notes ? (
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.notes}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <OpsInlineEmpty>No checklist items added yet.</OpsInlineEmpty>
      )}
      {canCreate && !["closed", "cancelled"].includes(inspection.status) ? (
        <details className="rounded-md border border-border">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-bold text-foreground transition hover:text-primary-blue [&::-webkit-details-marker]:hidden">
            <span className="inline-flex items-center gap-2">
              <Plus className="size-4" aria-hidden="true" />
              Add checklist item
            </span>
            <span className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Open</span>
          </summary>
          <form action={addQaInspectionItemAction} className="grid gap-3 border-t border-border p-4 md:grid-cols-2 xl:grid-cols-6">
            <input name="inspection_id" type="hidden" value={inspection.id} />
            <label className={`${OPS_LABEL_CLASS} xl:col-span-2`}>
              Checklist item
              <input className={OPS_INPUT_CLASS} name="checklist_item" required />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Result
              <select className={OPS_INPUT_CLASS} defaultValue="pending" name="result">
                {QA_ITEM_RESULT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={OPS_LABEL_CLASS}>
              Category
              <select className={OPS_INPUT_CLASS} defaultValue="other" name="finding_category">
                {QA_FINDING_CATEGORY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={OPS_LABEL_CLASS}>
              Due date
              <input className={OPS_INPUT_CLASS} name="due_date" type="date" />
            </label>
            <label className={`${OPS_LABEL_CLASS} xl:col-span-2`}>
              Responsible
              <select className={OPS_INPUT_CLASS} name="responsible_user_id">
                <UserOptions users={users} />
              </select>
            </label>
            <label className={`${OPS_LABEL_CLASS} md:col-span-2 xl:col-span-4`}>
              Notes
              <input className={OPS_INPUT_CLASS} name="notes" />
            </label>
            <label className="flex items-center gap-2 text-sm font-bold text-foreground/70">
              <input className="size-4 rounded border-border text-primary-blue" name="action_required" type="checkbox" />
              Action required
            </label>
            <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
              <Plus className="size-4" aria-hidden="true" />
              Add item
            </button>
          </form>
        </details>
      ) : null}
    </div>
  );
}

function MaterialTestActions({ role, test }: { role: OpsUserRole; test: OpsMaterialTestSummary }) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {canUpdateOpsMaterialTest(role, test) ? (
        <details className="w-full rounded-md border border-border p-3">
          <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">
            Update result
          </summary>
          <form action={updateMaterialTestResultAction} className="mt-3 grid gap-3 md:grid-cols-3">
            <input name="test_id" type="hidden" value={test.id} />
            <label className={OPS_LABEL_CLASS}>
              Status
              <select className={OPS_INPUT_CLASS} defaultValue="submitted" name="status">
                {MATERIAL_TEST_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={`${OPS_LABEL_CLASS} md:col-span-2`}>
              Result value
              <input className={OPS_INPUT_CLASS} name="result_value" />
            </label>
            <label className={`${OPS_LABEL_CLASS} md:col-span-3`}>
              Summary
              <textarea className={OPS_INPUT_CLASS} name="result_summary" rows={2} />
            </label>
            <button className={`${OPS_PRIMARY_BUTTON_CLASS} md:col-span-1`} type="submit">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              Update
            </button>
          </form>
        </details>
      ) : null}
      {canCancelOpsMaterialTest(role, test) ? (
        <InlineActionForm
          action={cancelMaterialTestAction}
          buttonClass={OPS_DANGER_BUTTON_CLASS}
          confirmText="Cancel this material test?"
          hidden={{ test_id: test.id }}
        >
          <XCircle className="size-4" aria-hidden="true" />
          Cancel
        </InlineActionForm>
      ) : null}
    </div>
  );
}

function SnagActions({ role, snag, userId }: { role: OpsUserRole; snag: OpsSnagItemSummary; userId: string }) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {canStartOpsSnagItem(role, snag) ? (
        <InlineActionForm
          action={startSnagItemAction}
          buttonClass={OPS_PRIMARY_BUTTON_CLASS}
          confirmText="Start this snag item?"
          hidden={{ snag_id: snag.id }}
        >
          <Send className="size-4" aria-hidden="true" />
          Start
        </InlineActionForm>
      ) : null}
      {canResolveOpsSnagItem(userId, role, snag) ? (
        <details className="w-full rounded-md border border-border p-3">
          <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">
            Resolve snag
          </summary>
          <form action={resolveSnagItemAction} className="mt-3 grid gap-3">
            <input name="snag_id" type="hidden" value={snag.id} />
            <label className={OPS_LABEL_CLASS}>
              Resolution notes
              <textarea className={OPS_INPUT_CLASS} name="resolution_notes" rows={2} />
            </label>
            <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              Resolve
            </button>
          </form>
        </details>
      ) : null}
      {canVerifyOpsSnagItem(role, snag) ? (
        <InlineActionForm
          action={verifySnagItemAction}
          buttonClass={OPS_SECONDARY_BUTTON_CLASS}
          confirmText="Verify this snag item?"
          hidden={{ snag_id: snag.id }}
        >
          <CheckCircle2 className="size-4" aria-hidden="true" />
          Verify
        </InlineActionForm>
      ) : null}
      {canCancelOpsSnagItem(role, snag) ? (
        <InlineActionForm
          action={cancelSnagItemAction}
          buttonClass={OPS_DANGER_BUTTON_CLASS}
          confirmText="Cancel this snag item?"
          hidden={{ snag_id: snag.id }}
        >
          <XCircle className="size-4" aria-hidden="true" />
          Cancel
        </InlineActionForm>
      ) : null}
    </div>
  );
}

function DrawingActions({ drawing, role }: { drawing: OpsDrawingRecordSummary; role: OpsUserRole }) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {canSupersedeOpsDrawingRecord(role, drawing) ? (
        <InlineActionForm
          action={supersedeDrawingRecordAction}
          buttonClass={OPS_SECONDARY_BUTTON_CLASS}
          confirmText="Supersede this drawing record?"
          hidden={{ drawing_id: drawing.id }}
        >
          <Archive className="size-4" aria-hidden="true" />
          Supersede
        </InlineActionForm>
      ) : null}
      {canArchiveOpsDrawingRecord(role, drawing) ? (
        <InlineActionForm
          action={archiveDrawingRecordAction}
          buttonClass={OPS_DANGER_BUTTON_CLASS}
          confirmText="Archive this drawing record?"
          hidden={{ drawing_id: drawing.id }}
        >
          <Archive className="size-4" aria-hidden="true" />
          Archive
        </InlineActionForm>
      ) : null}
    </div>
  );
}

function MilestoneActions({ milestone, role }: { milestone: OpsProgrammeMilestoneSummary; role: OpsUserRole }) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {canUpdateOpsProgrammeMilestone(role, milestone) ? (
        <details className="w-full rounded-md border border-border p-3">
          <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">
            Update milestone
          </summary>
          <form action={updateProgrammeMilestoneAction} className="mt-3 grid gap-3 md:grid-cols-3">
            <input name="milestone_id" type="hidden" value={milestone.id} />
            <label className={OPS_LABEL_CLASS}>
              Status
              <select className={OPS_INPUT_CLASS} defaultValue={milestone.status === "completed" || milestone.status === "cancelled" ? "on_track" : milestone.status} name="status">
                {MILESTONE_UPDATE_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={OPS_LABEL_CLASS}>
              Forecast date
              <input className={OPS_INPUT_CLASS} defaultValue={milestone.forecast_date ?? ""} name="forecast_date" type="date" />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Progress %
              <input className={OPS_INPUT_CLASS} defaultValue={milestone.progress_percent} max="100" min="0" name="progress_percent" type="number" />
            </label>
            <label className={`${OPS_LABEL_CLASS} md:col-span-3`}>
              Delay reason
              <input className={OPS_INPUT_CLASS} defaultValue={milestone.delay_reason} name="delay_reason" />
            </label>
            <label className={`${OPS_LABEL_CLASS} md:col-span-3`}>
              Notes
              <textarea className={OPS_INPUT_CLASS} defaultValue={milestone.notes} name="notes" rows={2} />
            </label>
            <button className={`${OPS_PRIMARY_BUTTON_CLASS} md:col-span-1`} type="submit">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              Update
            </button>
          </form>
        </details>
      ) : null}
      {canCompleteOpsProgrammeMilestone(role, milestone) ? (
        <InlineActionForm
          action={completeProgrammeMilestoneAction}
          buttonClass={OPS_SECONDARY_BUTTON_CLASS}
          confirmText="Complete this programme milestone?"
          hidden={{ milestone_id: milestone.id }}
        >
          <CheckCircle2 className="size-4" aria-hidden="true" />
          Complete
        </InlineActionForm>
      ) : null}
      {canCancelOpsProgrammeMilestone(role, milestone) ? (
        <InlineActionForm
          action={cancelProgrammeMilestoneAction}
          buttonClass={OPS_DANGER_BUTTON_CLASS}
          confirmText="Cancel this programme milestone?"
          hidden={{ milestone_id: milestone.id }}
        >
          <XCircle className="size-4" aria-hidden="true" />
          Cancel
        </InlineActionForm>
      ) : null}
    </div>
  );
}

export default async function OpsEngineeringControlsPage({ searchParams }: PageProps) {
  const [params, auth] = await Promise.all([
    searchParams ?? Promise.resolve({} as OpsSearchParams),
    requireOpsUser(),
  ]);

  if (!canAccessOpsHref(auth.profile.role, ROUTE)) {
    notFound();
  }

  const listState = parseOpsListState(params, { defaultPageSize: 8 });
  const status = statusFromParam(firstParam(params.status));
  const [
    instructionPage,
    stats,
    programmePressure,
    qaCategoryPressure,
    siteOptions,
    userOptions,
    documentVersionOptions,
    inspectionOptions,
    recentFollowUps,
    inspections,
    materialTests,
    snags,
    drawings,
    milestones,
  ] = await Promise.all([
    fetchPaginatedOpsSiteInstructions({
      listState,
      query: listState.query,
      status: status || undefined,
    }),
    fetchOpsEngineeringControlStats(),
    fetchOpsEngineeringProgrammePressureReport(),
    fetchOpsEngineeringQaCategoryReport(),
    fetchActiveSiteOptions(),
    fetchEngineeringUserOptions(),
    fetchDrawingDocumentVersionOptions(),
    fetchQaInspectionOptions(),
    fetchRecentOpsSiteInstructionFollowUps(),
    fetchRecentOpsQaInspections(),
    fetchRecentOpsMaterialTests(),
    fetchRecentOpsSnagItems(),
    fetchRecentOpsDrawingRecords(),
    fetchRecentOpsProgrammeMilestones(),
  ]);
  const followUpsByInstruction = await fetchOpsSiteInstructionFollowUpsForInstructions(
    instructionPage.items.map((instruction) => instruction.id),
  );
  const notice = engineeringNotice(params);
  const canCreate = canCreateOpsEngineeringControl(auth.profile.role);
  const filters = [
    {
      label: "Status",
      name: "status",
      options: INSTRUCTION_STATUS_OPTIONS,
      value: status,
    },
  ];

  return (
    <div className="grid gap-6">
      <section className="rounded-lg border border-border bg-card p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary-blue">
              Engineering Controls
            </p>
            <h1 className="mt-2 font-heading text-3xl font-bold text-foreground">
              Site Instructions and Quality Assurance and Quality Control
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Control issued instructions, QA inspections, material tests, snags, drawings, and programme milestones against the active project/site master.
            </p>
          </div>
          <div className="grid gap-2 text-sm text-muted-foreground min-[520px]:grid-cols-2 lg:min-w-96">
            <DetailItem label="Open instructions" value={String(stats.openInstructions)} />
            <DetailItem label="Follow-ups" value={String(stats.openFollowUps)} />
          </div>
        </div>
        {notice ? (
          <p
            className={`mt-5 rounded-md border px-3 py-2 text-sm font-semibold ${
              notice.tone === "error"
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            {notice.message}
          </p>
        ) : null}
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <OpsKpiCard href={`${ROUTE}?status=issued`} icon={Send} label="Issued instructions" value={String(stats.openInstructions)} />
        <OpsKpiCard href="#qa-inspections" icon={ClipboardCheck} label="Planned QA" value={String(stats.plannedInspections)} />
        <OpsKpiCard href="#snags" icon={AlertTriangle} label="Overdue snags" tone={stats.overdueSnags > 0 ? "warn" : "default"} value={String(stats.overdueSnags)} />
        <OpsKpiCard href="#drawings" icon={FileText} label="Current drawings" value={String(stats.currentDrawings)} />
        <OpsKpiCard href="#instruction-follow-ups" icon={GitPullRequest} label="Follow-ups" tone={stats.openFollowUps > 0 ? "warn" : "default"} value={String(stats.openFollowUps)} />
      </section>

      <section className="grid gap-6 xl:grid-cols-3" id="instruction-follow-ups">
        <QaCategoryPressurePanel rows={qaCategoryPressure} />
        <ProgrammePressurePanel report={programmePressure} />
        <ActiveFollowUpsPanel
          followUps={recentFollowUps}
          role={auth.profile.role}
          userId={auth.profile.id}
        />
      </section>

      <CreateSiteInstructionForm canCreate={canCreate} sites={siteOptions} users={userOptions} />
      <CreateQaInspectionForm canCreate={canCreate} sites={siteOptions} users={userOptions} />
      <CreateLinkedRecordsForm
        canCreate={canCreate}
        documentVersions={documentVersionOptions}
        inspections={inspectionOptions}
        sites={siteOptions}
        users={userOptions}
      />

      <OpsDashboardPanel
        actions={
          <span className="rounded-full border border-border px-3 py-1.5 text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">
            {instructionPage.pagination.total} records
          </span>
        }
        title="Site Instruction Register"
      >
        <OpsListControls
          action={ROUTE}
          filters={filters}
          placeholder="Search instruction number, title, description, or response"
          query={listState.query}
          resultLabel="instructions"
        />
        <div className="grid gap-4 p-5">
          {instructionPage.items.length === 0 ? (
            listState.query || status ? (
              <OpsEmptyState
                actions={[{ href: ROUTE, label: "Clear search and filters" }]}
                description="No site instructions match the current search and status filter. Widen them, or clear them to see the whole register."
                icon={ClipboardList}
                title="No matching instructions"
              />
            ) : (
              <OpsEmptyState
                actions={
                  canCreate
                    ? [{ href: "#instruction-create", label: "Issue a site instruction" }]
                    : []
                }
                description="Site instructions record a formal direction to the site team and the response to it — the paper trail that supports a variation or claim later."
                icon={ClipboardList}
                title="No site instructions yet"
                tip={
                  canCreate
                    ? undefined
                    : "Instructions are issued by the Engineer or Projects Manager."
                }
              />
            )
          ) : (
            instructionPage.items.map((instruction) => (
              <article className="rounded-lg border border-border bg-card" key={instruction.id}>
                <div className="p-5">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap gap-2">
                        <StatusBadge value={instruction.status} />
                        <StatusBadge value={instruction.priority} />
                      </div>
                      <h2 className="mt-3 font-heading text-xl font-bold text-foreground">
                        {instruction.instruction_number} - {instruction.title}
                      </h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {instruction.site?.code ?? "Site"} / {formatLabel(instruction.instruction_type)}
                      </p>
                    </div>
                    <div className="grid gap-2 text-sm min-[520px]:grid-cols-2 lg:min-w-80">
                      <DetailItem label="Instruction date" value={formatDate(instruction.instruction_date)} />
                      <DetailItem label="Required by" value={formatDate(instruction.required_by)} />
                    </div>
                  </div>
                  {instruction.description ? (
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">{instruction.description}</p>
                  ) : null}
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <DetailItem label="Assigned to" value={instruction.assigned_to_user?.full_name ?? "Unassigned"} />
                    <DetailItem label="Issued by" value={instruction.issued_by_user?.full_name ?? "Not issued"} />
                    <DetailItem label="Acknowledged" value={formatDateTime(instruction.acknowledged_at)} />
                  </div>
                  {instruction.response_notes ? (
                    <p className="mt-3 rounded-md border border-border bg-muted/40 px-3 py-3 text-sm text-muted-foreground">
                      {instruction.response_notes}
                    </p>
                  ) : null}
                  <InstructionFollowUps
                    canCreate={canCreate}
                    followUps={followUpsByInstruction.get(instruction.id) ?? []}
                    instruction={instruction}
                    role={auth.profile.role}
                    userId={auth.profile.id}
                    users={userOptions}
                  />
                  <InstructionActions instruction={instruction} role={auth.profile.role} userId={auth.profile.id} />
                </div>
                <OpsRecordActivityPanel canManage={canCreate} sourceId={instruction.id} sourceTable="site_instructions" />
              </article>
            ))
          )}
        </div>
        <OpsPaginationControls
          basePath={ROUTE}
          filters={filters}
          pagination={instructionPage.pagination}
          query={listState.query}
          resultLabel="instructions"
        />
      </OpsDashboardPanel>

      <div className="scroll-mt-24" id="qa-inspections">
        <OpsDashboardPanel
          actions={
            <span className="rounded-full border border-orange-100 bg-orange-50 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.1em] text-orange-700">
              {stats.actionRequiredInspections} action required
            </span>
          }
          title="QA Inspections"
        >
          <div className="grid gap-4">
            {inspections.length === 0 ? (
              <OpsEmptyState
                actions={
                  canCreate
                    ? [{ href: "#qa-inspection-create", label: "Raise a QA inspection" }]
                    : []
                }
                description="Inspections and their hold points are recorded here, including the client sign-off captured on the engineer's device at the point of check."
                icon={ClipboardCheck}
                title="No QA inspections yet"
              />
            ) : (
              inspections.map((inspection) => (
                <article className="rounded-lg border border-border bg-card" key={inspection.id}>
                <div className="p-5">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <StatusBadge value={inspection.status} />
                      <h3 className="mt-3 font-heading text-lg font-bold text-foreground">
                        {inspection.inspection_number} - {inspection.title}
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {inspection.site?.code ?? "Site"} / {formatLabel(inspection.inspection_type)}
                      </p>
                    </div>
                    <div className="grid gap-2 text-sm min-[520px]:grid-cols-3 lg:min-w-[28rem]">
                      <DetailItem label="Date" value={formatDate(inspection.inspection_date)} />
                      <DetailItem label="Score" value={`${inspection.score}%`} />
                      <DetailItem label="Inspector" value={inspection.inspector?.full_name ?? "Unassigned"} />
                    </div>
                  </div>
                  {inspection.summary ? (
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">{inspection.summary}</p>
                  ) : null}
                  {inspection.action_required ? (
                    <p className="mt-3 rounded-md border border-orange-100 bg-orange-50 px-3 py-3 text-sm font-semibold text-orange-700">
                      {inspection.action_required}
                    </p>
                  ) : null}
                  <QaInspectionItems canCreate={canCreate} inspection={inspection} users={userOptions} />
                  <QaInspectionActions inspection={inspection} role={auth.profile.role} />
                </div>
                <OpsRecordActivityPanel canManage={canCreate} sourceId={inspection.id} sourceTable="qa_inspections" />
              </article>
              ))
            )}
          </div>
        </OpsDashboardPanel>
      </div>

      <section className="grid gap-6 xl:grid-cols-2">
        <OpsDashboardPanel
          actions={
            <span className="rounded-full border border-red-100 bg-red-50 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.1em] text-red-700">
              {stats.failedTests} failed
            </span>
          }
          title="Material Tests"
        >
          <div className="grid gap-4" id="material-tests">
            {materialTests.length === 0 ? (
              <OpsEmptyState
                actions={
                  canCreate
                    ? [{ href: "#material-test-create", label: "Record a material test" }]
                    : []
                }
                description="Cube crushes, slump tests and compaction results are logged here so quality evidence sits with the project rather than in a lab email."
                icon={AlertTriangle}
                title="No material tests yet"
              />
            ) : (
              materialTests.map((test) => (
                <article className="rounded-lg border border-border bg-card" key={test.id}>
                  <div className="p-5">
                    <div className="flex flex-col gap-3 min-[520px]:flex-row min-[520px]:items-start min-[520px]:justify-between">
                      <div>
                        <StatusBadge value={test.status} />
                        <h3 className="mt-3 font-heading text-lg font-bold text-foreground">
                          {test.test_number} - {test.test_type}
                        </h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {test.site?.code ?? "Site"} / {test.location || "No location"}
                        </p>
                      </div>
                      <DetailItem label="Test date" value={formatDate(test.test_date)} />
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <DetailItem label="Sample" value={test.sample_reference || "Not set"} />
                      <DetailItem label="Lab" value={test.lab_reference || "Not set"} />
                      <DetailItem label="Result" value={test.result_value || "Pending"} />
                    </div>
                    {test.result_summary ? (
                      <p className="mt-3 text-sm leading-6 text-muted-foreground">{test.result_summary}</p>
                    ) : null}
                    <MaterialTestActions role={auth.profile.role} test={test} />
                  </div>
                  <OpsRecordActivityPanel canManage={canCreate} sourceId={test.id} sourceTable="material_tests" />
                </article>
              ))
            )}
          </div>
        </OpsDashboardPanel>

        <OpsDashboardPanel
          actions={
            <span className="rounded-full border border-orange-100 bg-orange-50 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.1em] text-orange-700">
              {stats.openSnags} open
            </span>
          }
          title="Snag List"
        >
          <div className="grid gap-4" id="snags">
            {snags.length === 0 ? (
              <OpsEmptyState
                actions={
                  canCreate ? [{ href: "#snag-create", label: "Add a snag item" }] : []
                }
                description="Defects raised at inspection or handover are tracked to close-out here, so nothing outstanding is discovered at final account."
                icon={ListChecks}
                title="No snag items yet"
              />
            ) : (
              snags.map((snag) => (
                <article className="rounded-lg border border-border bg-card" key={snag.id}>
                  <div className="p-5">
                    <div className="flex flex-col gap-3 min-[520px]:flex-row min-[520px]:items-start min-[520px]:justify-between">
                      <div>
                        <div className="flex flex-wrap gap-2">
                          <StatusBadge value={snag.status} />
                          <StatusBadge value={snag.priority} />
                        </div>
                        <h3 className="mt-3 font-heading text-lg font-bold text-foreground">
                          {snag.snag_number} - {snag.title}
                        </h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {snag.site?.code ?? "Site"} / {snag.location || "No location"}
                        </p>
                      </div>
                      <DetailItem label="Due" value={formatDate(snag.due_date)} />
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <DetailItem label="Assigned to" value={snag.assigned_to_user?.full_name ?? "Unassigned"} />
                      <DetailItem label="Resolved" value={formatDateTime(snag.resolved_at)} />
                    </div>
                    {snag.description ? (
                      <p className="mt-3 text-sm leading-6 text-muted-foreground">{snag.description}</p>
                    ) : null}
                    {snag.resolution_notes ? (
                      <p className="mt-3 rounded-md border border-border bg-muted/40 px-3 py-3 text-sm text-muted-foreground">
                        {snag.resolution_notes}
                      </p>
                    ) : null}
                    <SnagActions role={auth.profile.role} snag={snag} userId={auth.profile.id} />
                  </div>
                  <OpsRecordActivityPanel canManage={canCreate} sourceId={snag.id} sourceTable="snag_items" />
                </article>
              ))
            )}
          </div>
        </OpsDashboardPanel>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <OpsDashboardPanel
          actions={
            <span className="rounded-full border border-border px-3 py-1.5 text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">
              Drawing control
            </span>
          }
          title="Drawing Register"
        >
          <div className="grid gap-4" id="drawings">
            {drawings.length === 0 ? (
              <OpsEmptyState
                actions={
                  canCreate ? [{ href: "#drawing-create", label: "Register a drawing" }] : []
                }
                description="The drawing register records which revision is current on site, so work is never built to a superseded sheet."
                icon={FileText}
                title="No drawings registered yet"
              />
            ) : (
              drawings.map((drawing) => (
                <article className="rounded-lg border border-border bg-card" key={drawing.id}>
                  <div className="p-5">
                    <div className="flex flex-col gap-3 min-[520px]:flex-row min-[520px]:items-start min-[520px]:justify-between">
                      <div>
                        <StatusBadge value={drawing.status} />
                        <h3 className="mt-3 font-heading text-lg font-bold text-foreground">
                          {drawing.drawing_number} Rev {drawing.revision}
                        </h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {drawing.title} / {drawing.site?.code ?? "Site"}
                        </p>
                      </div>
                      <DetailItem label="Received" value={formatDate(drawing.received_date)} />
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <DetailItem label="Discipline" value={drawing.discipline || "Not set"} />
                      <DetailItem label="Issued" value={formatDate(drawing.issued_date)} />
                      <DetailItem
                        label="Document version"
                        value={
                          drawing.document_version
                            ? `${drawing.document_version.document?.title ?? "Document"} v${drawing.document_version.version_number}`
                            : drawing.document_id
                              ? "Document linked"
                              : "Not linked"
                        }
                      />
                    </div>
                    {drawing.document_version ? (
                      <p className="mt-3 inline-flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm font-semibold text-muted-foreground">
                        <LinkIcon className="size-4 text-primary-blue" aria-hidden="true" />
                        {drawing.document_version.file_name}
                      </p>
                    ) : null}
                    {drawing.notes ? (
                      <p className="mt-3 text-sm leading-6 text-muted-foreground">{drawing.notes}</p>
                    ) : null}
                    <DrawingActions drawing={drawing} role={auth.profile.role} />
                  </div>
                  <OpsRecordActivityPanel canManage={canCreate} sourceId={drawing.id} sourceTable="drawing_register" />
                </article>
              ))
            )}
          </div>
        </OpsDashboardPanel>

        <OpsDashboardPanel
          actions={
            <span className="rounded-full border border-orange-100 bg-orange-50 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.1em] text-orange-700">
              {stats.delayedMilestones} delayed
            </span>
          }
          title="Programme Milestones"
        >
          <div className="grid gap-4" id="programme">
            {milestones.length === 0 ? (
              <OpsEmptyState
                actions={
                  canCreate
                    ? [{ href: "#programme-milestone-create", label: "Add a programme milestone" }]
                    : []
                }
                description="Programme milestones are the dates the project is measured against — they drive the delay and pressure reporting at the top of this page."
                icon={ClipboardList}
                title="No programme milestones yet"
              />
            ) : (
              milestones.map((milestone) => (
                <article className="rounded-lg border border-border bg-card" key={milestone.id}>
                  <div className="p-5">
                    <div className="flex flex-col gap-3 min-[520px]:flex-row min-[520px]:items-start min-[520px]:justify-between">
                      <div>
                        <StatusBadge value={milestone.status} />
                        <h3 className="mt-3 font-heading text-lg font-bold text-foreground">
                          {milestone.milestone_number} - {milestone.title}
                        </h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {milestone.site?.code ?? "Site"} / Owner {milestone.owner?.full_name ?? "Unassigned"}
                        </p>
                      </div>
                      <DetailItem label="Progress" value={`${milestone.progress_percent}%`} />
                    </div>
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary-blue"
                        style={{ width: `${Math.min(Math.max(milestone.progress_percent, 0), 100)}%` }}
                      />
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <DetailItem label="Baseline" value={formatDate(milestone.baseline_date)} />
                      <DetailItem label="Forecast" value={formatDate(milestone.forecast_date)} />
                      <DetailItem label="Actual" value={formatDate(milestone.actual_date)} />
                    </div>
                    {milestone.delay_reason ? (
                      <p className="mt-3 rounded-md border border-orange-100 bg-orange-50 px-3 py-3 text-sm font-semibold text-orange-700">
                        {milestone.delay_reason}
                      </p>
                    ) : null}
                    {milestone.notes ? (
                      <p className="mt-3 text-sm leading-6 text-muted-foreground">{milestone.notes}</p>
                    ) : null}
                    <MilestoneActions milestone={milestone} role={auth.profile.role} />
                  </div>
                  <OpsRecordActivityPanel canManage={canCreate} sourceId={milestone.id} sourceTable="programme_milestones" />
                </article>
              ))
            )}
          </div>
        </OpsDashboardPanel>
      </section>
    </div>
  );
}
