import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  BadgeDollarSign,
  Banknote,
  BriefcaseBusiness,
  ClipboardCheck,
  FileText,
  Inbox,
  ShieldAlert,
} from "lucide-react";
import { OpsDashboardPanel } from "@/components/ops/OpsDashboardPanel";
import {
  OpsCashBalanceTrendChart,
  OpsRevenueCostTrendChart,
} from "@/components/ops/OpsGlTrendCharts";
import { OpsKpiCard } from "@/components/ops/OpsKpiCard";
import { OpsReportShortcutGrid } from "@/components/ops/OpsReportShortcutGrid";
import { requireOpsUser } from "@/lib/ops/auth";
import { OPS_BRAND } from "@/lib/ops/constants";
import { OPS_DEPARTMENT_LABELS } from "@/lib/ops/department-report-permissions";
import {
  fetchOpsExecutiveDashboardReport,
  type OpsExecutiveActionTone,
  type OpsExecutiveProjectSnapshot,
} from "@/lib/ops/executive";
import { fetchOpsExecutiveReportDigest } from "@/lib/ops/executive-report-digest";
import { fetchOpsGlMonthlyTrend } from "@/lib/ops/gl-trends";
import { canAccessOpsHref } from "@/lib/ops/permissions";
import {
  formatZmw,
  OPS_FOCUS_CLASS,
  OPS_PRIMARY_BUTTON_CLASS,
  OPS_SECONDARY_BUTTON_CLASS,
} from "@/lib/ops/ui";

function formatPercent(value: number | null) {
  if (value === null) {
    return "Pending";
  }

  return `${Math.round(value)}%`;
}

function numberText(value: number) {
  return value.toLocaleString("en-ZM");
}

function actionToneClass(tone: OpsExecutiveActionTone) {
  if (tone === "urgent") {
    return "border-red-200 bg-red-50 text-red-800";
  }

  if (tone === "watch") {
    return "border-orange-200 bg-orange-50 text-orange-800";
  }

  return "border-emerald-200 bg-emerald-50 text-emerald-800";
}

