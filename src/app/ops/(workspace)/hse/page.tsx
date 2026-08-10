import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  MailCheck,
  MailWarning,
  Plus,
  Send,
  ShieldCheck,
  ShieldPlus,
  Wrench,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OpsConfirmSubmitButton } from "@/components/ops/OpsConfirmSubmitButton";
import { OpsHseKpiPanel } from "@/components/ops/OpsHseKpiPanel";
import { OpsKpiCard } from "@/components/ops/OpsKpiCard";
import { OpsListControls, OpsPaginationControls } from "@/components/ops/OpsListControls";
import { OpsPageHeader } from "@/components/ops/OpsPageHeader";
import { OpsRealtimeRefresh } from "@/components/ops/OpsRealtimeRefresh";
import { OpsRecordActivityPanel } from "@/components/ops/OpsRecordActivityPanel";
import { fetchOpsModuleAccessOverrides } from "@/lib/ops/module-access";
import { requireOpsUser } from "@/lib/ops/auth";
import {
  OPS_CHART_COLORS,
  OpsStatusDonut,
  OpsTrendChart,
} from "@/components/ops/OpsAnalyticsCharts";
import {
  fetchOpsHseComplianceKpis,
  fetchOpsHseIncidentTrend,
  fetchOpsLtifr,
} from "@/lib/ops/hse-kpis";
import {
  cancelCorrectiveActionAction,
  cancelHseIncidentAction,
  closeHseIncidentAction,
  completeCorrectiveActionAction,
  createCorrectiveActionAction,
  createHseIncidentAction,
  requireHseCorrectiveActionAction,
  startCorrectiveActionAction,
  startHseInvestigationAction,
  verifyCorrectiveActionAction,
} from "@/lib/ops/hse-actions";
import {
  canCancelOpsCorrectiveAction,
  canCancelOpsHseIncident,
  canCloseOpsHseIncident,
  canCompleteOpsCorrectiveAction,
  canCreateOpsCorrectiveAction,
  canCreateOpsHseIncident,
  canManageOpsHseIncident,
  canRequireOpsCorrectiveAction,
  canStartOpsCorrectiveAction,
  canStartOpsHseInvestigation,
  canVerifyOpsCorrectiveAction,
} from "@/lib/ops/hse-permissions";
import {
  fetchOpsHseExecutiveSafetyRollup,
  type OpsHseExecutivePressureLevel,
  type OpsHseExecutiveSignal,
  type OpsHseExecutiveSafetyRollup,
} from "@/lib/ops/hse-executive";
import {
  fetchOpsHseEmailDeliveryReport,
  type OpsHseEmailDeliveryReport,
} from "@/lib/ops/hse-email-observability";
import {
  fetchHseUserOptions,
  fetchOpsHseStats,
  fetchPaginatedOpsHseIncidents,
  type OpsCorrectiveActionSummary,
  type OpsHseIncidentSummary,
} from "@/lib/ops/hse";
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
  OPS_NOTICE_WARNING_CLASS,
  opsStatusBadgeClass,
} from "@/lib/ops/ui";
import type {
  OpsHseIncidentSeverity,
  OpsHseIncidentStatus,
  OpsHseIncidentType,
  OpsPriority,
} from "@/lib/ops/types";
import { todayInLusaka, formatOpsLabel as formatLabel, formatOpsDate as formatDate, formatOpsDateTime as formatDateTime } from "@/lib/ops/format";

type PageProps = {
  searchParams?: Promise<OpsSearchParams>;
};

const INCIDENT_STATUS_OPTIONS: Array<{
  label: string;
  value: OpsHseIncidentStatus | "";
}> = [
  { label: "All statuses", value: "" },
  { label: "Reported", value: "reported" },
  { label: "Investigating", value: "investigating" },
  { label: "Action required", value: "action_required" },
  { label: "Closed", value: "closed" },
  { label: "Cancelled", value: "cancelled" },
];

const INCIDENT_SEVERITY_OPTIONS: Array<{
  label: string;
  value: OpsHseIncidentSeverity | "";
}> = [
  { label: "All severities", value: "" },
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
  { label: "Critical", value: "critical" },
];

const INCIDENT_TYPE_OPTIONS: Array<{ label: string; value: OpsHseIncidentType }> = [
  { label: "Near miss", value: "near_miss" },
  { label: "First aid", value: "first_aid" },
  { label: "Medical treatment", value: "medical_treatment" },
  { label: "Lost time", value: "lost_time" },
  { label: "Property damage", value: "property_damage" },
  { label: "Environmental", value: "environmental" },
  { label: "Unsafe condition", value: "unsafe_condition" },
  { label: "Other", value: "other" },
];

