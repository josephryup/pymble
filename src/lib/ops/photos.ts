import { createOpsServerSessionClient } from "@/lib/ops/auth";
import { createOpsR2ReadUrl } from "@/lib/ops/r2";
import type { OpsPhotoTag } from "@/lib/ops/types";

export type OpsPhotoSite = {
  id: string;
  code: string;
  name: string;
};

export type OpsSitePhoto = {
  id: string;
  site_id: string;
  r2_key: string;
  caption: string;
  tag: OpsPhotoTag;
  mime_type: string;
  taken_at: string;
  created_at: string;
  uploaded_by: string | null;
  site: OpsPhotoSite | null;
  signed_url: string;
};

type Relation<T> = T | T[] | null;

type RawSitePhoto = Omit<OpsSitePhoto, "signed_url" | "site"> & {
  site: Relation<OpsPhotoSite>;
};

function normalizeRelation<T>(value: Relation<T>) {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function fetchOpsSitePhotos() {
  const supabase = await createOpsServerSessionClient();
  const { data, error } = await supabase
    .from("site_photos")
    .select(
      `
        id,
        site_id,
        r2_key,
        caption,
        tag,
        mime_type,
        taken_at,
        created_at,
        uploaded_by,
        site:sites!site_photos_site_id_fkey(id, code, name)
      `,
    )
    .order("taken_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(60);

  if (error) {
    throw error;
  }

  return Promise.all(
    ((data ?? []) as unknown as RawSitePhoto[]).map(async (photo) => ({
      ...photo,
      signed_url: await createOpsR2ReadUrl(photo.r2_key),
      site: normalizeRelation(photo.site),
    })),
  );
}
