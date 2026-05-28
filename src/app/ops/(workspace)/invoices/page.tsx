import { Check, FileText, Plus, Send } from "lucide-react";
import { notFound } from "next/navigation";
import { OpsConfirmSubmitButton } from "@/components/ops/OpsConfirmSubmitButton";
import {
  createInvoiceAction,
  markInvoicePaidAction,
  sendInvoiceAction,
} from "@/lib/ops/invoice-actions";
import { fetchOpsInvoices, type OpsInvoice } from "@/lib/ops/invoices";
import { requireOpsUser } from "@/lib/ops/auth";
import { fetchOpsBoqOptions } from "@/lib/ops/boq";
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-ZM", {
    dateStyle: "medium",
    timeZone: "Africa/Lusaka",
  }).format(new Date(`${value}T00:00:00+02:00`));
}

export default async function OpsInvoicesPage({ searchParams }: PageProps) {
  const [params, auth] = await Promise.all([searchParams ?? Promise.resolve({}), requireOpsUser()]);

  if (!canAccessOpsHref(auth.profile.role, "/ops/invoices")) {
    notFound();
  }

  const [invoices, siteOptions, boqOptions] = await Promise.all([
    fetchOpsInvoices(),
    fetchActiveSiteOptions(),
    fetchOpsBoqOptions(),
  ]);
  const canManage = canManageOps(auth.profile.role);
  const notice = invoiceNotice(params);
  const draftInvoices = invoices.filter((invoice) => invoice.status === "draft").length;
  const totalOutstanding = invoices
    .filter((invoice) => invoice.status !== "paid")
    .reduce((sum, invoice) => sum + invoice.total_amount, 0);
  const paidTotal = invoices
    .filter((invoice) => invoice.status === "paid")
    .reduce((sum, invoice) => sum + invoice.total_amount, 0);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="rounded-lg border border-primary-dark/10 bg-white p-5 md:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-blue">
              Pymble Invoices
            </p>
            <h1 className="mt-2 font-heading text-3xl font-bold text-primary-dark">
              Invoice register
            </h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-primary-dark/68">
              Create VAT invoices, link BOQs, and track draft, sent, and paid status.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-md border border-primary-dark/10 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-dark/45">
                Drafts
              </p>
              <p className="mt-1 font-heading text-2xl font-bold text-primary-dark">
                {draftInvoices}
              </p>
            </div>
            <div className="rounded-md border border-primary-dark/10 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-dark/45">
                Outstanding
              </p>
              <p className="mt-1 font-heading text-2xl font-bold text-primary-dark">
                {formatZmw(totalOutstanding)}
              </p>
            </div>
            <div className="rounded-md border border-primary-dark/10 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-dark/45">
                Paid
              </p>
              <p className="mt-1 font-heading text-2xl font-bold text-primary-dark">
                {formatZmw(paidTotal)}
              </p>
            </div>
          </div>
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

      {canManage ? (
        <section className="rounded-lg border border-primary-dark/10 bg-white p-5">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-md bg-primary-blue text-white">
              <Plus className="size-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="font-heading text-xl font-bold text-primary-dark">Create invoice</h2>
              <p className="text-sm text-primary-dark/60">
                VAT is calculated from the Pymble organization profile.
              </p>
            </div>
          </div>
          {siteOptions.length === 0 ? (
            <div className="rounded-md border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
              Add at least one site before creating invoices.
            </div>
          ) : (
            <form
              action={createInvoiceAction}
              className="grid gap-4 min-[520px]:grid-cols-2 lg:grid-cols-6"
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
              <div className="flex items-end min-[520px]:col-span-2 lg:col-span-2">
                <button
                  className={`${OPS_PRIMARY_BUTTON_CLASS} w-full`}
                  type="submit"
                >
                  <FileText className="size-4" aria-hidden="true" />
                  Create invoice
                </button>
              </div>
            </form>
          )}
        </section>
      ) : null}

      <section className="rounded-lg border border-primary-dark/10 bg-white">
        <div className="border-b border-primary-dark/10 p-5">
          <h2 className="font-heading text-xl font-bold text-primary-dark">Invoice stream</h2>
        </div>
        {invoices.length > 0 ? (
          <div className="divide-y divide-primary-dark/10">
            {invoices.map((invoice) => (
              <div className="p-5" key={invoice.id}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="font-heading text-lg font-bold text-primary-dark">
                      {invoice.invoice_number}
                    </p>
                    <p className="mt-1 text-sm text-primary-dark/60">
                      {invoice.client_name} - {invoice.site?.code ?? "Site code unavailable"} -{" "}
                      {formatDate(invoice.issued_at)}
                    </p>
                    <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-primary-dark/45">
                      {invoice.boq?.title ?? "Invoice without BOQ link"}{" "}
                      {invoice.tpin ? `- TPIN ${invoice.tpin}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${statusClass(invoice.status)}`}
                    >
                      {invoice.status}
                    </span>
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
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div className="rounded-md border border-primary-dark/10 px-3 py-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary-dark/45">
                      Subtotal
                    </p>
                    <p className="mt-1 font-bold text-primary-dark">{formatZmw(invoice.subtotal)}</p>
                  </div>
                  <div className="rounded-md border border-primary-dark/10 px-3 py-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary-dark/45">
                      VAT
                    </p>
                    <p className="mt-1 font-bold text-primary-dark">{formatZmw(invoice.vat_amount)}</p>
                  </div>
                  <div className="rounded-md border border-primary-dark/10 px-3 py-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary-dark/45">
                      Total
                    </p>
                    <p className="mt-1 font-bold text-primary-dark">
                      {formatZmw(invoice.total_amount)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex min-h-56 flex-col items-center justify-center gap-3 p-8 text-center">
            <FileText className="size-10 text-primary-blue" aria-hidden="true" />
            <div>
              <p className="font-heading text-xl font-bold text-primary-dark">
                No invoices yet
              </p>
              <p className="mt-2 max-w-lg text-sm leading-6 text-primary-dark/60">
                Invoices will appear here after the first site invoice is created.
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
