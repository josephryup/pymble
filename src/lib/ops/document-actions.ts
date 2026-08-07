"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeOpsActionErrorMessage } from "@/lib/ops/action-errors";
import { requireOpsUser } from "@/lib/ops/auth";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import {
  assignableOpsDocumentVisibilities,
  canMutateOpsDocument,
} from "@/lib/ops/document-permissions";
import { canManageOps } from "@/lib/ops/permissions";
import { queueOpsNotification } from "@/lib/ops/notifications";
import { deleteOpsR2Object, putOpsR2Object } from "@/lib/ops/r2";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import { safeOpsFileName, validateOpsUploadFile } from "@/lib/ops/upload-validation";
import type { OpsDocumentStatus, OpsDocumentVisibility, OpsUserRole } from "@/lib/ops/types";

const MAX_ATTACHMENTS_PER_UPLOAD = 10;
const MAX_RECIPIENTS_PER_DOCUMENT = 50;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const uploadDocumentSchema = z.object({
  category: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]*$/, "Choose a valid document category.")
    .max(60),
  description: z.string().trim().max(500).default(""),
  title: z.string().trim().min(2, "Document title is required.").max(160),
  visibility: z.enum(["public", "management", "finance", "md_restricted", "private"]),
});

const documentIdSchema = z.object({
  document_id: z.string().uuid("Select a document."),
});

type DocumentForMutation = {
  category: string;
  current_version_number: number;
  id: string;
  status: OpsDocumentStatus;
  title: string;
  uploaded_by: string | null;
  visibility: OpsDocumentVisibility;
};

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function documentError(message: string): never {
  redirect(`/ops/documents?error=${encodeURIComponent(safeOpsActionErrorMessage(message))}`);
}

function canMutateDocument(actorId: string, actorRole: OpsUserRole, document: DocumentForMutation) {
  return canMutateOpsDocument(actorId, actorRole, document);
}

async function fetchDocumentForMutation(documentId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("documents")
    .select("id, title, category, visibility, status, current_version_number, uploaded_by")
    .eq("id", documentId)
    .maybeSingle<DocumentForMutation>();

  if (error) {
    throw error;
  }

  return data;
}

async function hasOpenDocumentApproval(documentId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("approval_requests")
    .select("id")
    .eq("module_key", "documents")
    .eq("source_table", "documents")
    .eq("source_id", documentId)
    .in("status", ["draft", "submitted", "in_review"])
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (error) {
    throw error;
  }

  return data;
}

type PreparedAttachment = {
  bytes: Uint8Array;
  checksum: string;
  contentType: string;
  fileName: string;
  fileSize: number;
  safeName: string;
};

/** Validates every file in a multi-file field and reads their bytes. */
async function prepareAttachments(files: File[]): Promise<PreparedAttachment[]> {
  const prepared: PreparedAttachment[] = [];
  for (const candidate of files) {
    const upload = validateOpsUploadFile(candidate, {
      empty: "Select at least one file to upload.",
      tooLarge: "Each file must be 25 MB or smaller.",
      unsupportedType: "Upload PDF, Word, Excel, CSV, text, JPEG, PNG, or WebP files.",
    });
    if (!upload.ok) {
      documentError(upload.message);
    }
    const file = upload.file;
    const bytes = new Uint8Array(await file.arrayBuffer());
    prepared.push({
      bytes,
      checksum: crypto.createHash("sha256").update(bytes).digest("hex"),
      contentType: file.type,
      fileName: file.name || safeOpsFileName("document"),
      fileSize: file.size,
      safeName: safeOpsFileName(file.name || "document"),
    });
  }
  return prepared;
}

/**
 * The people this document is being sent to. Ids are validated against
 * `users` before anything is granted, so a tampered form cannot mint a share
 * to a non-existent or deactivated account. The uploader is dropped — they
 * already have access as the owner.
 */
