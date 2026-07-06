import {
  CalendarCheck,
  CheckCircle2,
  Clock,
  Construction,
  Fuel,
  Plus,
  Send,
  Truck,
  Wrench,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OPS_CHART_COLORS, OpsStatusDonut } from "@/components/ops/OpsAnalyticsCharts";
import { OpsConfirmSubmitButton } from "@/components/ops/OpsConfirmSubmitButton";
import { OpsDashboardPanel } from "@/components/ops/OpsDashboardPanel";
import { OpsKpiCard } from "@/components/ops/OpsKpiCard";
import { OpsListControls, OpsPaginationControls } from "@/components/ops/OpsListControls";
import { OpsRecordActivityPanel } from "@/components/ops/OpsRecordActivityPanel";
import { requireOpsUser } from "@/lib/ops/auth";
import {
  allocateEquipmentAction,
  approveEquipmentRequestAction,
  archiveEquipmentAction,
  cancelEquipmentAllocationAction,
  cancelMaintenanceJobAction,
  cancelEquipmentRequestAction,
  completeEquipmentAllocationAction,
  completeMaintenanceJobAction,
  createEquipmentAction,
  createEquipmentCategoryAction,
  createMaintenanceJobAction,
  createEquipmentRequestAction,
  recordFuelLogAction,
  rejectEquipmentRequestAction,
  startEquipmentAllocationAction,
  startMaintenanceJobAction,
  submitEquipmentRequestAction,
} from "@/lib/ops/equipment-actions";
import {
  canAllocateOpsEquipment,
  canApproveOpsEquipmentRequest,
  canCancelOpsEquipmentAllocation,
  canCancelOpsMaintenanceJob,
  canCancelOpsEquipmentRequest,
  canCompleteOpsEquipmentAllocation,
  canCompleteOpsMaintenanceJob,
  canCreateOpsMaintenanceJob,
  canCreateOpsEquipmentRequest,
  canManageOpsEquipmentMasterData,
  canRejectOpsEquipmentRequest,
  canRecordOpsFuelLog,
  canStartOpsEquipmentAllocation,
  canStartOpsMaintenanceJob,
  canSubmitOpsEquipmentRequest,
} from "@/lib/ops/equipment-permissions";
import {
  fetchEquipmentCategoryOptions,
  fetchEquipmentOptions,
  fetchOpsEquipmentStats,
  fetchOpsEquipmentStatusBreakdown,
  fetchOpsEquipmentUtilizationDashboard,
  fetchPaginatedOpsEquipmentRequests,
  fetchRecentEquipmentAllocations,
  fetchRecentFuelLogs,
  fetchRecentMaintenanceJobs,
  type OpsEquipmentAllocationSummary,
  type OpsEquipmentRequestSummary,
  type OpsEquipmentSummary,
  type OpsEquipmentUtilizationDashboard,
  type OpsFuelLogSummary,
  type OpsMaintenanceJobSummary,
} from "@/lib/ops/equipment";
import { parseOpsListState } from "@/lib/ops/listing";
import { canAccessOpsHref } from "@/lib/ops/permissions";
import { formatOpsUserName } from "@/lib/ops/roles";
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
} from "@/lib/ops/ui";
import type {
  OpsEquipmentAllocationStatus,
  OpsEquipmentOwnership,
  OpsEquipmentRequestStatus,
  OpsEquipmentStatus,
  OpsMaintenanceJobStatus,
  OpsMaintenanceJobType,
  OpsPriority,
} from "@/lib/ops/types";

type PageProps = {
  searchParams?: Promise<OpsSearchParams>;
};

const REQUEST_STATUS_OPTIONS: Array<{
  label: string;
  value: OpsEquipmentRequestStatus | "";
}> = [
  { label: "All statuses", value: "" },
  { label: "Draft", value: "draft" },
  { label: "Submitted", value: "submitted" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
  { label: "Allocated", value: "allocated" },
  { label: "Cancelled", value: "cancelled" },
  { label: "Closed", value: "closed" },
];

const PRIORITY_OPTIONS: Array<{ label: string; value: OpsPriority }> = [
  { label: "Low", value: "low" },
  { label: "Normal", value: "normal" },
  { label: "High", value: "high" },
  { label: "Urgent", value: "urgent" },
];

const OWNERSHIP_OPTIONS: Array<{ label: string; value: OpsEquipmentOwnership }> = [
  { label: "Company owned", value: "company_owned" },
  { label: "Hired", value: "hired" },
  { label: "Leased", value: "leased" },
];

const FUEL_TYPE_OPTIONS = [
  { label: "Diesel", value: "diesel" },
  { label: "Petrol", value: "petrol" },
  { label: "Hydraulic oil", value: "hydraulic_oil" },
  { label: "Engine oil", value: "engine_oil" },
  { label: "Other", value: "other" },
];

const MAINTENANCE_JOB_TYPE_OPTIONS: Array<{ label: string; value: OpsMaintenanceJobType }> = [
  { label: "Preventive", value: "preventive" },
  { label: "Repair", value: "repair" },
  { label: "Inspection", value: "inspection" },
  { label: "Service", value: "service" },
  { label: "Breakdown", value: "breakdown" },
  { label: "Other", value: "other" },
];

const EQUIPMENT_STATUS_CHART_LABELS: Record<string, string> = {
  available: "Available",
  allocated: "Allocated",
  maintenance: "In maintenance",
  inactive: "Inactive",
};

function statusFromParam(value: string | undefined) {
  return REQUEST_STATUS_OPTIONS.some((status) => status.value === value)
    ? (value as OpsEquipmentRequestStatus | "")
    : "";
}

function equipmentNotice(params: OpsSearchParams) {
  const created = noticeFromParams(params, "request", "Equipment request created.");

  if (created) {
    return created;
  }

  const createdValue = firstParam(params.created);
  const updatedValue = firstParam(params.updated);
  const messages: Record<string, string> = {
    allocated: "Equipment allocated and committed to project costs.",
    allocation_cancelled: "Equipment allocation cancelled.",
    allocation_completed: "Equipment allocation completed and posted to project costs.",
    allocation_started: "Equipment allocation started.",
    approved: "Equipment request approved.",
    attachment: "Equipment request attachment uploaded.",
    cancelled: "Equipment request cancelled.",
    category: "Equipment category created.",
    comment: "Equipment request comment added.",
    equipment: "Equipment record created.",
    fuel_log: "Fuel log recorded.",
    maintenance_cancelled: "Maintenance job cancelled.",
    maintenance_completed: "Maintenance job completed.",
    maintenance_job: "Maintenance job created.",
    maintenance_started: "Maintenance job started.",
    rejected: "Equipment request rejected.",
    submitted: "Equipment request submitted.",
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
  }).format(new Date(`${value}T00:00:00+02:00`));
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-ZM", {
    currency: "ZMW",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

function formatPercent(value: number) {
  return `${value.toLocaleString("en-ZM")}%`;
}

function formatLitres(value: number) {
  return `${value.toLocaleString("en-ZM", { maximumFractionDigits: 0 })} L`;
}

function formatLabel(value: string) {
  return value.replace(/_/g, " ");
}

function requestStatusClass(status: OpsEquipmentRequestStatus) {
  if (status === "closed" || status === "allocated") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "approved") {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }

  if (status === "submitted") {
    return "border-orange-200 bg-orange-50 text-orange-700";
  }

  if (status === "rejected" || status === "cancelled") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  return "border-primary-dark/10 bg-primary-dark/[0.04] text-primary-dark/55";
}

