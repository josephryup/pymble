import { AlertCircle, CheckCircle2, Clock, FileText, Plus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OpsInlineEmpty } from "@/components/ops/OpsInlineEmpty";
import { OpsEmptyState } from "@/components/ops/OpsEmptyState";
import { OpsPageHeader } from "@/components/ops/OpsPageHeader";
import { OpsRealtimeRefresh } from "@/components/ops/OpsRealtimeRefresh";
import { requireOpsUser } from "@/lib/ops/auth";
import {
  canReviewDepartmentReport,
  canSubmitDepartmentReport,
  OPS_DEPARTMENT_LABELS,
  type OpsDepartmentKey,
} from "@/lib/ops/department-report-permissions";
import {
  fetchOpsDepartmentReports,
  fetchOpsDepartmentReportSummary,
  type OpsDeptReportStat,
} from "@/lib/ops/department-reports";
import { canAccessOpsHref } from "@/lib/ops/permissions";
import { isLeadershipRole } from "@/lib/ops/roles";
import {
  noticeFromParams,
  OPS_PRIMARY_BUTTON_CLASS,
  type OpsSearchParams,
  opsStatusBadgeClass,
} from "@/lib/ops/ui";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<OpsSearchParams>;
};

function StatTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: "sky" | "orange" | "emerald" | "muted";
}) {
  const colors = {
    sky: "border-sky-200 bg-sky-50 text-sky-700",
    orange: "border-orange-200 bg-orange-50 text-orange-700",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    muted: "border-border bg-muted/40 text-muted-foreground",
  };
  return (
    <div className={`rounded-xl border px-4 py-3 ${colors[accent]}`}>
      <p className="text-2xl font-black">{value}</p>
      <p className="mt-0.5 text-xs font-semibold uppercase tracking-[0.1em]">{label}</p>
    </div>
  );
}