async function resolveRecipients(formData: FormData, actorId: string) {
  const requested = Array.from(
    new Set(
      formData
        .getAll("recipient_ids")
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter((value) => UUID_PATTERN.test(value) && value !== actorId),
    ),
  ).slice(0, MAX_RECIPIENTS_PER_DOCUMENT);

  if (requested.length === 0) {
    return [];
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("users")
    .select("id, full_name")
    .in("id", requested)
    .eq("is_active", true);

  if (error) {
    documentError(error.message);
  }

  return (data ?? []) as Array<{ full_name: string; id: string }>;
}

/**
 * Grants access to the named recipients and tells each of them. The grant is
 * an upsert so re-sharing is idempotent, and the notification carries a
 * document-scoped idempotency key so a repeat share does not re-notify.
 */
async function shareDocumentWith(
  recipients: Array<{ full_name: string; id: string }>,
  document: { id: string; title: string },
  actor: { full_name: string; id: string },
) {
  if (recipients.length === 0) {
    return;
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase.from("document_recipients").upsert(
    recipients.map((recipient) => ({
      document_id: document.id,
      shared_by: actor.id,
      user_id: recipient.id,
    })),
    { onConflict: "document_id,user_id" },
  );

  if (error) {
    documentError(error.message);
  }

  await Promise.all(
    recipients.map((recipient) =>
      queueOpsNotification({
        actionHref: "/ops/documents",
        body: `${actor.full_name} sent you "${document.title}".`,
        idempotencyKey: `document-shared:${document.id}:${recipient.id}`,
        moduleKey: "documents",
        recipientId: recipient.id,
        sourceId: document.id,
        sourceTable: "documents",
        title: "A document was shared with you",
      }).catch(() => null),
    ),
  );
}

function collectUploadFiles(formData: FormData): File[] {
  return [...formData.getAll("documents"), formData.get("document")]
    .filter((value): value is File => value instanceof File && value.size > 0)
    .slice(0, MAX_ATTACHMENTS_PER_UPLOAD);
}

/**
 * Uploads prepared attachments to R2 and inserts a document_versions row per
 * file (each row is one attachment in the group). Rolls back every R2 object
 * and row on any failure. `startVersion` is the first version_number to use.
 */
async function persistAttachments(
  documentId: string,
  category: string,
  startVersion: number,
  attachments: PreparedAttachment[],
  actorId: string,
): Promise<{ ids: string[]; keys: string[] }> {
  const supabase = getOpsSupabaseServiceClient();
  const keys: string[] = [];
  const ids: string[] = [];

  for (let index = 0; index < attachments.length; index += 1) {
    const attachment = attachments[index];
    const versionNumber = startVersion + index;
    const key = `documents/${category}/${crypto.randomUUID()}-v${versionNumber}-${attachment.safeName}`;

    try {
      await putOpsR2Object({ body: attachment.bytes, contentType: attachment.contentType, key });
      keys.push(key);
    } catch (uploadError) {
      await rollbackAttachments(ids, keys);
      documentError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
    }

    const { data: version, error: versionError } = await supabase
      .from("document_versions")
      .insert({
        checksum_sha256: attachment.checksum,
        content_type: attachment.contentType,
        document_id: documentId,
        file_name: attachment.fileName,
        file_size_bytes: attachment.fileSize,
        r2_key: key,
        uploaded_by: actorId,
        version_number: versionNumber,
      })
      .select("id")
      .single<{ id: string }>();

    if (versionError || !version) {
      await rollbackAttachments(ids, keys);
      documentError(versionError?.message ?? "An attachment could not be logged.");
    }
    ids.push(version.id);
  }

  return { ids, keys };
}

async function rollbackAttachments(versionIds: string[], keys: string[]) {
  const supabase = getOpsSupabaseServiceClient();
  await Promise.all([
    ...keys.map((key) => deleteOpsR2Object(key).catch(() => null)),
    ...(versionIds.length > 0
      ? [supabase.from("document_versions").delete().in("id", versionIds).then(() => null)]
      : []),
  ]);
}

export async function uploadOpsDocumentAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  // Every signed-in user may upload a document and send it to colleagues —
  // crew included, so a site worker can push a delivery note or a signed form
  // up the chain. What a document EXPOSES is still bounded: the visibility
  // tier is checked against assignableOpsDocumentVisibilities below, and crew
  // can only assign public or private.

  const parsed = uploadDocumentSchema.safeParse({
    category: field(formData, "category") || "general",
    description: field(formData, "description"),
    title: field(formData, "title"),
    visibility: field(formData, "visibility") || "private",
  });

  if (!parsed.success) {
    documentError(parsed.error.issues[0]?.message ?? "Check the document details.");
  }

  if (!assignableOpsDocumentVisibilities(profile.role).includes(parsed.data.visibility)) {
    documentError("You cannot file a document under that visibility level.");
  }

  const files = collectUploadFiles(formData);
  if (files.length === 0) {
    documentError("Select at least one file to upload.");
  }

  const recipients = await resolveRecipients(formData, profile.id);
  const attachments = await prepareAttachments(files);

  const supabase = getOpsSupabaseServiceClient();
  const { data: document, error: documentErrorResult } = await supabase
    .from("documents")
    .insert({
      category: parsed.data.category,
      current_version_number: attachments.length,
      description: parsed.data.description,
      status: "active",
      title: parsed.data.title,
      uploaded_by: profile.id,
      visibility: parsed.data.visibility,
    })
    .select("id")
    .single<{ id: string }>();

  if (documentErrorResult || !document) {
    documentError(documentErrorResult?.message ?? "The document group could not be created.");
  }

  const { ids } = await persistAttachments(
    document.id,
    parsed.data.category,
    1,
    attachments,
    profile.id,
  );

  await shareDocumentWith(
    recipients,
    { id: document.id, title: parsed.data.title },
    { full_name: profile.full_name, id: profile.id },
  );

  await recordOpsAuditEvent({
    action: "document.uploaded",
    actorUserId: profile.id,
    entityId: document.id,
    entityType: "document",
    metadata: {
      attachment_count: attachments.length,
      category: parsed.data.category,
      file_names: attachments.map((attachment) => attachment.fileName),
      recipient_ids: recipients.map((recipient) => recipient.id),
      version_ids: ids,
      visibility: parsed.data.visibility,
    },
    moduleKey: "documents",
    sourceId: document.id,
    sourceTable: "documents",
    summary: `Uploaded ${parsed.data.title} (${attachments.length} file${attachments.length === 1 ? "" : "s"})`,
  }).catch(() => null);

  revalidatePath("/ops/documents");
  redirect("/ops/documents?created=document");
}

/**
 * Sends an EXISTING document to more people. Gated by canMutateOpsDocument —
 * only the uploader (or a super-admin) decides who else sees their document,
 * so a recipient cannot re-share what was sent to them.
 */
export async function shareOpsDocumentAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  const parsed = documentIdSchema.safeParse({ document_id: field(formData, "document_id") });
  if (!parsed.success) {
    documentError(parsed.error.issues[0]?.message ?? "Select a document.");
  }

  const document = await fetchDocumentForMutation(parsed.data.document_id);
  if (!document) {
    documentError("Document was not found.");
  }
  if (document.status === "archived") {
    documentError("Archived documents cannot be shared.");
  }
  if (!canMutateDocument(profile.id, profile.role, document)) {
    documentError("You can only share documents you uploaded.");
  }

  const recipients = await resolveRecipients(formData, profile.id);
  if (recipients.length === 0) {
    documentError("Select at least one person to send this document to.");
  }

  await shareDocumentWith(
    recipients,
    { id: document.id, title: document.title },
    { full_name: profile.full_name, id: profile.id },
  );

  await recordOpsAuditEvent({
    action: "document.shared",
    actorUserId: profile.id,
    entityId: document.id,
    entityType: "document",
    metadata: { recipient_ids: recipients.map((recipient) => recipient.id) },
    moduleKey: "documents",
    sourceId: document.id,
    sourceTable: "documents",
    summary: `Sent ${document.title} to ${recipients.length} recipient${recipients.length === 1 ? "" : "s"}`,
  }).catch(() => null);

  revalidatePath("/ops/documents");
  redirect("/ops/documents?updated=shared");
}

