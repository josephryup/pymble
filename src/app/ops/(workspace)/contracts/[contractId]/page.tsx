import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileCheck2,
  FilePlus2,
  FileSignature,
  FileText,
  PenLine,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { OpsCollapsible } from "@/components/ops/OpsCollapsible";
import { OpsPageHeader } from "@/components/ops/OpsPageHeader";
import { requireOpsUser } from "@/lib/ops/auth";
import { OpsDirectUploadField } from "@/components/ops/OpsDirectUploadField";
import {
  addOpsContractLineAction,
  addOpsContractMilestoneAction,
  addOpsContractScopeItemAction,
  approveOpsContractAction,
  certifyOpsContractMilestoneAction,
  completeOpsContractAction,
  createOpsContractAddendumAction,
  declineOpsContractSignatureAction,
  deleteOpsContractLineAction,
  deleteOpsContractMilestoneAction,
  deleteOpsContractScopeItemAction,
  recordOpsContractCountersignatureAction,
  releaseOpsContractRetentionAction,
  resetOpsContractClauseAction,
  signOpsContractAction,
  submitOpsContractForReviewAction,
  terminateOpsContractAction,
  updateOpsContractClauseAction,
  updateOpsContractTermsAction,
} from "@/lib/ops/contract-actions";
import {
  canApproveOpsContract,
  canCertifyOpsContractMilestone,
  canDraftOpsContractKind,
  canIssueOpsContract,
  canSignOpsContractAs,
  canTerminateOpsContract,
  canViewOpsContracts,
} from "@/lib/ops/contract-permissions";
import { fetchMyOpsSignatureSpecimenMeta } from "@/lib/ops/contract-signatures";
import {
  OPS_CONTRACT_SIGNATORY_LABELS,
  OPS_CONTRACT_STATUS_LABELS,
} from "@/lib/ops/contract-types";
import { fetchOpsContractById } from "@/lib/ops/contracts";
import { formatOpsDate, formatOpsDateTime } from "@/lib/ops/format";
import { fetchOpsModuleAccessOverrides } from "@/lib/ops/module-access";
import { canAccessOpsHref } from "@/lib/ops/permissions";
import { fetchOpsSites } from "@/lib/ops/sites";
import {
  firstParam,
  formatZmw,
  noticeFromParams,
  OPS_INPUT_CLASS,
  OPS_LABEL_CLASS,
  OPS_NOTICE_ERROR_CLASS,
  OPS_NOTICE_INFO_CLASS,
  OPS_NOTICE_SUCCESS_CLASS,
  OPS_NOTICE_WARNING_CLASS,
  OPS_PRIMARY_BUTTON_CLASS,
  OPS_SECONDARY_BUTTON_CLASS,
  OPS_TABLE_CLASS,
  OPS_TABLE_SCROLL_CLASS,
  OPS_TD_CLASS,
  OPS_TD_NUM_CLASS,
  OPS_TH_CLASS,
  OPS_TH_NUM_CLASS,
  OPS_THEAD_CLASS,
  OPS_TR_CLASS,
  opsStatusBadgeClass,
  type OpsSearchParams,
} from "@/lib/ops/ui";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ contractId: string }>;
  searchParams?: Promise<OpsSearchParams>;
};

