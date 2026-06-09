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
import { OpsKpiCard } from "@/components/ops/OpsKpiCard";
import { OpsListControls, OpsPaginationControls } from "@/components/ops/OpsListControls";
import { OpsRecordActivityPanel } from "@/components/ops/OpsRecordActivityPanel";
import { requireOpsUser } from "@/lib/ops/auth";
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
} from "@/lib/ops/ui";
import type {
  OpsCorrectiveActionStatus,
  OpsHseIncidentSeverity,
  OpsHseIncidentStatus,
  OpsHseIncidentType,
  OpsPriority,
} from "@/lib/ops/types";

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
  const created = noticeFromParams(params, "incident", "HSE incident created.");

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
  }).format(new Date(`${value.slice(0, 10)}T00:00:00+02:00`));
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

function formatLabel(value: string) {
  return value.replace(/_/g, " ");
}

function incidentStatusClass(status: OpsHseIncidentStatus) {
  if (status === "closed") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "cancelled") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (status === "investigating" || status === "action_required") {
    return "border-orange-200 bg-orange-50 text-orange-700";
  }

  return "border-sky-200 bg-sky-50 text-sky-700";
}

function severityClass(severity: OpsHseIncidentSeverity) {
  if (severity === "critical") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (severity === "high") {
    return "border-orange-200 bg-orange-50 text-orange-700";
  }

  if (severity === "medium") {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }

  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function actionStatusClass(status: OpsCorrectiveActionStatus) {
  if (status === "verified") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "completed") {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }

  if (status === "cancelled") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  return "border-orange-200 bg-orange-50 text-orange-700";
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

  return "border-primary-dark/10 bg-primary-dark/[0.02] text-primary-dark/62";
}

function HseMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-primary-dark/10 px-3 py-2">
      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-primary-dark/45">
        {label}
      </dt>
      <dd className="mt-1 font-bold text-primary-dark">{value}</dd>
    </div>
  );
}

