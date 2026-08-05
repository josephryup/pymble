import { BadgeDollarSign, Banknote, HardHat, Plus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OpsEmptyState } from "@/components/ops/OpsEmptyState";
import { OpsPageHeader } from "@/components/ops/OpsPageHeader";
import { OpsRealtimeRefresh } from "@/components/ops/OpsRealtimeRefresh";
import { fetchOpsModuleAccessOverrides } from "@/lib/ops/module-access";
import { requireOpsUser } from "@/lib/ops/auth";
import { formatOpsDate } from "@/lib/ops/format";
import { canAccessOpsHref } from "@/lib/ops/permissions";
import {
  createSubcontractorAction,
  decideSubcontractorPaymentAction,
} from "@/lib/ops/subcontractor-actions";
import {
  canApproveSubcontractorPayment,
  canManageSubcontractor,
  canViewSubcontractors,
} from "@/lib/ops/subcontractor-permissions";
import {
  fetchOpsPendingSubcontractorPayments,
  fetchOpsSubcontractors,
} from "@/lib/ops/subcontractors";
import {
  firstParam,
  formatZmw,
  noticeFromParams,
  OPS_INPUT_CLASS,
  OPS_LABEL_CLASS,
  OPS_PRIMARY_BUTTON_CLASS,
  OPS_SECONDARY_BUTTON_CLASS,
  type OpsSearchParams,
  OPS_NOTICE_SUCCESS_CLASS,
  OPS_NOTICE_ERROR_CLASS,
  opsStatusBadgeClass,
} from "@/lib/ops/ui";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<OpsSearchParams>;
};

