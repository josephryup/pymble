import {
  Archive,
  CheckCircle2,
  FileSignature,
  FileText,
  HardHat,
  Plus,
  ReceiptText,
  Send,
  Trash2,
  XCircle,
} from "lucide-react";
import { notFound } from "next/navigation";
import { OpsInlineEmpty } from "@/components/ops/OpsInlineEmpty";
import { OpsConfirmSubmitButton } from "@/components/ops/OpsConfirmSubmitButton";
import { OpsEmptyState } from "@/components/ops/OpsEmptyState";
import { OpsKpiCard } from "@/components/ops/OpsKpiCard";
import { OpsListControls, OpsPaginationControls } from "@/components/ops/OpsListControls";
import { OpsPageHeader } from "@/components/ops/OpsPageHeader";
import { fetchOpsModuleAccessOverrides } from "@/lib/ops/module-access";
import { requireOpsUser } from "@/lib/ops/auth";
import { parseOpsListState } from "@/lib/ops/listing";
import { canAccessOpsHref } from "@/lib/ops/permissions";
import {
  addQuotationLineAction,
  archiveQuotationAction,
  createQuotationAction,
  deleteQuotationLineAction,
  setQuotationStatusAction,
} from "@/lib/ops/quotation-actions";
import { convertQuotationToProjectAction } from "@/lib/ops/quotation-conversion-actions";
import { createInvoiceFromQuotationAction } from "@/lib/ops/invoice-actions";
import {
  canArchiveOpsQuotation,
  canEditOpsQuotation,
  canManageOpsQuotations,
  canViewOpsQuotations,
} from "@/lib/ops/quotation-permissions";
import {
  fetchOpsQuotationStats,
  fetchPaginatedOpsQuotations,
  type OpsQuotation,
} from "@/lib/ops/quotations";
import type { OpsQuotationStatus, OpsUserRole } from "@/lib/ops/types";
import { formatOpsDate } from "@/lib/ops/format";
import {
  firstParam,
  formatZmw,
  noticeFromParams,
  OPS_DANGER_BUTTON_CLASS,
  OPS_FOCUS_CLASS,
  OPS_INPUT_CLASS,
  OPS_LABEL_CLASS,
  OPS_PRIMARY_BUTTON_CLASS,
  OPS_SECONDARY_BUTTON_CLASS,
  OPS_TABLE_SCROLL_CLASS,
  opsStatusBadgeClass,
  type OpsSearchParams,
} from "@/lib/ops/ui";

export const dynamic = "force-dynamic";

type PageProps = { searchParams?: Promise<OpsSearchParams> };

const STATUS_OPTIONS: Array<{ label: string; value: OpsQuotationStatus | "" }> = [
  { label: "All statuses", value: "" },
  { label: "Draft", value: "draft" },
  { label: "Sent", value: "sent" },
  { label: "Accepted", value: "accepted" },
  { label: "Declined", value: "declined" },
  { label: "Expired", value: "expired" },
];

function statusFromParam(value: string | undefined): OpsQuotationStatus | null {
  return STATUS_OPTIONS.some((option) => option.value === value && option.value !== "")
    ? (value as OpsQuotationStatus)
    : null;
}

function quotationNotice(params: OpsSearchParams) {
  const created = noticeFromParams(params, "quotation", "Quotation created.");
  if (created) return created;

  const updated = firstParam(params.updated);
  const messages: Record<string, string> = {
    accepted: "Quotation marked accepted.",
    archived: "Quotation archived.",
    declined: "Quotation marked declined.",
    draft: "Quotation reopened as a draft.",
    expired: "Quotation marked expired.",
    line: "Line added to the quotation.",
    line_removed: "Line removed from the quotation.",
    sent: "Quotation marked as sent to the client.",
  };

  return updated && messages[updated]
    ? { tone: "success" as const, message: messages[updated] }
    : null;
}

