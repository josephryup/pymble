import { Banknote, Briefcase, CheckCircle2, Pencil } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OpsInlineEmpty } from "@/components/ops/OpsInlineEmpty";
import { OpsConfirmSubmitButton } from "@/components/ops/OpsConfirmSubmitButton";
import { OpsPageHeader } from "@/components/ops/OpsPageHeader";
import { OpsRealtimeRefresh } from "@/components/ops/OpsRealtimeRefresh";
import { requireOpsUser } from "@/lib/ops/auth";
import { fetchActiveSiteOptions } from "@/lib/ops/sites";
import {
  archiveSubcontractorAction,
  createSubcontractorAssignmentAction,
  decideSubcontractorPaymentAction,
  requestSubcontractorPaymentAction,
  updateSubcontractorAction,
} from "@/lib/ops/subcontractor-actions";
import {
  canAllocateSubcontractor,
  canApproveSubcontractorPayment,
  canArchiveSubcontractor,
  canManageSubcontractor,
  canRequestSubcontractorPayment,
  canViewSubcontractors,
} from "@/lib/ops/subcontractor-permissions";
import {
  computeOpsSubcontractorFinancials,
  fetchOpsSubcontractorAssignments,
  fetchOpsSubcontractorById,
  fetchOpsSubcontractorPayments,
} from "@/lib/ops/subcontractors";
import {
  firstParam,
  formatZmw,
  OPS_DANGER_BUTTON_CLASS,
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
  params: Promise<{ subcontractorId: string }>;
  searchParams?: Promise<OpsSearchParams>;
};