const PRIORITY_OPTIONS: Array<{ label: string; value: OpsPriority }> = [
  { label: "Low", value: "low" },
  { label: "Normal", value: "normal" },
  { label: "High", value: "high" },
  { label: "Urgent", value: "urgent" },
];

function statusFromParam(value: string | undefined) {
  return INCIDENT_STATUS_OPTIONS.some((status) => status.value === value)
    ? (value as OpsHseIncidentStatus | "")
    : "";
}

function severityFromParam(value: string | undefined) {
  return INCIDENT_SEVERITY_OPTIONS.some((severity) => severity.value === value)
    ? (value as OpsHseIncidentSeverity | "")
    : "";
}

function hseNotice(params: OpsSearchParams) {
  const created = noticeFromParams(params, "incident", "Health, Safety and Environment incident created.");

  if (created) {
    return created;
  }

  const createdValue = firstParam(params.created);
  const updatedValue = firstParam(params.updated);
  const messages: Record<string, string> = {
    action: "Corrective action created.",
    action_cancelled: "Corrective action cancelled.",
    action_completed: "Corrective action completed.",
    action_required: "Incident moved to corrective action.",
    action_started: "Corrective action started.",
    action_verified: "Corrective action verified.",
    attachment: "HSE attachment uploaded.",
    cancelled: "Incident cancelled.",
    closed: "Incident closed.",
    comment: "HSE comment added.",
    investigating: "Investigation started.",
  };
  const key = createdValue ?? updatedValue ?? "";

  return key && messages[key]
    ? {
        message: messages[key],
        tone: "success" as const,
      }
    : null;
}

function pressureClass(level: OpsHseExecutivePressureLevel) {
  if (level === "urgent") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (level === "watch") {
    return "border-orange-200 bg-orange-50 text-orange-700";
  }

  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function executiveSignalClass(tone: OpsHseExecutiveSignal["tone"]) {
  if (tone === "urgent") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (tone === "watch") {
    return "border-orange-200 bg-orange-50 text-orange-700";
  }

  return "border-border bg-muted/40 text-muted-foreground";
}

function HseMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 font-bold text-foreground">{value}</dd>
    </div>
  );
}

