import { deleteOpsR2Object, headOpsR2Object } from "@/lib/ops/r2";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type { OpsDocumentVisibility } from "@/lib/ops/types";
import {
  OPS_ALLOWED_UPLOAD_TYPES,
  OPS_MAX_UPLOAD_BYTES,
  OPS_UPLOAD_KEY_PREFIXES,
  safeOpsFileName,
} from "@/lib/ops/upload-validation";

export type VerifiedUpload = {
  /**
   * Always null for a direct upload: the server never saw these bytes, so any
   * hash would be the browser's claim rather than something we checked.
   */
  checksum: null;
  contentType: string;
  fileName: string;
  key: string;
  size: number;
};

export type VerifyUploadResult =
  | { ok: true; upload: VerifiedUpload }
  | { message: string; ok: false };

const MAX_UPLOAD_MB = Math.floor(OPS_MAX_UPLOAD_BYTES / (1024 * 1024));

/**
 * Confirms that a key the browser handed back really is an object this server
 * let it create, and that the stored object is one we accept.
 *
 * Nothing the form says about a direct upload is trusted. The key must sit
 * under a prefix we mint, and size and content type are read back off R2 rather
 * than taken from the hidden fields sitting next to the key — otherwise the
 * type and size limits are enforced only by the client that just bypassed them.
 *
 * Single copy on purpose: both the attachments panel and the report creation
 * form go through here, so the rules cannot drift apart between the two.
 */
export async function verifyOpsUploadedObject(
  claimedKey: string,
  declaredFileName: string,
): Promise<VerifyUploadResult> {
  const allowedPrefixes = Object.values(OPS_UPLOAD_KEY_PREFIXES);

  if (!allowedPrefixes.some((prefix) => claimedKey.startsWith(`${prefix}/`))) {
    return {
      message: "That upload could not be verified. Try selecting the file again.",
      ok: false,
    };
  }

  const stored = await headOpsR2Object(claimedKey);

  if (!stored || stored.contentLength === 0) {
    return { message: "The upload did not finish. Select the file again.", ok: false };
  }

  if (stored.contentLength > OPS_MAX_UPLOAD_BYTES) {
    await deleteOpsR2Object(claimedKey).catch(() => null);
    return { message: `Attachments must be ${MAX_UPLOAD_MB} MB or smaller.`, ok: false };
  }

  if (!OPS_ALLOWED_UPLOAD_TYPES.has(stored.contentType)) {
    await deleteOpsR2Object(claimedKey).catch(() => null);
    return {
      message: "Upload a PDF, Word, Excel, CSV, text, JPEG, PNG, or WebP file.",
      ok: false,
    };
  }

  return {
    ok: true,
    upload: {
      checksum: null,
      contentType: stored.contentType,
      fileName: declaredFileName || safeOpsFileName("attachment"),
      key: claimedKey,
      size: stored.contentLength,
    },
  };
}

/**
 * Links an object already sitting in R2 to a record, as a document group with
 * one version plus a link row.
 *
 * Lives outside the `"use server"` action module so both the attachments panel
 * and the department-report creation form can share it. Every export from a
 * `"use server"` file becomes a callable endpoint; a plain module keeps this an
 * internal function.
 *
 * There is no transaction spanning the three inserts, so a failure part-way
 * through unwinds by hand: the R2 object is deleted and any document group
 * already created is archived rather than left as a row pointing at bytes that
 * no longer exist.
 */
export type LinkRecordAttachmentInput = {
  /** The record context's singular category ("department_report"), not the table name. */
  category: string;
  checksum: string | null;
  contentType: string;
  fileName: string;
  key: string;
  label: string;
  moduleKey: string;
  siteId: string | null;
  size: number;
  sourceId: string;
  sourceTable: string;
  title: string;
  uploadedBy: string;
  visibility: OpsDocumentVisibility;
};

export type LinkRecordAttachmentResult =
  | { documentId: string; ok: true; versionId: string }
  | { message: string; ok: false };

export async function linkOpsRecordAttachment(
  input: LinkRecordAttachmentInput,
): Promise<LinkRecordAttachmentResult> {
  const supabase = getOpsSupabaseServiceClient();

  const { data: document, error: documentError } = await supabase
    .from("documents")
    .insert({
      category: input.category,
      description: `Linked to ${input.label}.`,
      status: "active",
      title: input.title,
      uploaded_by: input.uploadedBy,
      visibility: input.visibility,
    })
    .select("id")
    .single<{ id: string }>();

  if (documentError || !document) {
    await deleteOpsR2Object(input.key).catch(() => null);
    return {
      message: documentError?.message ?? "The attachment could not be logged.",
      ok: false,
    };
  }

  const archiveDocument = async () => {
    await Promise.all([
      deleteOpsR2Object(input.key).catch(() => null),
      supabase
        .from("documents")
        .update({ archived_at: new Date().toISOString(), status: "archived" })
        .eq("id", document.id)
        .then(() => null),
    ]);
  };

  const { data: version, error: versionError } = await supabase
    .from("document_versions")
    .insert({
      checksum_sha256: input.checksum,
      content_type: input.contentType,
      document_id: document.id,
      file_name: input.fileName,
      file_size_bytes: input.size,
      r2_key: input.key,
      uploaded_by: input.uploadedBy,
      version_number: 1,
    })
    .select("id")
    .single<{ id: string }>();

  if (versionError || !version) {
    await archiveDocument();
    return {
      message: versionError?.message ?? "The attachment version could not be logged.",
      ok: false,
    };
  }

  const { error: linkError } = await supabase.from("document_links").insert({
    created_by: input.uploadedBy,
    document_id: document.id,
    module_key: input.moduleKey,
    site_id: input.siteId,
    source_id: input.sourceId,
    source_table: input.sourceTable,
  });

  if (linkError) {
    await archiveDocument();
    return { message: linkError.message, ok: false };
  }

  return { documentId: document.id, ok: true, versionId: version.id };
}