/** Revokes one direct share. The tier still governs everyone else. */
export async function unshareOpsDocumentAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  const parsed = documentIdSchema.safeParse({ document_id: field(formData, "document_id") });
  if (!parsed.success) {
    documentError(parsed.error.issues[0]?.message ?? "Select a document.");
  }

  const recipientId = field(formData, "recipient_id").trim();
  if (!UUID_PATTERN.test(recipientId)) {
    documentError("Select a recipient to remove.");
  }

  const document = await fetchDocumentForMutation(parsed.data.document_id);
  if (!document) {
    documentError("Document was not found.");
  }
  if (!canMutateDocument(profile.id, profile.role, document)) {
    documentError("You can only change sharing on documents you uploaded.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("document_recipients")
    .delete()
    .eq("document_id", document.id)
    .eq("user_id", recipientId);

  if (error) {
    documentError(error.message);
  }

  await recordOpsAuditEvent({
    action: "document.unshared",
    actorUserId: profile.id,
    entityId: document.id,
    entityType: "document",
    metadata: { recipient_id: recipientId },
    moduleKey: "documents",
    sourceId: document.id,
    sourceTable: "documents",
    summary: `Removed a recipient from ${document.title}`,
  }).catch(() => null);

  revalidatePath("/ops/documents");
  redirect("/ops/documents?updated=unshared");
}

export async function addOpsDocumentAttachmentAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  const parsed = documentIdSchema.safeParse({ document_id: field(formData, "document_id") });
  if (!parsed.success) {
    documentError(parsed.error.issues[0]?.message ?? "Select a document.");
  }

  const document = await fetchDocumentForMutation(parsed.data.document_id);
  if (!document) {
    documentError("Document was not found.");
  }
  if (document.status === "archived") {
    documentError("Archived documents cannot receive new files.");
  }
  if (!canMutateDocument(profile.id, profile.role, document)) {
    documentError("You can only add files to documents you manage.");
  }

  const openApproval = await hasOpenDocumentApproval(document.id);
  if (openApproval) {
    documentError("Resolve the open approval before adding files.");
  }

  const files = collectUploadFiles(formData);
  if (files.length === 0) {
    documentError("Select at least one file to add.");
  }
  const attachments = await prepareAttachments(files);

  const { ids } = await persistAttachments(
    document.id,
    document.category,
    document.current_version_number + 1,
    attachments,
    profile.id,
  );

  const supabase = getOpsSupabaseServiceClient();
  await supabase
    .from("documents")
    .update({ current_version_number: document.current_version_number + attachments.length })
    .eq("id", document.id);

  await recordOpsAuditEvent({
    action: "document.attachment_added",
    actorUserId: profile.id,
    entityId: document.id,
    entityType: "document",
    metadata: {
      attachment_count: attachments.length,
      file_names: attachments.map((attachment) => attachment.fileName),
      version_ids: ids,
    },
    moduleKey: "documents",
    sourceId: document.id,
    sourceTable: "documents",
    summary: `Added ${attachments.length} file${attachments.length === 1 ? "" : "s"} to ${document.title}`,
  }).catch(() => null);

  revalidatePath("/ops/documents");
  redirect("/ops/documents?updated=attachment_added");
}