export default async function OpsContractDetailPage({ params, searchParams }: PageProps) {
  const { contractId } = await params;
  const search = (await (searchParams ?? Promise.resolve({} as OpsSearchParams))) ?? {};
  const { profile, isLocalRolePreview } = await requireOpsUser();

  if (
    !canAccessOpsHref(profile.role, "/ops/contracts", await fetchOpsModuleAccessOverrides())
  ) {
    notFound();
  }
  if (!canViewOpsContracts(profile.role)) notFound();

  const contract = await fetchOpsContractById(contractId);
  if (!contract) notFound();

  const canEdit =
    contract.status === "draft" && canDraftOpsContractKind(profile.role, contract.kind);

  const [specimen, sites] = await Promise.all([
    fetchMyOpsSignatureSpecimenMeta(),
    // Only loaded for the terms form, which only an editor sees.
    canEdit ? fetchOpsSites() : Promise.resolve([]),
  ]);
  const canSubmit = canEdit;
  const canApprove =
    contract.status === "in_review" && canApproveOpsContract(profile.role);
  const signingOpen = ["approved", "issued"].includes(contract.status);

  // "Live" = countersigned and running. Certification and completion only make
  // sense here; before this the agreement is not yet in force.
  const isLive = ["signed", "active"].includes(contract.status);
  const canCertify = canCertifyOpsContractMilestone(profile.role);
  const canIssue = canIssueOpsContract(profile.role);
  const canTerminate = canTerminateOpsContract(profile.role) && isLive;
  const canEditKind = canDraftOpsContractKind(profile.role, contract.kind);

  const notice = noticeFromParams(search, "updated", "Contract updated.");
  const error = firstParam(search.error);

  const customisedCount = contract.clauses.filter((clause) => clause.is_customised).length;
  const milestoneTotal = contract.milestones.reduce(
    (sum, milestone) => sum + Number(milestone.percent ?? 0),
    0,
  );

  // A slot is actionable when it is mine (by assignment or by office) and still
  // pending. Mirrors the check the signing action re-runs server-side; this
  // only decides whether to render the form.
  const mySlot = contract.signatures.find(
    (signature) =>
      signature.status === "pending" &&
      (signature.assigned_user_id === profile.id ||
        (signature.assigned_user_id === null &&
          canSignOpsContractAs(profile.role, signature.signatory_role))),
  );

  return (
    <div className="w-full max-w-none space-y-6">
      <OpsPageHeader
        eyebrow={contract.contract_number}
        title={contract.title || "Contract"}
        description="Edit clauses while the contract is a draft, route it for approval, then sign it with your own signature. Once issued, changes need an addendum."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/contracts">
              <ArrowLeft className="size-4" aria-hidden="true" />
              Register
            </Link>
            <a
              className={OPS_SECONDARY_BUTTON_CLASS}
              href={`/api/ops/docx/contract/${contract.id}`}
              rel="noreferrer"
            >
              <FileText className="size-4" aria-hidden="true" />
              Word copy
            </a>
            <a
              className={OPS_PRIMARY_BUTTON_CLASS}
              href={`/api/ops/pdf/contract/${contract.id}`}
              rel="noreferrer"
            >
              <Download className="size-4" aria-hidden="true" />
              Download PDF
            </a>
          </div>
        }
      />

      {error ? (
        <div className={OPS_NOTICE_ERROR_CLASS} role="alert">
          {error}
        </div>
      ) : null}
      {notice ? <div className={OPS_NOTICE_SUCCESS_CLASS}>{notice.message}</div> : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Status
          </p>
          <p className="mt-1.5">
            <span className={opsStatusBadgeClass(contract.status)}>
              {OPS_CONTRACT_STATUS_LABELS[contract.status]}
            </span>
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Counterparty
          </p>
          <p className="mt-1 font-semibold text-foreground">
            {contract.counterparty_name}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Total value
          </p>
          <p className="mt-1 font-heading text-2xl font-bold tabular-nums text-foreground">
            {formatZmw(Number(contract.total_value ?? 0))}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {contract.vat_applicable
              ? `Incl. VAT at ${Number(contract.vat_percent)}%`
              : "VAT not applicable"}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Programme
          </p>
          <p className="mt-1 font-semibold text-foreground">
            {contract.duration_days} days
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatOpsDate(contract.start_date)} → {formatOpsDate(contract.end_date)}
          </p>
        </div>
      </section>

      {contract.milestones.length > 0 && Math.abs(milestoneTotal - 100) > 0.01 ? (
        <div className={OPS_NOTICE_WARNING_CLASS}>
          <AlertTriangle className="mr-1.5 inline size-4" aria-hidden="true" />
          The payment milestones total {milestoneTotal.toFixed(1)}%, not 100%. This
          contract cannot be submitted for review until they add up.
        </div>
      ) : null}

      {/* Terms and programme — the numbers the clause merge tokens read from.
          Without this form a draft keeps template defaults forever and the
          generated document reads "approximately 0 days". */}
      {canEdit ? (
        <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <h2 className="font-heading text-lg font-bold text-foreground">
            Terms and programme
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            These values fill the merge fields in the clauses — duration, penalty,
            warranty, retention and the rest.
          </p>

          <form action={updateOpsContractTermsAction} className="mt-4 grid gap-4">
            <input type="hidden" name="contract_id" value={contract.id} />

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <label className={OPS_LABEL_CLASS} htmlFor="title">
                  Title
                </label>
                <input
                  className={OPS_INPUT_CLASS}
                  defaultValue={contract.title}
                  id="title"
                  maxLength={200}
                  name="title"
                  required
                />
              </div>
              <div>
                <label className={OPS_LABEL_CLASS} htmlFor="site_id">
                  Site
                </label>
                <select
                  className={OPS_INPUT_CLASS}
                  defaultValue={contract.site_id ?? ""}
                  id="site_id"
                  name="site_id"
                >
                  <option value="">—</option>
                  {sites.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.code} — {site.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={OPS_LABEL_CLASS} htmlFor="work_order_number">
                  Works order no.
                </label>
                <input
                  className={OPS_INPUT_CLASS}
                  defaultValue={contract.work_order_number}
                  id="work_order_number"
                  maxLength={80}
                  name="work_order_number"
                />
              </div>
              <div>
                <label className={OPS_LABEL_CLASS} htmlFor="work_order_date">
                  Works order date
                </label>
                <input
                  className={OPS_INPUT_CLASS}
                  defaultValue={contract.work_order_date ?? ""}
                  id="work_order_date"
                  name="work_order_date"
                  type="date"
                />
              </div>
              <div>
                <label className={OPS_LABEL_CLASS} htmlFor="duration_days">
                  Duration (days)
                </label>
                <input
                  className={OPS_INPUT_CLASS}
                  defaultValue={contract.duration_days}
                  id="duration_days"
                  min={0}
                  name="duration_days"
                  type="number"
                />
              </div>
              <div>
                <label className={OPS_LABEL_CLASS} htmlFor="start_date">
                  Start date
                </label>
                <input
                  className={OPS_INPUT_CLASS}
                  defaultValue={contract.start_date ?? ""}
                  id="start_date"
                  name="start_date"
                  type="date"
                />
              </div>
              <div>
                <label className={OPS_LABEL_CLASS} htmlFor="end_date">
                  End date
                </label>
                <input
                  className={OPS_INPUT_CLASS}
                  defaultValue={contract.end_date ?? ""}
                  id="end_date"
                  name="end_date"
                  type="date"
                />
              </div>
              <div>
                <label className={OPS_LABEL_CLASS} htmlFor="expected_start_date">
                  Expected start
                </label>
                <input
                  className={OPS_INPUT_CLASS}
                  defaultValue={contract.expected_start_date ?? ""}
                  id="expected_start_date"
                  name="expected_start_date"
                  type="date"
                />
              </div>
              <div>
                <label className={OPS_LABEL_CLASS} htmlFor="expected_finish_date">
                  Expected finish
                </label>
                <input
                  className={OPS_INPUT_CLASS}
                  defaultValue={contract.expected_finish_date ?? ""}
                  id="expected_finish_date"
                  name="expected_finish_date"
                  type="date"
                />
              </div>
              <div>
                <label className={OPS_LABEL_CLASS} htmlFor="payment_terms_days">
                  Payment terms (days)
                </label>
                <input
                  className={OPS_INPUT_CLASS}
                  defaultValue={contract.payment_terms_days}
                  id="payment_terms_days"
                  min={0}
                  name="payment_terms_days"
                  type="number"
                />
              </div>
              <div>
                <label className={OPS_LABEL_CLASS} htmlFor="retention_percent">
                  Retention %
                </label>
                <input
                  className={OPS_INPUT_CLASS}
                  defaultValue={contract.retention_percent}
                  id="retention_percent"
                  min={0}
                  name="retention_percent"
                  step="0.01"
                  type="number"
                />
              </div>
              <div>
                <label className={OPS_LABEL_CLASS} htmlFor="defects_liability_months">
                  Defects liability (months)
                </label>
                <input
                  className={OPS_INPUT_CLASS}
                  defaultValue={contract.defects_liability_months}
                  id="defects_liability_months"
                  min={0}
                  name="defects_liability_months"
                  type="number"
                />
              </div>
              <div>
                <label className={OPS_LABEL_CLASS} htmlFor="warranty_months">
                  Warranty (months)
                </label>
                <input
                  className={OPS_INPUT_CLASS}
                  defaultValue={contract.warranty_months}
                  id="warranty_months"
                  min={0}
                  name="warranty_months"
                  type="number"
                />
              </div>
              <div>
                <label className={OPS_LABEL_CLASS} htmlFor="penalty_percent_per_week">
                  Penalty % per week
                </label>
                <input
                  className={OPS_INPUT_CLASS}
                  defaultValue={contract.penalty_percent_per_week}
                  id="penalty_percent_per_week"
                  min={0}
                  name="penalty_percent_per_week"
                  step="0.01"
                  type="number"
                />
              </div>
              <div>
                <label className={OPS_LABEL_CLASS} htmlFor="penalty_cap_percent">
                  Penalty cap %
                </label>
                <input
                  className={OPS_INPUT_CLASS}
                  defaultValue={contract.penalty_cap_percent}
                  id="penalty_cap_percent"
                  min={0}
                  name="penalty_cap_percent"
                  step="0.01"
                  type="number"
                />
              </div>
              <div>
                <label className={OPS_LABEL_CLASS} htmlFor="variation_threshold_percent">
                  Variation threshold %
                </label>
                <input
                  className={OPS_INPUT_CLASS}
                  defaultValue={contract.variation_threshold_percent}
                  id="variation_threshold_percent"
                  min={0}
                  name="variation_threshold_percent"
                  step="0.01"
                  type="number"
                />
              </div>
              <div>
                <label className={OPS_LABEL_CLASS} htmlFor="min_workers">
                  Minimum workers on site
                </label>
                <input
                  className={OPS_INPUT_CLASS}
                  defaultValue={contract.min_workers}
                  id="min_workers"
                  min={0}
                  name="min_workers"
                  type="number"
                />
              </div>
              <div>
                <label className={OPS_LABEL_CLASS} htmlFor="roe_reference">
                  Exchange rate reference
                </label>
                <input
                  className={OPS_INPUT_CLASS}
                  defaultValue={contract.roe_reference}
                  id="roe_reference"
                  maxLength={120}
                  name="roe_reference"
                  placeholder="e.g. USD 20"
                />
              </div>
              <div>
                <label className={OPS_LABEL_CLASS} htmlFor="vat_percent">
                  VAT %
                </label>
                <input
                  className={OPS_INPUT_CLASS}
                  defaultValue={contract.vat_percent}
                  id="vat_percent"
                  min={0}
                  name="vat_percent"
                  step="0.01"
                  type="number"
                />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 pb-2 text-sm font-semibold text-foreground">
                  <input
                    defaultChecked={contract.vat_applicable}
                    name="vat_applicable"
                    type="checkbox"
                  />
                  VAT applies to this contract
                </label>
              </div>
            </div>

            <div>
              <label className={OPS_LABEL_CLASS} htmlFor="preamble">
                Preamble
              </label>
              <textarea
                className={OPS_INPUT_CLASS}
                defaultValue={contract.preamble}
                id="preamble"
                name="preamble"
                rows={3}
              />
            </div>
            <div>
              <label className={OPS_LABEL_CLASS} htmlFor="scope_summary">
                Scope summary
              </label>
              <textarea
                className={OPS_INPUT_CLASS}
                defaultValue={contract.scope_summary}
                id="scope_summary"
                name="scope_summary"
                rows={3}
              />
            </div>

            <div>
              <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
                Save terms
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {/* Scope of works */}
      {contract.scope_items.length > 0 || canEdit ? (
        <section className="rounded-lg border border-border bg-card shadow-sm">
          <div className="border-b border-border p-5">
            <h2 className="font-heading text-lg font-bold text-foreground">
              Scope of works
            </h2>
          </div>

          {contract.scope_items.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">
              No scope items yet. The generated contract omits this section entirely
              until at least one is added.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {contract.scope_items.map((item, index) => (
                <li className="flex items-start justify-between gap-4 p-5" key={item.id}>
                  <div>
                    <p className="font-semibold text-foreground">
                      {index + 1}. {item.heading}
                    </p>
                    {item.detail ? (
                      <p className="mt-1 text-sm text-muted-foreground">{item.detail}</p>
                    ) : null}
                  </div>
                  {canEdit ? (
                    <form action={deleteOpsContractScopeItemAction}>
                      <input type="hidden" name="contract_id" value={contract.id} />
                      <input type="hidden" name="item_id" value={item.id} />
                      <button
                        aria-label={`Remove scope item ${index + 1}`}
                        className={OPS_SECONDARY_BUTTON_CLASS}
                        type="submit"
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          {canEdit ? (
            <form
              action={addOpsContractScopeItemAction}
              className="grid gap-3 border-t border-border p-5"
            >
              <input type="hidden" name="contract_id" value={contract.id} />
              <div className="grid gap-3 md:grid-cols-[1fr_2fr]">
                <div>
                  <label className={OPS_LABEL_CLASS} htmlFor="scope_heading">
                    Heading
                  </label>
                  <input
                    className={OPS_INPUT_CLASS}
                    id="scope_heading"
                    maxLength={200}
                    name="heading"
                    placeholder="Setting out and excavation"
                    required
                  />
                </div>
                <div>
                  <label className={OPS_LABEL_CLASS} htmlFor="scope_detail">
                    Detail
                  </label>
                  <input
                    className={OPS_INPUT_CLASS}
                    id="scope_detail"
                    name="detail"
                    placeholder="Accurate setting out per approved drawings, then excavation to specified depths."
                  />
                </div>
              </div>
              <div>
                <button className={OPS_SECONDARY_BUTTON_CLASS} type="submit">
                  <Plus className="size-4" aria-hidden="true" />
                  Add scope item
                </button>
              </div>
            </form>
          ) : null}
        </section>
      ) : null}

      {/* Priced schedule */}
      {contract.lines.length > 0 || canEdit ? (
        <section className="rounded-lg border border-border bg-card shadow-sm">
          <div className="border-b border-border p-5">
            <h2 className="font-heading text-lg font-bold text-foreground">
              Value of works
            </h2>
          </div>
          <div className={OPS_TABLE_SCROLL_CLASS}>
            <table className={OPS_TABLE_CLASS}>
              <thead className={OPS_THEAD_CLASS}>
                <tr>
                  <th className={OPS_TH_CLASS}>S/No</th>
                  <th className={OPS_TH_CLASS}>Description</th>
                  <th className={OPS_TH_NUM_CLASS}>Qty</th>
                  <th className={OPS_TH_CLASS}>UoM</th>
                  <th className={OPS_TH_NUM_CLASS}>Rate</th>
                  <th className={OPS_TH_NUM_CLASS}>Amount</th>
                  {canEdit ? <th className={OPS_TH_CLASS}>&nbsp;</th> : null}
                </tr>
              </thead>
              <tbody>
                {contract.lines.map((line, index) => (
                  <tr className={OPS_TR_CLASS} key={line.id}>
                    <td className={OPS_TD_CLASS}>{index + 1}</td>
                    <td className={OPS_TD_CLASS}>{line.description}</td>
                    <td className={OPS_TD_NUM_CLASS}>{Number(line.quantity)}</td>
                    <td className={OPS_TD_CLASS}>{line.uom}</td>
                    <td className={OPS_TD_NUM_CLASS}>{formatZmw(Number(line.rate))}</td>
                    <td className={OPS_TD_NUM_CLASS}>{formatZmw(Number(line.amount))}</td>
                    {canEdit ? (
                      <td className={OPS_TD_CLASS}>
                        <form action={deleteOpsContractLineAction}>
                          <input type="hidden" name="contract_id" value={contract.id} />
                          <input type="hidden" name="line_id" value={line.id} />
                          <button
                            aria-label={`Remove line ${index + 1}`}
                            className={OPS_SECONDARY_BUTTON_CLASS}
                            type="submit"
                          >
                            <Trash2 className="size-4" aria-hidden="true" />
                          </button>
                        </form>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border-t border-border p-5">
            <dl className="ml-auto grid max-w-xs gap-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd className="tabular-nums text-foreground">
                  {formatZmw(Number(contract.subtotal ?? 0))}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">
                  {contract.vat_applicable ? `VAT (${Number(contract.vat_percent)}%)` : "VAT"}
                </dt>
                <dd className="tabular-nums text-foreground">
                  {contract.vat_applicable
                    ? formatZmw(Number(contract.vat_amount ?? 0))
                    : "Not applicable"}
                </dd>
              </div>
              <div className="flex justify-between border-t border-border pt-1 font-bold">
                <dt className="text-foreground">Total</dt>
                <dd className="tabular-nums text-foreground">
                  {formatZmw(Number(contract.total_value ?? 0))}
                </dd>
              </div>
            </dl>
          </div>

          {canEdit ? (
            <form
              action={addOpsContractLineAction}
              className="grid gap-3 border-t border-border p-5"
            >
              <input type="hidden" name="contract_id" value={contract.id} />
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                <div className="lg:col-span-2">
                  <label className={OPS_LABEL_CLASS} htmlFor="line_description">
                    Description
                  </label>
                  <input
                    className={OPS_INPUT_CLASS}
                    id="line_description"
                    maxLength={500}
                    name="description"
                    placeholder="30 x 78 Warehouse"
                    required
                  />
                </div>
                <div>
                  <label className={OPS_LABEL_CLASS} htmlFor="line_quantity">
                    Quantity
                  </label>
                  <input
                    className={OPS_INPUT_CLASS}
                    defaultValue={1}
                    id="line_quantity"
                    min={0}
                    name="quantity"
                    step="0.001"
                    type="number"
                  />
                </div>
                <div>
                  <label className={OPS_LABEL_CLASS} htmlFor="line_uom">
                    Unit
                  </label>
                  <input
                    className={OPS_INPUT_CLASS}
                    defaultValue="Item"
                    id="line_uom"
                    maxLength={40}
                    name="uom"
                  />
                </div>
                <div>
                  <label className={OPS_LABEL_CLASS} htmlFor="line_rate">
                    Rate (ZMW)
                  </label>
                  <input
                    className={OPS_INPUT_CLASS}
                    id="line_rate"
                    min={0}
                    name="rate"
                    step="0.01"
                    type="number"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                The amount is calculated as quantity × rate, and the totals and
                milestone amounts recalculate from it.
              </p>
              <div>
                <button className={OPS_SECONDARY_BUTTON_CLASS} type="submit">
                  <Plus className="size-4" aria-hidden="true" />
                  Add line
                </button>
              </div>
            </form>
          ) : null}
        </section>
      ) : null}

      {/* Milestones */}
      {contract.milestones.length > 0 || canEdit ? (
        <section className="rounded-lg border border-border bg-card shadow-sm">
          <div className="border-b border-border p-5">
            <h2 className="font-heading text-lg font-bold text-foreground">
              Payment schedule
            </h2>
          </div>
          <div className={OPS_TABLE_SCROLL_CLASS}>
            <table className={OPS_TABLE_CLASS}>
              <thead className={OPS_THEAD_CLASS}>
                <tr>
                  <th className={OPS_TH_CLASS}>Stage</th>
                  <th className={OPS_TH_NUM_CLASS}>%</th>
                  <th className={OPS_TH_NUM_CLASS}>Amount</th>
                  <th className={OPS_TH_CLASS}>Trigger</th>
                  <th className={OPS_TH_CLASS}>Payable</th>
                  <th className={OPS_TH_CLASS}>Status</th>
                  {canEdit ? <th className={OPS_TH_CLASS}>&nbsp;</th> : null}
                </tr>
              </thead>
              <tbody>
                {contract.milestones.map((milestone) => (
                  <tr className={OPS_TR_CLASS} key={milestone.id}>
                    <td className={OPS_TD_CLASS}>
                      {milestone.label}
                      {milestone.is_retention ? (
                        <span className="ml-1.5 text-xs text-muted-foreground">
                          (retention)
                        </span>
                      ) : null}
                    </td>
                    <td className={OPS_TD_NUM_CLASS}>{Number(milestone.percent)}%</td>
                    <td className={OPS_TD_NUM_CLASS}>
                      {formatZmw(Number(milestone.amount))}
                    </td>
                    <td className={OPS_TD_CLASS}>{milestone.trigger_description || "—"}</td>
                    <td className={OPS_TD_CLASS}>
                      {milestone.payable_within_days} days
                    </td>
                    <td className={OPS_TD_CLASS}>
                      <span className={opsStatusBadgeClass(milestone.status)}>
                        {milestone.status}
                      </span>
                      {milestone.status === "pending" && canCertify && isLive ? (
                        milestone.is_retention ? (
                          contract.completed_at ? (
                            <form
                              action={releaseOpsContractRetentionAction}
                              className="mt-1.5"
                            >
                              <input type="hidden" name="contract_id" value={contract.id} />
                              <input type="hidden" name="milestone_id" value={milestone.id} />
                              <button className={OPS_SECONDARY_BUTTON_CLASS} type="submit">
                                Release retention
                              </button>
                            </form>
                          ) : (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Releases after completion
                            </p>
                          )
                        ) : (
                          <form
                            action={certifyOpsContractMilestoneAction}
                            className="mt-1.5"
                          >
                            <input type="hidden" name="contract_id" value={contract.id} />
                            <input type="hidden" name="milestone_id" value={milestone.id} />
                            <button className={OPS_SECONDARY_BUTTON_CLASS} type="submit">
                              Certify
                            </button>
                          </form>
                        )
                      ) : null}
                      {milestone.payment_request_id ? (
                        <Link
                          className="mt-1 block text-xs font-semibold text-primary-blue underline-offset-2 hover:underline"
                          href="/ops/payment-requests?status=submitted"
                        >
                          In payables
                        </Link>
                      ) : null}
                    </td>
                    {canEdit ? (
                      <td className={OPS_TD_CLASS}>
                        <form action={deleteOpsContractMilestoneAction}>
                          <input type="hidden" name="contract_id" value={contract.id} />
                          <input type="hidden" name="milestone_id" value={milestone.id} />
                          <button
                            aria-label={`Remove ${milestone.label}`}
                            className={OPS_SECONDARY_BUTTON_CLASS}
                            type="submit"
                          >
                            <Trash2 className="size-4" aria-hidden="true" />
                          </button>
                        </form>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {canEdit ? (
            <form
              action={addOpsContractMilestoneAction}
              className="grid gap-3 border-t border-border p-5"
            >
              <input type="hidden" name="contract_id" value={contract.id} />
              <p className="text-sm text-muted-foreground">
                {milestoneTotal.toFixed(1)}% allocated ·{" "}
                <strong className="font-semibold text-foreground">
                  {(100 - milestoneTotal).toFixed(1)}% still to allocate
                </strong>
              </p>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label className={OPS_LABEL_CLASS} htmlFor="milestone_label">
                    Stage
                  </label>
                  <input
                    className={OPS_INPUT_CLASS}
                    id="milestone_label"
                    maxLength={200}
                    name="label"
                    placeholder="Mobilisation"
                    required
                  />
                </div>
                <div>
                  <label className={OPS_LABEL_CLASS} htmlFor="milestone_percent">
                    Percent
                  </label>
                  <input
                    className={OPS_INPUT_CLASS}
                    id="milestone_percent"
                    max={100}
                    min={0}
                    name="percent"
                    step="0.001"
                    type="number"
                    required
                  />
                </div>
                <div>
                  <label className={OPS_LABEL_CLASS} htmlFor="milestone_days">
                    Payable within (days)
                  </label>
                  <input
                    className={OPS_INPUT_CLASS}
                    defaultValue={contract.payment_terms_days}
                    id="milestone_days"
                    min={0}
                    name="payable_within_days"
                    type="number"
                  />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 pb-2 text-sm font-semibold text-foreground">
                    <input name="is_retention" type="checkbox" />
                    This is the retention
                  </label>
                </div>
                <div className="md:col-span-2 lg:col-span-4">
                  <label className={OPS_LABEL_CLASS} htmlFor="milestone_trigger">
                    Trigger
                  </label>
                  <input
                    className={OPS_INPUT_CLASS}
                    id="milestone_trigger"
                    maxLength={1000}
                    name="trigger_description"
                    placeholder="Payable within 14 days of successful completion of setting out and excavation, subject to inspection."
                  />
                </div>
              </div>
              <div>
                <button className={OPS_SECONDARY_BUTTON_CLASS} type="submit">
                  <Plus className="size-4" aria-hidden="true" />
                  Add milestone
                </button>
              </div>
            </form>
          ) : null}
        </section>
      ) : null}

      {/* Clauses */}
      <section className="rounded-lg border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
          <div>
            <h2 className="font-heading text-lg font-bold text-foreground">
              Terms and conditions
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {contract.clauses.length} clause
              {contract.clauses.length === 1 ? "" : "s"}
              {customisedCount > 0
                ? ` · ${customisedCount} amended from the standard template`
                : " · all standard wording"}
            </p>
          </div>
          {!canEdit ? (
            <p className="text-sm text-muted-foreground">
              {contract.status === "draft"
                ? "Your role cannot edit this contract."
                : "Locked — only a draft can be edited."}
            </p>
          ) : null}
        </div>

        <div className="divide-y divide-border">
          {contract.clauses.map((clause) => (
            <div className="p-5" key={clause.id}>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-heading font-bold text-foreground">
                  {clause.heading || clause.section_key}
                </h3>
                {clause.is_required ? (
                  <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                    Required
                  </span>
                ) : null}
                {clause.is_customised ? (
                  <span className={opsStatusBadgeClass("amended", "attention")}>
                    Amended
                  </span>
                ) : null}
              </div>

              {canEdit ? (
                <form action={updateOpsContractClauseAction} className="mt-3 grid gap-3">
                  <input type="hidden" name="clause_id" value={clause.id} />
                  <input type="hidden" name="contract_id" value={contract.id} />
                  <div>
                    <label
                      className={OPS_LABEL_CLASS}
                      htmlFor={`heading-${clause.id}`}
                    >
                      Heading
                    </label>
                    <input
                      className={OPS_INPUT_CLASS}
                      defaultValue={clause.heading}
                      id={`heading-${clause.id}`}
                      maxLength={200}
                      name="heading"
                    />
                  </div>
                  <div>
                    <label className={OPS_LABEL_CLASS} htmlFor={`body-${clause.id}`}>
                      Clause text
                    </label>
                    <textarea
                      className={OPS_INPUT_CLASS}
                      defaultValue={clause.body_markdown}
                      id={`body-${clause.id}`}
                      name="body_markdown"
                      rows={8}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button className={OPS_SECONDARY_BUTTON_CLASS} type="submit">
                      Save clause
                    </button>
                  </div>
                </form>
              ) : (
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                  {clause.body_markdown}
                </p>
              )}

              {clause.is_customised ? (
                <OpsCollapsible
                  className="mt-3"
                  title="Compare against the standard template"
                  tone="warning"
                  variant="inline"
                >
                  <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                    {clause.template_body_snapshot}
                  </p>
                  {canEdit ? (
                    <form action={resetOpsContractClauseAction} className="mt-3">
                      <input type="hidden" name="clause_id" value={clause.id} />
                      <input type="hidden" name="contract_id" value={contract.id} />
                      <button className={OPS_SECONDARY_BUTTON_CLASS} type="submit">
                        <RotateCcw className="size-4" aria-hidden="true" />
                        Restore standard wording
                      </button>
                    </form>
                  ) : null}
                </OpsCollapsible>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      {/* Workflow */}
      {canSubmit || canApprove ? (
        <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <h2 className="font-heading text-lg font-bold text-foreground">
            {canApprove ? "Approval" : "Submit for review"}
          </h2>
          {canApprove && customisedCount > 0 ? (
            <div className={`${OPS_NOTICE_WARNING_CLASS} mt-3`}>
              <AlertTriangle className="mr-1.5 inline size-4" aria-hidden="true" />
              {customisedCount} clause{customisedCount === 1 ? " has" : "s have"} been
              amended from the standard template. Expand &ldquo;Compare against the
              standard template&rdquo; above before approving.
            </div>
          ) : null}
          <form
            action={canApprove ? approveOpsContractAction : submitOpsContractForReviewAction}
            className="mt-4"
          >
            <input type="hidden" name="contract_id" value={contract.id} />
            <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              {canApprove ? "Approve and open for signature" : "Submit for review"}
            </button>
          </form>
        </section>
      ) : null}

      {/* Lifecycle — everything that happens after signature */}
      {contract.status === "issued" && canIssue ? (
        <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <h2 className="font-heading text-lg font-bold text-foreground">
            Record the countersigned copy
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            The counterparty signs on paper. Upload the executed copy here and the
            contract becomes live — internal signatures alone are not an agreement.
          </p>

          <form
            action={recordOpsContractCountersignatureAction}
            className="mt-4 grid gap-3"
          >
            <input type="hidden" name="contract_id" value={contract.id} />
            <OpsDirectUploadField scope="record_attachment" />
            <div>
              <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
                <FileCheck2 className="size-4" aria-hidden="true" />
                Record countersignature
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {isLive || contract.status === "completed" ? (
        <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <h2 className="font-heading text-lg font-bold text-foreground">
            Contract lifecycle
          </h2>

          {contract.signed_document_id ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Signed copy on file.{" "}
              <Link
                className="font-semibold text-primary-blue underline-offset-2 hover:underline"
                href={`/ops/documents?document=${contract.signed_document_id}`}
              >
                Open it in Documents
              </Link>
            </p>
          ) : null}

          {contract.completed_at ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Works completed {formatOpsDate(contract.completed_at)}. Retention releases
              after {contract.defects_liability_months} month
              {contract.defects_liability_months === 1 ? "" : "s"}; the workmanship
              warranty runs {contract.warranty_months} months from completion.
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            {contract.status === "active" && canCertify ? (
              <form action={completeOpsContractAction}>
                <input type="hidden" name="contract_id" value={contract.id} />
                <button className={OPS_SECONDARY_BUTTON_CLASS} type="submit">
                  <CheckCircle2 className="size-4" aria-hidden="true" />
                  Mark works complete
                </button>
              </form>
            ) : null}

            {canEditKind && !contract.parent_contract_id ? (
              <form action={createOpsContractAddendumAction}>
                <input type="hidden" name="contract_id" value={contract.id} />
                <button className={OPS_SECONDARY_BUTTON_CLASS} type="submit">
                  <FilePlus2 className="size-4" aria-hidden="true" />
                  Raise an addendum
                </button>
              </form>
            ) : null}
          </div>

          {canTerminate ? (
            <form action={terminateOpsContractAction} className="mt-5 grid gap-3 sm:max-w-md">
              <input type="hidden" name="contract_id" value={contract.id} />
              <div>
                <label className={OPS_LABEL_CLASS} htmlFor="termination_reason">
                  Terminate this contract — reason
                </label>
                <textarea
                  className={OPS_INPUT_CLASS}
                  id="termination_reason"
                  name="termination_reason"
                  rows={2}
                />
              </div>
              <div>
                <button className={OPS_SECONDARY_BUTTON_CLASS} type="submit">
                  Terminate contract
                </button>
              </div>
            </form>
          ) : null}
        </section>
      ) : null}

      {contract.parent_contract_id ? (
        <div className={OPS_NOTICE_INFO_CLASS}>
          This is addendum {contract.addendum_number} varying an existing contract.{" "}
          <Link
            className="font-semibold underline underline-offset-2"
            href={`/ops/contracts/${contract.parent_contract_id}`}
          >
            Open the contract it varies
          </Link>
        </div>
      ) : null}

      {/* Signatures */}
      <section className="rounded-lg border border-border bg-card shadow-sm">
        <div className="flex items-center gap-3 border-b border-border p-5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary-blue/10 text-primary-blue">
            <FileSignature className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="font-heading text-lg font-bold text-foreground">Signatures</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              HR, then the General Manager, then the Managing Director. Each person signs
              with their own signature; nobody can sign on anyone else&apos;s behalf.
            </p>
          </div>
        </div>

        {contract.signatures.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">
            Signature slots open when the contract is approved.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {contract.signatures.map((signature) => (
              <li className="flex flex-wrap items-center justify-between gap-3 p-5" key={signature.id}>
                <div>
                  <p className="font-semibold text-foreground">
                    {OPS_CONTRACT_SIGNATORY_LABELS[signature.signatory_role]}
                  </p>
                  {signature.status === "signed" ? (
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {signature.signed_name} · signed{" "}
                      {formatOpsDateTime(signature.signed_at)}
                      {signature.verification_code
                        ? ` · verification ${signature.verification_code}`
                        : ""}
                    </p>
                  ) : signature.status === "declined" ? (
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      Declined — {signature.decline_reason}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      Awaiting signature
                    </p>
                  )}
                </div>
                <span className={opsStatusBadgeClass(signature.status)}>
                  {signature.status}
                </span>
              </li>
            ))}
          </ul>
        )}

        {signingOpen && mySlot ? (
          <div className="border-t border-border p-5">
            {isLocalRolePreview ? (
              <div className={OPS_NOTICE_INFO_CLASS}>
                You are in role preview. A preview session cannot sign contracts.
              </div>
            ) : !specimen.has_specimen ? (
              <div className={OPS_NOTICE_WARNING_CLASS}>
                You have not uploaded a signature yet.{" "}
                <Link
                  className="font-semibold underline underline-offset-2"
                  href="/ops/profile"
                >
                  Add one on your profile
                </Link>{" "}
                and come back. Only you will be able to see it.
              </div>
            ) : (
              <>
                <h3 className="font-heading font-bold text-foreground">
                  Sign as {OPS_CONTRACT_SIGNATORY_LABELS[mySlot.signatory_role]}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Your signature will be stamped onto the contract and locked to this
                  exact wording. Re-enter your password to confirm it is you.
                </p>

                <form action={signOpsContractAction} className="mt-4 grid gap-3 sm:max-w-md">
                  <input type="hidden" name="contract_id" value={contract.id} />
                  <input type="hidden" name="signature_id" value={mySlot.id} />
                  <div>
                    <label className={OPS_LABEL_CLASS} htmlFor="password">
                      Your password
                    </label>
                    <input
                      autoComplete="current-password"
                      className={OPS_INPUT_CLASS}
                      id="password"
                      name="password"
                      required
                      type="password"
                    />
                  </div>
                  <div>
                    <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
                      <PenLine className="size-4" aria-hidden="true" />
                      Sign contract
                    </button>
                  </div>
                </form>

                <form
                  action={declineOpsContractSignatureAction}
                  className="mt-6 grid gap-3 sm:max-w-md"
                >
                  <input type="hidden" name="contract_id" value={contract.id} />
                  <input type="hidden" name="signature_id" value={mySlot.id} />
                  <div>
                    <label className={OPS_LABEL_CLASS} htmlFor="decline_reason">
                      Or decline, with a reason
                    </label>
                    <textarea
                      className={OPS_INPUT_CLASS}
                      id="decline_reason"
                      name="decline_reason"
                      rows={3}
                    />
                  </div>
                  <div>
                    <button className={OPS_SECONDARY_BUTTON_CLASS} type="submit">
                      Decline to sign
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}
