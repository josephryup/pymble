import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  ListChecks,
  PackageSearch,
  Plus,
  ShieldAlert,
  Truck,
  UserRound,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OpsInlineEmpty } from "@/components/ops/OpsInlineEmpty";
import { OpsConfirmSubmitButton } from "@/components/ops/OpsConfirmSubmitButton";
import { OpsDashboardPanel } from "@/components/ops/OpsDashboardPanel";
import { OpsKpiCard } from "@/components/ops/OpsKpiCard";
import { OpsListControls, OpsPaginationControls } from "@/components/ops/OpsListControls";
import { OpsRecordActivityPanel } from "@/components/ops/OpsRecordActivityPanel";
import { requireOpsUser } from "@/lib/ops/auth";
import {
  cancelDeliveryExceptionAction,
  closeDeliveryExceptionAction,
  createDeliveryExceptionAction,
  resolveDeliveryExceptionAction,
  startDeliveryExceptionInvestigationAction,
} from "@/lib/ops/delivery-exception-actions";
import {
  canCancelOpsDeliveryException,
  canCloseOpsDeliveryException,
  canCreateOpsDeliveryException,
  canManageOpsDeliveryException,
  canResolveOpsDeliveryException,
  canStartOpsDeliveryException,
} from "@/lib/ops/delivery-exception-permissions";
import { deliveryExceptionCreateHrefForGrn } from "@/lib/ops/delivery-exception-shortcuts";
import {
  fetchDeliveryExceptionGrnOptionById,
  fetchDeliveryExceptionGrnOptions,
  fetchDeliveryExceptionSupplierOptions,
  fetchOpsDeliveryExceptionFollowUpDashboard,
  fetchOpsDeliveryExceptionStats,
  fetchPaginatedOpsDeliveryExceptions,
  type OpsDeliveryExceptionSummary,
} from "@/lib/ops/delivery-exceptions";
import type { OpsDeliveryExceptionAgeingBucket } from "@/lib/ops/delivery-exception-reporting";
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
  OpsDeliveryExceptionSeverity,
  OpsDeliveryExceptionStatus,
  OpsDeliveryExceptionType,
} from "@/lib/ops/types";
import { todayInLusaka, formatOpsLabel as formatLabel, formatOpsDate as formatDate, formatOpsDateTime as formatDateTime } from "@/lib/ops/format";

type PageProps = {
  searchParams?: Promise<OpsSearchParams>;
};

const DELIVERY_EXCEPTION_STATUS_OPTIONS: Array<{
  label: string;
  value: OpsDeliveryExceptionStatus | "";
}> = [
  { label: "All statuses", value: "" },
  { label: "Open", value: "open" },
  { label: "Investigating", value: "investigating" },
  { label: "Resolved", value: "resolved" },
  { label: "Closed", value: "closed" },
  { label: "Cancelled", value: "cancelled" },
];

const DELIVERY_EXCEPTION_SEVERITY_OPTIONS: Array<{
  label: string;
  value: OpsDeliveryExceptionSeverity | "";
}> = [
  { label: "All severities", value: "" },
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
  { label: "Critical", value: "critical" },
];

const DELIVERY_EXCEPTION_TYPE_OPTIONS: Array<{
  label: string;
  value: OpsDeliveryExceptionType;
}> = [
  { label: "Late delivery", value: "late_delivery" },
  { label: "Short delivery", value: "short_delivery" },
  { label: "Over delivery", value: "over_delivery" },
  { label: "Damaged goods", value: "damaged_goods" },
  { label: "Wrong item", value: "wrong_item" },
  { label: "Quality rejection", value: "quality_rejection" },
  { label: "Missing document", value: "missing_document" },
  { label: "Other", value: "other" },
];

function statusFromParam(value: string | undefined) {
  return DELIVERY_EXCEPTION_STATUS_OPTIONS.some((status) => status.value === value)
    ? (value as OpsDeliveryExceptionStatus | "")
    : "";
}

function severityFromParam(value: string | undefined) {
  return DELIVERY_EXCEPTION_SEVERITY_OPTIONS.some((severity) => severity.value === value)
    ? (value as OpsDeliveryExceptionSeverity | "")
    : "";
}

