import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileText,
  HardHat,
  Plus,
  Send,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OpsInlineEmpty } from "@/components/ops/OpsInlineEmpty";
import { OpsConfirmSubmitButton } from "@/components/ops/OpsConfirmSubmitButton";
import { OpsDashboardPanel } from "@/components/ops/OpsDashboardPanel";
import { OpsKpiCard } from "@/components/ops/OpsKpiCard";
import { OpsEmptyState } from "@/components/ops/OpsEmptyState";
import { OpsListControls, OpsPaginationControls } from "@/components/ops/OpsListControls";
import { OpsOfflineForm } from "@/components/ops/OpsOfflineForm";
import { OpsPageHeader } from "@/components/ops/OpsPageHeader";
import { OpsRealtimeRefresh } from "@/components/ops/OpsRealtimeRefresh";
import { OpsRecordActivityPanel } from "@/components/ops/OpsRecordActivityPanel";
import { OpsSubmitButton } from "@/components/ops/OpsSubmitButton";
import {
  addDailySiteReportEntryAction,
  closeDailySiteReportAction,
  createDailySiteReportAction,
  reviewDailySiteReportAction,
  submitDailySiteReportAction,
} from "@/lib/ops/daily-site-report-actions";
import {
  canCloseOpsDailySiteReport,
  canCreateOpsDailySiteReport,
  canEditOpsDailySiteReport,
  canReviewOpsDailySiteReport,
  canSubmitOpsDailySiteReport,
} from "@/lib/ops/daily-site-report-permissions";
import {
  fetchPaginatedOpsDailySiteReports,
  type OpsDailySiteReportEntry,
} from "@/lib/ops/daily-site-reports";
import { fetchOpsModuleAccessOverrides } from "@/lib/ops/module-access";
import { requireOpsUser } from "@/lib/ops/auth";
import { parseOpsListState } from "@/lib/ops/listing";
import { canAccessOpsHref } from "@/lib/ops/permissions";
import { formatOpsUserName } from "@/lib/ops/roles";
import { fetchActiveSiteOptions } from "@/lib/ops/sites";
import {
  firstParam,
  noticeFromParams,
  OPS_FOCUS_CLASS,
  OPS_INPUT_CLASS,
  OPS_LABEL_CLASS,
  OPS_PRIMARY_BUTTON_CLASS,
  OPS_SECONDARY_BUTTON_CLASS,
  type OpsSearchParams,
  OPS_NOTICE_WARNING_CLASS,
  opsStatusBadgeClass,
} from "@/lib/ops/ui";
import type {
  OpsDailySiteReportEntryType,
  OpsDailySiteReportStatus,
} from "@/lib/ops/types";
import { todayInLusaka, formatOpsLabel as formatLabel, formatOpsDate as formatDate, formatOpsDateTime as formatDateTime } from "@/lib/ops/format";

type PageProps = {
  searchParams?: Promise<OpsSearchParams>;
};

const DAILY_REPORT_STATUS_OPTIONS: Array<{
  label: string;
  value: OpsDailySiteReportStatus | "";
}> = [
  { label: "All statuses", value: "" },
  { label: "Draft", value: "draft" },
  { label: "Submitted", value: "submitted" },
  { label: "Reviewed", value: "reviewed" },
  { label: "Closed", value: "closed" },
];

const REPORT_ENTRY_TYPE_OPTIONS: Array<{
  label: string;
  value: OpsDailySiteReportEntryType;
}> = [
  { label: "Progress", value: "progress" },
  { label: "Labour", value: "labour" },
  { label: "Equipment", value: "equipment" },
  { label: "Material", value: "material" },
  { label: "Delay", value: "delay" },
  { label: "HSE", value: "hse" },
  { label: "Commercial", value: "commercial" },
];

function dailyReportStatusFromParam(value: string | undefined) {
  return DAILY_REPORT_STATUS_OPTIONS.some((status) => status.value === value)
    ? (value as OpsDailySiteReportStatus | "")
    : "";
}

