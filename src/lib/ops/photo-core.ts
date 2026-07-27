import crypto from "node:crypto";
import { z } from "zod";
import type { OpsUserProfile } from "@/lib/ops/auth";
import { createOpsServerSessionClient } from "@/lib/ops/auth";
import { canRecordAttendance } from "@/lib/ops/permissions";
import { putOpsR2Object } from "@/lib/ops/r2";

/**
 * Shared core for uploading a site photo — used by both uploadSitePhotoAction
 * (the online form submit, in photo-actions.ts) and the
 * /api/ops/offline/photos route (the outbox replay endpoint for field staff
 * who took a photo with no signal).
 */

const MAX_PHOTO_BYTES = 12 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

const uploadPhotoSchema = z.object({
  caption: z.string().trim().max(180).default(""),
  site_id: z.string().uuid("Select a Pymble site."),
  tag: z.enum(["progress", "delivery", "safety"]),
  /**
   * Set when the photo is evidence against a failed checklist item. Optional so
   * ordinary site photos are unaffected, and routed through this core (rather
   * than a second uploader) so checklist evidence inherits the R2 upload,
   * idempotent client_id replay, and offline queueing already proven here.
   */
  qa_inspection_item_id: z
    .string()
    .trim()
    .default("")
    .transform((value) => (value.length > 0 ? value : null))
    .refine(
      (value) =>
        value === null ||
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value),
      { message: "Select a valid checklist item." },
    ),
});

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function safeFileName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export type UploadSitePhotoResult = { ok: true; id: string } | { ok: false; message: string };

export async function uploadSitePhotoCore(
  formData: FormData,
  profile: OpsUserProfile,
): Promise<UploadSitePhotoResult> {
  if (!canRecordAttendance(profile.role)) {
    return { ok: false, message: "Your role cannot upload site photos yet." };
  }

  const parsed = uploadPhotoSchema.safeParse({
    caption: field(formData, "caption"),
    site_id: field(formData, "site_id"),
    tag: field(formData, "tag") || "progress",
    qa_inspection_item_id: field(formData, "qa_inspection_item_id"),
  });

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the photo details." };
  }

  const file = formData.get("photo");

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Select an image to upload." };
  }

  if (file.size > MAX_PHOTO_BYTES) {
    return { ok: false, message: "Photos must be 12 MB or smaller." };
  }

  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return { ok: false, message: "Upload a JPEG, PNG, WebP, or GIF image." };
  }

  // Sprint 10 offline support: upsert on the optional client_id so a queued
  // photo upload doesn't double-insert when it eventually syncs. The R2 key
  // is derived from the client_id (when present) so a retry overwrites the
  // same object instead of uploading and orphaning a second one.
  const clientId = (field(formData, "client_id") || "").trim() || null;
  const key = `site-photos/${parsed.data.site_id}/${clientId ?? crypto.randomUUID()}-${safeFileName(
    file.name || "site-photo",
  )}`;

  const fileBytes = new Uint8Array(await file.arrayBuffer());
  await putOpsR2Object({ body: fileBytes, contentType: file.type, key });

  const supabase = await createOpsServerSessionClient();
  const { data, error } = clientId
    ? await supabase
        .from("site_photos")
        .upsert(
          {
            caption: parsed.data.caption,
            client_id: clientId,
            mime_type: file.type,
            r2_key: key,
            qa_inspection_item_id: parsed.data.qa_inspection_item_id,
            site_id: parsed.data.site_id,
            tag: parsed.data.tag,
            uploaded_by: profile.id,
          },
          { onConflict: "client_id", ignoreDuplicates: false },
        )
        .select("id")
        .single<{ id: string }>()
    : await supabase
        .from("site_photos")
        .insert({
          caption: parsed.data.caption,
          mime_type: file.type,
          qa_inspection_item_id: parsed.data.qa_inspection_item_id,
          r2_key: key,
          site_id: parsed.data.site_id,
          tag: parsed.data.tag,
          uploaded_by: profile.id,
        })
        .select("id")
        .single<{ id: string }>();

  if (error || !data) {
    return { ok: false, message: error?.message ?? "The photo was uploaded but could not be logged." };
  }

  await supabase.from("audit_events").insert({
    actor_user_id: profile.id,
    action: "site_photo.uploaded",
    entity_type: "site_photo",
    entity_id: data.id,
    module_key: "photos",
    source_table: "site_photos",
    source_id: data.id,
    metadata: {
      r2_key: key,
      site_id: parsed.data.site_id,
      tag: parsed.data.tag,
    },
  });

  return { ok: true, id: data.id };
}
