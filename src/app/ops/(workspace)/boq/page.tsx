import {
  Archive,
  Calculator,
  CheckCircle2,
  Clock3,
  FileSpreadsheet,
  FileText,
  Pencil,
  Plus,
  ReceiptText,
  Send,
  Trash2,
  Upload,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OpsDashboardPanel } from "@/components/ops/OpsDashboardPanel";
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
  createBoqDocumentAction,
  createBoqLineItemAction,
  deleteBoqLineItemAction,
  updateBoqDocumentAction,
  updateBoqLineItemAction,
  importBoqLineItemsCsvAction,
} from "@/lib/ops/boq-actions";
import { fetchPaginatedOpsBoqDocuments, type OpsBoqDocument } from "@/lib/ops/boq";
import { requireOpsUser } from "@/lib/ops/auth";
import { parseOpsListState } from "@/lib/ops/listing";
import {
  canArchiveBoq,
  canCreateBoq,
  canEditBoq,
} from "@/lib/ops/boq-permissions";
import { canAccessOpsHref } from "@/lib/ops/permissions";
import { fetchActiveSiteOptions } from "@/lib/ops/sites";
import { fetchActiveSupplierOptions } from "@/lib/ops/suppliers";
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
} from "@/lib/ops/ui";

type PageProps = {
  searchParams?: Promise<OpsSearchParams>;
};

const BOQ_STATUS_OPTIONS: Array<{ label: string; value: OpsBoqDocument["status"] | "" }> = [
  { label: "All statuses", value: "" },
  { label: "Draft", value: "draft" },
  { label: "Issued", value: "issued" },
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
    return { tone: "success" as const, message: "Bill of Quantities updated." };
  }
  if (updatedKey === "line") {
    return { tone: "success" as const, message: "Line item updated." };
  }
  if (updatedKey === "line_deleted") {
    return { tone: "success" as const, message: "Line item deleted." };
  }
  if (updatedKey === "archived") {
    return { tone: "success" as const, message: "Bill of Quantities archived." };
  }
  if (updatedKey === "restored") {
    return { tone: "success" as const, message: "Bill of Quantities restored." };
  }
  if (updatedKey === "deleted") {
    return { tone: "success" as const, message: "Bill of Quantities permanently deleted." };
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

function boqStatusClass(status: OpsBoqDocument["status"]) {
  return status === "issued"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : "border-orange-200 bg-orange-50 text-orange-700";
}

function BoqValueMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-primary-dark/10 px-3 py-3">
      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-primary-dark/45">
        {label}
      </dt>
      <dd className="mt-1 font-heading text-xl font-bold text-primary-dark">{value}</dd>
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
    <div className="rounded-md border border-primary-dark/10 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary-dark/45">
            {label}
          </p>
          <p className="mt-1 font-heading text-xl font-bold text-primary-dark">{value}</p>
        </div>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary-blue/10 text-primary-blue">
          <Icon className="size-4" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-primary-dark/60">{description}</p>
    </div>
  );
}