function deliveryExceptionNotice(params: OpsSearchParams) {
  const created = noticeFromParams(params, "exception", "Delivery exception created.");

  if (created) {
    return created;
  }

  const updated = firstParam(params.updated);
  const messages: Record<string, string> = {
    attachment: "Delivery exception attachment uploaded.",
    cancelled: "Delivery exception cancelled.",
    closed: "Delivery exception closed.",
    comment: "Delivery exception comment added.",
    investigating: "Delivery exception investigation started.",
    resolved: "Delivery exception resolved.",
  };

  return updated && messages[updated]
    ? {
        message: messages[updated],
        tone: "success" as const,
      }
    : null;
}

function ageingClass(bucket: OpsDeliveryExceptionAgeingBucket) {
  if (bucket === "overdue" || bucket === "stale_no_due") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (bucket === "due_today" || bucket === "due_soon") {
    return "border-orange-200 bg-orange-50 text-orange-700";
  }

  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function formatAgeDays(days: number) {
  return `${days} ${days === 1 ? "day" : "days"} old`;
}

function formatDueSignal(daysUntilDue: number | null) {
  if (daysUntilDue === null) {
    return "No due date";
  }

  if (daysUntilDue < 0) {
    return `${Math.abs(daysUntilDue)} ${Math.abs(daysUntilDue) === 1 ? "day" : "days"} overdue`;
  }

  if (daysUntilDue === 0) {
    return "Due today";
  }

  return `${daysUntilDue} ${daysUntilDue === 1 ? "day" : "days"} left`;
}

function ExceptionMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 font-bold text-foreground">{value}</dd>
    </div>
  );
}

function ResolveExceptionForm({ exception }: { exception: OpsDeliveryExceptionSummary }) {
  return (
    <details className="rounded-md border border-border">
      <summary
        className={`flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-bold text-foreground transition hover:text-primary-blue [&::-webkit-details-marker]:hidden ${OPS_FOCUS_CLASS}`}
      >
        <span className="inline-flex items-center gap-2">
          <CheckCircle2 className="size-4" aria-hidden="true" />
          Resolve exception
        </span>
        <span className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
          Open
        </span>
      </summary>
      <form action={resolveDeliveryExceptionAction} className="grid gap-3 border-t border-border p-4">
        <input name="exception_id" type="hidden" value={exception.id} />
        <label className={OPS_LABEL_CLASS}>
          Resolution summary
          <textarea className={`${OPS_INPUT_CLASS} min-h-28`} name="resolution_summary" required />
        </label>
        <label className={OPS_LABEL_CLASS}>
          Supplier rating
          <select className={OPS_INPUT_CLASS} defaultValue="" name="performance_rating">
            <option value="">Do not rate</option>
            <option value="5">5 - Excellent recovery</option>
            <option value="4">4 - Good recovery</option>
            <option value="3">3 - Acceptable recovery</option>
            <option value="2">2 - Poor recovery</option>
            <option value="1">1 - Critical supplier failure</option>
          </select>
        </label>
        <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
          <CheckCircle2 className="size-4" aria-hidden="true" />
          Mark resolved
        </button>
      </form>
    </details>
  );
}

