"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeOpsActionErrorMessage } from "@/lib/ops/action-errors";
import { requireOpsUser } from "@/lib/ops/auth";
import { canManageSites } from "@/lib/ops/permissions";
import { uploadSitePhotoCore } from "@/lib/ops/photo-core";
import { deleteOpsR2Object } from "@/lib/ops/r2";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function photoError(message: string): never {
  redirect(`/ops/photos?error=${encodeURIComponent(safeOpsActionErrorMessage(message))}`);
}

export async function uploadSitePhotoAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const result = await uploadSitePhotoCore(formData, profile);

  if (!result.ok) {
    photoError(result.message);
  }

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
