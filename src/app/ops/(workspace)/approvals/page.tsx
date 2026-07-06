import {
  Bell,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Hourglass,
  Inbox,
  ListChecks,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OpsConfirmSubmitButton } from "@/components/ops/OpsConfirmSubmitButton";
import { OpsDashboardPanel } from "@/components/ops/OpsDashboardPanel";
import { OpsKpiCard } from "@/components/ops/OpsKpiCard";
import { OpsListControls, OpsPaginationControls } from "@/components/ops/OpsListControls";
import {
  OpsMobileRecordCard,
  OpsMobileRecordList,
  OpsMobileRecordRow,
} from "@/components/ops/OpsMobileRecord";
import { decideOpsApprovalAction } from "@/lib/ops/approval-actions";
import { requireOpsUser } from "@/lib/ops/auth";
import {
  fetchOpsApprovalRequests,
  fetchOpsOpenApprovalCountsByModule,
} from "@/lib/ops/approvals";
import {
  classifyApprovalForViewer,
  fetchApprovalStepsForRequests,
  fetchOpsApprovalsPersonalSummary,
  fetchOpsApprovalsWeeklyThroughput,
  type OpsApprovalViewerInsight,
} from "@/lib/ops/approvals-insight";
import { OPS_CHART_COLORS, OpsTrendChart } from "@/components/ops/OpsAnalyticsCharts";
import { OPS_ESCALATION_SLA_DAYS } from "@/lib/ops/escalations";
import { OpsEmptyState } from "@/components/ops/OpsEmptyState";
import { OpsRealtimeRefresh } from "@/components/ops/OpsRealtimeRefresh";
import {
  findOpsApprovalsDepartment,
  getOpsApprovalsDepartmentsForRole,
} from "@/lib/ops/approvals-departments";
import { parseOpsListState } from "@/lib/ops/listing";
import { fetchOpsNotifications } from "@/lib/ops/notifications";
import { markOpsNotificationReadAction } from "@/lib/ops/notification-actions";
import { canAccessOpsHref } from "@/lib/ops/permissions";
import { formatOpsRole, formatOpsUserName } from "@/lib/ops/roles";
import {
  firstParam,
  formatZmw,
  OPS_DANGER_BUTTON_CLASS,
  OPS_INPUT_CLASS,
  OPS_PRIMARY_BUTTON_CLASS,
  OPS_SECONDARY_BUTTON_CLASS,
  OPS_TABLE_SCROLL_CLASS,
  type OpsSearchParams,
} from "@/lib/ops/ui";
import type { OpsApprovalStatus, OpsPriority } from "@/lib/ops/types";

type PageProps = {
  searchParams?: Promise<OpsSearchParams>;
};

// Mirrors the escalation sweep: open approvals older than this are nagged.
const OPS_APPROVAL_SLA_DAYS = OPS_ESCALATION_SLA_DAYS.approvals;

const APPROVAL_STATUS_OPTIONS: Array<{ label: string; value: OpsApprovalStatus | "" }> = [
  { label: "All statuses", value: "" },
  { label: "Draft", value: "draft" },
  { label: "Submitted", value: "submitted" },
  { label: "In review", value: "in_review" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
  { label: "Cancelled", value: "cancelled" },
  { label: "Closed", value: "closed" },
];

function approvalStatusFromParam(value: string | undefined) {
  return APPROVAL_STATUS_OPTIONS.some((status) => status.value === value)
    ? (value as OpsApprovalStatus | "")
    : "";
}

function statusClass(status: OpsApprovalStatus) {
  if (status === "approved" || status === "closed") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "rejected" || status === "cancelled") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (status === "submitted" || status === "in_review") {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }

  return "border-orange-200 bg-orange-50 text-orange-700";
}

function priorityClass(priority: OpsPriority) {
  if (priority === "urgent" || priority === "high") {
    return "text-red-700";
  }

  if (priority === "low") {
    return "text-primary-dark/45";
  }

  return "text-primary-dark/70";
}

function formatStatus(status: string) {
  return status.replace(/_/g, " ");
}