function dailyReportNotice(params: OpsSearchParams) {
  const created = noticeFromParams(params, "report", "Daily site report created.");

  if (created) {
    return created;
  }

  const updated = firstParam(params.updated);

  if (updated === "entry_added") {
    return { message: "Daily site report entry added.", tone: "success" as const };
  }

  if (updated === "submitted") {
    return { message: "Daily site report submitted.", tone: "success" as const };
  }

  if (updated === "reviewed") {
    return { message: "Daily site report reviewed.", tone: "success" as const };
  }

  if (updated === "closed") {
    return { message: "Daily site report closed.", tone: "success" as const };
  }

  if (updated === "attachment") {
    return { message: "Daily site report attachment uploaded.", tone: "success" as const };
  }

  if (updated === "comment") {
    return { message: "Daily site report comment added.", tone: "success" as const };
  }

  return null;
}

function formatNumber(value: number) {
  return value.toLocaleString("en-ZM", {
    maximumFractionDigits: 2,
  });
}

function entryTypeClass(entryType: OpsDailySiteReportEntryType) {
  if (entryType === "hse" || entryType === "delay") {
    return "border-orange-200 bg-orange-50 text-orange-700";
  }

  if (entryType === "commercial") {
    return "border-violet-200 bg-violet-50 text-violet-700";
  }

  return "border-border bg-muted/40 text-muted-foreground";
}

function ReportMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 font-bold text-foreground">{value}</dd>
    </div>
  );
}

