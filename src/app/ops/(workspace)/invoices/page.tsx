import Link from "next/link";
import {
  Banknote,
  Check,
  Clock3,
  FileText,
  Plus,
  ReceiptText,
  Send,
  Wallet,
} from "lucide-react";
import { notFound } from "next/navigation";
import { OpsConfirmSubmitButton } from "@/components/ops/OpsConfirmSubmitButton";
import { OpsDashboardPanel } from "@/components/ops/OpsDashboardPanel";
import { OpsKpiCard } from "@/components/ops/OpsKpiCard";
import { OpsListControls, OpsPaginationControls } from "@/components/ops/OpsListControls";
import { OpsRecordActivityPanel } from "@/components/ops/OpsRecordActivityPanel";
import {
  createInvoiceAction,
  markInvoicePaidAction,
  sendInvoiceAction,
} from "@/lib/ops/invoice-actions";
import {
  fetchOpsInvoiceStatusCounts,
  fetchPaginatedOpsInvoices,
  type OpsInvoice,
} from "@/lib/ops/invoices";
import { requireOpsUser } from "@/lib/ops/auth";
import { fetchOpsBoqOptions } from "@/lib/ops/boq";
import { parseOpsListState } from "@/lib/ops/listing";
import { canAccessOpsHref, canManageOps } from "@/lib/ops/permissions";
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
  const [invoicePage, siteOptions, boqOptions, invoiceStatusCounts] = await Promise.all([
    fetchPaginatedOpsInvoices({
      listState,
      query: listState.query,
      status: status || undefined,
    }),
    fetchActiveSiteOptions(),
    fetchOpsBoqOptions(),
    fetchOpsInvoiceStatusCounts(),
  ]);
  const invoices = invoicePage.items;
  const hasActiveListFilter = listState.query.length > 0 || Boolean(status);
  const canManage = canManageOps(auth.profile.role);
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
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-blue">
            Commercial / Finance
          </p>
          <h1 className="mt-2 font-heading text-3xl font-bold text-primary-dark">
            Invoice register
          </h1>
          <p className="mt-3 max-w-3xl text-base leading-7 text-primary-dark/68">
            VAT invoices, BOQ links, client TPIN records, receivables status, and invoice evidence.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/boq">
            <FileText className="size-4" aria-hidden="true" />
            BOQ
          </Link>
          {canManage ? (
            <a className={OPS_PRIMARY_BUTTON_CLASS} href={createInvoiceHref}>
              <Plus className="size-4" aria-hidden="true" />
              New invoice
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

      <section className="grid gap-4 min-[720px]:grid-cols-4">
        <OpsKpiCard
          href="/ops/invoices"
          icon={ReceiptText}
          label="Total invoices"
          trend="Register"
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
          trend="Receivables"
          value={invoiceStatusCounts.sent.toLocaleString("en-ZM")}
        />
        <OpsKpiCard
          href="/ops/invoices?status=paid"
          icon={Banknote}
          label="Paid invoices"
          tone="good"
          trend="Collected"
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
                  VAT invoice intake for site work, BOQ-linked billing, and client TPIN records.
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
                      {canManage && invoice.status === "draft" ? (
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
                      {canManage && invoice.status === "sent" ? (
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
                    </div>
                  </div>
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
            <div className="flex min-h-56 flex-col items-center justify-center gap-3 p-8 text-center">
              <FileText className="size-10 text-primary-blue" aria-hidden="true" />
              <div>
                <p className="font-heading text-xl font-bold text-primary-dark">
                  {hasActiveListFilter ? "No matching invoices" : "No invoices yet"}
                </p>
                <p className="mt-2 max-w-lg text-sm leading-6 text-primary-dark/60">
                  {hasActiveListFilter
                    ? "Adjust the search or status filter to widen the invoice register."
                    : "Invoices will appear here after the first site invoice is created."}
                </p>
              </div>
            </div>
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
