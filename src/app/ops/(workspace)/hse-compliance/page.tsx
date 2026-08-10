import { Suspense } from "react";
import {
  Boxes,
  CalendarCheck,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  GraduationCap,
  HardHat,
  Plus,
  RotateCcw,
  ShieldCheck,
  ShieldPlus,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OpsInlineEmpty } from "@/components/ops/OpsInlineEmpty";
import { OpsCollapsible } from "@/components/ops/OpsCollapsible";
import { OpsConfirmSubmitButton } from "@/components/ops/OpsConfirmSubmitButton";
import { OpsEmptyState } from "@/components/ops/OpsEmptyState";
import { OpsPanelSkeleton } from "@/components/ops/OpsPanelSkeleton";
import { OpsKpiCard } from "@/components/ops/OpsKpiCard";
import { OpsListControls, OpsPaginationControls } from "@/components/ops/OpsListControls";
import { OpsPageHeader } from "@/components/ops/OpsPageHeader";
import { OpsRecordActivityPanel } from "@/components/ops/OpsRecordActivityPanel";
import { fetchOpsModuleAccessOverrides } from "@/lib/ops/module-access";
import { requireOpsUser } from "@/lib/ops/auth";
import {
  adjustPpeItemStockAction,
  approveHseRiskAssessmentAction,
  archiveHseRiskAssessmentAction,
  cancelHseComplianceAuditAction,
  cancelHseInspectionAction,
  cancelHseInspectionFindingAction,
  cancelPpeIssueAction,
  cancelHseRiskAssessmentAction,
  cancelSafetyTrainingRecordAction,
  cancelToolboxTalkAction,
  closeHseComplianceAuditAction,
  completeHseComplianceAuditAction,
  closeHseInspectionAction,
  completeHseInspectionAction,
  completeSafetyTrainingRecordAction,
  completeToolboxTalkAction,
  correctHseInspectionFindingAction,
  createHseComplianceAuditAction,
  createHseInspectionAction,
  createHseInspectionFindingAction,
  createPpeIssueAction,
  createPpeItemAction,
  createHseRiskAssessmentAction,
  createSafetyTrainingRecordAction,
  createToolboxTalkAction,
  createToolboxTalkAttendeeAction,
  markPpeIssueDamagedAction,
  markPpeIssueLostAction,
  requireHseComplianceAuditActionAction,
  requireHseInspectionActionAction,
  returnPpeIssueAction,
  startHseInspectionFindingAction,
  submitHseRiskAssessmentAction,
  verifyHseInspectionFindingAction,
} from "@/lib/ops/hse-compliance-actions";
import {
  fetchActivePpeItemOptions,
  fetchHseComplianceEmployeeOptions,
  fetchOpsHseAgeingAlerts,
  fetchOpsHseComplianceStats,
  fetchPaginatedOpsPpeIssues,
  fetchRecentOpsHseComplianceAudits,
  fetchRecentOpsHseInspections,
  fetchRecentOpsPpeItems,
  fetchRecentOpsHseRiskAssessments,
  fetchRecentOpsSafetyTrainingRecords,
  fetchRecentOpsToolboxTalks,
  type OpsHseComplianceAuditSummary,
  type OpsHseInspectionFindingSummary,
  type OpsHseInspectionSummary,
  type OpsHseRiskAssessmentSummary,
  type OpsPpeIssueSummary,
  type OpsPpeItemSummary,
  type OpsSafetyTrainingRecordSummary,
  type OpsToolboxTalkSummary,
} from "@/lib/ops/hse-compliance";
import {
  buildOpsHseAuditEscalations,
  buildOpsHseRiskHeatmap,
  OPS_HSE_RISK_LEVELS,
  type OpsHseAuditEscalationBucket,
  type OpsHseRiskHeatmapCell,
} from "@/lib/ops/hse-compliance-reporting";
import {
  canAddOpsToolboxTalkAttendee,
  canAdjustOpsPpeItem,
  canApproveOpsHseRiskAssessment,
  canArchiveOpsHseRiskAssessment,
  canCancelOpsHseComplianceAudit,
  canCancelOpsHseInspection,
  canCancelOpsHseInspectionFinding,
  canCancelOpsPpeIssue,
  canCancelOpsHseRiskAssessment,
  canCancelOpsSafetyTraining,
  canCancelOpsToolboxTalk,
  canCloseOpsHseComplianceAudit,
  canCompleteOpsHseComplianceAudit,
  canCloseOpsHseInspection,
  canCompleteOpsHseInspection,
  canCompleteOpsSafetyTraining,
  canCompleteOpsToolboxTalk,
  canCorrectOpsHseInspectionFinding,
  canCreateOpsHseComplianceAudit,
  canCreateOpsHseInspection,
  canCreateOpsHseInspectionFinding,
  canCreateOpsPpeIssue,
  canCreateOpsPpeItem,
  canCreateOpsHseRiskAssessment,
  canCreateOpsSafetyTraining,
  canCreateOpsToolboxTalk,
  canManageOpsHseInspection,
  canManageOpsPpeIssue,
  canManageOpsToolboxTalk,
  canMarkOpsPpeIssueDamaged,
  canMarkOpsPpeIssueLost,
  canRequireOpsHseComplianceAuditAction,
  canRequireOpsHseInspectionAction,
  canReturnOpsPpeIssue,
  canStartOpsHseInspectionFinding,
  canSubmitOpsHseRiskAssessment,
  canVerifyOpsHseInspectionFinding,
} from "@/lib/ops/hse-permissions";
import { fetchHseUserOptions } from "@/lib/ops/hse";
import { parseOpsListState } from "@/lib/ops/listing";
import { canAccessOpsHref } from "@/lib/ops/permissions";
import { formatOpsUserName } from "@/lib/ops/roles";
import { fetchActiveSiteOptions } from "@/lib/ops/sites";
import type {
  OpsHseInspectionType,
  OpsPpeIssueStatus,
  OpsPpeItemType,
  OpsUserRole,
} from "@/lib/ops/types";
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
  OPS_STATUS_TONES,
  opsStatusBadgeClass,
  type OpsStatusTone,
} from "@/lib/ops/ui";
import { todayInLusaka, formatOpsLabel as formatLabel, formatOpsDate as formatDate, formatOpsDateTime as formatDateTime } from "@/lib/ops/format";

type PageProps = {
  searchParams?: Promise<OpsSearchParams>;
};

const PPE_STATUS_OPTIONS: Array<{ label: string; value: OpsPpeIssueStatus | "" }> = [
  { label: "All statuses", value: "" },
  { label: "Issued", value: "issued" },
  { label: "Returned", value: "returned" },
  { label: "Damaged", value: "damaged" },
  { label: "Lost", value: "lost" },
  { label: "Cancelled", value: "cancelled" },
];

const PPE_TYPE_OPTIONS: Array<{ label: string; value: OpsPpeItemType }> = [
  { label: "Helmet", value: "helmet" },
  { label: "Vest", value: "vest" },
  { label: "Boots", value: "boots" },
  { label: "Gloves", value: "gloves" },
  { label: "Goggles", value: "goggles" },
  { label: "Harness", value: "harness" },
  { label: "Respirator", value: "respirator" },
  { label: "Ear protection", value: "ear_protection" },
  { label: "Other", value: "other" },
];

const INSPECTION_TYPE_OPTIONS: Array<{ label: string; value: OpsHseInspectionType }> = [
  { label: "Site walk", value: "site_walk" },
  { label: "Scaffolding", value: "scaffolding" },
  { label: "Lifting", value: "lifting" },
  { label: "Electrical", value: "electrical" },
  { label: "Excavation", value: "excavation" },
  { label: "Fire", value: "fire" },
  { label: "Environmental", value: "environmental" },
  { label: "Plant equipment", value: "plant_equipment" },
  { label: "Housekeeping", value: "housekeeping" },
  { label: "Other", value: "other" },
];

const FINDING_SEVERITY_OPTIONS = [
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
  { label: "Critical", value: "critical" },
] as const;

function statusFromParam(value: string | undefined) {
  return PPE_STATUS_OPTIONS.some((status) => status.value === value)
    ? (value as OpsPpeIssueStatus | "")
    : "";
}

function hseComplianceNotice(params: OpsSearchParams) {
  const created = noticeFromParams(params, "ppe", "PPE issue created.");

  if (created) {
    return created;
  }

  const createdValue = firstParam(params.created);
  const updatedValue = firstParam(params.updated);
  const messages: Record<string, string> = {
    attachment: "HSE compliance attachment uploaded.",
    audit_action_required: "Compliance audit marked action required.",
    audit_cancelled: "Compliance audit cancelled.",
    audit_closed: "Compliance audit closed.",
    audit_completed: "Compliance audit completed.",
    compliance_audit: "Compliance audit created.",
    comment: "HSE compliance comment added.",
    inspection: "Inspection created.",
    inspection_action_required: "Inspection marked action required.",
    inspection_cancelled: "Inspection cancelled.",
    inspection_closed: "Inspection closed.",
    inspection_completed: "Inspection completed.",
    inspection_finding: "Inspection finding created.",
    finding_cancelled: "Inspection finding cancelled.",
    finding_corrected: "Inspection finding corrected.",
    finding_started: "Inspection finding started.",
    finding_verified: "Inspection finding verified.",
    ppe_cancelled: "PPE issue cancelled.",
    ppe_damaged: "PPE marked damaged.",
    ppe_item: "PPE stock item created.",
    ppe_lost: "PPE marked lost.",
    ppe_returned: "PPE returned.",
    ppe_stock: "PPE stock adjusted.",
    risk_approved: "Risk assessment approved.",
    risk_archived: "Risk assessment archived.",
    risk_assessment: "Risk assessment created.",
    risk_cancelled: "Risk assessment cancelled.",
    risk_submitted: "Risk assessment submitted.",
    training: "Safety training record created.",
    training_cancelled: "Safety training cancelled.",
    training_completed: "Safety training completed.",
    toolbox: "Toolbox talk created.",
    toolbox_attendee: "Toolbox attendee added.",
    toolbox_cancelled: "Toolbox talk cancelled.",
    toolbox_completed: "Toolbox talk completed.",
  };
  const key = createdValue ?? updatedValue ?? "";

  return key && messages[key]
    ? {
        message: messages[key],
        tone: "success" as const,
      }
    : null;
}