function DeptCard({ stat, canReview }: { stat: OpsDeptReportStat; canReview: boolean }) {
  const needsAttention = stat.pendingReview > 0 || stat.revisionRequested > 0;
  return (
    <div
      className={`rounded-lg border bg-card p-5 shadow-sm ${
        needsAttention && canReview
          ? "border-sky-300 ring-1 ring-sky-200"
          : "border-border"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Department
          </p>
          <h2 className="mt-0.5 font-heading text-base font-bold text-foreground">
            {OPS_DEPARTMENT_LABELS[stat.department]}
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {stat.pendingReview > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-sky-700">
              <Clock className="size-3" aria-hidden="true" />
              {stat.pendingReview} pending review
            </span>
          ) : null}
          {stat.revisionRequested > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-orange-700">
              <AlertCircle className="size-3" aria-hidden="true" />
              {stat.revisionRequested} needs revision
            </span>
          ) : null}
          {stat.acknowledgedThisMonth > 0 && stat.pendingReview === 0 && stat.revisionRequested === 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-emerald-700">
              <CheckCircle2 className="size-3" aria-hidden="true" />
              Up to date
            </span>
          ) : null}
        </div>
      </div>

      {stat.latestReport ? (
        <div className="mt-3 rounded-lg border border-border bg-muted/40 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Latest report
          </p>
          <Link
            className="mt-0.5 block truncate text-sm font-semibold text-foreground hover:underline"
            href={`/ops/department-reports/${stat.latestReport.id}`}
          >
            {stat.latestReport.title}
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <p className="text-xs text-muted-foreground">
              {stat.latestReport.period_end_date}
            </p>
            <span
              className={opsStatusBadgeClass(stat.latestReport.status)}
            >
              {stat.latestReport.status.replace(/_/g, " ")}
            </span>
          </div>
        </div>
      ) : (
        <div className="mt-3"><OpsInlineEmpty>No reports submitted yet.</OpsInlineEmpty></div>
      )}

      <Link
        className="mt-3 block text-xs font-semibold text-primary-blue hover:underline"
        href={`/ops/department-reports?dept=${stat.department}`}
      >
        View all {OPS_DEPARTMENT_LABELS[stat.department]} reports →
      </Link>
    </div>
  );
}

export default async function OpsDepartmentReportsPage({ searchParams }: PageProps) {
  const search = (await (searchParams ?? Promise.resolve({} as OpsSearchParams))) ?? {};
  const { profile } = await requireOpsUser();
  if (!canAccessOpsHref(profile.role, "/ops/department-reports")) {
    notFound();
  }

  const canCreate = canSubmitDepartmentReport(profile.role);
  const canReview = canReviewDepartmentReport(profile.role);
  const notice = noticeFromParams(search, "report", "Department report created.");

  // dept filter for leadership drill-down
  const deptFilter = (search.dept as string | undefined) ?? null;
  const isLeadership = isLeadershipRole(profile.role);

  // Leadership with no dept filter → show the dashboard
  if (isLeadership && !deptFilter) {
    const stats = await fetchOpsDepartmentReportSummary();
    const totalPending = stats.reduce((s, d) => s + d.pendingReview, 0);
    const totalRevision = stats.reduce((s, d) => s + d.revisionRequested, 0);
    const totalAcknowledged = stats.reduce((s, d) => s + d.acknowledgedThisMonth, 0);
    const activeDepts = stats.length;

    const orderedStats = [
      ...stats.filter((s) => s.pendingReview > 0 || s.revisionRequested > 0),
      ...stats.filter((s) => s.pendingReview === 0 && s.revisionRequested === 0),
    ];

    return (
      <div className="w-full max-w-none space-y-6">
        <OpsRealtimeRefresh tables={["department_reports"]} />
        <OpsPageHeader
          eyebrow="Leadership"
          title="Department reports dashboard"
          description="All department reports submitted for leadership review. Departments with pending reviews are surfaced first."
          actions={
            canCreate ? (
              <Link className={OPS_PRIMARY_BUTTON_CLASS} href="/ops/department-reports/new">
                <Plus className="size-4" aria-hidden="true" />
                New report
              </Link>
            ) : null
          }
        />

        {notice ? (
          <div
            className={
              notice.tone === "error"
                ? "rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
                : "rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700"
            }
          >
            {notice.message}
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile label="Pending review" value={totalPending} accent="sky" />
          <StatTile label="Needs revision" value={totalRevision} accent="orange" />
          <StatTile label="Acknowledged this month" value={totalAcknowledged} accent="emerald" />
          <StatTile label="Active departments" value={activeDepts} accent="muted" />
        </div>

        {orderedStats.length === 0 ? (
          <OpsEmptyState
            icon={FileText}
            title="No department reports yet"
            description="Department heads will publish reports here. They route up to you for review once submitted."
            actions={[]}
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {orderedStats.map((stat) => (
              <DeptCard canReview={canReview} key={stat.department} stat={stat} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Department member (or leadership drilling into a specific dept) → list view
  const reports = await fetchOpsDepartmentReports(
    profile.role,
    deptFilter as OpsDepartmentKey | null,
  );
  const deptLabel =
    deptFilter ? (OPS_DEPARTMENT_LABELS[deptFilter as OpsDepartmentKey] ?? deptFilter) : null;

  return (
    <div className="w-full max-w-none space-y-6">
      <OpsRealtimeRefresh tables={["department_reports"]} />
      <OpsPageHeader
        eyebrow={deptLabel ? `${deptLabel} department` : "Department reporting"}
        title={deptLabel ? `${deptLabel} reports` : "Department reports"}
        description="Periodic department reports. Draft, submit for review, then track acknowledgement from leadership."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {isLeadership && deptFilter ? (
              <Link
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted/40"
                href="/ops/department-reports"
              >
                ← All departments
              </Link>
            ) : null}
            {canCreate ? (
              <Link className={OPS_PRIMARY_BUTTON_CLASS} href="/ops/department-reports/new">
                <Plus className="size-4" aria-hidden="true" />
                New report
              </Link>
            ) : null}
          </div>
        }
      />

      {notice ? (
        <div
          className={
            notice.tone === "error"
              ? "rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
              : "rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700"
          }
        >
          {notice.message}
        </div>
      ) : null}

      {reports.length === 0 ? (
        <OpsEmptyState
          icon={FileText}
          title="No department reports yet"
          description={
            canCreate
              ? "Start your first periodic report. It stays a draft until you submit it for leadership review."
              : "Department heads will publish reports here. Leadership reviews them once submitted."
          }
          actions={
            canCreate
              ? [{ href: "/ops/department-reports/new", label: "Draft a report" }]
              : []
          }
        />
      ) : (
        <ul className="space-y-3">
          {reports.map((report) => (
            <li
              key={report.id}
              className="rounded-lg border border-border bg-card p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {OPS_DEPARTMENT_LABELS[report.department]} · {report.period}
                  </p>
                  <h2 className="mt-1 font-heading text-lg font-bold text-foreground">
                    <Link
                      className="hover:underline"
                      href={`/ops/department-reports/${report.id}`}
                    >
                      {report.title}
                    </Link>
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {report.period_start_date} → {report.period_end_date}
                    {report.submitter
                      ? ` · Submitted by ${report.submitter.full_name}`
                      : ""}
                  </p>
                </div>
                <span
                  className={opsStatusBadgeClass(report.status)}
                >
                  {report.status.replace(/_/g, " ")}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
