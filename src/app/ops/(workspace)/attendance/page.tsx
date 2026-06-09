import { BadgeDollarSign, CalendarDays, Check, ClipboardCheck, Clock, Plus } from "lucide-react";
import { notFound } from "next/navigation";
import { OpsConfirmSubmitButton } from "@/components/ops/OpsConfirmSubmitButton";
import {
  OpsMobileRecordCard,
  OpsMobileRecordList,
  OpsMobileRecordRow,
} from "@/components/ops/OpsMobileRecord";
import { requireOpsUser } from "@/lib/ops/auth";
import {
  approveAttendanceAction,
  createAttendanceAction,
} from "@/lib/ops/attendance-actions";
import {
  fetchAttendanceWorkerOptions,
  fetchOpsAttendanceRecords,
  type OpsAttendanceRecord,
} from "@/lib/ops/attendance";
import { canAccessOpsHref, canRecordAttendance } from "@/lib/ops/permissions";
import { fetchActiveSiteOptions } from "@/lib/ops/sites";
import {
  firstParam,
  formatZmw,
  noticeFromParams,
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

function todayInLusaka() {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Africa/Lusaka",
    year: "numeric",
  }).format(new Date());
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-ZM", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Lusaka",
  }).format(new Date(value));
}

function presenceClass(presence: OpsAttendanceRecord["presence"]) {
  if (presence === "present") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (presence === "late") {
    return "border-orange-200 bg-orange-50 text-orange-700";
  }

  return "border-red-200 bg-red-50 text-red-700";
}

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

  return null;
}

