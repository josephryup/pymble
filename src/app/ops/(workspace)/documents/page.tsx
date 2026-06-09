import { Archive, Download, FileText, LibraryBig, Send, Shield, Upload, UploadCloud } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OpsConfirmSubmitButton } from "@/components/ops/OpsConfirmSubmitButton";
import { OpsListControls, OpsPaginationControls } from "@/components/ops/OpsListControls";
import {
  OpsMobileRecordCard,
  OpsMobileRecordList,
  OpsMobileRecordRow,
} from "@/components/ops/OpsMobileRecord";
import { requireOpsUser } from "@/lib/ops/auth";
import {
  archiveOpsDocumentAction,
  requestDocumentApprovalAction,
  uploadOpsDocumentAction,
  uploadOpsDocumentVersionAction,
} from "@/lib/ops/document-actions";
import { fetchPaginatedOpsDocumentLibrary, type OpsDocumentLibraryItem } from "@/lib/ops/documents";
import { parseOpsListState } from "@/lib/ops/listing";
import {
  canAccessOpsHref,
  canManageOps,
  canViewSensitiveOpsFoundation,
} from "@/lib/ops/permissions";
import {
  OPS_DANGER_BUTTON_CLASS,
  OPS_FOCUS_CLASS,
  firstParam,
  OPS_INPUT_CLASS,
  OPS_LABEL_CLASS,
  OPS_PRIMARY_BUTTON_CLASS,
  OPS_SECONDARY_BUTTON_CLASS,
  OPS_TABLE_SCROLL_CLASS,
  type OpsSearchParams,
} from "@/lib/ops/ui";
import type { OpsApprovalStatus, OpsDocumentStatus, OpsDocumentVisibility } from "@/lib/ops/types";

type PageProps = {
  searchParams?: Promise<OpsSearchParams>;
};

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

function documentCategoryFromParam(value: string | undefined) {
  return DOCUMENT_CATEGORIES.some((category) => category.value === value) ? value : undefined;
}

function statusClass(status: OpsDocumentStatus) {
  if (status === "active") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "superseded") {
    return "border-orange-200 bg-orange-50 text-orange-700";
  }

  return "border-primary-dark/15 bg-primary-dark/[0.03] text-primary-dark/55";
}

function visibilityClass(visibility: OpsDocumentVisibility) {
  if (visibility === "company") {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }

  if (visibility === "private") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  return "border-primary-dark/15 bg-white text-primary-dark/65";
}

function approvalClass(status: OpsApprovalStatus | null) {
  if (status === "approved") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "rejected" || status === "cancelled") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (status === "submitted" || status === "in_review") {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }

  return "border-primary-dark/15 bg-white text-primary-dark/55";
}

function formatLabel(value: string) {
  return value.replace(/_/g, " ");
}

function formatApprovalStatus(status: OpsApprovalStatus | null) {
  if (!status) {
    return "Not requested";
  }

  return formatLabel(status);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-ZM", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${bytes} B`;
}

