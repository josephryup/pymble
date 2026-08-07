import {
  Archive,
  Download,
  FileText,
  LibraryBig,
  Lock,
  Plus,
  Send,
  Shield,
  Trash2,
  Upload,
  UploadCloud,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OpsConfirmSubmitButton } from "@/components/ops/OpsConfirmSubmitButton";
import { OpsListControls, OpsPaginationControls } from "@/components/ops/OpsListControls";
import { fetchOpsModuleAccessOverrides } from "@/lib/ops/module-access";
import { requireOpsUser } from "@/lib/ops/auth";
import {
  addOpsDocumentAttachmentAction,
  archiveOpsDocumentAction,
  removeOpsDocumentAttachmentAction,
  requestDocumentApprovalAction,
  shareOpsDocumentAction,
  unshareOpsDocumentAction,
  uploadOpsDocumentAction,
} from "@/lib/ops/document-actions";
import {
  assignableOpsDocumentVisibilities,
  canMutateOpsDocument,
  OPS_DOCUMENT_VISIBILITY_LABELS,
  OPS_DOCUMENT_VISIBILITY_SHORT,
} from "@/lib/ops/document-permissions";
import {
  fetchOpsDocumentRecipientOptions,
  fetchPaginatedOpsDocumentLibrary,
  type OpsDocumentLibraryItem,
} from "@/lib/ops/documents";
import { parseOpsListState } from "@/lib/ops/listing";
import { canAccessOpsHref } from "@/lib/ops/permissions";
import type { OpsApprovalStatus, OpsDocumentVisibility } from "@/lib/ops/types";
import {
  OPS_DANGER_BUTTON_CLASS,
  OPS_FOCUS_CLASS,
  firstParam,
  OPS_INPUT_CLASS,
  OPS_LABEL_CLASS,
  OPS_PRIMARY_BUTTON_CLASS,
  OPS_SECONDARY_BUTTON_CLASS,
  type OpsSearchParams,
  OPS_NOTICE_SUCCESS_CLASS,
  OPS_NOTICE_ERROR_CLASS,
  opsStatusBadgeClass,
} from "@/lib/ops/ui";
import { formatOpsLabel as formatLabel, formatOpsDate as formatDate } from "@/lib/ops/format";

const FILE_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.jpg,.jpeg,.png,.webp";

type PageProps = { searchParams?: Promise<OpsSearchParams> };

const DOCUMENT_CATEGORIES = [
  { label: "General", value: "general" },
  { label: "Drawing", value: "drawing" },
  { label: "Contract", value: "contract" },
  { label: "Invoice", value: "invoice" },
  { label: "Delivery note", value: "delivery_note" },
  { label: "Engineering", value: "engineering" },
  { label: "Procurement", value: "procurement" },
  { label: "Finance", value: "finance" },
  { label: "HSE", value: "hse" },
  { label: "HR", value: "hr" },
  { label: "Commercial", value: "commercial" },
] as const;

const VISIBILITIES: OpsDocumentVisibility[] = [
  "public",
  "management",
  "finance",
  "md_restricted",
  "private",
];

function documentCategoryFromParam(value: string | undefined) {
  return DOCUMENT_CATEGORIES.some((category) => category.value === value) ? value : undefined;
}

function documentVisibilityFromParam(value: string | undefined) {
  return VISIBILITIES.includes(value as OpsDocumentVisibility)
    ? (value as OpsDocumentVisibility)
    : undefined;
}

function visibilityClass(visibility: OpsDocumentVisibility) {
  switch (visibility) {
    case "public":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "management":
      return "border-indigo-200 bg-indigo-50 text-indigo-700";
    case "finance":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "md_restricted":
      return "border-purple-200 bg-purple-50 text-purple-700";
    default:
      return "border-red-200 bg-red-50 text-red-700";
  }
}

function approvalClass(status: OpsApprovalStatus | null) {
  if (status === "approved") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "rejected" || status === "cancelled") return "border-red-200 bg-red-50 text-red-700";
  if (status === "submitted" || status === "in_review") return "border-sky-200 bg-sky-50 text-sky-700";
  return "border-border bg-card text-muted-foreground";
}