function equipmentStatusClass(status: OpsEquipmentStatus) {
  if (status === "available") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "allocated") {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }

  if (status === "maintenance") {
    return "border-orange-200 bg-orange-50 text-orange-700";
  }

  return "border-primary-dark/10 bg-primary-dark/[0.04] text-primary-dark/55";
}

function allocationStatusClass(status: OpsEquipmentAllocationStatus) {
  if (status === "completed") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "active") {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }

  if (status === "cancelled") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  return "border-orange-200 bg-orange-50 text-orange-700";
}

function maintenanceStatusClass(status: OpsMaintenanceJobStatus) {
  if (status === "completed") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "in_progress") {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }

  if (status === "cancelled") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  return "border-orange-200 bg-orange-50 text-orange-700";
}

function FleetMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-primary-dark/10 px-3 py-2">
      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-primary-dark/45">
        {label}
      </dt>
      <dd className="mt-1 font-bold text-primary-dark">{value}</dd>
    </div>
  );
}

function FleetFlowStep({
  description,
  icon: Icon,
  label,
  value,
}: {
  description: string;
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-primary-dark/10 bg-primary-dark/[0.02] p-4">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-white text-primary-blue shadow-sm shadow-primary-dark/5">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary-dark/45">
            {label}
          </p>
          <p className="mt-1 truncate font-heading text-xl font-bold text-primary-dark">
            {value}
          </p>
        </div>
      </div>
      <p className="mt-3 text-sm leading-6 text-primary-dark/60">{description}</p>
    </div>
  );
}