export default async function OpsDeliveryExceptionsPage({ searchParams }: PageProps) {
  const [params, auth] = await Promise.all([
    searchParams ?? Promise.resolve({} as OpsSearchParams),
    requireOpsUser(),
  ]);

  if (!canAccessOpsHref(auth.profile.role, "/ops/delivery-exceptions")) {
    notFound();
  }

  const listState = parseOpsListState(params, { defaultPageSize: 8 });
  const status = statusFromParam(firstParam(params.status));
  const severity = severityFromParam(firstParam(params.severity));
  const requestedGrnId = firstParam(params.grn_id) ?? "";
  const [
    exceptionPage,
    stats,
    followUpDashboard,
    siteOptions,
    supplierOptions,
    grnOptions,
    requestedGrnOption,
  ] = await Promise.all([
    fetchPaginatedOpsDeliveryExceptions({
      listState,
      query: listState.query,
      severity: severity || undefined,
      status: status || undefined,
    }),
    fetchOpsDeliveryExceptionStats(),
    fetchOpsDeliveryExceptionFollowUpDashboard(),
    fetchActiveSiteOptions(),
    fetchDeliveryExceptionSupplierOptions(),
    fetchDeliveryExceptionGrnOptions(),
    requestedGrnId ? fetchDeliveryExceptionGrnOptionById(requestedGrnId) : Promise.resolve(null),
  ]);
  const notice = deliveryExceptionNotice(params);
  const canCreate = canCreateOpsDeliveryException(auth.profile.role);
  const canManage = canManageOpsDeliveryException(auth.profile.role);
  const hasActiveListFilter = listState.query.length > 0 || Boolean(status) || Boolean(severity);
  const today = todayInLusaka();
  const linkedGrnOptions =
    requestedGrnOption && !grnOptions.some((grn) => grn.id === requestedGrnOption.id)
      ? [requestedGrnOption, ...grnOptions]
      : grnOptions;
  const selectedGrn = requestedGrnId
    ? linkedGrnOptions.find((grn) => grn.id === requestedGrnId) ?? null
    : null;
  const shortcutGrns = linkedGrnOptions.slice(0, 3);
  const createPanelParams = new URLSearchParams();

  if (listState.query) {
    createPanelParams.set("q", listState.query);
  }

  if (status) {
    createPanelParams.set("status", status);
  }

  if (severity) {
    createPanelParams.set("severity", severity);
  }

  if (selectedGrn) {
    createPanelParams.set("grn_id", selectedGrn.id);
  }

  createPanelParams.set("create", "exception");
  const createExceptionHref = `/ops/delivery-exceptions?${createPanelParams.toString()}#delivery-exception-create-panel`;
  const openCreatePanel = firstParam(params.create) === "exception";

  return (
    <div className="w-full max-w-none space-y-6">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-blue">
            Procurement and stores control
          </p>
          <h1 className="mt-2 font-heading text-3xl font-bold text-foreground">
            Delivery exceptions
          </h1>
          <p className="mt-3 max-w-3xl text-base leading-7 text-foreground/68">
            Late deliveries, shortages, damage, rejections, missing documents, supplier follow-up,
            and resolution evidence.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/stores-inventory">
            <PackageSearch className="size-4" aria-hidden="true" />
            Stores
          </Link>
          <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/suppliers">
            <Truck className="size-4" aria-hidden="true" />
            Suppliers
          </Link>
          {canCreate ? (
            <a className={OPS_PRIMARY_BUTTON_CLASS} href={createExceptionHref}>
              <Plus className="size-4" aria-hidden="true" />
              New exception
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

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <OpsKpiCard
          href="/ops/delivery-exceptions?status=open#delivery-exception-register"
          icon={AlertTriangle}
          label="Open"
          tone={stats.open > 0 ? "warn" : "default"}
          hint="Needs action"
          value={String(stats.open)}
        />
        <OpsKpiCard
          href="/ops/delivery-exceptions?status=investigating#delivery-exception-register"
          icon={Clock}
          label="Investigating"
          tone={stats.investigating > 0 ? "warn" : "default"}
          hint="In progress"
          value={String(stats.investigating)}
        />
        <OpsKpiCard
          href="/ops/delivery-exceptions?severity=high#delivery-exception-register"
          icon={ShieldAlert}
          label="High risk open"
          tone={stats.criticalOpen > 0 ? "warn" : "default"}
          hint="High/critical"
          value={String(stats.criticalOpen)}
        />
        <OpsKpiCard
          href="/ops/delivery-exceptions?status=resolved#delivery-exception-register"
          icon={CheckCircle2}
          label="Resolved"
          tone="good"
          hint="Awaiting close"
          value={String(stats.resolved)}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <OpsDashboardPanel
          eyebrow="Exception ageing"
          title="Actionable delivery alerts"
          actions={
            <a className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/delivery-exceptions?status=open#delivery-exception-register">
              <ListChecks className="size-4" aria-hidden="true" />
              Open register
            </a>
          }
        >
          <div className="grid gap-3 min-[520px]:grid-cols-2 lg:grid-cols-5">
            {followUpDashboard.buckets.map((bucket) => (
              <div
                className={`rounded-md border px-3 py-2 ${ageingClass(bucket.bucket)}`}
                key={bucket.bucket}
              >
                <p className="text-xs font-bold uppercase tracking-[0.12em]">
                  {bucket.label}
                </p>
                <p className="mt-1 font-heading text-2xl font-bold">{bucket.count}</p>
                <p className="mt-1 text-xs font-semibold">actionable records</p>
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-[0.78fr_1.22fr]">
            <dl className="grid gap-3">
              <ExceptionMetric
                label="Total actionable"
                value={String(followUpDashboard.totalActionable)}
              />
              <ExceptionMetric
                label="Overdue"
                value={String(followUpDashboard.overdueActionable)}
              />
              <ExceptionMetric
                label="High risk"
                value={String(followUpDashboard.highRiskActionable)}
              />
              <ExceptionMetric
                label="No due date"
                value={String(followUpDashboard.staleNoDueActionable)}
              />
            </dl>
            <div className="rounded-md border border-border">
              <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  Attention queue
                </p>
                <CalendarClock className="size-4 text-orange-600" aria-hidden="true" />
              </div>
              {followUpDashboard.ageingAlerts.length > 0 ? (
                <ul className="divide-y divide-border">
                  {followUpDashboard.ageingAlerts.map((alert) => (
                    <li className="px-3 py-3" key={alert.id}>
                      <div className="flex flex-col gap-2 min-[520px]:flex-row min-[520px]:items-start min-[520px]:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-bold text-foreground">
                              {alert.exception_number} - {alert.title}
                            </p>
                            <span
                              className={opsStatusBadgeClass(alert.severity)}
                            >
                              {formatLabel(alert.severity)}
                            </span>
                          </div>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">
                            {alert.supplier
                              ? `${alert.supplier.supplier_code} / ${alert.supplier.legal_name}`
                              : "Supplier unavailable"}
                          </p>
                        </div>
                        <div className="shrink-0 text-left min-[520px]:text-right">
                          <p className="text-xs font-bold text-orange-700">
                            {formatDueSignal(alert.days_until_due)}
                          </p>
                          <p className="mt-1 text-xs font-semibold text-muted-foreground">
                            {formatAgeDays(alert.age_days)}
                          </p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <OpsInlineEmpty>No overdue, due-soon, stale, or high-risk exceptions.</OpsInlineEmpty>
              )}
            </div>
          </div>
        </OpsDashboardPanel>

        <OpsDashboardPanel
          eyebrow="Supplier follow-up"
          title="Suppliers needing attention"
          actions={
            <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/suppliers">
              <UserRound className="size-4" aria-hidden="true" />
              Supplier register
            </Link>
          }
        >
          {followUpDashboard.supplierFollowUps.length > 0 ? (
            <ul className="divide-y divide-border rounded-md border border-border">
              {followUpDashboard.supplierFollowUps.map((followUp) => (
                <li className="px-3 py-3" key={followUp.supplier.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-foreground">
                        {followUp.supplier.supplier_code} - {followUp.supplier.legal_name}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        Latest: {followUp.latest_exception.exception_number} /{" "}
                        {followUp.latest_exception.title}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs font-bold text-foreground">
                      {followUp.total_actionable}
                    </span>
                  </div>
                  <dl className="mt-3 grid gap-2 text-xs min-[520px]:grid-cols-2">
                    <div className="flex justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5">
                      <dt className="text-muted-foreground">Overdue</dt>
                      <dd className="font-bold text-foreground">{followUp.overdue_count}</dd>
                    </div>
                    <div className="flex justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5">
                      <dt className="text-muted-foreground">High risk</dt>
                      <dd className="font-bold text-foreground">{followUp.high_risk_count}</dd>
                    </div>
                    <div className="flex justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5">
                      <dt className="text-muted-foreground">Due soon</dt>
                      <dd className="font-bold text-foreground">{followUp.due_soon_count}</dd>
                    </div>
                    <div className="flex justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5">
                      <dt className="text-muted-foreground">Oldest</dt>
                      <dd className="font-bold text-foreground">
                        {formatAgeDays(followUp.oldest_age_days)}
                      </dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-md border border-border px-4 py-6 text-center">
              <UserRound className="size-8 text-primary-blue" aria-hidden="true" />
              <p className="max-w-sm text-sm leading-6 text-muted-foreground">
                No supplier has open delivery exceptions requiring follow-up.
              </p>
            </div>
          )}
        </OpsDashboardPanel>
      </section>

      {canCreate && shortcutGrns.length > 0 ? (
        <section className="rounded-lg border border-border bg-card p-5">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                GRN shortcuts
              </p>
              <h2 className="mt-1 font-heading text-xl font-bold text-foreground">
                Raise from posted receipts
              </h2>
            </div>
            <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/stores-inventory#grn-register">
              <PackageSearch className="size-4" aria-hidden="true" />
              Goods received register
            </Link>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            {shortcutGrns.map((grn) => {
              const isSelected = selectedGrn?.id === grn.id;

              return (
                <article
                  className={`rounded-md border p-4 ${
                    isSelected
                      ? "border-primary-blue bg-primary-blue/[0.04]"
                      : "border-border bg-muted/40"
                  }`}
                  key={grn.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-heading text-lg font-bold text-foreground">
                        {grn.grn_number}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        {grn.supplier
                          ? `${grn.supplier.supplier_code} - ${grn.supplier.legal_name}`
                          : "Supplier unavailable"}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-emerald-700">
                      Posted
                    </span>
                  </div>
                  <dl className="mt-3 grid gap-2 text-sm min-[520px]:grid-cols-2 lg:grid-cols-1">
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        Site
                      </dt>
                      <dd className="mt-1 font-bold text-foreground">
                        {grn.site ? `${grn.site.code} - ${grn.site.name}` : "Site unavailable"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        Received
                      </dt>
                      <dd className="mt-1 font-bold text-foreground">
                        {formatDate(grn.received_at)}
                      </dd>
                    </div>
                  </dl>
                  <Link
                    className={`${isSelected ? OPS_PRIMARY_BUTTON_CLASS : OPS_SECONDARY_BUTTON_CLASS} mt-4 w-full justify-center`}
                    href={deliveryExceptionCreateHrefForGrn(grn.id)}
                  >
                    <Plus className="size-4" aria-hidden="true" />
                    {isSelected ? "Selected GRN" : "Raise exception"}
                  </Link>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {canCreate ? (
        <details
          className="scroll-mt-24 rounded-lg border border-border bg-card"
          id="delivery-exception-create-panel"
          open={openCreatePanel}
        >
          <summary
            className={`flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 transition hover:text-primary-blue [&::-webkit-details-marker]:hidden ${OPS_FOCUS_CLASS}`}
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-blue text-white">
              <Truck className="size-5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-heading text-xl font-bold text-foreground">
                Create delivery exception
              </span>
              <span className="mt-1 block text-sm text-muted-foreground">
                Capture the supplier, site, delivery reference, severity, and immediate issue.
              </span>
            </span>
            <span className="shrink-0 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Open
            </span>
          </summary>
          {siteOptions.length === 0 || supplierOptions.length === 0 ? (
            <div className="border-t border-border p-5">
              <div className={OPS_NOTICE_WARNING_CLASS}>
                Add at least one active site and active supplier before creating delivery exceptions.
              </div>
            </div>
          ) : (
            <form
              action={createDeliveryExceptionAction}
              className="grid gap-4 border-t border-border p-5 min-[520px]:grid-cols-2 lg:grid-cols-6"
            >
              {selectedGrn ? (
                <div className="rounded-md border border-primary-blue/20 bg-primary-blue/[0.04] px-4 py-3 text-sm leading-6 text-foreground/70 min-[520px]:col-span-2 lg:col-span-6">
                  <span className="font-bold text-foreground">{selectedGrn.grn_number}</span>{" "}
                  selected from Goods Received. Supplier, site, and delivery reference are prefilled
                  for this exception.
                </div>
              ) : null}
              <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
                Supplier
                <select
                  className={OPS_INPUT_CLASS}
                  defaultValue={selectedGrn?.supplier_id ?? ""}
                  name="supplier_id"
                  required
                >
                  <option value="" disabled>
                    Select supplier
                  </option>
                  {supplierOptions.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.supplier_code} - {supplier.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
                Site
                <select
                  className={OPS_INPUT_CLASS}
                  defaultValue={selectedGrn?.site_id ?? ""}
                  name="site_id"
                  required
                >
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
                Linked GRN
                <select
                  className={OPS_INPUT_CLASS}
                  defaultValue={selectedGrn?.id ?? ""}
                  name="goods_received_note_id"
                >
                  <option value="">No GRN link</option>
                  {linkedGrnOptions.map((grn) => (
                    <option key={grn.id} value={grn.id}>
                      {grn.grn_number} - {grn.supplier?.supplier_code ?? "Supplier"} /{" "}
                      {grn.site?.code ?? "Site"}
                    </option>
                  ))}
                </select>
              </label>
              <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
                Exception type
                <select
                  className={OPS_INPUT_CLASS}
                  defaultValue={selectedGrn ? "short_delivery" : "late_delivery"}
                  name="exception_type"
                >
                  {DELIVERY_EXCEPTION_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={OPS_LABEL_CLASS}>
                Severity
                <select className={OPS_INPUT_CLASS} defaultValue="medium" name="severity">
                  {DELIVERY_EXCEPTION_SEVERITY_OPTIONS.filter((option) => option.value).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={OPS_LABEL_CLASS}>
                Reported date
                <input className={OPS_INPUT_CLASS} defaultValue={today} name="reported_at" type="date" />
              </label>
              <label className={OPS_LABEL_CLASS}>
                Due date
                <input className={OPS_INPUT_CLASS} name="due_at" type="date" />
              </label>
              <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
                Delivery reference
                <input
                  className={OPS_INPUT_CLASS}
                  defaultValue={selectedGrn?.delivery_reference ?? ""}
                  name="delivery_reference"
                />
              </label>
              <label className={`${OPS_LABEL_CLASS} min-[520px]:col-span-2 lg:col-span-6`}>
                Title
                <input className={OPS_INPUT_CLASS} name="title" required />
              </label>
              <label className={`${OPS_LABEL_CLASS} min-[520px]:col-span-2 lg:col-span-6`}>
                Description
                <textarea className={`${OPS_INPUT_CLASS} min-h-28`} name="description" />
              </label>
              <div className="flex items-end min-[520px]:col-span-2 lg:col-span-6">
                <button className={`${OPS_PRIMARY_BUTTON_CLASS} w-full md:w-auto`} type="submit">
                  <Plus className="size-4" aria-hidden="true" />
                  Create exception
                </button>
              </div>
            </form>
          )}
        </details>
      ) : null}

      <section
        className="scroll-mt-24 rounded-lg border border-border bg-card"
        id="delivery-exception-register"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Exception register
            </p>
            <h2 className="font-heading text-xl font-bold text-foreground">
              Delivery exception records
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {exceptionPage.pagination.total} matching records filtered by status, severity, and search.
            </p>
          </div>
          <Truck className="size-6 shrink-0 text-primary-blue" aria-hidden="true" />
        </div>
        <OpsListControls
          action="/ops/delivery-exceptions"
          filters={[
            {
              label: "Status",
              name: "status",
              options: DELIVERY_EXCEPTION_STATUS_OPTIONS,
              value: status,
            },
            {
              label: "Severity",
              name: "severity",
              options: DELIVERY_EXCEPTION_SEVERITY_OPTIONS,
              value: severity,
            },
          ]}
          placeholder="Search exception number, title, reference, or resolution"
          query={listState.query}
          resultLabel="delivery exceptions"
        />

        {exceptionPage.items.length > 0 ? (
          <div className="divide-y divide-border">
            {exceptionPage.items.map((exception) => {
              const canStart = canStartOpsDeliveryException(auth.profile.role, exception);
              const canResolve = canResolveOpsDeliveryException(auth.profile.role, exception);
              const canClose = canCloseOpsDeliveryException(auth.profile.role, exception);
              const canCancel = canCancelOpsDeliveryException(auth.profile.role, exception);

              return (
                <article className="p-5" key={exception.id}>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-heading text-lg font-bold text-foreground">
                          {exception.exception_number}
                        </h3>
                        <span
                          className={opsStatusBadgeClass(exception.status)}
                        >
                          {formatLabel(exception.status)}
                        </span>
                        <span
                          className={opsStatusBadgeClass(exception.severity)}
                        >
                          {formatLabel(exception.severity)}
                        </span>
                      </div>
                      <p className="mt-2 font-bold text-foreground">{exception.title}</p>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        {exception.supplier
                          ? `${exception.supplier.supplier_code} - ${exception.supplier.legal_name}`
                          : "Supplier unavailable"}{" "}
                        / {exception.site ? `${exception.site.code} - ${exception.site.name}` : "Site unavailable"}
                      </p>
                    </div>
                    <div className="grid gap-2 min-[520px]:grid-cols-2 lg:min-w-56 lg:grid-cols-1">
                      {canStart ? (
                        <form action={startDeliveryExceptionInvestigationAction}>
                          <input name="exception_id" type="hidden" value={exception.id} />
                          <OpsConfirmSubmitButton
                            className={`${OPS_PRIMARY_BUTTON_CLASS} w-full`}
                            confirmText="Start investigation"
                          >
                            <ClipboardCheck className="size-4" aria-hidden="true" />
                            Investigate
                          </OpsConfirmSubmitButton>
                        </form>
                      ) : null}
                      {canClose ? (
                        <form action={closeDeliveryExceptionAction}>
                          <input name="exception_id" type="hidden" value={exception.id} />
                          <OpsConfirmSubmitButton
                            className={`${OPS_SECONDARY_BUTTON_CLASS} w-full`}
                            confirmText="Close exception"
                          >
                            Close
                          </OpsConfirmSubmitButton>
                        </form>
                      ) : null}
                      {canCancel ? (
                        <form action={cancelDeliveryExceptionAction}>
                          <input name="exception_id" type="hidden" value={exception.id} />
                          <OpsConfirmSubmitButton
                            className={`${OPS_DANGER_BUTTON_CLASS} w-full`}
                            confirmText="Cancel exception"
                          >
                            <XCircle className="size-4" aria-hidden="true" />
                            Cancel
                          </OpsConfirmSubmitButton>
                        </form>
                      ) : null}
                    </div>
                  </div>

                  <dl className="mt-4 grid gap-3 md:grid-cols-4">
                    <ExceptionMetric label="Type" value={formatLabel(exception.exception_type)} />
                    <ExceptionMetric label="Reported" value={formatDate(exception.reported_at)} />
                    <ExceptionMetric label="Due" value={formatDate(exception.due_at)} />
                    <ExceptionMetric
                      label="Reference"
                      value={
                        exception.delivery_reference ||
                        exception.goods_received_note?.delivery_reference ||
                        "Not recorded"
                      }
                    />
                  </dl>

                  <dl className="mt-3 grid gap-3 md:grid-cols-4">
                    <ExceptionMetric
                      label="GRN"
                      value={exception.goods_received_note?.grn_number ?? "Not linked"}
                    />
                    <ExceptionMetric
                      label="PO"
                      value={exception.purchase_order?.po_number ?? "Not linked"}
                    />
                    <ExceptionMetric
                      label="Reported by"
                      value={formatOpsUserName(
                        exception.reported_by_user?.full_name,
                        exception.reported_by_user?.id,
                      )}
                    />
                    <ExceptionMetric
                      label="Resolved"
                      value={formatDateTime(exception.resolved_at)}
                    />
                  </dl>

                  {exception.description ? (
                    <p className="mt-4 rounded-md border border-border px-3 py-3 text-sm leading-6 text-muted-foreground">
                      {exception.description}
                    </p>
                  ) : null}

                  {exception.resolution_summary ? (
                    <p className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm leading-6 text-emerald-800">
                      {exception.resolution_summary}
                    </p>
                  ) : null}

                  {canResolve ? (
                    <div className="mt-4">
                      <ResolveExceptionForm exception={exception} />
                    </div>
                  ) : null}

                  <OpsRecordActivityPanel
                    canManage={canManage}
                    sourceId={exception.id}
                    sourceTable="delivery_exceptions"
                  />
                </article>
              );
            })}
          </div>
        ) : (
          <div className="flex min-h-56 flex-col items-center justify-center gap-3 p-8 text-center">
            <Truck className="size-10 text-primary-blue" aria-hidden="true" />
            <div>
              <p className="font-heading text-xl font-bold text-foreground">
                {hasActiveListFilter ? "No matching delivery exceptions" : "No delivery exceptions yet"}
              </p>
              <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
                {hasActiveListFilter
                  ? "Adjust the search, status, or severity filter to widen the register."
                  : "Create the first exception when a delivery issue needs follow-up."}
              </p>
            </div>
          </div>
        )}
        <OpsPaginationControls
          basePath="/ops/delivery-exceptions"
          filters={[
            {
              label: "Status",
              name: "status",
              options: [],
              value: status,
            },
            {
              label: "Severity",
              name: "severity",
              options: [],
              value: severity,
            },
          ]}
          pagination={exceptionPage.pagination}
          query={listState.query}
          resultLabel="delivery exceptions"
        />
      </section>
    </div>
  );
}
