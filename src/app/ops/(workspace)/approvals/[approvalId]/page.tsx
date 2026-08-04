import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Download, FileText, MessageSquare, ShieldCheck, XCircle } from "lucide-react";
import { OpsInlineEmpty } from "@/components/ops/OpsInlineEmpty";
import { OpsConfirmSubmitButton } from "@/components/ops/OpsConfirmSubmitButton";
import { requireOpsUser } from "@/lib/ops/auth";
import {
  addOpsApprovalCommentAction,
  decideOpsApprovalAction,
} from "@/lib/ops/approval-actions";
import {
  fetchOpsApprovalComments,
  fetchOpsApprovalRequest,
  fetchOpsApprovalSteps,
  type OpsApprovalStepSummary,
} from "@/lib/ops/approvals";
import { fetchOpsDocumentById } from "@/lib/ops/documents";
import { canOverrideApprovalDecision } from "@/lib/ops/permissions";
import { formatOpsRole, formatOpsUserName, isManagingDirectorRole } from "@/lib/ops/roles";
import {
  firstParam,
  OPS_DANGER_BUTTON_CLASS,
  OPS_INPUT_CLASS,
  OPS_LABEL_CLASS,
  OPS_PRIMARY_BUTTON_CLASS,
  OPS_SECONDARY_BUTTON_CLASS,
  type OpsSearchParams,
  opsStatusBadgeClass,
} from "@/lib/ops/ui";
import type { OpsUserRole } from "@/lib/ops/types";
import { formatOpsLabel as formatLabel, formatOpsDateTime as formatDateTime } from "@/lib/ops/format";