export default async function OpsSubcontractorDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { subcontractorId } = await params;
  const search = (await (searchParams ?? Promise.resolve({} as OpsSearchParams))) ?? {};
  const { profile } = await requireOpsUser();
  if (!canViewSubcontractors(profile.role)) notFound();
  const sub = await fetchOpsSubcontractorById(subcontractorId);
  if (!sub) notFound();
  const assignments = await fetchOpsSubcontractorAssignments(sub.id);
  const payments = await fetchOpsSubcontractorPayments(assignments.map((a) => a.id));
  const sites = await fetchActiveSiteOptions().catch(() => []);
  const financials = computeOpsSubcontractorFinancials(assignments, payments);
  const updated = firstParam(search.updated);
  const error = firstParam(search.error);

  const canEdit = canManageSubcontractor(profile.role);
  const canAllocate = canAllocateSubcontractor(profile.role);
  const canRequest = canRequestSubcontractorPayment(profile.role);
  const canDecide = canApproveSubcontractorPayment(profile.role);
  const canArchive = canArchiveSubcontractor(profile.role);

  return (
    <div className="w-full max-w-none space-y-6">
      <OpsRealtimeRefresh
        tables={["subcontractors", "subcontractor_assignments", "subcontractor_payments"]}
      />
      <OpsPageHeader
        eyebrow={sub.kind === "general" ? "Individual subcontractor" : sub.trade_specialty || "Subcontractor"}
        title={sub.company_name}
        description={`${sub.kind === "general" ? "General (individual)" : "Company"} · Status: ${sub.status.replace("_", " ")} · Retention ${sub.retention_percent}%`}
        actions={
          <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/subcontractors">
            All subcontractors
          </Link>
        }
      />

      {error ? (
        <div className={OPS_NOTICE_ERROR_CLASS} role="alert">
          {error}
        </div>
      ) : null}
      {updated ? (
        <div className={OPS_NOTICE_SUCCESS_CLASS}>
          Saved.
        </div>
      ) : null}

      <section className="grid gap-3 md:grid-cols-4">
        <FinancialTile label="Agreed total" value={financials.agreedTotal} />
        <FinancialTile label="Paid" value={financials.approvedPaid} />
        <FinancialTile label="Pending requests" value={financials.pendingApprovals} tone="watch" />
        <FinancialTile label="Retention held" value={financials.retentionHeld} tone="muted" />
      </section>

      {canEdit ? (
        <details className="rounded-lg border border-border bg-card">
          <summary className="flex cursor-pointer items-center gap-2 px-5 py-4 text-sm font-semibold text-foreground">
            <Pencil className="size-4" aria-hidden="true" />
            Edit subcontractor
          </summary>
          <form
            action={updateSubcontractorAction}
            className="grid gap-3 border-t border-border p-5 md:grid-cols-3"
          >
            <input name="id" type="hidden" value={sub.id} />
            <label className={OPS_LABEL_CLASS}>
              Type
              <select className={OPS_INPUT_CLASS} defaultValue={sub.kind} name="kind">
                <option value="company">Company</option>
                <option value="general">General (individual)</option>
              </select>
            </label>
            <label className={`${OPS_LABEL_CLASS} md:col-span-2`}>
              Name
              <input
                className={OPS_INPUT_CLASS}
                defaultValue={sub.company_name}
                name="company_name"
                placeholder="Company or individual name"
                required
              />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Trade specialty
              <input
                className={OPS_INPUT_CLASS}
                defaultValue={sub.trade_specialty}
                name="trade_specialty"
              />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Contact name
              <input className={OPS_INPUT_CLASS} defaultValue={sub.contact_name} name="contact_name" />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Contact phone
              <input
                className={OPS_INPUT_CLASS}
                defaultValue={sub.contact_phone}
                name="contact_phone"
              />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Contact email
              <input
                className={OPS_INPUT_CLASS}
                defaultValue={sub.contact_email}
                name="contact_email"
                type="email"
              />
            </label>
            <label className={OPS_LABEL_CLASS}>
              TPIN
              <input className={OPS_INPUT_CLASS} defaultValue={sub.tpin} name="tpin" />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Registration number
              <input
                className={OPS_INPUT_CLASS}
                defaultValue={sub.registration_number}
                name="registration_number"
              />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Bank name
              <input className={OPS_INPUT_CLASS} defaultValue={sub.bank_name} name="bank_name" />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Bank account number
              <input
                className={OPS_INPUT_CLASS}
                defaultValue={sub.bank_account_number}
                name="bank_account_number"
              />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Status
              <select className={OPS_INPUT_CLASS} defaultValue={sub.status} name="status">
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
                defaultValue={sub.retention_percent}
                max="50"
                min="0"
                name="retention_percent"
                step="0.5"
                type="number"
              />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Performance rating
              <select
                className={OPS_INPUT_CLASS}
                defaultValue={sub.performance_rating ?? ""}
                name="performance_rating"
              >
                <option value="">—</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label className={`${OPS_LABEL_CLASS} md:col-span-3`}>
              KYC notes
              <textarea
                className={`${OPS_INPUT_CLASS} min-h-24`}
                defaultValue={sub.kyc_notes}
                name="kyc_notes"
                rows={3}
              />
            </label>
            <label className={`${OPS_LABEL_CLASS} md:col-span-3`}>
              Performance notes
              <textarea
                className={`${OPS_INPUT_CLASS} min-h-24`}
                defaultValue={sub.performance_notes}
                name="performance_notes"
                rows={3}
              />
            </label>
            <div className="md:col-span-3 flex flex-wrap items-center gap-2">
              <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
                Save
              </button>
              {canArchive ? (
                <form action={archiveSubcontractorAction} className="inline-block">
                  <input name="id" type="hidden" value={sub.id} />
                  <OpsConfirmSubmitButton
                    className={OPS_DANGER_BUTTON_CLASS}
                    confirmText="Confirm archive"
                  >
                    Archive
                  </OpsConfirmSubmitButton>
                </form>
              ) : null}
            </div>
          </form>
        </details>
      ) : null}

      <section>
        <h2 className="mb-2 flex items-center gap-2 font-heading text-lg font-bold text-foreground">
          <Briefcase className="size-5" aria-hidden="true" />
          Assignments
        </h2>
        {canAllocate ? (
          <details className="mb-3 rounded-lg border border-border bg-card">
            <summary className="cursor-pointer px-5 py-3 text-sm font-semibold text-foreground">
              Allocate to a site
            </summary>
            <form
              action={createSubcontractorAssignmentAction}
              className="grid gap-3 border-t border-border p-5 md:grid-cols-4"
            >
              <input name="subcontractor_id" type="hidden" value={sub.id} />
              <label className={`${OPS_LABEL_CLASS} md:col-span-2`}>
                Site
                <select className={OPS_INPUT_CLASS} name="site_id" required defaultValue="">
                  <option value="">— Select site —</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} — {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={`${OPS_LABEL_CLASS} md:col-span-2`}>
                Agreed amount (ZMW)
                <input
                  className={OPS_INPUT_CLASS}
                  defaultValue="0"
                  min="0"
                  name="agreed_amount"
                  step="0.01"
                  type="number"
                />
              </label>
              <label className={OPS_LABEL_CLASS}>
                Start
                <input className={OPS_INPUT_CLASS} name="start_date" required type="date" />
              </label>
              <label className={OPS_LABEL_CLASS}>
                End
                <input className={OPS_INPUT_CLASS} name="end_date" type="date" />
              </label>
              <label className={`${OPS_LABEL_CLASS} md:col-span-4`}>
                Scope
                <input className={OPS_INPUT_CLASS} name="scope" required />
              </label>
              <label className={`${OPS_LABEL_CLASS} md:col-span-2`}>
                Status
                <select className={OPS_INPUT_CLASS} defaultValue="planned" name="status">
                  <option value="planned">Planned</option>
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </label>
              <div className="md:col-span-4">
                <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
                  Allocate
                </button>
              </div>
            </form>
          </details>
        ) : null}

        {assignments.length === 0 ? (
          <OpsInlineEmpty>No assignments yet.</OpsInlineEmpty>
        ) : (
          <ul className="space-y-3">
            {assignments.map((assignment) => {
              const assignmentPayments = payments.filter(
                (p) => p.assignment_id === assignment.id,
              );
              return (
                <li
                  key={assignment.id}
                  className="rounded-lg border border-border bg-card p-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        {assignment.site
                          ? `${assignment.site.code} — ${assignment.site.name}`
                          : "Site"}
                      </p>
                      <h3 className="mt-1 font-heading text-base font-bold text-foreground">
                        {assignment.scope}
                      </h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {assignment.start_date}
                        {assignment.end_date ? ` → ${assignment.end_date}` : ""} ·{" "}
                        {assignment.status}
                      </p>
                    </div>
                    <p className="font-heading text-lg font-bold text-foreground">
                      {formatZmw(Number(assignment.agreed_amount))}
                    </p>
                  </div>

                  {canRequest ? (
                    <details className="mt-3 rounded-md border border-border">
                      <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-foreground/70">
                        <Banknote className="mr-1 inline size-3.5" aria-hidden="true" />
                        Request payment
                      </summary>
                      <form
                        action={requestSubcontractorPaymentAction}
                        className="grid gap-2 border-t border-border p-3 sm:grid-cols-4"
                      >
                        <input name="assignment_id" type="hidden" value={assignment.id} />
                        <label className={OPS_LABEL_CLASS}>
                          Type
                          <select
                            className={OPS_INPUT_CLASS}
                            defaultValue="interim"
                            name="payment_type"
                          >
                            <option value="advance">Advance</option>
                            <option value="interim">Interim</option>
                            <option value="retention_release">Retention release</option>
                            <option value="final">Final</option>
                          </select>
                        </label>
                        <label className={OPS_LABEL_CLASS}>
                          Amount (ZMW)
                          <input
                            className={OPS_INPUT_CLASS}
                            min="0.01"
                            name="amount"
                            required
                            step="0.01"
                            type="number"
                          />
                        </label>
                        <label className={OPS_LABEL_CLASS}>
                          Retention held
                          <input
                            className={OPS_INPUT_CLASS}
                            defaultValue="0"
                            min="0"
                            name="retention_held"
                            step="0.01"
                            type="number"
                          />
                        </label>
                        <label className={OPS_LABEL_CLASS}>
                          Scheduled for
                          <input className={OPS_INPUT_CLASS} name="scheduled_for" type="date" />
                        </label>
                        <label className={OPS_LABEL_CLASS}>
                          Reference
                          <input className={OPS_INPUT_CLASS} name="reference" />
                        </label>
                        <div className="sm:col-span-4">
                          <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
                            Submit request
                          </button>
                        </div>
                      </form>
                    </details>
                  ) : null}

                  {assignmentPayments.length > 0 ? (
                    <ul className="mt-3 space-y-2">
                      {assignmentPayments.map((payment) => (
                        <li
                          key={payment.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
                        >
                          <div>
                            <p className="font-semibold text-foreground">
                              {payment.payment_type.replace("_", " ")} ·{" "}
                              {formatZmw(Number(payment.amount))}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {payment.reference || "no ref"}
                              {payment.scheduled_for ? ` · ${payment.scheduled_for}` : ""}
                            </p>
                          </div>
                          <span
                            className={opsStatusBadgeClass(payment.status)}
                          >
                            {payment.status}
                          </span>
                          {canDecide && payment.status === "pending" ? (
                            <form
                              action={decideSubcontractorPaymentAction}
                              className="flex items-center gap-1"
                            >
                              <input name="id" type="hidden" value={payment.id} />
                              <button
                                className={OPS_SECONDARY_BUTTON_CLASS}
                                name="decision"
                                type="submit"
                                value="approved"
                              >
                                Approve
                              </button>
                              <button
                                className={OPS_PRIMARY_BUTTON_CLASS}
                                name="decision"
                                type="submit"
                                value="paid"
                              >
                                <CheckCircle2 className="size-4" aria-hidden="true" />
                                Mark paid
                              </button>
                              <button
                                className={OPS_DANGER_BUTTON_CLASS}
                                name="decision"
                                type="submit"
                                value="rejected"
                              >
                                Reject
                              </button>
                            </form>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function FinancialTile({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "watch" | "muted";
}) {
  const colourClass =
    tone === "watch"
      ? "text-orange-700"
      : tone === "muted"
        ? "text-muted-foreground"
        : "text-foreground";
  return (
    <div className="rounded-md border border-border bg-card px-4 py-3 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className={`mt-1 font-heading text-xl font-bold ${colourClass}`}>
        {formatZmw(value)}
      </p>
    </div>
  );
}