function projectToneClass(tone: OpsExecutiveActionTone) {
  if (tone === "urgent") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (tone === "watch") {
    return "border-orange-200 bg-orange-50 text-orange-700";
  }

  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function MetricRow({
  href,
  label,
  value,
}: {
  href: string;
  label: string;
  value: string;
}) {
  return (
    <Link
      className={`flex min-h-12 items-center justify-between gap-3 rounded-md border border-primary-dark/10 px-3 py-2 text-sm font-semibold text-primary-dark/68 transition hover:border-primary-blue hover:text-primary-blue ${OPS_FOCUS_CLASS}`}
      href={href}
    >
      <span>{label}</span>
      <span className="font-heading text-base font-bold text-primary-dark">{value}</span>
    </Link>
  );
}

function ProjectSnapshotCard({ project }: { project: OpsExecutiveProjectSnapshot }) {
  return (
    <Link
      className={`block rounded-lg border bg-white p-4 transition hover:-translate-y-0.5 hover:shadow-sm ${OPS_FOCUS_CLASS}`}
      href={`/ops/sites/${project.siteId}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-primary-dark">{project.siteName}</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-primary-dark/42">
            {project.siteCode}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${projectToneClass(
            project.tone,
          )}`}
        >
          {project.tone}
        </span>
      </div>
      <div className="mt-4 grid gap-2 text-sm">
        <div className="flex justify-between gap-3">
          <span className="text-primary-dark/55">Forecast margin</span>
          <span className="font-bold text-primary-dark">{formatZmw(project.forecastMargin)}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-primary-dark/55">Margin percent</span>
          <span className="font-bold text-primary-dark">
            {formatPercent(project.forecastMarginPercent)}
          </span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-primary-dark/55">Cost exposure</span>
          <span className="font-bold text-primary-dark">{formatZmw(project.costExposure)}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-primary-dark/55">Over budget</span>
          <span className="font-bold text-primary-dark">{formatZmw(project.overBudgetAmount)}</span>
        </div>
      </div>
    </Link>
  );
}

export default async function OpsExecutivePage() {
  const auth = await requireOpsUser();

  if (!canAccessOpsHref(auth.profile.role, "/ops/executive")) {
    redirect("/ops/profile");
  }

  const [report, reportDigest, glTrend] = await Promise.all([
    fetchOpsExecutiveDashboardReport(),
    fetchOpsExecutiveReportDigest().catch(() => null),
    fetchOpsGlMonthlyTrend().catch(() => []),
  ]);
  const hasGlActivity = glTrend.some(
    (point) => point.income !== 0 || point.expenses !== 0 || point.cashBalance !== 0,
  );
  const unavailableSources = report.sourceHealth.filter((source) => source.status === "unavailable");
  // Each domain is reported in its OWN unit — the previous "pressure index"
  // summed counts, thousands-of-ZMW, and an index score into a share-of-total
  // bar, which was mathematically meaningless. This grid keeps each domain
  // honest and links to the records behind it.
  const pressureDomains = [
    {
      label: "Approvals",
      href: "/ops/approvals",
      value: numberText(report.approvals.backlog),
      unit: "in backlog",
      tone: report.approvals.backlog > 0 ? ("watch" as const) : ("good" as const),
    },
    {
      label: "Budget",
      href: "/ops/project-budgets",
      value: formatZmw(report.finance.overBudgetAmount),
      unit: "over budget",
      tone: report.finance.overBudgetAmount > 0 ? ("urgent" as const) : ("good" as const),
    },
    {
      label: "Delivery",
      href: "/ops/delivery-exceptions",
      value: numberText(report.delivery.totalActionable),
      unit: "actions needed",
      tone: report.delivery.highRiskActionable > 0 ? ("watch" as const) : ("good" as const),
    },
    {
      label: "HSE",
      href: "/ops/hse",
      value: report.hse.pressureLevel,
      unit: `score ${numberText(report.hse.pressureScore)}`,
      tone: report.hse.pressureLevel === "steady" ? ("good" as const) : ("watch" as const),
    },
    {
      label: "People",
      href: "/ops/employees",
      value: numberText(report.people.expiredTraining + report.people.overdueOnboardingItems),
      unit: "readiness gaps",
      tone:
        report.people.expiredTraining + report.people.overdueOnboardingItems > 0
          ? ("watch" as const)
          : ("good" as const),
    },
  ];
  const shortcutGroups = [
    {
      items: [
        { href: "/ops/approvals", label: "Approval inbox" },
        { href: "/ops/notifications", label: "Notifications" },
        { href: "/ops/sites", label: "Projects and sites" },
      ],
      title: "Leadership Control",
    },
    {
      items: [
        { href: "/ops/project-budgets", label: "Budget variance" },
        { href: "/ops/payment-requests", label: "Payment requests" },
        { href: "/ops/commercial", label: "Commercial forecast" },
      ],
      title: "Finance and Commercial",
    },
    {
      items: [
        { href: "/ops/hse", label: "Health, Safety and Environment incidents" },
        { href: "/ops/fleet-logistics", label: "Fleet logistics" },
        { href: "/ops/employees", label: "Employees and leave" },
      ],
      title: "Operations Pressure",
    },
  ];

  return (
    <div className="w-full max-w-none space-y-5">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-blue">
            {OPS_BRAND.companyName}
          </p>
          <h1 className="mt-2 font-heading text-3xl font-bold text-primary-dark md:text-4xl">
            Executive dashboard
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-primary-dark/62 md:text-base">
            Leadership view of approvals, cashflow, project margin, HSE pressure, procurement
            bottlenecks, fleet readiness, and people controls.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/approvals">
            <ClipboardCheck className="size-4" aria-hidden="true" />
            Approvals
          </Link>
          <Link className={OPS_PRIMARY_BUTTON_CLASS} href="/ops/payment-requests">
            <Banknote className="size-4" aria-hidden="true" />
            Cashflow
          </Link>
        </div>
      </section>

      {unavailableSources.length > 0 ? (
        <div className="rounded-md border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-semibold text-orange-800">
          {unavailableSources.length} dashboard source
          {unavailableSources.length === 1 ? "" : "s"} unavailable while the system settles.
        </div>
      ) : null}

      <div className="grid gap-4 min-[720px]:grid-cols-2 xl:grid-cols-4">
        <OpsKpiCard
          href="/ops/approvals"
          icon={ClipboardCheck}
          label="Approval backlog"
          tone={report.approvals.highPriority > 0 ? "warn" : "default"}
          trend={report.approvals.highPriority > 0 ? "High priority" : "Live"}
          value={numberText(report.approvals.backlog)}
        />
        <OpsKpiCard
          href="/ops/payment-requests"
          icon={Banknote}
          label="Next 30 net"
          tone={report.finance.netNext30 < 0 ? "warn" : "good"}
          trend={report.finance.overduePayables > 0 ? "Payables risk" : "Live"}
          value={formatZmw(report.finance.netNext30)}
        />
        <OpsKpiCard
          href="/ops/commercial"
          icon={BadgeDollarSign}
          label="Forecast margin"
          tone={report.commercial.marginDangerCount > 0 ? "warn" : "good"}
          trend={`${formatPercent(report.commercial.forecastMarginPercent)} margin`}
          value={formatZmw(report.commercial.forecastMargin)}
        />
        <OpsKpiCard
          href="/ops/hse"
          icon={ShieldAlert}
          label="HSE pressure"
          tone={report.hse.pressureLevel === "steady" ? "good" : "warn"}
          trend={report.hse.pressureLevel}
          value={numberText(report.hse.pressureScore)}
        />
      </div>

      {reportDigest ? (
        <OpsDashboardPanel
          actions={
            <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/department-reports">
              <Inbox className="size-4" aria-hidden="true" />
              All reports
            </Link>
          }
          eyebrow="Weekly reporting"
          title={`Department reports — week ${reportDigest.window.start} to ${reportDigest.window.end}`}
        >
          <div className="grid gap-4">
            <div className="flex flex-wrap gap-2">
              {reportDigest.filed.map((filedReport) => (
                <Link
                  className={`inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 transition hover:border-emerald-400 ${OPS_FOCUS_CLASS}`}
                  href={`/ops/department-reports/${filedReport.id}`}
                  key={filedReport.id}
                >
                  {OPS_DEPARTMENT_LABELS[filedReport.department]}
                  <span className="font-semibold opacity-70">
                    {filedReport.status.replace("_", " ")}
                  </span>
                </Link>
              ))}
              {reportDigest.missing.map((department) => (
                <Link
                  className={`inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-800 transition hover:border-red-400 ${OPS_FOCUS_CLASS}`}
                  href={`/ops/department-reports/d/${department}`}
                  key={department}
                >
                  {OPS_DEPARTMENT_LABELS[department]}
                  <span className="font-semibold opacity-70">not filed</span>
                </Link>
              ))}
            </div>

            {reportDigest.pendingReview.length > 0 ? (
              <div className="grid gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-dark/50">
                  Awaiting your review
                </p>
                {reportDigest.pendingReview.map((pending) => (
                  <Link
                    className={`flex items-center justify-between gap-3 rounded-md border border-orange-200 bg-orange-50 px-4 py-2.5 text-sm font-semibold text-orange-900 transition hover:translate-x-0.5 ${OPS_FOCUS_CLASS}`}
                    href={`/ops/department-reports/${pending.id}`}
                    key={pending.id}
                  >
                    <span className="min-w-0 truncate">
                      {pending.title}
                      {pending.submitter_name ? (
                        <span className="ml-2 text-xs font-medium opacity-70">
                          {pending.submitter_name}
                        </span>
                      ) : null}
                    </span>
                    <ArrowRight className="size-4 shrink-0 opacity-60" aria-hidden="true" />
                  </Link>
                ))}
              </div>
            ) : null}

            {reportDigest.summaries.length > 0 ? (
              <div className="grid gap-2 md:grid-cols-2">
                {reportDigest.summaries.map((summary) => (
                  <Link
                    className={`rounded-lg border border-primary-dark/10 bg-primary-dark/[0.02] p-3 transition hover:border-primary-blue/50 ${OPS_FOCUS_CLASS}`}
                    href={`/ops/department-reports/${summary.id}`}
                    key={summary.id}
                  >
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary-blue">
                      {OPS_DEPARTMENT_LABELS[summary.department]}
                    </p>
                    <p className="mt-1 line-clamp-3 text-sm leading-5 text-primary-dark/75">
                      {summary.excerpt}
                    </p>
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        </OpsDashboardPanel>
      ) : null}

      {hasGlActivity ? (
        <div className="grid gap-5 xl:grid-cols-2">
          <OpsDashboardPanel
            actions={
              <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/finance/profit-and-loss">
                <FileText className="size-4" aria-hidden="true" />
                P&amp;L
              </Link>
            }
            eyebrow="General ledger"
            title="Revenue vs expenses by month"
          >
            <OpsRevenueCostTrendChart points={glTrend} />
          </OpsDashboardPanel>
          <OpsDashboardPanel
            actions={
              <Link
                className={OPS_SECONDARY_BUTTON_CLASS}
                href="/ops/finance/cash-flow-statement"
              >
                <Banknote className="size-4" aria-hidden="true" />
                Cash flow
              </Link>
            }
            eyebrow="General ledger"
            title="Cash balance trend"
          >
            <OpsCashBalanceTrendChart points={glTrend} />
          </OpsDashboardPanel>
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <OpsDashboardPanel eyebrow="Leadership Queue" title="Needs attention">
          <div className="grid gap-2">
            {report.priorityActions.map((item) => (
              <Link
                className={`flex items-center gap-3 rounded-md border px-4 py-3 text-sm font-semibold transition hover:translate-x-0.5 ${OPS_FOCUS_CLASS} ${actionToneClass(
                  item.tone,
                )}`}
                href={item.href}
                key={item.label}
              >
                <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{item.label}</span>
                  <span className="mt-1 block text-xs leading-5 opacity-80">{item.detail}</span>
                </span>
                <span className="shrink-0 font-heading text-base font-bold">{item.value}</span>
                <ArrowRight className="size-4 shrink-0 opacity-50" aria-hidden="true" />
              </Link>
            ))}
          </div>
        </OpsDashboardPanel>

        <OpsDashboardPanel
          eyebrow="Operational analytics"
          title="Pressure by domain"
          description="Each area in its own unit — click through to the records behind it."
        >
          <div className="grid gap-2 min-[520px]:grid-cols-2">
            {pressureDomains.map((domain) => (
              <Link
                className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2.5 transition hover:translate-x-0.5 ${OPS_FOCUS_CLASS} ${projectToneClass(
                  domain.tone,
                )}`}
                href={domain.href}
                key={domain.label}
              >
                <span className="min-w-0">
                  <span className="block text-xs font-bold uppercase tracking-[0.1em] opacity-70">
                    {domain.label}
                  </span>
                  <span className="mt-0.5 block text-xs font-medium opacity-70">{domain.unit}</span>
                </span>
                <span className="shrink-0 font-heading text-lg font-bold capitalize">
                  {domain.value}
                </span>
              </Link>
            ))}
          </div>
        </OpsDashboardPanel>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <OpsDashboardPanel eyebrow="Finance" title="Cashflow and liability">
          <div className="grid gap-2 min-[520px]:grid-cols-2">
            <MetricRow
              href="/ops/payment-requests"
              label="Open receivables"
              value={formatZmw(report.finance.openReceivables)}
            />
            <MetricRow
              href="/ops/payment-requests"
              label="Approved payables"
              value={formatZmw(report.finance.approvedPayables)}
            />
            <MetricRow
              href="/ops/payment-requests"
              label="Overdue payables"
              value={formatZmw(report.finance.overduePayables)}
            />
            <MetricRow
              href="/ops/project-budgets"
              label="Project exposure"
              value={formatZmw(report.finance.totalExposureAmount)}
            />
          </div>
        </OpsDashboardPanel>

        <OpsDashboardPanel eyebrow="Commercial" title="Forecast watch">
          <div className="grid gap-2 min-[520px]:grid-cols-2">
            <MetricRow
              href="/ops/commercial"
              label="Forecast net cash"
              value={formatZmw(report.commercial.forecastNetCash)}
            />
            <MetricRow
              href="/ops/commercial"
              label="Pending retention"
              value={formatZmw(report.commercial.pendingRetentionAmount)}
            />
            <MetricRow
              href="/ops/commercial"
              label="Margin watch sites"
              value={numberText(report.commercial.marginWatchCount)}
            />
            <MetricRow
              href="/ops/commercial"
              label="Overdue milestones"
              value={numberText(report.commercial.milestoneOverdueCount)}
            />
          </div>
        </OpsDashboardPanel>
      </div>

      <OpsDashboardPanel
        actions={
          <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/project-budgets">
            <FileText className="size-4" aria-hidden="true" />
            Budget register
          </Link>
        }
        eyebrow="Projects"
        title="Profitability and budget pressure"
      >
        {report.projectSnapshots.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {report.projectSnapshots.map((project) => (
              <ProjectSnapshotCard key={project.siteId} project={project} />
            ))}
          </div>
        ) : (
          <div className="rounded-md border border-primary-dark/10 bg-primary-dark/[0.02] p-5 text-sm font-semibold text-primary-dark/60">
            Project margin and budget snapshots will appear as commercial and finance records grow.
          </div>
        )}
      </OpsDashboardPanel>

      <div className="grid gap-5 xl:grid-cols-3">
        <OpsDashboardPanel eyebrow="Procurement" title="Buying bottlenecks">
          <div className="grid gap-2">
            <MetricRow
              href="/ops/rfq-po"
              label="Open RFQs"
              value={numberText(report.procurement.openRfqs)}
            />
            <MetricRow
              href="/ops/rfq-po"
              label="Issued RFQs"
              value={numberText(report.procurement.issuedRfqs)}
            />
            <MetricRow
              href="/ops/rfq-po"
              label="Quotes received"
              value={numberText(report.procurement.receivedQuotes)}
            />
            <MetricRow
              href="/ops/delivery-exceptions"
              label="Delivery actions"
              value={numberText(report.delivery.totalActionable)}
            />
          </div>
        </OpsDashboardPanel>

        <OpsDashboardPanel eyebrow="Fleet" title="Mobilization readiness">
          <div className="grid gap-2">
            <MetricRow
              href="/ops/fleet-logistics"
              label="Overdue trips"
              value={numberText(report.fleet.overdueTrips)}
            />
            <MetricRow
              href="/ops/fleet-logistics"
              label="Due this week"
              value={numberText(report.fleet.dueThisWeekTrips)}
            />
            <MetricRow
              href="/ops/equipment"
              label="Utilization"
              value={formatPercent(report.equipment.utilizationPercent)}
            />
            <MetricRow
              href="/ops/equipment"
              label="Maintenance jobs"
              value={numberText(report.equipment.openMaintenanceJobs)}
            />
          </div>
        </OpsDashboardPanel>

        <OpsDashboardPanel eyebrow="People" title="Workforce readiness">
          <div className="grid gap-2">
            <MetricRow
              href="/ops/employees"
              label="Active employees"
              value={numberText(report.people.activeEmployees)}
            />
            <MetricRow
              href="/ops/employees"
              label="Submitted leave"
              value={numberText(report.people.submittedLeave)}
            />
            <MetricRow
              href="/ops/employees"
              label="Onboarding open"
              value={numberText(report.people.openOnboardingItems)}
            />
            <MetricRow
              href="/ops/hse-compliance#training-panel"
              label="Training due soon"
              value={numberText(report.people.trainingDueSoon)}
            />
          </div>
        </OpsDashboardPanel>
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <OpsDashboardPanel eyebrow="HSE" title="Safety leadership">
          <div className="grid gap-3">
            <div className="rounded-md border border-primary-dark/10 bg-primary-dark/[0.02] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-primary-dark">{report.hse.headline}</p>
                  <p className="mt-1 text-sm text-primary-dark/58">
                    Generated {new Date(report.hse.generatedAt).toLocaleString("en-ZM")}
                  </p>
                </div>
                <span
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${projectToneClass(
                    report.hse.pressureLevel === "urgent"
                      ? "urgent"
                      : report.hse.pressureLevel === "watch"
                        ? "watch"
                        : "good",
                  )}`}
                >
                  {report.hse.pressureLevel}
                </span>
              </div>
            </div>
            <div className="grid gap-2 min-[520px]:grid-cols-2">
              {report.hse.escalationSignals.slice(0, 4).map((signal) => (
                <MetricRow
                  href={signal.href}
                  key={signal.label}
                  label={signal.label}
                  value={numberText(signal.value)}
                />
              ))}
              <MetricRow
                href="/ops/hse#email-delivery-health"
                label="Email sent 7 days"
                value={numberText(report.hseEmail.sent7d)}
              />
              <MetricRow
                href="/ops/hse#email-delivery-health"
                label="Email failed 7 days"
                value={numberText(report.hseEmail.failed7d)}
              />
            </div>
          </div>
        </OpsDashboardPanel>

        <OpsDashboardPanel eyebrow="Engineering" title="Site delivery pressure">
          <div className="grid gap-2 min-[520px]:grid-cols-2">
            <MetricRow
              href="/ops/engineering-controls"
              label="Delayed milestones"
              value={numberText(report.engineering.delayedMilestones)}
            />
            <MetricRow
              href="/ops/engineering-controls"
              label="Open follow-ups"
              value={numberText(report.engineering.openFollowUps)}
            />
            <MetricRow
              href="/ops/engineering-controls"
              label="Failed tests"
              value={numberText(report.engineering.failedTests)}
            />
            <MetricRow
              href="/ops/engineering-controls"
              label="Overdue snags"
              value={numberText(report.engineering.overdueSnags)}
            />
          </div>
        </OpsDashboardPanel>
      </div>

      <section className="space-y-4" id="ops-overview-shortcuts">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-blue">
              Reports and controls
            </p>
            <h2 className="mt-1 font-heading text-xl font-bold text-primary-dark">
              Executive shortcuts
            </h2>
          </div>
          <div className="flex size-10 items-center justify-center rounded-md bg-primary-blue/10 text-primary-blue">
            <BriefcaseBusiness className="size-5" aria-hidden="true" />
          </div>
        </div>
        <OpsReportShortcutGrid groups={shortcutGroups} />
      </section>
    </div>
  );
}
