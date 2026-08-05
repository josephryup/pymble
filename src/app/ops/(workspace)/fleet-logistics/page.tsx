import {
  BedDouble,
  Bus,
  CalendarDays,
  CheckCircle2,
  Clock,
  DollarSign,
  FileWarning,
  Gauge,
  HardHat,
  Plus,
  Route,
  ShieldCheck,
  Users,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OPS_CHART_COLORS, OpsTrendChart } from "@/components/ops/OpsAnalyticsCharts";
import { OpsConfirmSubmitButton } from "@/components/ops/OpsConfirmSubmitButton";
import { OpsDashboardPanel } from "@/components/ops/OpsDashboardPanel";
import { OpsEmptyState } from "@/components/ops/OpsEmptyState";
import { OpsInlineEmpty } from "@/components/ops/OpsInlineEmpty";
import { OpsKpiCard } from "@/components/ops/OpsKpiCard";
import { OpsListControls, OpsPaginationControls } from "@/components/ops/OpsListControls";
import { OpsRecordActivityPanel } from "@/components/ops/OpsRecordActivityPanel";
import { fetchOpsModuleAccessOverrides } from "@/lib/ops/module-access";
import { requireOpsUser } from "@/lib/ops/auth";
import {
  approveTransportRequestAction,
  cancelAccommodationBookingAction,
  cancelLabourAllocationAction,
  cancelTransportRequestAction,
  checkInAccommodationBookingAction,
  completeAccommodationBookingAction,
  completeLabourAllocationAction,
  completeTransportRequestAction,
  confirmAccommodationBookingAction,
  createFleetOperatorDocumentAction,
  createAccommodationBookingAction,
  createLabourAllocationAction,
  createTransportRequestAction,
  rejectTransportRequestAction,
  scheduleTransportRequestAction,
  startLabourAllocationAction,
  submitTransportRequestAction,
} from "@/lib/ops/fleet-logistics-actions";
import {
  canApproveOpsTransportRequest,
  canCancelOpsAccommodationBooking,
  canCancelOpsLabourAllocation,
  canCancelOpsTransportRequest,
  canCheckInOpsAccommodationBooking,
  canCompleteOpsAccommodationBooking,
  canCompleteOpsLabourAllocation,
  canCompleteOpsTransportRequest,
  canConfirmOpsAccommodationBooking,
  canCreateOpsAccommodationBooking,
  canCreateOpsLabourAllocation,
  canCreateOpsTransportRequest,
  canManageOpsFleetOperatorDocuments,
  canRejectOpsTransportRequest,
  canScheduleOpsTransportRequest,
  canStartOpsLabourAllocation,
  canSubmitOpsTransportRequest,
} from "@/lib/ops/fleet-logistics-permissions";
import {
  fetchFleetDispatchEquipmentOptions,
  fetchFleetLogisticsEmployeeOptions,
  fetchFleetLogisticsWorkerOptions,
  fetchOpsFleetDispatchReport,
  fetchOpsFleetMobilizationDashboard,
  fetchOpsFleetLogisticsStats,
  fetchOpsFleetWeeklyActivity,
  fetchOpsFleetOperatorComplianceReport,
  fetchOpsFleetProfitabilityReport,
  fetchPaginatedOpsTransportRequests,
  fetchRecentAccommodationBookings,
  fetchRecentLabourAllocations,
  type OpsAccommodationBookingSummary,
  type OpsFleetEmployeeOption,
  type OpsFleetEquipmentOption,
  type OpsFleetMobilizationDashboard,
  type OpsFleetOperatorDocumentType,
  type OpsFleetPlanningBucket,
  type OpsFleetWorkerOption,
  type OpsLabourAllocationSummary,
  type OpsTransportRequestSummary,
} from "@/lib/ops/fleet-logistics";
import type {
  OpsFleetDispatchReport,
  OpsFleetOperatorComplianceReport,
  OpsFleetOperatorDocumentRow,
  OpsFleetProfitabilityReport,
  OpsFleetProfitabilityRow,
} from "@/lib/ops/fleet-logistics-reporting";
import { parseOpsListState } from "@/lib/ops/listing";
import { canAccessOpsHref } from "@/lib/ops/permissions";
import { fetchActiveSiteOptions } from "@/lib/ops/sites";
import type {
  OpsPriority,
  OpsTransportRequestStatus,
  OpsTransportRequestType,
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
  opsStatusBadgeClass,
  type OpsStatusTone,
} from "@/lib/ops/ui";
import { todayInLusaka, formatOpsLabel as formatLabel, formatOpsDate as formatDate, formatOpsDateTime } from "@/lib/ops/format";

const formatDateTime = (value: string | null | undefined) => formatOpsDateTime(value, "Not scheduled");

type PageProps = {
  searchParams?: Promise<OpsSearchParams>;
};

const TRANSPORT_STATUS_OPTIONS: Array<{
  label: string;
  value: OpsTransportRequestStatus | "";
}> = [
  { label: "All statuses", value: "" },
  { label: "Draft", value: "draft" },
  { label: "Submitted", value: "submitted" },
  { label: "Approved", value: "approved" },
  { label: "Scheduled", value: "scheduled" },
  { label: "Completed", value: "completed" },
  { label: "Rejected", value: "rejected" },
  { label: "Cancelled", value: "cancelled" },
];

const TRANSPORT_TYPE_OPTIONS: Array<{
  label: string;
  value: OpsTransportRequestType;
}> = [
  { label: "Staff transport", value: "staff_transport" },
  { label: "Material delivery", value: "material_delivery" },
  { label: "Equipment move", value: "equipment_move" },
  { label: "Site visit", value: "site_visit" },
  { label: "Client visit", value: "client_visit" },
  { label: "Other", value: "other" },
];

const PRIORITY_OPTIONS: Array<{ label: string; value: OpsPriority }> = [
  { label: "Low", value: "low" },
  { label: "Normal", value: "normal" },
  { label: "High", value: "high" },
  { label: "Urgent", value: "urgent" },
];

const OPERATOR_DOCUMENT_TYPE_OPTIONS: Array<{
  label: string;
  value: OpsFleetOperatorDocumentType;
}> = [
  { label: "Driver license", value: "driver_license" },
  { label: "Operator permit", value: "operator_permit" },
  { label: "Defensive driving", value: "defensive_driving" },
  { label: "Medical certificate", value: "medical_certificate" },
  { label: "Equipment authorization", value: "equipment_authorization" },
  { label: "Other", value: "other" },
];

function statusFromParam(value: string | undefined) {
  return TRANSPORT_STATUS_OPTIONS.some((status) => status.value === value)
    ? (value as OpsTransportRequestStatus | "")
    : "";
}

