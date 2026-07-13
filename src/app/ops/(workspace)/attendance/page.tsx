import {
  BadgeDollarSign,
  CalendarDays,
  Check,
  ClipboardCheck,
  Clock,
  Filter,
  Pencil,
  Plus,
  UserCheck,
  UserX,
} from "lucide-react";
import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OpsConfirmSubmitButton } from "@/components/ops/OpsConfirmSubmitButton";
import {
  OpsMobileRecordCard,
  OpsMobileRecordList,
  OpsMobileRecordRow,
} from "@/components/ops/OpsMobileRecord";
import { OpsOfflineForm } from "@/components/ops/OpsOfflineForm";
import { OpsSubmitButton } from "@/components/ops/OpsSubmitButton";
import { requireOpsUser } from "@/lib/ops/auth";
import {
  approveAttendanceAction,
  cancelAttendanceAction,
  createAttendanceAction,
  updateAttendanceAction,
} from "@/lib/ops/attendance-actions";
import {
  fetchAttendanceWorkerOptions,
  fetchOpsAttendanceDailySummary,
  fetchOpsAttendanceRecords,
  type OpsAttendanceFilters,
  type OpsAttendanceRecord,
} from "@/lib/ops/attendance";
import { OPS_CHART_COLORS, OpsTrendChart } from "@/components/ops/OpsAnalyticsCharts";
import { OpsKpiCard } from "@/components/ops/OpsKpiCard";
import { canAccessOpsHref, canApproveAttendance, canRecordAttendance } from "@/lib/ops/permissions";
import { fetchActiveSiteOptions } from "@/lib/ops/sites";
import type { OpsAttendancePresence } from "@/lib/ops/types";
import {
  firstParam,
  formatZmw,
  opsStatusBadgeClass,
  noticeFromParams,
  OPS_INPUT_CLASS,
  OPS_LABEL_CLASS,
  OPS_PRIMARY_BUTTON_CLASS,
  OPS_DANGER_BUTTON_CLASS,
  OPS_SECONDARY_BUTTON_CLASS,
  OPS_TABLE_SCROLL_CLASS,
  type OpsSearchParams,
  OPS_NOTICE_WARNING_CLASS,
} from "@/lib/ops/ui";
import { todayInLusaka, formatOpsDateTime as formatDateTime } from "@/lib/ops/format";

type PageProps = {
  searchParams?: Promise<OpsSearchParams>;
};

function attendanceNotice(params: OpsSearchParams) {
  const baseNotice = noticeFromParams(
    params,
    "attendance",
    "Attendance record created successfully.",
  );

  if (baseNotice) {
    return baseNotice;
  }

  if (firstParam(params.updated) === "approved") {
    return {
      tone: "success" as const,
      message: "Attendance record approved.",
    };
  }

  if (firstParam(params.updated) === "record") {
    return {
      tone: "success" as const,
      message: "Attendance record updated.",
    };
  }

  if (firstParam(params.updated) === "cancelled") {
    return {
      tone: "success" as const,
      message: "Attendance record cancelled.",
    };
  }

  return null;
}

const PRESENCE_OPTIONS: Array<{ label: string; value: OpsAttendancePresence }> = [
  { label: "Present", value: "present" },
  { label: "Late", value: "late" },
  { label: "Absent", value: "absent" },
];

function presenceFromParam(value: string | undefined): OpsAttendancePresence | null {
  return PRESENCE_OPTIONS.some((option) => option.value === value)
    ? (value as OpsAttendancePresence)
    : null;
}

function approvalFromParam(value: string | undefined): "approved" | "pending" | null {
  return value === "approved" || value === "pending" ? value : null;
}

function dateParam(value: string | undefined): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

/**
 * Pull the clock time (HH:MM, Africa/Lusaka) back out of a stored timestamp so
 * the inline edit form can pre-fill the time inputs.
 */
function lusakaTimeValue(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Africa/Lusaka",
  }).format(new Date(value));
}

function lusakaDateValue(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Africa/Lusaka",
  }).format(new Date(value));
}

type AttendanceWorkerOption = { id: string; worker_code: string; full_name: string };
type AttendanceSiteOption = { id: string; code: string; name: string };