function currentVersion(document: OpsDocumentLibraryItem) {
  return (
    document.versions.find(
      (version) => version.version_number === document.current_version_number,
    ) ?? document.versions[0]
  );
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

function canManageDocument(
  document: OpsDocumentLibraryItem,
  userId: string,
  canUpload: boolean,
  canControlAllDocuments: boolean,
) {
  return canUpload && (canControlAllDocuments || document.uploaded_by === userId);
}

type DocumentActionsProps = {
  canEdit: boolean;
  document: OpsDocumentLibraryItem;
  version: ReturnType<typeof currentVersion>;
};

function DocumentActions({ canEdit, document, version }: DocumentActionsProps) {
  const isApprovalOpen = hasOpenApproval(document.approval_status);
  const canRequest = canEdit && canRequestApproval(document);

  return (
    <div className="grid min-w-44 gap-2">
      {version ? (
        <a
          className={OPS_SECONDARY_BUTTON_CLASS}
          href={`/api/ops/documents/${version.id}/download`}
        >
          <Download className="size-4" aria-hidden="true" />
          Download document
        </a>
      ) : null}
      {document.approval_request_id ? (
        <Link
          className={OPS_SECONDARY_BUTTON_CLASS}
          href={`/ops/approvals/${document.approval_request_id}`}
        >
          View approval
        </Link>
      ) : null}
      {canRequest ? (
        <form action={requestDocumentApprovalAction}>
          <input name="document_id" type="hidden" value={document.document_id} />
          <OpsConfirmSubmitButton
            className={`${OPS_SECONDARY_BUTTON_CLASS} w-full`}
            confirmText="Confirm request"
          >
            <Send className="size-4" aria-hidden="true" />
            Request approval
          </OpsConfirmSubmitButton>
        </form>
      ) : null}
      {canEdit && !isApprovalOpen ? (
        <details className="group rounded-md border border-primary-dark/10">
          <summary className={`flex min-h-11 cursor-pointer list-none items-center justify-center gap-2 px-4 py-3 text-sm font-bold text-primary-dark transition hover:text-primary-blue [&::-webkit-details-marker]:hidden ${OPS_FOCUS_CLASS}`}>
            <UploadCloud className="size-4" aria-hidden="true" />
            New version
          </summary>
          <form
            action={uploadOpsDocumentVersionAction}
            className="grid gap-2 border-t border-primary-dark/10 p-2"
          >
            <input name="document_id" type="hidden" value={document.document_id} />
            <label className={OPS_LABEL_CLASS}>
              Replacement file
              <input
                accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.jpg,.jpeg,.png,.webp"
                className={OPS_INPUT_CLASS}
                name="document"
                required
                type="file"
              />
            </label>
            <OpsConfirmSubmitButton
              className={`${OPS_SECONDARY_BUTTON_CLASS} w-full`}
              confirmText="Confirm upload"
            >
              <UploadCloud className="size-4" aria-hidden="true" />
              Upload version
            </OpsConfirmSubmitButton>
          </form>
        </details>
      ) : null}
      {canEdit && !isApprovalOpen ? (
        <form action={archiveOpsDocumentAction}>
          <input name="document_id" type="hidden" value={document.document_id} />
          <OpsConfirmSubmitButton
            className={`${OPS_DANGER_BUTTON_CLASS} w-full`}
            confirmText="Confirm archive"
          >
            <Archive className="size-4" aria-hidden="true" />
            Archive
          </OpsConfirmSubmitButton>
        </form>
      ) : null}
    </div>
  );
}

export default async function OpsDocumentsPage({ searchParams }: PageProps) {
  const [params, auth] = await Promise.all([
    searchParams ?? Promise.resolve({} as OpsSearchParams),
    requireOpsUser(),
  ]);

  if (!canAccessOpsHref(auth.profile.role, "/ops/documents")) {
    notFound();
  }

  const listState = parseOpsListState(params, { defaultPageSize: 10 });
  const category = documentCategoryFromParam(firstParam(params.category));
  const documentPage = await fetchPaginatedOpsDocumentLibrary({
    category,
    listState,
    query: listState.query,
  });
  const documents = documentPage.items;
  const hasActiveListFilter = listState.query.length > 0 || Boolean(category);
  const canUpload = canManageOps(auth.profile.role);
  const canControlAllDocuments = canViewSensitiveOpsFoundation(auth.profile.role);
  const error = firstParam(params.error);
  const created = firstParam(params.created) === "document";
  const updated = firstParam(params.updated);
  const uploadedNewVersion = updated === "version_uploaded";
  const archived = updated === "archived";
  const totalVersions = documents.reduce(
    (sum, document) => sum + document.current_version_number,
    0,
  );
  const controlledDocuments = documents.filter((document) =>
    ["drawing", "contract", "hse", "hr"].includes(document.category),
  ).length;

  return (
    <div className="w-full max-w-none space-y-6">
      <section className="rounded-lg border border-primary-dark/10 bg-white p-5 md:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-blue">
              Controlled Records
            </p>
            <h1 className="mt-2 font-heading text-3xl font-bold text-primary-dark">
              Document library
            </h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-primary-dark/68">
              Store internal documents securely while keeping searchable metadata, versions,
              visibility, and audit history.
            </p>
          </div>
          <div className="grid gap-3 min-[520px]:grid-cols-3">
            <div className="rounded-md border border-primary-dark/10 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-dark/45">
                Documents
              </p>
              <p className="mt-1 font-heading text-2xl font-bold text-primary-dark">
                {documentPage.pagination.total}
              </p>
            </div>
            <div className="rounded-md border border-primary-dark/10 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-dark/45">
                Shown versions
              </p>
              <p className="mt-1 font-heading text-2xl font-bold text-primary-dark">
                {totalVersions}
              </p>
            </div>
            <div className="rounded-md border border-primary-dark/10 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-dark/45">
                Controlled shown
              </p>
              <p className="mt-1 font-heading text-2xl font-bold text-primary-dark">
                {controlledDocuments}
              </p>
            </div>
          </div>
        </div>
      </section>

      {error ? (
        <div
          className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      {created ? (
        <div
          className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700"
          role="status"
        >
          Document uploaded successfully.
        </div>
      ) : null}

      {uploadedNewVersion ? (
        <div
          className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700"
          role="status"
        >
          New document version uploaded successfully.
        </div>
      ) : null}

      {archived ? (
        <div
          className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700"
          role="status"
        >
          Document archived successfully.
        </div>
      ) : null}

      {canUpload ? (
        <section className="rounded-lg border border-primary-dark/10 bg-white p-5">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-md bg-primary-blue text-white">
              <Upload className="size-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="font-heading text-xl font-bold text-primary-dark">
                Upload document
              </h2>
              <p className="text-sm text-primary-dark/60">
                Files stay private. The app stores only controlled metadata and version records.
              </p>
            </div>
          </div>
          <form
            action={uploadOpsDocumentAction}
            className="grid gap-4"
          >
            <div className="grid gap-4 min-[520px]:grid-cols-2 lg:grid-cols-6">
              <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
                Title
                <input className={OPS_INPUT_CLASS} name="title" required />
              </label>
              <label className={OPS_LABEL_CLASS}>
                Category
                <select className={OPS_INPUT_CLASS} defaultValue="general" name="category">
                  {DOCUMENT_CATEGORIES.map((category) => (
                    <option key={category.value} value={category.value}>
                      {category.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={OPS_LABEL_CLASS}>
                Visibility
                <select className={OPS_INPUT_CLASS} defaultValue="restricted" name="visibility">
                  <option value="restricted">Restricted</option>
                  <option value="company">Company</option>
                  <option value="private">Private</option>
                </select>
              </label>
              <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
                File
                <input
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.jpg,.jpeg,.png,.webp"
                  className={OPS_INPUT_CLASS}
                  name="document"
                  required
                  type="file"
                />
              </label>
              <label className={`${OPS_LABEL_CLASS} min-[520px]:col-span-2 lg:col-span-5`}>
                Description
                <input className={OPS_INPUT_CLASS} name="description" />
              </label>
              <div className="flex items-end">
                <button className={`${OPS_PRIMARY_BUTTON_CLASS} w-full`} type="submit">
                  <Upload className="size-4" aria-hidden="true" />
                  Upload
                </button>
              </div>
            </div>
          </form>
        </section>
      ) : (
        <div className="rounded-md border border-primary-dark/10 bg-white px-4 py-3 text-sm text-primary-dark/65">
          Your role has read-only access to the document library.
        </div>
      )}

      <section className="rounded-lg border border-primary-dark/10 bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-primary-dark/10 p-5">
          <div>
            <h2 className="font-heading text-xl font-bold text-primary-dark">
              Current documents
            </h2>
            <p className="mt-1 text-sm text-primary-dark/60">
              Download links are generated through authenticated app routes.
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
                ...DOCUMENT_CATEGORIES.map((item) => ({
                  label: item.label,
                  value: item.value,
                })),
              ],
              value: category ?? "",
            },
          ]}
          placeholder="Search by document title"
          query={listState.query}
          resultLabel="documents"
        />

        {documents.length > 0 ? (
          <>
            <OpsMobileRecordList>
              {documents.map((document) => {
                const version = currentVersion(document);
                const canEdit = canManageDocument(
                  document,
                  auth.profile.id,
                  canUpload,
                  canControlAllDocuments,
                );

                return (
                  <OpsMobileRecordCard key={document.document_id}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-heading text-lg font-bold text-primary-dark">
                          {document.title}
                        </p>
                        <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-primary-dark/45">
                          {formatLabel(document.category)}
                        </p>
                      </div>
                      <span
                        className={`inline-flex shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${statusClass(
                          document.status,
                        )}`}
                      >
                        {document.status}
                      </span>
                    </div>
                    <OpsMobileRecordRow label="Visibility">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${visibilityClass(
                          document.visibility,
                        )}`}
                      >
                        {formatLabel(document.visibility)}
                      </span>
                    </OpsMobileRecordRow>
                    <OpsMobileRecordRow label="Current version">
                      {version ? `v${version.version_number} / ${formatBytes(version.file_size_bytes)}` : "No version"}
                    </OpsMobileRecordRow>
                    <OpsMobileRecordRow label="Uploaded">
                      {formatDate(document.created_at)}
                    </OpsMobileRecordRow>
                    <OpsMobileRecordRow label="Approval">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${approvalClass(
                          document.approval_status,
                        )}`}
                      >
                        {formatApprovalStatus(document.approval_status)}
                      </span>
                    </OpsMobileRecordRow>
                    <DocumentActions canEdit={canEdit} document={document} version={version} />
                  </OpsMobileRecordCard>
                );
              })}
            </OpsMobileRecordList>
            <div
              aria-label="Document library table"
              className={`hidden md:block ${OPS_TABLE_SCROLL_CLASS}`}
              tabIndex={0}
            >
              <table className="min-w-full divide-y divide-primary-dark/10 text-sm">
                <caption className="sr-only">
                  Document library with title, category, visibility, version, uploader, and download
                  action.
                </caption>
                <thead className="bg-primary-dark/[0.03] text-left text-xs uppercase tracking-[0.12em] text-primary-dark/52">
                  <tr>
                    <th className="px-5 py-3" scope="col">
                      Document
                    </th>
                    <th className="px-5 py-3" scope="col">
                      Visibility
                    </th>
                    <th className="px-5 py-3" scope="col">
                      Version
                    </th>
                    <th className="px-5 py-3" scope="col">
                      Uploaded
                    </th>
                    <th className="px-5 py-3" scope="col">
                      Status
                    </th>
                    <th className="px-5 py-3" scope="col">
                      Approval
                    </th>
                    <th className="px-5 py-3" scope="col">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-primary-dark/10">
                  {documents.map((document) => {
                    const version = currentVersion(document);
                    const canEdit = canManageDocument(
                      document,
                      auth.profile.id,
                      canUpload,
                      canControlAllDocuments,
                    );

                    return (
                      <tr key={document.document_id}>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary-dark text-white">
                              <FileText className="size-4" aria-hidden="true" />
                            </div>
                            <div>
                              <p className="font-bold text-primary-dark">{document.title}</p>
                              <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-primary-dark/45">
                                {formatLabel(document.category)}
                              </p>
                              {document.description ? (
                                <p className="mt-1 max-w-md text-xs leading-5 text-primary-dark/55">
                                  {document.description}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${visibilityClass(
                              document.visibility,
                            )}`}
                          >
                            {formatLabel(document.visibility)}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-primary-dark/70">
                          {version ? (
                            <>
                              <span className="font-semibold text-primary-dark">
                                v{version.version_number}
                              </span>
                              <span className="mt-1 block text-xs text-primary-dark/45">
                                {version.file_name} / {formatBytes(version.file_size_bytes)}
                              </span>
                            </>
                          ) : (
                            "No version"
                          )}
                        </td>
                        <td className="px-5 py-4 text-primary-dark/70">
                          {formatDate(document.created_at)}
                          {document.uploader ? (
                            <span className="mt-1 block text-xs text-primary-dark/45">
                              {document.uploader.full_name}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${statusClass(
                              document.status,
                            )}`}
                          >
                            {document.status}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${approvalClass(
                              document.approval_status,
                            )}`}
                          >
                            {formatApprovalStatus(document.approval_status)}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <DocumentActions canEdit={canEdit} document={document} version={version} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="flex min-h-72 flex-col items-center justify-center gap-3 p-8 text-center">
            <Shield className="size-10 text-primary-blue" aria-hidden="true" />
            <div>
              <p className="font-heading text-xl font-bold text-primary-dark">
                {hasActiveListFilter ? "No matching documents" : "No documents uploaded yet"}
              </p>
              <p className="mt-2 max-w-lg text-sm leading-6 text-primary-dark/60">
                {hasActiveListFilter
                  ? "Adjust the search or category filter to widen the document list."
                  : "Upload drawings, contracts, delivery notes, HSE records, HR files, finance documents, and procurement documents as the ERP modules come online."}
              </p>
            </div>
          </div>
        )}
        <OpsPaginationControls
          basePath="/ops/documents"
          filters={[
            {
              label: "Category",
              name: "category",
              options: [],
              value: category ?? "",
            },
          ]}
          pagination={documentPage.pagination}
          query={listState.query}
          resultLabel="documents"
        />
      </section>
    </div>
  );
}