/** Status moves offered for the quotation's current state. */
function nextStatuses(status: OpsQuotationStatus): Array<{
  status: OpsQuotationStatus;
  label: string;
  icon: typeof Send;
  danger?: boolean;
}> {
  if (status === "draft") {
    return [{ status: "sent", label: "Mark as sent", icon: Send }];
  }
  if (status === "sent") {
    return [
      { status: "accepted", label: "Accepted", icon: CheckCircle2 },
      { status: "declined", label: "Declined", icon: XCircle, danger: true },
      { status: "expired", label: "Expired", icon: XCircle, danger: true },
    ];
  }
  if (status === "declined" || status === "expired") {
    return [{ status: "draft", label: "Reopen as draft", icon: FileText }];
  }
  return [];
}

function QuotationCard({
  quotation,
  role,
}: {
  quotation: OpsQuotation;
  role: OpsUserRole;
}) {
  const canEdit = canEditOpsQuotation(role, quotation);
  const canManage = canManageOpsQuotations(role);
  const moves = canManage ? nextStatuses(quotation.status) : [];

  return (
    <article className="rounded-lg border border-border bg-card" id={`quotation-${quotation.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-heading text-lg font-bold text-foreground">
              {quotation.quotation_number}
            </h3>
            <span className={opsStatusBadgeClass(quotation.status)}>{quotation.status}</span>
          </div>
          <p className="mt-2 font-bold text-foreground">{quotation.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {quotation.client_name}
            {quotation.client_contact ? ` · ${quotation.client_contact}` : ""} · issued{" "}
            {formatOpsDate(quotation.issued_on, "—")}
            {quotation.valid_until ? ` · valid to ${formatOpsDate(quotation.valid_until, "—")}` : ""}
          </p>
        </div>
        <div className="grid gap-2 min-[520px]:grid-cols-3 lg:min-w-80 lg:grid-cols-3">
          <div className="rounded-md border border-border px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Subtotal
            </p>
            <p className="mt-1 font-bold text-foreground">{formatZmw(quotation.subtotal)}</p>
          </div>
          <div className="rounded-md border border-border px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              VAT {quotation.vat_rate}%
            </p>
            <p className="mt-1 font-bold text-foreground">{formatZmw(quotation.vat_amount)}</p>
          </div>
          <div className="rounded-md border border-primary-blue/25 bg-primary-blue/5 px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Total
            </p>
            <p className="mt-1 font-bold text-foreground">{formatZmw(quotation.total_amount)}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/30 px-5 py-3">
        <a
          className={OPS_SECONDARY_BUTTON_CLASS}
          href={`/api/ops/pdf/quotation/${quotation.id}`}
        >
          <FileText className="size-4" aria-hidden="true" />
          Download PDF
        </a>
        {moves.map((move) => (
          <form action={setQuotationStatusAction} key={move.status}>
            <input name="quotation_id" type="hidden" value={quotation.id} />
            <input name="status" type="hidden" value={move.status} />
            <OpsConfirmSubmitButton
              className={move.danger ? OPS_DANGER_BUTTON_CLASS : OPS_SECONDARY_BUTTON_CLASS}
              confirmText={`Confirm: ${move.label}`}
            >
              <move.icon className="size-4" aria-hidden="true" />
              {move.label}
            </OpsConfirmSubmitButton>
          </form>
        ))}
        {/* Win the job → create the project (audit D10). Until this existed,
            an accepted quotation was a dead end: no customer record, no site,
            and therefore nothing for an invoice to point at, which is why every
            project reports revenue = 0. */}
        {canManage && quotation.status === "accepted" && !quotation.site_id ? (
          <details className="w-full rounded-md border border-emerald-300 bg-emerald-50/60 dark:border-emerald-900/50 dark:bg-emerald-950/20">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-bold text-emerald-800 dark:text-emerald-200 [&::-webkit-details-marker]:hidden">
              <HardHat className="size-4" aria-hidden="true" />
              Convert to a project
            </summary>
            <form
              action={convertQuotationToProjectAction}
              className="grid gap-3 border-t border-emerald-200 p-3 min-[640px]:grid-cols-3 dark:border-emerald-900/50"
            >
              <input name="quotation_id" type="hidden" value={quotation.id} />
              <label className={OPS_LABEL_CLASS}>
                Project code
                <input className={OPS_INPUT_CLASS} name="site_code" required />
              </label>
              <label className={OPS_LABEL_CLASS}>
                Project name
                <input
                  className={OPS_INPUT_CLASS}
                  defaultValue={quotation.title}
                  name="site_name"
                  required
                />
              </label>
              <label className={OPS_LABEL_CLASS}>
                Location
                <input className={OPS_INPUT_CLASS} name="location" />
              </label>
              <p className="text-xs leading-5 text-muted-foreground min-[640px]:col-span-3">
                Creates the project and the customer record (reusing{" "}
                {quotation.client_name || "the client"} if they already exist), and links
                quotation, customer and project together.
              </p>
              <div className="min-[640px]:col-span-3">
                <OpsConfirmSubmitButton
                  className={OPS_PRIMARY_BUTTON_CLASS}
                  confirmText="Confirm — create the project"
                >
                  <HardHat className="size-4" aria-hidden="true" />
                  Create project
                </OpsConfirmSubmitButton>
              </div>
            </form>
          </details>
        ) : null}
        {/* Bill the job. The second of the three ways an invoice comes into
            being (R7) — the quotation's own VAT rate is used, because the
            client accepted a specific figure and re-deriving it from today's
            organisation setting would bill a different number. */}
        {canManage && quotation.status === "accepted" ? (
          <form action={createInvoiceFromQuotationAction}>
            <input name="quotation_id" type="hidden" value={quotation.id} />
            <OpsConfirmSubmitButton
              className={OPS_SECONDARY_BUTTON_CLASS}
              confirmText="Confirm — raise a draft invoice"
            >
              <ReceiptText className="size-4" aria-hidden="true" />
              Raise invoice
            </OpsConfirmSubmitButton>
          </form>
        ) : null}
        {canArchiveOpsQuotation(role) && !quotation.archived_at ? (
          <form action={archiveQuotationAction}>
            <input name="quotation_id" type="hidden" value={quotation.id} />
            <OpsConfirmSubmitButton
              className={OPS_DANGER_BUTTON_CLASS}
              confirmText="Confirm archive"
            >
              <Archive className="size-4" aria-hidden="true" />
              Archive
            </OpsConfirmSubmitButton>
          </form>
        ) : null}
      </div>

      {quotation.items.length > 0 ? (
        <div className={OPS_TABLE_SCROLL_CLASS} tabIndex={0}>
          <table className="min-w-full divide-y divide-border text-sm">
            <caption className="sr-only">Priced lines on {quotation.quotation_number}</caption>
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-[0.12em] text-muted-foreground">
              <tr>
                <th className="px-5 py-3" scope="col">#</th>
                <th className="px-5 py-3" scope="col">Description</th>
                <th className="px-5 py-3" scope="col">Qty</th>
                <th className="px-5 py-3" scope="col">Unit</th>
                <th className="px-5 py-3" scope="col">Rate</th>
                <th className="px-5 py-3" scope="col">Total</th>
                {canEdit ? <th className="px-5 py-3" scope="col">Remove</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {quotation.items.map((item) => (
                <tr key={item.id}>
                  <td className="px-5 py-3 text-muted-foreground">{item.line_number}</td>
                  <td className="px-5 py-3 font-semibold text-foreground">
                    {item.description}
                    {item.specification ? (
                      <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                        {item.specification}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-5 py-3 text-foreground/70">
                    {item.quantity.toLocaleString("en-ZM", { maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-5 py-3 text-foreground/70">{item.unit}</td>
                  <td className="px-5 py-3 text-foreground/70">{formatZmw(item.unit_rate)}</td>
                  <td className="px-5 py-3 font-semibold text-foreground">
                    {formatZmw(item.line_total)}
                  </td>
                  {canEdit ? (
                    <td className="px-5 py-3">
                      <form action={deleteQuotationLineAction}>
                        <input name="quotation_id" type="hidden" value={quotation.id} />
                        <input name="line_id" type="hidden" value={item.id} />
                        <OpsConfirmSubmitButton
                          className={OPS_DANGER_BUTTON_CLASS}
                          confirmText="Confirm remove"
                        >
                          <Trash2 className="size-3.5" aria-hidden="true" />
                          Remove
                        </OpsConfirmSubmitButton>
                      </form>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <OpsInlineEmpty>No priced lines yet — the PDF will show an empty table until you add some.</OpsInlineEmpty>
      )}

      {canEdit ? (
        <details className="border-t border-border">
          <summary
            className={`flex min-h-12 cursor-pointer list-none items-center gap-2 px-5 py-3 text-sm font-bold text-foreground transition hover:text-primary-blue [&::-webkit-details-marker]:hidden ${OPS_FOCUS_CLASS}`}
          >
            <Plus className="size-4" aria-hidden="true" />
            Add a priced line
          </summary>
          <form
            action={addQuotationLineAction}
            className="grid gap-3 border-t border-border p-5 md:grid-cols-2 lg:grid-cols-4"
          >
            <input name="quotation_id" type="hidden" value={quotation.id} />
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
              Description
              <input className={OPS_INPUT_CLASS} name="description" required />
            </label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
              Specification
              <input className={OPS_INPUT_CLASS} name="specification" />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Unit
              <input className={OPS_INPUT_CLASS} defaultValue="each" name="unit" required />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Quantity
              <input
                className={OPS_INPUT_CLASS}
                defaultValue="1"
                min="0"
                name="quantity"
                required
                step="0.01"
                type="number"
              />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Unit rate
              <input
                className={OPS_INPUT_CLASS}
                min="0"
                name="unit_rate"
                required
                step="0.01"
                type="number"
              />
            </label>
            <div className="flex items-end lg:col-span-4">
              <button className={`${OPS_PRIMARY_BUTTON_CLASS} w-full sm:w-auto`} type="submit">
                <Plus className="size-4" aria-hidden="true" />
                Add line
              </button>
            </div>
          </form>
        </details>
      ) : null}
    </article>
  );
}

export default async function OpsQuotationsPage({ searchParams }: PageProps) {
  const [params, auth] = await Promise.all([
    searchParams ?? Promise.resolve({} as OpsSearchParams),
    requireOpsUser(),
  ]);

  if (
    !canAccessOpsHref(auth.profile.role, "/ops/quotations", await fetchOpsModuleAccessOverrides()) ||
    !canViewOpsQuotations(auth.profile.role)
  ) {
    notFound();
  }

  const listState = parseOpsListState(params, { defaultPageSize: 5 });
  const status = statusFromParam(firstParam(params.status));
  const [page, stats] = await Promise.all([
    fetchPaginatedOpsQuotations({ listState, status }),
    fetchOpsQuotationStats(),
  ]);

  const notice = quotationNotice(params);
  const canManage = canManageOpsQuotations(auth.profile.role);

  return (
    <div className="w-full max-w-none space-y-6">
      <OpsPageHeader
        eyebrow="Commercial"
        title="Quotations"
        description="Priced client quotations with VAT and a branded PDF. Standalone documents — they are not linked to the customer register or invoices."
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
          href="/ops/quotations?status=draft"
          icon={FileSignature}
          label="Drafts"
          value={stats.draft.toLocaleString("en-ZM")}
        />
        <OpsKpiCard
          href="/ops/quotations?status=sent"
          icon={Send}
          label="Awaiting client"
          tone={stats.sent > 0 ? "warn" : "default"}
          value={stats.sent.toLocaleString("en-ZM")}
        />
        <OpsKpiCard
          href="/ops/quotations?status=accepted"
          icon={CheckCircle2}
          label="Accepted"
          tone={stats.accepted > 0 ? "good" : "default"}
          value={stats.accepted.toLocaleString("en-ZM")}
        />
        <OpsKpiCard
          hint={stats.openValue > 0 ? `${formatZmw(stats.openValue)} still open` : undefined}
          href="/ops/quotations?status=accepted"
          icon={CheckCircle2}
          label="Accepted value"
          value={formatZmw(stats.acceptedValue)}
        />
      </section>

      {canManage ? (
        <section className="rounded-lg border border-border bg-card p-5">
          <div className="mb-5 flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-md bg-primary-blue text-white">
              <Plus className="size-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-heading text-xl font-bold text-foreground">New quotation</h2>
              <p className="text-sm text-muted-foreground">
                Capture the client and terms here, then add priced lines below. The client details
                are stored on the quotation as quoted.
              </p>
            </div>
          </div>
          <form action={createQuotationAction} className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
              Quotation title
              <input
                className={OPS_INPUT_CLASS}
                name="title"
                placeholder="e.g. Kabwe depot slab construction"
                required
              />
            </label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
              Client name
              <input className={OPS_INPUT_CLASS} name="client_name" required />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Contact person
              <input className={OPS_INPUT_CLASS} name="client_contact" />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Client email
              <input className={OPS_INPUT_CLASS} name="client_email" type="email" />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Client phone
              <input className={OPS_INPUT_CLASS} name="client_phone" />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Client TPIN
              <input className={OPS_INPUT_CLASS} name="client_tpin" />
            </label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
              Client address
              <input className={OPS_INPUT_CLASS} name="client_address" />
            </label>
            <label className={OPS_LABEL_CLASS}>
              VAT rate (%)
              <input
                className={OPS_INPUT_CLASS}
                defaultValue="16"
                max="100"
                min="0"
                name="vat_rate"
                step="0.01"
                type="number"
              />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Valid until
              <input className={OPS_INPUT_CLASS} name="valid_until" type="date" />
            </label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-4`}>
              Scope summary
              <textarea className={OPS_INPUT_CLASS} name="scope_summary" rows={2} />
            </label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
              Terms
              <textarea className={OPS_INPUT_CLASS} name="terms" rows={2} />
            </label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
              Internal notes
              <textarea className={OPS_INPUT_CLASS} name="notes" rows={2} />
            </label>
            <div className="flex items-end lg:col-span-4">
              <button className={`${OPS_PRIMARY_BUTTON_CLASS} w-full sm:w-auto`} type="submit">
                <FileSignature className="size-4" aria-hidden="true" />
                Create quotation
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="space-y-4">
        <OpsListControls
          action="/ops/quotations"
          filters={[
            {
              label: "Status",
              name: "status",
              options: STATUS_OPTIONS,
              value: status ?? "",
            },
          ]}
          placeholder="Search by number, title, or client"
          query={listState.query}
          resultLabel="quotations"
        />

        {page.items.length > 0 ? (
          <>
            {page.items.map((quotation) => (
              <QuotationCard key={quotation.id} quotation={quotation} role={auth.profile.role} />
            ))}
            <OpsPaginationControls
              basePath="/ops/quotations"
              filters={[
                {
                  label: "Status",
                  name: "status",
                  options: STATUS_OPTIONS,
                  value: status ?? "",
                },
              ]}
              pagination={page.pagination}
              query={listState.query}
              resultLabel="quotations"
            />
          </>
        ) : (
          <OpsEmptyState
            icon={FileSignature}
            title={listState.query || status ? "No matching quotations" : "No quotations yet"}
            description={
              listState.query || status
                ? "Adjust or clear the filters to widen the list."
                : "Create a quotation above to prepare a priced offer for a client."
            }
          />
        )}
      </section>
    </div>
  );
}