function EntryList({ entries }: { entries: OpsDailySiteReportEntry[] }) {
  if (entries.length === 0) {
    return (
      <OpsInlineEmpty>No structured entries added yet.</OpsInlineEmpty>
    );
  }

  return (
    <div className="grid gap-3">
      {entries.map((entry) => (
        <div className="rounded-md border border-border p-3" key={entry.id}>
          <div className="flex flex-col gap-2 min-[520px]:flex-row min-[520px]:items-start min-[520px]:justify-between">
            <div>
              <span
                className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${entryTypeClass(
                  entry.entry_type,
                )}`}
              >
                {formatLabel(entry.entry_type)}
              </span>
              <p className="mt-2 font-bold text-foreground">{entry.title}</p>
            </div>
            <div className="grid gap-2 text-sm min-[520px]:grid-cols-2">
              <span className="font-semibold text-muted-foreground">
                Qty {formatNumber(entry.quantity)} {entry.unit}
              </span>
              <span className="font-semibold text-muted-foreground">
                Hours {formatNumber(entry.hours)}
              </span>
            </div>
          </div>
          {entry.notes ? (
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{entry.notes}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function AddEntryForm({ reportId }: { reportId: string }) {
  return (
    <details className="rounded-md border border-border">
      <summary
        className={`flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-bold text-foreground transition hover:text-primary-blue [&::-webkit-details-marker]:hidden ${OPS_FOCUS_CLASS}`}
      >
        <span className="inline-flex items-center gap-2">
          <Plus className="size-4" aria-hidden="true" />
          Add report entry
        </span>
        <span className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
          Open
        </span>
      </summary>
      <form
        action={addDailySiteReportEntryAction}
        className="grid gap-3 border-t border-border p-4 min-[520px]:grid-cols-2 lg:grid-cols-6"
      >
        <input name="report_id" type="hidden" value={reportId} />
        <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
          Entry type
          <select className={OPS_INPUT_CLASS} defaultValue="progress" name="entry_type">
            {REPORT_ENTRY_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
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
          <input className={OPS_INPUT_CLASS} min="0" name="quantity" step="0.01" type="number" />
        </label>
        <label className={OPS_LABEL_CLASS}>
          Unit
          <input className={OPS_INPUT_CLASS} name="unit" />
        </label>
        <label className={OPS_LABEL_CLASS}>
          Hours
          <input className={OPS_INPUT_CLASS} min="0" name="hours" step="0.01" type="number" />
        </label>
        <label className={`${OPS_LABEL_CLASS} min-[520px]:col-span-2 lg:col-span-4`}>
          Notes
          <input className={OPS_INPUT_CLASS} name="notes" />
        </label>
        <div className="flex items-end lg:col-span-1">
          <button className={`${OPS_PRIMARY_BUTTON_CLASS} w-full`} type="submit">
            <Plus className="size-4" aria-hidden="true" />
            Add
          </button>
        </div>
      </form>
    </details>
  );
}

export default async function OpsDailySiteReportsPage({ searchParams }: PageProps) {
  const [params, auth] = await Promise.all([
    searchParams ?? Promise.resolve({} as OpsSearchParams),
    requireOpsUser(),
  ]);

  if (!canAccessOpsHref(auth.profile.role, "/ops/daily-site-reports", await fetchOpsModuleAccessOverrides())) {
    notFound();
  }

  const listState = parseOpsListState(params, { defaultPageSize: 8 });
  const status = dailyReportStatusFromParam(firstParam(params.status));
  const siteId = firstParam(params.site_id);
  const [reportPage, siteOptions] = await Promise.all([
    fetchPaginatedOpsDailySiteReports({
      listState,
      query: listState.query,
      siteId,
      status: status || undefined,
    }),
    fetchActiveSiteOptions(),
  ]);
  const reports = reportPage.items;
  const notice = dailyReportNotice(params);
  const canCreate = canCreateOpsDailySiteReport(auth.profile.role);
  const canReview = canReviewOpsDailySiteReport(auth.profile.role);
  const canClose = canCloseOpsDailySiteReport(auth.profile.role);
  const hasActiveListFilter = listState.query.length > 0 || Boolean(status) || Boolean(siteId);
  const draftCount = reports.filter((report) => report.status === "draft").length;
  const submittedCount = reports.filter((report) => report.status === "submitted").length;
  const reviewedCount = reports.filter((report) => report.status === "reviewed").length;
  const incidentCount = reports.reduce((sum, report) => sum + report.incident_count, 0);
  const labourCount = reports.reduce((sum, report) => sum + report.labour_count, 0);
  const equipmentCount = reports.reduce((sum, report) => sum + report.equipment_count, 0);
  const materialDeliveryCount = reports.reduce(
    (sum, report) => sum + report.material_deliveries_count,
    0,
  );
  const averageProgress =
    reports.length === 0
      ? 0
      : reports.reduce((sum, report) => sum + report.overall_progress_percent, 0) / reports.length;
  const createPanelParams = new URLSearchParams();

  if (listState.query) {
    createPanelParams.set("q", listState.query);
  }

  if (status) {
    createPanelParams.set("status", status);
  }

  if (siteId) {
    createPanelParams.set("site_id", siteId);
  }

  createPanelParams.set("create", "report");
  const createReportHref = `/ops/daily-site-reports?${createPanelParams.toString()}#daily-report-create-panel`;
  const openCreatePanel = firstParam(params.create) === "report";

  return (
    <div className="w-full max-w-none space-y-6">
      <OpsRealtimeRefresh tables={["daily_site_reports"]} />
      <OpsPageHeader
        eyebrow="Engineering field control"
        title="Daily Site Reports"
        description="Site progress, labour, equipment, material movement, delays, HSE notes, and commercial observations in one daily record."
        actions={
          <>
            <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/sites">
              <FileText className="size-4" aria-hidden="true" />
              Sites
            </Link>
            <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/material-requests">
              <ClipboardList className="size-4" aria-hidden="true" />
              Material requests
            </Link>
            {canCreate ? (
              <a className={OPS_PRIMARY_BUTTON_CLASS} href={createReportHref}>
                <Plus className="size-4" aria-hidden="true" />
                New report
              </a>
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
          href="/ops/daily-site-reports?status=draft#daily-report-register"
          icon={Clock}
          label="Draft shown"
          tone={draftCount > 0 ? "warn" : "default"}
          hint="Editable"
          value={String(draftCount)}
        />
        <OpsKpiCard
          href="/ops/daily-site-reports?status=submitted#daily-report-register"
          icon={Send}
          label="Submitted"
          tone={submittedCount > 0 ? "warn" : "default"}
          hint="Needs review"
          value={String(submittedCount)}
        />
        <OpsKpiCard
          href="/ops/daily-site-reports?status=reviewed#daily-report-register"
          icon={CheckCircle2}
          label="Reviewed"
          tone="good"
          hint="Accepted"
          value={String(reviewedCount)}
        />
        <OpsKpiCard
          href="/ops/daily-site-reports#daily-report-register"
          icon={AlertTriangle}
          label="Incidents shown"
          tone={incidentCount > 0 ? "warn" : "default"}
          hint="Current filter"
          value={String(incidentCount)}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(20rem,0.8fr)]">
        <OpsDashboardPanel eyebrow="Visible field totals" title="Current report selection">
          <dl className="grid gap-3 min-[520px]:grid-cols-2 xl:grid-cols-4">
            <ReportMetric label="Reports" value={reportPage.pagination.total.toLocaleString("en-ZM")} />
            <ReportMetric label="Labour count" value={labourCount.toLocaleString("en-ZM")} />
            <ReportMetric label="Equipment count" value={equipmentCount.toLocaleString("en-ZM")} />
            <ReportMetric
              label="Material deliveries"
              value={materialDeliveryCount.toLocaleString("en-ZM")}
            />
          </dl>
        </OpsDashboardPanel>

        <OpsDashboardPanel eyebrow="Progress signal" title="Average visible progress">
          <div className="rounded-md border border-border p-4">
            <p className="font-heading text-3xl font-bold text-foreground">
              {formatNumber(averageProgress)}%
            </p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Average of progress percentages in the current filtered report list.
            </p>
          </div>
        </OpsDashboardPanel>
      </div>

      {canCreate ? (
        <details
          className="scroll-mt-24 rounded-lg border border-border bg-card"
          id="daily-report-create-panel"
          open={openCreatePanel}
        >
          <summary
            className={`flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 transition hover:text-primary-blue [&::-webkit-details-marker]:hidden ${OPS_FOCUS_CLASS}`}
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-blue text-white">
              <HardHat className="size-5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-heading text-xl font-bold text-foreground">
                Create daily site report
              </span>
              <span className="mt-1 block text-sm text-muted-foreground">
                Capture the day summary, counts, risks, and operational notes before adding line entries.
              </span>
            </span>
            <span className="shrink-0 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Open
            </span>
          </summary>
          {siteOptions.length === 0 ? (
            <div className="border-t border-border p-5">
              <div className={OPS_NOTICE_WARNING_CLASS}>
                Add at least one active site before creating daily site reports.
              </div>
            </div>
          ) : (
            <OpsOfflineForm
              action={createDailySiteReportAction}
              className="grid gap-4 border-t border-border p-5 min-[520px]:grid-cols-2 lg:grid-cols-6"
              kind="daily_site_report.create"
              replayEndpoint="/api/ops/offline/daily-site-reports"
              summary="Daily site report"
            >
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
                Report date
                <input
                  className={OPS_INPUT_CLASS}
                  defaultValue={todayInLusaka()}
                  name="report_date"
                  required
                  type="date"
                />
              </label>
              <label className={OPS_LABEL_CLASS}>
                Weather
                <input className={OPS_INPUT_CLASS} name="weather" />
              </label>
              <label className={OPS_LABEL_CLASS}>
                Progress %
                <input
                  className={OPS_INPUT_CLASS}
                  max="100"
                  min="0"
                  name="overall_progress_percent"
                  step="0.01"
                  type="number"
                />
              </label>
              <label className={OPS_LABEL_CLASS}>
                Labour count
                <input className={OPS_INPUT_CLASS} min="0" name="labour_count" type="number" />
              </label>
              <label className={OPS_LABEL_CLASS}>
                Equipment count
                <input className={OPS_INPUT_CLASS} min="0" name="equipment_count" type="number" />
              </label>
              <label className={OPS_LABEL_CLASS}>
                Material deliveries
                <input
                  className={OPS_INPUT_CLASS}
                  min="0"
                  name="material_deliveries_count"
                  type="number"
                />
              </label>
              <label className={OPS_LABEL_CLASS}>
                Incidents
                <input className={OPS_INPUT_CLASS} min="0" name="incident_count" type="number" />
              </label>
              <label className={`${OPS_LABEL_CLASS} min-[520px]:col-span-2 lg:col-span-6`}>
                Progress summary
                <textarea className={OPS_INPUT_CLASS} name="progress_summary" required rows={3} />
              </label>
              <label className={`${OPS_LABEL_CLASS} lg:col-span-3`}>
                Labour notes
                <textarea className={OPS_INPUT_CLASS} name="labour_notes" rows={2} />
              </label>
              <label className={`${OPS_LABEL_CLASS} lg:col-span-3`}>
                Equipment notes
                <textarea className={OPS_INPUT_CLASS} name="equipment_notes" rows={2} />
              </label>
              <label className={`${OPS_LABEL_CLASS} lg:col-span-3`}>
                Material notes
                <textarea className={OPS_INPUT_CLASS} name="material_notes" rows={2} />
              </label>
              <label className={`${OPS_LABEL_CLASS} lg:col-span-3`}>
                Delay notes
                <textarea className={OPS_INPUT_CLASS} name="delay_notes" rows={2} />
              </label>
              <label className={`${OPS_LABEL_CLASS} lg:col-span-3`}>
                HSE notes
                <textarea className={OPS_INPUT_CLASS} name="hse_notes" rows={2} />
              </label>
              <label className={`${OPS_LABEL_CLASS} lg:col-span-3`}>
                Commercial notes
                <textarea className={OPS_INPUT_CLASS} name="commercial_notes" rows={2} />
              </label>
              <div className="flex items-end min-[520px]:col-span-2 lg:col-span-6">
                <OpsSubmitButton
                  className={`${OPS_PRIMARY_BUTTON_CLASS} w-full md:w-auto`}
                  pendingLabel="Creating..."
                >
                  <Plus className="size-4" aria-hidden="true" />
                  Create report
                </OpsSubmitButton>
              </div>
            </OpsOfflineForm>
          )}
        </details>
      ) : null}

      <section
        className="scroll-mt-24 rounded-lg border border-border bg-card"
        id="daily-report-register"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Report register
            </p>
            <h2 className="font-heading text-xl font-bold text-foreground">
              Daily field records
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {reportPage.pagination.total} matching reports filtered by status and search.
            </p>
          </div>
          <HardHat className="size-6 shrink-0 text-primary-blue" aria-hidden="true" />
        </div>
        <OpsListControls
          action="/ops/daily-site-reports"
          filters={[
            {
              label: "Status",
              name: "status",
              options: DAILY_REPORT_STATUS_OPTIONS,
              value: status,
            },
            {
              label: "Site",
              name: "site_id",
              options: [
                { label: "All sites", value: "" },
                ...siteOptions.map((site) => ({
                  label: `${site.code} - ${site.name}`,
                  value: site.id,
                })),
              ],
              value: siteId ?? "",
            },
          ]}
          placeholder="Search report number, weather, progress, notes"
          query={listState.query}
          resultLabel="daily site reports"
        />

        {reports.length > 0 ? (
          <div className="divide-y divide-border">
            {reports.map((report) => {
              const canEdit = canEditOpsDailySiteReport(auth.profile.id, auth.profile.role, report);
              const canSubmit = canSubmitOpsDailySiteReport(
                auth.profile.id,
                auth.profile.role,
                report,
              );
              const canReviewThis = canReview && report.status === "submitted";
              const canCloseThis = canClose && report.status === "reviewed";

              return (
                <article className="p-5" key={report.id}>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-heading text-lg font-bold text-foreground">
                          {report.report_number}
                        </h3>
                        <span
                          className={opsStatusBadgeClass(report.status)}
                        >
                          {formatLabel(report.status)}
                        </span>
                      </div>
                      <p className="mt-2 font-bold text-foreground">
                        {report.site
                          ? `${report.site.code} - ${report.site.name}`
                          : "Site unavailable"}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        {formatDate(report.report_date)} / prepared by{" "}
                        {formatOpsUserName(
                          report.prepared_by_user?.full_name,
                          report.prepared_by_user?.id,
                        )}
                      </p>
                      <p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">
                        {report.progress_summary}
                      </p>
                    </div>
                    <div className="grid gap-2 min-[520px]:grid-cols-3 lg:min-w-56 lg:grid-cols-1">
                      <a
                        className={OPS_SECONDARY_BUTTON_CLASS}
                        href={`/api/ops/pdf/daily-site-report/${report.id}`}
                        target="_blank"
                        rel="noopener"
                      >
                        Download PDF
                      </a>
                      {canSubmit ? (
                        <form action={submitDailySiteReportAction}>
                          <input name="report_id" type="hidden" value={report.id} />
                          <OpsConfirmSubmitButton
                            className={`${OPS_PRIMARY_BUTTON_CLASS} w-full`}
                            confirmText="Confirm submit"
                          >
                            <Send className="size-4" aria-hidden="true" />
                            Submit
                          </OpsConfirmSubmitButton>
                        </form>
                      ) : null}
                      {canReviewThis ? (
                        <form action={reviewDailySiteReportAction}>
                          <input name="report_id" type="hidden" value={report.id} />
                          <OpsConfirmSubmitButton
                            className={`${OPS_PRIMARY_BUTTON_CLASS} w-full`}
                            confirmText="Confirm review"
                          >
                            <CheckCircle2 className="size-4" aria-hidden="true" />
                            Review
                          </OpsConfirmSubmitButton>
                        </form>
                      ) : null}
                      {canCloseThis ? (
                        <form action={closeDailySiteReportAction}>
                          <input name="report_id" type="hidden" value={report.id} />
                          <OpsConfirmSubmitButton
                            className={`${OPS_SECONDARY_BUTTON_CLASS} w-full`}
                            confirmText="Confirm close"
                          >
                            Close
                          </OpsConfirmSubmitButton>
                        </form>
                      ) : null}
                    </div>
                  </div>

                  <dl className="mt-4 grid gap-3 md:grid-cols-5">
                    <ReportMetric label="Progress" value={`${formatNumber(report.overall_progress_percent)}%`} />
                    <ReportMetric label="Labour" value={report.labour_count.toLocaleString("en-ZM")} />
                    <ReportMetric label="Equipment" value={report.equipment_count.toLocaleString("en-ZM")} />
                    <ReportMetric
                      label="Deliveries"
                      value={report.material_deliveries_count.toLocaleString("en-ZM")}
                    />
                    <ReportMetric label="Incidents" value={report.incident_count.toLocaleString("en-ZM")} />
                  </dl>

                  <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    {[
                      ["Weather", report.weather || "Not recorded"],
                      ["Labour notes", report.labour_notes || "No labour notes"],
                      ["Equipment notes", report.equipment_notes || "No equipment notes"],
                      ["Material notes", report.material_notes || "No material notes"],
                      ["Delay notes", report.delay_notes || "No delay notes"],
                      ["HSE notes", report.hse_notes || "No HSE notes"],
                      ["Commercial notes", report.commercial_notes || "No commercial notes"],
                      ["Reviewed", formatDateTime(report.reviewed_at)],
                    ].map(([label, value]) => (
                      <div className="rounded-md border border-border px-3 py-2" key={label}>
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                          {label}
                        </p>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">{value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 grid gap-4">
                    {canEdit ? <AddEntryForm reportId={report.id} /> : null}
                    <EntryList entries={report.entries} />
                  </div>

                  <OpsRecordActivityPanel
                    canManage={canEdit || canReviewThis || canCloseThis}
                    sourceId={report.id}
                    sourceTable="daily_site_reports"
                  />
                </article>
              );
            })}
          </div>
        ) : (
          <OpsEmptyState
            icon={HardHat}
            title={
              hasActiveListFilter
                ? "No daily site reports match these filters"
                : "No daily site reports yet"
            }
            description={
              hasActiveListFilter
                ? "Try clearing the search or switching the status filter — drafts, submitted, and reviewed reports sit in different buckets."
                : "Site engineers and supervisors file one report per site per day capturing progress, labour, equipment, and materials. The first report will appear here once it is created."
            }
            actions={
              hasActiveListFilter
                ? [{ href: "/ops/daily-site-reports", label: "Clear filters" }]
                : canCreate
                  ? [{ href: createReportHref, label: "Create the first daily site report" }]
                  : [{ href: "/ops", label: "Back to overview", variant: "secondary" }]
            }
          />
        )}
        <OpsPaginationControls
          basePath="/ops/daily-site-reports"
          filters={[
            {
              label: "Status",
              name: "status",
              options: [],
              value: status,
            },
            {
              label: "Site",
              name: "site_id",
              options: [],
              value: siteId ?? "",
            },
          ]}
          pagination={reportPage.pagination}
          query={listState.query}
          resultLabel="daily site reports"
        />
      </section>
    </div>
  );
}