type PageProps = {
  params: Promise<{ approvalId: string }>;
  searchParams?: Promise<OpsSearchParams>;
};

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${bytes} B`;
}

function sourceRecordHref(sourceTable: string) {
  if (sourceTable === "documents") {
    return "/ops/documents";
  }

  if (sourceTable === "material_requests") {
    return "/ops/material-requests";
  }

  if (sourceTable === "purchase_orders") {
    return "/ops/rfq-po";
  }

  return null;
}

function canDecideCurrentStep(
  role: OpsUserRole,
  userId: string,
  step: OpsApprovalStepSummary | undefined,
  requestedBy: string | null,
) {
  if (!step || step.status !== "pending") {
    return false;
  }

  if (requestedBy === userId && !canOverrideApprovalDecision(role)) {
    return false;
  }

  if (canOverrideApprovalDecision(role)) {
    return true;
  }

  if (step.approver_user_id === userId) {
    return true;
  }

  if (!step.approver_role) {
    return false;
  }

  return step.approver_role === role || (
    step.approver_role === "managing_director" &&
    isManagingDirectorRole(role)
  );
}

function approvalNotice(params: OpsSearchParams) {
  const error = firstParam(params.error);

  if (error) {
    return {
      message: error,
      tone: "error" as const,
    };
  }

  const updated = firstParam(params.updated);

  if (updated === "approved") {
    return {
      message: "Approval request approved.",
      tone: "success" as const,
    };
  }

  if (updated === "rejected") {
    return {
      message: "Approval request rejected.",
      tone: "success" as const,
    };
  }

  if (updated === "comment") {
    return {
      message: "Comment added.",
      tone: "success" as const,
    };
  }

  if (firstParam(params.created) === "document_approval") {
    return {
      message: "Document approval request created.",
      tone: "success" as const,
    };
  }

  if (firstParam(params.created) === "material_request_approval") {
    return {
      message: "Material request approval created.",
      tone: "success" as const,
    };
  }

  if (firstParam(params.created) === "purchase_order_approval") {
    return {
      message: "Purchase order approval created.",
      tone: "success" as const,
    };
  }

  return null;
}

export default async function OpsApprovalDetailPage({ params, searchParams }: PageProps) {
  const [{ approvalId }, resolvedSearchParams, auth] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({} as OpsSearchParams),
    requireOpsUser(),
  ]);

  const [request, steps, comments] = await Promise.all([
    fetchOpsApprovalRequest(approvalId),
    fetchOpsApprovalSteps(approvalId),
    fetchOpsApprovalComments(approvalId),
  ]);

  if (!request) {
    notFound();
  }

  const sourceDocument =
    request.module_key === "documents" && request.source_table === "documents"
      ? await fetchOpsDocumentById(request.source_id)
      : null;
  const currentStep = steps.find((step) => step.status === "pending");
  const canDecide = canDecideCurrentStep(
    auth.profile.role,
    auth.profile.id,
    currentStep,
    request.requested_by,
  );
  const notice = approvalNotice(resolvedSearchParams);
  const currentDocumentVersion = sourceDocument?.versions.find(
    (version) => version.version_number === sourceDocument.current_version_number,
  ) ?? sourceDocument?.versions[0];
  const sourceHref = sourceRecordHref(request.source_table);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="rounded-lg border border-border bg-card p-5 md:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-blue">
              Approval Detail
            </p>
            <h1 className="mt-2 font-heading text-3xl font-bold text-foreground">
              {request.title}
            </h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-foreground/68">
              {request.description || "Review the approval source, timeline, and comments before deciding."}
            </p>
          </div>
          <div className="grid gap-3 min-[520px]:grid-cols-2">
            <div className="rounded-md border border-border px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Status
              </p>
              <span
                className={`mt-2 ${opsStatusBadgeClass(request.status)}`}
              >
                {formatLabel(request.status)}
              </span>
            </div>
            <div className="rounded-md border border-border px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Requested
              </p>
              <p className="mt-2 text-sm font-bold text-foreground">
                {formatDateTime(request.submitted_at ?? request.created_at)}
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

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-6">
          <section className="rounded-lg border border-border bg-card">
            <div className="flex items-center justify-between gap-3 border-b border-border p-5">
              <div>
                <h2 className="font-heading text-xl font-bold text-foreground">
                  Source record
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  The operational record attached to this approval.
                </p>
              </div>
              <FileText className="size-6 shrink-0 text-primary-blue" aria-hidden="true" />
            </div>

            {sourceDocument ? (
              <div className="p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="font-heading text-xl font-bold text-foreground">
                      {sourceDocument.title}
                    </p>
                    <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      {formatLabel(sourceDocument.category)} / {formatLabel(sourceDocument.visibility)}
                    </p>
                    {sourceDocument.description ? (
                      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                        {sourceDocument.description}
                      </p>
                    ) : null}
                  </div>
                  {currentDocumentVersion ? (
                    <a
                      className={OPS_SECONDARY_BUTTON_CLASS}
                      href={`/api/ops/documents/${currentDocumentVersion.id}/download`}
                    >
                      <Download className="size-4" aria-hidden="true" />
                      Download document
                    </a>
                  ) : null}
                </div>
                {currentDocumentVersion ? (
                  <div className="mt-5 grid gap-3 min-[520px]:grid-cols-3">
                    <div className="rounded-md border border-border px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        Version
                      </p>
                      <p className="mt-1 font-bold text-foreground">
                        v{currentDocumentVersion.version_number}
                      </p>
                    </div>
                    <div className="rounded-md border border-border px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        File
                      </p>
                      <p className="mt-1 truncate font-bold text-foreground">
                        {currentDocumentVersion.file_name}
                      </p>
                    </div>
                    <div className="rounded-md border border-border px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        Size
                      </p>
                      <p className="mt-1 font-bold text-foreground">
                        {formatBytes(currentDocumentVersion.file_size_bytes)}
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="p-5">
                <p className="text-sm leading-6 text-muted-foreground">
                  Source details are available from the linked module register.
                </p>
                <div className="mt-4 grid gap-3 min-[520px]:grid-cols-3">
                  <div className="rounded-md border border-border px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Module
                    </p>
                    <p className="mt-1 font-bold text-foreground">
                      {formatLabel(request.module_key)}
                    </p>
                  </div>
                  <div className="rounded-md border border-border px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Source
                    </p>
                    <p className="mt-1 font-bold text-foreground">
                      {formatLabel(request.source_table)}
                    </p>
                  </div>
                  {sourceHref ? (
                    <div className="flex items-end">
                      <Link className={`${OPS_SECONDARY_BUTTON_CLASS} w-full justify-center`} href={sourceHref}>
                        Open source register
                      </Link>
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </section>

          <section className="rounded-lg border border-border bg-card">
            <div className="border-b border-border p-5">
              <h2 className="font-heading text-xl font-bold text-foreground">
                Approval timeline
              </h2>
            </div>
            <ol className="divide-y divide-border">
              {steps.map((step) => (
                <li className="p-5" key={step.id}>
                  <div className="flex items-start gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary-dark text-white">
                      <ShieldCheck className="size-4" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col gap-2 min-[520px]:flex-row min-[520px]:items-center min-[520px]:justify-between">
                        <div>
                          <p className="font-bold text-foreground">
                            {step.step_label || `Step ${step.step_number}`}
                          </p>
                          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                            {step.approver_role
                              ? formatOpsRole(step.approver_role)
                              : "Named approver"}
                          </p>
                        </div>
                        <span
                          className={`w-fit ${opsStatusBadgeClass(step.status)}`}
                        >
                          {formatLabel(step.status)}
                        </span>
                      </div>
                      {step.decision_user ? (
                        <p className="mt-3 text-sm text-muted-foreground">
                          Decided by <strong>{step.decision_user.full_name}</strong> on{" "}
                          {formatDateTime(step.decision_at)}.
                        </p>
                      ) : (
                        <p className="mt-3 text-sm text-muted-foreground">
                          Waiting for decision.
                        </p>
                      )}
                      {step.comments ? (
                        <p className="mt-3 rounded-md bg-muted/40 p-3 text-sm leading-6 text-foreground/70">
                          {step.comments}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="rounded-lg border border-border bg-card">
            <div className="border-b border-border p-5">
              <h2 className="font-heading text-xl font-bold text-foreground">
                Comments
              </h2>
            </div>
            {comments.length > 0 ? (
              <ol className="divide-y divide-border">
                {comments.map((comment) => (
                  <li className="p-5" key={comment.id}>
                    <div className="flex items-start gap-3">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary-blue text-white">
                        <MessageSquare className="size-4" aria-hidden="true" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-col gap-1 min-[520px]:flex-row min-[520px]:items-center min-[520px]:justify-between">
                          <p className="font-bold text-foreground">
                            {formatOpsUserName(comment.author?.full_name, comment.author_id)}
                          </p>
                          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                            {formatDateTime(comment.created_at)}
                          </p>
                        </div>
                        {comment.author ? (
                          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                            {formatOpsRole(comment.author.role)}
                          </p>
                        ) : null}
                        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-foreground/70">
                          {comment.body}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <OpsInlineEmpty>No comments yet.</OpsInlineEmpty>
            )}
            <form action={addOpsApprovalCommentAction} className="border-t border-border p-5">
              <input name="approval_request_id" type="hidden" value={request.id} />
              <label className={OPS_LABEL_CLASS}>
                Add comment
                <textarea
                  className={`${OPS_INPUT_CLASS} min-h-28 resize-y`}
                  name="body"
                  required
                />
              </label>
              <button className={`${OPS_SECONDARY_BUTTON_CLASS} mt-3`} type="submit">
                <MessageSquare className="size-4" aria-hidden="true" />
                Add comment
              </button>
            </form>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="rounded-lg border border-border bg-card p-5">
            <h2 className="font-heading text-xl font-bold text-foreground">
              Decision
            </h2>
            {canDecide && currentStep ? (
              <div className="mt-4 space-y-4">
                <form action={decideOpsApprovalAction} className="space-y-3">
                  <input name="approval_request_id" type="hidden" value={request.id} />
                  <input name="action" type="hidden" value="approve" />
                  <label className={OPS_LABEL_CLASS}>
                    Approval note
                    <textarea
                      className={`${OPS_INPUT_CLASS} min-h-24 resize-y`}
                      name="comment"
                    />
                  </label>
                  <OpsConfirmSubmitButton
                    className={`${OPS_PRIMARY_BUTTON_CLASS} w-full`}
                    confirmText="Confirm approval"
                  >
                    <CheckCircle2 className="size-4" aria-hidden="true" />
                    Approve
                  </OpsConfirmSubmitButton>
                </form>
                <form action={decideOpsApprovalAction} className="space-y-3 border-t border-border pt-4">
                  <input name="approval_request_id" type="hidden" value={request.id} />
                  <input name="action" type="hidden" value="reject" />
                  <label className={OPS_LABEL_CLASS}>
                    Rejection reason
                    <textarea
                      className={`${OPS_INPUT_CLASS} min-h-24 resize-y`}
                      name="comment"
                      required
                    />
                  </label>
                  <OpsConfirmSubmitButton
                    className={`${OPS_DANGER_BUTTON_CLASS} w-full justify-center py-3`}
                    confirmText="Confirm rejection"
                  >
                    <XCircle className="size-4" aria-hidden="true" />
                    Reject
                  </OpsConfirmSubmitButton>
                </form>
              </div>
            ) : (
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {request.status === "approved" || request.status === "rejected"
                  ? "This request has already been decided."
                  : "This request is waiting for the assigned approver."}
              </p>
            )}
          </section>

          <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/approvals">
            Back to approvals
          </Link>
        </aside>
      </section>
    </div>
  );
}
