import {
  AlertTriangle,
  BadgeDollarSign,
  Banknote,
  Briefcase,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  FileSpreadsheet,
  Flag,
  Gavel,
  ListChecks,
  Plus,
  ReceiptText,
  Scale,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OpsConfirmSubmitButton } from "@/components/ops/OpsConfirmSubmitButton";
import { OpsKpiCard } from "@/components/ops/OpsKpiCard";
import { OpsListControls, OpsPaginationControls } from "@/components/ops/OpsListControls";
import { OpsRecordActivityPanel } from "@/components/ops/OpsRecordActivityPanel";
import { requireOpsUser } from "@/lib/ops/auth";
import {
  activateCommercialContractAction,
  achieveCommercialMilestoneAction,
  agreeCommercialClaimAction,
  approveCommercialCashflowForecastAction,
  approveCommercialRetentionReleaseAction,
  approveCommercialVariationAction,
  archiveCommercialCashflowForecastAction,
  cancelCommercialClaimAction,
  cancelCommercialCashflowForecastAction,
  cancelCommercialContractAction,
  cancelCommercialIpcAction,
  cancelCommercialMilestoneAction,
  cancelCommercialRetentionReleaseAction,
  cancelCommercialRiskAction,
  cancelCommercialValuationAction,
  cancelCommercialVariationAction,
  certifyCommercialIpcAction,
  certifyCommercialMilestoneAction,
  certifyCommercialValuationAction,
  closeCommercialClaimAction,
  closeCommercialRiskAction,
  closeCommercialVariationAction,
  completeCommercialContractAction,
  createCommercialCashflowForecastAction,
  addCommercialValuationLineAction,
  createCommercialContractAction,
  createCommercialClaimAction,
  createCommercialIpcAction,
  createCommercialMilestoneAction,
  createCommercialRetentionReleaseAction,
  createCommercialRiskAction,
  createCommercialValuationAction,
  createCommercialVariationAction,
  delayCommercialMilestoneAction,
  deleteCommercialValuationLineAction,
  createInvoiceFromCommercialIpcAction,
  lockCommercialCashflowForecastAction,
  markCommercialIpcInvoicedAction,
  markCommercialIpcPaidAction,
  markCommercialMilestoneDueAction,
  mitigateCommercialRiskAction,
  priceCommercialVariationAction,
  rejectCommercialClaimAction,
  rejectCommercialIpcAction,
  rejectCommercialRetentionReleaseAction,
  rejectCommercialValuationAction,
  rejectCommercialVariationAction,
  releaseCommercialRetentionReleaseAction,
  reviewCommercialClaimAction,
  submitCommercialClaimAction,
  submitCommercialIpcAction,
  submitCommercialRetentionReleaseAction,
  submitCommercialValuationAction,
  submitCommercialVariationAction,
  updateCommercialValuationLineAction,
} from "@/lib/ops/commercial-actions";
import {
  canAchieveOpsCommercialMilestone,
  canApproveOpsCommercialCashflowForecast,
  canApproveOpsCommercialRetentionRelease,
  canAgreeOpsCommercialClaim,
  canActivateOpsCommercialContract,
  canArchiveOpsCommercialCashflowForecast,
  canApproveOpsCommercialVariation,
  canCancelOpsCommercialClaim,
  canCancelOpsCommercialCashflowForecast,
  canCancelOpsCommercialContract,
  canCancelOpsCommercialIpc,
  canCancelOpsCommercialMilestone,
  canCancelOpsCommercialRetentionRelease,
  canCancelOpsCommercialRisk,
  canCancelOpsCommercialValuation,
  canCancelOpsCommercialVariation,
  canCertifyOpsCommercialIpc,
  canCertifyOpsCommercialMilestone,
  canCertifyOpsCommercialValuation,
  canCloseOpsCommercialClaim,
  canCloseOpsCommercialRisk,
  canCloseOpsCommercialVariation,
  canCompleteOpsCommercialContract,
  canCreateOpsCommercialInvoiceFromIpc,
  canCreateOpsCommercialRecord,
  canDelayOpsCommercialMilestone,
  canEditOpsCommercialValuationLines,
  canLockOpsCommercialCashflowForecast,
  canMarkOpsCommercialIpcInvoiced,
  canMarkOpsCommercialIpcPaid,
  canMarkOpsCommercialMilestoneDue,
  canMoveOpsCommercialRiskToMitigation,
  canPriceOpsCommercialVariation,
  canRejectOpsCommercialClaim,
  canRejectOpsCommercialIpc,
  canRejectOpsCommercialRetentionRelease,
  canRejectOpsCommercialValuation,
  canRejectOpsCommercialVariation,
  canReleaseOpsCommercialRetentionRelease,
  canReviewOpsCommercialClaim,
  canSubmitOpsCommercialClaim,
  canSubmitOpsCommercialIpc,
  canSubmitOpsCommercialRetentionRelease,
  canSubmitOpsCommercialValuation,
  canSubmitOpsCommercialVariation,
} from "@/lib/ops/commercial-permissions";
import {
  fetchCommercialBoqOptions,
  fetchCommercialContractOptions,
  fetchCommercialValuationOptions,
  fetchCommercialVariationOptions,
  fetchOpsCommercialForecastReport,
  fetchOpsCommercialMarginReport,
  fetchOpsCommercialStats,
  fetchPaginatedOpsCommercialIpcs,
  fetchRecentCommercialCashflowForecasts,
  fetchRecentCommercialClaims,
  fetchRecentCommercialContracts,
  fetchRecentCommercialMilestones,
  fetchRecentCommercialRetentionReleases,
  fetchRecentCommercialRisks,
  fetchRecentCommercialValuations,
  fetchRecentCommercialVariations,
  type OpsCommercialCashflowForecastSummary,
  type OpsCommercialClaimSummary,
  type OpsCommercialContractSummary,
  type OpsCommercialIpcSummary,
  type OpsCommercialMilestoneSummary,
  type OpsCommercialRetentionReleaseSummary,
  type OpsCommercialRiskSummary,
  type OpsCommercialValuationSummary,
  type OpsCommercialVariationSummary,
} from "@/lib/ops/commercial";
import type {
  OpsCommercialForecastReport,
  OpsCommercialMarginReport,
  OpsCommercialMarginTone,
} from "@/lib/ops/commercial-reporting";
import { parseOpsListState } from "@/lib/ops/listing";
import { canAccessOpsHref } from "@/lib/ops/permissions";
import { fetchActiveSiteOptions } from "@/lib/ops/sites";
import type {
  OpsCommercialClaimStatus,
  OpsCommercialClaimType,
  OpsCommercialCashflowStatus,
  OpsCommercialContractStatus,
  OpsCommercialContractType,
  OpsCommercialForecastConfidence,
  OpsCommercialIpcStatus,
  OpsCommercialMilestoneStatus,
  OpsCommercialRetentionReleaseStatus,
  OpsCommercialRetentionReleaseType,
  OpsCommercialRiskCategory,
  OpsCommercialRiskSeverity,
  OpsCommercialRiskStatus,
  OpsCommercialValuationStatus,
  OpsCommercialVariationStatus,
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
} from "@/lib/ops/ui";

type PageProps = {
  searchParams?: Promise<OpsSearchParams>;
};

const IPC_STATUS_OPTIONS: Array<{ label: string; value: OpsCommercialIpcStatus | "" }> = [
  { label: "All statuses", value: "" },
  { label: "Draft", value: "draft" },
  { label: "Submitted", value: "submitted" },
  { label: "Certified", value: "certified" },
  { label: "Invoiced", value: "invoiced" },
  { label: "Paid", value: "paid" },
  { label: "Rejected", value: "rejected" },
  { label: "Cancelled", value: "cancelled" },
];

const CLAIM_TYPE_OPTIONS: Array<{ label: string; value: OpsCommercialClaimType }> = [
  { label: "Extension of time", value: "extension_of_time" },
  { label: "Loss and expense", value: "loss_expense" },
  { label: "Acceleration", value: "acceleration" },
  { label: "Disruption", value: "disruption" },
  { label: "Prolongation", value: "prolongation" },
  { label: "Variation dispute", value: "variation_dispute" },
  { label: "Other", value: "other" },
];

const CONTRACT_TYPE_OPTIONS: Array<{ label: string; value: OpsCommercialContractType }> = [
  { label: "Main contract", value: "main_contract" },
  { label: "Subcontract", value: "subcontract" },
  { label: "Professional service", value: "professional_service" },
  { label: "Supply", value: "supply" },
  { label: "Other", value: "other" },
];

const RISK_CATEGORY_OPTIONS: Array<{ label: string; value: OpsCommercialRiskCategory }> = [
  { label: "Client", value: "client" },
  { label: "Contract", value: "contract" },
  { label: "Scope", value: "scope" },
  { label: "Cost", value: "cost" },
  { label: "Programme", value: "programme" },
  { label: "Payment", value: "payment" },
  { label: "Dispute", value: "dispute" },
  { label: "Other", value: "other" },
];

const RISK_SEVERITY_OPTIONS: Array<{ label: string; value: OpsCommercialRiskSeverity }> = [
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
  { label: "Critical", value: "critical" },
];

const RETENTION_RELEASE_TYPE_OPTIONS: Array<{
  label: string;
  value: OpsCommercialRetentionReleaseType;
}> = [
  { label: "Interim", value: "interim" },
  { label: "Practical completion", value: "practical_completion" },
  { label: "Defects liability", value: "defects_liability" },
  { label: "Final account", value: "final_account" },
  { label: "Other", value: "other" },
];

const CASHFLOW_CONFIDENCE_OPTIONS: Array<{
  label: string;
  value: OpsCommercialForecastConfidence;
}> = [
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
];

function statusFromParam(value: string | undefined) {
  return IPC_STATUS_OPTIONS.some((status) => status.value === value)
    ? (value as OpsCommercialIpcStatus | "")
    : "";
}

function commercialNotice(params: OpsSearchParams) {
  const created = noticeFromParams(params, "ipc", "IPC record created.");

  if (created) {
    return created;
  }

  const createdValue = firstParam(params.created);
  const updatedValue = firstParam(params.updated);
  const messages: Record<string, string> = {
    claim: "Commercial claim created.",
    claim_agreed: "Commercial claim agreed.",
    claim_cancelled: "Commercial claim cancelled.",
    claim_closed: "Commercial claim closed.",
    claim_rejected: "Commercial claim rejected.",
    claim_review: "Commercial claim moved to review.",
    claim_submitted: "Commercial claim submitted.",
    contract: "Commercial contract created.",
    contract_active: "Commercial contract activated.",
    contract_cancelled: "Commercial contract cancelled.",
    contract_completed: "Commercial contract completed.",
    attachment: "Commercial attachment uploaded.",
    cashflow_approved: "Cashflow forecast approved.",
    cashflow_archived: "Cashflow forecast archived.",
    cashflow_cancelled: "Cashflow forecast cancelled.",
    cashflow_forecast: "Cashflow forecast created.",
    cashflow_locked: "Cashflow forecast locked.",
    comment: "Commercial comment added.",
    ipc_cancelled: "IPC cancelled.",
    ipc_certified: "IPC certified.",
    ipc_invoice_created: "Invoice created from certified IPC.",
    ipc_invoiced: "IPC marked as invoiced.",
    ipc_paid: "IPC marked as paid.",
    ipc_rejected: "IPC rejected.",
    ipc_submitted: "IPC submitted.",
    milestone: "Contract milestone created.",
    milestone_achieved: "Contract milestone achieved.",
    milestone_cancelled: "Contract milestone cancelled.",
    milestone_certified: "Contract milestone certified.",
    milestone_delayed: "Contract milestone delayed.",
    milestone_due: "Contract milestone marked due.",
    retention_approved: "Retention release approved.",
    retention_cancelled: "Retention release cancelled.",
    retention_rejected: "Retention release rejected.",
    retention_release: "Retention release created.",
    retention_released: "Retention released.",
    retention_submitted: "Retention release submitted.",
    risk: "Commercial risk created.",
    risk_cancelled: "Commercial risk cancelled.",
    risk_closed: "Commercial risk closed.",
    risk_mitigating: "Commercial risk moved to mitigation.",
    valuation: "Valuation created.",
    valuation_cancelled: "Valuation cancelled.",
    valuation_certified: "Valuation certified.",
    valuation_line_added: "Valuation line added.",
    valuation_line_deleted: "Valuation line deleted.",
    valuation_line_updated: "Valuation line updated.",
    valuation_rejected: "Valuation rejected.",
    valuation_submitted: "Valuation submitted.",
    variation: "Variation created.",
    variation_approved: "Variation approved.",
    variation_cancelled: "Variation cancelled.",
    variation_closed: "Variation closed.",
    variation_priced: "Variation priced.",
    variation_rejected: "Variation rejected.",
    variation_submitted: "Variation submitted.",
  };
  const key = createdValue ?? updatedValue ?? "";

  return key && messages[key]
    ? {
        message: messages[key],
        tone: "success" as const,
      }
    : null;
}