function riskHeatmapCellClass(cell: OpsHseRiskHeatmapCell) {
  if (cell.count === 0) {
    return "border-border bg-muted/40 text-muted-foreground";
  }

  if (cell.residualRisk === "critical") {
    return "border-red-200 bg-red-50 text-red-800";
  }

  if (cell.residualRisk === "high") {
    return "border-orange-200 bg-orange-50 text-orange-800";
  }

  if (cell.residualRisk === "medium") {
    return "border-sky-200 bg-sky-50 text-sky-800";
  }

  return "border-emerald-200 bg-emerald-50 text-emerald-800";
}

function auditEscalationBucketLabel(bucket: OpsHseAuditEscalationBucket) {
  const labels: Record<OpsHseAuditEscalationBucket, string> = {
    action_required: "Action required",
    completed_with_ncs: "Completed with NCs",
    due_soon: "Due soon",
    overdue: "Overdue",
  };

  return labels[bucket];
}

function auditEscalationBucketClass(bucket: OpsHseAuditEscalationBucket) {
  if (bucket === "overdue") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (bucket === "action_required") {
    return "border-orange-200 bg-orange-50 text-orange-700";
  }

  if (bucket === "completed_with_ncs") {
    return "border-violet-200 bg-violet-50 text-violet-700";
  }

  return "border-sky-200 bg-sky-50 text-sky-700";
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

function PpeActions({ issue, role }: { issue: OpsPpeIssueSummary; role: OpsUserRole }) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {canReturnOpsPpeIssue(role, issue) ? (
        <OpsCollapsible title="Return PPE">
          <form action={returnPpeIssueAction} className="mt-3 grid gap-3">
            <input name="issue_id" type="hidden" value={issue.id} />
            <label className={OPS_LABEL_CLASS}>
              Return notes
              <textarea className={OPS_INPUT_CLASS} name="return_condition_notes" rows={2} />
            </label>
            <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
              <RotateCcw className="size-4" aria-hidden="true" />
              Mark returned
            </button>
          </form>
        </OpsCollapsible>
      ) : null}
      {canMarkOpsPpeIssueDamaged(role, issue) ? (
        <OpsCollapsible title="Mark damaged" tone="warning">
          <form action={markPpeIssueDamagedAction} className="mt-3 grid gap-3">
            <input name="issue_id" type="hidden" value={issue.id} />
            <label className={OPS_LABEL_CLASS}>
              Replacement cost
              <input className={OPS_INPUT_CLASS} min="0" name="replacement_cost" step="0.01" type="number" />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Notes
              <textarea className={OPS_INPUT_CLASS} name="return_condition_notes" rows={2} />
            </label>
            <button className={OPS_DANGER_BUTTON_CLASS} type="submit">
              Mark damaged
            </button>
          </form>
        </OpsCollapsible>
      ) : null}
      {canMarkOpsPpeIssueLost(role, issue) ? (
        <OpsCollapsible title="Mark lost" tone="danger">
          <form action={markPpeIssueLostAction} className="mt-3 grid gap-3">
            <input name="issue_id" type="hidden" value={issue.id} />
            <label className={OPS_LABEL_CLASS}>
              Replacement cost
              <input className={OPS_INPUT_CLASS} min="0" name="replacement_cost" step="0.01" type="number" />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Notes
              <textarea className={OPS_INPUT_CLASS} name="return_condition_notes" rows={2} />
            </label>
            <button className={OPS_DANGER_BUTTON_CLASS} type="submit">
              Mark lost
            </button>
          </form>
        </OpsCollapsible>
      ) : null}
      {canCancelOpsPpeIssue(role, issue) ? (
        <InlineActionForm
          action={cancelPpeIssueAction}
          buttonClass={OPS_DANGER_BUTTON_CLASS}
          confirmText="Cancel PPE issue?"
          hidden={{ issue_id: issue.id }}
        >
          <XCircle className="size-4" aria-hidden="true" />
          Cancel
        </InlineActionForm>
      ) : null}
    </div>
  );
}

function ToolboxTalkActions({ role, talk }: { role: OpsUserRole; talk: OpsToolboxTalkSummary }) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {canCompleteOpsToolboxTalk(role, talk) ? (
        <OpsCollapsible title="Complete talk">
          <form action={completeToolboxTalkAction} className="mt-3 grid gap-3 sm:grid-cols-2">
            <input name="talk_id" type="hidden" value={talk.id} />
            <label className={OPS_LABEL_CLASS}>
              Attendees
              <input className={OPS_INPUT_CLASS} min="0" name="attendees_count" type="number" />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Duration minutes
              <input className={OPS_INPUT_CLASS} min="0" name="duration_minutes" type="number" />
            </label>
            <label className={`${OPS_LABEL_CLASS} sm:col-span-2`}>
              Summary
              <textarea className={OPS_INPUT_CLASS} name="summary" rows={2} />
            </label>
            <label className={`${OPS_LABEL_CLASS} sm:col-span-2`}>
              Actions required
              <textarea className={OPS_INPUT_CLASS} name="actions_required" rows={2} />
            </label>
            <button className={`${OPS_PRIMARY_BUTTON_CLASS} sm:col-span-2`} type="submit">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              Complete
            </button>
          </form>
        </OpsCollapsible>
      ) : null}
      {canCancelOpsToolboxTalk(role, talk) ? (
        <InlineActionForm
          action={cancelToolboxTalkAction}
          buttonClass={OPS_DANGER_BUTTON_CLASS}
          confirmText="Cancel toolbox talk?"
          hidden={{ talk_id: talk.id }}
        >
          <XCircle className="size-4" aria-hidden="true" />
          Cancel
        </InlineActionForm>
      ) : null}
    </div>
  );
}

function InspectionActions({ inspection, role }: { inspection: OpsHseInspectionSummary; role: OpsUserRole }) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {canCompleteOpsHseInspection(role, inspection) ? (
        <OpsCollapsible title="Complete inspection">
          <form action={completeHseInspectionAction} className="mt-3 grid gap-3 sm:grid-cols-3">
            <input name="inspection_id" type="hidden" value={inspection.id} />
            <label className={OPS_LABEL_CLASS}>
              Score
              <input className={OPS_INPUT_CLASS} max="100" min="0" name="score" step="0.01" type="number" />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Findings
              <input className={OPS_INPUT_CLASS} min="0" name="findings_count" type="number" />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Actions
              <input className={OPS_INPUT_CLASS} min="0" name="action_count" type="number" />
            </label>
            <label className={`${OPS_LABEL_CLASS} sm:col-span-3`}>
              Summary
              <textarea className={OPS_INPUT_CLASS} name="summary" rows={2} />
            </label>
            <button className={`${OPS_PRIMARY_BUTTON_CLASS} sm:col-span-3`} type="submit">
              Complete
            </button>
          </form>
        </OpsCollapsible>
      ) : null}
      {canRequireOpsHseInspectionAction(role, inspection) ? (
        <OpsCollapsible title="Require action" tone="warning">
          <form action={requireHseInspectionActionAction} className="mt-3 grid gap-3">
            <input name="inspection_id" type="hidden" value={inspection.id} />
            <label className={OPS_LABEL_CLASS}>
              Corrective actions required
              <textarea className={OPS_INPUT_CLASS} name="corrective_actions_required" required rows={2} />
            </label>
            <button className={OPS_DANGER_BUTTON_CLASS} type="submit">
              Require action
            </button>
          </form>
        </OpsCollapsible>
      ) : null}
      {canCloseOpsHseInspection(role, inspection) ? (
        <InlineActionForm
          action={closeHseInspectionAction}
          buttonClass={OPS_SECONDARY_BUTTON_CLASS}
          confirmText="Close inspection?"
          hidden={{ inspection_id: inspection.id }}
        >
          Close
        </InlineActionForm>
      ) : null}
      {canCancelOpsHseInspection(role, inspection) ? (
        <InlineActionForm
          action={cancelHseInspectionAction}
          buttonClass={OPS_DANGER_BUTTON_CLASS}
          confirmText="Cancel inspection?"
          hidden={{ inspection_id: inspection.id }}
        >
          Cancel
        </InlineActionForm>
      ) : null}
    </div>
  );
}