function fleetLogisticsNotice(params: OpsSearchParams) {
  const created = noticeFromParams(params, "transport_request", "Transport request created.");

  if (created) {
    return created;
  }

  const createdValue = firstParam(params.created);
  const updatedValue = firstParam(params.updated);
  const messages: Record<string, string> = {
    accommodation_booking: "Accommodation booking created.",
    accommodation_cancelled: "Accommodation booking cancelled.",
    accommodation_checked_in: "Accommodation booking checked in.",
    accommodation_completed: "Accommodation booking completed.",
    accommodation_confirmed: "Accommodation booking confirmed.",
    attachment: "Fleet logistics attachment uploaded.",
    comment: "Fleet logistics comment added.",
    labour_allocation: "Labour allocation created.",
    labour_cancelled: "Labour allocation cancelled.",
    labour_completed: "Labour allocation completed.",
    labour_started: "Labour allocation started.",
    operator_document: "Driver or operator document recorded.",
    transport_approved: "Transport request approved.",
    transport_cancelled: "Transport request cancelled.",
    transport_completed: "Transport request completed.",
    transport_rejected: "Transport request rejected.",
    transport_scheduled: "Transport request scheduled.",
    transport_submitted: "Transport request submitted.",
  };
  const key = createdValue ?? updatedValue ?? "";

  return key && messages[key]
    ? {
        message: messages[key],
        tone: "success" as const,
      }
    : null;
}

function formatDateTimeInputValue(value: string | null, fallbackDate: string) {
  if (value) {
    return value.slice(0, 16);
  }

  return `${fallbackDate.slice(0, 10)}T08:00`;
}

function formatSignedPercent(value: number | null) {
  if (value === null) {
    return "No baseline";
  }

  return `${value >= 0 ? "+" : ""}${value.toLocaleString("en-ZM", {
    maximumFractionDigits: 1,
  })}%`;
}

function formatSignedZmw(value: number) {
  const sign = value >= 0 ? "+" : "-";
  return `${sign}${formatZmw(Math.abs(value))}`;
}

