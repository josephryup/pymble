import { createOpsServerSessionClient } from "@/lib/ops/auth";
import {
  opsIlikeOrFilter,
  toOpsPaginatedResult,
  type OpsListState,
} from "@/lib/ops/listing";
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

const PHOTO_COLUMNS = `
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
`;

async function withSignedUrls(rows: RawSitePhoto[]) {
  return Promise.all(
    rows.map(async (photo) => ({
      ...photo,
      signed_url: await createOpsR2ReadUrl(photo.r2_key),
      site: normalizeRelation(photo.site),
    })),
  );
}

/**
 * Archive-wide counts for the header tiles, so they keep describing the whole
 * archive while the gallery below shows one filtered page of it.
 */
export async function fetchOpsSitePhotoSummary() {
  const supabase = await createOpsServerSessionClient();
  const count = (tag?: OpsPhotoTag) => {
    const query = supabase.from("site_photos").select("id", { count: "exact", head: true });
    return tag ? query.eq("tag", tag) : query;
  };

  const [total, deliveries, safety] = await Promise.all([count(), count("delivery"), count("safety")]);
  for (const result of [total, deliveries, safety]) {
    if (result.error) throw result.error;
  }

  return {
    photos: total.count ?? 0,
    deliveries: deliveries.count ?? 0,
    safety: safety.count ?? 0,
  };
}

export type FetchOpsSitePhotosOptions = {
  listState: OpsListState;
  siteId?: string;
  tag?: string;
};

/**
 * The site photo gallery, one page at a time.
 *
 * Paging matters more here than on a text list: every row costs a signed R2 URL
 * to mint, so an unbounded gallery is unbounded signing work per render. The
 * previous hard `limit(60)` also silently hid everything older than the most
 * recent 60 photos, with no way to reach them.
 */
export async function fetchPaginatedOpsSitePhotos({
  listState,
  siteId,
  tag,
}: FetchOpsSitePhotosOptions) {
  const supabase = await createOpsServerSessionClient();
  let query = supabase.from("site_photos").select(PHOTO_COLUMNS, { count: "exact" });

  const search = opsIlikeOrFilter(["caption"], listState.query);
  if (search) query = query.or(search);
  if (siteId) query = query.eq("site_id", siteId);
  if (tag) query = query.eq("tag", tag);

  const { count, data, error } = await query
    .order("taken_at", { ascending: false })
    .order("created_at", { ascending: false })
    .range(listState.from, listState.to);

  if (error) {
    throw error;
  }

  return toOpsPaginatedResult(
    await withSignedUrls((data ?? []) as unknown as RawSitePhoto[]),
    count,
    listState,
  );
}
