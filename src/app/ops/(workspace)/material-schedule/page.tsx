import {
  Archive,
  AlertTriangle,
  Calculator,
  CheckCircle2,
  Clock3,
  FileSpreadsheet,
  FileText,
  GitBranch,
  PackagePlus,
  Pencil,
  Plus,
  ReceiptText,
  Send,
  Trash2,
  Truck,
  Upload,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OpsInlineEmpty } from "@/components/ops/OpsInlineEmpty";
import { OpsDashboardPanel } from "@/components/ops/OpsDashboardPanel";
import { OpsImportTemplateLinks } from "@/components/ops/OpsImportTemplateLinks";
import { OpsKpiCard } from "@/components/ops/OpsKpiCard";
import { OpsListControls, OpsPaginationControls } from "@/components/ops/OpsListControls";
import { OpsPageHeader } from "@/components/ops/OpsPageHeader";
import { OpsRealtimeRefresh } from "@/components/ops/OpsRealtimeRefresh";
import {
  OpsMobileRecordCard,
  OpsMobileRecordList,
  OpsMobileRecordRow,
} from "@/components/ops/OpsMobileRecord";
import { OpsRecordActivityPanel } from "@/components/ops/OpsRecordActivityPanel";
import {
  archiveBoqAction,
  attachBoqPricingAction,
  createBoqDocumentAction,
  createBoqLineItemAction,
  deleteBoqLineItemAction,
  issueBoqAction,
  submitBoqForPricingAction,
  updateBoqDocumentAction,
  updateBoqLineItemAction,
  createBoqRevisionAction,
  importBoqLineItemsCsvAction,
} from "@/lib/ops/boq-actions";
import {
  deriveOpsBoqLineDates,
  fetchOpsMaterialTriggerAlerts,
  fetchPaginatedOpsBoqDocuments,
  type OpsBoqDocument,
  boqLinePriceBenchmark,
  fetchOpsBoqStockItemOptions,
  type OpsBoqLineItem,
  type OpsMaterialTriggerAlert,
} from "@/lib/ops/boq";
import { boqLineVariance } from "@/lib/ops/boq-actuals";
import { createCallOffFromScheduleAction } from "@/lib/ops/call-off-actions";
import { canCreateOpsMaterialRequest } from "@/lib/ops/material-request-permissions";
import { requireOpsUser } from "@/lib/ops/auth";
import { parseOpsListState } from "@/lib/ops/listing";
import {
  canArchiveBoq,
  canAttachBoqPricing,
  canCreateBoq,
  canEditBoq,
  canIssueBoq,
  canReviseBoq,
  canSubmitBoqForPricing,
} from "@/lib/ops/boq-permissions";
import { canAccessOpsHref } from "@/lib/ops/permissions";
import { fetchOpsProjectTasksForSite, type OpsProjectTask } from "@/lib/ops/project-tasks";
import { fetchActiveSiteOptions } from "@/lib/ops/sites";
import { fetchActiveSupplierOptions } from "@/lib/ops/suppliers";
import type { OpsUserRole } from "@/lib/ops/types";
import {
  firstParam,
  formatZmw,
  OPS_FOCUS_CLASS,
  noticeFromParams,
  OPS_INPUT_CLASS,
  OPS_LABEL_CLASS,
  OPS_PRIMARY_BUTTON_CLASS,
  OPS_SECONDARY_BUTTON_CLASS,
  OPS_TABLE_SCROLL_CLASS,
  type OpsSearchParams,
  OPS_NOTICE_WARNING_CLASS,
  opsStatusBadgeClass,
} from "@/lib/ops/ui";

type PageProps = {
  searchParams?: Promise<OpsSearchParams>;
};

const BOQ_STATUS_OPTIONS: Array<{ label: string; value: OpsBoqDocument["status"] | "" }> = [
  { label: "All statuses", value: "" },
  { label: "Draft", value: "draft" },
  { label: "Pricing pending", value: "pricing_pending" },
  { label: "Priced", value: "priced" },
  { label: "Issued", value: "issued" },
];

const BOQ_CATEGORY_SUGGESTIONS = [
  "foundation",
  "excavation",
  "structure",
  "roofing",
  "finishes",
  "mep",
  "external_works",
  "general",
];

function boqStatusFromParam(value: string | undefined) {
  return BOQ_STATUS_OPTIONS.some((status) => status.value === value)
    ? (value as OpsBoqDocument["status"] | "")
    : "";
}

function boqNotice(params: OpsSearchParams) {
  const createdBoq = noticeFromParams(params, "boq", "BOQ document created.");

  if (createdBoq) {
    return createdBoq;
  }

  const createdLine = noticeFromParams(params, "line", "BOQ line item added.");

  if (createdLine) {
    return createdLine;
  }

  const imported = firstParam(params.imported);

  if (imported) {
    const skipped = firstParam(params.skipped);
    const skippedNote = skipped && skipped !== "0" ? ` ${skipped} row(s) skipped.` : "";
    return {
      tone: "success" as const,
      message: `Imported ${imported} BOQ line item(s) from CSV.${skippedNote}`,
    };
  }

  if (firstParam(params.updated) === "attachment") {
    return {
      tone: "success" as const,
      message: "BOQ attachment uploaded.",
    };
  }

  if (firstParam(params.updated) === "comment") {
    return {
      tone: "success" as const,
      message: "BOQ comment added.",
    };
  }

  const updatedKey = firstParam(params.updated);
  if (updatedKey === "boq") {
    return { tone: "success" as const, message: "material schedule updated." };
  }
  if (updatedKey === "line") {
    return { tone: "success" as const, message: "Line item updated." };
  }
  if (updatedKey === "line_deleted") {
    return { tone: "success" as const, message: "Line item deleted." };
  }
  if (updatedKey === "archived") {
    return { tone: "success" as const, message: "material schedule archived." };
  }
  if (updatedKey === "restored") {
    return { tone: "success" as const, message: "material schedule restored." };
  }
  if (updatedKey === "deleted") {
    return { tone: "success" as const, message: "material schedule permanently deleted." };
  }
  if (updatedKey === "submitted_for_pricing") {
    return {
      tone: "success" as const,
      message: "Schedule submitted to Procurement for pricing.",
    };
  }
  if (updatedKey === "priced") {
    return { tone: "success" as const, message: "Schedule priced. Ready to issue." };
  }
  if (updatedKey === "issued") {
    return {
      tone: "success" as const,
      message: "Schedule issued. The project budget has been generated from it.",
    };
  }

  return null;
}