function EquipmentUtilizationPanel({
  dashboard,
}: {
  dashboard: OpsEquipmentUtilizationDashboard;
}) {
  return (
    <OpsDashboardPanel eyebrow="Utilization control" title="Fleet utilization">
      <dl className="grid gap-3 sm:grid-cols-2">
        <FleetMetric label="Utilization" value={formatPercent(dashboard.utilizationPercent)} />
        <FleetMetric label="Availability" value={formatPercent(dashboard.availabilityPercent)} />
        <FleetMetric label="Active equipment" value={String(dashboard.activeEquipmentCount)} />
        <FleetMetric label="Fuel 30 days" value={formatLitres(dashboard.fuelLitres30Days)} />
      </dl>

      <div className="mt-4">
        {dashboard.allocationRows.length === 0 ? (
          <p className="rounded-md border border-primary-dark/10 px-3 py-3 text-sm text-primary-dark/60">
            No active or scheduled equipment allocations yet.
          </p>
        ) : (
          <ul className="divide-y divide-primary-dark/10 rounded-md border border-primary-dark/10">
            {dashboard.allocationRows.map((allocation) => (
              <li
                className="grid gap-2 px-3 py-3 min-[640px]:grid-cols-[1fr_auto]"
                key={allocation.allocation_number}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-primary-dark">
                      {allocation.equipment_code} - {allocation.equipment_name}
                    </p>
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] ${allocationStatusClass(
                        allocation.status,
                      )}`}
                    >
                      {formatLabel(allocation.status)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-primary-dark/50">
                    {allocation.site_code} - {allocation.site_name} /{" "}
                    {formatDate(allocation.allocated_from)} to{" "}
                    {formatDate(allocation.allocated_until)}
                  </p>
                </div>
                <div className="text-left min-[640px]:text-right">
                  <p className="font-bold text-primary-dark">
                    {formatMoney(allocation.daily_rate)}
                  </p>
                  <p className="mt-1 text-xs text-primary-dark/45">Daily charge</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </OpsDashboardPanel>
  );
}

function EquipmentMaintenancePressurePanel({
  dashboard,
}: {
  dashboard: OpsEquipmentUtilizationDashboard;
}) {
  return (
    <OpsDashboardPanel eyebrow="Maintenance pressure" title="Downtime and fuel exposure">
      <dl className="grid gap-3 sm:grid-cols-2">
        <FleetMetric label="Open jobs" value={String(dashboard.openMaintenanceJobs)} />
        <FleetMetric
          label="Downtime hours"
          value={dashboard.openMaintenanceDowntimeHours.toLocaleString("en-ZM", {
            maximumFractionDigits: 1,
          })}
        />
        <FleetMetric label="Open job cost" value={formatMoney(dashboard.openMaintenanceCost)} />
        <FleetMetric label="Fuel cost 30 days" value={formatMoney(dashboard.fuelCost30Days)} />
      </dl>

      <div className="mt-4">
        {dashboard.maintenanceRows.length === 0 ? (
          <p className="rounded-md border border-primary-dark/10 px-3 py-3 text-sm text-primary-dark/60">
            No open maintenance jobs. Scheduled and in-progress jobs will appear here.
          </p>
        ) : (
          <ul className="divide-y divide-primary-dark/10 rounded-md border border-primary-dark/10">
            {dashboard.maintenanceRows.map((job) => (
              <li className="px-3 py-3" key={job.job_number}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-primary-dark">{job.job_number}</p>
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] ${maintenanceStatusClass(
                          job.status,
                        )}`}
                      >
                        {formatLabel(job.status)}
                      </span>
                      <span className="inline-flex rounded-full border border-primary-dark/10 bg-primary-dark/[0.03] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-primary-dark/55">
                        {formatLabel(job.priority)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-semibold text-primary-dark">{job.title}</p>
                    <p className="mt-1 text-xs text-primary-dark/50">
                      {job.equipment_code} - {job.equipment_name} / {job.site_code}
                    </p>
                  </div>
                  <div className="text-left min-[640px]:text-right">
                    <p className="font-bold text-primary-dark">
                      {formatMoney(job.estimated_cost)}
                    </p>
                    <p className="mt-1 text-xs text-primary-dark/45">
                      {formatDate(job.scheduled_for)}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </OpsDashboardPanel>
  );
}

function EquipmentRegister({
  equipment,
  canManage,
}: {
  equipment: OpsEquipmentSummary[];
  canManage: boolean;
}) {
  if (equipment.length === 0) {
    return (
      <p className="rounded-md border border-primary-dark/10 px-3 py-3 text-sm text-primary-dark/60">
        No equipment records yet. Add equipment master data before scheduling allocations.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-primary-dark/10 rounded-md border border-primary-dark/10">
      {equipment.map((item) => (
        <li className="grid gap-2 px-3 py-3 min-[640px]:grid-cols-[1fr_auto]" key={item.id}>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-bold text-primary-dark">
                {item.equipment_code} - {item.name}
              </p>
              <span
                className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] ${equipmentStatusClass(
                  item.status,
                )}`}
              >
                {formatLabel(item.status)}
              </span>
            </div>
            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-primary-dark/45">
              {item.category?.name ?? "No category"} / {formatLabel(item.ownership)}
            </p>
            <p className="mt-1 text-xs text-primary-dark/50">
              {item.current_site ? `${item.current_site.code} - ${item.current_site.name}` : item.base_location || "No current site"}
            </p>
          </div>
          <div className="text-left min-[640px]:text-right">
            <p className="font-heading text-xl font-bold text-primary-dark">
              {formatMoney(item.daily_rate)}
            </p>
            <p className="mt-1 text-xs text-primary-dark/45">Daily rate</p>
            {canManage && item.status !== "inactive" ? (
              <form action={archiveEquipmentAction} className="mt-2">
                <input name="id" type="hidden" value={item.id} />
                <OpsConfirmSubmitButton
                  className={OPS_DANGER_BUTTON_CLASS}
                  confirmText="Confirm archive"
                >
                  Archive
                </OpsConfirmSubmitButton>
              </form>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

function AllocationList({ allocations }: { allocations: OpsEquipmentAllocationSummary[] }) {
  if (allocations.length === 0) {
    return (
      <p className="rounded-md border border-primary-dark/10 px-3 py-3 text-sm text-primary-dark/60">
        No equipment allocations yet.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-primary-dark/10 rounded-md border border-primary-dark/10">
      {allocations.map((allocation) => (
        <li className="grid gap-2 px-3 py-3 min-[640px]:grid-cols-[1fr_auto]" key={allocation.id}>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-bold text-primary-dark">{allocation.allocation_number}</p>
              <span
                className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] ${allocationStatusClass(
                  allocation.status,
                )}`}
              >
                {formatLabel(allocation.status)}
              </span>
            </div>
            <p className="mt-1 text-sm text-primary-dark/65">
              {allocation.equipment
                ? `${allocation.equipment.equipment_code} - ${allocation.equipment.name}`
                : "Equipment unavailable"}
            </p>
            <p className="mt-1 text-xs text-primary-dark/50">
              {allocation.site ? `${allocation.site.code} - ${allocation.site.name}` : "Site unavailable"} /{" "}
              {formatDate(allocation.allocated_from)} to {formatDate(allocation.allocated_until)}
            </p>
          </div>
          <div className="text-left min-[640px]:text-right">
            <p className="font-bold text-primary-dark">
              {formatMoney(allocation.actual_daily_rate || allocation.planned_daily_rate)}
            </p>
            <p className="mt-1 text-xs text-primary-dark/45">Daily charge</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function AllocationControls({
  allocation,
  role,
}: {
  allocation: OpsEquipmentAllocationSummary;
  role: Parameters<typeof canStartOpsEquipmentAllocation>[0];
}) {
  const canStart = canStartOpsEquipmentAllocation(role, allocation);
  const canComplete = canCompleteOpsEquipmentAllocation(role, allocation);
  const canCancel = canCancelOpsEquipmentAllocation(role, allocation);

  if (!canStart && !canComplete && !canCancel) {
    return null;
  }

  return (
    <div className="mt-3 grid gap-2 min-[520px]:grid-cols-3">
      {canStart ? (
        <form action={startEquipmentAllocationAction}>
          <input name="allocation_id" type="hidden" value={allocation.id} />
          <OpsConfirmSubmitButton className={`${OPS_PRIMARY_BUTTON_CLASS} w-full`} confirmText="Start allocation">
            <CalendarCheck className="size-4" aria-hidden="true" />
            Start
          </OpsConfirmSubmitButton>
        </form>
      ) : null}
      {canComplete ? (
        <form action={completeEquipmentAllocationAction}>
          <input name="allocation_id" type="hidden" value={allocation.id} />
          <OpsConfirmSubmitButton className={`${OPS_PRIMARY_BUTTON_CLASS} w-full`} confirmText="Complete allocation">
            <CheckCircle2 className="size-4" aria-hidden="true" />
            Complete
          </OpsConfirmSubmitButton>
        </form>
      ) : null}
      {canCancel ? (
        <form action={cancelEquipmentAllocationAction}>
          <input name="allocation_id" type="hidden" value={allocation.id} />
          <OpsConfirmSubmitButton className={`${OPS_DANGER_BUTTON_CLASS} w-full`} confirmText="Cancel allocation">
            Cancel
          </OpsConfirmSubmitButton>
        </form>
      ) : null}
    </div>
  );
}

function FuelLogList({
  canManage,
  fuelLogs,
}: {
  canManage: boolean;
  fuelLogs: OpsFuelLogSummary[];
}) {
  if (fuelLogs.length === 0) {
    return (
      <p className="rounded-md border border-primary-dark/10 px-3 py-3 text-sm text-primary-dark/60">
        No fuel logs yet.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-primary-dark/10 rounded-md border border-primary-dark/10">
      {fuelLogs.map((log) => (
        <li className="px-3 py-3" key={log.id}>
          <div className="grid gap-2 min-[640px]:grid-cols-[1fr_auto]">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-bold text-primary-dark">{log.fuel_log_number}</p>
                <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-emerald-700">
                  {formatLabel(log.status)}
                </span>
              </div>
              <p className="mt-1 text-sm text-primary-dark/65">
                {log.equipment
                  ? `${log.equipment.equipment_code} - ${log.equipment.name}`
                  : "Equipment unavailable"}
              </p>
              <p className="mt-1 text-xs text-primary-dark/50">
                {formatDate(log.fuel_date)} / {formatLabel(log.fuel_type)}
                {log.site ? ` / ${log.site.code} - ${log.site.name}` : ""}
              </p>
            </div>
            <div className="text-left min-[640px]:text-right">
              <p className="font-bold text-primary-dark">
                {log.quantity_litres.toLocaleString("en-ZM")} L
              </p>
              <p className="mt-1 text-xs text-primary-dark/45">
                {formatMoney(log.total_amount)}
              </p>
            </div>
          </div>
          <OpsRecordActivityPanel
            canManage={canManage}
            sourceId={log.id}
            sourceTable="fuel_logs"
          />
        </li>
      ))}
    </ul>
  );
}

function MaintenanceJobControls({
  job,
  role,
}: {
  job: OpsMaintenanceJobSummary;
  role: Parameters<typeof canStartOpsMaintenanceJob>[0];
}) {
  const canStart = canStartOpsMaintenanceJob(role, job);
  const canComplete = canCompleteOpsMaintenanceJob(role, job);
  const canCancel = canCancelOpsMaintenanceJob(role, job);

  if (!canStart && !canComplete && !canCancel) {
    return null;
  }

  return (
    <div className="mt-3 grid gap-2">
      <div className="grid gap-2 min-[520px]:grid-cols-2">
        {canStart ? (
          <form action={startMaintenanceJobAction}>
            <input name="job_id" type="hidden" value={job.id} />
            <OpsConfirmSubmitButton className={`${OPS_PRIMARY_BUTTON_CLASS} w-full`} confirmText="Start maintenance job">
              <CalendarCheck className="size-4" aria-hidden="true" />
              Start
            </OpsConfirmSubmitButton>
          </form>
        ) : null}
        {canCancel ? (
          <form action={cancelMaintenanceJobAction}>
            <input name="job_id" type="hidden" value={job.id} />
            <OpsConfirmSubmitButton className={`${OPS_DANGER_BUTTON_CLASS} w-full`} confirmText="Cancel maintenance job">
              Cancel
            </OpsConfirmSubmitButton>
          </form>
        ) : null}
      </div>

      {canComplete ? (
        <details className="rounded-md border border-primary-dark/10">
          <summary
            className={`flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-bold text-primary-dark transition hover:text-primary-blue [&::-webkit-details-marker]:hidden ${OPS_FOCUS_CLASS}`}
          >
            <span className="inline-flex items-center gap-2">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              Complete maintenance
            </span>
            <span className="text-xs uppercase tracking-[0.12em] text-primary-dark/45">
              Open
            </span>
          </summary>
          <form
            action={completeMaintenanceJobAction}
            className="grid gap-3 border-t border-primary-dark/10 p-4 min-[520px]:grid-cols-2"
          >
            <input name="job_id" type="hidden" value={job.id} />
            <label className={OPS_LABEL_CLASS}>
              Actual cost
              <input className={OPS_INPUT_CLASS} min="0" name="actual_cost" step="0.01" type="number" />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Downtime hours
              <input className={OPS_INPUT_CLASS} min="0" name="downtime_hours" step="0.01" type="number" />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Next service due
              <input className={OPS_INPUT_CLASS} name="next_service_due" type="date" />
            </label>
            <label className={`${OPS_LABEL_CLASS} min-[520px]:col-span-2`}>
              Completion notes
              <textarea className={`${OPS_INPUT_CLASS} min-h-20`} name="notes" />
            </label>
            <div className="min-[520px]:col-span-2">
              <OpsConfirmSubmitButton className={OPS_PRIMARY_BUTTON_CLASS} confirmText="Complete maintenance job">
                <CheckCircle2 className="size-4" aria-hidden="true" />
                Complete job
              </OpsConfirmSubmitButton>
            </div>
          </form>
        </details>
      ) : null}
    </div>
  );
}

function MaintenanceJobList({
  jobs,
  role,
}: {
  jobs: OpsMaintenanceJobSummary[];
  role: Parameters<typeof canStartOpsMaintenanceJob>[0];
}) {
  if (jobs.length === 0) {
    return (
      <p className="rounded-md border border-primary-dark/10 px-3 py-3 text-sm text-primary-dark/60">
        No maintenance jobs yet.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-primary-dark/10 rounded-md border border-primary-dark/10">
      {jobs.map((job) => {
        const canStart = canStartOpsMaintenanceJob(role, job);
        const canComplete = canCompleteOpsMaintenanceJob(role, job);
        const canCancel = canCancelOpsMaintenanceJob(role, job);

        return (
          <li className="px-3 py-3" key={job.id}>
            <div className="grid gap-2 min-[640px]:grid-cols-[1fr_auto]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-bold text-primary-dark">{job.job_number}</p>
                  <span
                    className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] ${maintenanceStatusClass(
                      job.status,
                    )}`}
                  >
                    {formatLabel(job.status)}
                  </span>
                  <span className="inline-flex rounded-full border border-primary-dark/10 bg-primary-dark/[0.03] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-primary-dark/55">
                    {formatLabel(job.priority)}
                  </span>
                </div>
                <p className="mt-1 text-sm font-bold text-primary-dark">{job.title}</p>
                <p className="mt-1 text-sm text-primary-dark/65">
                  {job.equipment
                    ? `${job.equipment.equipment_code} - ${job.equipment.name}`
                    : "Equipment unavailable"}
                </p>
                <p className="mt-1 text-xs text-primary-dark/50">
                  {formatLabel(job.job_type)} / Reported {formatDate(job.reported_at)}
                  {job.scheduled_for ? ` / Scheduled ${formatDate(job.scheduled_for)}` : ""}
                </p>
              </div>
              <div className="text-left min-[640px]:text-right">
                <p className="font-bold text-primary-dark">
                  {formatMoney(job.actual_cost || job.estimated_cost)}
                </p>
                <p className="mt-1 text-xs text-primary-dark/45">
                  {job.actual_cost > 0 ? "Actual cost" : "Estimated cost"}
                </p>
              </div>
            </div>
            <MaintenanceJobControls job={job} role={role} />
            <OpsRecordActivityPanel
              canManage={canStart || canComplete || canCancel}
              sourceId={job.id}
              sourceTable="maintenance_jobs"
            />
          </li>
        );
      })}
    </ul>
  );
}

function RecordFuelLogForm({
  allocationOptions,
  equipmentOptions,
  open,
  siteOptions,
  today,
}: {
  allocationOptions: OpsEquipmentAllocationSummary[];
  equipmentOptions: OpsEquipmentSummary[];
  open: boolean;
  siteOptions: Array<{ code: string; id: string; name: string }>;
  today: string;
}) {
  return (
    <details
      className="scroll-mt-24 rounded-lg border border-primary-dark/10 bg-white"
      id="fuel-log-create-panel"
      open={open}
    >
      <summary
        className={`flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 transition hover:text-primary-blue [&::-webkit-details-marker]:hidden ${OPS_FOCUS_CLASS}`}
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-blue text-white">
          <Fuel className="size-5" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-heading text-lg font-bold text-primary-dark">
            Record fuel
          </span>
          <span className="mt-1 block text-sm text-primary-dark/60">
            Post consumption for equipment, allocation, and site visibility.
          </span>
        </span>
        <span className="shrink-0 text-xs font-bold uppercase tracking-[0.12em] text-primary-dark/45">
          Open
        </span>
      </summary>
      {equipmentOptions.length === 0 ? (
        <div className="border-t border-primary-dark/10 p-5">
          <div className="rounded-md border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
            Add equipment before recording fuel.
          </div>
        </div>
      ) : (
        <form action={recordFuelLogAction} className="grid gap-3 border-t border-primary-dark/10 p-5">
          <label className={OPS_LABEL_CLASS}>
            Equipment
            <select className={OPS_INPUT_CLASS} defaultValue="" name="equipment_id" required>
              <option value="" disabled>
                Select equipment
              </option>
              {equipmentOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.equipment_code} - {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className={OPS_LABEL_CLASS}>
            Allocation
            <select className={OPS_INPUT_CLASS} defaultValue="" name="allocation_id">
              <option value="">No allocation link</option>
              {allocationOptions
                .filter((allocation) => allocation.status === "active" || allocation.status === "scheduled")
                .map((allocation) => (
                  <option key={allocation.id} value={allocation.id}>
                    {allocation.allocation_number} - {allocation.equipment?.equipment_code ?? "Equipment"}
                  </option>
                ))}
            </select>
          </label>
          <label className={OPS_LABEL_CLASS}>
            Site
            <select className={OPS_INPUT_CLASS} defaultValue="" name="site_id">
              <option value="">Use equipment/allocation site</option>
              {siteOptions.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.code} - {site.name}
                </option>
              ))}
            </select>
          </label>
          <label className={OPS_LABEL_CLASS}>
            Date
            <input className={OPS_INPUT_CLASS} defaultValue={today} name="fuel_date" type="date" />
          </label>
          <label className={OPS_LABEL_CLASS}>
            Fuel type
            <select className={OPS_INPUT_CLASS} defaultValue="diesel" name="fuel_type">
              {FUEL_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className={OPS_LABEL_CLASS}>
            Quantity litres
            <input className={OPS_INPUT_CLASS} min="0.01" name="quantity_litres" required step="0.01" type="number" />
          </label>
          <label className={OPS_LABEL_CLASS}>
            Unit cost
            <input className={OPS_INPUT_CLASS} min="0" name="unit_cost" step="0.01" type="number" />
          </label>
          <label className={OPS_LABEL_CLASS}>
            Odometer/hours
            <input className={OPS_INPUT_CLASS} min="0" name="odometer_hours" step="0.01" type="number" />
          </label>
          <label className={OPS_LABEL_CLASS}>
            Notes
            <input className={OPS_INPUT_CLASS} name="notes" />
          </label>
          <button className={OPS_SECONDARY_BUTTON_CLASS} type="submit">
            <Fuel className="size-4" aria-hidden="true" />
            Post fuel
          </button>
        </form>
      )}
    </details>
  );
}

function CreateMaintenanceJobForm({
  equipmentOptions,
  open,
  siteOptions,
  today,
}: {
  equipmentOptions: OpsEquipmentSummary[];
  open: boolean;
  siteOptions: Array<{ code: string; id: string; name: string }>;
  today: string;
}) {
  return (
    <details
      className="scroll-mt-24 rounded-lg border border-primary-dark/10 bg-white"
      id="maintenance-job-create-panel"
      open={open}
    >
      <summary
        className={`flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 transition hover:text-primary-blue [&::-webkit-details-marker]:hidden ${OPS_FOCUS_CLASS}`}
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-blue text-white">
          <Wrench className="size-5" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-heading text-lg font-bold text-primary-dark">
            Create maintenance job
          </span>
          <span className="mt-1 block text-sm text-primary-dark/60">
            Schedule equipment repair, inspection, service, or breakdown work.
          </span>
        </span>
        <span className="shrink-0 text-xs font-bold uppercase tracking-[0.12em] text-primary-dark/45">
          Open
        </span>
      </summary>
      {equipmentOptions.length === 0 ? (
        <div className="border-t border-primary-dark/10 p-5">
          <div className="rounded-md border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
            Add equipment before creating maintenance jobs.
          </div>
        </div>
      ) : (
        <form action={createMaintenanceJobAction} className="grid gap-3 border-t border-primary-dark/10 p-5">
          <label className={OPS_LABEL_CLASS}>
            Equipment
            <select className={OPS_INPUT_CLASS} defaultValue="" name="equipment_id" required>
              <option value="" disabled>
                Select equipment
              </option>
              {equipmentOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.equipment_code} - {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className={OPS_LABEL_CLASS}>
            Site
            <select className={OPS_INPUT_CLASS} defaultValue="" name="site_id">
              <option value="">Use equipment current site</option>
              {siteOptions.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.code} - {site.name}
                </option>
              ))}
            </select>
          </label>
          <label className={OPS_LABEL_CLASS}>
            Job type
            <select className={OPS_INPUT_CLASS} defaultValue="service" name="job_type">
              {MAINTENANCE_JOB_TYPE_OPTIONS.map((option) => (
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
          <label className={OPS_LABEL_CLASS}>
            Title
            <input className={OPS_INPUT_CLASS} name="title" required />
          </label>
          <label className={OPS_LABEL_CLASS}>
            Reported date
            <input className={OPS_INPUT_CLASS} defaultValue={today} name="reported_at" type="date" />
          </label>
          <label className={OPS_LABEL_CLASS}>
            Scheduled date
            <input className={OPS_INPUT_CLASS} name="scheduled_for" type="date" />
          </label>
          <label className={OPS_LABEL_CLASS}>
            Estimated cost
            <input className={OPS_INPUT_CLASS} min="0" name="estimated_cost" step="0.01" type="number" />
          </label>
          <label className={OPS_LABEL_CLASS}>
            Service provider
            <input className={OPS_INPUT_CLASS} name="service_provider" />
          </label>
          <label className={OPS_LABEL_CLASS}>
            Description
            <textarea className={`${OPS_INPUT_CLASS} min-h-20`} name="description" />
          </label>
          <label className={OPS_LABEL_CLASS}>
            Notes
            <input className={OPS_INPUT_CLASS} name="notes" />
          </label>
          <button className={OPS_SECONDARY_BUTTON_CLASS} type="submit">
            <Wrench className="size-4" aria-hidden="true" />
            Create job
          </button>
        </form>
      )}
    </details>
  );
}

function AllocateEquipmentForm({
  equipmentOptions,
  request,
  today,
}: {
  equipmentOptions: OpsEquipmentSummary[];
  request: OpsEquipmentRequestSummary;
  today: string;
}) {
  return (
    <details className="rounded-md border border-primary-dark/10">
      <summary
        className={`flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-bold text-primary-dark transition hover:text-primary-blue [&::-webkit-details-marker]:hidden ${OPS_FOCUS_CLASS}`}
      >
        <span className="inline-flex items-center gap-2">
          <Truck className="size-4" aria-hidden="true" />
          Allocate equipment
        </span>
        <span className="text-xs uppercase tracking-[0.12em] text-primary-dark/45">
          Open
        </span>
      </summary>
      {equipmentOptions.length === 0 ? (
        <p className="border-t border-primary-dark/10 px-4 py-3 text-sm text-orange-800">
          No available equipment can be allocated right now.
        </p>
      ) : (
        <form
          action={allocateEquipmentAction}
          className="grid gap-3 border-t border-primary-dark/10 p-4 min-[520px]:grid-cols-2 lg:grid-cols-6"
        >
          <input name="request_id" type="hidden" value={request.id} />
          <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
            Equipment
            <select className={OPS_INPUT_CLASS} defaultValue="" name="equipment_id" required>
              <option value="" disabled>
                Select equipment
              </option>
              {equipmentOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.equipment_code} - {item.name} / {formatMoney(item.daily_rate)}
                </option>
              ))}
            </select>
          </label>
          <label className={OPS_LABEL_CLASS}>
            From
            <input
              className={OPS_INPUT_CLASS}
              defaultValue={request.needed_from || today}
              name="allocated_from"
              type="date"
            />
          </label>
          <label className={OPS_LABEL_CLASS}>
            Until
            <input
              className={OPS_INPUT_CLASS}
              defaultValue={request.needed_until ?? ""}
              name="allocated_until"
              type="date"
            />
          </label>
          <label className={OPS_LABEL_CLASS}>
            Planned rate
            <input className={OPS_INPUT_CLASS} min="0" name="planned_daily_rate" step="0.01" type="number" />
          </label>
          <label className={OPS_LABEL_CLASS}>
            Actual rate
            <input className={OPS_INPUT_CLASS} min="0" name="actual_daily_rate" step="0.01" type="number" />
          </label>
          <label className={`${OPS_LABEL_CLASS} min-[520px]:col-span-2 lg:col-span-5`}>
            Notes
            <input className={OPS_INPUT_CLASS} name="notes" />
          </label>
          <div className="flex items-end">
            <button className={`${OPS_PRIMARY_BUTTON_CLASS} w-full`} type="submit">
              <Truck className="size-4" aria-hidden="true" />
              Allocate
            </button>
          </div>
        </form>
      )}
    </details>
  );
}

export default async function OpsEquipmentPage({ searchParams }: PageProps) {
  const [params, auth] = await Promise.all([
    searchParams ?? Promise.resolve({} as OpsSearchParams),
    requireOpsUser(),
  ]);

  if (!canAccessOpsHref(auth.profile.role, "/ops/equipment")) {
    notFound();
  }

  const listState = parseOpsListState(params, { defaultPageSize: 8 });
  const status = statusFromParam(firstParam(params.status));
  const [
    requestPage,
    stats,
    utilizationDashboard,
    statusBreakdown,
    siteOptions,
    categoryOptions,
    equipmentOptions,
    availableEquipmentOptions,
    recentAllocations,
    recentFuelLogs,
    recentMaintenanceJobs,
  ] = await Promise.all([
    fetchPaginatedOpsEquipmentRequests({
      listState,
      query: listState.query,
      status: status || undefined,
    }),
    fetchOpsEquipmentStats(),
    fetchOpsEquipmentUtilizationDashboard(),
    fetchOpsEquipmentStatusBreakdown(),
    fetchActiveSiteOptions(),
    fetchEquipmentCategoryOptions(),
    fetchEquipmentOptions(40),
    fetchEquipmentOptions(120, "available"),
    fetchRecentEquipmentAllocations(),
    fetchRecentFuelLogs(),
    fetchRecentMaintenanceJobs(),
  ]);
  const notice = equipmentNotice(params);
  const today = todayInLusaka();
  const canCreateRequest = canCreateOpsEquipmentRequest(auth.profile.role);
  const canCreateMaintenance = canCreateOpsMaintenanceJob(auth.profile.role);
  const canManageMaster = canManageOpsEquipmentMasterData(auth.profile.role);
  const canRecordFuel = canRecordOpsFuelLog(auth.profile.role);
  const hasActiveListFilter = listState.query.length > 0 || Boolean(status);
  const openRequestPanel = firstParam(params.create) === "request";
  const openCategoryPanel = firstParam(params.create) === "category";
  const openEquipmentPanel = firstParam(params.create) === "equipment";
  const openFuelPanel = firstParam(params.create) === "fuel_log";
  const openMaintenancePanel = firstParam(params.create) === "maintenance_job";
  const createRequestParams = new URLSearchParams();

  if (listState.query) {
    createRequestParams.set("q", listState.query);
  }

  if (status) {
    createRequestParams.set("status", status);
  }

  createRequestParams.set("create", "request");
  const createRequestHref = `/ops/equipment?${createRequestParams.toString()}#equipment-request-create-panel`;
  const createFuelHref = "/ops/equipment?create=fuel_log#fuel-log-create-panel";
  const createMaintenanceHref = "/ops/equipment?create=maintenance_job#maintenance-job-create-panel";

  return (
    <div className="w-full max-w-none space-y-6">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-blue">
            Operations and fleet
          </p>
          <h1 className="mt-2 font-heading text-3xl font-bold text-primary-dark">
            Equipment
          </h1>
          <p className="mt-3 max-w-3xl text-base leading-7 text-primary-dark/68">
            Equipment register, site requests, allocation scheduling, utilization control, and cost
            handoff to finance.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/daily-site-reports">
            <Construction className="size-4" aria-hidden="true" />
            Site reports
          </Link>
          <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/project-budgets">
            <Fuel className="size-4" aria-hidden="true" />
            Budget costs
          </Link>
          {canRecordFuel ? (
            <a className={OPS_SECONDARY_BUTTON_CLASS} href={createFuelHref}>
              <Fuel className="size-4" aria-hidden="true" />
              Record fuel
            </a>
          ) : null}
          {canCreateMaintenance ? (
            <a className={OPS_SECONDARY_BUTTON_CLASS} href={createMaintenanceHref}>
              <Wrench className="size-4" aria-hidden="true" />
              Maintenance
            </a>
          ) : null}
          {canCreateRequest ? (
            <a className={OPS_PRIMARY_BUTTON_CLASS} href={createRequestHref}>
              <Plus className="size-4" aria-hidden="true" />
              New request
            </a>
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

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <OpsKpiCard
          href="/ops/equipment#equipment-register-panel"
          icon={Truck}
          label="Equipment"
          tone="default"
          hint="Registered"
          value={String(stats.equipmentCount)}
        />
        <OpsKpiCard
          href="/ops/equipment#equipment-register-panel"
          icon={CheckCircle2}
          label="Available"
          tone="good"
          hint="Ready"
          value={String(stats.availableEquipment)}
        />
        <OpsKpiCard
          href="/ops/equipment?status=submitted#equipment-request-register"
          icon={Clock}
          label="Open requests"
          tone={stats.openRequests > 0 ? "warn" : "default"}
          hint="Needs action"
          value={String(stats.openRequests)}
        />
        <OpsKpiCard
          href="/ops/equipment#equipment-allocation-panel"
          icon={CalendarCheck}
          label="Allocations"
          tone={stats.activeAllocations > 0 ? "warn" : "default"}
          hint="Scheduled/active"
          value={String(stats.activeAllocations)}
        />
        <OpsKpiCard
          href="/ops/equipment#maintenance-job-panel"
          icon={Wrench}
          label="Maintenance"
          tone={stats.openMaintenanceJobs > 0 ? "warn" : "default"}
          hint="Open jobs"
          value={String(stats.openMaintenanceJobs)}
        />
        <OpsKpiCard
          href="/ops/equipment#fuel-log-panel"
          icon={Fuel}
          label="Fuel logs"
          tone="default"
          hint="Posted"
          value={String(stats.fuelLogs)}
        />
      </section>

      {statusBreakdown.length > 0 ? (
        <section className="rounded-lg border border-primary-dark/10 bg-white p-5">
          <h2 className="font-heading text-xl font-bold text-primary-dark">Fleet status mix</h2>
          <p className="mt-1 text-sm text-primary-dark/60">
            Every registered unit by current status.
          </p>
          <div className="mt-4">
            <OpsStatusDonut
              ariaLabel="Equipment count by status"
              items={statusBreakdown.map((entry) => ({
                label: EQUIPMENT_STATUS_CHART_LABELS[entry.status],
                value: entry.count,
                color:
                  entry.status === "available"
                    ? OPS_CHART_COLORS.emerald
                    : entry.status === "allocated"
                      ? OPS_CHART_COLORS.blue
                      : entry.status === "maintenance"
                        ? OPS_CHART_COLORS.amber
                        : OPS_CHART_COLORS.slate,
              }))}
            />
          </div>
        </section>
      ) : null}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <FleetFlowStep
          description="Field teams raise requests by site, category, need date, and urgency."
          icon={Send}
          label="Request"
          value="Engineering"
        />
        <FleetFlowStep
          description="Operations approves the request and schedules available equipment."
          icon={CalendarCheck}
          label="Allocate"
          value="Operations"
        />
        <FleetFlowStep
          description="Allocation cost is committed, then posted when the equipment returns."
          icon={Fuel}
          label="Cost"
          value="Finance"
        />
        <FleetFlowStep
          description="Fuel logs and maintenance jobs keep downtime, usage, and site costs traceable."
          icon={Wrench}
          label="Maintain"
          value="Fleet"
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-2" id="equipment-utilization-panel">
        <EquipmentUtilizationPanel dashboard={utilizationDashboard} />
        <EquipmentMaintenancePressurePanel dashboard={utilizationDashboard} />
      </section>

      <div className="grid gap-6 xl:grid-cols-[1fr_24rem]">
        <div className="space-y-6">
          <div id="equipment-register-panel">
            <OpsDashboardPanel eyebrow="Fleet register" title="Equipment status">
              <EquipmentRegister
                canManage={canManageMaster}
                equipment={equipmentOptions}
              />
            </OpsDashboardPanel>
          </div>

          <section className="grid gap-6 lg:grid-cols-2">
            <div id="maintenance-job-panel">
              <OpsDashboardPanel eyebrow="Fleet maintenance" title="Maintenance jobs">
                <MaintenanceJobList jobs={recentMaintenanceJobs} role={auth.profile.role} />
              </OpsDashboardPanel>
            </div>
            <div id="fuel-log-panel">
              <OpsDashboardPanel eyebrow="Consumption" title="Recent fuel logs">
                <FuelLogList canManage={canRecordFuel} fuelLogs={recentFuelLogs} />
              </OpsDashboardPanel>
            </div>
          </section>

          {canCreateRequest ? (
            <details
              className="scroll-mt-24 rounded-lg border border-primary-dark/10 bg-white"
              id="equipment-request-create-panel"
              open={openRequestPanel}
            >
              <summary
                className={`flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 transition hover:text-primary-blue [&::-webkit-details-marker]:hidden ${OPS_FOCUS_CLASS}`}
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-blue text-white">
                  <Truck className="size-5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-heading text-xl font-bold text-primary-dark">
                    Create equipment request
                  </span>
                  <span className="mt-1 block text-sm text-primary-dark/60">
                    Request equipment for a site before operations schedules allocation.
                  </span>
                </span>
                <span className="shrink-0 text-xs font-bold uppercase tracking-[0.12em] text-primary-dark/45">
                  Open
                </span>
              </summary>
              {siteOptions.length === 0 ? (
                <div className="border-t border-primary-dark/10 p-5">
                  <div className="rounded-md border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
                    Add at least one active site before creating equipment requests.
                  </div>
                </div>
              ) : (
                <form
                  action={createEquipmentRequestAction}
                  className="grid gap-4 border-t border-primary-dark/10 p-5 min-[520px]:grid-cols-2 lg:grid-cols-6"
                >
                  <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
                    Site
                    <select className={OPS_INPUT_CLASS} defaultValue="" name="site_id" required>
                      <option value="" disabled>
                        Select site
                      </option>
                      {siteOptions.map((site) => (
                        <option key={site.id} value={site.id}>
                          {site.code} - {site.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
                    Category
                    <select className={OPS_INPUT_CLASS} defaultValue="" name="equipment_category_id">
                      <option value="">No category preference</option>
                      {categoryOptions.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.category_code} - {category.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
                    Preferred equipment
                    <select className={OPS_INPUT_CLASS} defaultValue="" name="preferred_equipment_id">
                      <option value="">No equipment preference</option>
                      {equipmentOptions.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.equipment_code} - {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
                    Title
                    <input className={OPS_INPUT_CLASS} name="title" required />
                  </label>
                  <label className={OPS_LABEL_CLASS}>
                    Quantity
                    <input className={OPS_INPUT_CLASS} defaultValue="1" min="1" name="quantity" type="number" />
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
                    Needed from
                    <input className={OPS_INPUT_CLASS} defaultValue={today} name="needed_from" type="date" />
                  </label>
                  <label className={OPS_LABEL_CLASS}>
                    Needed until
                    <input className={OPS_INPUT_CLASS} name="needed_until" type="date" />
                  </label>
                  <label className={`${OPS_LABEL_CLASS} min-[520px]:col-span-2 lg:col-span-6`}>
                    Description
                    <textarea className={`${OPS_INPUT_CLASS} min-h-24`} name="description" />
                  </label>
                  <div className="flex items-end min-[520px]:col-span-2 lg:col-span-6">
                    <button className={`${OPS_PRIMARY_BUTTON_CLASS} w-full md:w-auto`} type="submit">
                      <Plus className="size-4" aria-hidden="true" />
                      Create request
                    </button>
                  </div>
                </form>
              )}
            </details>
          ) : null}

          <section
            className="scroll-mt-24 rounded-lg border border-primary-dark/10 bg-white"
            id="equipment-request-register"
          >
            <div className="flex items-center justify-between gap-3 border-b border-primary-dark/10 p-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-dark/45">
                  Request register
                </p>
                <h2 className="font-heading text-xl font-bold text-primary-dark">
                  Equipment requests
                </h2>
                <p className="mt-1 text-sm text-primary-dark/60">
                  {requestPage.pagination.total} matching requests filtered by status and search.
                </p>
              </div>
              <Truck className="size-6 shrink-0 text-primary-blue" aria-hidden="true" />
            </div>
            <OpsListControls
              action="/ops/equipment"
              filters={[
                {
                  label: "Status",
                  name: "status",
                  options: REQUEST_STATUS_OPTIONS,
                  value: status,
                },
              ]}
              placeholder="Search request number, title, or description"
              query={listState.query}
              resultLabel="equipment requests"
            />

            {requestPage.items.length > 0 ? (
              <div className="divide-y divide-primary-dark/10">
                {requestPage.items.map((request) => {
                  const canSubmit = canSubmitOpsEquipmentRequest(auth.profile.id, auth.profile.role, request);
                  const canApprove = canApproveOpsEquipmentRequest(auth.profile.role, request);
                  const canReject = canRejectOpsEquipmentRequest(auth.profile.role, request);
                  const canCancel = canCancelOpsEquipmentRequest(auth.profile.id, auth.profile.role, request);
                  const canAllocate = canAllocateOpsEquipment(auth.profile.role, request);
                  const canManageActivity = canSubmit || canApprove || canReject || canCancel || canAllocate;

                  return (
                    <article className="p-5" key={request.id}>
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-heading text-lg font-bold text-primary-dark">
                              {request.request_number}
                            </h3>
                            <span
                              className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${requestStatusClass(
                                request.status,
                              )}`}
                            >
                              {formatLabel(request.status)}
                            </span>
                            <span className="inline-flex rounded-full border border-primary-dark/10 bg-primary-dark/[0.03] px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-primary-dark/55">
                              {formatLabel(request.priority)}
                            </span>
                          </div>
                          <p className="mt-2 font-bold text-primary-dark">{request.title}</p>
                          <p className="mt-1 text-sm leading-6 text-primary-dark/62">
                            {request.site ? `${request.site.code} - ${request.site.name}` : "Site unavailable"} /{" "}
                            {request.equipment_category?.name ?? "No category preference"}
                          </p>
                        </div>
                        <div className="grid gap-2 min-[520px]:grid-cols-2 lg:min-w-56 lg:grid-cols-1">
                          {canSubmit ? (
                            <form action={submitEquipmentRequestAction}>
                              <input name="request_id" type="hidden" value={request.id} />
                              <OpsConfirmSubmitButton className={`${OPS_PRIMARY_BUTTON_CLASS} w-full`} confirmText="Submit request">
                                <Send className="size-4" aria-hidden="true" />
                                Submit
                              </OpsConfirmSubmitButton>
                            </form>
                          ) : null}
                          {canApprove ? (
                            <form action={approveEquipmentRequestAction}>
                              <input name="request_id" type="hidden" value={request.id} />
                              <OpsConfirmSubmitButton className={`${OPS_PRIMARY_BUTTON_CLASS} w-full`} confirmText="Approve request">
                                <CheckCircle2 className="size-4" aria-hidden="true" />
                                Approve
                              </OpsConfirmSubmitButton>
                            </form>
                          ) : null}
                          {canReject ? (
                            <form action={rejectEquipmentRequestAction}>
                              <input name="request_id" type="hidden" value={request.id} />
                              <OpsConfirmSubmitButton className={`${OPS_DANGER_BUTTON_CLASS} w-full`} confirmText="Reject request">
                                <XCircle className="size-4" aria-hidden="true" />
                                Reject
                              </OpsConfirmSubmitButton>
                            </form>
                          ) : null}
                          {canCancel ? (
                            <form action={cancelEquipmentRequestAction}>
                              <input name="request_id" type="hidden" value={request.id} />
                              <OpsConfirmSubmitButton className={`${OPS_DANGER_BUTTON_CLASS} w-full`} confirmText="Cancel request">
                                Cancel
                              </OpsConfirmSubmitButton>
                            </form>
                          ) : null}
                        </div>
                      </div>

                      <dl className="mt-4 grid gap-3 md:grid-cols-5">
                        <FleetMetric label="Quantity" value={String(request.quantity)} />
                        <FleetMetric label="Needed from" value={formatDate(request.needed_from)} />
                        <FleetMetric label="Needed until" value={formatDate(request.needed_until)} />
                        <FleetMetric
                          label="Preferred"
                          value={request.preferred_equipment?.equipment_code ?? "None"}
                        />
                        <FleetMetric
                          label="Requested by"
                          value={formatOpsUserName(
                            request.requested_by_user?.full_name,
                            request.requested_by_user?.id,
                          )}
                        />
                      </dl>

                      {request.description ? (
                        <p className="mt-4 rounded-md border border-primary-dark/10 px-3 py-3 text-sm leading-6 text-primary-dark/65">
                          {request.description}
                        </p>
                      ) : null}

                      {canAllocate ? (
                        <div className="mt-4">
                          <AllocateEquipmentForm
                            equipmentOptions={availableEquipmentOptions}
                            request={request}
                            today={today}
                          />
                        </div>
                      ) : null}

                      {request.allocations.length > 0 ? (
                        <div className="mt-4 grid gap-3">
                          <AllocationList allocations={request.allocations} />
                          {request.allocations.map((allocation) => (
                            <AllocationControls
                              allocation={allocation}
                              key={allocation.id}
                              role={auth.profile.role}
                            />
                          ))}
                        </div>
                      ) : null}

                      <OpsRecordActivityPanel
                        canManage={canManageActivity}
                        sourceId={request.id}
                        sourceTable="equipment_requests"
                      />
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="flex min-h-56 flex-col items-center justify-center gap-3 p-8 text-center">
                <Truck className="size-10 text-primary-blue" aria-hidden="true" />
                <div>
                  <p className="font-heading text-xl font-bold text-primary-dark">
                    {hasActiveListFilter ? "No matching equipment requests" : "No equipment requests yet"}
                  </p>
                  <p className="mt-2 max-w-lg text-sm leading-6 text-primary-dark/60">
                    {hasActiveListFilter
                      ? "Adjust the search or status filter to widen the equipment request register."
                      : "Create the first request when a site needs equipment scheduled."}
                  </p>
                </div>
              </div>
            )}
            <OpsPaginationControls
              basePath="/ops/equipment"
              filters={[
                {
                  label: "Status",
                  name: "status",
                  options: [],
                  value: status,
                },
              ]}
              pagination={requestPage.pagination}
              query={listState.query}
              resultLabel="equipment requests"
            />
          </section>
        </div>

        <aside className="space-y-6">
          <div id="equipment-allocation-panel">
            <OpsDashboardPanel eyebrow="Allocation history" title="Recent allocations">
              <AllocationList allocations={recentAllocations} />
            </OpsDashboardPanel>
          </div>

          {canRecordFuel ? (
            <RecordFuelLogForm
              allocationOptions={recentAllocations}
              equipmentOptions={equipmentOptions}
              open={openFuelPanel}
              siteOptions={siteOptions}
              today={today}
            />
          ) : null}

          {canCreateMaintenance ? (
            <CreateMaintenanceJobForm
              equipmentOptions={equipmentOptions}
              open={openMaintenancePanel}
              siteOptions={siteOptions}
              today={today}
            />
          ) : null}

          {canManageMaster ? (
            <details
              className="scroll-mt-24 rounded-lg border border-primary-dark/10 bg-white"
              id="equipment-category-create-panel"
              open={openCategoryPanel}
            >
              <summary
                className={`flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 transition hover:text-primary-blue [&::-webkit-details-marker]:hidden ${OPS_FOCUS_CLASS}`}
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-blue text-white">
                  <Wrench className="size-5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-heading text-lg font-bold text-primary-dark">
                    Add category
                  </span>
                  <span className="mt-1 block text-sm text-primary-dark/60">
                    Excavator, roller, truck, pump, or plant class.
                  </span>
                </span>
                <span className="shrink-0 text-xs font-bold uppercase tracking-[0.12em] text-primary-dark/45">
                  Open
                </span>
              </summary>
              <form action={createEquipmentCategoryAction} className="grid gap-3 border-t border-primary-dark/10 p-5">
                <label className={OPS_LABEL_CLASS}>
                  Name
                  <input className={OPS_INPUT_CLASS} name="name" required />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Optional code
                  <input className={OPS_INPUT_CLASS} name="category_code" />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Default daily rate
                  <input className={OPS_INPUT_CLASS} min="0" name="default_daily_rate" step="0.01" type="number" />
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Description
                  <input className={OPS_INPUT_CLASS} name="description" />
                </label>
                <button className={OPS_SECONDARY_BUTTON_CLASS} type="submit">
                  <Plus className="size-4" aria-hidden="true" />
                  Add category
                </button>
              </form>
            </details>
          ) : null}

          {canManageMaster ? (
            <details
              className="scroll-mt-24 rounded-lg border border-primary-dark/10 bg-white"
              id="equipment-create-panel"
              open={openEquipmentPanel}
            >
              <summary
                className={`flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 transition hover:text-primary-blue [&::-webkit-details-marker]:hidden ${OPS_FOCUS_CLASS}`}
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-blue text-white">
                  <Truck className="size-5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-heading text-lg font-bold text-primary-dark">
                    Add equipment
                  </span>
                  <span className="mt-1 block text-sm text-primary-dark/60">
                    Register owned, hired, or leased equipment.
                  </span>
                </span>
                <span className="shrink-0 text-xs font-bold uppercase tracking-[0.12em] text-primary-dark/45">
                  Open
                </span>
              </summary>
              {categoryOptions.length === 0 ? (
                <div className="border-t border-primary-dark/10 p-5">
                  <div className="rounded-md border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
                    Add at least one equipment category before creating equipment records.
                  </div>
                </div>
              ) : (
                <form action={createEquipmentAction} className="grid gap-3 border-t border-primary-dark/10 p-5">
                  <label className={OPS_LABEL_CLASS}>
                    Equipment name
                    <input className={OPS_INPUT_CLASS} name="name" required />
                  </label>
                  <label className={OPS_LABEL_CLASS}>
                    Optional code
                    <input className={OPS_INPUT_CLASS} name="equipment_code" />
                  </label>
                  <label className={OPS_LABEL_CLASS}>
                    Category
                    <select className={OPS_INPUT_CLASS} defaultValue="" name="category_id" required>
                      <option value="" disabled>
                        Select category
                      </option>
                      {categoryOptions.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.category_code} - {category.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={OPS_LABEL_CLASS}>
                    Ownership
                    <select className={OPS_INPUT_CLASS} defaultValue="company_owned" name="ownership">
                      {OWNERSHIP_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={OPS_LABEL_CLASS}>
                    Daily rate
                    <input className={OPS_INPUT_CLASS} min="0" name="daily_rate" step="0.01" type="number" />
                  </label>
                  <label className={OPS_LABEL_CLASS}>
                    Base location
                    <input className={OPS_INPUT_CLASS} name="base_location" />
                  </label>
                  <label className={OPS_LABEL_CLASS}>
                    Current site
                    <select className={OPS_INPUT_CLASS} defaultValue="" name="current_site_id">
                      <option value="">No current site</option>
                      {siteOptions.map((site) => (
                        <option key={site.id} value={site.id}>
                          {site.code} - {site.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={OPS_LABEL_CLASS}>
                    Registration
                    <input className={OPS_INPUT_CLASS} name="registration_number" />
                  </label>
                  <label className={OPS_LABEL_CLASS}>
                    Serial number
                    <input className={OPS_INPUT_CLASS} name="serial_number" />
                  </label>
                  <label className="inline-flex min-h-11 items-center gap-2 rounded-md border border-primary-dark/10 px-3 py-2 text-sm font-bold text-primary-dark/65">
                    <input className="size-4" name="fuel_tracking_enabled" type="checkbox" />
                    Track fuel
                  </label>
                  <label className={OPS_LABEL_CLASS}>
                    Notes
                    <input className={OPS_INPUT_CLASS} name="notes" />
                  </label>
                  <button className={OPS_SECONDARY_BUTTON_CLASS} type="submit">
                    <Plus className="size-4" aria-hidden="true" />
                    Add equipment
                  </button>
                </form>
              )}
            </details>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