function formatModule(moduleKey: string) {
  return moduleKey.replace(/_/g, " ");
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-ZM", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function approvalAmount(amount: number | null, currencyCode: string) {
  if (amount === null) {
    return "No amount";
  }

  if (currencyCode === "ZMW") {
    return formatZmw(amount);
  }

  return `${currencyCode} ${amount.toLocaleString("en-ZM")}`;
}

function ApprovalProgress({ insight }: { insight: OpsApprovalViewerInsight | undefined }) {
  if (!insight || insight.totalSteps === 0) {
    return <span className="text-xs text-primary-dark/45">—</span>;
  }

  const currentStep = Math.min(insight.decidedSteps + 1, insight.totalSteps);
  return (
    <div className="min-w-36">
      <div className="flex items-center gap-1.5">
        {Array.from({ length: insight.totalSteps }, (_, index) => (
          <span
            className={`h-1.5 flex-1 rounded-full ${
              index < insight.decidedSteps ? "bg-emerald-500" : "bg-primary-dark/12"
            }`}
            key={index}
          />
        ))}
      </div>
      <p className="mt-1.5 text-xs font-semibold text-primary-dark/60">
        {insight.waitingOn ? (
          <>
            Step {currentStep}/{insight.totalSteps} ·{" "}
            {insight.isMyTurn ? (
              <span className="font-bold text-orange-600">waiting on you</span>
            ) : (
              <>waiting on {insight.waitingOn}</>
            )}
          </>
        ) : (
          `${insight.decidedSteps}/${insight.totalSteps} steps decided`
        )}
      </p>
      {insight.waitingOn ? (
        <p
          className={`mt-0.5 text-[11px] font-bold ${
            insight.isOverdue ? "text-red-600" : "text-primary-dark/45"
          }`}
        >
          {insight.ageDays}d in queue{insight.isOverdue ? " — overdue" : ""}
        </p>
      ) : null}
    </div>
  );
}