const attachmentIdSchema = z.object({
  document_id: z.string().uuid("Select a document."),
  version_id: z.string().uuid("Select a file."),
});

export async function removeOpsDocumentAttachmentAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  const parsed = attachmentIdSchema.safeParse({
    document_id: field(formData, "document_id"),
    version_id: field(formData, "version_id"),
  });
  if (!parsed.success) {
    documentError(parsed.error.issues[0]?.message ?? "Select a file to remove.");
  }

  const document = await fetchDocumentForMutation(parsed.data.document_id);
  if (!document) {
    documentError("Document was not found.");
  }
  if (!canMutateDocument(profile.id, profile.role, document)) {
    documentError("You can only remove files from documents you manage.");
  }

  const openApproval = await hasOpenDocumentApproval(document.id);
  if (openApproval) {
    documentError("Resolve the open approval before removing files.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data: attachments, error: countError } = await supabase
    .from("document_versions")
    .select("id, r2_key")
    .eq("document_id", document.id);

  if (countError) {
    documentError(countError.message);
  }

  const rows = (attachments ?? []) as Array<{ id: string; r2_key: string }>;
  const target = rows.find((row) => row.id === parsed.data.version_id);
  if (!target) {
    documentError("That file is not part of this document.");
  }
  if (rows.length <= 1) {
    documentError("A document needs at least one file. Archive the document instead.");
  }

  const { error: deleteError } = await supabase
    .from("document_versions")
    .delete()
    .eq("id", target.id);

  if (deleteError) {
    documentError(deleteError.message);
  }

  await deleteOpsR2Object(target.r2_key).catch(() => null);

  await recordOpsAuditEvent({
    action: "document.attachment_removed",
    actorUserId: profile.id,
    entityId: document.id,
    entityType: "document",
    metadata: { version_id: target.id },
    moduleKey: "documents",
    sourceId: document.id,
    sourceTable: "documents",
    summary: `Removed a file from ${document.title}`,
  }).catch(() => null);

  revalidatePath("/ops/documents");
  redirect("/ops/documents?updated=attachment_removed");
}

export async function archiveOpsDocumentAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  // No role gate here: uploading is open to everyone, so everyone must be able
  // to retire what they uploaded. canMutateDocument below is the real check —
  // uploader or super-admin — and it is strictly narrower than the role gate
  // that used to sit here.

  const parsed = documentIdSchema.safeParse({
    document_id: field(formData, "document_id"),
  });

  if (!parsed.success) {
    documentError(parsed.error.issues[0]?.message ?? "Select a document.");
  }

  const document = await fetchDocumentForMutation(parsed.data.document_id);

  if (!document) {
    documentError("Document was not found.");
  }

  if (!canMutateDocument(profile.id, profile.role, document)) {
    documentError("You can only archive documents you manage.");
  }

  const openApproval = await hasOpenDocumentApproval(document.id);

  if (openApproval) {
    documentError("Resolve the open approval before archiving this document.");
  }

  if (document.status !== "archived") {
    const now = new Date().toISOString();
    const supabase = getOpsSupabaseServiceClient();
    const { error } = await supabase
      .from("documents")
      .update({
        archived_at: now,
        status: "archived",
      })
      .eq("id", document.id)
      .neq("status", "archived");

    if (error) {
      documentError(error.message);
    }

    await recordOpsAuditEvent({
      action: "document.archived",
      actorUserId: profile.id,
      entityId: document.id,
      entityType: "document",
      metadata: {
        category: document.category,
        current_version_number: document.current_version_number,
        visibility: document.visibility,
      },
      moduleKey: "documents",
      sourceId: document.id,
      sourceTable: "documents",
      summary: `Archived ${document.title}`,
    }).catch(() => null);
  }

  revalidatePath("/ops/documents");
  redirect("/ops/documents?updated=archived");
}