function formatApprovalStatus(status: OpsApprovalStatus | null) {
  return status ? formatLabel(status) : "Not requested";
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function canRequestApproval(document: OpsDocumentLibraryItem) {
  return (
    !document.approval_status ||
    document.approval_status === "rejected" ||
    document.approval_status === "cancelled"
  );
}

function hasOpenApproval(status: OpsApprovalStatus | null) {
  return status === "draft" || status === "submitted" || status === "in_review";
}

const NOTICES: Record<string, string> = {
  document: "Document group created.",
  attachment_added: "Files added to the document.",
  attachment_removed: "File removed from the document.",
  archived: "Document archived.",
  shared: "Document sent — the recipients have been notified.",
  unshared: "Recipient removed from the document.",
};

export default async function OpsDocumentsPage({ searchParams }: PageProps) {
  const [params, auth] = await Promise.all([
    searchParams ?? Promise.resolve({} as OpsSearchParams),
    requireOpsUser(),
  ]);

  if (!canAccessOpsHref(auth.profile.role, "/ops/documents", await fetchOpsModuleAccessOverrides())) {
    notFound();
  }

  const listState = parseOpsListState(params, { defaultPageSize: 10 });
  const category = documentCategoryFromParam(firstParam(params.category));
  const visibility = documentVisibilityFromParam(firstParam(params.visibility));
  const [documentPage, recipientOptions] = await Promise.all([
    fetchPaginatedOpsDocumentLibrary({
      category,
      listState,
      query: listState.query,
      visibility,
    }),
    fetchOpsDocumentRecipientOptions(auth.profile.id),
  ]);
  const documents = documentPage.items;
  const hasActiveListFilter = listState.query.length > 0 || Boolean(category) || Boolean(visibility);
  const assignable = assignableOpsDocumentVisibilities(auth.profile.role);
  const error = firstParam(params.error);
  const createdNotice = firstParam(params.created) === "document" ? NOTICES.document : null;
  const updatedNotice = NOTICES[firstParam(params.updated) ?? ""] ?? null;
  const notice = createdNotice ?? updatedNotice;

  const totalAttachments = documents.reduce((sum, document) => sum + document.versions.length, 0);

  return (
    <div className="w-full max-w-none space-y-6">
      <section className="rounded-lg border border-border bg-card p-5 md:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-blue">
              Controlled Records
            </p>
            <h1 className="mt-2 font-heading text-3xl font-bold text-foreground">
              Document library
            </h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-foreground/68">
              Group related files under one title, control who can see each group, and keep a full
              audit trail. Downloads run through authenticated app routes only.
            </p>
          </div>
          <div className="grid gap-3 min-[420px]:grid-cols-2">
            <div className="rounded-md border border-border px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Document groups
              </p>
              <p className="mt-1 font-heading text-2xl font-bold text-foreground">
                {documentPage.pagination.total}
              </p>
            </div>
            <div className="rounded-md border border-border px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Attachments shown
              </p>
              <p className="mt-1 font-heading text-2xl font-bold text-foreground">
                {totalAttachments}
              </p>
            </div>
          </div>
        </div>
      </section>

      {error ? (
        <div className={OPS_NOTICE_ERROR_CLASS} role="alert">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className={OPS_NOTICE_SUCCESS_CLASS} role="status">
          {notice}
        </div>
      ) : null}

      <section className="rounded-lg border border-border bg-card p-5">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-md bg-primary-blue text-white">
            <Upload className="size-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="font-heading text-xl font-bold text-foreground">New document group</h2>
            <p className="text-sm text-muted-foreground">
              One title, one visibility level, and one or more files. Send it to specific people and
              they are notified straight away — whatever the visibility level.
            </p>
          </div>
        </div>
        <form action={uploadOpsDocumentAction} className="grid gap-4">
          <div className="grid gap-4 min-[520px]:grid-cols-2 lg:grid-cols-6">
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
              Group title
              <input className={OPS_INPUT_CLASS} name="title" placeholder="e.g. Rubis contract pack" required />
            </label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
              Category
              <select className={OPS_INPUT_CLASS} defaultValue="general" name="category">
                {DOCUMENT_CATEGORIES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
              Visibility
              <select className={OPS_INPUT_CLASS} defaultValue="private" name="visibility">
                {assignable.map((tier) => (
                  <option key={tier} value={tier}>
                    {OPS_DOCUMENT_VISIBILITY_LABELS[tier]}
                  </option>
                ))}
              </select>
            </label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-4`}>
              Description
              <input className={OPS_INPUT_CLASS} name="description" placeholder="Optional notes" />
            </label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
              Files (up to 10)
              <input accept={FILE_ACCEPT} className={OPS_INPUT_CLASS} multiple name="documents" required type="file" />
            </label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-6`}>
              Send to (optional)
              <select
                className={`${OPS_INPUT_CLASS} h-auto`}
                multiple
                name="recipient_ids"
                size={Math.min(Math.max(recipientOptions.length, 3), 8)}
              >
                {recipientOptions.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.full_name}
                  </option>
                ))}
              </select>
              <span className="mt-1 text-xs font-normal text-muted-foreground">
                Hold Ctrl (or Cmd) to pick several. Everyone you choose is notified and can open the
                document even when the visibility level would otherwise hide it from them.
              </span>
            </label>
          </div>
          <div>
            <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
              <Upload className="size-4" aria-hidden="true" />
              Create document group
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between gap-3 border-b border-border p-5">
          <div>
            <h2 className="font-heading text-xl font-bold text-foreground">Documents</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Each group shows every file it holds and who can see it.
            </p>
          </div>
          <LibraryBig className="size-6 shrink-0 text-primary-blue" aria-hidden="true" />
        </div>
        <OpsListControls
          action="/ops/documents"
          filters={[
            {
              label: "Category",
              name: "category",
              options: [
                { label: "All categories", value: "" },
                ...DOCUMENT_CATEGORIES.map((item) => ({ label: item.label, value: item.value })),
              ],
              value: category ?? "",
            },
            {
              label: "Visibility",
              name: "visibility",
              options: [
                { label: "All visibility", value: "" },
                ...VISIBILITIES.map((tier) => ({
                  label: OPS_DOCUMENT_VISIBILITY_SHORT[tier],
                  value: tier,
                })),
              ],
              value: visibility ?? "",
            },
          ]}
          placeholder="Search by document title"
          query={listState.query}
          resultLabel="documents"
        />

        {documents.length > 0 ? (
          <ul className="divide-y divide-border">
            {documents.map((document) => {
              const canEdit = canMutateOpsDocument(auth.profile.id, auth.profile.role, document);
              const sentToMe = document.recipients.some(
                (recipient) => recipient.id === auth.profile.id,
              );
              // Already-shared people and the uploader are not offerable again.
              const shareableWith = recipientOptions.filter(
                (person) =>
                  person.id !== document.uploaded_by &&
                  !document.recipients.some((recipient) => recipient.id === person.id),
              );
              const isApprovalOpen = hasOpenApproval(document.approval_status);
              const canRequest = canEdit && canRequestApproval(document);
              const attachments = [...document.versions].sort(
                (a, b) => a.version_number - b.version_number,
              );

              return (
                <li key={document.document_id} className="p-5">
                  <div className="flex flex-col gap-3 min-[760px]:flex-row min-[760px]:items-start min-[760px]:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-dark text-white">
                        <FileText className="size-5" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-heading text-lg font-bold text-foreground">{document.title}</p>
                        <p className="mt-0.5 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                          {formatLabel(document.category)} · {attachments.length} file
                          {attachments.length === 1 ? "" : "s"} ·{" "}
                          {document.uploader?.full_name ?? "Unknown"} · {formatDate(document.created_at)}
                        </p>
                        {document.description ? (
                          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                            {document.description}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {sentToMe ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-emerald-700">
                          <Send className="size-3" aria-hidden="true" />
                          Sent to you
                        </span>
                      ) : null}
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${visibilityClass(document.visibility)}`}>
                        <Lock className="size-3" aria-hidden="true" />
                        {OPS_DOCUMENT_VISIBILITY_SHORT[document.visibility]}
                      </span>
                      <span className={opsStatusBadgeClass(document.status)}>
                        {document.status}
                      </span>
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${approvalClass(document.approval_status)}`}>
                        {formatApprovalStatus(document.approval_status)}
                      </span>
                    </div>
                  </div>

                  <ul className="mt-4 grid gap-2">
                    {attachments.map((attachment) => (
                      <li
                        key={attachment.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-muted/40 px-3 py-2.5"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-foreground">
                              {attachment.file_name}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {formatBytes(attachment.file_size_bytes)}
                            </span>
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <a
                            className={OPS_SECONDARY_BUTTON_CLASS}
                            href={`/api/ops/documents/${attachment.id}/download`}
                          >
                            <Download className="size-4" aria-hidden="true" />
                            Download
                          </a>
                          {canEdit && !isApprovalOpen && attachments.length > 1 ? (
                            <form action={removeOpsDocumentAttachmentAction}>
                              <input name="document_id" type="hidden" value={document.document_id} />
                              <input name="version_id" type="hidden" value={attachment.id} />
                              <OpsConfirmSubmitButton
                                className={OPS_DANGER_BUTTON_CLASS}
                                confirmText="Confirm remove"
                              >
                                <Trash2 className="size-4" aria-hidden="true" />
                                Remove
                              </OpsConfirmSubmitButton>
                            </form>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>

                  {document.recipients.length > 0 ? (
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        Sent to
                      </span>
                      {document.recipients.map((recipient) => (
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 py-1 pl-2.5 pr-1.5 text-xs font-semibold text-foreground"
                          key={recipient.id}
                        >
                          <Users className="size-3 text-muted-foreground" aria-hidden="true" />
                          {recipient.full_name}
                          {canEdit ? (
                            <form action={unshareOpsDocumentAction} className="contents">
                              <input name="document_id" type="hidden" value={document.document_id} />
                              <input name="recipient_id" type="hidden" value={recipient.id} />
                              <button
                                aria-label={`Stop sharing ${document.title} with ${recipient.full_name}`}
                                className={`rounded-full p-0.5 text-muted-foreground transition hover:text-red-600 ${OPS_FOCUS_CLASS}`}
                                type="submit"
                              >
                                <X className="size-3.5" aria-hidden="true" />
                              </button>
                            </form>
                          ) : null}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {canEdit && !isApprovalOpen && shareableWith.length > 0 ? (
                      <details className="group rounded-md border border-border">
                        <summary className={`flex min-h-11 cursor-pointer list-none items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-foreground transition hover:text-primary-blue [&::-webkit-details-marker]:hidden ${OPS_FOCUS_CLASS}`}>
                          <Users className="size-4" aria-hidden="true" />
                          Send to people
                        </summary>
                        <form action={shareOpsDocumentAction} className="grid gap-2 border-t border-border p-3">
                          <input name="document_id" type="hidden" value={document.document_id} />
                          <select
                            className={`${OPS_INPUT_CLASS} h-auto`}
                            multiple
                            name="recipient_ids"
                            required
                            size={Math.min(Math.max(shareableWith.length, 3), 8)}
                          >
                            {shareableWith.map((person) => (
                              <option key={person.id} value={person.id}>
                                {person.full_name}
                              </option>
                            ))}
                          </select>
                          <button className={`${OPS_SECONDARY_BUTTON_CLASS} w-full`} type="submit">
                            <Send className="size-4" aria-hidden="true" />
                            Send and notify
                          </button>
                        </form>
                      </details>
                    ) : null}
                    {document.approval_request_id ? (
                      <Link className={OPS_SECONDARY_BUTTON_CLASS} href={`/ops/approvals/${document.approval_request_id}`}>
                        View approval
                      </Link>
                    ) : null}
                    {canRequest ? (
                      <form action={requestDocumentApprovalAction}>
                        <input name="document_id" type="hidden" value={document.document_id} />
                        <OpsConfirmSubmitButton className={OPS_SECONDARY_BUTTON_CLASS} confirmText="Confirm request">
                          <Send className="size-4" aria-hidden="true" />
                          Request approval
                        </OpsConfirmSubmitButton>
                      </form>
                    ) : null}
                    {canEdit && !isApprovalOpen ? (
                      <details className="group rounded-md border border-border">
                        <summary className={`flex min-h-11 cursor-pointer list-none items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-foreground transition hover:text-primary-blue [&::-webkit-details-marker]:hidden ${OPS_FOCUS_CLASS}`}>
                          <Plus className="size-4" aria-hidden="true" />
                          Add files
                        </summary>
                        <form action={addOpsDocumentAttachmentAction} className="grid gap-2 border-t border-border p-3">
                          <input name="document_id" type="hidden" value={document.document_id} />
                          <input accept={FILE_ACCEPT} className={OPS_INPUT_CLASS} multiple name="documents" required type="file" />
                          <OpsConfirmSubmitButton className={`${OPS_SECONDARY_BUTTON_CLASS} w-full`} confirmText="Confirm upload">
                            <UploadCloud className="size-4" aria-hidden="true" />
                            Add to group
                          </OpsConfirmSubmitButton>
                        </form>
                      </details>
                    ) : null}
                    {canEdit && !isApprovalOpen ? (
                      <form action={archiveOpsDocumentAction}>
                        <input name="document_id" type="hidden" value={document.document_id} />
                        <OpsConfirmSubmitButton className={OPS_DANGER_BUTTON_CLASS} confirmText="Confirm archive">
                          <Archive className="size-4" aria-hidden="true" />
                          Archive group
                        </OpsConfirmSubmitButton>
                      </form>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="flex min-h-72 flex-col items-center justify-center gap-3 p-8 text-center">
            <Shield className="size-10 text-primary-blue" aria-hidden="true" />
            <div>
              <p className="font-heading text-xl font-bold text-foreground">
                {hasActiveListFilter ? "No matching documents" : "No documents uploaded yet"}
              </p>
              <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
                {hasActiveListFilter
                  ? "Adjust the search, category, or visibility filter to widen the list."
                  : "Create a document group above — give it a title, choose who can see it, and attach one or more files."}
              </p>
            </div>
          </div>
        )}
        <OpsPaginationControls
          basePath="/ops/documents"
          filters={[
            { label: "Category", name: "category", options: [], value: category ?? "" },
            { label: "Visibility", name: "visibility", options: [], value: visibility ?? "" },
          ]}
          pagination={documentPage.pagination}
          query={listState.query}
          resultLabel="documents"
        />
      </section>
    </div>
  );
}