export default async function OpsSubcontractorsPage({ searchParams }: PageProps) {
  const search = (await (searchParams ?? Promise.resolve({} as OpsSearchParams))) ?? {};
  const { profile } = await requireOpsUser();
  if (!canAccessOpsHref(profile.role, "/ops/subcontractors", await fetchOpsModuleAccessOverrides())) notFound();
  if (!canViewSubcontractors(profile.role)) notFound();

  const canDecidePayments = canApproveSubcontractorPayment(profile.role);
  const [subs, pendingPayments] = await Promise.all([
    fetchOpsSubcontractors(),
    canDecidePayments
      ? fetchOpsPendingSubcontractorPayments()
      : Promise.resolve([]),
  ]);
  const canCreate = canManageSubcontractor(profile.role);
  const notice = noticeFromParams(search, "subcontractor", "Subcontractor added.");
  const error = firstParam(search.error);
  const pendingTotal = pendingPayments.reduce((sum, payment) => sum + payment.amount, 0);

  return (
    <div className="w-full max-w-none space-y-6">
      <OpsRealtimeRefresh
        tables={["subcontractors", "subcontractor_assignments", "subcontractor_payments"]}
      />
      <OpsPageHeader
        eyebrow="Subcontractors"
        title="Subcontractor register"
        description="Onboard subcontractor companies and general (individual) subcontractors, capture KYC details, allocate them to project tasks, and track interim and retention payments."
      />

      {error ? (
        <div className={OPS_NOTICE_ERROR_CLASS} role="alert">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className={OPS_NOTICE_SUCCESS_CLASS}>
          {notice.message}
        </div>
      ) : null}

      {canDecidePayments ? (
        <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary-blue/10 text-primary-blue">
                <BadgeDollarSign className="size-5" aria-hidden="true" />
              </span>
              <div>
                <h2 className="font-heading text-lg font-bold text-foreground">
                  Payments awaiting Finance
                </h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Every pending subcontractor payment across the register — approve,
                  mark paid, or reject here without opening each subcontractor.
                </p>
              </div>
            </div>
            {pendingPayments.length > 0 ? (
              <div className="text-right">
                <p className="font-heading text-2xl font-bold tabular-nums text-foreground">
                  {formatZmw(pendingTotal)}
                </p>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  {pendingPayments.length} pending
                </p>
              </div>
            ) : null}
          </div>

          {pendingPayments.length === 0 ? (
            <p className="mt-4 rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No subcontractor payments are waiting. New requests land here the moment
              they are raised.
            </p>
          ) : (
            <ul className="mt-4 grid gap-3">
              {pendingPayments.map((payment) => (
                <li
                  key={payment.id}
                  className="rounded-md border border-border p-4"
                  id={`payment-${payment.id}`}
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          className="font-heading text-base font-bold text-foreground hover:underline"
                          href={`/ops/subcontractors/${payment.subcontractor_id}#payment-${payment.id}`}
                        >
                          {payment.company_name}
                        </Link>
                        <span className={opsStatusBadgeClass(payment.payment_type, "info")}>
                          {payment.payment_type.replace(/_/g, " ")}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {payment.trade_specialty || "—"}
                        {payment.site ? ` · ${payment.site.code} (${payment.site.name})` : ""}
                        {payment.requested_by_name
                          ? ` · requested by ${payment.requested_by_name}`
                          : ""}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Raised {formatOpsDate(payment.created_at)}
                        {payment.scheduled_for
                          ? ` · scheduled ${formatOpsDate(payment.scheduled_for)}`
                          : ""}
                        {payment.reference ? ` · ref ${payment.reference}` : ""}
                        {payment.retention_held > 0
                          ? ` · retention ${formatZmw(payment.retention_held)}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-stretch gap-2 lg:w-64">
                      <p className="text-right font-heading text-xl font-bold tabular-nums text-foreground">
                        {formatZmw(payment.amount)}
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <form action={decideSubcontractorPaymentAction}>
                          <input name="id" type="hidden" value={payment.id} />
                          <input name="decision" type="hidden" value="approved" />
                          <button
                            className={`${OPS_SECONDARY_BUTTON_CLASS} w-full`}
                            type="submit"
                          >
                            Approve
                          </button>
                        </form>
                        <form action={decideSubcontractorPaymentAction}>
                          <input name="id" type="hidden" value={payment.id} />
                          <input name="decision" type="hidden" value="paid" />
                          <button
                            className={`${OPS_PRIMARY_BUTTON_CLASS} w-full`}
                            type="submit"
                          >
                            <Banknote className="size-4" aria-hidden="true" />
                            Mark paid
                          </button>
                        </form>
                      </div>
                      <details className="rounded-md border border-red-300/40 bg-card">
                        <summary className="flex min-h-10 cursor-pointer list-none items-center justify-center gap-2 px-3 py-2 text-xs font-bold text-red-700 transition hover:text-red-800 [&::-webkit-details-marker]:hidden">
                          Reject with reason
                        </summary>
                        <form
                          action={decideSubcontractorPaymentAction}
                          className="grid gap-2 border-t border-red-200 p-3"
                        >
                          <input name="id" type="hidden" value={payment.id} />
                          <input name="decision" type="hidden" value="rejected" />
                          <textarea
                            className={`${OPS_INPUT_CLASS} min-h-16`}
                            name="notes"
                            placeholder="Reason sent back to the requester"
                          />
                          <button
                            className={`${OPS_SECONDARY_BUTTON_CLASS} w-full`}
                            type="submit"
                          >
                            Send rejection
                          </button>
                        </form>
                      </details>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {canCreate ? (
        <details className="rounded-lg border border-border bg-card">
          <summary className="flex cursor-pointer items-center gap-2 px-5 py-4 text-sm font-semibold text-foreground">
            <Plus className="size-4" aria-hidden="true" />
            Add a subcontractor
          </summary>
          <form
            action={createSubcontractorAction}
            className="grid gap-3 border-t border-border p-5 md:grid-cols-3"
          >
            <label className={OPS_LABEL_CLASS}>
              Type
              <select className={OPS_INPUT_CLASS} defaultValue="company" name="kind">
                <option value="company">Company</option>
                <option value="general">General (individual)</option>
              </select>
            </label>
            <label className={`${OPS_LABEL_CLASS} md:col-span-2`}>
              Name
              <input
                className={OPS_INPUT_CLASS}
                name="company_name"
                placeholder="Company or individual name"
                required
              />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Trade specialty
              <input
                className={OPS_INPUT_CLASS}
                name="trade_specialty"
                placeholder="e.g. Electrical"
              />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Contact name
              <input className={OPS_INPUT_CLASS} name="contact_name" />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Contact phone
              <input className={OPS_INPUT_CLASS} name="contact_phone" />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Contact email
              <input className={OPS_INPUT_CLASS} name="contact_email" type="email" />
            </label>
            <label className={OPS_LABEL_CLASS}>
              TPIN
              <input className={OPS_INPUT_CLASS} name="tpin" />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Registration number
              <input className={OPS_INPUT_CLASS} name="registration_number" />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Status
              <select className={OPS_INPUT_CLASS} defaultValue="prospect" name="status">
                <option value="prospect">Prospect</option>
                <option value="kyc_pending">KYC Pending</option>
                <option value="approved">Approved</option>
                <option value="suspended">Suspended</option>
                <option value="blacklisted">Blacklisted</option>
              </select>
            </label>
            <label className={OPS_LABEL_CLASS}>
              Retention %
              <input
                className={OPS_INPUT_CLASS}
                defaultValue="5"
                max="50"
                min="0"
                name="retention_percent"
                step="0.5"
                type="number"
              />
            </label>
            <div className="md:col-span-3">
              <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
                <Plus className="size-4" aria-hidden="true" />
                Add subcontractor
              </button>
            </div>
          </form>
        </details>
      ) : null}

      {subs.length === 0 ? (
        <OpsEmptyState
          icon={HardHat}
          title="No subcontractors yet"
          description={
            canCreate
              ? "Add a subcontractor to the register, complete KYC, and start allocating them to tasks."
              : "Operations Manager or Projects Manager will populate the register first."
          }
          actions={[]}
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {subs.map((sub) => (
            <li
              key={sub.id}
              className="rounded-lg border border-border bg-card p-4 shadow-sm"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {sub.trade_specialty || "—"}
              </p>
              <h2 className="mt-1 font-heading text-lg font-bold text-foreground">
                <Link className="hover:underline" href={`/ops/subcontractors/${sub.id}`}>
                  {sub.company_name}
                </Link>
              </h2>
              <span
                className={`mt-2 ${opsStatusBadgeClass(sub.status)}`}
              >
                {sub.status.replace("_", " ")}
              </span>
              {sub.kind === "general" ? (
                <span className="mt-2 ml-2 inline-flex rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-indigo-700">
                  Individual
                </span>
              ) : null}
              <p className="mt-2 text-xs text-muted-foreground">
                Retention {sub.retention_percent}% · {sub.contact_name || "no contact"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