function ExecutiveSafetyRollup({ rollup }: { rollup: OpsHseExecutiveSafetyRollup }) {
  return (
    <section className="rounded-lg border border-primary-dark/10 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-blue">
            Executive safety rollup
          </p>
          <h2 className="mt-2 font-heading text-xl font-bold text-primary-dark">
            HSE pressure index
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-primary-dark/60">
            {rollup.headline}
          </p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] ${pressureClass(rollup.pressureLevel)}`}>
          {formatLabel(rollup.pressureLevel)}
        </span>
      </div>
      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="rounded-md border border-primary-dark/10 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-4xl font-bold text-primary-dark">{rollup.pressureScore}</p>
              <p className="mt-1 text-xs font-bold uppercase tracking-[0.12em] text-primary-dark/42">
                Safety pressure
              </p>
            </div>
            <BarChart3 className="size-8 text-primary-blue" aria-hidden="true" />
          </div>
          <div className="mt-4 h-3 overflow-hidden rounded-full bg-primary-dark/8" aria-hidden="true">
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
          <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-primary-dark/50">
            Executive trend snapshot
          </h3>
          <p className="text-xs font-semibold text-primary-dark/45">Generated {formatDate(rollup.today)}</p>
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
  const maxTrend = Math.max(...report.trendRows.map((row) => row.total), 1);
  const statusTone =
    !report.configured || report.failed7d > 0
      ? "border-orange-200 bg-orange-50 text-orange-800"
      : "border-emerald-200 bg-emerald-50 text-emerald-800";

  return (
    <section className="rounded-lg border border-primary-dark/10 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-blue">
            Email observability
          </p>
          <h2 className="mt-2 font-heading text-xl font-bold text-primary-dark">
            Critical HSE email health
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-primary-dark/60">
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
          trend="Email"
          value={String(report.sent7d)}
        />
        <OpsKpiCard
          href="/ops/hse#email-delivery-health"
          icon={MailWarning}
          label="Failed 7 days"
          tone={report.failed7d > 0 ? "warn" : "good"}
          trend={`${Math.round(report.failureRate7d)}% fail`}
          value={String(report.failed7d)}
        />
        <OpsKpiCard
          href="/ops/hse#email-delivery-health"
          icon={Clock}
          label="Skipped 7 days"
          tone={report.skipped7d > 0 ? "warn" : "default"}
          trend={report.configured ? "Recipient/config" : "Config"}
          value={String(report.skipped7d)}
        />
        <OpsKpiCard
          href="/ops/hse#email-delivery-health"
          icon={Send}
          label="Last sent"
          tone={report.lastSentAt ? "good" : "default"}
          trend="Critical HSE"
          value={report.lastSentAt ? formatDate(report.lastSentAt) : "None"}
        />
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-md border border-primary-dark/10 p-4">
          <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-primary-dark/50">
            7-day delivery trend
          </h3>
          <div className="mt-4 grid gap-3">
            {report.trendRows.map((row) => {
              const width = `${Math.max((row.total / maxTrend) * 100, row.total > 0 ? 8 : 2)}%`;

              return (
                <div className="grid gap-1.5" key={row.date}>
                  <div className="flex items-center justify-between gap-3 text-xs font-bold text-primary-dark/55">
                    <span>{formatDate(row.date)}</span>
                    <span>
                      {row.sent} sent / {row.failed} failed / {row.skipped} skipped
                    </span>
                  </div>
                  <div className="h-3 rounded-full bg-primary-dark/[0.04]">
                    <div
                      aria-label={`${formatDate(row.date)} HSE email attempts: ${row.total}`}
                      className={`h-3 rounded-full ${row.failed > 0 ? "bg-orange-400" : "bg-emerald-500"}`}
                      style={{ width }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="rounded-md border border-primary-dark/10 p-4" id="email-delivery-health">
          <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-primary-dark/50">
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
            <div className="mt-4 rounded-md border border-dashed border-primary-dark/15 bg-primary-dark/[0.03] p-5 text-sm leading-6 text-primary-dark/60">
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
        <details className="rounded-md border border-primary-dark/10 md:col-span-2">
          <summary className={`cursor-pointer list-none px-3 py-3 text-sm font-bold text-primary-dark [&::-webkit-details-marker]:hidden ${OPS_FOCUS_CLASS}`}>
            Complete action
          </summary>
          <form action={completeCorrectiveActionAction} className="grid gap-3 border-t border-primary-dark/10 p-3">
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
        <details className="rounded-md border border-primary-dark/10 md:col-span-2">
          <summary className={`cursor-pointer list-none px-3 py-3 text-sm font-bold text-primary-dark [&::-webkit-details-marker]:hidden ${OPS_FOCUS_CLASS}`}>
            Verify action
          </summary>
          <form action={verifyCorrectiveActionAction} className="grid gap-3 border-t border-primary-dark/10 p-3">
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
    <details className="rounded-md border border-primary-dark/10">
      <summary className={`cursor-pointer list-none px-4 py-3 text-sm font-bold text-primary-dark [&::-webkit-details-marker]:hidden ${OPS_FOCUS_CLASS}`}>
        Move to corrective action
      </summary>
      <form action={requireHseCorrectiveActionAction} className="grid gap-3 border-t border-primary-dark/10 p-4">
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

  if (!canAccessOpsHref(auth.profile.role, "/ops/hse")) {
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
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-blue">
            HSE control
          </p>
          <h1 className="mt-2 font-heading text-3xl font-bold text-primary-dark">
            Incidents and actions
          </h1>
          <p className="mt-3 max-w-3xl text-base leading-7 text-primary-dark/68">
            Record incidents, near misses, investigations, corrective actions, closure notes, and evidence.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
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

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <OpsKpiCard
          href="/ops/hse?status=reported#incident-register"
          icon={AlertTriangle}
          label="Reported"
          tone={stats.reported > 0 ? "warn" : "default"}
          trend="Needs triage"
          value={String(stats.reported)}
        />
        <OpsKpiCard
          href="/ops/hse?status=investigating#incident-register"
          icon={Clock}
          label="Investigating"
          tone={stats.investigating > 0 ? "warn" : "default"}
          trend="In progress"
          value={String(stats.investigating)}
        />
        <OpsKpiCard
          href="/ops/hse?severity=high#incident-register"
          icon={ShieldPlus}
          label="High risk open"
          tone={stats.criticalOpen > 0 ? "warn" : "default"}
          trend="High/critical"
          value={String(stats.criticalOpen)}
        />
        <OpsKpiCard
          href="/ops/hse#incident-register"
          icon={Wrench}
          label="Open actions"
          tone={stats.openActions > 0 ? "warn" : "good"}
          trend="Corrective work"
          value={String(stats.openActions)}
        />
      </section>

      <ExecutiveSafetyRollup rollup={executiveSafetyRollup} />

      <HseEmailDeliveryHealth report={emailDeliveryReport} />

      {canCreateIncident ? (
        <details
          className="scroll-mt-24 rounded-lg border border-primary-dark/10 bg-white"
          id="incident-create-panel"
          open={openIncidentPanel}
        >
          <summary className={`flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden ${OPS_FOCUS_CLASS}`}>
            <span className="flex size-10 items-center justify-center rounded-md bg-primary-blue text-white">
              <AlertTriangle className="size-5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-heading text-xl font-bold text-primary-dark">
                Report HSE incident
              </span>
              <span className="mt-1 block text-sm text-primary-dark/60">
                Capture site, severity, date, people involved, and immediate controls.
              </span>
            </span>
            <span className="text-xs font-bold uppercase tracking-[0.12em] text-primary-dark/45">
              Open
            </span>
          </summary>
          {siteOptions.length === 0 ? (
            <div className="border-t border-primary-dark/10 p-5">
              <div className="rounded-md border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
                Add an active site before reporting incidents.
              </div>
            </div>
          ) : (
            <form action={createHseIncidentAction} className="grid gap-4 border-t border-primary-dark/10 p-5 min-[520px]:grid-cols-2 lg:grid-cols-6">
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
              <label className={`${OPS_LABEL_CLASS} min-[520px]:col-span-2 lg:col-span-6`}>
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
              <label className={`${OPS_LABEL_CLASS} min-[520px]:col-span-2 lg:col-span-6`}>
                People involved
                <input className={OPS_INPUT_CLASS} name="people_involved" />
              </label>
              <div className="flex items-end min-[520px]:col-span-2 lg:col-span-6">
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
          className="scroll-mt-24 rounded-lg border border-primary-dark/10 bg-white"
          id="action-create-panel"
          open={openActionPanel}
        >
          <summary className={`flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden ${OPS_FOCUS_CLASS}`}>
            <span className="flex size-10 items-center justify-center rounded-md bg-primary-dark text-white">
              <Wrench className="size-5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-heading text-xl font-bold text-primary-dark">
                Create corrective action
              </span>
              <span className="mt-1 block text-sm text-primary-dark/60">
                Link it to an incident when available, assign an owner, and track due date.
              </span>
            </span>
            <span className="text-xs font-bold uppercase tracking-[0.12em] text-primary-dark/45">
              Open
            </span>
          </summary>
          <form action={createCorrectiveActionAction} className="grid gap-4 border-t border-primary-dark/10 p-5 min-[520px]:grid-cols-2 lg:grid-cols-6">
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
            <label className={`${OPS_LABEL_CLASS} min-[520px]:col-span-2 lg:col-span-6`}>
              Description
              <textarea className={`${OPS_INPUT_CLASS} min-h-24`} name="description" />
            </label>
            <div className="flex items-end min-[520px]:col-span-2 lg:col-span-6">
              <button className={`${OPS_PRIMARY_BUTTON_CLASS} w-full md:w-auto`} type="submit">
                <Plus className="size-4" aria-hidden="true" />
                Create action
              </button>
            </div>
          </form>
        </details>
      ) : null}

      <section className="scroll-mt-24 rounded-lg border border-primary-dark/10 bg-white" id="incident-register">
        <div className="flex items-center justify-between gap-3 border-b border-primary-dark/10 p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-dark/45">
              HSE register
            </p>
            <h2 className="font-heading text-xl font-bold text-primary-dark">
              Incident records
            </h2>
            <p className="mt-1 text-sm text-primary-dark/60">
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
          <div className="divide-y divide-primary-dark/10">
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
                        <h3 className="font-heading text-lg font-bold text-primary-dark">
                          {incident.incident_number}
                        </h3>
                        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${incidentStatusClass(incident.status)}`}>
                          {formatLabel(incident.status)}
                        </span>
                        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${severityClass(incident.severity)}`}>
                          {formatLabel(incident.severity)}
                        </span>
                      </div>
                      <p className="mt-2 font-bold text-primary-dark">{incident.title}</p>
                      <p className="mt-1 text-sm leading-6 text-primary-dark/62">
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
                      <p className="rounded-md border border-primary-dark/10 px-3 py-3 text-sm leading-6 text-primary-dark/65">
                        {incident.description || "No incident description recorded."}
                      </p>
                      <p className="rounded-md border border-primary-dark/10 px-3 py-3 text-sm leading-6 text-primary-dark/65">
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
                        <div className="rounded-md border border-primary-dark/10 p-4" key={action.id}>
                          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                            <div>
                              <p className="font-bold text-primary-dark">
                                {action.action_number} - {action.title}
                              </p>
                              <p className="mt-1 text-sm text-primary-dark/60">
                                Owner: {action.owner?.full_name ?? "Unassigned"} / Due: {formatDate(action.due_date)}
                              </p>
                            </div>
                            <span className={`w-fit rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${actionStatusClass(action.status)}`}>
                              {formatLabel(action.status)}
                            </span>
                          </div>
                          {action.description ? (
                            <p className="mt-3 text-sm leading-6 text-primary-dark/65">
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
              <p className="font-heading text-xl font-bold text-primary-dark">
                {hasActiveListFilter ? "No matching incidents" : "No HSE incidents yet"}
              </p>
              <p className="mt-2 max-w-lg text-sm leading-6 text-primary-dark/60">
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