function todayInLusaka() {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Africa/Lusaka",
    year: "numeric",
  }).format(new Date());
}

function formatDate(value: string | null) {
  if (!value) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-ZM", {
    dateStyle: "medium",
    timeZone: "Africa/Lusaka",
  }).format(new Date(`${value.slice(0, 10)}T00:00:00+02:00`));
}

function formatLabel(value: string) {
  return value.replace(/_/g, " ");
}

function ipcStatusClass(status: OpsCommercialIpcStatus) {
  if (status === "paid" || status === "certified" || status === "invoiced") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "cancelled" || status === "rejected") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (status === "submitted") {
    return "border-orange-200 bg-orange-50 text-orange-700";
  }

  return "border-sky-200 bg-sky-50 text-sky-700";
}

function variationStatusClass(status: OpsCommercialVariationStatus) {
  if (status === "approved" || status === "closed") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "cancelled" || status === "rejected") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (status === "submitted" || status === "priced") {
    return "border-orange-200 bg-orange-50 text-orange-700";
  }

  return "border-sky-200 bg-sky-50 text-sky-700";
}

function claimStatusClass(status: OpsCommercialClaimStatus) {
  if (status === "agreed" || status === "closed") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "cancelled" || status === "rejected") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (status === "submitted" || status === "under_review") {
    return "border-orange-200 bg-orange-50 text-orange-700";
  }

  return "border-sky-200 bg-sky-50 text-sky-700";
}

function contractStatusClass(status: OpsCommercialContractStatus) {
  if (status === "active" || status === "completed") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "cancelled" || status === "terminated") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (status === "on_hold") {
    return "border-orange-200 bg-orange-50 text-orange-700";
  }

  return "border-sky-200 bg-sky-50 text-sky-700";
}

function valuationStatusClass(status: OpsCommercialValuationStatus) {
  if (status === "certified") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "cancelled" || status === "rejected") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (status === "submitted") {
    return "border-orange-200 bg-orange-50 text-orange-700";
  }

  return "border-sky-200 bg-sky-50 text-sky-700";
}

function riskStatusClass(status: OpsCommercialRiskStatus, severity?: OpsCommercialRiskSeverity) {
  if (status === "closed") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "cancelled") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (severity === "critical" || severity === "high") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (status === "mitigating") {
    return "border-orange-200 bg-orange-50 text-orange-700";
  }

  return "border-sky-200 bg-sky-50 text-sky-700";
}

function retentionStatusClass(status: OpsCommercialRetentionReleaseStatus) {
  if (status === "released" || status === "approved") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "cancelled" || status === "rejected") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (status === "submitted") {
    return "border-orange-200 bg-orange-50 text-orange-700";
  }

  return "border-sky-200 bg-sky-50 text-sky-700";
}

function cashflowStatusClass(status: OpsCommercialCashflowStatus) {
  if (status === "approved" || status === "locked") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "cancelled") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (status === "archived") {
    return "border-primary-dark/10 bg-primary-dark/[0.03] text-primary-dark/58";
  }

  return "border-sky-200 bg-sky-50 text-sky-700";
}

function milestoneStatusClass(status: OpsCommercialMilestoneStatus) {
  if (status === "certified" || status === "achieved") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "cancelled" || status === "delayed") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (status === "due") {
    return "border-orange-200 bg-orange-50 text-orange-700";
  }

  return "border-sky-200 bg-sky-50 text-sky-700";
}