function formatNumber(value: number) {
  return value.toLocaleString("en-ZM", {
    maximumFractionDigits: 2,
  });
}

function buildBoqLineRfqHref(
  document: Pick<OpsBoqDocument, "site_id" | "title">,
  item: OpsBoqDocument["items"][number],
) {
  const params = new URLSearchParams({
    create: "rfq",
    estimated_unit_cost: String(item.unit_rate),
    item_name: item.description.slice(0, 160),
    quantity: String(item.quantity),
    site_id: document.site_id,
    title: `${document.title} - ${item.description}`.slice(0, 160),
    unit: item.unit,
  });

  if (item.supplier_id) {
    params.set("supplier_id", item.supplier_id);
  }

  return `/ops/rfq-po?${params.toString()}#rfq-create-panel`;
}

function boqStatusLabel(status: OpsBoqDocument["status"]) {
  if (status === "pricing_pending") {
    return "pricing pending";
  }
  return status;
}

/**
 * Planned-vs-requested position for one schedule line (audit A2).
 *
 * Replaces the old manual "Actual" column, which froze the moment a schedule
 * was issued. Derived from the material requests actually raised against the
 * line, so it stays true after issue.
 */
function BoqRequestedCell({ item }: { item: OpsBoqLineItem }) {
  const { actuals } = item;

  if (actuals.requestCount === 0) {
    return <span className="text-muted-foreground">Nothing requested</span>;
  }

  const variance = boqLineVariance({
    plannedQuantity: item.quantity,
    plannedValue: item.budgeted_total,
    actuals,
  });

  return (
    <div className="min-w-40">
      <p className="font-semibold text-foreground">
        {formatNumber(actuals.requestedQuantity)} {item.unit}
        <span className="ml-1.5 text-xs font-normal text-muted-foreground">
          of {formatNumber(item.quantity)}
        </span>
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {formatZmw(actuals.requestedValue)} across {actuals.requestCount} request
        {actuals.requestCount === 1 ? "" : "s"}
        {actuals.deliveredQuantity > 0
          ? ` · ${formatNumber(actuals.deliveredQuantity)} delivered`
          : ""}
      </p>
      <span
        className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
          variance.isOverRequested || variance.isOverValue
            ? "bg-red-50 text-red-700"
            : "bg-emerald-50 text-emerald-700"
        }`}
      >
        {variance.isOverRequested
          ? `Over plan by ${formatNumber(actuals.requestedQuantity - item.quantity)} ${item.unit}`
          : variance.isOverValue
            ? `Over budget by ${formatZmw(Math.abs(variance.valueVariance))}`
            : `${variance.requestedPercent}% requested`}
      </span>
    </div>
  );
}

/**
 * Unit rate against the last price actually paid for the same dictionary item
 * (audit A5). Silent when there is nothing to compare, so it never nags about
 * one-off materials or items with no purchase history.
 */
function BoqPriceBenchmark({ item }: { item: OpsBoqLineItem }) {
  const benchmark = boqLinePriceBenchmark(item);

  if (!benchmark) {
    return null;
  }

  return (
    <span
      className={`mt-1 block text-xs font-normal ${
        benchmark.isAbove ? "text-red-700" : "text-emerald-700"
      }`}
      title={`Last paid ${formatZmw(benchmark.lastUnitCost)} per ${item.unit}`}
    >
      {benchmark.isAbove ? "▲" : "▼"} {Math.abs(benchmark.percent)}% vs last paid (
      {formatZmw(benchmark.lastUnitCost)})
    </span>
  );
}

function BoqValueMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border px-3 py-3">
      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 font-heading text-xl font-bold text-foreground">{value}</dd>
    </div>
  );
}

function BoqFlowStep({
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
    <div className="rounded-md border border-border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {label}
          </p>
          <p className="mt-1 font-heading text-xl font-bold text-foreground">{value}</p>
        </div>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary-blue/10 text-primary-blue">
          <Icon className="size-4" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  );
}

/**
 * Mandatory-procurement pricing gate: draft (QS) → pricing_pending →
 * priced (Procurement) → issued. Renders the action relevant to the
 * document's current status and the viewer's role; renders nothing once
 * issued (there's nothing left to do here).
 */
function BoqPricingWorkflowPanel({
  document,
  role,
}: {
  document: OpsBoqDocument;
  role: OpsUserRole;
}) {
  if (document.status === "draft") {
    if (!canSubmitBoqForPricing(role, document)) {
      return null;
    }
    return (
      <form
        action={submitBoqForPricingAction}
        className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-md border border-primary-blue/25 bg-primary-blue/5 p-4"
      >
        <input name="boq_id" type="hidden" value={document.id} />
        <p className="text-sm leading-6 text-foreground/70">
          Once quantities, classification, and dates are set, submit this schedule to Procurement
          for pricing. Procurement must price every line — including transport — before it can be
          issued.
        </p>
        <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
          <Send className="size-4" aria-hidden="true" />
          Submit for pricing
        </button>
      </form>
    );
  }

  if (document.status === "pricing_pending" || document.status === "priced") {
    const canPrice = canAttachBoqPricing(role, document);
    const canIssue = canIssueBoq(role, document);
    return (
      <div className="mt-5 rounded-md border border-orange-200 bg-orange-50/50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm leading-6 text-foreground/70">
            {document.status === "pricing_pending"
              ? "Awaiting Procurement pricing (unit rate + transport estimate per line)."
              : "Priced by Procurement. Ready to issue — issuing generates the project budget."}
          </p>
          {canIssue ? (
            <form action={issueBoqAction}>
              <input name="boq_id" type="hidden" value={document.id} />
              <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
                <CheckCircle2 className="size-4" aria-hidden="true" />
                Issue &amp; generate budget
              </button>
            </form>
          ) : null}
        </div>

        {canPrice ? (
          <form
            action={attachBoqPricingAction}
            className="mt-4 grid gap-3 border-t border-orange-200 pt-4"
          >
            <input name="boq_id" type="hidden" value={document.id} />
            {document.items.length === 0 ? (
              <OpsInlineEmpty>No line items to price yet.</OpsInlineEmpty>
            ) : (
              document.items.map((item) => (
                <div
                  className="grid gap-2 rounded-md border border-border bg-card p-3 min-[560px]:grid-cols-[minmax(0,1fr)_9rem_9rem]"
                  key={item.id}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {item.description}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatNumber(item.quantity)} {item.unit} · {item.category}
                    </p>
                  </div>
                  <label className="text-xs font-bold text-muted-foreground">
                    Unit rate
                    <input
                      className={`${OPS_INPUT_CLASS} mt-1`}
                      defaultValue={item.unit_rate || ""}
                      min="0"
                      name={`unit_rate::${item.id}`}
                      step="0.01"
                      type="number"
                    />
                    <BoqPriceBenchmark item={item} />
                  </label>
                  <label className="text-xs font-bold text-muted-foreground">
                    Transport
                    <input
                      className={`${OPS_INPUT_CLASS} mt-1`}
                      defaultValue={item.estimated_transport_cost || ""}
                      min="0"
                      name={`estimated_transport_cost::${item.id}`}
                      step="0.01"
                      type="number"
                    />
                  </label>
                </div>
              ))
            )}
            <div className="flex items-end">
              <button className={`${OPS_PRIMARY_BUTTON_CLASS} w-full md:w-auto`} type="submit">
                <ReceiptText className="size-4" aria-hidden="true" />
                Save prices
              </button>
            </div>
          </form>
        ) : null}
      </div>
    );
  }

  // Issued: the schedule is live and its budget is generated. The only move
  // left is to revise it — which creates a new version rather than editing
  // this one, so history and the issued budget stay intact (audit B1).
  if (document.status === "issued" && canReviseBoq(role, document)) {
    return (
      <form
        action={createBoqRevisionAction}
        className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-muted/40 p-4"
      >
        <input name="boq_id" type="hidden" value={document.id} />
        <p className="text-sm leading-6 text-foreground/70">
          Scope changed? Open revision v{document.version + 1}. This schedule stays live and its
          budget untouched until the revision is priced and issued.
        </p>
        <button className={OPS_SECONDARY_BUTTON_CLASS} type="submit">
          <GitBranch className="size-4" aria-hidden="true" />
          Revise schedule
        </button>
      </form>
    );
  }

  return null;
}

/**
 * "Draw from schedule" (audit §4.4) — the call-off.
 *
 * Shown on every live issued schedule. Ticking lines and pressing the button
 * creates a material request already carrying description, unit, rate,
 * supplier, cost code and the schedule link, so the planned↔actual connection
 * populates itself instead of depending on someone remembering an optional
 * dropdown. Quantities default to what REMAINS, not the full planned figure,
 * so a second call-off cannot silently double-order.
 */
function CallOffPanel({ document }: { document: OpsBoqDocument }) {
  const lines = document.items
    .map((item) => {
      const planned = Number(item.quantity ?? 0);
      const variance = boqLineVariance({
        plannedQuantity: planned,
        plannedValue: Number(item.budgeted_total ?? 0),
        actuals: item.actuals,
      });
      return { item, planned, variance };
    })
    .filter((row) => row.planned > 0);

  if (lines.length === 0) {
    return null;
  }

  return (
    <details className="mt-4 rounded-md border border-primary-blue/30 bg-primary-blue/5">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center gap-2 px-4 py-3 text-sm font-bold text-primary-blue transition hover:text-primary-blue/80 [&::-webkit-details-marker]:hidden">
        <PackagePlus className="size-4" aria-hidden="true" />
        Draw materials from this schedule
      </summary>
      <form action={createCallOffFromScheduleAction} className="border-t border-border p-3">
        <input name="site_id" type="hidden" value={document.site_id} />
        <div className="grid gap-3 min-[640px]:grid-cols-3">
          <label className={OPS_LABEL_CLASS}>
            Call-off title
            <input
              className={OPS_INPUT_CLASS}
              defaultValue={`Call-off — ${document.title}`}
              name="title"
              required
            />
          </label>
          <label className={OPS_LABEL_CLASS}>
            Needed by
            <input className={OPS_INPUT_CLASS} name="needed_by" type="date" />
          </label>
          <label className={OPS_LABEL_CLASS}>
            Priority
            <select className={OPS_INPUT_CLASS} defaultValue="normal" name="priority">
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </label>
        </div>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          Quantities default to what is still outstanding on each line. Leave a line
          at zero to skip it. Anything you order beyond the plan is allowed but recorded.
        </p>
        <div className="mt-2 space-y-1.5">
          {lines.map(({ item, planned, variance }) => (
            <div
              className="grid gap-2 rounded-md border border-border bg-background p-2 min-[640px]:grid-cols-[1fr_auto]"
              key={item.id}
            >
              <div>
                <p className="text-sm font-semibold text-foreground">{item.description}</p>
                <p className="text-xs text-muted-foreground">
                  Planned {formatNumber(planned)} {item.unit} · requested{" "}
                  {formatNumber(item.actuals.requestedQuantity)} · remaining{" "}
                  <span
                    className={variance.isOverRequested ? "font-bold text-amber-700" : ""}
                  >
                    {formatNumber(variance.remainingQuantity)}
                  </span>
                  {variance.isOverRequested ? " (already over plan)" : ""}
                </p>
              </div>
              <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                Order
                <input
                  aria-label={`Quantity to call off for ${item.description}`}
                  className={`${OPS_INPUT_CLASS} w-28`}
                  defaultValue={variance.remainingQuantity || ""}
                  min="0"
                  name={`line::${item.id}`}
                  step="0.01"
                  type="number"
                />
                <span>{item.unit}</span>
              </label>
            </div>
          ))}
        </div>
        <div className="mt-3 flex justify-end">
          <button className={OPS_SECONDARY_BUTTON_CLASS} type="submit">
            <PackagePlus className="size-4" aria-hidden="true" />
            Create material request
          </button>
        </div>
      </form>
    </details>
  );
}

export default async function OpsBoqPage({ searchParams }: PageProps) {
  const [params, auth] = await Promise.all([
    searchParams ?? Promise.resolve({} as OpsSearchParams),
    requireOpsUser(),
  ]);

  if (!canAccessOpsHref(auth.profile.role, "/ops/material-schedule")) {
    notFound();
  }

  const listState = parseOpsListState(params, { defaultPageSize: 6 });
  const status = boqStatusFromParam(firstParam(params.status));
  const [documents, siteOptions, supplierOptions, stockItemOptions] = await Promise.all([
    fetchPaginatedOpsBoqDocuments({
      listState,
      query: listState.query,
      status: status || undefined,
    }),
    fetchActiveSiteOptions(),
    fetchActiveSupplierOptions(),
    fetchOpsBoqStockItemOptions(),
  ]);
  const boqDocuments = documents.items;
  const hasActiveListFilter = listState.query.length > 0 || Boolean(status);
  // canCreate gates the "New material schedule" button and the global form.
  // Per-document edit/delete uses canEditBoq(role, doc) so the rules also
  // respect the document's draft/issued/archived state.
  const canCreate = canCreateBoq(auth.profile.role);
  const canArchive = canArchiveBoq(auth.profile.role);
  // Many UI sections (activity panel, comments) just need write access. Use
  // canCreate as a stand-in for that — anyone who can create a material schedule can manage
  // its comments / attachments.
  const canManage = canCreate;
  // Drawing from the schedule creates a material request, so it follows the
  // material-request permission, not the schedule's.
  const canCallOff = canCreateOpsMaterialRequest(auth.profile.role);
  const notice = boqNotice(params);
  const totalBudgeted = boqDocuments.reduce((sum, document) => sum + document.budgeted_total, 0);
  const totalActual = boqDocuments.reduce((sum, document) => sum + document.actual_total, 0);
  const totalTransport = boqDocuments.reduce((sum, document) => sum + document.transport_total, 0);
  const draftCount = boqDocuments.filter((document) => document.status === "draft").length;
  const pricingCount = boqDocuments.filter(
    (document) => document.status === "pricing_pending" || document.status === "priced",
  ).length;
  const issuedCount = boqDocuments.filter((document) => document.status === "issued").length;
  const visibleLineItems = boqDocuments.reduce((sum, document) => sum + document.items.length, 0);
  const visibleSiteCount = new Set(boqDocuments.map((document) => document.site_id)).size;
  const visibleVariance = totalBudgeted - totalActual;

  const uniqueSiteIds = Array.from(new Set(boqDocuments.map((document) => document.site_id)));
  const [tasksPerSite, triggerAlertsPerSite] = await Promise.all([
    Promise.all(uniqueSiteIds.map((siteId) => fetchOpsProjectTasksForSite(siteId))),
    Promise.all(uniqueSiteIds.map((siteId) => fetchOpsMaterialTriggerAlerts(siteId))),
  ]);
  const tasksBySiteId = new Map<string, OpsProjectTask[]>(
    uniqueSiteIds.map((siteId, index) => [siteId, tasksPerSite[index]]),
  );
  const triggerAlertsBySiteId = new Map<string, OpsMaterialTriggerAlert[]>(
    uniqueSiteIds.map((siteId, index) => [siteId, triggerAlertsPerSite[index]]),
  );
  const createPanelParams = new URLSearchParams();

  if (listState.query) {
    createPanelParams.set("q", listState.query);
  }

  if (status) {
    createPanelParams.set("status", status);
  }

  createPanelParams.set("create", "boq");
  const createBoqHref = `/ops/material-schedule?${createPanelParams.toString()}#boq-create-panel`;
  const openCreatePanel = firstParam(params.create) === "boq";

  return (
    <div className="w-full max-w-none space-y-6">
      <OpsRealtimeRefresh tables={["boq_documents", "boq_line_items"]} />
      <datalist id="boq-category-suggestions">
        {BOQ_CATEGORY_SUGGESTIONS.map((category) => (
          <option key={category} value={category} />
        ))}
      </datalist>
      <OpsPageHeader
        eyebrow="Commercial control"
        title="material schedule"
        description="Project bills of quantities — measured line items, budgeted values, actual quantities, and invoice-ready commercial source records."
        actions={
          <>
            <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/invoices">
              <ReceiptText className="size-4" aria-hidden="true" />
              Invoices
            </Link>
            <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/sites">
              <FileText className="size-4" aria-hidden="true" />
              Sites
            </Link>
            {canManage ? (
              <a className={OPS_PRIMARY_BUTTON_CLASS} href={createBoqHref}>
                <Plus className="size-4" aria-hidden="true" />
                New material schedule
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
          href="/ops/material-schedule#boq-register"
          icon={FileSpreadsheet}
          label="material schedule documents"
          hint="Register"
          value={documents.pagination.total.toLocaleString("en-ZM")}
        />
        <OpsKpiCard
          href="/ops/material-schedule?status=draft#boq-register"
          icon={Clock3}
          label="Draft shown"
          tone={draftCount > 0 ? "warn" : "default"}
          trend={draftCount > 0 ? "Review" : "Clear"}
          value={draftCount.toLocaleString("en-ZM")}
        />
        <OpsKpiCard
          href="/ops/material-schedule?status=pricing_pending#boq-register"
          icon={Send}
          label="With procurement"
          tone={pricingCount > 0 ? "warn" : "default"}
          trend={pricingCount > 0 ? "Pricing" : "Clear"}
          value={pricingCount.toLocaleString("en-ZM")}
        />
        <OpsKpiCard
          href="/ops/material-schedule?status=issued#boq-register"
          icon={CheckCircle2}
          label="Issued shown"
          tone="good"
          hint="Budget generated"
          value={issuedCount.toLocaleString("en-ZM")}
        />
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <OpsKpiCard
          href="/ops/material-schedule#boq-register"
          icon={Calculator}
          label="Line items shown"
          hint="Measured"
          value={visibleLineItems.toLocaleString("en-ZM")}
        />
        <OpsKpiCard
          href="/ops/project-budgets"
          icon={Truck}
          label="Transport estimate shown"
          hint="Planning"
          value={formatZmw(totalTransport)}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.85fr)]">
        <OpsDashboardPanel eyebrow="Visible values" title="Current material schedule selection">
          <dl className="grid gap-3 min-[520px]:grid-cols-2 xl:grid-cols-4">
            <BoqValueMetric label="Budgeted shown" value={formatZmw(totalBudgeted)} />
            <BoqValueMetric label="Actual shown" value={formatZmw(totalActual)} />
            <BoqValueMetric label="Variance shown" value={formatZmw(visibleVariance)} />
            <BoqValueMetric
              label="Sites shown"
              value={visibleSiteCount.toLocaleString("en-ZM")}
            />
          </dl>
        </OpsDashboardPanel>

        <OpsDashboardPanel
          actions={
            <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/invoices">
              Invoice register
            </Link>
          }
          eyebrow="Commercial flow"
          title="material schedule to invoice"
        >
          <div className="grid gap-3">
            <BoqFlowStep
              description="QS builds quantities, classification, and dates. Draft stays editable."
              icon={Clock3}
              label="Draft (QS plans)"
              value={`${draftCount} shown`}
            />
            <BoqFlowStep
              description="Procurement prices every line and the transport estimate before it can be issued."
              icon={Send}
              label="With procurement"
              value={`${pricingCount} shown`}
            />
            <BoqFlowStep
              description="Issuing generates the project budget: one line per classification, plus a dedicated transport line."
              icon={CheckCircle2}
              label="Issued — budget generated"
              value={`${issuedCount} shown`}
            />
            <BoqFlowStep
              description="Visible line items carry the measured commercial value for each site."
              icon={Calculator}
              label="Measured lines"
              value={`${visibleLineItems} lines`}
            />
          </div>
        </OpsDashboardPanel>
      </div>

      {canManage ? (
        <details
          className="scroll-mt-24 rounded-lg border border-border bg-card"
          id="boq-create-panel"
          open={openCreatePanel}
        >
          <summary
            className={`flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 transition hover:text-primary-blue [&::-webkit-details-marker]:hidden ${OPS_FOCUS_CLASS}`}
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-blue text-white">
              <Plus className="size-5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-heading text-xl font-bold text-foreground">
                Create material schedule
              </span>
              <span className="mt-1 block text-sm text-muted-foreground">
                Create the site-linked material schedule header before adding measured line items in the register.
              </span>
            </span>
            <span className="shrink-0 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Open
            </span>
          </summary>
          {siteOptions.length === 0 ? (
            <div className="border-t border-border p-5">
              <div className={OPS_NOTICE_WARNING_CLASS}>
                Add at least one site before creating a material schedule.
              </div>
            </div>
          ) : (
            <form
              action={createBoqDocumentAction}
              className="grid gap-4 border-t border-border p-5 min-[520px]:grid-cols-2 lg:grid-cols-6"
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
              <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
                Title
                <input className={OPS_INPUT_CLASS} name="title" required />
              </label>
              <label className={OPS_LABEL_CLASS}>
                Version
                <input className={OPS_INPUT_CLASS} defaultValue="1" min="1" name="version" type="number" />
              </label>
              <div className="flex items-end min-[520px]:col-span-2 lg:col-span-2">
                <p className="text-xs leading-5 text-muted-foreground">
                  Always starts as <span className="font-semibold">draft</span>. Add line items,
                  then submit to Procurement for pricing.
                </p>
              </div>
              <div className="flex items-end min-[520px]:col-span-2 lg:col-span-6">
                <button
                  className={`${OPS_PRIMARY_BUTTON_CLASS} w-full md:w-auto`}
                  type="submit"
                >
                  <Plus className="size-4" aria-hidden="true" />
                  Create document
                </button>
              </div>
            </form>
          )}
        </details>
      ) : null}

      <section className="grid scroll-mt-24 gap-5" id="boq-register">
        <div className="rounded-lg border border-border bg-card">
          <div className="border-b border-border p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-heading text-xl font-bold text-foreground">Material schedules</h2>
              <a className={OPS_SECONDARY_BUTTON_CLASS} href="/api/ops/material-schedule/export">
                <FileSpreadsheet className="size-4" aria-hidden="true" />
                Export to Excel
              </a>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Search and filter document headers before opening their line items.
            </p>
          </div>
          <OpsListControls
            action="/ops/material-schedule"
            filters={[
              {
                label: "Status",
                name: "status",
                options: BOQ_STATUS_OPTIONS,
                value: status,
              },
            ]}
            placeholder="Search material schedule title"
            query={listState.query}
            resultLabel="material schedule documents"
          />
        </div>

        {boqDocuments.length > 0 ? (
          boqDocuments.map((document) => {
            const canEditDoc = canEditBoq(auth.profile.role, document);
            return (
            <div className="rounded-lg border border-border bg-card" key={document.id}>
              <div className="border-b border-border p-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-blue">
                      {document.site?.code ?? "Site code unavailable"} - v{document.version}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <h2 className="font-heading text-xl font-bold text-foreground">
                        {document.title}
                      </h2>
                      <span
                        className={opsStatusBadgeClass(document.status)}
                      >
                        {boqStatusLabel(document.status)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {document.site?.name ?? "Site record unavailable"}
                    </p>
                  </div>
                  <div className="grid gap-3 min-[520px]:grid-cols-4 lg:min-w-[28rem]">
                    <div className="rounded-md border border-border px-3 py-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        Budgeted
                      </p>
                      <p className="mt-1 font-bold text-foreground">
                        {formatZmw(document.budgeted_total)}
                      </p>
                    </div>
                    <div className="rounded-md border border-border px-3 py-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        Requested
                      </p>
                      <p
                        className={`mt-1 font-bold ${
                          document.requested_total > document.budgeted_total
                            ? "text-red-700"
                            : "text-foreground"
                        }`}
                      >
                        {formatZmw(document.requested_total)}
                      </p>
                    </div>
                    <div className="rounded-md border border-border px-3 py-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        Transport
                      </p>
                      <p className="mt-1 font-bold text-foreground">
                        {formatZmw(document.transport_total)}
                      </p>
                    </div>
                    <div className="rounded-md border border-border px-3 py-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        Lines
                      </p>
                      <p className="mt-1 font-bold text-foreground">
                        {document.items.length.toLocaleString("en-ZM")}
                      </p>
                    </div>
                  </div>
                </div>

                <BoqPricingWorkflowPanel role={auth.profile.role} document={document} />

                {(() => {
                  const dueAlerts = (triggerAlertsBySiteId.get(document.site_id) ?? []).filter(
                    (alert) => alert.boqId === document.id,
                  );
                  if (dueAlerts.length === 0) {
                    return null;
                  }
                  return (
                    <div className="mt-3 rounded-md border border-orange-200 bg-orange-50/60 p-4">
                      <p className="flex items-center gap-2 text-sm font-bold text-orange-800">
                        <AlertTriangle className="size-4" aria-hidden="true" />
                        Materials due — {dueAlerts.length} line{dueAlerts.length === 1 ? "" : "s"} past their
                        trigger date with no material request raised
                      </p>
                      <ul className="mt-2 grid gap-1.5 text-sm text-orange-800/90">
                        {dueAlerts.slice(0, 6).map((alert) => (
                          <li key={alert.lineItemId}>
                            <span className="font-semibold">{alert.description}</span> — needed by{" "}
                            {alert.effectiveNeededBy}
                            {alert.projectTaskTitle ? ` (task: ${alert.projectTaskTitle})` : ""}
                            , trigger by {alert.triggerBy}
                          </li>
                        ))}
                      </ul>
                      {canManage ? (
                        <p className="mt-2 text-sm text-orange-800/90">
                          Use <span className="font-semibold">Draw materials from this
                          schedule</span> below — it pre-fills the request from these lines
                          and keeps them linked to the plan.
                        </p>
                      ) : null}
                    </div>
                  );
                })()}

                {/* The call-off: the primary path from plan to request, so the
                    planned↔actual link populates itself (audit §4.4 / D1). */}
                {canCallOff &&
                document.status === "issued" &&
                !document.superseded_at ? (
                  <CallOffPanel document={document} />
                ) : null}

                {canEditDoc ? (
                  <>
                  <details className="mt-5 rounded-md border border-border">
                    <summary
                      className={`flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-bold text-foreground transition hover:text-primary-blue [&::-webkit-details-marker]:hidden ${OPS_FOCUS_CLASS}`}
                    >
                      <span className="inline-flex items-center gap-2">
                        <Plus className="size-4" aria-hidden="true" />
                        Add measured line item
                      </span>
                      <span className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                        Open
                      </span>
                    </summary>
                    <form
                      action={createBoqLineItemAction}
                      className="grid gap-3 border-t border-border p-4 md:grid-cols-3 lg:grid-cols-6"
                    >
                      <input name="boq_id" type="hidden" value={document.id} />
                      <label className={`${OPS_LABEL_CLASS} md:col-span-3 lg:col-span-2`}>
                        Description
                        <input
                          className={OPS_INPUT_CLASS}
                          name="description"
                          required
                        />
                      </label>
                      <label className={OPS_LABEL_CLASS}>
                        Material (dictionary)
                        <select className={OPS_INPUT_CLASS} defaultValue="" name="stock_item_id">
                          <option value="">Not in dictionary</option>
                          {stockItemOptions.map((stockItem) => (
                            <option key={stockItem.id} value={stockItem.id}>
                              {stockItem.item_code} - {stockItem.item_name}
                            </option>
                          ))}
                        </select>
                        <span className="mt-1 block text-xs font-normal text-muted-foreground">
                          Supplies lead time and the last paid price.
                        </span>
                      </label>
                      <label className={OPS_LABEL_CLASS}>
                        Unit
                        <input className={OPS_INPUT_CLASS} defaultValue="pcs" name="unit" required />
                      </label>
                      <label className={OPS_LABEL_CLASS}>
                        Quantity
                        <input
                          className={OPS_INPUT_CLASS}
                          min="0"
                          name="quantity"
                          required
                          step="0.01"
                          type="number"
                        />
                      </label>
                      <label className={OPS_LABEL_CLASS}>
                        Rate
                        <input
                          className={OPS_INPUT_CLASS}
                          min="0"
                          name="unit_rate"
                          required
                          step="0.01"
                          type="number"
                        />
                      </label>
                      <label className={`${OPS_LABEL_CLASS} md:col-span-3 lg:col-span-3`}>
                        Supplier (optional)
                        <select className={OPS_INPUT_CLASS} defaultValue="" name="supplier_id">
                          <option value="">No nominated supplier</option>
                          {supplierOptions.map((supplier) => (
                            <option key={supplier.id} value={supplier.id}>
                              {supplier.supplier_code} - {supplier.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className={OPS_LABEL_CLASS}>
                        Classification
                        <input
                          className={OPS_INPUT_CLASS}
                          defaultValue="general"
                          list="boq-category-suggestions"
                          name="category"
                        />
                      </label>
                      <label className={OPS_LABEL_CLASS}>
                        Needed by
                        <input className={OPS_INPUT_CLASS} name="needed_by" type="date" />
                      </label>
                      <label className={`${OPS_LABEL_CLASS} md:col-span-2 lg:col-span-2`}>
                        Linked schedule task (optional)
                        <select className={OPS_INPUT_CLASS} defaultValue="" name="project_task_id">
                          <option value="">No linked task</option>
                          {(tasksBySiteId.get(document.site_id) ?? []).map((task) => (
                            <option key={task.id} value={task.id}>
                              {task.title} ({task.planned_start_date})
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="flex items-end md:col-span-3 lg:col-span-3">
                        <button
                          className={`${OPS_PRIMARY_BUTTON_CLASS} w-full md:w-auto`}
                          type="submit"
                        >
                          <Plus className="size-4" aria-hidden="true" />
                          Add line item
                        </button>
                      </div>
                    </form>
                  </details>

                  <details className="mt-3 rounded-md border border-border">
                    <summary
                      className={`flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-bold text-foreground transition hover:text-primary-blue [&::-webkit-details-marker]:hidden ${OPS_FOCUS_CLASS}`}
                    >
                      <span className="inline-flex items-center gap-2">
                        <Upload className="size-4" aria-hidden="true" />
                        Import line items from CSV
                      </span>
                      <span className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                        Open
                      </span>
                    </summary>
                    <form
                      action={importBoqLineItemsCsvAction}
                      className="grid gap-3 border-t border-border p-4"
                    >
                      <input name="boq_id" type="hidden" value={document.id} />
                      <p className="text-sm leading-6 text-muted-foreground">
                        Upload a CSV, XLSX, or PDF with columns{" "}
                        <span className="font-semibold text-foreground">
                          description, unit, quantity, unit price
                        </span>{" "}
                        (optional:{" "}
                        <span className="font-semibold text-foreground">supplier name</span>). For XLSX
                        form-style sheets (Item No, Quantity, Unit of Measure, Description, Unit Price, Total,
                        Supplier Name), the importer skips title rows and picks up the header automatically.
                      </p>
                      <OpsImportTemplateLinks kind="boq" />
                      <label className={OPS_LABEL_CLASS}>
                        material schedule file
                        <input
                          accept=".csv,.xlsx,.xls,.pdf,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/pdf"
                          className={OPS_INPUT_CLASS}
                          name="file"
                          required
                          type="file"
                        />
                      </label>
                      <div>
                        <button className={`${OPS_PRIMARY_BUTTON_CLASS} w-full md:w-auto`} type="submit">
                          <Upload className="size-4" aria-hidden="true" />
                          Import lines
                        </button>
                      </div>
                    </form>
                  </details>

                  <details className="mt-3 rounded-md border border-border">
                    <summary
                      className={`flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-bold text-foreground transition hover:text-primary-blue [&::-webkit-details-marker]:hidden ${OPS_FOCUS_CLASS}`}
                    >
                      <span className="inline-flex items-center gap-2">
                        <Pencil className="size-4" aria-hidden="true" />
                        Edit material schedule details
                      </span>
                      <span className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                        Open
                      </span>
                    </summary>
                    <form
                      action={updateBoqDocumentAction}
                      className="grid gap-3 border-t border-border p-4 md:grid-cols-4"
                    >
                      <input name="boq_id" type="hidden" value={document.id} />
                      <label className={`${OPS_LABEL_CLASS} md:col-span-2`}>
                        Title
                        <input
                          className={OPS_INPUT_CLASS}
                          defaultValue={document.title}
                          name="title"
                          required
                        />
                      </label>
                      <label className={OPS_LABEL_CLASS}>
                        Version
                        <input
                          className={OPS_INPUT_CLASS}
                          defaultValue={String(document.version)}
                          min="1"
                          name="version"
                          required
                          type="number"
                        />
                      </label>
                      <div className="flex items-end md:col-span-4">
                        <button className={`${OPS_PRIMARY_BUTTON_CLASS}`} type="submit">
                          <Pencil className="size-4" aria-hidden="true" />
                          Save changes
                        </button>
                      </div>
                    </form>
                  </details>
                  </>
                ) : null}

                {canArchive ? (
                  <form
                    action={archiveBoqAction}
                    className="mt-3 rounded-md border border-red-200 bg-red-50/40 p-3"
                  >
                    <input name="boq_id" type="hidden" value={document.id} />
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm text-red-800">
                        Archive removes this material schedule from default listings.
                        Leadership can restore it later.
                      </p>
                      <button
                        className="inline-flex items-center gap-2 rounded-md border border-red-300 bg-card px-3 py-1.5 text-sm font-bold text-red-700 transition hover:bg-red-100"
                        type="submit"
                      >
                        <Archive className="size-4" aria-hidden="true" />
                        Archive
                      </button>
                    </div>
                  </form>
                ) : null}
              </div>

              {document.items.length > 0 ? (
                <>
                  <div className="p-4 md:hidden">
                    <OpsMobileRecordList>
                      {document.items.map((item) => (
                        <OpsMobileRecordCard key={item.id}>
                          <div>
                            <p className="font-heading text-lg font-bold text-foreground">
                              {item.description}
                            </p>
                            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                              {item.unit}
                            </p>
                          </div>
                          <OpsMobileRecordRow label="Quantity">{formatNumber(item.quantity)}</OpsMobileRecordRow>
                          <OpsMobileRecordRow label="Rate">
                            {formatZmw(item.unit_rate)}
                          </OpsMobileRecordRow>
                          <OpsMobileRecordRow label="Requested">
                            <BoqRequestedCell item={item} />
                          </OpsMobileRecordRow>
                          <OpsMobileRecordRow label="Total">
                            {formatZmw(item.budgeted_total)}
                          </OpsMobileRecordRow>
                          <OpsMobileRecordRow label="Classification">{item.category}</OpsMobileRecordRow>
                          <OpsMobileRecordRow label="Needed by">
                            {deriveOpsBoqLineDates(item).effectiveNeededBy ?? "—"}
                          </OpsMobileRecordRow>
                          <OpsMobileRecordRow label="Transport">
                            {formatZmw(item.estimated_transport_cost)}
                          </OpsMobileRecordRow>
                          <OpsMobileRecordRow label="Supplier">
                            {item.supplier
                              ? `${item.supplier.supplier_code} — ${item.supplier.legal_name}`
                              : item.supplier_name_freeform
                                ? `${item.supplier_name_freeform} (not in master list)`
                                : "—"}
                          </OpsMobileRecordRow>
                          {canManage ? (
                            <Link
                              className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-primary-blue hover:underline"
                              href={buildBoqLineRfqHref(document, item)}
                            >
                              <Send className="size-3.5" aria-hidden="true" />
                              Create Request for Quotation from this line
                            </Link>
                          ) : null}
                        </OpsMobileRecordCard>
                      ))}
                    </OpsMobileRecordList>
                  </div>
                  <div
                    aria-label={`${document.title} BOQ line items table`}
                    className={`hidden md:block ${OPS_TABLE_SCROLL_CLASS}`}
                    tabIndex={0}
                  >
                  <table className="min-w-full divide-y divide-border text-sm">
                    <caption className="sr-only">
                      BOQ line items for {document.title}, including quantity, rate, actuals, and total.
                    </caption>
                    <thead className="bg-muted/40 text-left text-xs uppercase tracking-[0.12em] text-muted-foreground">
                      <tr>
                        <th className="px-5 py-3" scope="col">
                          Description
                        </th>
                        <th className="px-5 py-3" scope="col">
                          Unit
                        </th>
                        <th className="px-5 py-3" scope="col">
                          Qty
                        </th>
                        <th className="px-5 py-3" scope="col">
                          Rate
                        </th>
                        <th className="px-5 py-3" scope="col">
                          Requested
                        </th>
                        <th className="px-5 py-3" scope="col">
                          Total
                        </th>
                        <th className="px-5 py-3" scope="col">
                          Classification
                        </th>
                        <th className="px-5 py-3" scope="col">
                          Needed by
                        </th>
                        <th className="px-5 py-3" scope="col">
                          Transport
                        </th>
                        <th className="px-5 py-3" scope="col">
                          Supplier
                        </th>
                        {canManage ? (
                          <th className="px-5 py-3" scope="col">
                            Source
                          </th>
                        ) : null}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {document.items.map((item) => (
                        <tr key={item.id}>
                          <td className="px-5 py-4 font-semibold text-foreground">
                            {item.description}
                            {item.stock_item ? (
                              <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                                {item.stock_item.item_code}
                              </span>
                            ) : null}
                          </td>
                          <td className="px-5 py-4 text-foreground/70">{item.unit}</td>
                          <td className="px-5 py-4 text-foreground/70">
                            {formatNumber(item.quantity)}
                          </td>
                          <td className="px-5 py-4 text-foreground/70">
                            {formatZmw(item.unit_rate)}
                            <BoqPriceBenchmark item={item} />
                          </td>
                          <td className="px-5 py-4">
                            <BoqRequestedCell item={item} />
                          </td>
                          <td className="px-5 py-4 font-semibold text-foreground">
                            {formatZmw(item.budgeted_total)}
                          </td>
                          <td className="px-5 py-4 text-foreground/70">
                            <span className="inline-flex rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                              {item.category}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-foreground/70">
                            {deriveOpsBoqLineDates(item).effectiveNeededBy ?? (
                              <span className="text-muted-foreground">—</span>
                            )}
                            {item.task ? (
                              <span className="ml-1 text-xs text-muted-foreground">
                                (from {item.task.title})
                              </span>
                            ) : null}
                          </td>
                          <td className="px-5 py-4 text-foreground/70">
                            {formatZmw(item.estimated_transport_cost)}
                          </td>
                          <td className="px-5 py-4 text-foreground/70">
                            {item.supplier ? (
                              <span title={item.supplier.legal_name}>
                                {item.supplier.supplier_code}
                              </span>
                            ) : item.supplier_name_freeform ? (
                              <span
                                className="text-foreground/70"
                                title="Not in supplier master list yet"
                              >
                                {item.supplier_name_freeform}
                                <span className="ml-1 text-[10px] text-muted-foreground">*</span>
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          {canManage ? (
                            <td className="px-5 py-4">
                              <div className="flex flex-wrap items-center gap-3">
                                <Link
                                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-blue hover:underline"
                                  href={buildBoqLineRfqHref(document, item)}
                                >
                                  <Send className="size-3.5" aria-hidden="true" />
                                  RFQ
                                </Link>
                                {canEditDoc ? (
                                  <>
                                    <details className="inline-block">
                                      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-foreground/70 hover:text-foreground [&::-webkit-details-marker]:hidden">
                                        <Pencil className="size-3.5" aria-hidden="true" />
                                        Edit
                                      </summary>
                                      <form
                                        action={updateBoqLineItemAction}
                                        className="mt-2 grid gap-2 rounded-md border border-border bg-card p-3 shadow-sm"
                                      >
                                        <input name="line_item_id" type="hidden" value={item.id} />
                                        <label className="text-xs font-bold text-muted-foreground">
                                          Description
                                          <input className={`${OPS_INPUT_CLASS} mt-1`} defaultValue={item.description} name="description" required />
                                        </label>
                                        <div className="grid grid-cols-3 gap-2">
                                          <label className="text-xs font-bold text-muted-foreground">
                                            Unit
                                            <input className={`${OPS_INPUT_CLASS} mt-1`} defaultValue={item.unit} name="unit" required />
                                          </label>
                                          <label className="text-xs font-bold text-muted-foreground">
                                            Qty
                                            <input className={`${OPS_INPUT_CLASS} mt-1`} defaultValue={String(item.quantity)} min="0" name="quantity" required step="0.01" type="number" />
                                          </label>
                                          <label className="text-xs font-bold text-muted-foreground">
                                            Rate
                                            <input className={`${OPS_INPUT_CLASS} mt-1`} defaultValue={String(item.unit_rate)} min="0" name="unit_rate" required step="0.01" type="number" />
                                          </label>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                          <label className="text-xs font-bold text-muted-foreground">
                                            Supplier
                                            <select className={`${OPS_INPUT_CLASS} mt-1`} defaultValue={item.supplier_id ?? ""} name="supplier_id">
                                              <option value="">None</option>
                                              {supplierOptions.map((supplier) => (
                                                <option key={supplier.id} value={supplier.id}>
                                                  {supplier.supplier_code}
                                                </option>
                                              ))}
                                            </select>
                                          </label>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                          <label className="text-xs font-bold text-muted-foreground">
                                            Classification
                                            <input className={`${OPS_INPUT_CLASS} mt-1`} defaultValue={item.category} list="boq-category-suggestions" name="category" />
                                          </label>
                                          <label className="text-xs font-bold text-muted-foreground">
                                            Needed by
                                            <input className={`${OPS_INPUT_CLASS} mt-1`} defaultValue={item.needed_by ?? ""} name="needed_by" type="date" />
                                          </label>
                                        </div>
                                        <label className="text-xs font-bold text-muted-foreground">
                                          Linked schedule task
                                          <select className={`${OPS_INPUT_CLASS} mt-1`} defaultValue={item.project_task_id ?? ""} name="project_task_id">
                                            <option value="">No linked task</option>
                                            {(tasksBySiteId.get(document.site_id) ?? []).map((task) => (
                                              <option key={task.id} value={task.id}>
                                                {task.title} ({task.planned_start_date})
                                              </option>
                                            ))}
                                          </select>
                                        </label>
                                        <button className={`${OPS_PRIMARY_BUTTON_CLASS} mt-1 w-full`} type="submit">
                                          Save line
                                        </button>
                                      </form>
                                    </details>
                                    <form action={deleteBoqLineItemAction} className="inline-block">
                                      <input name="line_item_id" type="hidden" value={item.id} />
                                      <button
                                        className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-600 hover:text-red-700"
                                        type="submit"
                                      >
                                        <Trash2 className="size-3.5" aria-hidden="true" />
                                        Delete
                                      </button>
                                    </form>
                                  </>
                                ) : null}
                              </div>
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </>
              ) : (
                <div className="flex min-h-32 items-center justify-center p-8 text-center text-sm text-muted-foreground">
                  No line items added to this material schedule yet.
                </div>
              )}
              <OpsRecordActivityPanel
                canManage={canManage}
                sourceId={document.id}
                sourceTable="boq_documents"
              />
            </div>
            );
          })
        ) : (
          <div className="flex min-h-56 flex-col items-center justify-center gap-3 rounded-lg border border-border bg-card p-8 text-center">
            <FileSpreadsheet className="size-10 text-primary-blue" aria-hidden="true" />
            <div>
              <p className="font-heading text-xl font-bold text-foreground">
                {hasActiveListFilter ? "No matching material schedule documents" : "No material schedule documents yet"}
              </p>
              <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
                {hasActiveListFilter
                  ? "Adjust the search or status filter to widen the material schedule document list."
                  : "Create a site first, then start your first material schedule document."}
              </p>
            </div>
          </div>
        )}
        <OpsPaginationControls
          basePath="/ops/material-schedule"
          filters={[
            {
              label: "Status",
              name: "status",
              options: [],
              value: status,
            },
          ]}
          pagination={documents.pagination}
          query={listState.query}
          resultLabel="material schedule documents"
        />
      </section>
    </div>
  );
}