function formatEquipmentLabel(equipment: OpsFleetEquipmentOption | null) {
  if (!equipment) {
    return "Unassigned";
  }

  return [
    `${equipment.equipment_code} - ${equipment.name}`,
    equipment.registration_number ? `(${equipment.registration_number})` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function formatOperatorLabel(request: OpsTransportRequestSummary) {
  if (request.assigned_operator_employee) {
    return `${request.assigned_operator_employee.employee_number} - ${request.assigned_operator_employee.full_name}`;
  }

  if (request.assigned_operator_worker) {
    return `${request.assigned_operator_worker.worker_code} - ${request.assigned_operator_worker.full_name}`;
  }

  return "Unassigned";
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

function planningBucketLabel(bucket: OpsFleetPlanningBucket) {
  const labels: Record<OpsFleetPlanningBucket, string> = {
    due_today: "Due today",
    next_7_days: "Next 7 days",
    overdue: "Overdue",
    scheduled: "Scheduled",
    upcoming: "Upcoming",
  };

  return labels[bucket];
}

function operatorExpiryLabel(row: OpsFleetOperatorDocumentRow) {
  if (row.bucket === "archived") {
    return "Archived";
  }

  if (row.bucket === "no_expiry") {
    return "No expiry";
  }

  if (row.days_until_expiry === null) {
    return formatLabel(row.bucket);
  }

  if (row.days_until_expiry < 0) {
    return `${Math.abs(row.days_until_expiry)} days overdue`;
  }

  if (row.days_until_expiry === 0) {
    return "Expires today";
  }

  return `${row.days_until_expiry} days`;
}

function FleetProfitabilityRowList({
  emptyLabel,
  rows,
}: {
  emptyLabel: string;
  rows: OpsFleetProfitabilityRow[];
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-md border border-border px-3 py-3 text-sm text-muted-foreground">
        {emptyLabel}
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border rounded-md border border-border">
      {rows.map((row) => (
        <li className="px-3 py-3" key={row.id}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-bold text-foreground">{row.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">{row.reference}</p>
            </div>
            <div className="text-left min-[640px]:text-right">
              <p
                className={`font-bold ${
                  row.contribution_amount < 0 ? "text-orange-700" : "text-emerald-700"
                }`}
              >
                {formatSignedZmw(row.contribution_amount)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatSignedPercent(row.contribution_percent)}
              </p>
            </div>
          </div>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            <DetailItem label="Recovery" value={formatZmw(row.recovery_amount)} />
            <DetailItem label="Operating cost" value={formatZmw(row.operating_cost)} />
          </dl>
        </li>
      ))}
    </ul>
  );
}

function FleetDispatchCalendarPanel({
  report,
}: {
  report: OpsFleetDispatchReport;
}) {
  const hasDispatch = report.days.some((day) => day.transports > 0);

  return (
    <OpsDashboardPanel eyebrow="Dispatch calendar" title="14-day transport plan">
      <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DetailItem label="Planned trips" value={String(report.totals.transportCount)} />
        <DetailItem label="Assigned" value={String(report.totals.assignedTransports)} />
        <DetailItem label="Unassigned" value={String(report.totals.unassignedTransports)} />
        <DetailItem label="High priority" value={String(report.totals.urgentTransports)} />
      </dl>

      <div className="mt-4">
        {hasDispatch ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {report.days.map((day) => (
              <article
                className={`rounded-md border px-3 py-3 ${
                  day.transports > 0
                    ? "border-primary-blue/20 bg-primary-blue/[0.04]"
                    : "border-border bg-muted/40"
                }`}
                key={day.date}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-foreground">{day.label}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{formatDate(day.date)}</p>
                  </div>
                  <StatusBadge
                    tone={day.unassigned_transports > 0 ? "attention" : "neutral"}
                    value={`${day.transports} trips`}
                  />
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-3">
                  <DetailItem label="Assigned" value={String(day.assigned_transports)} />
                  <DetailItem label="Passengers" value={String(day.passenger_count)} />
                  <DetailItem label="Unassigned" value={String(day.unassigned_transports)} />
                  <DetailItem label="Estimate" value={formatZmw(day.estimated_cost)} />
                </dl>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-md border border-border px-3 py-4 text-center">
            <CalendarDays className="mx-auto size-9 text-muted-foreground" aria-hidden="true" />
            <p className="mt-2 text-sm font-semibold text-muted-foreground">
              No approved or scheduled transport in the next 14 days.
            </p>
          </div>
        )}
      </div>
    </OpsDashboardPanel>
  );
}

function FleetUsageVariancePanel({
  report,
}: {
  report: OpsFleetDispatchReport;
}) {
  return (
    <OpsDashboardPanel eyebrow="Usage variance" title="Transport cost performance">
      <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DetailItem label="Estimated" value={formatZmw(report.variance.estimatedCost)} />
        <DetailItem label="Actual" value={formatZmw(report.variance.actualCost)} />
        <DetailItem label="Variance" value={formatSignedZmw(report.variance.varianceAmount)} />
        <DetailItem label="Variance %" value={formatSignedPercent(report.variance.variancePercent)} />
      </dl>

      <div className="mt-4">
        {report.variance.rows.length > 0 ? (
          <ul className="divide-y divide-border rounded-md border border-border">
            {report.variance.rows.map((row) => (
              <li className="px-3 py-3" key={row.request_number}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-foreground">{row.request_number}</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">{row.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {row.route} / {formatDate(row.scheduled_date)}
                    </p>
                  </div>
                  <div className="text-left min-[640px]:text-right">
                    <p
                      className={`font-bold ${
                        row.variance_amount > 0 ? "text-orange-700" : "text-emerald-700"
                      }`}
                    >
                      {formatSignedZmw(row.variance_amount)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatSignedPercent(row.variance_percent)}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-md border border-border px-3 py-4 text-center">
            <Gauge className="mx-auto size-9 text-muted-foreground" aria-hidden="true" />
            <p className="mt-2 text-sm font-semibold text-muted-foreground">
              No completed transport costs are available for variance reporting.
            </p>
          </div>
        )}
      </div>
    </OpsDashboardPanel>
  );
}

function FleetTripPlanningPanel({
  dashboard,
}: {
  dashboard: OpsFleetMobilizationDashboard;
}) {
  return (
    <OpsDashboardPanel eyebrow="Trip planning" title="Transport attention">
      <dl className="grid gap-3 sm:grid-cols-3">
        <DetailItem label="Overdue" value={String(dashboard.overdueTrips)} />
        <DetailItem label="Due this week" value={String(dashboard.dueThisWeekTrips)} />
        <DetailItem label="Scheduled" value={String(dashboard.scheduledTrips)} />
      </dl>

      <div className="mt-4">
        {dashboard.tripRows.length === 0 ? (
          <OpsInlineEmpty>
            No submitted, approved, or scheduled transport requests need planning.
          </OpsInlineEmpty>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {dashboard.tripRows.map((trip) => (
              <li className="px-3 py-3" key={trip.request_number}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-foreground">{trip.request_number}</p>
                      <StatusBadge value={planningBucketLabel(trip.bucket)} />
                    </div>
                    <p className="mt-1 text-sm font-semibold text-foreground">{trip.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {trip.site_code} - {trip.site_name} / {formatLabel(trip.request_type)}
                    </p>
                  </div>
                  <div className="text-left min-[640px]:text-right">
                    <p className="font-bold text-foreground">{formatDate(trip.requested_for)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {trip.origin || "Origin"}{" -> "}{trip.destination || "Destination"}
                    </p>
                  </div>
                </div>
                <dl className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  <DetailItem label="Passengers" value={String(trip.passenger_count)} />
                  <DetailItem label="Priority" value={formatLabel(trip.priority)} />
                  <DetailItem label="Estimate" value={formatZmw(trip.estimated_cost)} />
                  <DetailItem label="Vehicle" value={trip.assigned_equipment_code} />
                  <DetailItem label="Operator" value={trip.assigned_operator_name} />
                </dl>
              </li>
            ))}
          </ul>
        )}
      </div>
    </OpsDashboardPanel>
  );
}

function FleetMobilizationPanel({
  dashboard,
}: {
  dashboard: OpsFleetMobilizationDashboard;
}) {
  return (
    <OpsDashboardPanel eyebrow="Mobilization planning" title="Site movement load">
      <dl className="grid gap-3 sm:grid-cols-2">
        <DetailItem label="Active stays" value={String(dashboard.activeStays)} />
        <DetailItem label="Active labour" value={String(dashboard.activeLabour)} />
      </dl>

      <div className="mt-4">
        {dashboard.mobilizationRows.length === 0 ? (
          <OpsInlineEmpty>
            No active movement, accommodation, or labour demand is currently grouped by site.
          </OpsInlineEmpty>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {dashboard.mobilizationRows.map((site) => (
              <li className="px-3 py-3" key={site.site_id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-foreground">
                      {site.site_code} - {site.site_name}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Next movement {formatDate(site.next_mobilization_date)}
                    </p>
                  </div>
                  <p className="font-bold text-foreground">{formatZmw(site.estimated_cost)}</p>
                </div>
                <dl className="mt-3 grid gap-3 sm:grid-cols-4">
                  <DetailItem label="Transport" value={String(site.open_transports)} />
                  <DetailItem label="Scheduled" value={String(site.scheduled_transports)} />
                  <DetailItem label="Occupants" value={String(site.occupants)} />
                  <DetailItem
                    label="Labour days"
                    value={site.labour_days.toLocaleString("en-ZM", {
                      maximumFractionDigits: 1,
                    })}
                  />
                </dl>
              </li>
            ))}
          </ul>
        )}
      </div>
    </OpsDashboardPanel>
  );
}

function FleetOperatorCompliancePanel({
  report,
}: {
  report: OpsFleetOperatorComplianceReport;
}) {
  const attentionCount = report.expiredDocuments + report.dueSoonDocuments + report.noExpiryDocuments;

  return (
    <div id="operator-compliance-panel">
      <OpsDashboardPanel eyebrow="Operator compliance" title="Driver document watch">
      <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DetailItem label="Expired" value={String(report.expiredDocuments)} />
        <DetailItem label="Due soon" value={String(report.dueSoonDocuments)} />
        <DetailItem label="No expiry" value={String(report.noExpiryDocuments)} />
        <DetailItem label="Active docs" value={String(report.activeDocuments)} />
      </dl>

      <div className="mt-4">
        {report.rows.length > 0 ? (
          <ul className="divide-y divide-border rounded-md border border-border">
            {report.rows.map((row) => (
              <li className="px-3 py-3" key={row.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-foreground">
                      {row.operator_reference} - {row.operator_name}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-foreground">{row.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatLabel(row.document_type)} / {row.reference_number || "No reference"}
                    </p>
                  </div>
                  <StatusBadge value={operatorExpiryLabel(row)} />
                </div>
                <dl className="mt-3 grid gap-3 sm:grid-cols-3">
                  <DetailItem label="Issued" value={formatDate(row.issued_at)} />
                  <DetailItem label="Expires" value={formatDate(row.expires_at)} />
                  <DetailItem
                    label="Operator type"
                    value={row.operator_type === "employee" ? "Employee" : "Worker"}
                  />
                </dl>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-md border border-border px-3 py-4 text-center">
            <ShieldCheck className="mx-auto size-9 text-muted-foreground" aria-hidden="true" />
            <p className="mt-2 text-sm font-semibold text-muted-foreground">
              No driver or operator compliance documents have been recorded.
            </p>
          </div>
        )}
      </div>

      {attentionCount > 0 ? (
        <p className="mt-3 rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-700">
          Review expired, due soon, or missing-expiry documents before scheduling operators.
        </p>
      ) : null}
      </OpsDashboardPanel>
    </div>
  );
}

function FleetProfitabilityPanel({
  report,
}: {
  report: OpsFleetProfitabilityReport;
}) {
  return (
    <div id="fleet-profitability-panel">
      <OpsDashboardPanel
        eyebrow="Fleet profitability"
        title={`${report.windowDays}-day recovery snapshot`}
      >
      <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DetailItem label="Recovery" value={formatZmw(report.recoveryAmount)} />
        <DetailItem label="Operating cost" value={formatZmw(report.operatingCost)} />
        <DetailItem label="Contribution" value={formatSignedZmw(report.contributionAmount)} />
        <DetailItem label="Margin" value={formatSignedPercent(report.contributionPercent)} />
      </dl>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
            Site pressure
          </p>
          <FleetProfitabilityRowList
            emptyLabel="No completed fleet recovery or operating costs are available by site."
            rows={report.siteRows}
          />
        </div>
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
            Equipment pressure
          </p>
          <FleetProfitabilityRowList
            emptyLabel="No completed fleet recovery or operating costs are available by equipment."
            rows={report.equipmentRows}
          />
        </div>
      </div>

      <p className="mt-3 text-xs font-semibold text-muted-foreground">
        Based on {report.sourceCount.toLocaleString("en-ZM")} completed transport, equipment,
        fuel, and maintenance records.
      </p>
      </OpsDashboardPanel>
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

function TransportActions({
  actorId,
  employeeOptions,
  equipmentOptions,
  request,
  role,
  workerOptions,
}: {
  actorId: string;
  employeeOptions: OpsFleetEmployeeOption[];
  equipmentOptions: OpsFleetEquipmentOption[];
  request: OpsTransportRequestSummary;
  role: OpsUserRole;
  workerOptions: OpsFleetWorkerOption[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {canSubmitOpsTransportRequest(actorId, role, request) ? (
        <InlineActionForm
          action={submitTransportRequestAction}
          buttonClass={OPS_SECONDARY_BUTTON_CLASS}
          confirmText="Submit?"
          hidden={{ request_id: request.id }}
        >
          Submit
        </InlineActionForm>
      ) : null}
      {canApproveOpsTransportRequest(role, request) ? (
        <InlineActionForm
          action={approveTransportRequestAction}
          buttonClass={OPS_SECONDARY_BUTTON_CLASS}
          confirmText="Approve?"
          hidden={{ request_id: request.id }}
        >
          Approve
        </InlineActionForm>
      ) : null}
      {canScheduleOpsTransportRequest(role, request) ? (
        <details className="w-full rounded-md border border-border p-3">
          <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">
            Schedule dispatch
          </summary>
          <form action={scheduleTransportRequestAction} className="mt-3 grid gap-3 sm:grid-cols-2">
            <input name="request_id" type="hidden" value={request.id} />
            <label className={OPS_LABEL_CLASS}>
              Scheduled time
              <input
                className={OPS_INPUT_CLASS}
                defaultValue={formatDateTimeInputValue(request.scheduled_at, request.requested_for)}
                name="scheduled_at"
                required
                type="datetime-local"
              />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Vehicle / equipment
              <select
                className={OPS_INPUT_CLASS}
                defaultValue={request.assigned_equipment_id ?? ""}
                name="assigned_equipment_id"
              >
                <option value="">No vehicle assigned</option>
                {equipmentOptions.map((equipment) => (
                  <option key={equipment.id} value={equipment.id}>
                    {formatEquipmentLabel(equipment)}
                  </option>
                ))}
              </select>
            </label>
            <label className={OPS_LABEL_CLASS}>
              Employee operator
              <select
                className={OPS_INPUT_CLASS}
                defaultValue={request.assigned_operator_employee_id ?? ""}
                name="assigned_operator_employee_id"
              >
                <option value="">No employee operator</option>
                {employeeOptions.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.employee_number} - {employee.full_name}
                  </option>
                ))}
              </select>
            </label>
            <label className={OPS_LABEL_CLASS}>
              Worker operator
              <select
                className={OPS_INPUT_CLASS}
                defaultValue={request.assigned_operator_worker_id ?? ""}
                name="assigned_operator_worker_id"
              >
                <option value="">No worker operator</option>
                {workerOptions.map((worker) => (
                  <option key={worker.id} value={worker.id}>
                    {worker.worker_code} - {worker.full_name}
                  </option>
                ))}
              </select>
            </label>
            <label className={OPS_LABEL_CLASS}>
              Dispatch reference
              <input
                className={OPS_INPUT_CLASS}
                defaultValue={request.dispatch_reference}
                name="dispatch_reference"
              />
            </label>
            <label className={`${OPS_LABEL_CLASS} sm:col-span-2`}>
              Dispatch notes
              <textarea
                className={OPS_INPUT_CLASS}
                defaultValue={request.dispatch_notes}
                name="dispatch_notes"
                rows={2}
              />
            </label>
            <button className={`${OPS_PRIMARY_BUTTON_CLASS} sm:col-span-2`} type="submit">
              Save dispatch
            </button>
          </form>
        </details>
      ) : null}
      {canCompleteOpsTransportRequest(role, request) ? (
        <details className="w-full rounded-md border border-border p-3">
          <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">
            Complete transport
          </summary>
          <form action={completeTransportRequestAction} className="mt-3 grid gap-3 sm:grid-cols-2">
            <input name="request_id" type="hidden" value={request.id} />
            <label className={OPS_LABEL_CLASS}>
              Actual cost
              <input
                className={OPS_INPUT_CLASS}
                min="0"
                name="actual_cost"
                step="0.01"
                type="number"
              />
            </label>
            <label className={`${OPS_LABEL_CLASS} sm:col-span-2`}>
              Completion notes
              <textarea className={OPS_INPUT_CLASS} name="notes" rows={2} />
            </label>
            <button className={`${OPS_PRIMARY_BUTTON_CLASS} sm:col-span-2`} type="submit">
              Complete
            </button>
          </form>
        </details>
      ) : null}
      {canRejectOpsTransportRequest(role, request) ? (
        <details className="w-full rounded-md border border-red-100 p-3">
          <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.1em] text-red-700">
            Reject request
          </summary>
          <form action={rejectTransportRequestAction} className="mt-3 grid gap-3">
            <input name="request_id" type="hidden" value={request.id} />
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
      {canCancelOpsTransportRequest(actorId, role, request) ? (
        <InlineActionForm
          action={cancelTransportRequestAction}
          buttonClass={OPS_DANGER_BUTTON_CLASS}
          confirmText="Cancel?"
          hidden={{ request_id: request.id }}
        >
          Cancel
        </InlineActionForm>
      ) : null}
    </div>
  );
}

function AccommodationActions({
  actorId,
  booking,
  role,
}: {
  actorId: string;
  booking: OpsAccommodationBookingSummary;
  role: OpsUserRole;
}) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {canConfirmOpsAccommodationBooking(role, booking) ? (
        <InlineActionForm
          action={confirmAccommodationBookingAction}
          buttonClass={OPS_SECONDARY_BUTTON_CLASS}
          confirmText="Confirm?"
          hidden={{ booking_id: booking.id }}
        >
          Confirm
        </InlineActionForm>
      ) : null}
      {canCheckInOpsAccommodationBooking(role, booking) ? (
        <InlineActionForm
          action={checkInAccommodationBookingAction}
          buttonClass={OPS_SECONDARY_BUTTON_CLASS}
          confirmText="Check in?"
          hidden={{ booking_id: booking.id }}
        >
          Check in
        </InlineActionForm>
      ) : null}
      {canCompleteOpsAccommodationBooking(role, booking) ? (
        <details className="w-full rounded-md border border-border p-3">
          <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">
            Complete stay
          </summary>
          <form action={completeAccommodationBookingAction} className="mt-3 grid gap-3 sm:grid-cols-2">
            <input name="booking_id" type="hidden" value={booking.id} />
            <label className={OPS_LABEL_CLASS}>
              Actual cost
              <input
                className={OPS_INPUT_CLASS}
                min="0"
                name="actual_cost"
                step="0.01"
                type="number"
              />
            </label>
            <label className={`${OPS_LABEL_CLASS} sm:col-span-2`}>
              Completion notes
              <textarea className={OPS_INPUT_CLASS} name="notes" rows={2} />
            </label>
            <button className={`${OPS_PRIMARY_BUTTON_CLASS} sm:col-span-2`} type="submit">
              Complete stay
            </button>
          </form>
        </details>
      ) : null}
      {canCancelOpsAccommodationBooking(actorId, role, booking) ? (
        <InlineActionForm
          action={cancelAccommodationBookingAction}
          buttonClass={OPS_DANGER_BUTTON_CLASS}
          confirmText="Cancel?"
          hidden={{ booking_id: booking.id }}
        >
          Cancel
        </InlineActionForm>
      ) : null}
    </div>
  );
}

function LabourActions({
  actorId,
  allocation,
  role,
}: {
  actorId: string;
  allocation: OpsLabourAllocationSummary;
  role: OpsUserRole;
}) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {canStartOpsLabourAllocation(role, allocation) ? (
        <InlineActionForm
          action={startLabourAllocationAction}
          buttonClass={OPS_SECONDARY_BUTTON_CLASS}
          confirmText="Start?"
          hidden={{ allocation_id: allocation.id }}
        >
          Start
        </InlineActionForm>
      ) : null}
      {canCompleteOpsLabourAllocation(role, allocation) ? (
        <details className="w-full rounded-md border border-border p-3">
          <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">
            Complete labour
          </summary>
          <form action={completeLabourAllocationAction} className="mt-3 grid gap-3 sm:grid-cols-2">
            <input name="allocation_id" type="hidden" value={allocation.id} />
            <label className={OPS_LABEL_CLASS}>
              Actual days
              <input
                className={OPS_INPUT_CLASS}
                min="0"
                name="actual_days"
                step="0.25"
                type="number"
              />
            </label>
            <label className={`${OPS_LABEL_CLASS} sm:col-span-2`}>
              Completion notes
              <textarea className={OPS_INPUT_CLASS} name="notes" rows={2} />
            </label>
            <button className={`${OPS_PRIMARY_BUTTON_CLASS} sm:col-span-2`} type="submit">
              Complete labour
            </button>
          </form>
        </details>
      ) : null}
      {canCancelOpsLabourAllocation(actorId, role, allocation) ? (
        <InlineActionForm
          action={cancelLabourAllocationAction}
          buttonClass={OPS_DANGER_BUTTON_CLASS}
          confirmText="Cancel?"
          hidden={{ allocation_id: allocation.id }}
        >
          Cancel
        </InlineActionForm>
      ) : null}
    </div>
  );
}

export default async function FleetLogisticsPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const auth = await requireOpsUser();

  if (!canAccessOpsHref(auth.profile.role, "/ops/fleet-logistics", await fetchOpsModuleAccessOverrides())) {
    notFound();
  }

  const status = statusFromParam(firstParam(params.status));
  const listState = parseOpsListState(params);
  const [
    sites,
    employeeOptions,
    workerOptions,
    dispatchEquipmentOptions,
    stats,
    dispatchReport,
    mobilizationDashboard,
    operatorComplianceReport,
    profitabilityReport,
    transportRequests,
    accommodationBookings,
    labourAllocations,
    weeklyActivity,
  ] = await Promise.all([
    fetchActiveSiteOptions(),
    fetchFleetLogisticsEmployeeOptions(),
    fetchFleetLogisticsWorkerOptions(),
    fetchFleetDispatchEquipmentOptions(),
    fetchOpsFleetLogisticsStats(),
    fetchOpsFleetDispatchReport(),
    fetchOpsFleetMobilizationDashboard(),
    fetchOpsFleetOperatorComplianceReport(),
    fetchOpsFleetProfitabilityReport(),
    fetchPaginatedOpsTransportRequests({
      listState,
      query: listState.query,
      status: status || undefined,
    }),
    fetchRecentAccommodationBookings(),
    fetchRecentLabourAllocations(),
    fetchOpsFleetWeeklyActivity(8),
  ]);
  const notice = fleetLogisticsNotice(params);
  const today = todayInLusaka();
  const openTransportPanel = firstParam(params.create) === "transport";
  const openAccommodationPanel = firstParam(params.create) === "accommodation";
  const openLabourPanel = firstParam(params.create) === "labour";
  const openOperatorDocumentPanel = firstParam(params.create) === "operator_document";
  const canCreateTransport = canCreateOpsTransportRequest(auth.profile.role);
  const canCreateAccommodation = canCreateOpsAccommodationBooking(auth.profile.role);
  const canCreateLabour = canCreateOpsLabourAllocation(auth.profile.role);
  const canManageOperatorDocuments = canManageOpsFleetOperatorDocuments(auth.profile.role);
  const hasActiveListFilter = listState.query.length > 0 || status.length > 0;
  const operatorDocumentAttentionCount =
    operatorComplianceReport.expiredDocuments + operatorComplianceReport.dueSoonDocuments;

  return (
    <div className="grid gap-6">
      <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary-blue">
              Operations and Fleet
            </p>
            <h1 className="mt-2 font-heading text-3xl font-bold text-foreground">
              Fleet and Logistics
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Coordinate transport requests, staff accommodation, and labour allocation from one
              operational register.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canCreateTransport ? (
              <Link className={OPS_PRIMARY_BUTTON_CLASS} href="/ops/fleet-logistics?create=transport#transport-create-panel">
                <Plus className="size-4" aria-hidden="true" />
                Transport
              </Link>
            ) : null}
            {canCreateAccommodation ? (
              <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/fleet-logistics?create=accommodation#accommodation-create-panel">
                <BedDouble className="size-4" aria-hidden="true" />
                Accommodation
              </Link>
            ) : null}
            {canCreateLabour ? (
              <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/fleet-logistics?create=labour#labour-create-panel">
                <Users className="size-4" aria-hidden="true" />
                Labour
              </Link>
            ) : null}
            {canManageOperatorDocuments ? (
              <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/fleet-logistics?create=operator_document#operator-document-create-panel">
                <FileWarning className="size-4" aria-hidden="true" />
                Driver doc
              </Link>
            ) : null}
          </div>
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

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <OpsKpiCard
          href="/ops/fleet-logistics?status=submitted#transport-register"
          icon={Bus}
          label="Open transport"
          tone={stats.openTransports > 0 ? "warn" : "default"}
          sparkline={weeklyActivity.map((point) => point.raised)}
          hint="Weekly requests trend"
          value={String(stats.openTransports)}
        />
        <OpsKpiCard
          href="/ops/fleet-logistics?status=completed#transport-register"
          icon={CheckCircle2}
          label="Completed trips"
          tone="good"
          value={String(stats.completedTransports)}
        />
        <OpsKpiCard
          href="/ops/fleet-logistics#accommodation-panel"
          icon={BedDouble}
          label="Active stays"
          tone={stats.accommodationActive > 0 ? "warn" : "default"}
          value={String(stats.accommodationActive)}
        />
        <OpsKpiCard
          href="/ops/fleet-logistics#labour-panel"
          icon={HardHat}
          label="Active labour"
          tone={stats.labourActive > 0 ? "warn" : "default"}
          value={String(stats.labourActive)}
        />
        <OpsKpiCard
          href="/ops/fleet-logistics#operator-compliance-panel"
          icon={FileWarning}
          label="Driver docs due"
          tone={operatorDocumentAttentionCount > 0 ? "warn" : "good"}
          value={String(operatorDocumentAttentionCount)}
        />
        <OpsKpiCard
          href="/ops/project-budgets"
          icon={DollarSign}
          label="Open estimate"
          tone="default"
          value={formatZmw(stats.totalEstimatedCost)}
        />
      </section>

      {weeklyActivity.some((point) => point.raised > 0 || point.completed > 0) ? (
        <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <h2 className="font-heading text-xl font-bold text-foreground">
            Transport activity — last 8 weeks
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Requests raised per week against trips completed.
          </p>
          <div className="mt-4">
            <OpsTrendChart
              ariaLabel="Transport requests raised versus trips completed per week over the last 8 weeks"
              emptyMessage="No transport activity in this window"
              points={weeklyActivity.map((point) => ({
                label: point.label,
                raised: point.raised,
                completed: point.completed,
              }))}
              series={[
                { key: "raised", label: "Raised", color: OPS_CHART_COLORS.blue, kind: "bar" },
                { key: "completed", label: "Completed", color: OPS_CHART_COLORS.emerald, kind: "line" },
              ]}
            />
          </div>
        </section>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-2" id="fleet-planning-panel">
        <FleetDispatchCalendarPanel report={dispatchReport} />
        <FleetTripPlanningPanel dashboard={mobilizationDashboard} />
        <FleetUsageVariancePanel report={dispatchReport} />
        <FleetMobilizationPanel dashboard={mobilizationDashboard} />
        <FleetOperatorCompliancePanel report={operatorComplianceReport} />
        <FleetProfitabilityPanel report={profitabilityReport} />
      </section>

      <section className="grid gap-4 lg:grid-cols-4">
        {canCreateTransport ? (
          <details
            className="rounded-lg border border-border bg-card p-5 shadow-sm"
            id="transport-create-panel"
            open={openTransportPanel}
          >
            <summary className="cursor-pointer text-sm font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Create transport request
            </summary>
            {sites.length === 0 ? (
              <p className="mt-4 rounded-md bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-700">
                Add an active site before creating transport requests.
              </p>
            ) : (
              <form action={createTransportRequestAction} className="mt-4 grid gap-3">
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
                  Title
                  <input className={OPS_INPUT_CLASS} name="title" required />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className={OPS_LABEL_CLASS}>
                    Type
                    <select className={OPS_INPUT_CLASS} defaultValue="site_visit" name="request_type">
                      {TRANSPORT_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
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
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className={OPS_LABEL_CLASS}>
                    Requested for
                    <input className={OPS_INPUT_CLASS} defaultValue={today} name="requested_for" type="date" />
                  </label>
                  <label className={OPS_LABEL_CLASS}>
                    Passenger count
                    <input className={OPS_INPUT_CLASS} min="0" name="passenger_count" type="number" />
                  </label>
                </div>
                <label className={OPS_LABEL_CLASS}>
                  Origin
                  <input className={OPS_INPUT_CLASS} name="origin" />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Destination
                  <input className={OPS_INPUT_CLASS} name="destination" />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Vehicle requirement
                  <input className={OPS_INPUT_CLASS} name="vehicle_requirement" />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Material details
                  <textarea className={OPS_INPUT_CLASS} name="material_description" rows={2} />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Estimated cost
                  <input className={OPS_INPUT_CLASS} min="0" name="estimated_cost" step="0.01" type="number" />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Description
                  <textarea className={OPS_INPUT_CLASS} name="description" rows={3} />
                </label>
                <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
                  Create request
                </button>
              </form>
            )}
          </details>
        ) : null}

        {canCreateAccommodation ? (
          <details
            className="rounded-lg border border-border bg-card p-5 shadow-sm"
            id="accommodation-create-panel"
            open={openAccommodationPanel}
          >
            <summary className="cursor-pointer text-sm font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Create accommodation booking
            </summary>
            {sites.length === 0 ? (
              <p className="mt-4 rounded-md bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-700">
                Add an active site before creating accommodation bookings.
              </p>
            ) : (
              <form action={createAccommodationBookingAction} className="mt-4 grid gap-3">
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
                  Location
                  <input className={OPS_INPUT_CLASS} name="location_name" required />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Provider
                  <input className={OPS_INPUT_CLASS} name="provider_name" />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className={OPS_LABEL_CLASS}>
                    Employee
                    <select className={OPS_INPUT_CLASS} defaultValue="" name="employee_id">
                      <option value="">No employee link</option>
                      {employeeOptions.map((employee) => (
                        <option key={employee.id} value={employee.id}>
                          {employee.employee_number} - {employee.full_name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={OPS_LABEL_CLASS}>
                    Worker
                    <select className={OPS_INPUT_CLASS} defaultValue="" name="worker_id">
                      <option value="">No worker link</option>
                      {workerOptions.map((worker) => (
                        <option key={worker.id} value={worker.id}>
                          {worker.worker_code} - {worker.full_name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className={OPS_LABEL_CLASS}>
                    Check in
                    <input className={OPS_INPUT_CLASS} defaultValue={today} name="check_in_date" type="date" />
                  </label>
                  <label className={OPS_LABEL_CLASS}>
                    Check out
                    <input className={OPS_INPUT_CLASS} defaultValue={today} name="check_out_date" type="date" />
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className={OPS_LABEL_CLASS}>
                    Occupants
                    <input className={OPS_INPUT_CLASS} defaultValue="1" min="1" name="occupant_count" type="number" />
                  </label>
                  <label className={OPS_LABEL_CLASS}>
                    Estimated cost
                    <input className={OPS_INPUT_CLASS} min="0" name="estimated_cost" step="0.01" type="number" />
                  </label>
                </div>
                <label className={OPS_LABEL_CLASS}>
                  Notes
                  <textarea className={OPS_INPUT_CLASS} name="notes" rows={3} />
                </label>
                <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
                  Create booking
                </button>
              </form>
            )}
          </details>
        ) : null}

        {canCreateLabour ? (
          <details
            className="rounded-lg border border-border bg-card p-5 shadow-sm"
            id="labour-create-panel"
            open={openLabourPanel}
          >
            <summary className="cursor-pointer text-sm font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Create labour allocation
            </summary>
            {sites.length === 0 ? (
              <p className="mt-4 rounded-md bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-700">
                Add an active site before creating labour allocations.
              </p>
            ) : (
              <form action={createLabourAllocationAction} className="mt-4 grid gap-3">
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
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className={OPS_LABEL_CLASS}>
                    Employee
                    <select className={OPS_INPUT_CLASS} defaultValue="" name="employee_id">
                      <option value="">No employee link</option>
                      {employeeOptions.map((employee) => (
                        <option key={employee.id} value={employee.id}>
                          {employee.employee_number} - {employee.full_name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={OPS_LABEL_CLASS}>
                    Worker
                    <select className={OPS_INPUT_CLASS} defaultValue="" name="worker_id">
                      <option value="">No worker link</option>
                      {workerOptions.map((worker) => (
                        <option key={worker.id} value={worker.id}>
                          {worker.worker_code} - {worker.full_name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className={OPS_LABEL_CLASS}>
                  Role title
                  <input className={OPS_INPUT_CLASS} name="role_title" required />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Trade
                  <input className={OPS_INPUT_CLASS} name="trade" />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className={OPS_LABEL_CLASS}>
                    Start date
                    <input className={OPS_INPUT_CLASS} defaultValue={today} name="start_date" type="date" />
                  </label>
                  <label className={OPS_LABEL_CLASS}>
                    End date
                    <input className={OPS_INPUT_CLASS} name="end_date" type="date" />
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className={OPS_LABEL_CLASS}>
                    Planned days
                    <input className={OPS_INPUT_CLASS} defaultValue="1" min="0.25" name="planned_days" step="0.25" type="number" />
                  </label>
                  <label className={OPS_LABEL_CLASS}>
                    Daily rate
                    <input className={OPS_INPUT_CLASS} min="0" name="daily_rate" step="0.01" type="number" />
                  </label>
                </div>
                <label className={OPS_LABEL_CLASS}>
                  Notes
                  <textarea className={OPS_INPUT_CLASS} name="notes" rows={3} />
                </label>
                <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
                  Create allocation
                </button>
              </form>
            )}
          </details>
        ) : null}

        {canManageOperatorDocuments ? (
          <details
            className="rounded-lg border border-border bg-card p-5 shadow-sm"
            id="operator-document-create-panel"
            open={openOperatorDocumentPanel}
          >
            <summary className="cursor-pointer text-sm font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Record driver document
            </summary>
            {employeeOptions.length === 0 && workerOptions.length === 0 ? (
              <p className="mt-4 rounded-md bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-700">
                Add active employees or workers before recording operator documents.
              </p>
            ) : (
              <form action={createFleetOperatorDocumentAction} className="mt-4 grid gap-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className={OPS_LABEL_CLASS}>
                    Employee
                    <select className={OPS_INPUT_CLASS} defaultValue="" name="employee_id">
                      <option value="">No employee link</option>
                      {employeeOptions.map((employee) => (
                        <option key={employee.id} value={employee.id}>
                          {employee.employee_number} - {employee.full_name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={OPS_LABEL_CLASS}>
                    Worker
                    <select className={OPS_INPUT_CLASS} defaultValue="" name="worker_id">
                      <option value="">No worker link</option>
                      {workerOptions.map((worker) => (
                        <option key={worker.id} value={worker.id}>
                          {worker.worker_code} - {worker.full_name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className={OPS_LABEL_CLASS}>
                  Document type
                  <select className={OPS_INPUT_CLASS} defaultValue="driver_license" name="document_type">
                    {OPERATOR_DOCUMENT_TYPE_OPTIONS.map((option) => (
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
                  Reference number
                  <input className={OPS_INPUT_CLASS} name="reference_number" />
                </label>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className={OPS_LABEL_CLASS}>
                    Issued
                    <input className={OPS_INPUT_CLASS} name="issued_at" type="date" />
                  </label>
                  <label className={OPS_LABEL_CLASS}>
                    Expires
                    <input className={OPS_INPUT_CLASS} name="expires_at" type="date" />
                  </label>
                  <label className={OPS_LABEL_CLASS}>
                    Reminder days
                    <input className={OPS_INPUT_CLASS} defaultValue="30" max="365" min="0" name="reminder_days" type="number" />
                  </label>
                </div>
                <label className={OPS_LABEL_CLASS}>
                  Notes
                  <textarea className={OPS_INPUT_CLASS} name="notes" rows={3} />
                </label>
                <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
                  Record document
                </button>
              </form>
            )}
          </details>
        ) : null}
      </section>

      <section className="rounded-lg border border-border bg-card shadow-sm" id="transport-register">
        <div className="flex flex-col gap-3 border-b border-border p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground">Transport register</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Requests move from draft through approval, scheduling, and completion.
            </p>
          </div>
          <StatusBadge value={`${transportRequests.pagination.total} records`} />
        </div>
        <OpsListControls
          action="/ops/fleet-logistics"
          filters={[
            {
              label: "Status",
              name: "status",
              options: TRANSPORT_STATUS_OPTIONS,
              value: status,
            },
          ]}
          placeholder="Search by request, title, origin, destination, or vehicle"
          query={listState.query}
          resultLabel="transport requests"
        />
        <div className={OPS_TABLE_SCROLL_CLASS} tabIndex={0}>
          <div className="min-w-[960px] divide-y divide-border">
            {transportRequests.items.length > 0 ? (
              transportRequests.items.map((request) => (
                <article className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(18rem,0.8fr)]" key={request.id}>
                  <div>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary-blue">
                          {request.request_number}
                        </p>
                        <h3 className="mt-1 text-lg font-bold text-foreground">{request.title}</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {request.site ? `${request.site.code} - ${request.site.name}` : "No site"}
                        </p>
                      </div>
                      <StatusBadge value={request.status} />
                    </div>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                      <DetailItem label="Type" value={formatLabel(request.request_type)} />
                      <DetailItem label="Needed" value={formatDate(request.requested_for)} />
                      <DetailItem label="Route" value={`${request.origin || "Origin"} -> ${request.destination || "Destination"}`} />
                      <DetailItem label="Estimate" value={formatZmw(request.estimated_cost)} />
                    </div>
                    <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                      <DetailItem label="Scheduled" value={formatDateTime(request.scheduled_at)} />
                      <DetailItem label="Vehicle" value={formatEquipmentLabel(request.assigned_equipment)} />
                      <DetailItem label="Operator" value={formatOperatorLabel(request)} />
                      <DetailItem
                        label="Dispatch ref"
                        value={request.dispatch_reference || "Not set"}
                      />
                    </div>
                    {request.description || request.material_description || request.vehicle_requirement ? (
                      <p className="mt-4 text-sm leading-6 text-muted-foreground">
                        {[request.description, request.material_description, request.vehicle_requirement]
                          .filter(Boolean)
                          .join(" ")}
                      </p>
                    ) : null}
                    {request.dispatch_notes ? (
                      <p className="mt-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm leading-6 text-muted-foreground">
                        {request.dispatch_notes}
                      </p>
                    ) : null}
                    <div className="mt-4">
                      <TransportActions
                        actorId={auth.profile.id}
                        employeeOptions={employeeOptions}
                        equipmentOptions={dispatchEquipmentOptions}
                        request={request}
                        role={auth.profile.role}
                        workerOptions={workerOptions}
                      />
                    </div>
                  </div>
                  <div className="rounded-md border border-border bg-muted/40 p-3">
                    <OpsRecordActivityPanel
                      canManage={canCreateTransport}
                      sourceId={request.id}
                      sourceTable="transport_requests"
                    />
                  </div>
                </article>
              ))
            ) : (
              <div className="p-8 text-center">
                <Route className="mx-auto size-10 text-muted-foreground" aria-hidden="true" />
                <h3 className="mt-3 text-lg font-bold text-foreground">
                  {hasActiveListFilter ? "No matching transport requests" : "No transport requests yet"}
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {hasActiveListFilter
                    ? "Adjust the search or status filter to widen the transport register."
                    : "Create the first request when a site needs vehicle, material, staff, or equipment movement."}
                </p>
              </div>
            )}
          </div>
        </div>
        <OpsPaginationControls
          basePath="/ops/fleet-logistics"
          filters={[
            {
              label: "Status",
              name: "status",
              options: TRANSPORT_STATUS_OPTIONS,
              value: status,
            },
          ]}
          pagination={transportRequests.pagination}
          query={listState.query}
          resultLabel="transport requests"
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-lg border border-border bg-card shadow-sm" id="accommodation-panel">
          <div className="flex items-center justify-between gap-3 border-b border-border p-5">
            <div>
              <h2 className="text-lg font-bold text-foreground">Accommodation logistics</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Staff and worker stay coordination with cost visibility.
              </p>
            </div>
            <BedDouble className="size-5 text-primary-blue" aria-hidden="true" />
          </div>
          <div className="grid gap-3 p-5">
            {accommodationBookings.length > 0 ? (
              accommodationBookings.map((booking) => (
                <article className="rounded-lg border border-border p-4" key={booking.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary-blue">
                        {booking.booking_number}
                      </p>
                      <h3 className="mt-1 text-base font-bold text-foreground">{booking.location_name}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {booking.employee?.full_name ?? booking.worker?.full_name ?? `${booking.occupant_count} occupants`}
                      </p>
                    </div>
                    <StatusBadge value={booking.status} />
                  </div>
                  <div className="mt-4 grid gap-4 sm:grid-cols-3">
                    <DetailItem label="Site" value={booking.site?.code ?? "No site"} />
                    <DetailItem label="Dates" value={`${formatDate(booking.check_in_date)} - ${formatDate(booking.check_out_date)}`} />
                    <DetailItem label="Estimate" value={formatZmw(booking.estimated_cost)} />
                  </div>
                  <AccommodationActions actorId={auth.profile.id} booking={booking} role={auth.profile.role} />
                  <div className="mt-4 rounded-md border border-border bg-muted/40 p-3">
                    <OpsRecordActivityPanel
                      canManage={canCreateAccommodation}
                      sourceId={booking.id}
                      sourceTable="accommodation_bookings"
                    />
                  </div>
                </article>
              ))
            ) : (
              <OpsEmptyState
                actions={
                  canCreateAccommodation
                    ? [{ href: "#accommodation-create-panel", label: "Book accommodation" }]
                    : []
                }
                description="Coordinated stays for staff and site labour are booked here, so cost and occupancy sit against the site rather than in a WhatsApp thread."
                icon={BedDouble}
                title="No accommodation bookings yet"
              />
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card shadow-sm" id="labour-panel">
          <div className="flex items-center justify-between gap-3 border-b border-border p-5">
            <div>
              <h2 className="text-lg font-bold text-foreground">Labour allocation</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Assign employees or workers to project sites and track labour cost exposure.
              </p>
            </div>
            <HardHat className="size-5 text-primary-blue" aria-hidden="true" />
          </div>
          <div className="grid gap-3 p-5">
            {labourAllocations.length > 0 ? (
              labourAllocations.map((allocation) => (
                <article className="rounded-lg border border-border p-4" key={allocation.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary-blue">
                        {allocation.allocation_number}
                      </p>
                      <h3 className="mt-1 text-base font-bold text-foreground">{allocation.role_title}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {allocation.employee?.full_name ?? allocation.worker?.full_name ?? allocation.trade}
                      </p>
                    </div>
                    <StatusBadge value={allocation.status} />
                  </div>
                  <div className="mt-4 grid gap-4 sm:grid-cols-3">
                    <DetailItem label="Site" value={allocation.site?.code ?? "No site"} />
                    <DetailItem label="Dates" value={`${formatDate(allocation.start_date)} - ${formatDate(allocation.end_date)}`} />
                    <DetailItem label="Estimate" value={formatZmw(allocation.estimated_cost)} />
                  </div>
                  <div className="mt-3 grid gap-4 sm:grid-cols-3">
                    <DetailItem label="Planned days" value={allocation.planned_days.toLocaleString("en-ZM")} />
                    <DetailItem label="Actual days" value={allocation.actual_days.toLocaleString("en-ZM")} />
                    <DetailItem label="Daily rate" value={formatZmw(allocation.daily_rate)} />
                  </div>
                  <LabourActions actorId={auth.profile.id} allocation={allocation} role={auth.profile.role} />
                  <div className="mt-4 rounded-md border border-border bg-muted/40 p-3">
                    <OpsRecordActivityPanel
                      canManage={canCreateLabour}
                      sourceId={allocation.id}
                      sourceTable="labour_allocations"
                    />
                  </div>
                </article>
              ))
            ) : (
              <OpsEmptyState
                actions={
                  canCreateLabour
                    ? [{ href: "#labour-create-panel", label: "Allocate labour" }]
                    : []
                }
                description="Allocating people to a site or work package is what lets labour cost reach the project cost ledger instead of sitting as an unattributed payroll total."
                icon={Users}
                title="No labour allocations yet"
              />
            )}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-4">
          <DetailItem label="Request" value="Draft -> submitted -> approved" />
          <DetailItem label="Schedule" value="Approved transport is scheduled" />
          <DetailItem label="Stay" value="Requested -> confirmed -> checked in" />
          <DetailItem label="Cost" value="Committed first, posted at completion" />
        </div>
        <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <Clock className="size-4" aria-hidden="true" />
          <span>Completion actions post actual cost to project budgets when a cost value exists.</span>
        </div>
      </section>
    </div>
  );
}