function StatusBadge({ className, value }: { className: string; value: string }) {
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] ${className}`}>
      {formatLabel(value)}
    </span>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-primary-dark/40">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-primary-dark">{value}</p>
    </div>
  );
}

function formatPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "No revenue";
  }

  return `${value.toFixed(1)}%`;
}

function marginToneClass(tone: OpsCommercialMarginTone) {
  if (tone === "danger") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (tone === "warn") {
    return "border-orange-200 bg-orange-50 text-orange-700";
  }

  if (tone === "good") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  return "border-primary-dark/10 bg-primary-dark/[0.03] text-primary-dark/58";
}

function marginToneLabel(tone: OpsCommercialMarginTone) {
  if (tone === "danger") {
    return "Margin risk";
  }

  if (tone === "warn") {
    return "Watch";
  }

  if (tone === "good") {
    return "Healthy";
  }

  return "No signal";
}

function CommercialMarginPanel({ report }: { report: OpsCommercialMarginReport }) {
  const snapshots = report.snapshots.slice(0, 6);

  return (
    <section className="rounded-lg border border-primary-dark/10 bg-white shadow-sm" id="margin-watch">
      <div className="flex flex-col gap-3 border-b border-primary-dark/10 p-5 min-[760px]:flex-row min-[760px]:items-center min-[760px]:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary-blue">
            Commercial margin
          </p>
          <h2 className="mt-1 text-lg font-bold text-primary-dark">Project margin watch</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-primary-dark/56">
            Forecast revenue is built from active contracts, approved variations, and agreed claims;
            cost exposure comes from committed and posted project cost entries.
          </p>
        </div>
        <StatusBadge
          className={report.totals.watchCount > 0 ? "border-orange-200 bg-orange-50 text-orange-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}
          value={`${report.totals.watchCount} watches`}
        />
      </div>
      <div className="p-5">
        <div className="grid gap-4 min-[520px]:grid-cols-2 xl:grid-cols-4">
          <DetailItem label="Forecast revenue" value={formatZmw(report.totals.forecastRevenue)} />
          <DetailItem label="Cost exposure" value={formatZmw(report.totals.totalCostExposure)} />
          <DetailItem
            label="Forecast margin"
            value={`${formatZmw(report.totals.forecastMargin)} (${formatPercent(report.totals.forecastMarginPercent)})`}
          />
          <DetailItem
            label="Realized margin"
            value={`${formatZmw(report.totals.realizedMargin)} (${formatPercent(report.totals.realizedMarginPercent)})`}
          />
        </div>
        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          {snapshots.length > 0 ? (
            snapshots.map((snapshot) => (
              <article className="rounded-lg border border-primary-dark/10 p-4" key={snapshot.siteId}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold uppercase tracking-[0.12em] text-primary-blue">
                      {snapshot.site?.code ?? "Unmapped site"}
                    </p>
                    <h3 className="mt-1 truncate text-sm font-bold text-primary-dark">
                      {snapshot.site?.name ?? snapshot.siteId}
                    </h3>
                  </div>
                  <StatusBadge className={marginToneClass(snapshot.tone)} value={marginToneLabel(snapshot.tone)} />
                </div>
                <div className="mt-4 grid gap-4 min-[520px]:grid-cols-2">
                  <DetailItem label="Forecast margin" value={formatPercent(snapshot.forecastMarginPercent)} />
                  <DetailItem label="Forecast revenue" value={formatZmw(snapshot.forecastRevenue)} />
                  <DetailItem label="Cost exposure" value={formatZmw(snapshot.totalCostExposure)} />
                  <DetailItem label="Certified revenue" value={formatZmw(snapshot.certifiedRevenue)} />
                </div>
              </article>
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-primary-dark/15 p-5 text-sm font-semibold text-primary-dark/56 lg:col-span-3">
              Create an active contract and post or commit project costs to start margin tracking.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function CommercialForecastPanel({ report }: { report: OpsCommercialForecastReport }) {
  const cashflowTone =
    report.totals.cashflowDangerCount > 0 ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700";

  return (
    <section className="rounded-lg border border-primary-dark/10 bg-white shadow-sm" id="forecast-watch">
      <div className="flex flex-col gap-3 border-b border-primary-dark/10 p-5 min-[760px]:flex-row min-[760px]:items-center min-[760px]:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary-blue">
            Forecast controls
          </p>
          <h2 className="mt-1 text-lg font-bold text-primary-dark">Retention, cashflow, and milestone watch</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-primary-dark/56">
            These figures show near-term commercial cash pressure from retention due, forecast cash
            movement, and contract milestone delivery.
          </p>
        </div>
        <StatusBadge
          className={cashflowTone}
          value={`${report.totals.cashflowDangerCount} negative forecasts`}
        />
      </div>
      <div className="grid gap-4 p-5 min-[520px]:grid-cols-2 xl:grid-cols-4">
        <DetailItem label="Pending retention" value={formatZmw(report.totals.pendingRetentionAmount)} />
        <DetailItem label="Released retention" value={formatZmw(report.totals.releasedRetentionAmount)} />
        <DetailItem label="Forecast net cash" value={formatZmw(report.totals.approvedCashflowNet)} />
        <DetailItem label="Milestone overdue" value={String(report.totals.milestoneOverdueCount)} />
        <DetailItem label="Forecast revenue" value={formatZmw(report.totals.forecastRevenue)} />
        <DetailItem label="Forecast cost" value={formatZmw(report.totals.forecastCost)} />
        <DetailItem label="Retention due" value={String(report.totals.retentionDueCount)} />
        <DetailItem label="Milestone value" value={formatZmw(report.totals.milestoneForecastAmount)} />
      </div>
    </section>
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

function IpcActions({
  actorId,
  ipc,
  role,
}: {
  actorId: string;
  ipc: OpsCommercialIpcSummary;
  role: OpsUserRole;
}) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {canSubmitOpsCommercialIpc(actorId, role, ipc) ? (
        <InlineActionForm
          action={submitCommercialIpcAction}
          buttonClass={OPS_SECONDARY_BUTTON_CLASS}
          confirmText="Submit?"
          hidden={{ ipc_id: ipc.id }}
        >
          Submit
        </InlineActionForm>
      ) : null}
      {canCertifyOpsCommercialIpc(role, ipc) ? (
        <details className="w-full rounded-md border border-primary-dark/10 p-3">
          <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.1em] text-primary-dark/60">
            Certify IPC
          </summary>
          <form action={certifyCommercialIpcAction} className="mt-3 grid gap-3 sm:grid-cols-3">
            <input name="ipc_id" type="hidden" value={ipc.id} />
            <label className={OPS_LABEL_CLASS}>
              Certified amount
              <input className={OPS_INPUT_CLASS} min="0" name="certified_amount" step="0.01" type="number" />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Retention
              <input className={OPS_INPUT_CLASS} min="0" name="retention_amount" step="0.01" type="number" />
            </label>
            <label className={OPS_LABEL_CLASS}>
              VAT
              <input className={OPS_INPUT_CLASS} min="0" name="vat_amount" step="0.01" type="number" />
            </label>
            <label className={`${OPS_LABEL_CLASS} sm:col-span-3`}>
              Notes
              <textarea className={OPS_INPUT_CLASS} name="notes" rows={2} />
            </label>
            <button className={`${OPS_PRIMARY_BUTTON_CLASS} sm:col-span-3`} type="submit">
              Certify
            </button>
          </form>
        </details>
      ) : null}
      {canMarkOpsCommercialIpcInvoiced(role, ipc) ? (
        <InlineActionForm
          action={markCommercialIpcInvoicedAction}
          buttonClass={OPS_SECONDARY_BUTTON_CLASS}
          confirmText="Mark invoiced?"
          hidden={{ ipc_id: ipc.id }}
        >
          Mark invoiced
        </InlineActionForm>
      ) : null}
      {canCreateOpsCommercialInvoiceFromIpc(role, ipc) ? (
        <details className="w-full rounded-md border border-primary-dark/10 p-3">
          <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.1em] text-primary-dark/60">
            Create invoice from IPC
          </summary>
          <form action={createInvoiceFromCommercialIpcAction} className="mt-3 grid gap-3">
            <input name="ipc_id" type="hidden" value={ipc.id} />
            <label className={OPS_LABEL_CLASS}>
              Client name
              <input
                className={OPS_INPUT_CLASS}
                defaultValue={ipc.contract?.client_name ?? ipc.client_reference}
                name="client_name"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={OPS_LABEL_CLASS}>
                Invoice number
                <input className={OPS_INPUT_CLASS} name="invoice_number" placeholder="Auto if blank" />
              </label>
              <label className={OPS_LABEL_CLASS}>
                Client TPIN
                <input className={OPS_INPUT_CLASS} name="tpin" />
              </label>
            </div>
            <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
              Create invoice
            </button>
          </form>
        </details>
      ) : null}
      {canMarkOpsCommercialIpcPaid(role, ipc) ? (
        <InlineActionForm
          action={markCommercialIpcPaidAction}
          buttonClass={OPS_SECONDARY_BUTTON_CLASS}
          confirmText="Mark paid?"
          hidden={{ ipc_id: ipc.id }}
        >
          Mark paid
        </InlineActionForm>
      ) : null}
      {canRejectOpsCommercialIpc(role, ipc) ? (
        <details className="w-full rounded-md border border-red-100 p-3">
          <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.1em] text-red-700">
            Reject IPC
          </summary>
          <form action={rejectCommercialIpcAction} className="mt-3 grid gap-3">
            <input name="ipc_id" type="hidden" value={ipc.id} />
            <label className={OPS_LABEL_CLASS}>
              Rejection reason
              <textarea className={OPS_INPUT_CLASS} name="rejection_reason" required rows={2} />
            </label>
            <button className={OPS_DANGER_BUTTON_CLASS} type="submit">
              Reject
            </button>
          </form>
        </details>
      ) : null}
      {canCancelOpsCommercialIpc(actorId, role, ipc) ? (
        <InlineActionForm
          action={cancelCommercialIpcAction}
          buttonClass={OPS_DANGER_BUTTON_CLASS}
          confirmText="Cancel?"
          hidden={{ ipc_id: ipc.id }}
        >
          Cancel
        </InlineActionForm>
      ) : null}
    </div>
  );
}

function VariationActions({
  actorId,
  role,
  variation,
}: {
  actorId: string;
  role: OpsUserRole;
  variation: OpsCommercialVariationSummary;
}) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {canSubmitOpsCommercialVariation(actorId, role, variation) ? (
        <InlineActionForm
          action={submitCommercialVariationAction}
          buttonClass={OPS_SECONDARY_BUTTON_CLASS}
          confirmText="Submit?"
          hidden={{ variation_id: variation.id }}
        >
          Submit
        </InlineActionForm>
      ) : null}
      {canPriceOpsCommercialVariation(role, variation) ? (
        <details className="w-full rounded-md border border-primary-dark/10 p-3">
          <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.1em] text-primary-dark/60">
            Price variation
          </summary>
          <form action={priceCommercialVariationAction} className="mt-3 grid gap-3">
            <input name="variation_id" type="hidden" value={variation.id} />
            <label className={OPS_LABEL_CLASS}>
              Submitted amount
              <input className={OPS_INPUT_CLASS} min="0" name="submitted_amount" step="0.01" type="number" />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Notes
              <textarea className={OPS_INPUT_CLASS} name="notes" rows={2} />
            </label>
            <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
              Price
            </button>
          </form>
        </details>
      ) : null}
      {canApproveOpsCommercialVariation(role, variation) ? (
        <details className="w-full rounded-md border border-primary-dark/10 p-3">
          <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.1em] text-primary-dark/60">
            Approve variation
          </summary>
          <form action={approveCommercialVariationAction} className="mt-3 grid gap-3">
            <input name="variation_id" type="hidden" value={variation.id} />
            <label className={OPS_LABEL_CLASS}>
              Approved amount
              <input className={OPS_INPUT_CLASS} min="0" name="approved_amount" step="0.01" type="number" />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Notes
              <textarea className={OPS_INPUT_CLASS} name="notes" rows={2} />
            </label>
            <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
              Approve
            </button>
          </form>
        </details>
      ) : null}
      {canCloseOpsCommercialVariation(role, variation) ? (
        <InlineActionForm
          action={closeCommercialVariationAction}
          buttonClass={OPS_SECONDARY_BUTTON_CLASS}
          confirmText="Close?"
          hidden={{ variation_id: variation.id }}
        >
          Close
        </InlineActionForm>
      ) : null}
      {canRejectOpsCommercialVariation(role, variation) ? (
        <details className="w-full rounded-md border border-red-100 p-3">
          <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.1em] text-red-700">
            Reject variation
          </summary>
          <form action={rejectCommercialVariationAction} className="mt-3 grid gap-3">
            <input name="variation_id" type="hidden" value={variation.id} />
            <label className={OPS_LABEL_CLASS}>
              Rejection reason
              <textarea className={OPS_INPUT_CLASS} name="rejection_reason" required rows={2} />
            </label>
            <button className={OPS_DANGER_BUTTON_CLASS} type="submit">
              Reject
            </button>
          </form>
        </details>
      ) : null}
      {canCancelOpsCommercialVariation(actorId, role, variation) ? (
        <InlineActionForm
          action={cancelCommercialVariationAction}
          buttonClass={OPS_DANGER_BUTTON_CLASS}
          confirmText="Cancel?"
          hidden={{ variation_id: variation.id }}
        >
          Cancel
        </InlineActionForm>
      ) : null}
    </div>
  );
}

function ClaimActions({
  actorId,
  claim,
  role,
}: {
  actorId: string;
  claim: OpsCommercialClaimSummary;
  role: OpsUserRole;
}) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {canSubmitOpsCommercialClaim(actorId, role, claim) ? (
        <InlineActionForm
          action={submitCommercialClaimAction}
          buttonClass={OPS_SECONDARY_BUTTON_CLASS}
          confirmText="Submit?"
          hidden={{ claim_id: claim.id }}
        >
          Submit
        </InlineActionForm>
      ) : null}
      {canReviewOpsCommercialClaim(role, claim) ? (
        <InlineActionForm
          action={reviewCommercialClaimAction}
          buttonClass={OPS_SECONDARY_BUTTON_CLASS}
          confirmText="Review?"
          hidden={{ claim_id: claim.id }}
        >
          Review
        </InlineActionForm>
      ) : null}
      {canAgreeOpsCommercialClaim(role, claim) ? (
        <details className="w-full rounded-md border border-primary-dark/10 p-3">
          <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.1em] text-primary-dark/60">
            Agree claim
          </summary>
          <form action={agreeCommercialClaimAction} className="mt-3 grid gap-3">
            <input name="claim_id" type="hidden" value={claim.id} />
            <label className={OPS_LABEL_CLASS}>
              Agreed amount
              <input className={OPS_INPUT_CLASS} min="0" name="agreed_amount" step="0.01" type="number" />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Notes
              <textarea className={OPS_INPUT_CLASS} name="notes" rows={2} />
            </label>
            <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
              Agree
            </button>
          </form>
        </details>
      ) : null}
      {canCloseOpsCommercialClaim(role, claim) ? (
        <InlineActionForm
          action={closeCommercialClaimAction}
          buttonClass={OPS_SECONDARY_BUTTON_CLASS}
          confirmText="Close?"
          hidden={{ claim_id: claim.id }}
        >
          Close
        </InlineActionForm>
      ) : null}
      {canRejectOpsCommercialClaim(role, claim) ? (
        <details className="w-full rounded-md border border-red-100 p-3">
          <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.1em] text-red-700">
            Reject claim
          </summary>
          <form action={rejectCommercialClaimAction} className="mt-3 grid gap-3">
            <input name="claim_id" type="hidden" value={claim.id} />
            <label className={OPS_LABEL_CLASS}>
              Rejection reason
              <textarea className={OPS_INPUT_CLASS} name="rejection_reason" required rows={2} />
            </label>
            <button className={OPS_DANGER_BUTTON_CLASS} type="submit">
              Reject
            </button>
          </form>
        </details>
      ) : null}
      {canCancelOpsCommercialClaim(actorId, role, claim) ? (
        <InlineActionForm
          action={cancelCommercialClaimAction}
          buttonClass={OPS_DANGER_BUTTON_CLASS}
          confirmText="Cancel?"
          hidden={{ claim_id: claim.id }}
        >
          Cancel
        </InlineActionForm>
      ) : null}
    </div>
  );
}

function ContractActions({
  actorId,
  contract,
  role,
}: {
  actorId: string;
  contract: OpsCommercialContractSummary;
  role: OpsUserRole;
}) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {canActivateOpsCommercialContract(role, contract) ? (
        <InlineActionForm
          action={activateCommercialContractAction}
          buttonClass={OPS_SECONDARY_BUTTON_CLASS}
          confirmText="Activate contract?"
          hidden={{ contract_id: contract.id }}
        >
          Activate
        </InlineActionForm>
      ) : null}
      {canCompleteOpsCommercialContract(role, contract) ? (
        <InlineActionForm
          action={completeCommercialContractAction}
          buttonClass={OPS_SECONDARY_BUTTON_CLASS}
          confirmText="Complete contract?"
          hidden={{ contract_id: contract.id }}
        >
          Complete
        </InlineActionForm>
      ) : null}
      {canCancelOpsCommercialContract(actorId, role, contract) ? (
        <InlineActionForm
          action={cancelCommercialContractAction}
          buttonClass={OPS_DANGER_BUTTON_CLASS}
          confirmText="Cancel contract?"
          hidden={{ contract_id: contract.id }}
        >
          Cancel
        </InlineActionForm>
      ) : null}
    </div>
  );
}

function ValuationActions({
  actorId,
  role,
  valuation,
}: {
  actorId: string;
  role: OpsUserRole;
  valuation: OpsCommercialValuationSummary;
}) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {canSubmitOpsCommercialValuation(actorId, role, valuation) ? (
        <InlineActionForm
          action={submitCommercialValuationAction}
          buttonClass={OPS_SECONDARY_BUTTON_CLASS}
          confirmText="Submit valuation?"
          hidden={{ valuation_id: valuation.id }}
        >
          Submit
        </InlineActionForm>
      ) : null}
      {canCertifyOpsCommercialValuation(role, valuation) ? (
        <InlineActionForm
          action={certifyCommercialValuationAction}
          buttonClass={OPS_SECONDARY_BUTTON_CLASS}
          confirmText="Certify valuation?"
          hidden={{ valuation_id: valuation.id }}
        >
          Certify
        </InlineActionForm>
      ) : null}
      {canRejectOpsCommercialValuation(role, valuation) ? (
        <details className="w-full rounded-md border border-red-100 p-3">
          <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.1em] text-red-700">
            Reject valuation
          </summary>
          <form action={rejectCommercialValuationAction} className="mt-3 grid gap-3">
            <input name="valuation_id" type="hidden" value={valuation.id} />
            <label className={OPS_LABEL_CLASS}>
              Rejection reason
              <textarea className={OPS_INPUT_CLASS} name="rejection_reason" required rows={2} />
            </label>
            <button className={OPS_DANGER_BUTTON_CLASS} type="submit">
              Reject
            </button>
          </form>
        </details>
      ) : null}
      {canCancelOpsCommercialValuation(actorId, role, valuation) ? (
        <InlineActionForm
          action={cancelCommercialValuationAction}
          buttonClass={OPS_DANGER_BUTTON_CLASS}
          confirmText="Cancel valuation?"
          hidden={{ valuation_id: valuation.id }}
        >
          Cancel
        </InlineActionForm>
      ) : null}
    </div>
  );
}

function ValuationLineEditor({
  actorId,
  role,
  valuation,
}: {
  actorId: string;
  role: OpsUserRole;
  valuation: OpsCommercialValuationSummary;
}) {
  const canEditLines = canEditOpsCommercialValuationLines(actorId, role, valuation);

  return (
    <div className="mt-4 rounded-md border border-primary-dark/10 bg-primary-dark/[0.015] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary-dark/52">
          Measurement lines
        </p>
        <StatusBadge
          className="border-primary-dark/10 bg-white text-primary-dark/58"
          value={`${valuation.lines.length} lines`}
        />
      </div>
      <div className="mt-3 grid gap-3">
        {valuation.lines.length > 0 ? (
          valuation.lines.map((line, index) => (
            <details
              className="rounded-md border border-primary-dark/10 bg-white p-3"
              key={line.id}
              open={canEditLines && valuation.lines.length === 1}
            >
              <summary className="cursor-pointer list-none">
                <div className="flex flex-col gap-2 min-[620px]:flex-row min-[620px]:items-start min-[620px]:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary-blue">
                      Line {index + 1}
                    </p>
                    <h4 className="mt-1 truncate text-sm font-bold text-primary-dark">
                      {line.description}
                    </h4>
                  </div>
                  <p className="text-sm font-bold text-primary-dark">
                    {formatZmw(line.claimed_amount)} claimed / {formatZmw(line.certified_amount)} certified
                  </p>
                </div>
              </summary>
              <div className="mt-3 grid gap-3">
                <div className="grid gap-4 min-[520px]:grid-cols-2">
                  <DetailItem label="Claimed qty" value={`${line.claimed_quantity} ${line.unit || "units"}`} />
                  <DetailItem label="Certified qty" value={`${line.certified_quantity} ${line.unit || "units"}`} />
                  <DetailItem label="Unit rate" value={formatZmw(line.unit_rate)} />
                  <DetailItem label="Certified value" value={formatZmw(line.certified_amount)} />
                </div>
                {line.notes ? (
                  <p className="rounded-md bg-primary-dark/[0.03] px-3 py-2 text-sm leading-6 text-primary-dark/62">
                    {line.notes}
                  </p>
                ) : null}
                {canEditLines ? (
                  <form action={updateCommercialValuationLineAction} className="grid gap-3">
                    <input name="line_id" type="hidden" value={line.id} />
                    <label className={OPS_LABEL_CLASS}>
                      Description
                      <input
                        className={OPS_INPUT_CLASS}
                        defaultValue={line.description}
                        name="line_description"
                        required
                      />
                    </label>
                    <div className="grid gap-3 min-[520px]:grid-cols-2 xl:grid-cols-4">
                      <label className={OPS_LABEL_CLASS}>
                        Unit
                        <input className={OPS_INPUT_CLASS} defaultValue={line.unit} name="unit" />
                      </label>
                      <label className={OPS_LABEL_CLASS}>
                        Claimed qty
                        <input
                          className={OPS_INPUT_CLASS}
                          defaultValue={line.claimed_quantity}
                          min="0"
                          name="claimed_quantity"
                          step="0.01"
                          type="number"
                        />
                      </label>
                      <label className={OPS_LABEL_CLASS}>
                        Certified qty
                        <input
                          className={OPS_INPUT_CLASS}
                          defaultValue={line.certified_quantity}
                          min="0"
                          name="certified_quantity"
                          step="0.01"
                          type="number"
                        />
                      </label>
                      <label className={OPS_LABEL_CLASS}>
                        Unit rate
                        <input
                          className={OPS_INPUT_CLASS}
                          defaultValue={line.unit_rate}
                          min="0"
                          name="unit_rate"
                          step="0.01"
                          type="number"
                        />
                      </label>
                    </div>
                    <label className={OPS_LABEL_CLASS}>
                      Notes
                      <textarea className={OPS_INPUT_CLASS} defaultValue={line.notes} name="notes" rows={2} />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
                        Update line
                      </button>
                    </div>
                  </form>
                ) : null}
                {canEditLines && valuation.lines.length > 1 ? (
                  <form action={deleteCommercialValuationLineAction}>
                    <input name="line_id" type="hidden" value={line.id} />
                    <OpsConfirmSubmitButton
                      className={OPS_DANGER_BUTTON_CLASS}
                      confirmText="Delete valuation line?"
                    >
                      Delete line
                    </OpsConfirmSubmitButton>
                  </form>
                ) : null}
              </div>
            </details>
          ))
        ) : (
          <p className="rounded-md border border-dashed border-primary-dark/15 p-3 text-sm font-semibold text-primary-dark/56">
            No lines have been captured for this valuation yet.
          </p>
        )}
        {canEditLines ? (
          <details className="rounded-md border border-primary-blue/20 bg-white p-3">
            <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.12em] text-primary-blue">
              Add valuation line
            </summary>
            <form action={addCommercialValuationLineAction} className="mt-3 grid gap-3">
              <input name="valuation_id" type="hidden" value={valuation.id} />
              <label className={OPS_LABEL_CLASS}>
                Description
                <input className={OPS_INPUT_CLASS} name="line_description" required />
              </label>
              <div className="grid gap-3 min-[520px]:grid-cols-2 xl:grid-cols-4">
                <label className={OPS_LABEL_CLASS}>
                  Unit
                  <input className={OPS_INPUT_CLASS} name="unit" />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Claimed qty
                  <input className={OPS_INPUT_CLASS} min="0" name="claimed_quantity" step="0.01" type="number" />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Certified qty
                  <input className={OPS_INPUT_CLASS} min="0" name="certified_quantity" step="0.01" type="number" />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Unit rate
                  <input className={OPS_INPUT_CLASS} min="0" name="unit_rate" step="0.01" type="number" />
                </label>
              </div>
              <label className={OPS_LABEL_CLASS}>
                Notes
                <textarea className={OPS_INPUT_CLASS} name="notes" rows={2} />
              </label>
              <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
                Add line
              </button>
            </form>
          </details>
        ) : null}
      </div>
    </div>
  );
}

function RiskActions({
  actorId,
  risk,
  role,
}: {
  actorId: string;
  risk: OpsCommercialRiskSummary;
  role: OpsUserRole;
}) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {canMoveOpsCommercialRiskToMitigation(role, risk) ? (
        <InlineActionForm
          action={mitigateCommercialRiskAction}
          buttonClass={OPS_SECONDARY_BUTTON_CLASS}
          confirmText="Move risk to mitigation?"
          hidden={{ risk_id: risk.id }}
        >
          Mitigate
        </InlineActionForm>
      ) : null}
      {canCloseOpsCommercialRisk(role, risk) ? (
        <InlineActionForm
          action={closeCommercialRiskAction}
          buttonClass={OPS_SECONDARY_BUTTON_CLASS}
          confirmText="Close risk?"
          hidden={{ risk_id: risk.id }}
        >
          Close
        </InlineActionForm>
      ) : null}
      {canCancelOpsCommercialRisk(actorId, role, risk) ? (
        <InlineActionForm
          action={cancelCommercialRiskAction}
          buttonClass={OPS_DANGER_BUTTON_CLASS}
          confirmText="Cancel risk?"
          hidden={{ risk_id: risk.id }}
        >
          Cancel
        </InlineActionForm>
      ) : null}
    </div>
  );
}

function RetentionReleaseActions({
  actorId,
  release,
  role,
}: {
  actorId: string;
  release: OpsCommercialRetentionReleaseSummary;
  role: OpsUserRole;
}) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {canSubmitOpsCommercialRetentionRelease(actorId, role, release) ? (
        <InlineActionForm
          action={submitCommercialRetentionReleaseAction}
          buttonClass={OPS_SECONDARY_BUTTON_CLASS}
          confirmText="Submit retention release?"
          hidden={{ release_id: release.id }}
        >
          Submit
        </InlineActionForm>
      ) : null}
      {canApproveOpsCommercialRetentionRelease(role, release) ? (
        <details className="w-full rounded-md border border-primary-dark/10 p-3">
          <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.1em] text-primary-dark/60">
            Approve release
          </summary>
          <form action={approveCommercialRetentionReleaseAction} className="mt-3 grid gap-3">
            <input name="release_id" type="hidden" value={release.id} />
            <label className={OPS_LABEL_CLASS}>
              Approved amount
              <input
                className={OPS_INPUT_CLASS}
                defaultValue={release.claimed_amount}
                min="0"
                name="approved_amount"
                step="0.01"
                type="number"
              />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Notes
              <textarea className={OPS_INPUT_CLASS} name="notes" rows={2} />
            </label>
            <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
              Approve
            </button>
          </form>
        </details>
      ) : null}
      {canReleaseOpsCommercialRetentionRelease(role, release) ? (
        <details className="w-full rounded-md border border-primary-dark/10 p-3">
          <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.1em] text-primary-dark/60">
            Release retention
          </summary>
          <form action={releaseCommercialRetentionReleaseAction} className="mt-3 grid gap-3 min-[520px]:grid-cols-2">
            <input name="release_id" type="hidden" value={release.id} />
            <label className={OPS_LABEL_CLASS}>
              Released amount
              <input
                className={OPS_INPUT_CLASS}
                defaultValue={release.approved_amount}
                min="0"
                name="released_amount"
                step="0.01"
                type="number"
              />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Release date
              <input className={OPS_INPUT_CLASS} name="release_date" type="date" />
            </label>
            <button className={`${OPS_PRIMARY_BUTTON_CLASS} min-[520px]:col-span-2`} type="submit">
              Release
            </button>
          </form>
        </details>
      ) : null}
      {canRejectOpsCommercialRetentionRelease(role, release) ? (
        <details className="w-full rounded-md border border-red-100 p-3">
          <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.1em] text-red-700">
            Reject release
          </summary>
          <form action={rejectCommercialRetentionReleaseAction} className="mt-3 grid gap-3">
            <input name="release_id" type="hidden" value={release.id} />
            <label className={OPS_LABEL_CLASS}>
              Rejection reason
              <textarea className={OPS_INPUT_CLASS} name="rejection_reason" required rows={2} />
            </label>
            <button className={OPS_DANGER_BUTTON_CLASS} type="submit">
              Reject
            </button>
          </form>
        </details>
      ) : null}
      {canCancelOpsCommercialRetentionRelease(actorId, role, release) ? (
        <InlineActionForm
          action={cancelCommercialRetentionReleaseAction}
          buttonClass={OPS_DANGER_BUTTON_CLASS}
          confirmText="Cancel retention release?"
          hidden={{ release_id: release.id }}
        >
          Cancel
        </InlineActionForm>
      ) : null}
    </div>
  );
}

function CashflowForecastActions({
  actorId,
  forecast,
  role,
}: {
  actorId: string;
  forecast: OpsCommercialCashflowForecastSummary;
  role: OpsUserRole;
}) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {canApproveOpsCommercialCashflowForecast(role, forecast) ? (
        <InlineActionForm
          action={approveCommercialCashflowForecastAction}
          buttonClass={OPS_SECONDARY_BUTTON_CLASS}
          confirmText="Approve cashflow forecast?"
          hidden={{ forecast_id: forecast.id }}
        >
          Approve
        </InlineActionForm>
      ) : null}
      {canLockOpsCommercialCashflowForecast(role, forecast) ? (
        <InlineActionForm
          action={lockCommercialCashflowForecastAction}
          buttonClass={OPS_SECONDARY_BUTTON_CLASS}
          confirmText="Lock cashflow forecast?"
          hidden={{ forecast_id: forecast.id }}
        >
          Lock
        </InlineActionForm>
      ) : null}
      {canArchiveOpsCommercialCashflowForecast(role, forecast) ? (
        <InlineActionForm
          action={archiveCommercialCashflowForecastAction}
          buttonClass={OPS_SECONDARY_BUTTON_CLASS}
          confirmText="Archive cashflow forecast?"
          hidden={{ forecast_id: forecast.id }}
        >
          Archive
        </InlineActionForm>
      ) : null}
      {canCancelOpsCommercialCashflowForecast(actorId, role, forecast) ? (
        <InlineActionForm
          action={cancelCommercialCashflowForecastAction}
          buttonClass={OPS_DANGER_BUTTON_CLASS}
          confirmText="Cancel cashflow forecast?"
          hidden={{ forecast_id: forecast.id }}
        >
          Cancel
        </InlineActionForm>
      ) : null}
    </div>
  );
}

function MilestoneActions({
  actorId,
  milestone,
  role,
}: {
  actorId: string;
  milestone: OpsCommercialMilestoneSummary;
  role: OpsUserRole;
}) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {canMarkOpsCommercialMilestoneDue(actorId, role, milestone) ? (
        <InlineActionForm
          action={markCommercialMilestoneDueAction}
          buttonClass={OPS_SECONDARY_BUTTON_CLASS}
          confirmText="Mark milestone due?"
          hidden={{ milestone_id: milestone.id }}
        >
          Due
        </InlineActionForm>
      ) : null}
      {canAchieveOpsCommercialMilestone(actorId, role, milestone) ? (
        <details className="w-full rounded-md border border-primary-dark/10 p-3">
          <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.1em] text-primary-dark/60">
            Achieve milestone
          </summary>
          <form action={achieveCommercialMilestoneAction} className="mt-3 grid gap-3 min-[520px]:grid-cols-2">
            <input name="milestone_id" type="hidden" value={milestone.id} />
            <label className={OPS_LABEL_CLASS}>
              Achieved amount
              <input
                className={OPS_INPUT_CLASS}
                defaultValue={milestone.target_amount}
                min="0"
                name="achieved_amount"
                step="0.01"
                type="number"
              />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Actual date
              <input className={OPS_INPUT_CLASS} name="actual_date" type="date" />
            </label>
            <button className={`${OPS_PRIMARY_BUTTON_CLASS} min-[520px]:col-span-2`} type="submit">
              Achieve
            </button>
          </form>
        </details>
      ) : null}
      {canCertifyOpsCommercialMilestone(role, milestone) ? (
        <InlineActionForm
          action={certifyCommercialMilestoneAction}
          buttonClass={OPS_SECONDARY_BUTTON_CLASS}
          confirmText="Certify milestone?"
          hidden={{ milestone_id: milestone.id }}
        >
          Certify
        </InlineActionForm>
      ) : null}
      {canDelayOpsCommercialMilestone(actorId, role, milestone) ? (
        <details className="w-full rounded-md border border-red-100 p-3">
          <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.1em] text-red-700">
            Delay milestone
          </summary>
          <form action={delayCommercialMilestoneAction} className="mt-3 grid gap-3">
            <input name="milestone_id" type="hidden" value={milestone.id} />
            <label className={OPS_LABEL_CLASS}>
              New forecast date
              <input className={OPS_INPUT_CLASS} name="forecast_date" required type="date" />
            </label>
            <button className={OPS_DANGER_BUTTON_CLASS} type="submit">
              Delay
            </button>
          </form>
        </details>
      ) : null}
      {canCancelOpsCommercialMilestone(actorId, role, milestone) ? (
        <InlineActionForm
          action={cancelCommercialMilestoneAction}
          buttonClass={OPS_DANGER_BUTTON_CLASS}
          confirmText="Cancel milestone?"
          hidden={{ milestone_id: milestone.id }}
        >
          Cancel
        </InlineActionForm>
      ) : null}
    </div>
  );
}

export default async function CommercialControlsPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const auth = await requireOpsUser();

  if (!canAccessOpsHref(auth.profile.role, "/ops/commercial")) {
    notFound();
  }

  const status = statusFromParam(firstParam(params.status));
  const listState = parseOpsListState(params);
  const today = todayInLusaka();
  const [
    sites,
    boqOptions,
    contractOptions,
    valuationOptions,
    variationOptions,
    stats,
    marginReport,
    forecastReport,
    ipcs,
    contracts,
    valuations,
    risks,
    retentionReleases,
    cashflowForecasts,
    milestones,
    variations,
    claims,
  ] = await Promise.all([
    fetchActiveSiteOptions(),
    fetchCommercialBoqOptions(),
    fetchCommercialContractOptions(),
    fetchCommercialValuationOptions(),
    fetchCommercialVariationOptions(),
    fetchOpsCommercialStats(),
    fetchOpsCommercialMarginReport(),
    fetchOpsCommercialForecastReport(today),
    fetchPaginatedOpsCommercialIpcs({
      listState,
      query: listState.query,
      status: status || undefined,
    }),
    fetchRecentCommercialContracts(),
    fetchRecentCommercialValuations(),
    fetchRecentCommercialRisks(),
    fetchRecentCommercialRetentionReleases(),
    fetchRecentCommercialCashflowForecasts(),
    fetchRecentCommercialMilestones(),
    fetchRecentCommercialVariations(),
    fetchRecentCommercialClaims(),
  ]);
  const notice = commercialNotice(params);
  const canCreate = canCreateOpsCommercialRecord(auth.profile.role);
  const openContractPanel = firstParam(params.create) === "contract";
  const openCashflowPanel = firstParam(params.create) === "cashflow";
  const openIpcPanel = firstParam(params.create) === "ipc";
  const openMilestonePanel = firstParam(params.create) === "milestone";
  const openRetentionPanel = firstParam(params.create) === "retention";
  const openRiskPanel = firstParam(params.create) === "risk";
  const openValuationPanel = firstParam(params.create) === "valuation";
  const openVariationPanel = firstParam(params.create) === "variation";
  const openClaimPanel = firstParam(params.create) === "claim";
  const hasActiveListFilter = listState.query.length > 0 || status.length > 0;

  return (
    <div className="grid gap-6">
      <section className="rounded-lg border border-primary-dark/10 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary-blue">
              QS and Commercial
            </p>
            <h1 className="mt-2 font-heading text-3xl font-bold text-primary-dark">
              IPCs, Variations, and Claims
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-primary-dark/62">
              Control valuations, client-facing changes, and commercial claim exposure before they
              become invoices or financial risk.
            </p>
          </div>
          {canCreate ? (
            <div className="flex flex-wrap gap-2">
              <Link className={OPS_PRIMARY_BUTTON_CLASS} href="/ops/commercial?create=ipc#ipc-create-panel">
                <Plus className="size-4" aria-hidden="true" />
                IPC
              </Link>
              <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/commercial?create=contract#contract-create-panel">
                <Briefcase className="size-4" aria-hidden="true" />
                Contract
              </Link>
              <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/commercial?create=retention#retention-create-panel">
                <Banknote className="size-4" aria-hidden="true" />
                Retention
              </Link>
              <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/commercial?create=cashflow#cashflow-create-panel">
                <TrendingUp className="size-4" aria-hidden="true" />
                Cashflow
              </Link>
              <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/commercial?create=milestone#milestone-create-panel">
                <Flag className="size-4" aria-hidden="true" />
                Milestone
              </Link>
              <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/commercial?create=valuation#valuation-create-panel">
                <FileSpreadsheet className="size-4" aria-hidden="true" />
                Valuation
              </Link>
              <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/commercial?create=variation#variation-create-panel">
                <Gavel className="size-4" aria-hidden="true" />
                Variation
              </Link>
              <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/commercial?create=claim#claim-create-panel">
                <Scale className="size-4" aria-hidden="true" />
                Claim
              </Link>
              <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/commercial?create=risk#risk-create-panel">
                <AlertTriangle className="size-4" aria-hidden="true" />
                Risk
              </Link>
            </div>
          ) : null}
        </div>
        {notice ? (
          <div
            className={`mt-4 rounded-md border px-4 py-3 text-sm font-semibold ${
              notice.tone === "error"
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
            role="status"
          >
            {notice.message}
          </div>
        ) : null}
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <OpsKpiCard
          href="/ops/commercial?status=submitted#ipc-register"
          icon={ReceiptText}
          label="Open IPCs"
          tone={stats.openIpcs > 0 ? "warn" : "default"}
          value={String(stats.openIpcs)}
        />
        <OpsKpiCard
          href="/ops/commercial?status=certified#ipc-register"
          icon={CheckCircle2}
          label="Certified IPCs"
          tone="good"
          value={String(stats.certifiedIpcs)}
        />
        <OpsKpiCard
          href="/ops/commercial#contract-panel"
          icon={Briefcase}
          label="Active contracts"
          tone={stats.activeContracts > 0 ? "good" : "default"}
          value={String(stats.activeContracts)}
        />
        <OpsKpiCard
          href="/ops/commercial#valuation-panel"
          icon={FileSpreadsheet}
          label="Draft valuations"
          tone={stats.draftValuations > 0 ? "warn" : "default"}
          value={String(stats.draftValuations)}
        />
        <OpsKpiCard
          href="/ops/commercial#variation-panel"
          icon={Gavel}
          label="Open variations"
          tone={stats.openVariations > 0 ? "warn" : "default"}
          value={String(stats.openVariations)}
        />
        <OpsKpiCard
          href="/ops/commercial#risk-panel"
          icon={AlertTriangle}
          label="Open risks"
          tone={stats.openRisks > 0 ? "warn" : "default"}
          value={String(stats.openRisks)}
        />
        <OpsKpiCard
          href="/ops/commercial#claim-panel"
          icon={BadgeDollarSign}
          label="Exposure"
          value={formatZmw(stats.totalExposureAmount)}
        />
        <OpsKpiCard
          href="/ops/commercial#valuation-panel"
          icon={ListChecks}
          label="Certified valuation"
          tone="good"
          value={formatZmw(stats.valuationCertifiedAmount)}
        />
        <OpsKpiCard
          href="/ops/commercial#retention-panel"
          icon={Banknote}
          label="Pending retention"
          tone={forecastReport.totals.retentionDueCount > 0 ? "warn" : "default"}
          value={formatZmw(forecastReport.totals.pendingRetentionAmount)}
        />
        <OpsKpiCard
          href="/ops/commercial#cashflow-panel"
          icon={TrendingUp}
          label="Forecast net cash"
          tone={forecastReport.totals.cashflowDangerCount > 0 ? "warn" : "good"}
          value={formatZmw(forecastReport.totals.approvedCashflowNet)}
        />
        <OpsKpiCard
          href="/ops/commercial#milestone-panel"
          icon={Flag}
          label="Milestone overdue"
          tone={forecastReport.totals.milestoneOverdueCount > 0 ? "warn" : "default"}
          value={String(forecastReport.totals.milestoneOverdueCount)}
        />
        <OpsKpiCard
          href="/ops/commercial#forecast-watch"
          icon={CalendarClock}
          label="Milestone value"
          value={formatZmw(forecastReport.totals.milestoneForecastAmount)}
        />
      </section>

      <CommercialMarginPanel report={marginReport} />
      <CommercialForecastPanel report={forecastReport} />

      {canCreate ? (
        <section className="grid gap-4 lg:grid-cols-3">
          <details
            className="rounded-lg border border-primary-dark/10 bg-white p-5 shadow-sm"
            id="contract-create-panel"
            open={openContractPanel}
          >
            <summary className="cursor-pointer text-sm font-bold uppercase tracking-[0.12em] text-primary-dark/58">
              Create contract
            </summary>
            {sites.length === 0 ? (
              <p className="mt-4 rounded-md bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-700">
                Add an active site before creating contracts.
              </p>
            ) : (
              <form action={createCommercialContractAction} className="mt-4 grid gap-3">
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
                  BOQ
                  <select className={OPS_INPUT_CLASS} defaultValue="" name="boq_id">
                    <option value="">No BOQ link</option>
                    {boqOptions.map((boq) => (
                      <option key={boq.id} value={boq.id}>
                        {boq.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Contract type
                  <select className={OPS_INPUT_CLASS} defaultValue="main_contract" name="contract_type">
                    {CONTRACT_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Contract
                  <select className={OPS_INPUT_CLASS} defaultValue="" name="contract_id">
                    <option value="">No contract link</option>
                    {contractOptions.map((contract) => (
                      <option key={contract.id} value={contract.id}>
                        {contract.contract_number} - {contract.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Valuation
                  <select className={OPS_INPUT_CLASS} defaultValue="" name="valuation_id">
                    <option value="">No valuation link</option>
                    {valuationOptions.map((valuation) => (
                      <option key={valuation.id} value={valuation.id}>
                        {valuation.valuation_number} - {valuation.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Title
                  <input className={OPS_INPUT_CLASS} name="title" required />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Client name
                  <input className={OPS_INPUT_CLASS} name="client_name" required />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Contract sum
                  <input className={OPS_INPUT_CLASS} min="0" name="contract_sum" step="0.01" type="number" />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className={OPS_LABEL_CLASS}>
                    Start date
                    <input className={OPS_INPUT_CLASS} name="start_date" type="date" />
                  </label>
                  <label className={OPS_LABEL_CLASS}>
                    End date
                    <input className={OPS_INPUT_CLASS} name="end_date" type="date" />
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className={OPS_LABEL_CLASS}>
                    Retention %
                    <input className={OPS_INPUT_CLASS} max="100" min="0" name="retention_percent" step="0.01" type="number" />
                  </label>
                  <label className={OPS_LABEL_CLASS}>
                    Security amount
                    <input className={OPS_INPUT_CLASS} min="0" name="performance_security_amount" step="0.01" type="number" />
                  </label>
                </div>
                <label className={OPS_LABEL_CLASS}>
                  Client reference
                  <input className={OPS_INPUT_CLASS} name="client_reference" />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Description
                  <textarea className={OPS_INPUT_CLASS} name="description" rows={3} />
                </label>
                <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
                  Create contract
                </button>
              </form>
            )}
          </details>

          <details
            className="rounded-lg border border-primary-dark/10 bg-white p-5 shadow-sm"
            id="valuation-create-panel"
            open={openValuationPanel}
          >
            <summary className="cursor-pointer text-sm font-bold uppercase tracking-[0.12em] text-primary-dark/58">
              Create valuation
            </summary>
            {sites.length === 0 ? (
              <p className="mt-4 rounded-md bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-700">
                Add an active site before creating valuations.
              </p>
            ) : (
              <form action={createCommercialValuationAction} className="mt-4 grid gap-3">
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
                  Contract
                  <select className={OPS_INPUT_CLASS} defaultValue="" name="contract_id">
                    <option value="">No contract link</option>
                    {contractOptions.map((contract) => (
                      <option key={contract.id} value={contract.id}>
                        {contract.contract_number} - {contract.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={OPS_LABEL_CLASS}>
                  BOQ
                  <select className={OPS_INPUT_CLASS} defaultValue="" name="boq_id">
                    <option value="">No BOQ link</option>
                    {boqOptions.map((boq) => (
                      <option key={boq.id} value={boq.id}>
                        {boq.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Title
                  <input className={OPS_INPUT_CLASS} name="title" required />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className={OPS_LABEL_CLASS}>
                    Valuation date
                    <input className={OPS_INPUT_CLASS} defaultValue={today} name="valuation_date" type="date" />
                  </label>
                  <label className={OPS_LABEL_CLASS}>
                    Unit
                    <input className={OPS_INPUT_CLASS} name="unit" />
                  </label>
                </div>
                <label className={OPS_LABEL_CLASS}>
                  First line description
                  <input className={OPS_INPUT_CLASS} name="line_description" required />
                </label>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className={OPS_LABEL_CLASS}>
                    Claimed qty
                    <input className={OPS_INPUT_CLASS} min="0" name="claimed_quantity" step="0.01" type="number" />
                  </label>
                  <label className={OPS_LABEL_CLASS}>
                    Certified qty
                    <input className={OPS_INPUT_CLASS} min="0" name="certified_quantity" step="0.01" type="number" />
                  </label>
                  <label className={OPS_LABEL_CLASS}>
                    Unit rate
                    <input className={OPS_INPUT_CLASS} min="0" name="unit_rate" step="0.01" type="number" />
                  </label>
                </div>
                <label className={OPS_LABEL_CLASS}>
                  Description
                  <textarea className={OPS_INPUT_CLASS} name="description" rows={3} />
                </label>
                <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
                  Create valuation
                </button>
              </form>
            )}
          </details>

          <details
            className="rounded-lg border border-primary-dark/10 bg-white p-5 shadow-sm"
            id="risk-create-panel"
            open={openRiskPanel}
          >
            <summary className="cursor-pointer text-sm font-bold uppercase tracking-[0.12em] text-primary-dark/58">
              Create commercial risk
            </summary>
            {sites.length === 0 ? (
              <p className="mt-4 rounded-md bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-700">
                Add an active site before creating risks.
              </p>
            ) : (
              <form action={createCommercialRiskAction} className="mt-4 grid gap-3">
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
                  Contract
                  <select className={OPS_INPUT_CLASS} defaultValue="" name="contract_id">
                    <option value="">No contract link</option>
                    {contractOptions.map((contract) => (
                      <option key={contract.id} value={contract.id}>
                        {contract.contract_number} - {contract.title}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className={OPS_LABEL_CLASS}>
                    Category
                    <select className={OPS_INPUT_CLASS} defaultValue="other" name="category">
                      {RISK_CATEGORY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={OPS_LABEL_CLASS}>
                    Severity
                    <select className={OPS_INPUT_CLASS} defaultValue="medium" name="severity">
                      {RISK_SEVERITY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className={OPS_LABEL_CLASS}>
                  Title
                  <input className={OPS_INPUT_CLASS} name="title" required />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className={OPS_LABEL_CLASS}>
                    Impact amount
                    <input className={OPS_INPUT_CLASS} min="0" name="impact_amount" step="0.01" type="number" />
                  </label>
                  <label className={OPS_LABEL_CLASS}>
                    Due date
                    <input className={OPS_INPUT_CLASS} name="due_date" type="date" />
                  </label>
                </div>
                <label className={OPS_LABEL_CLASS}>
                  Description
                  <textarea className={OPS_INPUT_CLASS} name="description" rows={3} />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Mitigation plan
                  <textarea className={OPS_INPUT_CLASS} name="mitigation_plan" rows={2} />
                </label>
                <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
                  Create risk
                </button>
              </form>
            )}
          </details>

          <details
            className="rounded-lg border border-primary-dark/10 bg-white p-5 shadow-sm"
            id="retention-create-panel"
            open={openRetentionPanel}
          >
            <summary className="cursor-pointer text-sm font-bold uppercase tracking-[0.12em] text-primary-dark/58">
              Create retention release
            </summary>
            {contractOptions.length === 0 ? (
              <p className="mt-4 rounded-md bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-700">
                Create a commercial contract before capturing retention releases.
              </p>
            ) : (
              <form action={createCommercialRetentionReleaseAction} className="mt-4 grid gap-3">
                <label className={OPS_LABEL_CLASS}>
                  Contract
                  <select className={OPS_INPUT_CLASS} defaultValue="" name="contract_id" required>
                    <option value="">Select contract</option>
                    {contractOptions.map((contract) => (
                      <option key={contract.id} value={contract.id}>
                        {contract.contract_number} - {contract.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Release type
                  <select className={OPS_INPUT_CLASS} defaultValue="interim" name="release_type">
                    {RETENTION_RELEASE_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={OPS_LABEL_CLASS}>
                  IPC
                  <select className={OPS_INPUT_CLASS} defaultValue="" name="ipc_id">
                    <option value="">No IPC link</option>
                    {ipcs.items.map((ipc) => (
                      <option key={ipc.id} value={ipc.id}>
                        {ipc.ipc_number} - {ipc.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Title
                  <input className={OPS_INPUT_CLASS} name="title" required />
                </label>
                <div className="grid gap-3 min-[520px]:grid-cols-2">
                  <label className={OPS_LABEL_CLASS}>
                    Claimed amount
                    <input className={OPS_INPUT_CLASS} min="0" name="claimed_amount" step="0.01" type="number" />
                  </label>
                  <label className={OPS_LABEL_CLASS}>
                    Due date
                    <input className={OPS_INPUT_CLASS} name="due_date" type="date" />
                  </label>
                </div>
                <label className={OPS_LABEL_CLASS}>
                  Client reference
                  <input className={OPS_INPUT_CLASS} name="client_reference" />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Description
                  <textarea className={OPS_INPUT_CLASS} name="description" rows={3} />
                </label>
                <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
                  Create retention release
                </button>
              </form>
            )}
          </details>

          <details
            className="rounded-lg border border-primary-dark/10 bg-white p-5 shadow-sm"
            id="cashflow-create-panel"
            open={openCashflowPanel}
          >
            <summary className="cursor-pointer text-sm font-bold uppercase tracking-[0.12em] text-primary-dark/58">
              Create cashflow forecast
            </summary>
            {sites.length === 0 ? (
              <p className="mt-4 rounded-md bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-700">
                Add an active site before creating cashflow forecasts.
              </p>
            ) : (
              <form action={createCommercialCashflowForecastAction} className="mt-4 grid gap-3">
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
                  Contract
                  <select className={OPS_INPUT_CLASS} defaultValue="" name="contract_id">
                    <option value="">No contract link</option>
                    {contractOptions.map((contract) => (
                      <option key={contract.id} value={contract.id}>
                        {contract.contract_number} - {contract.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Title
                  <input className={OPS_INPUT_CLASS} name="title" required />
                </label>
                <div className="grid gap-3 min-[520px]:grid-cols-2">
                  <label className={OPS_LABEL_CLASS}>
                    Period start
                    <input className={OPS_INPUT_CLASS} defaultValue={today} name="period_start" type="date" />
                  </label>
                  <label className={OPS_LABEL_CLASS}>
                    Period end
                    <input className={OPS_INPUT_CLASS} defaultValue={today} name="period_end" type="date" />
                  </label>
                </div>
                <div className="grid gap-3 min-[520px]:grid-cols-3">
                  <label className={OPS_LABEL_CLASS}>
                    Forecast revenue
                    <input className={OPS_INPUT_CLASS} min="0" name="forecast_revenue" step="0.01" type="number" />
                  </label>
                  <label className={OPS_LABEL_CLASS}>
                    Retention release
                    <input className={OPS_INPUT_CLASS} min="0" name="forecast_retention_release" step="0.01" type="number" />
                  </label>
                  <label className={OPS_LABEL_CLASS}>
                    Forecast cost
                    <input className={OPS_INPUT_CLASS} min="0" name="forecast_cost" step="0.01" type="number" />
                  </label>
                </div>
                <label className={OPS_LABEL_CLASS}>
                  Confidence
                  <select className={OPS_INPUT_CLASS} defaultValue="medium" name="confidence">
                    {CASHFLOW_CONFIDENCE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Assumptions
                  <textarea className={OPS_INPUT_CLASS} name="assumptions" rows={3} />
                </label>
                <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
                  Create cashflow forecast
                </button>
              </form>
            )}
          </details>

          <details
            className="rounded-lg border border-primary-dark/10 bg-white p-5 shadow-sm"
            id="milestone-create-panel"
            open={openMilestonePanel}
          >
            <summary className="cursor-pointer text-sm font-bold uppercase tracking-[0.12em] text-primary-dark/58">
              Create contract milestone
            </summary>
            {contractOptions.length === 0 ? (
              <p className="mt-4 rounded-md bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-700">
                Create a commercial contract before adding milestones.
              </p>
            ) : (
              <form action={createCommercialMilestoneAction} className="mt-4 grid gap-3">
                <label className={OPS_LABEL_CLASS}>
                  Contract
                  <select className={OPS_INPUT_CLASS} defaultValue="" name="contract_id" required>
                    <option value="">Select contract</option>
                    {contractOptions.map((contract) => (
                      <option key={contract.id} value={contract.id}>
                        {contract.contract_number} - {contract.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Title
                  <input className={OPS_INPUT_CLASS} name="title" required />
                </label>
                <div className="grid gap-3 min-[520px]:grid-cols-3">
                  <label className={OPS_LABEL_CLASS}>
                    Planned date
                    <input className={OPS_INPUT_CLASS} name="planned_date" type="date" />
                  </label>
                  <label className={OPS_LABEL_CLASS}>
                    Forecast date
                    <input className={OPS_INPUT_CLASS} name="forecast_date" type="date" />
                  </label>
                  <label className={OPS_LABEL_CLASS}>
                    Due date
                    <input className={OPS_INPUT_CLASS} name="due_date" type="date" />
                  </label>
                </div>
                <div className="grid gap-3 min-[520px]:grid-cols-2">
                  <label className={OPS_LABEL_CLASS}>
                    Target amount
                    <input className={OPS_INPUT_CLASS} min="0" name="target_amount" step="0.01" type="number" />
                  </label>
                  <label className={OPS_LABEL_CLASS}>
                    Billing weight %
                    <input className={OPS_INPUT_CLASS} max="100" min="0" name="billing_weight_percent" step="0.01" type="number" />
                  </label>
                </div>
                <div className="grid gap-2 text-sm font-semibold text-primary-dark/70 min-[520px]:grid-cols-2">
                  <label className="flex items-center gap-2">
                    <input name="invoice_trigger" type="checkbox" />
                    Invoice trigger
                  </label>
                  <label className="flex items-center gap-2">
                    <input name="retention_trigger" type="checkbox" />
                    Retention trigger
                  </label>
                </div>
                <label className={OPS_LABEL_CLASS}>
                  Description
                  <textarea className={OPS_INPUT_CLASS} name="description" rows={3} />
                </label>
                <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
                  Create milestone
                </button>
              </form>
            )}
          </details>

          <details
            className="rounded-lg border border-primary-dark/10 bg-white p-5 shadow-sm"
            id="ipc-create-panel"
            open={openIpcPanel}
          >
            <summary className="cursor-pointer text-sm font-bold uppercase tracking-[0.12em] text-primary-dark/58">
              Create IPC
            </summary>
            {sites.length === 0 ? (
              <p className="mt-4 rounded-md bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-700">
                Add an active site before creating IPCs.
              </p>
            ) : (
              <form action={createCommercialIpcAction} className="mt-4 grid gap-3">
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
                  BOQ
                  <select className={OPS_INPUT_CLASS} defaultValue="" name="boq_id">
                    <option value="">No BOQ link</option>
                    {boqOptions.map((boq) => (
                      <option key={boq.id} value={boq.id}>
                        {boq.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Title
                  <input className={OPS_INPUT_CLASS} name="title" required />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className={OPS_LABEL_CLASS}>
                    Valuation date
                    <input className={OPS_INPUT_CLASS} defaultValue={today} name="valuation_date" type="date" />
                  </label>
                  <label className={OPS_LABEL_CLASS}>
                    Claimed amount
                    <input className={OPS_INPUT_CLASS} min="0" name="claimed_amount" step="0.01" type="number" />
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className={OPS_LABEL_CLASS}>
                    Period start
                    <input className={OPS_INPUT_CLASS} name="period_start" type="date" />
                  </label>
                  <label className={OPS_LABEL_CLASS}>
                    Period end
                    <input className={OPS_INPUT_CLASS} name="period_end" type="date" />
                  </label>
                </div>
                <label className={OPS_LABEL_CLASS}>
                  Client reference
                  <input className={OPS_INPUT_CLASS} name="client_reference" />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Description
                  <textarea className={OPS_INPUT_CLASS} name="description" rows={3} />
                </label>
                <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
                  Create IPC
                </button>
              </form>
            )}
          </details>

          <details
            className="rounded-lg border border-primary-dark/10 bg-white p-5 shadow-sm"
            id="variation-create-panel"
            open={openVariationPanel}
          >
            <summary className="cursor-pointer text-sm font-bold uppercase tracking-[0.12em] text-primary-dark/58">
              Create variation
            </summary>
            {sites.length === 0 ? (
              <p className="mt-4 rounded-md bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-700">
                Add an active site before creating variations.
              </p>
            ) : (
              <form action={createCommercialVariationAction} className="mt-4 grid gap-3">
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
                  BOQ
                  <select className={OPS_INPUT_CLASS} defaultValue="" name="boq_id">
                    <option value="">No BOQ link</option>
                    {boqOptions.map((boq) => (
                      <option key={boq.id} value={boq.id}>
                        {boq.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Title
                  <input className={OPS_INPUT_CLASS} name="title" required />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Submitted amount
                  <input className={OPS_INPUT_CLASS} min="0" name="submitted_amount" step="0.01" type="number" />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Instruction reference
                  <input className={OPS_INPUT_CLASS} name="instruction_reference" />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Reason
                  <textarea className={OPS_INPUT_CLASS} name="reason" rows={2} />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Description
                  <textarea className={OPS_INPUT_CLASS} name="description" rows={3} />
                </label>
                <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
                  Create variation
                </button>
              </form>
            )}
          </details>

          <details
            className="rounded-lg border border-primary-dark/10 bg-white p-5 shadow-sm"
            id="claim-create-panel"
            open={openClaimPanel}
          >
            <summary className="cursor-pointer text-sm font-bold uppercase tracking-[0.12em] text-primary-dark/58">
              Create claim
            </summary>
            {sites.length === 0 ? (
              <p className="mt-4 rounded-md bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-700">
                Add an active site before creating claims.
              </p>
            ) : (
              <form action={createCommercialClaimAction} className="mt-4 grid gap-3">
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
                  Linked variation
                  <select className={OPS_INPUT_CLASS} defaultValue="" name="variation_id">
                    <option value="">No variation link</option>
                    {variationOptions.map((variation) => (
                      <option key={variation.id} value={variation.id}>
                        {variation.variation_number} - {variation.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Claim type
                  <select className={OPS_INPUT_CLASS} defaultValue="other" name="claim_type">
                    {CLAIM_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Title
                  <input className={OPS_INPUT_CLASS} name="title" required />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Claimed amount
                  <input className={OPS_INPUT_CLASS} min="0" name="claimed_amount" step="0.01" type="number" />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className={OPS_LABEL_CLASS}>
                    Event date
                    <input className={OPS_INPUT_CLASS} name="event_date" type="date" />
                  </label>
                  <label className={OPS_LABEL_CLASS}>
                    Due date
                    <input className={OPS_INPUT_CLASS} name="due_date" type="date" />
                  </label>
                </div>
                <label className={OPS_LABEL_CLASS}>
                  Client reference
                  <input className={OPS_INPUT_CLASS} name="client_reference" />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Description
                  <textarea className={OPS_INPUT_CLASS} name="description" rows={3} />
                </label>
                <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
                  Create claim
                </button>
              </form>
            )}
          </details>
        </section>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-3">
        <div className="rounded-lg border border-primary-dark/10 bg-white shadow-sm" id="contract-panel">
          <div className="flex items-center justify-between gap-3 border-b border-primary-dark/10 p-5">
            <div>
              <h2 className="text-lg font-bold text-primary-dark">Contract register</h2>
              <p className="mt-1 text-sm text-primary-dark/56">
                Client contracts, sums, retention, and commercial source control.
              </p>
            </div>
            <Briefcase className="size-5 text-primary-blue" aria-hidden="true" />
          </div>
          <div className="grid gap-3 p-5">
            {contracts.length > 0 ? (
              contracts.map((contract) => (
                <article className="rounded-lg border border-primary-dark/10 p-4" key={contract.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary-blue">
                        {contract.contract_number}
                      </p>
                      <h3 className="mt-1 text-base font-bold text-primary-dark">{contract.title}</h3>
                      <p className="mt-1 text-sm text-primary-dark/58">
                        {contract.site ? `${contract.site.code} - ${contract.site.name}` : "No site"}
                      </p>
                    </div>
                    <StatusBadge className={contractStatusClass(contract.status)} value={contract.status} />
                  </div>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <DetailItem label="Client" value={contract.client_name} />
                    <DetailItem label="Contract sum" value={formatZmw(contract.contract_sum)} />
                    <DetailItem label="Type" value={formatLabel(contract.contract_type)} />
                    <DetailItem label="Retention" value={`${contract.retention_percent}%`} />
                  </div>
                  <ContractActions actorId={auth.profile.id} contract={contract} role={auth.profile.role} />
                  <div className="mt-4 rounded-md border border-primary-dark/10 bg-primary-dark/[0.015] p-3">
                    <OpsRecordActivityPanel
                      canManage={canCreate}
                      sourceId={contract.id}
                      sourceTable="commercial_contracts"
                    />
                  </div>
                </article>
              ))
            ) : (
              <div className="p-6 text-center">
                <Briefcase className="mx-auto size-9 text-primary-dark/24" aria-hidden="true" />
                <h3 className="mt-3 font-bold text-primary-dark">No contracts yet</h3>
                <p className="mt-2 text-sm text-primary-dark/56">
                  Create contracts before linking valuations and certified IPC invoices.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-primary-dark/10 bg-white shadow-sm" id="valuation-panel">
          <div className="flex items-center justify-between gap-3 border-b border-primary-dark/10 p-5">
            <div>
              <h2 className="text-lg font-bold text-primary-dark">Line valuations</h2>
              <p className="mt-1 text-sm text-primary-dark/56">
                Measured progress with line-level claimed and certified values.
              </p>
            </div>
            <FileSpreadsheet className="size-5 text-primary-blue" aria-hidden="true" />
          </div>
          <div className="grid gap-3 p-5">
            {valuations.length > 0 ? (
              valuations.map((valuation) => (
                <article className="rounded-lg border border-primary-dark/10 p-4" key={valuation.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary-blue">
                        {valuation.valuation_number}
                      </p>
                      <h3 className="mt-1 text-base font-bold text-primary-dark">{valuation.title}</h3>
                      <p className="mt-1 text-sm text-primary-dark/58">
                        {valuation.site ? `${valuation.site.code} - ${valuation.site.name}` : "No site"}
                      </p>
                    </div>
                    <StatusBadge className={valuationStatusClass(valuation.status)} value={valuation.status} />
                  </div>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <DetailItem label="Claimed" value={formatZmw(valuation.claimed_total)} />
                    <DetailItem label="Certified" value={formatZmw(valuation.certified_total)} />
                    <DetailItem label="Lines" value={String(valuation.line_count)} />
                    <DetailItem label="Date" value={formatDate(valuation.valuation_date)} />
                  </div>
                  <ValuationLineEditor
                    actorId={auth.profile.id}
                    role={auth.profile.role}
                    valuation={valuation}
                  />
                  <ValuationActions actorId={auth.profile.id} role={auth.profile.role} valuation={valuation} />
                  <div className="mt-4 rounded-md border border-primary-dark/10 bg-primary-dark/[0.015] p-3">
                    <OpsRecordActivityPanel
                      canManage={canCreate}
                      sourceId={valuation.id}
                      sourceTable="commercial_valuations"
                    />
                  </div>
                </article>
              ))
            ) : (
              <div className="p-6 text-center">
                <FileSpreadsheet className="mx-auto size-9 text-primary-dark/24" aria-hidden="true" />
                <h3 className="mt-3 font-bold text-primary-dark">No valuations yet</h3>
                <p className="mt-2 text-sm text-primary-dark/56">
                  Create valuations when measured progress needs line evidence before IPC certification.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-primary-dark/10 bg-white shadow-sm" id="risk-panel">
          <div className="flex items-center justify-between gap-3 border-b border-primary-dark/10 p-5">
            <div>
              <h2 className="text-lg font-bold text-primary-dark">Commercial risks</h2>
              <p className="mt-1 text-sm text-primary-dark/56">
                Track cost, payment, scope, and contract risks before they hit margin.
              </p>
            </div>
            <AlertTriangle className="size-5 text-primary-blue" aria-hidden="true" />
          </div>
          <div className="grid gap-3 p-5">
            {risks.length > 0 ? (
              risks.map((risk) => (
                <article className="rounded-lg border border-primary-dark/10 p-4" key={risk.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary-blue">
                        {risk.risk_number}
                      </p>
                      <h3 className="mt-1 text-base font-bold text-primary-dark">{risk.title}</h3>
                      <p className="mt-1 text-sm text-primary-dark/58">
                        {risk.site ? `${risk.site.code} - ${risk.site.name}` : "No site"}
                      </p>
                    </div>
                    <StatusBadge className={riskStatusClass(risk.status, risk.severity)} value={risk.status} />
                  </div>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <DetailItem label="Severity" value={formatLabel(risk.severity)} />
                    <DetailItem label="Impact" value={formatZmw(risk.impact_amount)} />
                    <DetailItem label="Category" value={formatLabel(risk.category)} />
                    <DetailItem label="Due" value={formatDate(risk.due_date)} />
                  </div>
                  {risk.description || risk.mitigation_plan ? (
                    <p className="mt-4 text-sm leading-6 text-primary-dark/62">
                      {[risk.description, risk.mitigation_plan].filter(Boolean).join(" ")}
                    </p>
                  ) : null}
                  <RiskActions actorId={auth.profile.id} risk={risk} role={auth.profile.role} />
                  <div className="mt-4 rounded-md border border-primary-dark/10 bg-primary-dark/[0.015] p-3">
                    <OpsRecordActivityPanel
                      canManage={canCreate}
                      sourceId={risk.id}
                      sourceTable="commercial_risks"
                    />
                  </div>
                </article>
              ))
            ) : (
              <div className="p-6 text-center">
                <AlertTriangle className="mx-auto size-9 text-primary-dark/24" aria-hidden="true" />
                <h3 className="mt-3 font-bold text-primary-dark">No commercial risks yet</h3>
                <p className="mt-2 text-sm text-primary-dark/56">
                  Add risks when cost, payment, scope, or contract exposure needs management.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <div className="rounded-lg border border-primary-dark/10 bg-white shadow-sm" id="retention-panel">
          <div className="flex items-center justify-between gap-3 border-b border-primary-dark/10 p-5">
            <div>
              <h2 className="text-lg font-bold text-primary-dark">Retention releases</h2>
              <p className="mt-1 text-sm text-primary-dark/56">
                Track retention due, approved, and released back to contract cashflow.
              </p>
            </div>
            <Banknote className="size-5 text-primary-blue" aria-hidden="true" />
          </div>
          <div className="grid gap-3 p-5">
            {retentionReleases.length > 0 ? (
              retentionReleases.map((release) => (
                <article className="rounded-lg border border-primary-dark/10 p-4" key={release.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary-blue">
                        {release.release_number}
                      </p>
                      <h3 className="mt-1 text-base font-bold text-primary-dark">{release.title}</h3>
                      <p className="mt-1 text-sm text-primary-dark/58">
                        {release.contract
                          ? `${release.contract.contract_number} - ${release.contract.title}`
                          : "No contract"}
                      </p>
                    </div>
                    <StatusBadge className={retentionStatusClass(release.status)} value={release.status} />
                  </div>
                  <div className="mt-4 grid gap-4 min-[520px]:grid-cols-2">
                    <DetailItem label="Claimed" value={formatZmw(release.claimed_amount)} />
                    <DetailItem label="Approved" value={formatZmw(release.approved_amount)} />
                    <DetailItem label="Released" value={formatZmw(release.released_amount)} />
                    <DetailItem label="Due" value={formatDate(release.due_date)} />
                  </div>
                  <RetentionReleaseActions actorId={auth.profile.id} release={release} role={auth.profile.role} />
                  <div className="mt-4 rounded-md border border-primary-dark/10 bg-primary-dark/[0.015] p-3">
                    <OpsRecordActivityPanel
                      canManage={canCreate}
                      sourceId={release.id}
                      sourceTable="commercial_retention_releases"
                    />
                  </div>
                </article>
              ))
            ) : (
              <div className="p-6 text-center">
                <Banknote className="mx-auto size-9 text-primary-dark/24" aria-hidden="true" />
                <h3 className="mt-3 font-bold text-primary-dark">No retention releases yet</h3>
                <p className="mt-2 text-sm text-primary-dark/56">
                  Create a release when retention becomes recoverable under a contract.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-primary-dark/10 bg-white shadow-sm" id="cashflow-panel">
          <div className="flex items-center justify-between gap-3 border-b border-primary-dark/10 p-5">
            <div>
              <h2 className="text-lg font-bold text-primary-dark">Cashflow forecasts</h2>
              <p className="mt-1 text-sm text-primary-dark/56">
                Forecast revenue, retention release, and cost movement by period.
              </p>
            </div>
            <TrendingUp className="size-5 text-primary-blue" aria-hidden="true" />
          </div>
          <div className="grid gap-3 p-5">
            {cashflowForecasts.length > 0 ? (
              cashflowForecasts.map((forecast) => (
                <article className="rounded-lg border border-primary-dark/10 p-4" key={forecast.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary-blue">
                        {forecast.forecast_number}
                      </p>
                      <h3 className="mt-1 text-base font-bold text-primary-dark">{forecast.title}</h3>
                      <p className="mt-1 text-sm text-primary-dark/58">
                        {formatDate(forecast.period_start)} to {formatDate(forecast.period_end)}
                      </p>
                    </div>
                    <StatusBadge className={cashflowStatusClass(forecast.status)} value={forecast.status} />
                  </div>
                  <div className="mt-4 grid gap-4 min-[520px]:grid-cols-2">
                    <DetailItem label="Forecast revenue" value={formatZmw(forecast.forecast_revenue)} />
                    <DetailItem label="Forecast cost" value={formatZmw(forecast.forecast_cost)} />
                    <DetailItem label="Retention" value={formatZmw(forecast.forecast_retention_release)} />
                    <DetailItem label="Net cash" value={formatZmw(forecast.forecast_net_cash)} />
                  </div>
                  <CashflowForecastActions actorId={auth.profile.id} forecast={forecast} role={auth.profile.role} />
                  <div className="mt-4 rounded-md border border-primary-dark/10 bg-primary-dark/[0.015] p-3">
                    <OpsRecordActivityPanel
                      canManage={canCreate}
                      sourceId={forecast.id}
                      sourceTable="commercial_cashflow_forecasts"
                    />
                  </div>
                </article>
              ))
            ) : (
              <div className="p-6 text-center">
                <TrendingUp className="mx-auto size-9 text-primary-dark/24" aria-hidden="true" />
                <h3 className="mt-3 font-bold text-primary-dark">No cashflow forecasts yet</h3>
                <p className="mt-2 text-sm text-primary-dark/56">
                  Add forecast periods to expose near-term cash pressure.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-primary-dark/10 bg-white shadow-sm" id="milestone-panel">
          <div className="flex items-center justify-between gap-3 border-b border-primary-dark/10 p-5">
            <div>
              <h2 className="text-lg font-bold text-primary-dark">Contract milestones</h2>
              <p className="mt-1 text-sm text-primary-dark/56">
                Forecast delivery gates that can trigger billing or retention release.
              </p>
            </div>
            <Flag className="size-5 text-primary-blue" aria-hidden="true" />
          </div>
          <div className="grid gap-3 p-5">
            {milestones.length > 0 ? (
              milestones.map((milestone) => (
                <article className="rounded-lg border border-primary-dark/10 p-4" key={milestone.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary-blue">
                        {milestone.milestone_number}
                      </p>
                      <h3 className="mt-1 text-base font-bold text-primary-dark">{milestone.title}</h3>
                      <p className="mt-1 text-sm text-primary-dark/58">
                        {milestone.contract
                          ? `${milestone.contract.contract_number} - ${milestone.contract.title}`
                          : "No contract"}
                      </p>
                    </div>
                    <StatusBadge className={milestoneStatusClass(milestone.status)} value={milestone.status} />
                  </div>
                  <div className="mt-4 grid gap-4 min-[520px]:grid-cols-2">
                    <DetailItem label="Target" value={formatZmw(milestone.target_amount)} />
                    <DetailItem label="Achieved" value={formatZmw(milestone.achieved_amount)} />
                    <DetailItem label="Forecast" value={formatDate(milestone.forecast_date ?? milestone.due_date)} />
                    <DetailItem label="Billing weight" value={`${milestone.billing_weight_percent}%`} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {milestone.invoice_trigger ? (
                      <StatusBadge className="border-primary-blue/20 bg-primary-blue/5 text-primary-blue" value="Invoice trigger" />
                    ) : null}
                    {milestone.retention_trigger ? (
                      <StatusBadge className="border-orange-200 bg-orange-50 text-orange-700" value="Retention trigger" />
                    ) : null}
                  </div>
                  <MilestoneActions actorId={auth.profile.id} milestone={milestone} role={auth.profile.role} />
                  <div className="mt-4 rounded-md border border-primary-dark/10 bg-primary-dark/[0.015] p-3">
                    <OpsRecordActivityPanel
                      canManage={canCreate}
                      sourceId={milestone.id}
                      sourceTable="commercial_contract_milestones"
                    />
                  </div>
                </article>
              ))
            ) : (
              <div className="p-6 text-center">
                <Flag className="mx-auto size-9 text-primary-dark/24" aria-hidden="true" />
                <h3 className="mt-3 font-bold text-primary-dark">No milestones yet</h3>
                <p className="mt-2 text-sm text-primary-dark/56">
                  Add contract milestones to forecast delivery, billing, and retention events.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-primary-dark/10 bg-white shadow-sm" id="ipc-register">
        <div className="flex flex-col gap-3 border-b border-primary-dark/10 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-bold text-primary-dark">IPC register</h2>
            <p className="mt-1 text-sm text-primary-dark/56">
              Track valuations from draft claim to certification, invoicing, and payment.
            </p>
          </div>
          <StatusBadge className="border-primary-dark/10 bg-primary-dark/[0.03] text-primary-dark/58" value={`${ipcs.pagination.total} records`} />
        </div>
        <OpsListControls
          action="/ops/commercial"
          filters={[
            {
              label: "Status",
              name: "status",
              options: IPC_STATUS_OPTIONS,
              value: status,
            },
          ]}
          placeholder="Search by IPC number, title, reference, or description"
          query={listState.query}
          resultLabel="IPCs"
        />
        <div className={OPS_TABLE_SCROLL_CLASS} tabIndex={0}>
          <div className="min-w-[960px] divide-y divide-primary-dark/10">
            {ipcs.items.length > 0 ? (
              ipcs.items.map((ipc) => (
                <article className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(18rem,0.8fr)]" key={ipc.id}>
                  <div>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary-blue">
                          {ipc.ipc_number}
                        </p>
                        <h3 className="mt-1 text-lg font-bold text-primary-dark">{ipc.title}</h3>
                        <p className="mt-1 text-sm text-primary-dark/58">
                          {ipc.site ? `${ipc.site.code} - ${ipc.site.name}` : "No site"}
                        </p>
                      </div>
                      <StatusBadge className={ipcStatusClass(ipc.status)} value={ipc.status} />
                    </div>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                      <DetailItem label="Valuation date" value={formatDate(ipc.valuation_date)} />
                      <DetailItem label="Claimed" value={formatZmw(ipc.claimed_amount)} />
                      <DetailItem label="Certified" value={formatZmw(ipc.certified_amount)} />
                      <DetailItem label="Total certified" value={formatZmw(ipc.total_certified_amount)} />
                    </div>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                      <DetailItem label="BOQ" value={ipc.boq?.title ?? "No BOQ"} />
                      <DetailItem label="Contract" value={ipc.contract?.contract_number ?? "No contract"} />
                      <DetailItem label="Valuation" value={ipc.valuation?.valuation_number ?? "No valuation"} />
                      <DetailItem label="Invoice" value={ipc.invoice?.invoice_number ?? "Not linked"} />
                    </div>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                      <DetailItem label="Period" value={`${formatDate(ipc.period_start)} - ${formatDate(ipc.period_end)}`} />
                      <DetailItem label="Client ref" value={ipc.client_reference || "None"} />
                    </div>
                    {ipc.description ? (
                      <p className="mt-4 text-sm leading-6 text-primary-dark/62">{ipc.description}</p>
                    ) : null}
                    <IpcActions actorId={auth.profile.id} ipc={ipc} role={auth.profile.role} />
                  </div>
                  <div className="rounded-md border border-primary-dark/10 bg-primary-dark/[0.015] p-3">
                    <OpsRecordActivityPanel
                      canManage={canCreate}
                      sourceId={ipc.id}
                      sourceTable="commercial_ipcs"
                    />
                  </div>
                </article>
              ))
            ) : (
              <div className="p-8 text-center">
                <FileCheck2 className="mx-auto size-10 text-primary-dark/24" aria-hidden="true" />
                <h3 className="mt-3 text-lg font-bold text-primary-dark">
                  {hasActiveListFilter ? "No matching IPCs" : "No IPCs yet"}
                </h3>
                <p className="mt-2 text-sm text-primary-dark/56">
                  {hasActiveListFilter
                    ? "Adjust the search or status filter to widen the IPC register."
                    : "Create the first IPC when a valuation is ready to be controlled."}
                </p>
              </div>
            )}
          </div>
        </div>
        <OpsPaginationControls
          basePath="/ops/commercial"
          filters={[
            {
              label: "Status",
              name: "status",
              options: IPC_STATUS_OPTIONS,
              value: status,
            },
          ]}
          pagination={ipcs.pagination}
          query={listState.query}
          resultLabel="IPCs"
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-lg border border-primary-dark/10 bg-white shadow-sm" id="variation-panel">
          <div className="flex items-center justify-between gap-3 border-b border-primary-dark/10 p-5">
            <div>
              <h2 className="text-lg font-bold text-primary-dark">Variation register</h2>
              <p className="mt-1 text-sm text-primary-dark/56">
                Commercial change control with pricing and approval status.
              </p>
            </div>
            <Gavel className="size-5 text-primary-blue" aria-hidden="true" />
          </div>
          <div className="grid gap-3 p-5">
            {variations.length > 0 ? (
              variations.map((variation) => (
                <article className="rounded-lg border border-primary-dark/10 p-4" key={variation.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary-blue">
                        {variation.variation_number}
                      </p>
                      <h3 className="mt-1 text-base font-bold text-primary-dark">{variation.title}</h3>
                      <p className="mt-1 text-sm text-primary-dark/58">
                        {variation.site ? `${variation.site.code} - ${variation.site.name}` : "No site"}
                      </p>
                    </div>
                    <StatusBadge className={variationStatusClass(variation.status)} value={variation.status} />
                  </div>
                  <div className="mt-4 grid gap-4 sm:grid-cols-3">
                    <DetailItem label="Submitted" value={formatZmw(variation.submitted_amount)} />
                    <DetailItem label="Approved" value={formatZmw(variation.approved_amount)} />
                    <DetailItem label="Instruction" value={variation.instruction_reference || "None"} />
                  </div>
                  {variation.description || variation.reason ? (
                    <p className="mt-4 text-sm leading-6 text-primary-dark/62">
                      {[variation.description, variation.reason].filter(Boolean).join(" ")}
                    </p>
                  ) : null}
                  <VariationActions actorId={auth.profile.id} role={auth.profile.role} variation={variation} />
                  <div className="mt-4 rounded-md border border-primary-dark/10 bg-primary-dark/[0.015] p-3">
                    <OpsRecordActivityPanel
                      canManage={canCreate}
                      sourceId={variation.id}
                      sourceTable="commercial_variations"
                    />
                  </div>
                </article>
              ))
            ) : (
              <div className="p-6 text-center">
                <Gavel className="mx-auto size-9 text-primary-dark/24" aria-hidden="true" />
                <h3 className="mt-3 font-bold text-primary-dark">No variations yet</h3>
                <p className="mt-2 text-sm text-primary-dark/56">
                  Create variations when instructed changes need pricing and approval control.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-primary-dark/10 bg-white shadow-sm" id="claim-panel">
          <div className="flex items-center justify-between gap-3 border-b border-primary-dark/10 p-5">
            <div>
              <h2 className="text-lg font-bold text-primary-dark">Claims register</h2>
              <p className="mt-1 text-sm text-primary-dark/56">
                Track EOT, loss/expense, disruption, and disputed variation exposure.
              </p>
            </div>
            <Scale className="size-5 text-primary-blue" aria-hidden="true" />
          </div>
          <div className="grid gap-3 p-5">
            {claims.length > 0 ? (
              claims.map((claim) => (
                <article className="rounded-lg border border-primary-dark/10 p-4" key={claim.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary-blue">
                        {claim.claim_number}
                      </p>
                      <h3 className="mt-1 text-base font-bold text-primary-dark">{claim.title}</h3>
                      <p className="mt-1 text-sm text-primary-dark/58">
                        {claim.site ? `${claim.site.code} - ${claim.site.name}` : "No site"}
                      </p>
                    </div>
                    <StatusBadge className={claimStatusClass(claim.status)} value={claim.status} />
                  </div>
                  <div className="mt-4 grid gap-4 sm:grid-cols-3">
                    <DetailItem label="Type" value={formatLabel(claim.claim_type)} />
                    <DetailItem label="Claimed" value={formatZmw(claim.claimed_amount)} />
                    <DetailItem label="Agreed" value={formatZmw(claim.agreed_amount)} />
                  </div>
                  <div className="mt-3 grid gap-4 sm:grid-cols-3">
                    <DetailItem label="Event" value={formatDate(claim.event_date)} />
                    <DetailItem label="Due" value={formatDate(claim.due_date)} />
                    <DetailItem label="Variation" value={claim.variation?.variation_number ?? "None"} />
                  </div>
                  {claim.description ? (
                    <p className="mt-4 text-sm leading-6 text-primary-dark/62">{claim.description}</p>
                  ) : null}
                  <ClaimActions actorId={auth.profile.id} claim={claim} role={auth.profile.role} />
                  <div className="mt-4 rounded-md border border-primary-dark/10 bg-primary-dark/[0.015] p-3">
                    <OpsRecordActivityPanel
                      canManage={canCreate}
                      sourceId={claim.id}
                      sourceTable="commercial_claims"
                    />
                  </div>
                </article>
              ))
            ) : (
              <div className="p-6 text-center">
                <Scale className="mx-auto size-9 text-primary-dark/24" aria-hidden="true" />
                <h3 className="mt-3 font-bold text-primary-dark">No claims yet</h3>
                <p className="mt-2 text-sm text-primary-dark/56">
                  Create claims when commercial entitlement needs formal tracking.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-primary-dark/10 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-4">
          <DetailItem label="IPC" value="Draft -> submitted -> certified" />
          <DetailItem label="Contract" value="Draft -> active -> completed" />
          <DetailItem label="Valuation" value="Draft -> submitted -> certified" />
          <DetailItem label="Variation" value="Submitted -> priced -> approved" />
          <DetailItem label="Claim" value="Submitted -> review -> agreed" />
          <DetailItem label="Invoice" value="Certified IPC can create draft invoice" />
        </div>
        <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-primary-dark/52">
          <ClipboardCheck className="size-4" aria-hidden="true" />
          <span>Invoice generation is deliberate: a certified IPC creates a draft invoice, then Finance sends and receives payment.</span>
        </div>
      </section>
    </div>
  );
}