export default async function OpsAttendancePage({ searchParams }: PageProps) {
  const [params, auth] = await Promise.all([searchParams ?? Promise.resolve({}), requireOpsUser()]);

  if (!canAccessOpsHref(auth.profile.role, "/ops/attendance")) {
    notFound();
  }

  const [records, workerOptions, siteOptions] = await Promise.all([
    fetchOpsAttendanceRecords(),
    fetchAttendanceWorkerOptions(),
    fetchActiveSiteOptions(),
  ]);
  const canRecord = canRecordAttendance(auth.profile.role);
  const notice = attendanceNotice(params);
  const pendingCount = records.filter((record) => !record.approved_at).length;
  const earnedTotal = records.reduce((sum, record) => sum + record.amount_earned, 0);

  return (
    <div className="w-full max-w-none space-y-6">
      <section className="rounded-lg border border-primary-dark/10 bg-white p-5 md:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-blue">
              Pymble Attendance
            </p>
            <h1 className="mt-2 font-heading text-3xl font-bold text-primary-dark">
              Daily timesheets
            </h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-primary-dark/68">
              Manual attendance capture for site teams, with approval tracking for payroll.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-md border border-primary-dark/10 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-dark/45">
                Records
              </p>
              <p className="mt-1 font-heading text-2xl font-bold text-primary-dark">
                {records.length}
              </p>
            </div>
            <div className="rounded-md border border-primary-dark/10 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-dark/45">
                Pending
              </p>
              <p className="mt-1 font-heading text-2xl font-bold text-primary-dark">
                {pendingCount}
              </p>
            </div>
            <div className="rounded-md border border-primary-dark/10 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-dark/45">
                Earned
              </p>
              <p className="mt-1 font-heading text-2xl font-bold text-primary-dark">
                {formatZmw(earnedTotal)}
              </p>
            </div>
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

      {canRecord ? (
        <section className="rounded-lg border border-primary-dark/10 bg-white p-5">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-md bg-primary-blue text-white">
              <Plus className="size-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="font-heading text-xl font-bold text-primary-dark">
                Add attendance
              </h2>
              <p className="text-sm text-primary-dark/60">
                Amount earned is calculated from the worker daily rate.
              </p>
            </div>
          </div>
          {workerOptions.length === 0 || siteOptions.length === 0 ? (
            <div className="rounded-md border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
              Add at least one site and one worker before recording attendance.
            </div>
          ) : (
            <form
              action={createAttendanceAction}
              className="grid gap-4 min-[520px]:grid-cols-2 lg:grid-cols-6"
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
                <button
                  className={`${OPS_PRIMARY_BUTTON_CLASS} w-full`}
                  type="submit"
                >
                  <Plus className="size-4" aria-hidden="true" />
                  Add record
                </button>
              </div>
            </form>
          )}
        </section>
      ) : (
        <div className="rounded-md border border-primary-dark/10 bg-white px-4 py-3 text-sm text-primary-dark/65">
          Your role does not have attendance recording permissions. Contact your manager to request
          access.
        </div>
      )}

      <section className="rounded-lg border border-primary-dark/10 bg-white">
        <div className="border-b border-primary-dark/10 p-5">
          <h2 className="font-heading text-xl font-bold text-primary-dark">Recent attendance</h2>
        </div>
        {records.length > 0 ? (
          <>
            <OpsMobileRecordList>
              {records.map((record) => (
                <OpsMobileRecordCard key={record.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-heading text-lg font-bold text-primary-dark">
                        {record.worker?.full_name ?? "Worker record unavailable"}
                      </p>
                      <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-primary-dark/45">
                        {record.worker?.worker_code ?? "Worker code unavailable"}
                      </p>
                    </div>
                    <span
                      className={`inline-flex shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${presenceClass(record.presence)}`}
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
                    ) : (
                      <span className="text-primary-dark/50">Pending</span>
                    )}
                  </OpsMobileRecordRow>
                </OpsMobileRecordCard>
              ))}
            </OpsMobileRecordList>
            <div
              aria-label="Recent attendance table"
              className={`hidden md:block ${OPS_TABLE_SCROLL_CLASS}`}
              tabIndex={0}
            >
            <table className="min-w-full divide-y divide-primary-dark/10 text-sm">
              <caption className="sr-only">
                Recent attendance records with worker, site, time, earned amount, status, and approval.
              </caption>
              <thead className="bg-primary-dark/[0.03] text-left text-xs uppercase tracking-[0.12em] text-primary-dark/52">
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
              <tbody className="divide-y divide-primary-dark/10">
                {records.map((record) => (
                  <tr key={record.id}>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary-dark text-white">
                          <ClipboardCheck className="size-4" aria-hidden="true" />
                        </div>
                        <div>
                          <p className="font-bold text-primary-dark">
                            {record.worker?.full_name ?? "Worker record unavailable"}
                          </p>
                          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-primary-dark/45">
                            {record.worker?.worker_code ?? "Worker code unavailable"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-primary-dark/70">
                      {record.site?.code
                        ? `${record.site.code} - ${record.site.name}`
                        : "Site record unavailable"}
                    </td>
                    <td className="px-5 py-4 text-primary-dark/70">
                      <span className="inline-flex items-center gap-2">
                        <Clock className="size-4 text-primary-blue" aria-hidden="true" />
                        {formatDateTime(record.clock_in_at)}
                      </span>
                    </td>
                    <td className="px-5 py-4 font-semibold text-primary-dark">
                      {record.hours_worked.toLocaleString("en-ZM", {
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className="px-5 py-4 font-semibold text-primary-dark">
                      <span className="inline-flex items-center gap-2">
                        <BadgeDollarSign className="size-4 text-primary-blue" aria-hidden="true" />
                        {formatZmw(record.amount_earned)}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${presenceClass(record.presence)}`}
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
                      ) : (
                        <span className="text-primary-dark/50">Pending</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </>
        ) : (
          <div className="flex min-h-56 flex-col items-center justify-center gap-3 p-8 text-center">
            <CalendarDays className="size-10 text-primary-blue" aria-hidden="true" />
            <div>
              <p className="font-heading text-xl font-bold text-primary-dark">
                No attendance records yet
              </p>
              <p className="mt-2 max-w-lg text-sm leading-6 text-primary-dark/60">
                Attendance records will appear here after the first timesheet is captured.
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
