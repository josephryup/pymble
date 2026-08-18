import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileSignature,
  PenLine,
  RotateCcw,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { OpsCollapsible } from "@/components/ops/OpsCollapsible";
import { OpsPageHeader } from "@/components/ops/OpsPageHeader";
import { requireOpsUser } from "@/lib/ops/auth";
import {
  approveOpsContractAction,
  declineOpsContractSignatureAction,
  resetOpsContractClauseAction,
  signOpsContractAction,
  submitOpsContractForReviewAction,
  updateOpsContractClauseAction,
} from "@/lib/ops/contract-actions";
import {
  canApproveOpsContract,
  canDraftOpsContractKind,
  canSignOpsContractAs,
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

  const specimen = await fetchMyOpsSignatureSpecimenMeta();

  const canEdit =
    contract.status === "draft" && canDraftOpsContractKind(profile.role, contract.kind);
  const canSubmit = canEdit;
  const canApprove =
    contract.status === "in_review" && canApproveOpsContract(profile.role);
  const signingOpen = ["approved", "issued"].includes(contract.status);

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

      {/* Priced schedule */}
      {contract.lines.length > 0 ? (
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* Milestones */}
      {contract.milestones.length > 0 ? (
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