function InspectionFindingActions({
  finding,
  role,
}: {
  finding: OpsHseInspectionFindingSummary;
  role: OpsUserRole;
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {canStartOpsHseInspectionFinding(role, finding) ? (
        <InlineActionForm
          action={startHseInspectionFindingAction}
          buttonClass={OPS_SECONDARY_BUTTON_CLASS}
          confirmText="Start this finding?"
          hidden={{ finding_id: finding.id }}
        >
          Start
        </InlineActionForm>
      ) : null}
      {canCorrectOpsHseInspectionFinding(role, finding) ? (
        <OpsCollapsible title="Correct finding">
          <form action={correctHseInspectionFindingAction} className="mt-3 grid gap-3">
            <input name="finding_id" type="hidden" value={finding.id} />
            <label className={OPS_LABEL_CLASS}>
              Completion notes
              <textarea className={OPS_INPUT_CLASS} name="completion_notes" rows={2} />
            </label>
            <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
              Mark corrected
            </button>
          </form>
        </OpsCollapsible>
      ) : null}
      {canVerifyOpsHseInspectionFinding(role, finding) ? (
        <InlineActionForm
          action={verifyHseInspectionFindingAction}
          buttonClass={OPS_PRIMARY_BUTTON_CLASS}
          confirmText="Verify this finding?"
          hidden={{ finding_id: finding.id }}
        >
          Verify
        </InlineActionForm>
      ) : null}
      {canCancelOpsHseInspectionFinding(role, finding) ? (
        <InlineActionForm
          action={cancelHseInspectionFindingAction}
          buttonClass={OPS_DANGER_BUTTON_CLASS}
          confirmText="Cancel this finding?"
          hidden={{ finding_id: finding.id }}
        >
          Cancel
        </InlineActionForm>
      ) : null}
    </div>
  );
}

function SafetyTrainingActions({
  record,
  role,
  today,
}: {
  record: OpsSafetyTrainingRecordSummary;
  role: OpsUserRole;
  today: string;
}) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {canCompleteOpsSafetyTraining(role, record) ? (
        <OpsCollapsible title="Complete training">
          <form action={completeSafetyTrainingRecordAction} className="mt-3 grid gap-3 sm:grid-cols-3">
            <input name="training_id" type="hidden" value={record.id} />
            <label className={OPS_LABEL_CLASS}>
              Completed date
              <input className={OPS_INPUT_CLASS} defaultValue={today} name="completed_date" type="date" />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Expiry date
              <input className={OPS_INPUT_CLASS} name="expiry_date" type="date" />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Score
              <input className={OPS_INPUT_CLASS} max="100" min="0" name="score" step="0.01" type="number" />
            </label>
            <label className={`${OPS_LABEL_CLASS} sm:col-span-3`}>
              Notes
              <textarea className={OPS_INPUT_CLASS} name="notes" rows={2} />
            </label>
            <button className={`${OPS_PRIMARY_BUTTON_CLASS} sm:col-span-3`} type="submit">
              Complete training
            </button>
          </form>
        </OpsCollapsible>
      ) : null}
      {canCancelOpsSafetyTraining(role, record) ? (
        <InlineActionForm
          action={cancelSafetyTrainingRecordAction}
          buttonClass={OPS_DANGER_BUTTON_CLASS}
          confirmText="Cancel this training record?"
          hidden={{ training_id: record.id }}
        >
          Cancel
        </InlineActionForm>
      ) : null}
    </div>
  );
}

function RiskAssessmentActions({
  actorId,
  assessment,
  role,
}: {
  actorId: string;
  assessment: OpsHseRiskAssessmentSummary;
  role: OpsUserRole;
}) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {canSubmitOpsHseRiskAssessment(actorId, role, assessment) ? (
        <InlineActionForm
          action={submitHseRiskAssessmentAction}
          buttonClass={OPS_SECONDARY_BUTTON_CLASS}
          confirmText="Submit this risk assessment?"
          hidden={{ assessment_id: assessment.id }}
        >
          Submit
        </InlineActionForm>
      ) : null}
      {canApproveOpsHseRiskAssessment(role, assessment) ? (
        <InlineActionForm
          action={approveHseRiskAssessmentAction}
          buttonClass={OPS_PRIMARY_BUTTON_CLASS}
          confirmText="Approve this risk assessment?"
          hidden={{ assessment_id: assessment.id }}
        >
          Approve
        </InlineActionForm>
      ) : null}
      {canArchiveOpsHseRiskAssessment(role, assessment) ? (
        <InlineActionForm
          action={archiveHseRiskAssessmentAction}
          buttonClass={OPS_SECONDARY_BUTTON_CLASS}
          confirmText="Archive this risk assessment?"
          hidden={{ assessment_id: assessment.id }}
        >
          Archive
        </InlineActionForm>
      ) : null}
      {canCancelOpsHseRiskAssessment(role, assessment) ? (
        <InlineActionForm
          action={cancelHseRiskAssessmentAction}
          buttonClass={OPS_DANGER_BUTTON_CLASS}
          confirmText="Cancel this risk assessment?"
          hidden={{ assessment_id: assessment.id }}
        >
          Cancel
        </InlineActionForm>
      ) : null}
    </div>
  );
}

function ComplianceAuditActions({
  audit,
  role,
  today,
}: {
  audit: OpsHseComplianceAuditSummary;
  role: OpsUserRole;
  today: string;
}) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {canCompleteOpsHseComplianceAudit(role, audit) ? (
        <OpsCollapsible title="Complete audit">
          <form action={completeHseComplianceAuditAction} className="mt-3 grid gap-3 sm:grid-cols-3">
            <input name="audit_id" type="hidden" value={audit.id} />
            <label className={OPS_LABEL_CLASS}>
              Completed date
              <input className={OPS_INPUT_CLASS} defaultValue={today} name="completed_date" type="date" />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Score
              <input className={OPS_INPUT_CLASS} max="100" min="0" name="score" step="0.01" type="number" />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Next audit
              <input className={OPS_INPUT_CLASS} name="next_audit_date" type="date" />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Findings
              <input className={OPS_INPUT_CLASS} min="0" name="findings_count" type="number" />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Non-conformances
              <input className={OPS_INPUT_CLASS} min="0" name="non_conformance_count" type="number" />
            </label>
            <label className={`${OPS_LABEL_CLASS} sm:col-span-3`}>
              Summary
              <textarea className={OPS_INPUT_CLASS} name="summary" rows={2} />
            </label>
            <button className={`${OPS_PRIMARY_BUTTON_CLASS} sm:col-span-3`} type="submit">
              Complete audit
            </button>
          </form>
        </OpsCollapsible>
      ) : null}
      {canRequireOpsHseComplianceAuditAction(role, audit) ? (
        <OpsCollapsible title="Require action" tone="warning">
          <form action={requireHseComplianceAuditActionAction} className="mt-3 grid gap-3">
            <input name="audit_id" type="hidden" value={audit.id} />
            <label className={OPS_LABEL_CLASS}>
              Action required
              <textarea className={OPS_INPUT_CLASS} name="action_required" required rows={2} />
            </label>
            <button className={OPS_DANGER_BUTTON_CLASS} type="submit">
              Require action
            </button>
          </form>
        </OpsCollapsible>
      ) : null}
      {canCloseOpsHseComplianceAudit(role, audit) ? (
        <InlineActionForm
          action={closeHseComplianceAuditAction}
          buttonClass={OPS_SECONDARY_BUTTON_CLASS}
          confirmText="Close this compliance audit?"
          hidden={{ audit_id: audit.id }}
        >
          Close
        </InlineActionForm>
      ) : null}
      {canCancelOpsHseComplianceAudit(role, audit) ? (
        <InlineActionForm
          action={cancelHseComplianceAuditAction}
          buttonClass={OPS_DANGER_BUTTON_CLASS}
          confirmText="Cancel this compliance audit?"
          hidden={{ audit_id: audit.id }}
        >
          Cancel
        </InlineActionForm>
      ) : null}
    </div>
  );
}

/**
 * Suspense-streamed (audit finding U1). The ageing sweep aggregates the whole
 * incident register and is read only here, so it should not hold up the PPE,
 * toolbox and inspection registers that people actually act on.
 */
async function HseAgeingSection() {
  const ageingAlerts = await fetchOpsHseAgeingAlerts();

  return (
        <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-foreground">Incident ageing watch</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Oldest open incident records from the incident register.
              </p>
            </div>
            <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/hse#incident-register">
              Open HSE
            </Link>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {ageingAlerts.length > 0 ? (
              ageingAlerts.map((alert) => (
                <article className="rounded-md border border-border p-3" key={alert.id}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary-blue">
                        {alert.incident_number}
                      </p>
                      <h3 className="mt-1 font-bold text-foreground">{alert.title}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {alert.site ? `${alert.site.code} - ${alert.site.name}` : "No site"} / {formatLabel(alert.status)}
                      </p>
                    </div>
                    <span className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-orange-700">
                      {alert.days_open} days
                    </span>
                  </div>
                </article>
              ))
            ) : (
              <div className="col-span-2"><OpsInlineEmpty>No open incident ageing alerts.</OpsInlineEmpty></div>
            )}
          </div>
        </section>
  );
}

