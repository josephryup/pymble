import Link from "next/link";
import {
  Banknote,
  Check,
  Clock3,
  FileText,
  Plus,
  ReceiptText,
  Send,
  Users,
  Wallet,
} from "lucide-react";
import { notFound } from "next/navigation";
import { OpsConfirmSubmitButton } from "@/components/ops/OpsConfirmSubmitButton";
import { OpsDashboardPanel } from "@/components/ops/OpsDashboardPanel";
import { OpsKpiCard } from "@/components/ops/OpsKpiCard";
import { OpsEmptyState } from "@/components/ops/OpsEmptyState";
import { OpsListControls, OpsPaginationControls } from "@/components/ops/OpsListControls";
import { OpsPageHeader } from "@/components/ops/OpsPageHeader";
import { OpsRealtimeRefresh } from "@/components/ops/OpsRealtimeRefresh";
import { OpsRecordActivityPanel } from "@/components/ops/OpsRecordActivityPanel";
import {
  archiveInvoiceAction,
  createInvoiceAction,
  markInvoicePaidAction,
  sendInvoiceAction,
  updateInvoiceAction,
  voidInvoiceAction,
} from "@/lib/ops/invoice-actions";
import {
  canArchiveInvoice,
  canCreateInvoice,
  canEditInvoice,
  canMarkInvoicePaid,
  canSendInvoice,
  canVoidInvoice,
} from "@/lib/ops/invoice-permissions";
import {
  fetchOpsInvoiceStatusCounts,
  fetchPaginatedOpsInvoices,
  type OpsInvoice,
} from "@/lib/ops/invoices";
import { requireOpsUser } from "@/lib/ops/auth";
import { fetchOpsBoqOptions } from "@/lib/ops/boq";
import { fetchActiveCustomerOptions } from "@/lib/ops/customers";
import { parseOpsListState } from "@/lib/ops/listing";
import { canAccessOpsHref } from "@/lib/ops/permissions";
import { fetchActiveSiteOptions } from "@/lib/ops/sites";
import {
  firstParam,
  formatZmw,
  noticeFromParams,
  OPS_INPUT_CLASS,
  OPS_LABEL_CLASS,
  OPS_PRIMARY_BUTTON_CLASS,
  OPS_SECONDARY_BUTTON_CLASS,
  type OpsSearchParams,
} from "@/lib/ops/ui";

type PageProps = {
  searchParams?: Promise<OpsSearchParams>;
};

const INVOICE_STATUS_OPTIONS: Array<{ label: string; value: OpsInvoice["status"] | "" }> = [
  { label: "All statuses", value: "" },
  { label: "Draft", value: "draft" },
  { label: "Sent", value: "sent" },
  { label: "Paid", value: "paid" },
];

function invoiceStatusFromParam(value: string | undefined) {
  return INVOICE_STATUS_OPTIONS.some((option) => option.value === value)
    ? (value as OpsInvoice["status"] | "")
    : "";
}

function todayInLusaka() {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Africa/Lusaka",
    year: "numeric",
  }).format(new Date());
}

function invoiceNotice(params: OpsSearchParams) {
  const created = noticeFromParams(params, "invoice", "Invoice created.");

  if (created) {
    return created;
  }

  if (firstParam(params.updated) === "sent") {
    return {
      tone: "success" as const,
      message: "Invoice marked as sent.",
    };
  }

  if (firstParam(params.updated) === "paid") {
    return {
      tone: "success" as const,
      message: "Invoice marked as paid.",
    };
  }

  if (firstParam(params.updated) === "attachment") {
    return {
      tone: "success" as const,
      message: "Invoice attachment uploaded.",
    };
  }

  if (firstParam(params.updated) === "comment") {
    return {
      tone: "success" as const,
      message: "Invoice comment added.",
    };
  }

  return null;
}

function statusClass(status: OpsInvoice["status"]) {
  if (status === "paid") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "sent") {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }

  return "border-orange-200 bg-orange-50 text-orange-700";
}

function formatStatusLabel(status: OpsInvoice["status"]) {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-ZM", {
    dateStyle: "medium",
    timeZone: "Africa/Lusaka",
  }).format(new Date(`${value}T00:00:00+02:00`));
}

