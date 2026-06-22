import { AlertCircle, CheckCircle2, Clock, FileText, Plus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OpsEmptyState } from "@/components/ops/OpsEmptyState";
import { OpsPageHeader } from "@/components/ops/OpsPageHeader";
import { OpsRealtimeRefresh } from "@/components/ops/OpsRealtimeRefresh";
import { requireOpsUser } from "@/lib/ops/auth";
import {
  canSubmitDepartmentReport,
  canViewDepartmentReport,
  OPS_DEPARTMENT_LABELS,
  type OpsDepartmentKey,
} from "@/lib/ops/department-report-permissions";
import { fetchOpsDepartmentReports } from "@/lib/ops/department-reports";
import { OPS_PRIMARY_BUTTON_CLASS } from "@/lib/ops/ui";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ dept: string }>;
};

const DEPARTMENT_KEYS = Object.keys(OPS_DEPARTMENT_LABELS) as OpsDepartmentKey[];

function isDepartmentKey(value: string): value is OpsDepartmentKey {
  return (DEPARTMENT_KEYS as string[]).includes(value);
}

function statusClass(status: string) {
  if (status === "acknowledged") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "revision_requested") return "border-orange-200 bg-orange-50 text-orange-700";
  if (status === "submitted" || status === "under_review")
    return "border-sky-200 bg-sky-50 text-sky-700";
  return "border-primary-dark/15 bg-primary-dark/[0.04] text-primary-dark/65";
}

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
    muted: "border-primary-dark/10 bg-primary-dark/[0.03] text-primary-dark/65",
  };
  return (
    <div className={`rounded-xl border px-4 py-3 ${colors[accent]}`}>
      <p className="text-2xl font-black">{value}</p>
      <p className="mt-0.5 text-xs font-semibold uppercase tracking-[0.1em]">{label}</p>
    </div>
  );
}

export default async function OpsDepartmentReportHubPage({ params }: PageProps) {
  const { dept } = await params;
  if (!isDepartmentKey(dept)) {
    notFound();
  }

  const { profile } = await requireOpsUser();
  // Cross-department isolation: only this department's members (or leadership)
  // may open this dashboard.
  if (!canViewDepartmentReport(profile.role, dept)) {
    notFound();
  }

  const reports = await fetchOpsDepartmentReports(profile.role, dept);
  const canCreate = canSubmitDepartmentReport(profile.role);
  const label = OPS_DEPARTMENT_LABELS[dept];

  const thisMonth = new Date().toISOString().slice(0, 7);
  const stats = {
    drafts: reports.filter((report) => report.status === "draft").length,
    pendingReview: reports.filter(
      (report) => report.status === "submitted" || report.status === "under_review",
    ).length,
    revisionRequested: reports.filter((report) => report.status === "revision_requested").length,
    acknowledgedThisMonth: reports.filter(
      (report) =>
        report.status === "acknowledged" && (report.submitted_at ?? "").startsWith(thisMonth),
    ).length,
  };

  return (
    <div className="w-full max-w-none space-y-6">
      <OpsRealtimeRefresh tables={["department_reports"]} />
      <OpsPageHeader
        eyebrow={`${label} department`}
        title={`${label} reports`}
        description="Your department's periodic reports. Draft, submit for review, then track acknowledgement from leadership."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              className="inline-flex items-center gap-1.5 rounded-md border border-primary-dark/15 px-3 py-2 text-xs font-semibold text-primary-dark/65 hover:bg-primary-dark/5"
              href="/ops/department-reports"
            >
              All departments
            </Link>
            {canCreate ? (
              <Link className={OPS_PRIMARY_BUTTON_CLASS} href="/ops/department-reports/new">
                <Plus className="size-4" aria-hidden="true" />
                New report
              </Link>
            ) : null}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile accent="muted" label="Drafts" value={stats.drafts} />
        <StatTile accent="sky" label="Pending review" value={stats.pendingReview} />
        <StatTile accent="orange" label="Needs revision" value={stats.revisionRequested} />
        <StatTile
          accent="emerald"
          label="Acknowledged this month"
          value={stats.acknowledgedThisMonth}
        />
      </div>

      {reports.length === 0 ? (
        <OpsEmptyState
          icon={FileText}
          title={`No ${label} reports yet`}
          description={
            canCreate
              ? "Start your first periodic report. It stays a draft until you submit it for leadership review."
              : "Reports published for this department will appear here once a head submits them."
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
              className="rounded-2xl border border-primary-dark/10 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-dark/45">
                    {label} · {report.period}
                  </p>
                  <h2 className="mt-1 font-heading text-lg font-bold text-primary-dark">
                    <Link
                      className="hover:underline"
                      href={`/ops/department-reports/${report.id}`}
                    >
                      {report.title}
                    </Link>
                  </h2>
                  <p className="mt-1 text-xs text-primary-dark/55">
                    {report.period_start_date} → {report.period_end_date}
                    {report.submitter ? ` · Submitted by ${report.submitter.full_name}` : ""}
                  </p>
                </div>
                <span
                  className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${statusClass(report.status)}`}
                >
                  {report.status.replace(/_/g, " ")}
                </span>
              </div>
              {report.status === "revision_requested" && report.review_notes ? (
                <p className="mt-2 flex items-start gap-1.5 text-xs text-orange-700">
                  <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  {report.review_notes}
                </p>
              ) : null}
              {report.status === "acknowledged" ? (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-700">
                  <CheckCircle2 className="size-3.5" aria-hidden="true" />
                  Acknowledged by leadership
                </p>
              ) : report.status === "submitted" || report.status === "under_review" ? (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-sky-700">
                  <Clock className="size-3.5" aria-hidden="true" />
                  Awaiting leadership review
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