export default async function HseCompliancePage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const auth = await requireOpsUser();

  if (!canAccessOpsHref(auth.profile.role, "/ops/hse-compliance", await fetchOpsModuleAccessOverrides())) {
    notFound();
  }

  const listState = parseOpsListState(params, { defaultPageSize: 8 });
  const status = statusFromParam(firstParam(params.status));
  const [
    sites,
    users,
    employees,
    stats,
    ppeIssues,
    ppeItems,
    ppeItemOptions,
    toolboxTalks,
    inspections,
    trainingRecords,
    riskAssessments,
    complianceAudits,
  ] = await Promise.all([
    fetchActiveSiteOptions(),
    fetchHseUserOptions(),
    fetchHseComplianceEmployeeOptions(),
    fetchOpsHseComplianceStats(),
    fetchPaginatedOpsPpeIssues({
      listState,
      query: listState.query,
      status: status || undefined,
    }),
    fetchRecentOpsPpeItems(),
    fetchActivePpeItemOptions(),
    fetchRecentOpsToolboxTalks(),
    fetchRecentOpsHseInspections(),
    fetchRecentOpsSafetyTrainingRecords(),
    fetchRecentOpsHseRiskAssessments(),
    fetchRecentOpsHseComplianceAudits(),
  ]);
  const canCreatePpe = canCreateOpsPpeIssue(auth.profile.role);
  const canCreatePpeItem = canCreateOpsPpeItem(auth.profile.role);
  const canCreateTalk = canCreateOpsToolboxTalk(auth.profile.role);
  const canCreateInspection = canCreateOpsHseInspection(auth.profile.role);
  const canCreateTraining = canCreateOpsSafetyTraining(auth.profile.role);
  const canCreateRisk = canCreateOpsHseRiskAssessment(auth.profile.role);
  const canCreateAudit = canCreateOpsHseComplianceAudit(auth.profile.role);
  const canManagePpe = canManageOpsPpeIssue(auth.profile.role);
  const canManageTalk = canManageOpsToolboxTalk(auth.profile.role);
  const canManageInspection = canManageOpsHseInspection(auth.profile.role);
  const notice = hseComplianceNotice(params);
  const today = todayInLusaka();
  const riskHeatmap = buildOpsHseRiskHeatmap(riskAssessments, today);
  const auditEscalations = buildOpsHseAuditEscalations(complianceAudits, today);
  const openCreate = firstParam(params.create);
  const hasActiveListFilter = listState.query.length > 0 || status.length > 0;

  return (
    <div className="w-full max-w-none space-y-6">
      <OpsPageHeader
        eyebrow="Health, Safety and Environment compliance"
        title="Health, Safety and Environment compliance controls"
        description="Control safety risk, audits, Personal Protective Equipment, toolbox talks, inspections, training evidence, and ageing incident follow-up."
        actions={
          <>
            {canCreatePpeItem ? (
              <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/hse-compliance?create=ppe-item#ppe-item-create-panel">
                Personal Protective Equipment stock
              </Link>
            ) : null}
            {canCreatePpe ? (
              <Link className={OPS_PRIMARY_BUTTON_CLASS} href="/ops/hse-compliance?create=ppe#ppe-create-panel">
                <Plus className="size-4" aria-hidden="true" />
                Issue Personal Protective Equipment
              </Link>
            ) : null}
            {canCreateTalk ? (
              <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/hse-compliance?create=toolbox#toolbox-create-panel">
                Toolbox talk
              </Link>
            ) : null}
            {canCreateInspection ? (
              <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/hse-compliance?create=inspection#inspection-create-panel">
                Inspection
              </Link>
            ) : null}
            {canCreateRisk ? (
              <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/hse-compliance?create=risk#risk-create-panel">
                Risk assessment
              </Link>
            ) : null}
            {canCreateAudit ? (
              <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/hse-compliance?create=audit#audit-create-panel">
                Audit
              </Link>
            ) : null}
            {canCreateTraining ? (
              <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/hse-compliance?create=training#training-create-panel">
                Training
              </Link>
            ) : null}
          </>
        }
      />

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

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <OpsKpiCard
          href="/ops/hse-compliance?status=issued#ppe-register"
          icon={HardHat}
          label="Issued PPE"
          tone={stats.overduePpe > 0 ? "warn" : "default"}
          trend={`${stats.overduePpe} overdue / ${stats.lowStockPpeItems} zero stock`}
          value={String(stats.issuedPpe)}
        />
        <OpsKpiCard
          href="/ops/hse-compliance#toolbox-panel"
          icon={ClipboardCheck}
          label="Toolbox talks"
          tone={stats.plannedTalks > 0 ? "default" : "good"}
          trend={`${stats.plannedTalks} planned`}
          value={String(stats.completedTalks)}
        />
        <OpsKpiCard
          href="/ops/hse-compliance#inspection-panel"
          icon={ShieldCheck}
          label="Open inspections"
          tone={stats.actionRequiredInspections > 0 || stats.overdueInspections > 0 ? "warn" : "default"}
          trend={`${stats.actionRequiredInspections} action / ${stats.openInspectionFindings} findings`}
          value={String(stats.openInspections)}
        />
        <OpsKpiCard
          href="/ops/hse-compliance#training-panel"
          icon={GraduationCap}
          label="Training due"
          tone={stats.expiredTraining > 0 || stats.trainingDueSoon > 0 ? "warn" : "good"}
          trend={`${stats.expiredTraining} expired`}
          value={String(stats.trainingDueSoon)}
        />
        <OpsKpiCard
          href="/ops/hse-compliance#risk-assessment-panel"
          icon={ShieldPlus}
          label="Risk reviews"
          tone={stats.reviewDueRiskAssessments > 0 || stats.highRiskAssessments > 0 ? "warn" : "default"}
          trend={`${stats.highRiskAssessments} high residual`}
          value={String(stats.reviewDueRiskAssessments)}
        />
        <OpsKpiCard
          href="/ops/hse-compliance#audit-panel"
          icon={ClipboardList}
          label="Audit actions"
          tone={stats.actionRequiredAudits > 0 || stats.auditsDueSoon > 0 ? "warn" : "default"}
          trend={`${stats.auditsDueSoon} due soon`}
          value={String(stats.actionRequiredAudits)}
        />
      </section>

      <Suspense fallback={<OpsPanelSkeleton lines={4} title="incident ageing watch" />}>
        <HseAgeingSection />
      </Suspense>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-foreground">Risk heatmap</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Active assessments by initial and residual risk.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-md border border-border px-3 py-2">
                <p className="text-lg font-bold text-foreground">{riskHeatmap.totalActive}</p>
                <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Active</p>
              </div>
              <div className="rounded-md border border-orange-200 bg-orange-50 px-3 py-2">
                <p className="text-lg font-bold text-orange-800">{riskHeatmap.highResidualCount}</p>
                <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-orange-700">High+</p>
              </div>
              <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2">
                <p className="text-lg font-bold text-sky-800">{riskHeatmap.reviewDueCount}</p>
                <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-sky-700">Review</p>
              </div>
            </div>
          </div>
          <div className={`${OPS_TABLE_SCROLL_CLASS} mt-4`}>
            <table className="min-w-[620px] w-full border-separate border-spacing-0 text-left text-sm">
              <caption className="sr-only">
                HSE risk heatmap showing active risk assessments by initial risk and residual risk.
              </caption>
              <thead>
                <tr>
                  <th
                    className="w-28 px-2 py-2 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground"
                    scope="col"
                  >
                    Initial
                  </th>
                  {OPS_HSE_RISK_LEVELS.map((level) => (
                    <th
                      className="px-2 py-2 text-center text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground"
                      key={level}
                      scope="col"
                    >
                      {formatLabel(level)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {riskHeatmap.matrix.map((row) => (
                  <tr key={row[0].initialRisk}>
                    <th
                      className="px-2 py-2 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground"
                      scope="row"
                    >
                      {formatLabel(row[0].initialRisk)}
                    </th>
                    {row.map((cell) => (
                      <td className="px-2 py-2 align-top" key={`${cell.initialRisk}-${cell.residualRisk}`}>
                        <div className={`min-h-24 rounded-md border p-3 ${riskHeatmapCellClass(cell)}`}>
                          <p className="text-2xl font-bold">{cell.count}</p>
                          <p className="mt-1 text-[11px] font-semibold opacity-75">
                            {cell.approvedCount} approved / {cell.submittedCount} submitted
                          </p>
                          {cell.reviewDueCount > 0 ? (
                            <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.08em]">
                              {cell.reviewDueCount} review due
                            </p>
                          ) : null}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <div>
            <h2 className="text-lg font-bold text-foreground">Audit escalation watch</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Planned audits, overdue schedules, open actions, and non-conformance follow-up.
            </p>
          </div>
          <div className="mt-4 grid gap-2 min-[520px]:grid-cols-2">
            {(["action_required", "overdue", "due_soon", "completed_with_ncs"] as const).map((bucket) => (
              <div className={`rounded-md border p-3 ${auditEscalationBucketClass(bucket)}`} key={bucket}>
                <p className="text-xl font-bold">{auditEscalations.counts[bucket]}</p>
                <p className="text-[10px] font-bold uppercase tracking-[0.1em]">
                  {auditEscalationBucketLabel(bucket)}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-3">
            {auditEscalations.items.length > 0 ? (
              auditEscalations.items.slice(0, 6).map(({ audit, bucket }) => (
                <article className="rounded-md border border-border p-3" key={`${bucket}-${audit.id}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary-blue">
                        {audit.audit_number}
                      </p>
                      <h3 className="mt-1 font-bold text-foreground">{audit.title}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {audit.site ? `${audit.site.code} - ${audit.site.name}` : "No site"} /{" "}
                        {formatDate(audit.scheduled_date)}
                      </p>
                    </div>
                    <StatusBadge value={auditEscalationBucketLabel(bucket)} />
                  </div>
                  {audit.action_required ? (
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">
                      {audit.action_required}
                    </p>
                  ) : null}
                </article>
              ))
            ) : (
              <OpsInlineEmpty>No audit escalations in the current register.</OpsInlineEmpty>
            )}
          </div>
        </div>
      </section>

      {(canCreatePpeItem || canCreatePpe || canCreateTalk || canCreateInspection || canCreateRisk || canCreateAudit || canCreateTraining) ? (
        <section className="grid gap-4 xl:grid-cols-3">
          {canCreatePpeItem ? (
            <details
              className="rounded-lg border border-border bg-card p-5 shadow-sm"
              id="ppe-item-create-panel"
              open={openCreate === "ppe-item"}
            >
              <summary className="cursor-pointer text-sm font-bold uppercase tracking-[0.12em] text-muted-foreground">
                PPE stock item
              </summary>
              <form action={createPpeItemAction} className="mt-4 grid gap-3">
                <label className={OPS_LABEL_CLASS}>
                  Item name
                  <input className={OPS_INPUT_CLASS} name="item_name" required />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  PPE type
                  <select className={OPS_INPUT_CLASS} defaultValue="helmet" name="ppe_type">
                    {PPE_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className={OPS_LABEL_CLASS}>
                    Opening stock
                    <input className={OPS_INPUT_CLASS} defaultValue="0" min="0" name="stock_on_hand" type="number" />
                  </label>
                  <label className={OPS_LABEL_CLASS}>
                    Reorder level
                    <input className={OPS_INPUT_CLASS} defaultValue="0" min="0" name="reorder_level" type="number" />
                  </label>
                  <label className={OPS_LABEL_CLASS}>
                    Unit
                    <input className={OPS_INPUT_CLASS} defaultValue="each" name="unit" />
                  </label>
                </div>
                <label className={OPS_LABEL_CLASS}>
                  Storage location
                  <input className={OPS_INPUT_CLASS} name="storage_location" />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Description
                  <textarea className={OPS_INPUT_CLASS} name="description" rows={2} />
                </label>
                <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
                  Create stock item
                </button>
              </form>
            </details>
          ) : null}

          {canCreatePpe ? (
            <details
              className="rounded-lg border border-border bg-card p-5 shadow-sm"
              id="ppe-create-panel"
              open={openCreate === "ppe"}
            >
              <summary className="cursor-pointer text-sm font-bold uppercase tracking-[0.12em] text-muted-foreground">
                Issue PPE
              </summary>
              <form action={createPpeIssueAction} className="mt-4 grid gap-3">
                <label className={OPS_LABEL_CLASS}>
                  Site
                  <select className={OPS_INPUT_CLASS} defaultValue="" name="site_id">
                    <option value="">No site link</option>
                    {sites.map((site) => (
                      <option key={site.id} value={site.id}>
                        {site.code} - {site.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Employee
                  <select className={OPS_INPUT_CLASS} defaultValue="" name="employee_id">
                    <option value="">No employee link</option>
                    {employees.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.employee_number} - {employee.full_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={OPS_LABEL_CLASS}>
                  PPE stock item
                  <select className={OPS_INPUT_CLASS} defaultValue="" name="ppe_item_id">
                    <option value="">Ad hoc issue</option>
                    {ppeItemOptions.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.item_code} - {item.item_name} ({item.stock_on_hand} {item.unit})
                      </option>
                    ))}
                  </select>
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Issued to
                  <input className={OPS_INPUT_CLASS} name="issued_to_name" required />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  PPE type
                  <select className={OPS_INPUT_CLASS} defaultValue="helmet" name="ppe_type">
                    {PPE_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Item description
                  <input className={OPS_INPUT_CLASS} name="item_description" />
                </label>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className={OPS_LABEL_CLASS}>
                    Quantity
                    <input className={OPS_INPUT_CLASS} defaultValue="1" min="1" name="quantity" type="number" />
                  </label>
                  <label className={OPS_LABEL_CLASS}>
                    Issue date
                    <input className={OPS_INPUT_CLASS} defaultValue={today} name="issue_date" type="date" />
                  </label>
                  <label className={OPS_LABEL_CLASS}>
                    Due return
                    <input className={OPS_INPUT_CLASS} name="due_return_date" type="date" />
                  </label>
                </div>
                <label className={OPS_LABEL_CLASS}>
                  Notes
                  <textarea className={OPS_INPUT_CLASS} name="notes" rows={2} />
                </label>
                <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
                  Issue PPE
                </button>
              </form>
            </details>
          ) : null}

          {canCreateTalk ? (
            <details
              className="rounded-lg border border-border bg-card p-5 shadow-sm"
              id="toolbox-create-panel"
              open={openCreate === "toolbox"}
            >
              <summary className="cursor-pointer text-sm font-bold uppercase tracking-[0.12em] text-muted-foreground">
                Toolbox talk
              </summary>
              <form action={createToolboxTalkAction} className="mt-4 grid gap-3">
                <label className={OPS_LABEL_CLASS}>
                  Site
                  <select className={OPS_INPUT_CLASS} defaultValue="" name="site_id" required>
                    <option value="">Select site</option>
                    {sites.map((site) => (
                      <option key={site.id} value={site.id}>
                        {site.code} - {site.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Facilitator
                  <select className={OPS_INPUT_CLASS} defaultValue="" name="facilitator_id">
                    <option value="">Unassigned</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.full_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Topic
                  <input className={OPS_INPUT_CLASS} name="topic" required />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Category
                  <input className={OPS_INPUT_CLASS} name="safety_category" />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Date
                  <input className={OPS_INPUT_CLASS} defaultValue={today} name="talk_date" type="date" />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Planned summary
                  <textarea className={OPS_INPUT_CLASS} name="summary" rows={2} />
                </label>
                <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
                  Create talk
                </button>
              </form>
            </details>
          ) : null}

          {canCreateInspection ? (
            <details
              className="rounded-lg border border-border bg-card p-5 shadow-sm"
              id="inspection-create-panel"
              open={openCreate === "inspection"}
            >
              <summary className="cursor-pointer text-sm font-bold uppercase tracking-[0.12em] text-muted-foreground">
                HSE inspection
              </summary>
              <form action={createHseInspectionAction} className="mt-4 grid gap-3">
                <label className={OPS_LABEL_CLASS}>
                  Site
                  <select className={OPS_INPUT_CLASS} defaultValue="" name="site_id" required>
                    <option value="">Select site</option>
                    {sites.map((site) => (
                      <option key={site.id} value={site.id}>
                        {site.code} - {site.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Inspector
                  <select className={OPS_INPUT_CLASS} defaultValue="" name="inspector_id">
                    <option value="">Unassigned</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.full_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Type
                  <select className={OPS_INPUT_CLASS} defaultValue="site_walk" name="inspection_type">
                    {INSPECTION_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Scheduled date
                  <input className={OPS_INPUT_CLASS} defaultValue={today} name="scheduled_date" type="date" />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Title
                  <input className={OPS_INPUT_CLASS} name="title" required />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Scope
                  <textarea className={OPS_INPUT_CLASS} name="summary" rows={2} />
                </label>
                <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
                  Create inspection
                </button>
              </form>
            </details>
          ) : null}

          {canCreateRisk ? (
            <details
              className="rounded-lg border border-border bg-card p-5 shadow-sm"
              id="risk-create-panel"
              open={openCreate === "risk"}
            >
              <summary className="cursor-pointer text-sm font-bold uppercase tracking-[0.12em] text-muted-foreground">
                Risk assessment
              </summary>
              <form action={createHseRiskAssessmentAction} className="mt-4 grid gap-3">
                <label className={OPS_LABEL_CLASS}>
                  Site
                  <select className={OPS_INPUT_CLASS} defaultValue="" name="site_id">
                    <option value="">No site link</option>
                    {sites.map((site) => (
                      <option key={site.id} value={site.id}>
                        {site.code} - {site.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Responsible user
                  <select className={OPS_INPUT_CLASS} defaultValue="" name="responsible_user_id">
                    <option value="">Unassigned</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.full_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Title
                  <input className={OPS_INPUT_CLASS} name="title" required />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Activity
                  <input className={OPS_INPUT_CLASS} name="activity" />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Area/location
                  <input className={OPS_INPUT_CLASS} name="area_location" />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Hazard category
                  <input className={OPS_INPUT_CLASS} defaultValue="general" name="hazard_category" />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className={OPS_LABEL_CLASS}>
                    Initial risk
                    <select className={OPS_INPUT_CLASS} defaultValue="medium" name="initial_risk">
                      {FINDING_SEVERITY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={OPS_LABEL_CLASS}>
                    Residual risk
                    <select className={OPS_INPUT_CLASS} defaultValue="low" name="residual_risk">
                      {FINDING_SEVERITY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className={OPS_LABEL_CLASS}>
                    Assessment date
                    <input className={OPS_INPUT_CLASS} defaultValue={today} name="assessment_date" type="date" />
                  </label>
                  <label className={OPS_LABEL_CLASS}>
                    Review date
                    <input className={OPS_INPUT_CLASS} name="review_date" type="date" />
                  </label>
                </div>
                <label className={OPS_LABEL_CLASS}>
                  Control measures
                  <textarea className={OPS_INPUT_CLASS} name="control_measures" rows={3} />
                </label>
                <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
                  Create risk assessment
                </button>
              </form>
            </details>
          ) : null}

          {canCreateAudit ? (
            <details
              className="rounded-lg border border-border bg-card p-5 shadow-sm"
              id="audit-create-panel"
              open={openCreate === "audit"}
            >
              <summary className="cursor-pointer text-sm font-bold uppercase tracking-[0.12em] text-muted-foreground">
                Compliance audit
              </summary>
              <form action={createHseComplianceAuditAction} className="mt-4 grid gap-3">
                <label className={OPS_LABEL_CLASS}>
                  Site
                  <select className={OPS_INPUT_CLASS} defaultValue="" name="site_id">
                    <option value="">No site link</option>
                    {sites.map((site) => (
                      <option key={site.id} value={site.id}>
                        {site.code} - {site.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Auditor
                  <select className={OPS_INPUT_CLASS} defaultValue="" name="auditor_id">
                    <option value="">Unassigned</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.full_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Title
                  <input className={OPS_INPUT_CLASS} name="title" required />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Audit type
                  <input className={OPS_INPUT_CLASS} defaultValue="general" name="audit_type" />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Scheduled date
                  <input className={OPS_INPUT_CLASS} defaultValue={today} name="scheduled_date" type="date" />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Scope/notes
                  <textarea className={OPS_INPUT_CLASS} name="summary" rows={3} />
                </label>
                <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
                  Create audit
                </button>
              </form>
            </details>
          ) : null}

          {canCreateTraining ? (
            <details
              className="rounded-lg border border-border bg-card p-5 shadow-sm"
              id="training-create-panel"
              open={openCreate === "training"}
            >
              <summary className="cursor-pointer text-sm font-bold uppercase tracking-[0.12em] text-muted-foreground">
                Safety training
              </summary>
              <form action={createSafetyTrainingRecordAction} className="mt-4 grid gap-3">
                <label className={OPS_LABEL_CLASS}>
                  Site
                  <select className={OPS_INPUT_CLASS} defaultValue="" name="site_id">
                    <option value="">No site link</option>
                    {sites.map((site) => (
                      <option key={site.id} value={site.id}>
                        {site.code} - {site.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Employee
                  <select className={OPS_INPUT_CLASS} defaultValue="" name="employee_id">
                    <option value="">No employee link</option>
                    {employees.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.employee_number} - {employee.full_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Trainee name
                  <input className={OPS_INPUT_CLASS} name="trainee_name" required />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Training title
                  <input className={OPS_INPUT_CLASS} name="training_title" required />
                </label>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className={OPS_LABEL_CLASS}>
                    Type
                    <input className={OPS_INPUT_CLASS} defaultValue="general" name="training_type" />
                  </label>
                  <label className={OPS_LABEL_CLASS}>
                    Planned date
                    <input className={OPS_INPUT_CLASS} defaultValue={today} name="planned_date" type="date" />
                  </label>
                  <label className={OPS_LABEL_CLASS}>
                    Expiry date
                    <input className={OPS_INPUT_CLASS} name="expiry_date" type="date" />
                  </label>
                </div>
                <label className={OPS_LABEL_CLASS}>
                  Provider
                  <input className={OPS_INPUT_CLASS} name="provider" />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Notes
                  <textarea className={OPS_INPUT_CLASS} name="notes" rows={2} />
                </label>
                <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
                  Create training record
                </button>
              </form>
            </details>
          ) : null}
        </section>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-lg border border-border bg-card shadow-sm" id="risk-assessment-panel">
          <div className="flex items-center justify-between gap-3 border-b border-border p-5">
            <div>
              <h2 className="text-lg font-bold text-foreground">Risk assessments</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Activity hazards, controls, residual risk, and review dates.
              </p>
            </div>
            <ShieldPlus className="size-5 text-primary-blue" aria-hidden="true" />
          </div>
          <div className="grid gap-3 p-5">
            {riskAssessments.length > 0 ? (
              riskAssessments.map((assessment: OpsHseRiskAssessmentSummary) => (
                <article className="rounded-lg border border-border p-4" key={assessment.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary-blue">
                        {assessment.assessment_number}
                      </p>
                      <h3 className="mt-1 text-base font-bold text-foreground">{assessment.title}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {assessment.site ? `${assessment.site.code} - ${assessment.site.name}` : "No site"} /{" "}
                        {assessment.activity || "No activity"}
                      </p>
                    </div>
                    <StatusBadge value={assessment.status} />
                  </div>
                  <div className="mt-4 grid gap-4 sm:grid-cols-4">
                    <DetailItem label="Assessed" value={formatDate(assessment.assessment_date)} />
                    <DetailItem label="Review" value={formatDate(assessment.review_date)} />
                    <DetailItem label="Area" value={assessment.area_location || "Not set"} />
                    <DetailItem label="Owner" value={assessment.responsible_user?.full_name ?? "Unassigned"} />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <StatusBadge tone={OPS_STATUS_TONES[assessment.initial_risk]} value={`initial ${assessment.initial_risk}`} />
                    <StatusBadge tone={OPS_STATUS_TONES[assessment.residual_risk]} value={`residual ${assessment.residual_risk}`} />
                    <StatusBadge value={assessment.hazard_category} />
                  </div>
                  {assessment.control_measures ? (
                    <p className="mt-4 text-sm leading-6 text-muted-foreground">
                      {assessment.control_measures}
                    </p>
                  ) : null}
                  <RiskAssessmentActions
                    actorId={auth.profile.id}
                    assessment={assessment}
                    role={auth.profile.role}
                  />
                  <div className="mt-4 rounded-md border border-border bg-muted/40 p-3">
                    <OpsRecordActivityPanel
                      canManage={canCreateRisk}
                      sourceId={assessment.id}
                      sourceTable="hse_risk_assessments"
                    />
                  </div>
                </article>
              ))
            ) : (
              <OpsEmptyState
                actions={
                  canCreateRisk
                    ? [{ href: "#risk-create-panel", label: "Create a risk assessment" }]
                    : []
                }
                description="High-risk activities are assessed before work starts, and the review date keeps the assessment from going stale while the activity is still live."
                icon={ShieldPlus}
                title="No risk assessments yet"
                tip={canCreateRisk ? undefined : "Risk assessments are raised by the HSE Officer."}
              />
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card shadow-sm" id="audit-panel">
          <div className="flex items-center justify-between gap-3 border-b border-border p-5">
            <div>
              <h2 className="text-lg font-bold text-foreground">Compliance audits</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Audit schedules, completion scores, non-conformances, and action requirements.
              </p>
            </div>
            <ClipboardList className="size-5 text-primary-blue" aria-hidden="true" />
          </div>
          <div className="grid gap-3 p-5">
            {complianceAudits.length > 0 ? (
              complianceAudits.map((audit: OpsHseComplianceAuditSummary) => (
                <article className="rounded-lg border border-border p-4" key={audit.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary-blue">
                        {audit.audit_number}
                      </p>
                      <h3 className="mt-1 text-base font-bold text-foreground">{audit.title}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {audit.site ? `${audit.site.code} - ${audit.site.name}` : "No site"} /{" "}
                        {formatLabel(audit.audit_type)}
                      </p>
                    </div>
                    <StatusBadge value={audit.status} />
                  </div>
                  <div className="mt-4 grid gap-4 sm:grid-cols-4">
                    <DetailItem label="Scheduled" value={formatDate(audit.scheduled_date)} />
                    <DetailItem label="Completed" value={formatDate(audit.completed_date)} />
                    <DetailItem label="Score" value={`${audit.score}%`} />
                    <DetailItem label="Auditor" value={audit.auditor?.full_name ?? "Unassigned"} />
                  </div>
                  <div className="mt-4 grid gap-4 sm:grid-cols-3">
                    <DetailItem label="Findings" value={String(audit.findings_count)} />
                    <DetailItem label="NCs" value={String(audit.non_conformance_count)} />
                    <DetailItem label="Next audit" value={formatDate(audit.next_audit_date)} />
                  </div>
                  {audit.summary || audit.action_required ? (
                    <p className="mt-4 text-sm leading-6 text-muted-foreground">
                      {[audit.summary, audit.action_required].filter(Boolean).join(" ")}
                    </p>
                  ) : null}
                  <ComplianceAuditActions audit={audit} role={auth.profile.role} today={today} />
                  <div className="mt-4 rounded-md border border-border bg-muted/40 p-3">
                    <OpsRecordActivityPanel
                      canManage={canCreateAudit}
                      sourceId={audit.id}
                      sourceTable="hse_compliance_audits"
                    />
                  </div>
                </article>
              ))
            ) : (
              <OpsEmptyState
                actions={
                  canCreateAudit
                    ? [{ href: "#audit-create-panel", label: "Schedule an audit" }]
                    : []
                }
                description="Site and internal audits are scheduled here, and their findings tracked through to closure rather than ending at the report."
                icon={ClipboardList}
                title="No compliance audits yet"
              />
            )}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card shadow-sm" id="ppe-stock">
        <div className="flex flex-col gap-3 border-b border-border p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground">PPE stock master</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Active PPE stock, issue availability, and reorder risk.
            </p>
          </div>
          <StatusBadge value={`${ppeItems.length} items`} />
        </div>
        <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">
          {ppeItems.length > 0 ? (
            ppeItems.map((item: OpsPpeItemSummary) => {
              const isLow = item.stock_on_hand <= item.reorder_level;
              const canAdjust = canAdjustOpsPpeItem(auth.profile.role, item);

              return (
                <article className="rounded-lg border border-border p-4" key={item.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary-blue">
                        {item.item_code}
                      </p>
                      <h3 className="mt-1 text-base font-bold text-foreground">{item.item_name}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {formatLabel(item.ppe_type)} / {item.storage_location || "No storage location"}
                      </p>
                    </div>
                    <StatusBadge
                      tone={isLow ? "attention" : "positive"}
                      value={isLow ? "low stock" : "in stock"}
                    />
                  </div>
                  <div className="mt-4 grid gap-4 sm:grid-cols-3">
                    <DetailItem label="On hand" value={`${item.stock_on_hand} ${item.unit}`} />
                    <DetailItem label="Reorder" value={`${item.reorder_level} ${item.unit}`} />
                    <DetailItem label="Active" value={item.is_active ? "Yes" : "No"} />
                  </div>
                  {item.description ? (
                    <p className="mt-4 text-sm leading-6 text-muted-foreground">{item.description}</p>
                  ) : null}
                  {canAdjust ? (
                    <details className="mt-4 rounded-md border border-border p-3">
                      <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">
                        Adjust stock
                      </summary>
                      <form action={adjustPpeItemStockAction} className="mt-3 grid gap-3">
                        <input name="ppe_item_id" type="hidden" value={item.id} />
                        <label className={OPS_LABEL_CLASS}>
                          Quantity change
                          <input className={OPS_INPUT_CLASS} name="quantity_delta" required type="number" />
                        </label>
                        <button className={OPS_SECONDARY_BUTTON_CLASS} type="submit">
                          Adjust
                        </button>
                      </form>
                    </details>
                  ) : null}
                  <div className="mt-4 rounded-md border border-border bg-muted/40 p-3">
                    <OpsRecordActivityPanel canManage={canAdjust} sourceId={item.id} sourceTable="ppe_items" />
                  </div>
                </article>
              );
            })
          ) : (
            <div className="p-8 text-center md:col-span-2 xl:col-span-3">
              <Boxes className="mx-auto size-10 text-muted-foreground" aria-hidden="true" />
              <h3 className="mt-3 text-lg font-bold text-foreground">No PPE stock items yet</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Add stock items before issuing controlled PPE from inventory.
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card shadow-sm" id="ppe-register">
        <div className="flex flex-col gap-3 border-b border-border p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground">PPE issue register</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Track PPE issue, return, damage, loss, and replacement exposure.
            </p>
          </div>
          <StatusBadge value={`${ppeIssues.pagination.total} records`} />
        </div>
        <OpsListControls
          action="/ops/hse-compliance"
          filters={[{ label: "Status", name: "status", options: PPE_STATUS_OPTIONS, value: status }]}
          placeholder="Search issue number, issued-to name, item, or notes"
          query={listState.query}
          resultLabel="PPE issues"
        />
        <div className={OPS_TABLE_SCROLL_CLASS} tabIndex={0}>
          <div className="min-w-[900px] divide-y divide-border">
            {ppeIssues.items.length > 0 ? (
              ppeIssues.items.map((issue) => (
                <article className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.8fr)]" key={issue.id}>
                  <div>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary-blue">
                          {issue.issue_number}
                        </p>
                        <h3 className="mt-1 text-lg font-bold text-foreground">{issue.issued_to_name}</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {issue.site ? `${issue.site.code} - ${issue.site.name}` : "No site"} / {formatLabel(issue.ppe_type)}
                        </p>
                      </div>
                      <StatusBadge value={issue.status} />
                    </div>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                      <DetailItem label="Issue date" value={formatDate(issue.issue_date)} />
                      <DetailItem label="Due return" value={formatDate(issue.due_return_date)} />
                      <DetailItem label="Quantity" value={String(issue.quantity)} />
                      <DetailItem label="Replacement" value={formatZmw(issue.replacement_cost)} />
                    </div>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                      <DetailItem label="Employee" value={issue.employee?.full_name ?? "No employee link"} />
                      <DetailItem
                        label="Issued by"
                        value={formatOpsUserName(
                          issue.issued_by_user?.full_name,
                          issue.issued_by_user?.id,
                        )}
                      />
                      <DetailItem label="Returned" value={formatDateTime(issue.returned_at)} />
                      <DetailItem
                        label="Item"
                        value={
                          issue.ppe_item
                            ? `${issue.ppe_item.item_code} - ${issue.ppe_item.item_name}`
                            : issue.item_description || "Not specified"
                        }
                      />
                    </div>
                    {issue.notes || issue.return_condition_notes ? (
                      <p className="mt-4 text-sm leading-6 text-muted-foreground">
                        {[issue.notes, issue.return_condition_notes].filter(Boolean).join(" ")}
                      </p>
                    ) : null}
                    <PpeActions issue={issue} role={auth.profile.role} />
                  </div>
                  <div className="rounded-md border border-border bg-muted/40 p-3">
                    <OpsRecordActivityPanel canManage={canManagePpe} sourceId={issue.id} sourceTable="ppe_issues" />
                  </div>
                </article>
              ))
            ) : (
              <div className="p-8 text-center">
                <HardHat className="mx-auto size-10 text-muted-foreground" aria-hidden="true" />
                <h3 className="mt-3 text-lg font-bold text-foreground">
                  {hasActiveListFilter ? "No matching PPE issues" : "No PPE issues yet"}
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {hasActiveListFilter
                    ? "Adjust the search or status filter to widen the PPE register."
                    : "Issue PPE when safety equipment is handed out to staff, workers, or visitors."}
                </p>
              </div>
            )}
          </div>
        </div>
        <OpsPaginationControls
          basePath="/ops/hse-compliance"
          filters={[{ label: "Status", name: "status", options: PPE_STATUS_OPTIONS, value: status }]}
          pagination={ppeIssues.pagination}
          query={listState.query}
          resultLabel="PPE issues"
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-lg border border-border bg-card shadow-sm" id="toolbox-panel">
          <div className="flex items-center justify-between gap-3 border-b border-border p-5">
            <div>
              <h2 className="text-lg font-bold text-foreground">Toolbox talks</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Planned and completed safety briefings by site.
              </p>
            </div>
            <ClipboardList className="size-5 text-primary-blue" aria-hidden="true" />
          </div>
          <div className="grid gap-3 p-5">
            {toolboxTalks.length > 0 ? (
              toolboxTalks.map((talk) => (
                <article className="rounded-lg border border-border p-4" key={talk.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary-blue">
                        {talk.talk_number}
                      </p>
                      <h3 className="mt-1 text-base font-bold text-foreground">{talk.topic}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {talk.site ? `${talk.site.code} - ${talk.site.name}` : "No site"}
                      </p>
                    </div>
                    <StatusBadge value={talk.status} />
                  </div>
                  <div className="mt-4 grid gap-4 sm:grid-cols-3">
                    <DetailItem label="Date" value={formatDate(talk.talk_date)} />
                    <DetailItem label="Attendees" value={String(talk.attendees_count)} />
                    <DetailItem label="Facilitator" value={talk.facilitator?.full_name ?? "Unassigned"} />
                  </div>
                  {talk.summary || talk.actions_required ? (
                    <p className="mt-4 text-sm leading-6 text-muted-foreground">
                      {[talk.summary, talk.actions_required].filter(Boolean).join(" ")}
                    </p>
                  ) : null}
                  {talk.attendees.length > 0 ? (
                    <div className="mt-4 rounded-md border border-border bg-muted/40 p-3">
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                        Attendance
                      </p>
                      <div className="mt-3 grid gap-2">
                        {talk.attendees.map((attendee) => (
                          <div
                            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2"
                            key={attendee.id}
                          >
                            <div>
                              <p className="text-sm font-bold text-foreground">{attendee.attendee_name}</p>
                              <p className="text-xs text-muted-foreground">
                                {attendee.role_title || attendee.employee?.job_title || "Role not set"} / {attendee.company}
                              </p>
                            </div>
                            <StatusBadge
                              tone={attendee.attended ? "positive" : "negative"}
                              value={attendee.attended ? "attended" : "absent"}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {canAddOpsToolboxTalkAttendee(auth.profile.role, talk) ? (
                    <details className="mt-4 rounded-md border border-border p-3">
                      <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">
                        Add attendee
                      </summary>
                      <form action={createToolboxTalkAttendeeAction} className="mt-3 grid gap-3">
                        <input name="talk_id" type="hidden" value={talk.id} />
                        <label className={OPS_LABEL_CLASS}>
                          Employee
                          <select className={OPS_INPUT_CLASS} defaultValue="" name="employee_id">
                            <option value="">No employee link</option>
                            {employees.map((employee) => (
                              <option key={employee.id} value={employee.id}>
                                {employee.employee_number} - {employee.full_name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className={OPS_LABEL_CLASS}>
                          Attendee name
                          <input className={OPS_INPUT_CLASS} name="attendee_name" required />
                        </label>
                        <label className={OPS_LABEL_CLASS}>
                          Role
                          <input className={OPS_INPUT_CLASS} name="role_title" />
                        </label>
                        <label className={OPS_LABEL_CLASS}>
                          Company
                          <input className={OPS_INPUT_CLASS} defaultValue="Pymble Construction Limited" name="company" />
                        </label>
                        <label className={OPS_LABEL_CLASS}>
                          Notes
                          <textarea className={OPS_INPUT_CLASS} name="notes" rows={2} />
                        </label>
                        <button className={OPS_SECONDARY_BUTTON_CLASS} type="submit">
                          Add attendee
                        </button>
                      </form>
                    </details>
                  ) : null}
                  <ToolboxTalkActions role={auth.profile.role} talk={talk} />
                  <div className="mt-4 rounded-md border border-border bg-muted/40 p-3">
                    <OpsRecordActivityPanel canManage={canManageTalk} sourceId={talk.id} sourceTable="toolbox_talks" />
                  </div>
                </article>
              ))
            ) : (
              <OpsEmptyState
                actions={
                  canCreateTalk
                    ? [{ href: "#toolbox-create-panel", label: "Plan a toolbox talk" }]
                    : []
                }
                description="Plan the briefing here, then mark it complete once attendance is confirmed — the attendance record is the evidence the talk actually happened."
                icon={ClipboardList}
                title="No toolbox talks yet"
              />
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card shadow-sm" id="inspection-panel">
          <div className="flex items-center justify-between gap-3 border-b border-border p-5">
            <div>
              <h2 className="text-lg font-bold text-foreground">HSE inspections</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Site inspections with scoring, findings, and required actions.
              </p>
            </div>
            <CalendarCheck className="size-5 text-primary-blue" aria-hidden="true" />
          </div>
          <div className="grid gap-3 p-5">
            {inspections.length > 0 ? (
              inspections.map((inspection) => (
                <article className="rounded-lg border border-border p-4" key={inspection.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary-blue">
                        {inspection.inspection_number}
                      </p>
                      <h3 className="mt-1 text-base font-bold text-foreground">{inspection.title}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {inspection.site ? `${inspection.site.code} - ${inspection.site.name}` : "No site"} /{" "}
                        {formatLabel(inspection.inspection_type)}
                      </p>
                    </div>
                    <StatusBadge value={inspection.status} />
                  </div>
                  <div className="mt-4 grid gap-4 sm:grid-cols-4">
                    <DetailItem label="Scheduled" value={formatDate(inspection.scheduled_date)} />
                    <DetailItem label="Score" value={`${inspection.score}%`} />
                    <DetailItem
                      label="Findings"
                      value={String(Math.max(inspection.findings_count, inspection.findings.length))}
                    />
                    <DetailItem label="Actions" value={String(inspection.action_count)} />
                  </div>
                  {inspection.summary || inspection.corrective_actions_required ? (
                    <p className="mt-4 text-sm leading-6 text-muted-foreground">
                      {[inspection.summary, inspection.corrective_actions_required].filter(Boolean).join(" ")}
                    </p>
                  ) : null}
                  {inspection.findings.length > 0 ? (
                    <div className="mt-4 rounded-md border border-border bg-muted/40 p-3">
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                        Findings
                      </p>
                      <div className="mt-3 grid gap-3">
                        {inspection.findings.map((finding) => (
                          <article className="rounded-md border border-border bg-card p-3" key={finding.id}>
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary-blue">
                                  {finding.finding_number}
                                </p>
                                <h4 className="mt-1 text-sm font-bold text-foreground">{finding.title}</h4>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {formatLabel(finding.finding_type)} / {formatLabel(finding.severity)}
                                </p>
                              </div>
                              <StatusBadge value={finding.status} />
                            </div>
                            <div className="mt-3 grid gap-3 sm:grid-cols-3">
                              <DetailItem label="Due" value={formatDate(finding.due_date)} />
                              <DetailItem label="Responsible" value={finding.responsible_user?.full_name ?? "Unassigned"} />
                              <DetailItem label="Verified" value={formatDateTime(finding.verified_at)} />
                            </div>
                            {finding.description || finding.completion_notes ? (
                              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                                {[finding.description, finding.completion_notes].filter(Boolean).join(" ")}
                              </p>
                            ) : null}
                            <InspectionFindingActions finding={finding} role={auth.profile.role} />
                            <div className="mt-3 rounded-md border border-border bg-muted/40 p-3">
                              <OpsRecordActivityPanel
                                canManage={canManageInspection}
                                sourceId={finding.id}
                                sourceTable="hse_inspection_findings"
                              />
                            </div>
                          </article>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {canCreateOpsHseInspectionFinding(auth.profile.role, inspection) ? (
                    <details className="mt-4 rounded-md border border-border p-3">
                      <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">
                        Add finding
                      </summary>
                      <form action={createHseInspectionFindingAction} className="mt-3 grid gap-3">
                        <input name="inspection_id" type="hidden" value={inspection.id} />
                        <label className={OPS_LABEL_CLASS}>
                          Title
                          <input className={OPS_INPUT_CLASS} name="title" required />
                        </label>
                        <div className="grid gap-3 sm:grid-cols-3">
                          <label className={OPS_LABEL_CLASS}>
                            Type
                            <input className={OPS_INPUT_CLASS} defaultValue="observation" name="finding_type" />
                          </label>
                          <label className={OPS_LABEL_CLASS}>
                            Severity
                            <select className={OPS_INPUT_CLASS} defaultValue="low" name="severity">
                              {FINDING_SEVERITY_OPTIONS.map((option) => (
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
                        </div>
                        <label className={OPS_LABEL_CLASS}>
                          Responsible user
                          <select className={OPS_INPUT_CLASS} defaultValue="" name="responsible_user_id">
                            <option value="">Unassigned</option>
                            {users.map((user) => (
                              <option key={user.id} value={user.id}>
                                {user.full_name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className={OPS_LABEL_CLASS}>
                          Description
                          <textarea className={OPS_INPUT_CLASS} name="description" rows={2} />
                        </label>
                        <button className={OPS_SECONDARY_BUTTON_CLASS} type="submit">
                          Add finding
                        </button>
                      </form>
                    </details>
                  ) : null}
                  <InspectionActions inspection={inspection} role={auth.profile.role} />
                  <div className="mt-4 rounded-md border border-border bg-muted/40 p-3">
                    <OpsRecordActivityPanel canManage={canManageInspection} sourceId={inspection.id} sourceTable="hse_inspections" />
                  </div>
                </article>
              ))
            ) : (
              <OpsEmptyState
                actions={
                  canCreateInspection
                    ? [{ href: "#inspection-create-panel", label: "Schedule an inspection" }]
                    : []
                }
                description="Scheduled site inspections are scored here, and anything that fails is flagged as action-required so it cannot quietly close."
                icon={ShieldPlus}
                title="No inspections yet"
              />
            )}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card shadow-sm" id="training-panel">
        <div className="flex items-center justify-between gap-3 border-b border-border p-5">
          <div>
            <h2 className="text-lg font-bold text-foreground">Safety training</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Planned training, completed certificates, and expiry watch.
            </p>
          </div>
          <GraduationCap className="size-5 text-primary-blue" aria-hidden="true" />
        </div>
        <div className="grid gap-3 p-5 md:grid-cols-2">
          {trainingRecords.length > 0 ? (
            trainingRecords.map((record: OpsSafetyTrainingRecordSummary) => (
              <article className="rounded-lg border border-border p-4" key={record.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary-blue">
                      {record.training_number}
                    </p>
                    <h3 className="mt-1 text-base font-bold text-foreground">{record.training_title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {record.trainee_name} / {record.site ? `${record.site.code} - ${record.site.name}` : "No site"}
                    </p>
                  </div>
                  <StatusBadge value={record.status} />
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-4">
                  <DetailItem label="Type" value={formatLabel(record.training_type)} />
                  <DetailItem label="Planned" value={formatDate(record.planned_date)} />
                  <DetailItem label="Completed" value={formatDate(record.completed_date)} />
                  <DetailItem label="Expiry" value={formatDate(record.expiry_date)} />
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                  <DetailItem label="Provider" value={record.provider || "Not set"} />
                  <DetailItem label="Score" value={`${record.score}%`} />
                  <DetailItem label="Completed by" value={record.completed_by_user?.full_name ?? "Not completed"} />
                </div>
                {record.notes ? (
                  <p className="mt-4 text-sm leading-6 text-muted-foreground">{record.notes}</p>
                ) : null}
                <SafetyTrainingActions record={record} role={auth.profile.role} today={today} />
                <div className="mt-4 rounded-md border border-border bg-muted/40 p-3">
                  <OpsRecordActivityPanel
                    canManage={canManageInspection}
                    sourceId={record.id}
                    sourceTable="safety_training_records"
                  />
                </div>
              </article>
            ))
          ) : (
            <div className="md:col-span-2">
              <OpsEmptyState
                actions={
                  canCreateTraining
                    ? [{ href: "#training-create-panel", label: "Plan a training session" }]
                    : []
                }
                description="Site inductions, HSE refreshers and certification renewals are planned and recorded here, so expiring certificates surface before they lapse."
                icon={GraduationCap}
                title="No safety training records yet"
              />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