function ApprovalFlowStep({
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

export default async function OpsApprovalsPage({ searchParams }: PageProps) {
  const [params, auth] = await Promise.all([
    searchParams ?? Promise.resolve({} as OpsSearchParams),
    requireOpsUser(),
  ]);

  if (!canAccessOpsHref(auth.profile.role, "/ops/approvals")) {
    notFound();
  }

  const listState = parseOpsListState(params, { defaultPageSize: 10 });
  const status = approvalStatusFromParam(firstParam(params.status));

  // Department tabs: filter the queue by which set of modules concerns this
  // role. Roles without business in a department don't see its tab. Leadership
  // sees every tab.
  const visibleDepartments = getOpsApprovalsDepartmentsForRole(auth.profile.role);
  const departmentParam = firstParam(params.department);
  const requestedDept = findOpsApprovalsDepartment(departmentParam);
  const activeDepartment =
    requestedDept && visibleDepartments.some((d) => d.key === requestedDept.key)
      ? requestedDept
      : visibleDepartments[0];

  const viewer = { id: auth.profile.id, role: auth.profile.role };
  const [approvalPage, notifications, openCountsByModule, personal] = await Promise.all([
    fetchOpsApprovalRequests({
      listState,
      query: listState.query,
      status: status || undefined,
      moduleKeys:
        activeDepartment.moduleKeys.length > 0 ? activeDepartment.moduleKeys : undefined,
    }),
    fetchOpsNotifications({ limit: 8, status: "unread" }),
    fetchOpsOpenApprovalCountsByModule().catch(() => ({} as Record<string, number>)),
    fetchOpsApprovalsPersonalSummary({ id: auth.profile.id, role: auth.profile.role }).catch(
      () => null,
    ),
  ]);
  const weeklyThroughput = await fetchOpsApprovalsWeeklyThroughput(8).catch(
    () => [] as Awaited<ReturnType<typeof fetchOpsApprovalsWeeklyThroughput>>,
  );

  // Chain insight for the rows on this page: step progress, whose turn it is,
  // and how long each request has been waiting.
  const pageSteps = await fetchApprovalStepsForRequests(
    approvalPage.items.map((request) => request.id),
  ).catch(() => new Map());
  const insightByRequest = new Map<string, OpsApprovalViewerInsight>(
    approvalPage.items.map((request) => [
      request.id,
      classifyApprovalForViewer(request, pageSteps.get(request.id) ?? [], viewer),
    ]),
  );
  const departmentOpenCounts = new Map<string, number>(
    visibleDepartments.map((dept) => {
      if (dept.moduleKeys.length === 0) {
        // "All" / "my_queue" — sum every module key.
        const total = Object.values(openCountsByModule).reduce((sum, value) => sum + value, 0);
        return [dept.key, total];
      }
      const count = dept.moduleKeys.reduce(
        (sum, key) => sum + (openCountsByModule[key] ?? 0),
        0,
      );
      return [dept.key, count];
    }),
  );
  const requests = approvalPage.items;
  const hasActiveListFilter = listState.query.length > 0 || Boolean(status);
  const openRequests = requests.filter((request) =>
    ["submitted", "in_review"].includes(request.status),
  );
  const resolvedRequests = requests.filter((request) =>
    ["approved", "closed"].includes(request.status),
  ).length;
  const visibleZmwAmount = requests.reduce(
    (sum, request) =>
      request.currency_code === "ZMW" && request.amount !== null ? sum + request.amount : sum,
    0,
  );
  const shownMyTurn = requests.filter(
    (request) => insightByRequest.get(request.id)?.isMyTurn,
  ).length;
  const shownOverdue = requests.filter(
    (request) => insightByRequest.get(request.id)?.isOverdue,
  ).length;
  const latestRequest = requests[0];
  const error = firstParam(params.error);
  const notificationUpdated = firstParam(params.updated) === "notification_read";

  return (
    <div className="w-full max-w-none space-y-5">
      <OpsRealtimeRefresh tables={["approval_requests", "approval_steps"]} />
      <section className="rounded-lg border border-primary-dark/10 bg-white p-5 shadow-sm shadow-primary-dark/5 md:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-blue">
              Shared workflow
            </p>
            <h1 className="mt-2 font-heading text-3xl font-bold text-primary-dark">
              Approval inbox
            </h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-primary-dark/68">
              One review queue for material requests, documents, purchase orders, GRNs, finance
              reviews, and other controlled operational decisions.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              className={OPS_SECONDARY_BUTTON_CLASS}
              href="/ops/approvals?status=submitted#approval-register"
            >
              <ClipboardCheck className="size-4" aria-hidden="true" />
              Submitted
            </Link>
            <Link
              className={OPS_SECONDARY_BUTTON_CLASS}
              href="/ops/approvals?status=in_review#approval-register"
            >
              <ShieldCheck className="size-4" aria-hidden="true" />
              In review
            </Link>
            <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/notifications">
              <Bell className="size-4" aria-hidden="true" />
              Notifications
            </Link>
          </div>
        </div>
      </section>

      {error ? (
        <div
          className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      {notificationUpdated ? (
        <div
          className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700"
          role="status"
        >
          Notification marked as read.
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <OpsKpiCard
          href="#your-decision-queue"
          icon={UserCheck}
          label="Needs your decision"
          tone={
            (personal?.overdueMyTurn ?? 0) > 0
              ? "critical"
              : (personal?.myTurn.length ?? 0) > 0
                ? "warn"
                : "good"
          }
          hint={
            (personal?.overdueMyTurn ?? 0) > 0
              ? `${personal?.overdueMyTurn} past the ${OPS_APPROVAL_SLA_DAYS}-day SLA`
              : (personal?.myTurn.length ?? 0) > 0
                ? "Decide below"
                : "All clear"
          }
          value={String(personal?.myTurn.length ?? 0)}
        />
        <OpsKpiCard
          href="/ops/approvals#approval-register"
          icon={ClipboardCheck}
          label="Your open requests"
          hint="Submitted by you, still in flight"
          value={String(personal?.myOpenRequests.length ?? 0)}
        />
        <OpsKpiCard
          href="#your-decision-queue"
          icon={Hourglass}
          label="Oldest waiting on you"
          tone={
            (personal?.oldestWaitingDays ?? 0) >= OPS_APPROVAL_SLA_DAYS
              ? "critical"
              : "default"
          }
          hint={`SLA is ${OPS_APPROVAL_SLA_DAYS} days`}
          value={`${personal?.oldestWaitingDays ?? 0}d`}
        />
        <OpsKpiCard
          href="/ops/notifications"
          icon={Bell}
          label="Unread alerts"
          tone={notifications.length > 0 ? "warn" : "good"}
          hint="Workflow notices"
          value={String(notifications.length)}
        />
      </div>

      {weeklyThroughput.length > 0 ? (
        <section className="rounded-lg border border-primary-dark/10 bg-white p-5 shadow-sm">
          <h2 className="font-heading text-xl font-bold text-primary-dark">
            Approvals throughput — last 8 weeks
          </h2>
          <p className="mt-1 text-sm text-primary-dark/60">
            Requests submitted per week against decisions made. A widening gap means the
            queue is growing.
          </p>
          <div className="mt-4">
            <OpsTrendChart
              ariaLabel="Approval requests submitted, approved and rejected per week over the last 8 weeks"
              emptyMessage="No approval activity in this window"
              points={weeklyThroughput.map((point) => ({
                label: point.label,
                submitted: point.submitted,
                approved: point.approved,
                rejected: point.rejected,
              }))}
              series={[
                { key: "submitted", label: "Submitted", color: OPS_CHART_COLORS.blue, kind: "bar" },
                { key: "approved", label: "Approved", color: OPS_CHART_COLORS.emerald, kind: "bar" },
                { key: "rejected", label: "Rejected", color: OPS_CHART_COLORS.red, kind: "bar" },
              ]}
            />
          </div>
        </section>
      ) : null}

      {personal && personal.myTurn.length > 0 ? (
        <section
          className="scroll-mt-24 rounded-lg border border-orange-200 bg-white shadow-sm"
          id="your-decision-queue"
        >
          <div className="flex items-center justify-between gap-3 border-b border-orange-200/70 bg-orange-50/60 p-5">
            <div>
              <h2 className="flex items-center gap-2 font-heading text-xl font-bold text-primary-dark">
                <UserCheck className="size-5 text-orange-600" aria-hidden="true" />
                Your decision needed
              </h2>
              <p className="mt-1 text-sm text-primary-dark/60">
                The chain has reached you on {personal.myTurn.length} request
                {personal.myTurn.length === 1 ? "" : "s"} — approve or reject right here, oldest
                first. Rejections need a short reason.
              </p>
            </div>
          </div>
          <ul className="divide-y divide-primary-dark/10">
            {personal.myTurn.slice(0, 6).map(({ insight, request }) => (
              <li className="p-5" key={request.id}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <Link
                      className="font-heading text-base font-bold text-primary-dark hover:text-primary-blue"
                      href={`/ops/approvals/${request.id}`}
                    >
                      {request.title}
                    </Link>
                    <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-primary-dark/45">
                      {formatModule(request.module_key)} ·{" "}
                      {formatOpsUserName(request.requester?.full_name, request.requester?.id)} ·{" "}
                      {approvalAmount(request.amount, request.currency_code)}
                    </p>
                    <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-semibold text-primary-dark/60">
                        Step {Math.min(insight.decidedSteps + 1, insight.totalSteps)} of{" "}
                        {insight.totalSteps}
                      </span>
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 font-bold ${
                          insight.isOverdue
                            ? "border-red-200 bg-red-50 text-red-700"
                            : "border-primary-dark/15 bg-primary-dark/[0.03] text-primary-dark/60"
                        }`}
                      >
                        waiting {insight.ageDays}d{insight.isOverdue ? " — overdue" : ""}
                      </span>
                      {request.priority === "urgent" || request.priority === "high" ? (
                        <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-2 py-0.5 font-bold uppercase text-red-700">
                          {request.priority}
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <form
                    action={decideOpsApprovalAction}
                    className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end"
                  >
                    <input name="approval_request_id" type="hidden" value={request.id} />
                    <input
                      aria-label={`Comment for ${request.title}`}
                      className={`${OPS_INPUT_CLASS} min-w-40 flex-1 lg:max-w-64`}
                      maxLength={500}
                      name="comment"
                      placeholder="Comment (required to reject)"
                    />
                    <OpsConfirmSubmitButton
                      className={OPS_PRIMARY_BUTTON_CLASS}
                      confirmText="Confirm approve"
                      name="action"
                      value="approve"
                    >
                      <ThumbsUp className="size-4" aria-hidden="true" />
                      Approve
                    </OpsConfirmSubmitButton>
                    <OpsConfirmSubmitButton
                      className={OPS_DANGER_BUTTON_CLASS}
                      confirmText="Confirm reject"
                      name="action"
                      value="reject"
                    >
                      <ThumbsDown className="size-4" aria-hidden="true" />
                      Reject
                    </OpsConfirmSubmitButton>
                  </form>
                </div>
              </li>
            ))}
          </ul>
          {personal.myTurn.length > 6 ? (
            <p className="border-t border-primary-dark/10 px-5 py-3 text-sm font-semibold text-primary-dark/60">
              {personal.myTurn.length - 6} more in the register below.
            </p>
          ) : null}
        </section>
      ) : null}

      <OpsDashboardPanel
        actions={
          <>
            <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/documents">
              Documents
            </Link>
            <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/material-requests">
              Material requests
            </Link>
            <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/rfq-po">
              Request for Quotation and Purchase Order register
            </Link>
          </>
        }
        eyebrow="Approval flow"
        title="Source record to decision"
      >
        <div className="grid gap-3 lg:grid-cols-4">
          <ApprovalFlowStep
            description="Requests in this view whose current step is assigned to you."
            icon={UserCheck}
            label="Your turn (shown)"
            value={String(shownMyTurn)}
          />
          <ApprovalFlowStep
            description={`Open past the ${OPS_APPROVAL_SLA_DAYS}-day SLA — the daily escalation sweep is already nagging these.`}
            icon={Clock}
            label="Overdue shown"
            value={String(shownOverdue)}
          />
          <ApprovalFlowStep
            description="Combined ZMW value of the requests visible on this page."
            icon={ListChecks}
            label="Visible ZMW value"
            value={formatZmw(visibleZmwAmount)}
          />
          <ApprovalFlowStep
            description={`${openRequests.length} still open in this view; resolved records stay traceable.`}
            icon={CheckCircle2}
            label="Resolved shown"
            value={String(resolvedRequests)}
          />
        </div>
        {latestRequest ? (
          <p className="mt-4 rounded-md border border-primary-dark/10 bg-white px-4 py-3 text-sm leading-6 text-primary-dark/62">
            Latest visible request:{" "}
            <Link
              className="font-bold text-primary-dark transition hover:text-primary-blue"
              href={`/ops/approvals/${latestRequest.id}`}
            >
              {latestRequest.title}
            </Link>
            {" "}from {formatModule(latestRequest.module_key)}.
          </p>
        ) : null}
      </OpsDashboardPanel>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="scroll-mt-24 rounded-lg border border-primary-dark/10 bg-white" id="approval-register">
          <div className="flex items-center justify-between gap-3 border-b border-primary-dark/10 p-5">
            <div>
              <h2 className="font-heading text-xl font-bold text-primary-dark">
                Approval requests
              </h2>
              <p className="mt-1 text-sm text-primary-dark/60">
                {activeDepartment.description}
              </p>
            </div>
            <ShieldCheck className="size-6 shrink-0 text-primary-blue" aria-hidden="true" />
          </div>

          {visibleDepartments.length > 1 ? (
            <div
              aria-label="Approval department tabs"
              className="flex flex-wrap gap-1 border-b border-primary-dark/10 px-3 py-2"
              role="tablist"
            >
              {visibleDepartments.map((dept) => {
                const isActive = dept.key === activeDepartment.key;
                const href =
                  dept.key === activeDepartment.key
                    ? "/ops/approvals"
                    : `/ops/approvals?department=${dept.key}`;
                const openCount = departmentOpenCounts.get(dept.key) ?? 0;
                return (
                  <Link
                    aria-selected={isActive}
                    className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                      isActive
                        ? "bg-primary-blue text-white"
                        : "text-primary-dark/70 hover:bg-primary-blue/10 hover:text-primary-blue"
                    }`}
                    href={href}
                    key={dept.key}
                    role="tab"
                  >
                    {dept.label}
                    {openCount > 0 ? (
                      <span
                        aria-label={`${openCount} open`}
                        className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-black leading-none ${
                          isActive ? "bg-white/20 text-white" : "bg-primary-blue/15 text-primary-blue"
                        }`}
                      >
                        {openCount > 99 ? "99+" : openCount}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          ) : null}
          <OpsListControls
            action="/ops/approvals"
            filters={[
              {
                label: "Status",
                name: "status",
                options: APPROVAL_STATUS_OPTIONS,
                value: status,
              },
            ]}
            placeholder="Search by request title"
            query={listState.query}
            resultLabel="approval requests"
          />

          {requests.length > 0 ? (
            <>
              <OpsMobileRecordList>
                {requests.map((request) => {
                  const insight = insightByRequest.get(request.id);
                  return (
                    <OpsMobileRecordCard key={request.id}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-heading text-lg font-bold text-primary-dark">
                            <Link className="hover:text-primary-blue" href={`/ops/approvals/${request.id}`}>
                              {request.title}
                            </Link>
                          </p>
                          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-primary-dark/45">
                            {formatModule(request.module_key)}
                          </p>
                          {insight?.isMyTurn ? (
                            <span className="mt-1.5 inline-flex rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em] text-orange-700">
                              Your turn
                            </span>
                          ) : null}
                        </div>
                        <span
                          className={`inline-flex shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${statusClass(
                            request.status,
                          )}`}
                        >
                          {formatStatus(request.status)}
                        </span>
                      </div>
                      <OpsMobileRecordRow label="Progress">
                        <ApprovalProgress insight={insight} />
                      </OpsMobileRecordRow>
                      <OpsMobileRecordRow label="Requested by">
                        {formatOpsUserName(request.requester?.full_name, request.requester?.id)}
                      </OpsMobileRecordRow>
                      <OpsMobileRecordRow label="Priority">
                        <span className={priorityClass(request.priority)}>{request.priority}</span>
                      </OpsMobileRecordRow>
                      <OpsMobileRecordRow label="Amount">
                        {approvalAmount(request.amount, request.currency_code)}
                      </OpsMobileRecordRow>
                      <OpsMobileRecordRow label="Due">
                        {formatDateTime(request.due_at)}
                      </OpsMobileRecordRow>
                    </OpsMobileRecordCard>
                  );
                })}
              </OpsMobileRecordList>
              <div
                aria-label="Approval requests table"
                className={`hidden md:block ${OPS_TABLE_SCROLL_CLASS}`}
                tabIndex={0}
              >
                <table className="min-w-full divide-y divide-primary-dark/10 text-sm">
                  <caption className="sr-only">
                    Approval requests with status, requester, priority, due date, and amount.
                  </caption>
                  <thead className="bg-primary-dark/[0.03] text-left text-xs uppercase tracking-[0.12em] text-primary-dark/52">
                    <tr>
                      <th className="px-5 py-3" scope="col">
                        Request
                      </th>
                      <th className="px-5 py-3" scope="col">
                        Progress
                      </th>
                      <th className="px-5 py-3" scope="col">
                        Requester
                      </th>
                      <th className="px-5 py-3" scope="col">
                        Priority
                      </th>
                      <th className="px-5 py-3" scope="col">
                        Amount
                      </th>
                      <th className="px-5 py-3" scope="col">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-primary-dark/10">
                    {requests.map((request) => {
                      const insight = insightByRequest.get(request.id);
                      return (
                        <tr
                          className={insight?.isMyTurn ? "bg-orange-50/40" : undefined}
                          key={request.id}
                        >
                          <td className="px-5 py-4">
                            <div className="flex items-start gap-2">
                              {insight?.isMyTurn ? (
                                <span
                                  aria-hidden="true"
                                  className="mt-1 block h-4 w-1 shrink-0 rounded-full bg-orange-500"
                                />
                              ) : null}
                              <div className="min-w-0">
                                <Link
                                  className="font-bold text-primary-dark hover:text-primary-blue"
                                  href={`/ops/approvals/${request.id}`}
                                >
                                  {request.title}
                                </Link>
                                <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-primary-dark/45">
                                  {formatModule(request.module_key)}
                                  {insight?.isMine ? " · raised by you" : ""}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <ApprovalProgress insight={insight} />
                          </td>
                          <td className="px-5 py-4 text-primary-dark/70">
                            {formatOpsUserName(request.requester?.full_name, request.requester?.id)}
                            {request.requester ? (
                              <span className="mt-1 block text-xs text-primary-dark/45">
                                {formatOpsRole(request.requester.role)}
                              </span>
                            ) : null}
                          </td>
                          <td className={`px-5 py-4 font-semibold ${priorityClass(request.priority)}`}>
                            {request.priority}
                          </td>
                          <td className="px-5 py-4 font-semibold text-primary-dark">
                            {approvalAmount(request.amount, request.currency_code)}
                          </td>
                          <td className="px-5 py-4">
                            <span
                              className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${statusClass(
                                request.status,
                              )}`}
                            >
                              {formatStatus(request.status)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <OpsEmptyState
              icon={Inbox}
              title={
                hasActiveListFilter
                  ? "No approvals match these filters"
                  : "You're caught up"
              }
              description={
                hasActiveListFilter
                  ? "Try clearing the search, switching the status filter, or selecting a different department tab."
                  : "Nothing is waiting for review in this department. Submitted material requests, documents, and purchase orders will appear here automatically."
              }
              actions={
                hasActiveListFilter
                  ? [{ href: "/ops/approvals", label: "Clear filters" }]
                  : [{ href: "/ops", label: "Back to overview", variant: "secondary" }]
              }
              tip={
                hasActiveListFilter
                  ? "Need broader visibility? The 'All' tab shows every department's queue."
                  : undefined
              }
            />
          )}
          <OpsPaginationControls
            basePath="/ops/approvals"
            filters={[
              {
                label: "Status",
                name: "status",
                options: [],
                value: status,
              },
            ]}
            pagination={approvalPage.pagination}
            query={listState.query}
            resultLabel="approval requests"
          />
        </div>

        <aside className="rounded-lg border border-primary-dark/10 bg-white">
          <div className="border-b border-primary-dark/10 p-5">
            <h2 className="font-heading text-xl font-bold text-primary-dark">
              Notifications
            </h2>
            <p className="mt-1 text-sm text-primary-dark/60">
              Workflow alerts that need your attention.
            </p>
            <Link
              className={`${OPS_SECONDARY_BUTTON_CLASS} mt-3`}
              href="/ops/notifications"
            >
              View all notifications
            </Link>
          </div>
          {notifications.length > 0 ? (
            <div className="divide-y divide-primary-dark/10">
              {notifications.map((notification) => (
                <article className="p-5" key={notification.id}>
                  <div className="flex items-start gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary-blue text-white">
                      <Bell className="size-4" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-primary-dark">{notification.title}</p>
                      {notification.body ? (
                        <p className="mt-1 text-sm leading-6 text-primary-dark/62">
                          {notification.body}
                        </p>
                      ) : null}
                      <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-primary-dark/45">
                        {formatModule(notification.module_key)} /{" "}
                        {formatDateTime(notification.created_at)}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {notification.action_href ? (
                          <a className={OPS_SECONDARY_BUTTON_CLASS} href={notification.action_href}>
                            Open related record
                          </a>
                        ) : null}
                        <form action={markOpsNotificationReadAction}>
                          <input name="id" type="hidden" value={notification.id} />
                          <input name="return_to" type="hidden" value="/ops/approvals" />
                          <OpsConfirmSubmitButton
                            className={OPS_SECONDARY_BUTTON_CLASS}
                            confirmText="Confirm"
                          >
                            Mark read
                          </OpsConfirmSubmitButton>
                        </form>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="flex min-h-56 flex-col items-center justify-center gap-3 p-6 text-center">
              <CheckCircle2 className="size-9 text-emerald-600" aria-hidden="true" />
              <div>
                <p className="font-heading text-lg font-bold text-primary-dark">No unread alerts</p>
                <p className="mt-2 text-sm leading-6 text-primary-dark/60">
                  New approval and workflow alerts will appear here.
                </p>
              </div>
            </div>
          )}
        </aside>
      </section>
    </div>
  );
}
