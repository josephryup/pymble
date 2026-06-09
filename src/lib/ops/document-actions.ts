"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeOpsActionErrorMessage } from "@/lib/ops/action-errors";
import { requireOpsUser } from "@/lib/ops/auth";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import { canMutateOpsDocument } from "@/lib/ops/document-permissions";
import { canManageOps } from "@/lib/ops/permissions";
import { queueOpsNotification } from "@/lib/ops/notifications";
import { deleteOpsR2Object, putOpsR2Object } from "@/lib/ops/r2";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import { safeOpsFileName, validateOpsUploadFile } from "@/lib/ops/upload-validation";
import type { OpsDocumentStatus, OpsDocumentVisibility, OpsUserRole } from "@/lib/ops/types";

const uploadDocumentSchema = z.object({
  category: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]*$/, "Choose a valid document category.")
    .max(60),
  description: z.string().trim().max(500).default(""),
  title: z.string().trim().min(2, "Document title is required.").max(160),
  visibility: z.enum(["company", "restricted", "private"]),
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

export async function uploadOpsDocumentAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canManageOps(profile.role)) {
    documentError("Your role cannot upload documents yet.");
  }

  const parsed = uploadDocumentSchema.safeParse({
    category: field(formData, "category") || "general",
    description: field(formData, "description"),
    title: field(formData, "title"),
    visibility: field(formData, "visibility") || "restricted",
  });

  if (!parsed.success) {
    documentError(parsed.error.issues[0]?.message ?? "Check the document details.");
  }

  const upload = validateOpsUploadFile(formData.get("document"), {
    empty: "Select a document to upload.",
    tooLarge: "Documents must be 25 MB or smaller.",
    unsupportedType: "Upload a PDF, Word, Excel, CSV, text, JPEG, PNG, or WebP file.",
  });

  if (!upload.ok) {
    documentError(upload.message);
  }

  const file = upload.file;

  const fileBytes = new Uint8Array(await file.arrayBuffer());
  const checksum = crypto.createHash("sha256").update(fileBytes).digest("hex");
  const safeName = safeOpsFileName(file.name || "document");
  const key = `documents/${parsed.data.category}/${crypto.randomUUID()}-${safeName}`;

  await putOpsR2Object({
    body: fileBytes,
    contentType: file.type,
    key,
  });

  const supabase = getOpsSupabaseServiceClient();
  const { data: document, error: documentErrorResult } = await supabase
    .from("documents")
    .insert({
      category: parsed.data.category,
      description: parsed.data.description,
      status: "active",
      title: parsed.data.title,
      uploaded_by: profile.id,
      visibility: parsed.data.visibility,
    })
    .select("id")
    .single<{ id: string }>();

  if (documentErrorResult || !document) {
    await deleteOpsR2Object(key).catch(() => null);
    documentError(documentErrorResult?.message ?? "The file was uploaded but could not be logged.");
  }

  const { data: version, error: versionError } = await supabase
    .from("document_versions")
    .insert({
      checksum_sha256: checksum,
      content_type: file.type,
      document_id: document.id,
      file_name: file.name || safeName,
      file_size_bytes: file.size,
      r2_key: key,
      uploaded_by: profile.id,
      version_number: 1,
    })
    .select("id")
    .single<{ id: string }>();

  if (versionError || !version) {
    await Promise.all([
      deleteOpsR2Object(key).catch(() => null),
      (async () => {
        await supabase
          .from("documents")
          .update({
            archived_at: new Date().toISOString(),
            status: "archived",
          })
          .eq("id", document.id);
      })().catch(() => null),
    ]);
    documentError(versionError?.message ?? "The document was created but the version was not logged.");
  }

  await recordOpsAuditEvent({
    action: "document.uploaded",
    actorUserId: profile.id,
    entityId: document.id,
    entityType: "document",
    metadata: {
      category: parsed.data.category,
      content_type: file.type,
      file_name: file.name || safeName,
      file_size_bytes: file.size,
      version_id: version.id,
      visibility: parsed.data.visibility,
    },
    moduleKey: "documents",
    sourceId: document.id,
    sourceTable: "documents",
    summary: `Uploaded ${parsed.data.title}`,
  }).catch(() => null);

  revalidatePath("/ops/documents");
  redirect("/ops/documents?created=document");
}

export async function uploadOpsDocumentVersionAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canManageOps(profile.role)) {
    documentError("Your role cannot upload document versions yet.");
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
    documentError("Archived documents cannot receive new versions.");
  }

  if (!canMutateDocument(profile.id, profile.role, document)) {
    documentError("You can only replace documents you manage.");
  }

  const openApproval = await hasOpenDocumentApproval(document.id);

  if (openApproval) {
    documentError("Resolve the open approval before uploading a new version.");
  }

  const upload = validateOpsUploadFile(formData.get("document"), {
    empty: "Select a replacement document.",
    tooLarge: "Documents must be 25 MB or smaller.",
    unsupportedType: "Upload a PDF, Word, Excel, CSV, text, JPEG, PNG, or WebP file.",
  });

  if (!upload.ok) {
    documentError(upload.message);
  }

  const file = upload.file;

  const nextVersionNumber = document.current_version_number + 1;
  const fileBytes = new Uint8Array(await file.arrayBuffer());
  const checksum = crypto.createHash("sha256").update(fileBytes).digest("hex");
  const safeName = safeOpsFileName(file.name || "document");
  const key = `documents/${document.category}/${crypto.randomUUID()}-v${nextVersionNumber}-${safeName}`;

  await putOpsR2Object({
    body: fileBytes,
    contentType: file.type,
    key,
  });

  const supabase = getOpsSupabaseServiceClient();
  const { data: version, error: versionError } = await supabase
    .from("document_versions")
    .insert({
      checksum_sha256: checksum,
      content_type: file.type,
      document_id: document.id,
      file_name: file.name || safeName,
      file_size_bytes: file.size,
      r2_key: key,
      uploaded_by: profile.id,
      version_number: nextVersionNumber,
    })
    .select("id")
    .single<{ id: string }>();

  if (versionError || !version) {
    await deleteOpsR2Object(key).catch(() => null);
    documentError(versionError?.message ?? "The new version could not be logged.");
  }

  const { data: updatedDocument, error: documentUpdateError } = await supabase
    .from("documents")
    .update({
      current_version_number: nextVersionNumber,
      status: "active",
    })
    .eq("id", document.id)
    .eq("current_version_number", document.current_version_number)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (documentUpdateError || !updatedDocument) {
    await Promise.all([
      deleteOpsR2Object(key).catch(() => null),
      supabase.from("document_versions").delete().eq("id", version.id).then(() => null),
    ]);
    documentError(
      documentUpdateError?.message ??
        "Another version was uploaded first. Refresh the document library and try again.",
    );
  }

  await recordOpsAuditEvent({
    action: "document.version_uploaded",
    actorUserId: profile.id,
    entityId: document.id,
    entityType: "document",
    metadata: {
      content_type: file.type,
      file_name: file.name || safeName,
      file_size_bytes: file.size,
      previous_version_number: document.current_version_number,
      version_id: version.id,
      version_number: nextVersionNumber,
    },
    moduleKey: "documents",
    sourceId: document.id,
    sourceTable: "documents",
    summary: `Uploaded version ${nextVersionNumber} for ${document.title}`,
  }).catch(() => null);

  revalidatePath("/ops/documents");
  redirect("/ops/documents?updated=version_uploaded");
}

export async function archiveOpsDocumentAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canManageOps(profile.role)) {
    documentError("Your role cannot archive documents yet.");
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
