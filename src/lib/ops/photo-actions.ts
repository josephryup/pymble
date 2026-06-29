"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeOpsActionErrorMessage } from "@/lib/ops/action-errors";
import { createOpsServerSessionClient, requireOpsUser } from "@/lib/ops/auth";
import { canManageSites, canRecordAttendance } from "@/lib/ops/permissions";
import { deleteOpsR2Object, putOpsR2Object } from "@/lib/ops/r2";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

const MAX_PHOTO_BYTES = 12 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

const uploadPhotoSchema = z.object({
  caption: z.string().trim().max(180).default(""),
  site_id: z.string().uuid("Select a Pymble site."),
  tag: z.enum(["progress", "delivery", "safety"]),
});

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function photoError(message: string): never {
  redirect(`/ops/photos?error=${encodeURIComponent(safeOpsActionErrorMessage(message))}`);
}

function safeFileName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export async function uploadSitePhotoAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canRecordAttendance(profile.role)) {
    photoError("Your role cannot upload site photos yet.");
  }

  const parsed = uploadPhotoSchema.safeParse({
    caption: field(formData, "caption"),
    site_id: field(formData, "site_id"),
    tag: field(formData, "tag") || "progress",
  });

  if (!parsed.success) {
    photoError(parsed.error.issues[0]?.message ?? "Check the photo details.");
  }

  const file = formData.get("photo");

  if (!(file instanceof File) || file.size === 0) {
    photoError("Select an image to upload.");
  }

  if (file.size > MAX_PHOTO_BYTES) {
    photoError("Photos must be 12 MB or smaller.");
  }

  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    photoError("Upload a JPEG, PNG, WebP, or GIF image.");
  }

  const fileBytes = new Uint8Array(await file.arrayBuffer());
  const key = `site-photos/${parsed.data.site_id}/${crypto.randomUUID()}-${safeFileName(
    file.name || "site-photo",
  )}`;

  await putOpsR2Object({
    body: fileBytes,
    contentType: file.type,
    key,
  });

  const supabase = await createOpsServerSessionClient();
  const { data, error } = await supabase
    .from("site_photos")
    .insert({
      caption: parsed.data.caption,
      mime_type: file.type,
      r2_key: key,
      site_id: parsed.data.site_id,
      tag: parsed.data.tag,
      uploaded_by: profile.id,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !data) {
    photoError(error?.message ?? "The photo was uploaded but could not be logged.");
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

  revalidatePath("/ops/photos");
  redirect("/ops/photos?created=photo");
}

const deletePhotoSchema = z.object({
  id: z.string().uuid("Select a photo to delete."),
});

export async function deleteSitePhotoAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  const parsed = deletePhotoSchema.safeParse({ id: field(formData, "id") });

  if (!parsed.success) {
    photoError(parsed.error.issues[0]?.message ?? "Select a photo to delete.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data: photo, error: fetchError } = await supabase
    .from("site_photos")
    .select("id, r2_key, uploaded_by, site_id")
    .eq("id", parsed.data.id)
    .maybeSingle<{ id: string; r2_key: string; uploaded_by: string | null; site_id: string }>();

  if (fetchError) {
    photoError(fetchError.message);
  }

  if (!photo) {
    photoError("That photo was not found.");
  }

  // The uploader can remove their own photo; site managers / leadership can
  // remove any photo for moderation and cleanup.
  const canDelete = photo.uploaded_by === profile.id || canManageSites(profile.role);

  if (!canDelete) {
    photoError("You can only delete photos you uploaded.");
  }

  const { error: deleteError } = await supabase
    .from("site_photos")
    .delete()
    .eq("id", photo.id);

  if (deleteError) {
    photoError(deleteError.message);
  }

  // Remove the underlying object from R2. Best-effort: the database record is
  // already gone, so a storage hiccup leaves at most an orphaned object rather
  // than a broken thumbnail in the UI.
  await deleteOpsR2Object(photo.r2_key).catch(() => null);

  await supabase.from("audit_events").insert({
    actor_user_id: profile.id,
    action: "site_photo.deleted",
    entity_type: "site_photo",
    entity_id: photo.id,
    module_key: "photos",
    source_table: "site_photos",
    source_id: photo.id,
    metadata: { r2_key: photo.r2_key, site_id: photo.site_id },
  });

  revalidatePath("/ops/photos");
  redirect("/ops/photos?deleted=photo");
}