function AttendanceEditPanel({
  record,
  siteOptions,
  workerOptions,
}: {
  record: OpsAttendanceRecord;
  siteOptions: AttendanceSiteOption[];
  workerOptions: AttendanceWorkerOption[];
}) {
  return (
    <details className="rounded-md border border-border">
      <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs font-semibold text-muted-foreground">
        <Pencil className="size-3.5" aria-hidden="true" />
        Edit / correct fields
      </summary>
      <form
        action={updateAttendanceAction}
        className="grid gap-3 border-t border-border p-4 md:grid-cols-2 lg:grid-cols-4"
      >
        <input name="id" type="hidden" value={record.id} />
        {/* Preserve stored coordinates so an edit does not wipe them. */}
        <input
          name="gps_latitude"
          type="hidden"
          value={record.gps_latitude ?? ""}
        />
        <input
          name="gps_longitude"
          type="hidden"
          value={record.gps_longitude ?? ""}
        />
        <label className={OPS_LABEL_CLASS}>
          Worker
          <select
            className={OPS_INPUT_CLASS}
            defaultValue={record.worker?.id ?? ""}
            name="worker_id"
            required
          >
            {workerOptions.map((worker) => (
              <option key={worker.id} value={worker.id}>
                {worker.worker_code} - {worker.full_name}
              </option>
            ))}
          </select>
        </label>
        <label className={OPS_LABEL_CLASS}>
          Site
          <select
            className={OPS_INPUT_CLASS}
            defaultValue={record.site?.id ?? ""}
            name="site_id"
            required
          >
            {siteOptions.map((site) => (
              <option key={site.id} value={site.id}>
                {site.code} - {site.name}
              </option>
            ))}
          </select>
        </label>
        <label className={OPS_LABEL_CLASS}>
          Date
          <input
            className={OPS_INPUT_CLASS}
            defaultValue={lusakaDateValue(record.clock_in_at)}
            name="work_date"
            required
            type="date"
          />
        </label>
        <label className={OPS_LABEL_CLASS}>
          Presence
          <select
            className={OPS_INPUT_CLASS}
            defaultValue={record.presence}
            name="presence"
          >
            {PRESENCE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className={OPS_LABEL_CLASS}>
          Clock in
          <input
            className={OPS_INPUT_CLASS}
            defaultValue={lusakaTimeValue(record.clock_in_at)}
            name="clock_in_time"
            required
            type="time"
          />
        </label>
        <label className={OPS_LABEL_CLASS}>
          Clock out
          <input
            className={OPS_INPUT_CLASS}
            defaultValue={lusakaTimeValue(record.clock_out_at)}
            name="clock_out_time"
            type="time"
          />
        </label>
        <label className={OPS_LABEL_CLASS}>
          Hours
          <input
            className={OPS_INPUT_CLASS}
            defaultValue={record.hours_worked}
            max="24"
            min="0"
            name="hours_worked"
            required
            step="0.25"
            type="number"
          />
        </label>
        <label className={OPS_LABEL_CLASS}>
          GPS or site note
          <input
            className={OPS_INPUT_CLASS}
            defaultValue={record.gps_label}
            name="gps_label"
          />
        </label>
        <div className="flex items-end lg:col-span-4">
          <button className={`${OPS_PRIMARY_BUTTON_CLASS} w-full sm:w-auto`} type="submit">
            <Pencil className="size-4" aria-hidden="true" />
            Save corrections
          </button>
        </div>
      </form>
    </details>
  );
}

export default async function OpsAttendancePage({ searchParams }: PageProps) {
  const [params, auth] = await Promise.all([
    searchParams ?? Promise.resolve({} as OpsSearchParams),
    requireOpsUser(),
  ]);

  if (!canAccessOpsHref(auth.profile.role, "/ops/attendance")) {
    notFound();
  }

  const filters: OpsAttendanceFilters = {
    siteId: firstParam(params.site_id) || null,
    workerId: firstParam(params.worker_id) || null,
    presence: presenceFromParam(firstParam(params.presence)),
    approval: approvalFromParam(firstParam(params.approval)),
    dateFrom: dateParam(firstParam(params.date_from)),
    dateTo: dateParam(firstParam(params.date_to)),
  };
  const hasActiveFilter = Object.values(filters).some(Boolean);

  const [records, workerOptions, siteOptions, dailySummary] = await Promise.all([
    fetchOpsAttendanceRecords(filters),
    fetchAttendanceWorkerOptions(),
    fetchActiveSiteOptions(),
    fetchOpsAttendanceDailySummary(7),
  ]);
  const canRecord = canRecordAttendance(auth.profile.role);
  const canApprove = canApproveAttendance(auth.profile.role);
  const notice = attendanceNotice(params);
  const pendingCount = records.filter((record) => !record.approved_at).length;
  const earnedTotal = records.reduce((sum, record) => sum + record.amount_earned, 0);

  // Real day-over-day movement for the KPI trend arrows.
  const yesterday = dailySummary.days.at(-2);
  const presentDelta = yesterday ? dailySummary.today.present - yesterday.present : 0;

  return (
    <div className="w-full max-w-none space-y-6">
      <section className="rounded-lg border border-border bg-card p-5 md:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-blue">
              Pymble Attendance
            </p>
            <h1 className="mt-2 font-heading text-3xl font-bold text-foreground">
              Daily timesheets
            </h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-foreground/68">
              Manual attendance capture for site teams, with approval tracking for payroll.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-md border border-border px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Records
              </p>
              <p className="mt-1 font-heading text-2xl font-bold text-foreground">
                {records.length}
              </p>
            </div>
            <div className="rounded-md border border-border px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Pending
              </p>
              <p className="mt-1 font-heading text-2xl font-bold text-foreground">
                {pendingCount}
              </p>
            </div>
            <div className="rounded-md border border-border px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Earned
              </p>
              <p className="mt-1 font-heading text-2xl font-bold text-foreground">
                {formatZmw(earnedTotal)}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <OpsKpiCard
          href="/ops/attendance?presence=present"
          icon={UserCheck}
          label="Present today"
          tone={dailySummary.today.present > 0 ? "good" : "default"}
          trend={
            yesterday
              ? `${presentDelta >= 0 ? "+" : ""}${presentDelta} vs yesterday`
              : undefined
          }
          trendDirection={presentDelta > 0 ? "up" : presentDelta < 0 ? "down" : "flat"}
          sparkline={dailySummary.days.map((day) => day.present)}
          value={dailySummary.today.present.toLocaleString("en-ZM")}
        />
        <OpsKpiCard
          href="/ops/attendance?presence=late"
          icon={Clock}
          label="Late today"
          tone={dailySummary.today.late > 0 ? "warn" : "good"}
          value={dailySummary.today.late.toLocaleString("en-ZM")}
        />
        <OpsKpiCard
          href="/ops/attendance?presence=absent"
          icon={UserX}
          label="Absent today"
          tone={dailySummary.today.absent > 0 ? "critical" : "good"}
          value={dailySummary.today.absent.toLocaleString("en-ZM")}
        />
        <OpsKpiCard
          href="/ops/attendance?approval=pending"
          icon={ClipboardCheck}
          label="Pending approval today"
          tone={dailySummary.today.pendingApproval > 0 ? "warn" : "good"}
          hint={dailySummary.today.pendingApproval > 0 ? "Blocks payroll" : undefined}
          value={dailySummary.today.pendingApproval.toLocaleString("en-ZM")}
        />
      </section>

      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="font-heading text-xl font-bold text-foreground">
          Daily headcount — last {dailySummary.windowDays} days
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Present, late and absent records per work day across all sites.
        </p>
        <div className="mt-4">
          <OpsTrendChart
            ariaLabel={`Daily attendance headcount for the last ${dailySummary.windowDays} days`}
            emptyMessage="No attendance captured in the last 7 days"
            points={dailySummary.days.map((day) => ({
              label: day.label,
              present: day.present,
              late: day.late,
              absent: day.absent,
            }))}
            series={[
              { key: "present", label: "Present", color: OPS_CHART_COLORS.emerald, kind: "bar" },
              { key: "late", label: "Late", color: OPS_CHART_COLORS.amber, kind: "bar" },
              { key: "absent", label: "Absent", color: OPS_CHART_COLORS.red, kind: "bar" },
            ]}
          />
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

      {canRecord ? (
        <section className="rounded-lg border border-border bg-card p-5">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-md bg-primary-blue text-white">
              <Plus className="size-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="font-heading text-xl font-bold text-foreground">
                Add attendance
              </h2>
              <p className="text-sm text-muted-foreground">
                Amount earned is calculated from the worker daily rate.
              </p>
            </div>
          </div>
          {workerOptions.length === 0 || siteOptions.length === 0 ? (
            <div className={OPS_NOTICE_WARNING_CLASS}>
              Add at least one site and one worker before recording attendance.
            </div>
          ) : (
            <OpsOfflineForm
              action={createAttendanceAction}
              className="grid gap-4 min-[520px]:grid-cols-2 lg:grid-cols-6"
              kind="attendance.create"
              replayEndpoint="/api/ops/offline/attendance"
              summary="Attendance record"
            >
              <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
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
              <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
                Site
                <select className={OPS_INPUT_CLASS} defaultValue="" name="site_id" required>
                  <option value="" disabled>
                    Select Pymble site
                  </option>
                  {siteOptions.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.code} - {site.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={OPS_LABEL_CLASS}>
                Date
                <input
                  className={OPS_INPUT_CLASS}
                  defaultValue={todayInLusaka()}
                  name="work_date"
                  required
                  type="date"
                />
              </label>
              <label className={OPS_LABEL_CLASS}>
                Presence
                <select className={OPS_INPUT_CLASS} defaultValue="present" name="presence">
                  <option value="present">Present</option>
                  <option value="late">Late</option>
                  <option value="absent">Absent</option>
                </select>
              </label>
              <label className={OPS_LABEL_CLASS}>
                Clock in
                <input
                  className={OPS_INPUT_CLASS}
                  name="clock_in_time"
                  required
                  type="time"
                />
              </label>
              <label className={OPS_LABEL_CLASS}>
                Clock out
                <input
                  className={OPS_INPUT_CLASS}
                  name="clock_out_time"
                  type="time"
                />
              </label>
              <label className={OPS_LABEL_CLASS}>
                Hours
                <input
                  className={OPS_INPUT_CLASS}
                  max="24"
                  min="0"
                  name="hours_worked"
                  required
                  step="0.25"
                  type="number"
                />
              </label>
              <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
                GPS or site note
                <input className={OPS_INPUT_CLASS} name="gps_label" />
              </label>
              <label className={OPS_LABEL_CLASS}>
                GPS latitude
                <input className={OPS_INPUT_CLASS} inputMode="decimal" name="gps_latitude" />
              </label>
              <label className={OPS_LABEL_CLASS}>
                GPS longitude
                <input className={OPS_INPUT_CLASS} inputMode="decimal" name="gps_longitude" />
              </label>
              <div className="flex items-end min-[520px]:col-span-2 lg:col-span-1">
                <OpsSubmitButton className={`${OPS_PRIMARY_BUTTON_CLASS} w-full`} pendingLabel="Adding...">
                  <Plus className="size-4" aria-hidden="true" />
                  Add record
                </OpsSubmitButton>
              </div>
            </OpsOfflineForm>
          )}
        </section>
      ) : (
        <div className="rounded-md border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          Your role does not have attendance recording permissions. Contact your manager to request
          access.
        </div>
      )}

      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-border p-5">
          <h2 className="font-heading text-xl font-bold text-foreground">Recent attendance</h2>
        </div>
        <form
          action="/ops/attendance"
          className="grid gap-3 border-b border-border bg-muted/40 p-5 md:grid-cols-2 lg:grid-cols-6"
          method="get"
        >
          <label className={OPS_LABEL_CLASS}>
            Site
            <select className={OPS_INPUT_CLASS} defaultValue={filters.siteId ?? ""} name="site_id">
              <option value="">All sites</option>
              {siteOptions.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.code} - {site.name}
                </option>
              ))}
            </select>
          </label>
          <label className={OPS_LABEL_CLASS}>
            Worker
            <select
              className={OPS_INPUT_CLASS}
              defaultValue={filters.workerId ?? ""}
              name="worker_id"
            >
              <option value="">All workers</option>
              {workerOptions.map((worker) => (
                <option key={worker.id} value={worker.id}>
                  {worker.worker_code} - {worker.full_name}
                </option>
              ))}
            </select>
          </label>
          <label className={OPS_LABEL_CLASS}>
            Presence
            <select
              className={OPS_INPUT_CLASS}
              defaultValue={filters.presence ?? ""}
              name="presence"
            >
              <option value="">All</option>
              {PRESENCE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className={OPS_LABEL_CLASS}>
            Approval
            <select
              className={OPS_INPUT_CLASS}
              defaultValue={filters.approval ?? ""}
              name="approval"
            >
              <option value="">All</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
            </select>
          </label>
          <label className={OPS_LABEL_CLASS}>
            From
            <input
              className={OPS_INPUT_CLASS}
              defaultValue={filters.dateFrom ?? ""}
              name="date_from"
              type="date"
            />
          </label>
          <label className={OPS_LABEL_CLASS}>
            To
            <input
              className={OPS_INPUT_CLASS}
              defaultValue={filters.dateTo ?? ""}
              name="date_to"
              type="date"
            />
          </label>
          <div className="flex flex-wrap items-end gap-2 md:col-span-2 lg:col-span-6">
            <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
              <Filter className="size-4" aria-hidden="true" />
              Apply filters
            </button>
            {hasActiveFilter ? (
              <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/attendance">
                Clear
              </Link>
            ) : null}
          </div>
        </form>
        {records.length > 0 ? (
          <>
            <OpsMobileRecordList>
              {records.map((record) => (
                <OpsMobileRecordCard key={record.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-heading text-lg font-bold text-foreground">
                        {record.worker?.full_name ?? "Worker record unavailable"}
                      </p>
                      <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        {record.worker?.worker_code ?? "Worker code unavailable"}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 ${opsStatusBadgeClass(record.presence)}`}
                    >
                      {record.presence}
                    </span>
                  </div>
                  <OpsMobileRecordRow label="Site">
                    {record.site?.code
                      ? `${record.site.code} - ${record.site.name}`
                      : "Site record unavailable"}
                  </OpsMobileRecordRow>
                  <OpsMobileRecordRow label="Clock in">
                    {formatDateTime(record.clock_in_at)}
                  </OpsMobileRecordRow>
                  <OpsMobileRecordRow label="Hours">
                    {record.hours_worked.toLocaleString("en-ZM", {
                      maximumFractionDigits: 2,
                    })}
                  </OpsMobileRecordRow>
                  {record.overtime_hours > 0 ? (
                    <OpsMobileRecordRow label="OT Hours">
                      {record.overtime_hours.toLocaleString("en-ZM", {
                        maximumFractionDigits: 2,
                      })}
                      h
                    </OpsMobileRecordRow>
                  ) : null}
                  {record.overtime_amount > 0 ? (
                    <OpsMobileRecordRow label="OT Pay">
                      {formatZmw(record.overtime_amount)}
                    </OpsMobileRecordRow>
                  ) : null}
                  <OpsMobileRecordRow label="Earned">
                    {formatZmw(record.amount_earned)}
                  </OpsMobileRecordRow>
                  <OpsMobileRecordRow label="Approval">
                    {record.approved_at ? (
                      <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-emerald-700">
                        <Check className="size-3" aria-hidden="true" />
                        Approved
                      </span>
                    ) : canRecord ? (
                      <div className="flex flex-wrap items-center gap-2">
                        {canApprove ? (
                          <form action={approveAttendanceAction}>
                            <input name="id" type="hidden" value={record.id} />
                            <OpsConfirmSubmitButton
                              className={OPS_SECONDARY_BUTTON_CLASS}
                              confirmText="Confirm approval"
                            >
                              <Check className="size-3" aria-hidden="true" />
                              Approve
                            </OpsConfirmSubmitButton>
                          </form>
                        ) : null}
                        <form action={cancelAttendanceAction}>
                          <input name="id" type="hidden" value={record.id} />
                          <OpsConfirmSubmitButton
                            className={OPS_DANGER_BUTTON_CLASS}
                            confirmText="Confirm cancel"
                          >
                            Cancel
                          </OpsConfirmSubmitButton>
                        </form>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Pending</span>
                    )}
                  </OpsMobileRecordRow>
                  {canRecord && !record.approved_at ? (
                    <AttendanceEditPanel
                      record={record}
                      siteOptions={siteOptions}
                      workerOptions={workerOptions}
                    />
                  ) : null}
                </OpsMobileRecordCard>
              ))}
            </OpsMobileRecordList>
            <div
              aria-label="Recent attendance table"
              className={`hidden md:block ${OPS_TABLE_SCROLL_CLASS}`}
              tabIndex={0}
            >
            <table className="min-w-full divide-y divide-border text-sm">
              <caption className="sr-only">
                Recent attendance records with worker, site, time, earned amount, status, and approval.
              </caption>
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-[0.12em] text-muted-foreground">
                <tr>
                  <th className="px-5 py-3" scope="col">
                    Worker
                  </th>
                  <th className="px-5 py-3" scope="col">
                    Site
                  </th>
                  <th className="px-5 py-3" scope="col">
                    Time
                  </th>
                  <th className="px-5 py-3" scope="col">
                    Hours
                  </th>
                  <th className="px-5 py-3" scope="col">
                    OT Hours
                  </th>
                  <th className="px-5 py-3" scope="col">
                    OT Pay
                  </th>
                  <th className="px-5 py-3" scope="col">
                    Earned
                  </th>
                  <th className="px-5 py-3" scope="col">
                    Status
                  </th>
                  <th className="px-5 py-3" scope="col">
                    Approval
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {records.map((record) => (
                  <React.Fragment key={record.id}>
                  <tr>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary-dark text-white">
                          <ClipboardCheck className="size-4" aria-hidden="true" />
                        </div>
                        <div>
                          <p className="font-bold text-foreground">
                            {record.worker?.full_name ?? "Worker record unavailable"}
                          </p>
                          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                            {record.worker?.worker_code ?? "Worker code unavailable"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-foreground/70">
                      {record.site?.code
                        ? `${record.site.code} - ${record.site.name}`
                        : "Site record unavailable"}
                    </td>
                    <td className="px-5 py-4 text-foreground/70">
                      <span className="inline-flex items-center gap-2">
                        <Clock className="size-4 text-primary-blue" aria-hidden="true" />
                        {formatDateTime(record.clock_in_at)}
                      </span>
                    </td>
                    <td className="px-5 py-4 font-semibold text-foreground">
                      {record.hours_worked.toLocaleString("en-ZM", {
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className="px-5 py-4 text-foreground/70">
                      {record.overtime_hours > 0
                        ? `${record.overtime_hours.toLocaleString("en-ZM", {
                            maximumFractionDigits: 2,
                          })}h`
                        : "—"}
                    </td>
                    <td className="px-5 py-4 text-foreground/70">
                      {record.overtime_amount > 0 ? formatZmw(record.overtime_amount) : "—"}
                    </td>
                    <td className="px-5 py-4 font-semibold text-foreground">
                      <span className="inline-flex items-center gap-2">
                        <BadgeDollarSign className="size-4 text-primary-blue" aria-hidden="true" />
                        {formatZmw(record.amount_earned)}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={opsStatusBadgeClass(record.presence)}
                      >
                        {record.presence}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      {record.approved_at ? (
                        <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-emerald-700">
                          <Check className="size-3" aria-hidden="true" />
                          Approved
                        </span>
                      ) : canRecord ? (
                        <div className="flex flex-wrap items-center gap-2">
                          {canApprove ? (
                            <form action={approveAttendanceAction}>
                              <input name="id" type="hidden" value={record.id} />
                              <OpsConfirmSubmitButton
                                className={OPS_SECONDARY_BUTTON_CLASS}
                                confirmText="Confirm approval"
                              >
                                <Check className="size-3" aria-hidden="true" />
                                Approve
                              </OpsConfirmSubmitButton>
                            </form>
                          ) : null}
                          <form action={cancelAttendanceAction}>
                            <input name="id" type="hidden" value={record.id} />
                            <OpsConfirmSubmitButton
                              className={OPS_DANGER_BUTTON_CLASS}
                              confirmText="Confirm cancel"
                            >
                              Cancel
                            </OpsConfirmSubmitButton>
                          </form>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Pending</span>
                      )}
                    </td>
                  </tr>
                  {canRecord && !record.approved_at ? (
                    <tr>
                      <td className="px-5 pb-4 pt-0" colSpan={9}>
                        <AttendanceEditPanel
                          record={record}
                          siteOptions={siteOptions}
                          workerOptions={workerOptions}
                        />
                      </td>
                    </tr>
                  ) : null}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
            </div>
          </>
        ) : (
          <div className="flex min-h-56 flex-col items-center justify-center gap-3 p-8 text-center">
            <CalendarDays className="size-10 text-primary-blue" aria-hidden="true" />
            <div>
              <p className="font-heading text-xl font-bold text-foreground">
                {hasActiveFilter ? "No matching attendance records" : "No attendance records yet"}
              </p>
              <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
                {hasActiveFilter
                  ? "Adjust or clear the filters above to widen the attendance list."
                  : "Attendance records will appear here after the first timesheet is captured."}
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