export async function requestDocumentApprovalAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canManageOps(profile.role)) {
    documentError("Your role cannot request document approval yet.");
  }

  const parsed = documentIdSchema.safeParse({
    document_id: field(formData, "document_id"),
  });

  if (!parsed.success) {
    documentError(parsed.error.issues[0]?.message ?? "Select a document.");
  }

  const document = await fetchDocumentForMutation(parsed.data.document_id);

  if (!document) {
    documentError("Document was not found.");
  }

  if (document.status === "archived") {
    documentError("Archived documents cannot be sent for approval.");
  }

  if (!canMutateDocument(profile.id, profile.role, document)) {
    documentError("You can only request approval for documents you manage.");
  }

  const openApproval = await hasOpenDocumentApproval(document.id);

  if (openApproval) {
    redirect(`/ops/approvals/${openApproval.id}`);
  }

  const supabase = getOpsSupabaseServiceClient();
  const now = new Date().toISOString();
  const { data: approval, error: approvalError } = await supabase
    .from("approval_requests")
    .insert({
      current_step_number: 1,
      description: `Approval requested for ${document.title}.`,
      module_key: "documents",
      priority: "normal",
      requested_by: profile.id,
      source_id: document.id,
      source_table: "documents",
      status: "submitted",
      submitted_at: now,
      title: `Document approval: ${document.title}`,
    })
    .select("id")
    .single<{ id: string }>();

  if (approvalError || !approval) {
    documentError(approvalError?.message ?? "Could not create approval request.");
  }

  const { error: stepError } = await supabase.from("approval_steps").insert({
    approval_request_id: approval.id,
    approver_role: "managing_director",
    approver_sequence: 1,
    status: "pending",
    step_label: "Managing Director review",
    step_number: 1,
  });

  if (stepError) {
    await (async () => {
      await supabase
        .from("approval_requests")
        .update({
          resolved_at: now,
          status: "cancelled",
        })
        .eq("id", approval.id);
    })().catch(() => null);
    documentError(stepError.message);
  }

  await recordOpsAuditEvent({
    action: "document.approval_requested",
    actorUserId: profile.id,
    entityId: approval.id,
    entityType: "approval_request",
    metadata: {
      document_id: document.id,
      document_title: document.title,
      document_version: document.current_version_number,
    },
    moduleKey: "documents",
    sourceId: document.id,
    sourceTable: "documents",
    summary: `Requested approval for ${document.title}`,
  }).catch(() => null);

  const { data: approvers } = await supabase
    .from("users")
    .select("id")
    .in("role", ["developer", "managing_director", "owner"])
    .eq("is_active", true);

  await Promise.all(
    (approvers ?? []).map((approver) =>
      queueOpsNotification({
        actionHref: `/ops/approvals/${approval.id}`,
        body: `${profile.full_name} requested approval for ${document.title}.`,
        idempotencyKey: `document-approval-requested:${approval.id}:${approver.id}`,
        moduleKey: "documents",
        recipientId: approver.id as string,
        sourceId: approval.id,
        sourceTable: "approval_requests",
        title: "Document approval requested",
      }).catch(() => null),
    ),
  );

  revalidatePath("/ops/documents");
  revalidatePath("/ops/approvals");
  redirect(`/ops/approvals/${approval.id}?created=document_approval`);
}