type InvoiceValueMetricProps = {
  label: string;
  value: string;
};

function InvoiceValueMetric({ label, value }: InvoiceValueMetricProps) {
  return (
    <div className="rounded-md border border-primary-dark/10 px-3 py-2">
      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-primary-dark/45">
        {label}
      </dt>
      <dd className="mt-1 font-heading text-lg font-bold text-primary-dark">{value}</dd>
    </div>
  );
}

export default async function OpsInvoicesPage({ searchParams }: PageProps) {
  const [params, auth] = await Promise.all([
    searchParams ?? Promise.resolve({} as OpsSearchParams),
    requireOpsUser(),
  ]);

  if (!canAccessOpsHref(auth.profile.role, "/ops/invoices")) {
    notFound();
  }

  const listState = parseOpsListState(params, { defaultPageSize: 10 });
  const status = invoiceStatusFromParam(firstParam(params.status));
  const [invoicePage, siteOptions, boqOptions, invoiceStatusCounts, customerOptions] =
    await Promise.all([
      fetchPaginatedOpsInvoices({
        listState,
        query: listState.query,
        status: status || undefined,
      }),
      fetchActiveSiteOptions(),
      fetchOpsBoqOptions(),
      fetchOpsInvoiceStatusCounts(),
      fetchActiveCustomerOptions(),
    ]);
  const invoices = invoicePage.items;
  const hasActiveListFilter = listState.query.length > 0 || Boolean(status);
  const canCreate = canCreateInvoice(auth.profile.role);
  // canManage gates legacy "global" UI like the create form and the Activity
  // panel write permission. Per-invoice mutation gates use the canEdit/Send/Pay/
  // Void/Archive helpers, which also check the invoice's state.
  const canManage = canCreate;
  const notice = invoiceNotice(params);
  const pageSubtotal = invoices.reduce((sum, invoice) => sum + invoice.subtotal, 0);
  const pageVat = invoices.reduce((sum, invoice) => sum + invoice.vat_amount, 0);
  const pageOutstanding = invoices
    .filter((invoice) => invoice.status !== "paid")
    .reduce((sum, invoice) => sum + invoice.total_amount, 0);
  const pagePaid = invoices
    .filter((invoice) => invoice.status === "paid")
    .reduce((sum, invoice) => sum + invoice.total_amount, 0);
  const createPanelParams = new URLSearchParams();

  if (listState.query) {
    createPanelParams.set("q", listState.query);
  }

  if (status) {
    createPanelParams.set("status", status);
  }

  createPanelParams.set("create", "invoice");
  const createInvoiceHref = `/ops/invoices?${createPanelParams.toString()}#invoice-create-panel`;
  const openCreatePanel = firstParam(params.create) === "invoice";

  return (
    <div className="w-full max-w-none space-y-6">
      <OpsRealtimeRefresh tables={["invoices", "approval_requests"]} />
      <OpsPageHeader
        eyebrow="Commercial / Finance"
        title="Invoices"
        description="Value-Added Tax invoices, Bill of Quantities links, client TPIN records, receivables status, and invoice evidence."
        actions={
          <>
            <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/boq">
              <FileText className="size-4" aria-hidden="true" />
              Bill of Quantities
            </Link>
            <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/customers">
              <Users className="size-4" aria-hidden="true" />
              Customers
            </Link>
            {canManage ? (
              <a className={OPS_PRIMARY_BUTTON_CLASS} href={createInvoiceHref}>
                <Plus className="size-4" aria-hidden="true" />
                New invoice
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

      <section className="grid gap-4 min-[720px]:grid-cols-4">
        <OpsKpiCard
          href="/ops/invoices"
          icon={ReceiptText}
          label="Total invoices"
          hint="Register"
          value={invoiceStatusCounts.total.toLocaleString("en-ZM")}
        />
        <OpsKpiCard
          href="/ops/invoices?status=draft"
          icon={Clock3}
          label="Draft invoices"
          tone={invoiceStatusCounts.draft > 0 ? "warn" : "default"}
          trend={invoiceStatusCounts.draft > 0 ? "Send" : "Clear"}
          value={invoiceStatusCounts.draft.toLocaleString("en-ZM")}
        />
        <OpsKpiCard
          href="/ops/invoices?status=sent"
          icon={Wallet}
          label="Sent invoices"
          hint="Receivables"
          value={invoiceStatusCounts.sent.toLocaleString("en-ZM")}
        />
        <OpsKpiCard
          href="/ops/invoices?status=paid"
          icon={Banknote}
          label="Paid invoices"
          tone="good"
          hint="Collected"
          value={invoiceStatusCounts.paid.toLocaleString("en-ZM")}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(19rem,0.75fr)]">
        <OpsDashboardPanel eyebrow="Visible values" title="Current invoice selection">
          <dl className="grid gap-3 min-[520px]:grid-cols-2 xl:grid-cols-4">
            <InvoiceValueMetric label="Subtotal shown" value={formatZmw(pageSubtotal)} />
            <InvoiceValueMetric label="VAT shown" value={formatZmw(pageVat)} />
            <InvoiceValueMetric label="Outstanding shown" value={formatZmw(pageOutstanding)} />
            <InvoiceValueMetric label="Paid shown" value={formatZmw(pagePaid)} />
          </dl>
        </OpsDashboardPanel>

        <OpsDashboardPanel eyebrow="Status flow" title="Receivables movement">
          <div className="grid gap-3">
            {[
              { label: "Draft", value: invoiceStatusCounts.draft },
              { label: "Sent", value: invoiceStatusCounts.sent },
              { label: "Paid", value: invoiceStatusCounts.paid },
            ].map((item) => (
              <div
                className="flex items-center justify-between gap-3 rounded-md border border-primary-dark/10 px-3 py-2"
                key={item.label}
              >
                <span className="text-sm font-bold text-primary-dark">{item.label}</span>
                <span className="font-heading text-lg font-bold text-primary-dark">
                  {item.value.toLocaleString("en-ZM")}
                </span>
              </div>
            ))}
          </div>
        </OpsDashboardPanel>
      </div>

      {canManage ? (
        <details
          className="rounded-lg border border-primary-dark/10 bg-white"
          id="invoice-create-panel"
          open={openCreatePanel}
        >
          <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 transition hover:bg-primary-dark/[0.02] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-blue [&::-webkit-details-marker]:hidden">
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-blue text-white">
                <Plus className="size-5" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block font-heading text-lg font-bold text-primary-dark">
                  Create invoice
                </span>
                <span className="mt-1 block text-sm text-primary-dark/60">
                  Value Added Tax invoice intake for site work, BOQ-linked billing, and client TPIN records.
                </span>
              </span>
            </span>
            <Plus className="size-5 shrink-0 text-primary-blue" aria-hidden="true" />
          </summary>
          {siteOptions.length === 0 ? (
            <div className="border-t border-primary-dark/10 p-5">
              <div className="rounded-md border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
                Add at least one site before creating invoices.
              </div>
            </div>
          ) : (
            <form
              action={createInvoiceAction}
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
                BOQ link
                <select className={OPS_INPUT_CLASS} defaultValue="" name="boq_id">
                  <option value="">Invoice without BOQ link</option>
                  {boqOptions.map((boq) => (
                    <option key={boq.id} value={boq.id}>
                      {boq.title} - {formatZmw(boq.budgeted_total)}
                    </option>
                  ))}
                </select>
              </label>
              <label className={OPS_LABEL_CLASS}>
                Issued at
                <input
                  className={OPS_INPUT_CLASS}
                  defaultValue={todayInLusaka()}
                  name="issued_at"
                  required
                  type="date"
                />
              </label>
              <label className={OPS_LABEL_CLASS}>
                Invoice no.
                <input className={OPS_INPUT_CLASS} name="invoice_number" />
              </label>
              <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
                Customer (optional)
                <select className={OPS_INPUT_CLASS} defaultValue="" name="customer_id">
                  <option value="">No customer link</option>
                  {customerOptions.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.customer_code} - {customer.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
                Client
                <input className={OPS_INPUT_CLASS} name="client_name" required />
              </label>
              <label className={OPS_LABEL_CLASS}>
                TPIN
                <input className={OPS_INPUT_CLASS} name="tpin" />
              </label>
              <label className={OPS_LABEL_CLASS}>
                Subtotal
                <input
                  className={OPS_INPUT_CLASS}
                  min="0"
                  name="subtotal"
                  required
                  step="0.01"
                  type="number"
                />
              </label>
              <div className="flex items-end min-[520px]:col-span-2 lg:col-span-3 lg:justify-end">
                <button className={`${OPS_PRIMARY_BUTTON_CLASS} w-full min-[520px]:w-auto`} type="submit">
                  <FileText className="size-4" aria-hidden="true" />
                  Create invoice
                </button>
              </div>
            </form>
          )}
        </details>
      ) : null}

      <OpsDashboardPanel
        actions={<ReceiptText className="size-6 shrink-0 text-primary-blue" aria-hidden="true" />}
        eyebrow="Invoice records"
        title="Register"
      >
        <div className="-mx-5 -mb-5">
          <div className="flex items-center justify-between gap-3 border-b border-primary-dark/10 p-5">
            <p className="text-sm text-primary-dark/60">
              {invoicePage.pagination.total} matching invoice records.
            </p>
          </div>
          <OpsListControls
            action="/ops/invoices"
            filters={[
              {
                label: "Status",
                name: "status",
                options: INVOICE_STATUS_OPTIONS,
                value: status,
              },
            ]}
            placeholder="Search invoice number, client, or TPIN"
            query={listState.query}
            resultLabel="invoices"
          />
          {invoices.length > 0 ? (
            <div className="divide-y divide-primary-dark/10">
              {invoices.map((invoice) => (
                <article className="p-5" key={invoice.id}>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-heading text-lg font-bold text-primary-dark">
                          {invoice.invoice_number}
                        </h3>
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${statusClass(
                            invoice.status,
                          )}`}
                        >
                          {formatStatusLabel(invoice.status)}
                        </span>
                      </div>
                      <p className="mt-2 font-bold text-primary-dark">{invoice.client_name}</p>
                      <p className="mt-1 text-sm text-primary-dark/60">
                        {invoice.site?.code ?? "Site code unavailable"} -{" "}
                        {formatDate(invoice.issued_at)}
                      </p>
                      <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-primary-dark/45">
                        {invoice.boq?.title ?? "Invoice without BOQ link"}{" "}
                        {invoice.tpin ? `- TPIN ${invoice.tpin}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <a
                        className={OPS_SECONDARY_BUTTON_CLASS}
                        href={`/api/ops/pdf/invoice/${invoice.id}`}
                        target="_blank"
                        rel="noopener"
                      >
                        <FileText className="size-3" aria-hidden="true" />
                        Download PDF
                      </a>
                      {canSendInvoice(auth.profile.role, invoice) ? (
                        <form action={sendInvoiceAction}>
                          <input name="id" type="hidden" value={invoice.id} />
                          <OpsConfirmSubmitButton
                            className={OPS_SECONDARY_BUTTON_CLASS}
                            confirmText="Confirm send"
                          >
                            <Send className="size-3" aria-hidden="true" />
                            Send
                          </OpsConfirmSubmitButton>
                        </form>
                      ) : null}
                      {canMarkInvoicePaid(auth.profile.role, invoice) ? (
                        <form action={markInvoicePaidAction}>
                          <input name="id" type="hidden" value={invoice.id} />
                          <OpsConfirmSubmitButton
                            className={OPS_PRIMARY_BUTTON_CLASS}
                            confirmText="Confirm paid"
                          >
                            <Check className="size-3" aria-hidden="true" />
                            Mark paid
                          </OpsConfirmSubmitButton>
                        </form>
                      ) : null}
                      {canVoidInvoice(auth.profile.role, invoice) ? (
                        <details className="inline-block">
                          <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-md border border-red-300 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-50 [&::-webkit-details-marker]:hidden">
                            Void
                          </summary>
                          <form
                            action={voidInvoiceAction}
                            className="mt-2 grid gap-2 rounded-md border border-red-200 bg-white p-3 shadow-sm"
                          >
                            <input name="id" type="hidden" value={invoice.id} />
                            <label className="text-xs font-bold text-primary-dark/60">
                              Reason
                              <input
                                className={`${OPS_INPUT_CLASS} mt-1`}
                                name="reason"
                                placeholder="Brief reason for the void"
                              />
                            </label>
                            <button className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-bold text-white" type="submit">
                              Void invoice
                            </button>
                          </form>
                        </details>
                      ) : null}
                      {canArchiveInvoice(auth.profile.role, invoice) ? (
                        <form action={archiveInvoiceAction}>
                          <input name="id" type="hidden" value={invoice.id} />
                          <button
                            className="rounded-md border border-primary-dark/15 bg-white px-3 py-1.5 text-xs font-bold text-primary-dark/70 hover:bg-primary-dark/5"
                            type="submit"
                          >
                            Archive
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </div>

                  {canEditInvoice(auth.profile.role, invoice) ? (
                    <details className="mt-3 rounded-md border border-primary-dark/10">
                      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 text-sm font-bold text-primary-dark transition hover:text-primary-blue [&::-webkit-details-marker]:hidden">
                        <span>Edit invoice</span>
                        <span className="text-xs uppercase tracking-[0.12em] text-primary-dark/45">Open</span>
                      </summary>
                      <form
                        action={updateInvoiceAction}
                        className="grid gap-3 border-t border-primary-dark/10 p-3 md:grid-cols-3"
                      >
                        <input name="id" type="hidden" value={invoice.id} />
                        <label className={OPS_LABEL_CLASS}>
                          Invoice number
                          <input className={OPS_INPUT_CLASS} defaultValue={invoice.invoice_number} name="invoice_number" required />
                        </label>
                        <label className={OPS_LABEL_CLASS}>
                          Client name
                          <input className={OPS_INPUT_CLASS} defaultValue={invoice.client_name} name="client_name" required />
                        </label>
                        <label className={OPS_LABEL_CLASS}>
                          TPIN
                          <input className={OPS_INPUT_CLASS} defaultValue={invoice.tpin ?? ""} name="tpin" />
                        </label>
                        <label className={OPS_LABEL_CLASS}>
                          Issued date
                          <input className={OPS_INPUT_CLASS} defaultValue={invoice.issued_at} name="issued_at" required type="date" />
                        </label>
                        <label className={OPS_LABEL_CLASS}>
                          Subtotal (ZMW)
                          <input className={OPS_INPUT_CLASS} defaultValue={String(invoice.subtotal)} min="0" name="subtotal" required step="0.01" type="number" />
                        </label>
                        <div className="flex items-end md:col-span-3">
                          <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
                            Save invoice
                          </button>
                        </div>
                      </form>
                    </details>
                  ) : null}
                  <dl className="mt-4 grid gap-3 min-[520px]:grid-cols-3">
                    <InvoiceValueMetric label="Subtotal" value={formatZmw(invoice.subtotal)} />
                    <InvoiceValueMetric label="VAT" value={formatZmw(invoice.vat_amount)} />
                    <InvoiceValueMetric label="Total" value={formatZmw(invoice.total_amount)} />
                  </dl>
                  <OpsRecordActivityPanel
                    canManage={canManage}
                    sourceId={invoice.id}
                    sourceTable="invoices"
                  />
                </article>
              ))}
            </div>
          ) : (
            <OpsEmptyState
              icon={FileText}
              title={
                hasActiveListFilter
                  ? "No invoices match these filters"
                  : "No invoices yet"
              }
              description={
                hasActiveListFilter
                  ? "Try clearing the search or switching the status filter — drafts, sent, and paid invoices sit in different buckets."
                  : "The first client invoice will appear here once Finance creates one against a Bill of Quantities or Interim Payment Certificate."
              }
              actions={
                hasActiveListFilter
                  ? [{ href: "/ops/invoices", label: "Clear filters" }]
                  : canManage
                    ? [{ href: createInvoiceHref, label: "Create the first invoice" }]
                    : [{ href: "/ops/boq", label: "Open Bill of Quantities", variant: "secondary" }]
              }
            />
          )}
          <OpsPaginationControls
            basePath="/ops/invoices"
            filters={[
              {
                label: "Status",
                name: "status",
                options: [],
                value: status,
              },
            ]}
            pagination={invoicePage.pagination}
            query={listState.query}
            resultLabel="invoices"
          />
        </div>
      </OpsDashboardPanel>
    </div>
  );
}