export default async function OpsBoqPage({ searchParams }: PageProps) {
  const [params, auth] = await Promise.all([
    searchParams ?? Promise.resolve({} as OpsSearchParams),
    requireOpsUser(),
  ]);

  if (!canAccessOpsHref(auth.profile.role, "/ops/boq")) {
    notFound();
  }

  const listState = parseOpsListState(params, { defaultPageSize: 6 });
  const status = boqStatusFromParam(firstParam(params.status));
  const [documents, siteOptions, supplierOptions] = await Promise.all([
    fetchPaginatedOpsBoqDocuments({
      listState,
      query: listState.query,
      status: status || undefined,
    }),
    fetchActiveSiteOptions(),
    fetchActiveSupplierOptions(),
  ]);
  const boqDocuments = documents.items;
  const hasActiveListFilter = listState.query.length > 0 || Boolean(status);
  // canCreate gates the "New Bill of Quantities" button and the global form.
  // Per-document edit/delete uses canEditBoq(role, doc) so the rules also
  // respect the document's draft/issued/archived state.
  const canCreate = canCreateBoq(auth.profile.role);
  const canArchive = canArchiveBoq(auth.profile.role);
  // Many UI sections (activity panel, comments) just need write access. Use
  // canCreate as a stand-in for that — anyone who can create a Bill of Quantities can manage
  // its comments / attachments.
  const canManage = canCreate;
  const notice = boqNotice(params);
  const totalBudgeted = boqDocuments.reduce((sum, document) => sum + document.budgeted_total, 0);
  const totalActual = boqDocuments.reduce((sum, document) => sum + document.actual_total, 0);
  const draftCount = boqDocuments.filter((document) => document.status === "draft").length;
  const issuedCount = boqDocuments.filter((document) => document.status === "issued").length;
  const visibleLineItems = boqDocuments.reduce((sum, document) => sum + document.items.length, 0);
  const visibleSiteCount = new Set(boqDocuments.map((document) => document.site_id)).size;
  const visibleVariance = totalBudgeted - totalActual;
  const createPanelParams = new URLSearchParams();

  if (listState.query) {
    createPanelParams.set("q", listState.query);
  }

  if (status) {
    createPanelParams.set("status", status);
  }

  createPanelParams.set("create", "boq");
  const createBoqHref = `/ops/boq?${createPanelParams.toString()}#boq-create-panel`;
  const openCreatePanel = firstParam(params.create) === "boq";

  return (
    <div className="w-full max-w-none space-y-6">
      <OpsRealtimeRefresh tables={["boq_documents", "boq_line_items"]} />
      <OpsPageHeader
        eyebrow="Commercial control"
        title="Bill of Quantities"
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
                New Bill of Quantities
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
          href="/ops/boq#boq-register"
          icon={FileSpreadsheet}
          label="Bill of Quantities documents"
          trend="Register"
          value={documents.pagination.total.toLocaleString("en-ZM")}
        />
        <OpsKpiCard
          href="/ops/boq?status=draft#boq-register"
          icon={Clock3}
          label="Draft shown"
          tone={draftCount > 0 ? "warn" : "default"}
          trend={draftCount > 0 ? "Review" : "Clear"}
          value={draftCount.toLocaleString("en-ZM")}
        />
        <OpsKpiCard
          href="/ops/boq?status=issued#boq-register"
          icon={CheckCircle2}
          label="Issued shown"
          tone="good"
          trend="Invoice ready"
          value={issuedCount.toLocaleString("en-ZM")}
        />
        <OpsKpiCard
          href="/ops/boq#boq-register"
          icon={Calculator}
          label="Line items shown"
          trend="Measured"
          value={visibleLineItems.toLocaleString("en-ZM")}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.85fr)]">
        <OpsDashboardPanel eyebrow="Visible values" title="Current Bill of Quantities selection">
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
          title="Bill of Quantities to invoice"
        >
          <div className="grid gap-3">
            <BoqFlowStep
              description="Draft BOQs stay editable while QS/commercial teams build measured scope."
              icon={Clock3}
              label="Draft control"
              value={`${draftCount} shown`}
            />
            <BoqFlowStep
              description="Issued BOQs become the stable source record for invoice links and future IPCs."
              icon={CheckCircle2}
              label="Issued source"
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
          className="scroll-mt-24 rounded-lg border border-primary-dark/10 bg-white"
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
              <span className="block font-heading text-xl font-bold text-primary-dark">
                Create Bill of Quantities
              </span>
              <span className="mt-1 block text-sm text-primary-dark/60">
                Create the site-linked Bill of Quantities header before adding measured line items in the register.
              </span>
            </span>
            <span className="shrink-0 text-xs font-bold uppercase tracking-[0.12em] text-primary-dark/45">
              Open
            </span>
          </summary>
          {siteOptions.length === 0 ? (
            <div className="border-t border-primary-dark/10 p-5">
              <div className="rounded-md border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
                Add at least one site before creating a Bill of Quantities.
              </div>
            </div>
          ) : (
            <form
              action={createBoqDocumentAction}
              className="grid gap-4 border-t border-primary-dark/10 p-5 min-[520px]:grid-cols-2 lg:grid-cols-6"
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
              <label className={OPS_LABEL_CLASS}>
                Status
                <select className={OPS_INPUT_CLASS} defaultValue="draft" name="status">
                  <option value="draft">Draft</option>
                  <option value="issued">Issued</option>
                </select>
              </label>
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
        <div className="rounded-lg border border-primary-dark/10 bg-white">
          <div className="border-b border-primary-dark/10 p-5">
            <h2 className="font-heading text-xl font-bold text-primary-dark">BOQ documents</h2>
            <p className="mt-1 text-sm text-primary-dark/60">
              Search and filter document headers before opening their line items.
            </p>
          </div>
          <OpsListControls
            action="/ops/boq"
            filters={[
              {
                label: "Status",
                name: "status",
                options: BOQ_STATUS_OPTIONS,
                value: status,
              },
            ]}
            placeholder="Search Bill of Quantities title"
            query={listState.query}
            resultLabel="Bill of Quantities documents"
          />
        </div>

        {boqDocuments.length > 0 ? (
          boqDocuments.map((document) => {
            const canEditDoc = canEditBoq(auth.profile.role, document);
            return (
            <div className="rounded-lg border border-primary-dark/10 bg-white" key={document.id}>
              <div className="border-b border-primary-dark/10 p-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-blue">
                      {document.site?.code ?? "Site code unavailable"} - v{document.version}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <h2 className="font-heading text-xl font-bold text-primary-dark">
                        {document.title}
                      </h2>
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${boqStatusClass(
                          document.status,
                        )}`}
                      >
                        {document.status}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-primary-dark/60">
                      {document.site?.name ?? "Site record unavailable"}
                    </p>
                  </div>
                  <div className="grid gap-3 min-[520px]:grid-cols-3 lg:min-w-[24rem]">
                    <div className="rounded-md border border-primary-dark/10 px-3 py-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary-dark/45">
                        Budgeted
                      </p>
                      <p className="mt-1 font-bold text-primary-dark">
                        {formatZmw(document.budgeted_total)}
                      </p>
                    </div>
                    <div className="rounded-md border border-primary-dark/10 px-3 py-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary-dark/45">
                        Actual
                      </p>
                      <p className="mt-1 font-bold text-primary-dark">
                        {formatZmw(document.actual_total)}
                      </p>
                    </div>
                    <div className="rounded-md border border-primary-dark/10 px-3 py-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary-dark/45">
                        Lines
                      </p>
                      <p className="mt-1 font-bold text-primary-dark">
                        {document.items.length.toLocaleString("en-ZM")}
                      </p>
                    </div>
                  </div>
                </div>

                {canEditDoc ? (
                  <>
                  <details className="mt-5 rounded-md border border-primary-dark/10">
                    <summary
                      className={`flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-bold text-primary-dark transition hover:text-primary-blue [&::-webkit-details-marker]:hidden ${OPS_FOCUS_CLASS}`}
                    >
                      <span className="inline-flex items-center gap-2">
                        <Plus className="size-4" aria-hidden="true" />
                        Add measured line item
                      </span>
                      <span className="text-xs uppercase tracking-[0.12em] text-primary-dark/45">
                        Open
                      </span>
                    </summary>
                    <form
                      action={createBoqLineItemAction}
                      className="grid gap-3 border-t border-primary-dark/10 p-4 md:grid-cols-3 lg:grid-cols-6"
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
                      <label className={OPS_LABEL_CLASS}>
                        Actual
                        <input
                          className={OPS_INPUT_CLASS}
                          min="0"
                          name="actual_quantity"
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

                  <details className="mt-3 rounded-md border border-primary-dark/10">
                    <summary
                      className={`flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-bold text-primary-dark transition hover:text-primary-blue [&::-webkit-details-marker]:hidden ${OPS_FOCUS_CLASS}`}
                    >
                      <span className="inline-flex items-center gap-2">
                        <Upload className="size-4" aria-hidden="true" />
                        Import line items from CSV
                      </span>
                      <span className="text-xs uppercase tracking-[0.12em] text-primary-dark/45">
                        Open
                      </span>
                    </summary>
                    <form
                      action={importBoqLineItemsCsvAction}
                      className="grid gap-3 border-t border-primary-dark/10 p-4"
                    >
                      <input name="boq_id" type="hidden" value={document.id} />
                      <p className="text-sm leading-6 text-primary-dark/60">
                        Upload a CSV, XLSX, or PDF with columns{" "}
                        <span className="font-semibold text-primary-dark">
                          description, unit, quantity, unit price
                        </span>{" "}
                        (optional:{" "}
                        <span className="font-semibold text-primary-dark">supplier name</span>). For XLSX
                        form-style sheets (Item No, Quantity, Unit of Measure, Description, Unit Price, Total,
                        Supplier Name), the importer skips title rows and picks up the header automatically.
                      </p>
                      <label className={OPS_LABEL_CLASS}>
                        Bill of Quantities file
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

                  <details className="mt-3 rounded-md border border-primary-dark/10">
                    <summary
                      className={`flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-bold text-primary-dark transition hover:text-primary-blue [&::-webkit-details-marker]:hidden ${OPS_FOCUS_CLASS}`}
                    >
                      <span className="inline-flex items-center gap-2">
                        <Pencil className="size-4" aria-hidden="true" />
                        Edit Bill of Quantities details
                      </span>
                      <span className="text-xs uppercase tracking-[0.12em] text-primary-dark/45">
                        Open
                      </span>
                    </summary>
                    <form
                      action={updateBoqDocumentAction}
                      className="grid gap-3 border-t border-primary-dark/10 p-4 md:grid-cols-4"
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
                      <label className={OPS_LABEL_CLASS}>
                        Status
                        <select
                          className={OPS_INPUT_CLASS}
                          defaultValue={document.status}
                          name="status"
                        >
                          <option value="draft">Draft</option>
                          <option value="issued">Issued</option>
                        </select>
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
                        Archive removes this Bill of Quantities from default listings.
                        Leadership can restore it later.
                      </p>
                      <button
                        className="inline-flex items-center gap-2 rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-bold text-red-700 transition hover:bg-red-100"
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
                            <p className="font-heading text-lg font-bold text-primary-dark">
                              {item.description}
                            </p>
                            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-primary-dark/45">
                              {item.unit}
                            </p>
                          </div>
                          <OpsMobileRecordRow label="Quantity">{formatNumber(item.quantity)}</OpsMobileRecordRow>
                          <OpsMobileRecordRow label="Rate">
                            {formatZmw(item.unit_rate)}
                          </OpsMobileRecordRow>
                          <OpsMobileRecordRow label="Actual">
                            {formatNumber(item.actual_quantity)}
                          </OpsMobileRecordRow>
                          <OpsMobileRecordRow label="Total">
                            {formatZmw(item.budgeted_total)}
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
                  <table className="min-w-full divide-y divide-primary-dark/10 text-sm">
                    <caption className="sr-only">
                      BOQ line items for {document.title}, including quantity, rate, actuals, and total.
                    </caption>
                    <thead className="bg-primary-dark/[0.03] text-left text-xs uppercase tracking-[0.12em] text-primary-dark/52">
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
                          Actual
                        </th>
                        <th className="px-5 py-3" scope="col">
                          Total
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
                    <tbody className="divide-y divide-primary-dark/10">
                      {document.items.map((item) => (
                        <tr key={item.id}>
                          <td className="px-5 py-4 font-semibold text-primary-dark">
                            {item.description}
                          </td>
                          <td className="px-5 py-4 text-primary-dark/70">{item.unit}</td>
                          <td className="px-5 py-4 text-primary-dark/70">
                            {formatNumber(item.quantity)}
                          </td>
                          <td className="px-5 py-4 text-primary-dark/70">
                            {formatZmw(item.unit_rate)}
                          </td>
                          <td className="px-5 py-4 text-primary-dark/70">
                            {formatNumber(item.actual_quantity)}
                          </td>
                          <td className="px-5 py-4 font-semibold text-primary-dark">
                            {formatZmw(item.budgeted_total)}
                          </td>
                          <td className="px-5 py-4 text-primary-dark/70">
                            {item.supplier ? (
                              <span title={item.supplier.legal_name}>
                                {item.supplier.supplier_code}
                              </span>
                            ) : item.supplier_name_freeform ? (
                              <span
                                className="text-primary-dark/70"
                                title="Not in supplier master list yet"
                              >
                                {item.supplier_name_freeform}
                                <span className="ml-1 text-[10px] text-primary-dark/40">*</span>
                              </span>
                            ) : (
                              <span className="text-primary-dark/40">—</span>
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
                                      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-primary-dark/70 hover:text-primary-dark [&::-webkit-details-marker]:hidden">
                                        <Pencil className="size-3.5" aria-hidden="true" />
                                        Edit
                                      </summary>
                                      <form
                                        action={updateBoqLineItemAction}
                                        className="mt-2 grid gap-2 rounded-md border border-primary-dark/10 bg-white p-3 shadow-sm"
                                      >
                                        <input name="line_item_id" type="hidden" value={item.id} />
                                        <label className="text-xs font-bold text-primary-dark/60">
                                          Description
                                          <input className={`${OPS_INPUT_CLASS} mt-1`} defaultValue={item.description} name="description" required />
                                        </label>
                                        <div className="grid grid-cols-3 gap-2">
                                          <label className="text-xs font-bold text-primary-dark/60">
                                            Unit
                                            <input className={`${OPS_INPUT_CLASS} mt-1`} defaultValue={item.unit} name="unit" required />
                                          </label>
                                          <label className="text-xs font-bold text-primary-dark/60">
                                            Qty
                                            <input className={`${OPS_INPUT_CLASS} mt-1`} defaultValue={String(item.quantity)} min="0" name="quantity" required step="0.01" type="number" />
                                          </label>
                                          <label className="text-xs font-bold text-primary-dark/60">
                                            Rate
                                            <input className={`${OPS_INPUT_CLASS} mt-1`} defaultValue={String(item.unit_rate)} min="0" name="unit_rate" required step="0.01" type="number" />
                                          </label>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                          <label className="text-xs font-bold text-primary-dark/60">
                                            Actual qty
                                            <input className={`${OPS_INPUT_CLASS} mt-1`} defaultValue={String(item.actual_quantity)} min="0" name="actual_quantity" step="0.01" type="number" />
                                          </label>
                                          <label className="text-xs font-bold text-primary-dark/60">
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
                <div className="flex min-h-32 items-center justify-center p-8 text-center text-sm text-primary-dark/60">
                  No line items added to this Bill of Quantities yet.
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
          <div className="flex min-h-56 flex-col items-center justify-center gap-3 rounded-lg border border-primary-dark/10 bg-white p-8 text-center">
            <FileSpreadsheet className="size-10 text-primary-blue" aria-hidden="true" />
            <div>
              <p className="font-heading text-xl font-bold text-primary-dark">
                {hasActiveListFilter ? "No matching Bill of Quantities documents" : "No Bill of Quantities documents yet"}
              </p>
              <p className="mt-2 max-w-lg text-sm leading-6 text-primary-dark/60">
                {hasActiveListFilter
                  ? "Adjust the search or status filter to widen the Bill of Quantities document list."
                  : "Create a site first, then start your first Bill of Quantities document."}
              </p>
            </div>
          </div>
        )}
        <OpsPaginationControls
          basePath="/ops/boq"
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
          resultLabel="Bill of Quantities documents"
        />
      </section>
    </div>
  );
}