function ExecutiveSafetyRollup({ rollup }: { rollup: OpsHseExecutiveSafetyRollup }) {
  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-blue">
            Executive safety rollup
          </p>
          <h2 className="mt-2 font-heading text-xl font-bold text-foreground">
            HSE pressure index
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            {rollup.headline}
          </p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] ${pressureClass(rollup.pressureLevel)}`}>
          {formatLabel(rollup.pressureLevel)}
        </span>
      </div>
      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="rounded-md border border-border p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-4xl font-bold text-foreground">{rollup.pressureScore}</p>
              <p className="mt-1 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                Safety pressure
              </p>
            </div>
            <BarChart3 className="size-8 text-primary-blue" aria-hidden="true" />
          </div>
          <div className="mt-4 h-3 overflow-hidden rounded-full bg-muted/40" aria-hidden="true">
            <div
              className={`h-full rounded-full ${
                rollup.pressureLevel === "urgent"
                  ? "bg-red-500"
                  : rollup.pressureLevel === "watch"
                    ? "bg-orange-400"
                    : "bg-emerald-500"
              }`}
              style={{ width: `${rollup.pressureScore}%` }}
            />
          </div>
          <dl className="mt-4 grid gap-2 min-[520px]:grid-cols-2">
            <HseMetric label="Open incidents" value={String(rollup.signals.openIncidents)} />
            <HseMetric label="Open actions" value={String(rollup.signals.openCorrectiveActions)} />
            <HseMetric label="High residual" value={String(rollup.signals.highResidualRiskAssessments)} />
            <HseMetric label="Audit due" value={String(rollup.signals.auditsDueSoon)} />
          </dl>
        </div>
        <div className="grid gap-3 min-[520px]:grid-cols-2">
          {rollup.escalationSignals.map((signal) => (
            <Link
              className={`rounded-md border p-4 transition hover:-translate-y-0.5 hover:shadow-sm ${executiveSignalClass(signal.tone)}`}
              href={signal.href}
              key={signal.label}
            >
              <span className="block text-2xl font-bold">{signal.value}</span>
              <span className="mt-1 block text-xs font-bold uppercase tracking-[0.1em]">
                {signal.label}
              </span>
            </Link>
          ))}
        </div>
      </div>
      <div className="mt-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-muted-foreground">
            Executive trend snapshot
          </h3>
          <p className="text-xs font-semibold text-muted-foreground">Generated {formatDate(rollup.today)}</p>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {rollup.trendSnapshots.map((snapshot) => (
            <Link
              className={`rounded-md border p-4 transition hover:-translate-y-0.5 hover:shadow-sm ${OPS_FOCUS_CLASS} ${executiveSignalClass(
                snapshot.tone,
              )}`}
              href={snapshot.href}
              key={snapshot.label}
            >
              <span className="block text-2xl font-bold">{snapshot.value}</span>
              <span className="mt-1 block text-xs font-bold uppercase tracking-[0.1em]">
                {snapshot.label}
              </span>
              <span className="mt-2 block text-xs leading-5 opacity-75">{snapshot.detail}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function HseEmailDeliveryHealth({ report }: { report: OpsHseEmailDeliveryReport }) {
  const statusTone =
    !report.configured || report.failed7d > 0
      ? "border-orange-200 bg-orange-50 text-orange-800"
      : "border-emerald-200 bg-emerald-50 text-emerald-800";

  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-blue">
            Email observability
          </p>
          <h2 className="mt-2 font-heading text-xl font-bold text-foreground">
            Critical HSE email health
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            Delivery tracking for high-priority HSE escalation emails. In-app notifications remain
            the system of record.
          </p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] ${statusTone}`}>
          {report.configured ? "Configured" : "Not configured"}
        </span>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <OpsKpiCard
          href="/ops/hse#email-delivery-health"
          icon={MailCheck}
          label="Sent 7 days"
          tone={report.sent7d > 0 ? "good" : "default"}
          value={String(report.sent7d)}
        />
        <OpsKpiCard
          href="/ops/hse#email-delivery-health"
          icon={MailWarning}
          label="Failed 7 days"
          tone={report.failed7d > 0 ? "warn" : "good"}
          hint={`${Math.round(report.failureRate7d)}% failure rate`}
          value={String(report.failed7d)}
        />
        <OpsKpiCard
          href="/ops/hse#email-delivery-health"
          icon={Clock}
          label="Skipped 7 days"
          tone={report.skipped7d > 0 ? "warn" : "default"}
          hint={report.configured ? "Recipient or config gaps" : "Not configured"}
          value={String(report.skipped7d)}
        />
        <OpsKpiCard
          href="/ops/hse#email-delivery-health"
          icon={Send}
          label="Last sent"
          tone={report.lastSentAt ? "good" : "default"}
          hint="Critical HSE escalations"
          value={report.lastSentAt ? formatDate(report.lastSentAt) : "None"}
        />
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-md border border-border p-4">
          <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-muted-foreground">
            7-day delivery trend
          </h3>
          <div className="mt-4">
            <OpsTrendChart
              ariaLabel="HSE escalation emails sent, failed and skipped per day over the last 7 days"
              emptyMessage="No escalation emails attempted in the last 7 days"
              points={report.trendRows.map((row) => ({
                label: formatDate(row.date),
                sent: row.sent,
                failed: row.failed,
                skipped: row.skipped,
              }))}
              series={[
                { key: "sent", label: "Sent", color: OPS_CHART_COLORS.emerald, kind: "bar" },
                { key: "failed", label: "Failed", color: OPS_CHART_COLORS.red, kind: "bar" },
                { key: "skipped", label: "Skipped", color: OPS_CHART_COLORS.amber, kind: "bar" },
              ]}
            />
          </div>
        </div>
        <div className="rounded-md border border-border p-4" id="email-delivery-health">
          <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-muted-foreground">
            Recent delivery events
          </h3>
          {report.recentEvents.length > 0 ? (
            <div className="mt-4 grid gap-2">
              {report.recentEvents.map((event) => (
                <Link
                  className={`grid gap-1 rounded-md border px-3 py-3 text-sm transition hover:-translate-y-0.5 hover:shadow-sm ${OPS_FOCUS_CLASS} ${
                    event.status === "sent"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : event.status === "failed"
                        ? "border-red-200 bg-red-50 text-red-800"
                        : "border-orange-200 bg-orange-50 text-orange-800"
                  }`}
                  href={event.action_href ?? "/ops/hse"}
                  key={event.id}
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="font-bold">{event.recipient_label}</span>
                    <span className="text-xs font-bold uppercase tracking-[0.1em]">
                      {event.status}
                    </span>
                  </span>
                  <span className="text-xs leading-5 opacity-75">
                    {event.reason} / {formatDateTime(event.attempted_at)}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-md border border-dashed border-border bg-muted/40 p-5 text-sm leading-6 text-muted-foreground">
              Critical HSE email delivery events will appear after the observability migration is
              applied and an escalation email is attempted.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function ActionControls({
  action,
  actorId,
  role,
}: {
  action: OpsCorrectiveActionSummary;
  actorId: string;
  role: Parameters<typeof canStartOpsCorrectiveAction>[0];
}) {
  const canStart = canStartOpsCorrectiveAction(role, action);
  const canComplete = canCompleteOpsCorrectiveAction(actorId, role, action);
  const canVerify = canVerifyOpsCorrectiveAction(role, action);
  const canCancel = canCancelOpsCorrectiveAction(role, action);

  return (
    <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
      {canStart ? (
        <form action={startCorrectiveActionAction}>
          <input name="action_id" type="hidden" value={action.id} />
          <button className={`${OPS_SECONDARY_BUTTON_CLASS} w-full`} type="submit">
            <Clock className="size-4" aria-hidden="true" />
            Start
          </button>
        </form>
      ) : null}
      {canComplete ? (
        <details className="rounded-md border border-border md:col-span-2">
          <summary className={`cursor-pointer list-none px-3 py-3 text-sm font-bold text-foreground [&::-webkit-details-marker]:hidden ${OPS_FOCUS_CLASS}`}>
            Complete action
          </summary>
          <form action={completeCorrectiveActionAction} className="grid gap-3 border-t border-border p-3">
            <input name="action_id" type="hidden" value={action.id} />
            <label className={OPS_LABEL_CLASS}>
              Completion notes
              <textarea className={`${OPS_INPUT_CLASS} min-h-24`} name="completion_notes" />
            </label>
            <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              Complete
            </button>
          </form>
        </details>
      ) : null}
      {canVerify ? (
        <details className="rounded-md border border-border md:col-span-2">
          <summary className={`cursor-pointer list-none px-3 py-3 text-sm font-bold text-foreground [&::-webkit-details-marker]:hidden ${OPS_FOCUS_CLASS}`}>
            Verify action
          </summary>
          <form action={verifyCorrectiveActionAction} className="grid gap-3 border-t border-border p-3">
            <input name="action_id" type="hidden" value={action.id} />
            <label className={OPS_LABEL_CLASS}>
              Verification notes
              <textarea className={`${OPS_INPUT_CLASS} min-h-24`} name="verification_notes" />
            </label>
            <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
              <ShieldCheck className="size-4" aria-hidden="true" />
              Verify
            </button>
          </form>
        </details>
      ) : null}
      {canCancel ? (
        <form action={cancelCorrectiveActionAction}>
          <input name="action_id" type="hidden" value={action.id} />
          <OpsConfirmSubmitButton
            className={`${OPS_DANGER_BUTTON_CLASS} min-h-11 w-full justify-center`}
            confirmText="Cancel action"
          >
            <XCircle className="size-4" aria-hidden="true" />
            Cancel
          </OpsConfirmSubmitButton>
        </form>
      ) : null}
    </div>
  );
}

function IncidentActionRequiredForm({ incident }: { incident: OpsHseIncidentSummary }) {
  return (
    <details className="rounded-md border border-border">
      <summary className={`cursor-pointer list-none px-4 py-3 text-sm font-bold text-foreground [&::-webkit-details-marker]:hidden ${OPS_FOCUS_CLASS}`}>
        Move to corrective action
      </summary>
      <form action={requireHseCorrectiveActionAction} className="grid gap-3 border-t border-border p-4">
        <input name="incident_id" type="hidden" value={incident.id} />
        <label className={OPS_LABEL_CLASS}>
          Investigation summary
          <textarea className={`${OPS_INPUT_CLASS} min-h-24`} name="investigation_summary" />
        </label>
        <label className={OPS_LABEL_CLASS}>
          Root cause
          <textarea className={`${OPS_INPUT_CLASS} min-h-20`} name="root_cause" />
        </label>
        <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
          <Wrench className="size-4" aria-hidden="true" />
          Require action
        </button>
      </form>
    </details>
  );
}

export default async function OpsHsePage({ searchParams }: PageProps) {
  const [params, auth] = await Promise.all([
    searchParams ?? Promise.resolve({} as OpsSearchParams),
    requireOpsUser(),
  ]);

  if (!canAccessOpsHref(auth.profile.role, "/ops/hse", await fetchOpsModuleAccessOverrides())) {
    notFound();
  }

  const listState = parseOpsListState(params, { defaultPageSize: 8 });
  const status = statusFromParam(firstParam(params.status));
  const severity = severityFromParam(firstParam(params.severity));
  const [
    incidentPage,
    stats,
    siteOptions,
    userOptions,
    executiveSafetyRollup,
    emailDeliveryReport,
    ltifr,
    hseCompliance,
    incidentTrend,
  ] = await Promise.all([
    fetchPaginatedOpsHseIncidents({
      listState,
      query: listState.query,
      severity: severity || undefined,
      status: status || undefined,
    }),
    fetchOpsHseStats(),
    fetchActiveSiteOptions(),
    fetchHseUserOptions(),
    fetchOpsHseExecutiveSafetyRollup(),
    fetchOpsHseEmailDeliveryReport(),
    fetchOpsLtifr(),
    fetchOpsHseComplianceKpis(),
    fetchOpsHseIncidentTrend(6),
  ]);
  const notice = hseNotice(params);
  const canCreateIncident = canCreateOpsHseIncident(auth.profile.role);
  const canCreateAction = canCreateOpsCorrectiveAction(auth.profile.role);
  const canManageIncidents = canManageOpsHseIncident(auth.profile.role);
  const hasActiveListFilter = listState.query.length > 0 || Boolean(status) || Boolean(severity);
  const createPanel = firstParam(params.create);
  const openIncidentPanel = createPanel === "incident";
  const openActionPanel = createPanel === "action";
  const today = todayInLusaka();

  return (
    <div className="w-full max-w-none space-y-6">
      <OpsRealtimeRefresh tables={["hse_incidents", "hse_corrective_actions"]} />
      <OpsPageHeader
        eyebrow="Health, Safety and Environment control"
        title="Incidents and actions"
        description="Record incidents, near misses, investigations, corrective actions, closure notes, and evidence."
        actions={
          <>
            {canCreateIncident ? (
              <Link className={OPS_PRIMARY_BUTTON_CLASS} href="/ops/hse?create=incident#incident-create-panel">
                <Plus className="size-4" aria-hidden="true" />
                Report incident
              </Link>
            ) : null}
            {canCreateAction ? (
              <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/hse?create=action#action-create-panel">
                <Wrench className="size-4" aria-hidden="true" />
                New action
              </Link>
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

      <OpsHseKpiPanel compliance={hseCompliance} ltifr={ltifr} />

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <OpsKpiCard
          href="/ops/hse?status=reported#incident-register"
          icon={AlertTriangle}
          label="Reported"
          tone={stats.reported > 0 ? "warn" : "default"}
          hint="Needs triage"
          sparkline={incidentTrend.points.map(
            (point) => point.recordable + point.nearMisses,
          )}
          value={String(stats.reported)}
        />
        <OpsKpiCard
          href="/ops/hse?status=investigating#incident-register"
          icon={Clock}
          label="Investigating"
          tone={stats.investigating > 0 ? "warn" : "default"}
          hint="In progress"
          value={String(stats.investigating)}
        />
        <OpsKpiCard
          href="/ops/hse?severity=high#incident-register"
          icon={ShieldPlus}
          label="High risk open"
          tone={stats.criticalOpen > 0 ? "warn" : "default"}
          hint="High/critical severity"
          value={String(stats.criticalOpen)}
        />
        <OpsKpiCard
          href="/ops/hse#incident-register"
          icon={Wrench}
          label="Open actions"
          tone={stats.openActions > 0 ? "warn" : "good"}
          hint="Corrective work"
          value={String(stats.openActions)}
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <div className="rounded-lg border border-border bg-card p-5">
          <h2 className="font-heading text-xl font-bold text-foreground">
            Incident trend — last {incidentTrend.months} months
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Recordable incidents, near-misses and lost-time incidents per month.
          </p>
          <div className="mt-4">
            <OpsTrendChart
              ariaLabel={`Monthly recordable incidents, near-misses and lost-time incidents for the last ${incidentTrend.months} months`}
              emptyMessage="No incidents recorded in this window"
              points={incidentTrend.points.map((point) => ({
                label: point.label,
                recordable: point.recordable,
                nearMisses: point.nearMisses,
                lostTime: point.lostTime,
              }))}
              series={[
                { key: "recordable", label: "Recordable", color: OPS_CHART_COLORS.amber, kind: "bar" },
                { key: "nearMisses", label: "Near-misses", color: OPS_CHART_COLORS.blue, kind: "bar" },
                { key: "lostTime", label: "Lost-time", color: OPS_CHART_COLORS.red, kind: "line" },
              ]}
            />
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-5">
          <h2 className="font-heading text-xl font-bold text-foreground">Severity mix</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            All incidents in the window by severity.
          </p>
          <div className="mt-4">
            <OpsStatusDonut
              ariaLabel="Incident severity distribution"
              emptyMessage="No incidents recorded in this window"
              items={incidentTrend.severity.map((entry) => ({
                label:
                  entry.severity.charAt(0).toUpperCase() + entry.severity.slice(1),
                value: entry.count,
                color:
                  entry.severity === "critical"
                    ? OPS_CHART_COLORS.red
                    : entry.severity === "high"
                      ? OPS_CHART_COLORS.orange
                      : entry.severity === "medium"
                        ? OPS_CHART_COLORS.amber
                        : OPS_CHART_COLORS.slate,
              }))}
            />
          </div>
        </div>
      </section>

      <ExecutiveSafetyRollup rollup={executiveSafetyRollup} />

      <HseEmailDeliveryHealth report={emailDeliveryReport} />

      {canCreateIncident ? (
        <details
          className="scroll-mt-24 rounded-lg border border-border bg-card"
          id="incident-create-panel"
          open={openIncidentPanel}
        >
          <summary className={`flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden ${OPS_FOCUS_CLASS}`}>
            <span className="flex size-10 items-center justify-center rounded-md bg-primary-blue text-white">
              <AlertTriangle className="size-5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-heading text-xl font-bold text-foreground">
                Report Health, Safety and Environment incident
              </span>
              <span className="mt-1 block text-sm text-muted-foreground">
                Capture site, severity, date, people involved, and immediate controls.
              </span>
            </span>
            <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Open
            </span>
          </summary>
          {siteOptions.length === 0 ? (
            <div className="border-t border-border p-5">
              <div className={OPS_NOTICE_WARNING_CLASS}>
                Add an active site before reporting incidents.
              </div>
            </div>
          ) : (
            <form action={createHseIncidentAction} className="grid gap-4 border-t border-border p-5 min-[520px]:grid-cols-2 lg:grid-cols-4">
              <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
                Site
                <select className={OPS_INPUT_CLASS} name="site_id" required>
                  <option value="">Select site</option>
                  {siteOptions.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.code} - {site.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={OPS_LABEL_CLASS}>
                Type
                <select className={OPS_INPUT_CLASS} defaultValue="near_miss" name="incident_type">
                  {INCIDENT_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={OPS_LABEL_CLASS}>
                Severity
                <select className={OPS_INPUT_CLASS} defaultValue="medium" name="severity">
                  {INCIDENT_SEVERITY_OPTIONS.filter((option) => option.value).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={OPS_LABEL_CLASS}>
                Occurred date
                <input className={OPS_INPUT_CLASS} defaultValue={today} name="occurred_at" type="date" />
              </label>
              <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
                Location detail
                <input className={OPS_INPUT_CLASS} name="location_detail" />
              </label>
              <label className={`${OPS_LABEL_CLASS} min-[520px]:col-span-2 lg:col-span-4`}>
                Title
                <input className={OPS_INPUT_CLASS} name="title" required />
              </label>
              <label className={`${OPS_LABEL_CLASS} min-[520px]:col-span-2 lg:col-span-3`}>
                Description
                <textarea className={`${OPS_INPUT_CLASS} min-h-28`} name="description" />
              </label>
              <label className={`${OPS_LABEL_CLASS} min-[520px]:col-span-2 lg:col-span-3`}>
                Immediate action
                <textarea className={`${OPS_INPUT_CLASS} min-h-28`} name="immediate_action" />
              </label>
              <label className={`${OPS_LABEL_CLASS} min-[520px]:col-span-2 lg:col-span-4`}>
                People involved
                <input className={OPS_INPUT_CLASS} name="people_involved" />
              </label>
              <div className="flex items-end min-[520px]:col-span-2 lg:col-span-4">
                <button className={`${OPS_PRIMARY_BUTTON_CLASS} w-full md:w-auto`} type="submit">
                  <Plus className="size-4" aria-hidden="true" />
                  Create incident
                </button>
              </div>
            </form>
          )}
        </details>
      ) : null}

      {canCreateAction ? (
        <details
          className="scroll-mt-24 rounded-lg border border-border bg-card"
          id="action-create-panel"
          open={openActionPanel}
        >
          <summary className={`flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden ${OPS_FOCUS_CLASS}`}>
            <span className="flex size-10 items-center justify-center rounded-md bg-primary-dark text-white">
              <Wrench className="size-5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-heading text-xl font-bold text-foreground">
                Create corrective action
              </span>
              <span className="mt-1 block text-sm text-muted-foreground">
                Link it to an incident when available, assign an owner, and track due date.
              </span>
            </span>
            <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Open
            </span>
          </summary>
          <form action={createCorrectiveActionAction} className="grid gap-4 border-t border-border p-5 min-[520px]:grid-cols-2 lg:grid-cols-4">
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
              Related incident
              <select className={OPS_INPUT_CLASS} name="incident_id">
                <option value="">No incident link</option>
                {incidentPage.items.map((incident) => (
                  <option key={incident.id} value={incident.id}>
                    {incident.incident_number} - {incident.title}
                  </option>
                ))}
              </select>
            </label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
              Site
              <select className={OPS_INPUT_CLASS} name="site_id" required>
                <option value="">Select site</option>
                {siteOptions.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.code} - {site.name}
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
              Due date
              <input className={OPS_INPUT_CLASS} name="due_date" type="date" />
            </label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
              Owner
              <select className={OPS_INPUT_CLASS} name="owner_id">
                <option value="">Unassigned</option>
                {userOptions.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.full_name}
                  </option>
                ))}
              </select>
            </label>
            <label className={`${OPS_LABEL_CLASS} min-[520px]:col-span-2 lg:col-span-4`}>
              Title
              <input className={OPS_INPUT_CLASS} name="title" required />
            </label>
            <label className={`${OPS_LABEL_CLASS} min-[520px]:col-span-2 lg:col-span-4`}>
              Description
              <textarea className={`${OPS_INPUT_CLASS} min-h-24`} name="description" />
            </label>
            <div className="flex items-end min-[520px]:col-span-2 lg:col-span-4">
              <button className={`${OPS_PRIMARY_BUTTON_CLASS} w-full md:w-auto`} type="submit">
                <Plus className="size-4" aria-hidden="true" />
                Create action
              </button>
            </div>
          </form>
        </details>
      ) : null}

      <section className="scroll-mt-24 rounded-lg border border-border bg-card" id="incident-register">
        <div className="flex items-center justify-between gap-3 border-b border-border p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              HSE register
            </p>
            <h2 className="font-heading text-xl font-bold text-foreground">
              Incident records
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {incidentPage.pagination.total} matching incident records.
            </p>
          </div>
          <ShieldCheck className="size-6 shrink-0 text-primary-blue" aria-hidden="true" />
        </div>
        <OpsListControls
          action="/ops/hse"
          filters={[
            {
              label: "Status",
              name: "status",
              options: INCIDENT_STATUS_OPTIONS,
              value: status,
            },
            {
              label: "Severity",
              name: "severity",
              options: INCIDENT_SEVERITY_OPTIONS,
              value: severity,
            },
          ]}
          placeholder="Search incident number, title, location, or people involved"
          query={listState.query}
          resultLabel="incidents"
        />

        {incidentPage.items.length > 0 ? (
          <div className="divide-y divide-border">
            {incidentPage.items.map((incident) => {
              const canStart = canStartOpsHseInvestigation(auth.profile.role, incident);
              const canRequireAction = canRequireOpsCorrectiveAction(auth.profile.role, incident);
              const canClose = canCloseOpsHseIncident(auth.profile.role, incident);
              const canCancel = canCancelOpsHseIncident(auth.profile.role, incident);

              return (
                <article className="p-5" key={incident.id}>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-heading text-lg font-bold text-foreground">
                          {incident.incident_number}
                        </h3>
                        <span className={opsStatusBadgeClass(incident.status)}>
                          {formatLabel(incident.status)}
                        </span>
                        <span className={opsStatusBadgeClass(incident.severity)}>
                          {formatLabel(incident.severity)}
                        </span>
                      </div>
                      <p className="mt-2 font-bold text-foreground">{incident.title}</p>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        {incident.site ? `${incident.site.code} - ${incident.site.name}` : "Site unavailable"} /{" "}
                        {formatLabel(incident.incident_type)}
                      </p>
                    </div>
                    <div className="grid gap-2 min-[520px]:grid-cols-2 lg:min-w-56 lg:grid-cols-1">
                      {canStart ? (
                        <form action={startHseInvestigationAction}>
                          <input name="incident_id" type="hidden" value={incident.id} />
                          <button className={`${OPS_PRIMARY_BUTTON_CLASS} w-full`} type="submit">
                            <ClipboardCheck className="size-4" aria-hidden="true" />
                            Investigate
                          </button>
                        </form>
                      ) : null}
                      {canClose ? (
                        <form action={closeHseIncidentAction}>
                          <input name="incident_id" type="hidden" value={incident.id} />
                          <input name="close_summary" type="hidden" value={incident.investigation_summary} />
                          <OpsConfirmSubmitButton
                            className={`${OPS_SECONDARY_BUTTON_CLASS} w-full`}
                            confirmText="Close incident"
                          >
                            Close
                          </OpsConfirmSubmitButton>
                        </form>
                      ) : null}
                      {canCancel ? (
                        <form action={cancelHseIncidentAction}>
                          <input name="incident_id" type="hidden" value={incident.id} />
                          <OpsConfirmSubmitButton
                            className={`${OPS_DANGER_BUTTON_CLASS} min-h-11 w-full justify-center`}
                            confirmText="Cancel incident"
                          >
                            <XCircle className="size-4" aria-hidden="true" />
                            Cancel
                          </OpsConfirmSubmitButton>
                        </form>
                      ) : null}
                    </div>
                  </div>

                  <dl className="mt-4 grid gap-3 md:grid-cols-4">
                    <HseMetric label="Occurred" value={formatDateTime(incident.occurred_at)} />
                    <HseMetric label="Location" value={incident.location_detail || "Not recorded"} />
                    <HseMetric
                      label="Reported by"
                      value={formatOpsUserName(
                        incident.reported_by_user?.full_name,
                        incident.reported_by_user?.id,
                      )}
                    />
                    <HseMetric label="Closed" value={formatDate(incident.closed_at)} />
                  </dl>

                  {incident.description || incident.immediate_action ? (
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <p className="rounded-md border border-border px-3 py-3 text-sm leading-6 text-muted-foreground">
                        {incident.description || "No incident description recorded."}
                      </p>
                      <p className="rounded-md border border-border px-3 py-3 text-sm leading-6 text-muted-foreground">
                        {incident.immediate_action || "No immediate action recorded."}
                      </p>
                    </div>
                  ) : null}

                  {canRequireAction ? (
                    <div className="mt-4">
                      <IncidentActionRequiredForm incident={incident} />
                    </div>
                  ) : null}

                  {incident.actions.length > 0 ? (
                    <div className="mt-4 space-y-3">
                      {incident.actions.map((action) => (
                        <div className="rounded-md border border-border p-4" key={action.id}>
                          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                            <div>
                              <p className="font-bold text-foreground">
                                {action.action_number} - {action.title}
                              </p>
                              <p className="mt-1 text-sm text-muted-foreground">
                                Owner: {action.owner?.full_name ?? "Unassigned"} / Due: {formatDate(action.due_date)}
                              </p>
                            </div>
                            <span className={`w-fit ${opsStatusBadgeClass(action.status)}`}>
                              {formatLabel(action.status)}
                            </span>
                          </div>
                          {action.description ? (
                            <p className="mt-3 text-sm leading-6 text-muted-foreground">
                              {action.description}
                            </p>
                          ) : null}
                          <ActionControls action={action} actorId={auth.profile.id} role={auth.profile.role} />
                          <OpsRecordActivityPanel
                            canManage={canCreateAction}
                            sourceId={action.id}
                            sourceTable="corrective_actions"
                          />
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <OpsRecordActivityPanel
                    canManage={canManageIncidents}
                    sourceId={incident.id}
                    sourceTable="hse_incidents"
                  />
                </article>
              );
            })}
          </div>
        ) : (
          <div className="flex min-h-56 flex-col items-center justify-center gap-3 p-8 text-center">
            <ShieldCheck className="size-10 text-primary-blue" aria-hidden="true" />
            <div>
              <p className="font-heading text-xl font-bold text-foreground">
                {hasActiveListFilter ? "No matching incidents" : "No Health, Safety and Environment incidents yet"}
              </p>
              <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
                {hasActiveListFilter
                  ? "Adjust the search, status, or severity filter to widen the register."
                  : "Create the first incident or near-miss record when something needs HSE follow-up."}
              </p>
            </div>
          </div>
        )}
        <OpsPaginationControls
          basePath="/ops/hse"
          filters={[
            { label: "Status", name: "status", options: [], value: status },
            { label: "Severity", name: "severity", options: [], value: severity },
          ]}
          pagination={incidentPage.pagination}
          query={listState.query}
          resultLabel="incidents"
        />
      </section>
    </div>
  );
}
