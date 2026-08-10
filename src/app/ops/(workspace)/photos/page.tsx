import { Camera, ExternalLink, Plus, Trash2 } from "lucide-react";
import { notFound } from "next/navigation";
import { OpsConfirmSubmitButton } from "@/components/ops/OpsConfirmSubmitButton";
import {
  OpsListControls,
  OpsPaginationControls,
  type OpsListSelectFilter,
} from "@/components/ops/OpsListControls";
import { parseOpsListState } from "@/lib/ops/listing";
import { OpsOfflineForm } from "@/components/ops/OpsOfflineForm";
import { OpsSubmitButton } from "@/components/ops/OpsSubmitButton";
import { fetchOpsModuleAccessOverrides } from "@/lib/ops/module-access";
import { deleteSitePhotoAction, uploadSitePhotoAction } from "@/lib/ops/photo-actions";
import {
  fetchOpsSitePhotoSummary,
  fetchPaginatedOpsSitePhotos,
  type OpsSitePhoto,
} from "@/lib/ops/photos";
import { requireOpsUser } from "@/lib/ops/auth";
import { canAccessOpsHref, canManageSites, canRecordAttendance } from "@/lib/ops/permissions";
import { fetchActiveSiteOptions } from "@/lib/ops/sites";
import {
  firstParam,
  noticeFromParams,
  OPS_DANGER_BUTTON_CLASS,
  OPS_FOCUS_CLASS,
  OPS_INPUT_CLASS,
  OPS_LABEL_CLASS,
  OPS_PRIMARY_BUTTON_CLASS,
  type OpsSearchParams,
  OPS_NOTICE_WARNING_CLASS,
} from "@/lib/ops/ui";
import { formatOpsDateTime as formatDateTime } from "@/lib/ops/format";

type PageProps = {
  searchParams?: Promise<OpsSearchParams>;
};

function tagClass(tag: OpsSitePhoto["tag"]) {
  if (tag === "safety") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (tag === "delivery") {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }

  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

export default async function OpsPhotosPage({ searchParams }: PageProps) {
  const [params, auth] = await Promise.all([
    searchParams ?? Promise.resolve({} as OpsSearchParams),
    requireOpsUser(),
  ]);

  if (!canAccessOpsHref(auth.profile.role, "/ops/photos", await fetchOpsModuleAccessOverrides())) {
    notFound();
  }

  const listState = parseOpsListState(params, { defaultPageSize: 24 });
  const siteFilter = firstParam(params.site) ?? "";
  const tagFilter = firstParam(params.tag) ?? "";

  const [photoPage, summary, siteOptions] = await Promise.all([
    fetchPaginatedOpsSitePhotos({ listState, siteId: siteFilter, tag: tagFilter }),
    fetchOpsSitePhotoSummary(),
    fetchActiveSiteOptions(),
  ]);
  const photos = photoPage.items;
  const canUpload = canRecordAttendance(auth.profile.role);
  const canManagePhotos = canManageSites(auth.profile.role);
  const notice =
    noticeFromParams(params, "photo", "Photo uploaded successfully.") ??
    (firstParam(params.deleted) === "photo"
      ? { tone: "success" as const, message: "Photo deleted." }
      : null);

  const listFilters: OpsListSelectFilter[] = [
    {
      label: "Site",
      name: "site",
      options: [
        { label: "All sites", value: "" },
        ...siteOptions.map((site) => ({ label: `${site.code} - ${site.name}`, value: site.id })),
      ],
      value: siteFilter,
    },
    {
      label: "Tag",
      name: "tag",
      options: [
        { label: "All tags", value: "" },
        { label: "Progress", value: "progress" },
        { label: "Delivery", value: "delivery" },
        { label: "Safety", value: "safety" },
      ],
      value: tagFilter,
    },
  ];
  const hasActiveFilter =
    listState.query.length > 0 || siteFilter.length > 0 || tagFilter.length > 0;

  return (
    <div className="w-full max-w-none space-y-6">
      <section className="rounded-lg border border-border bg-card p-5 md:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-blue">
              Pymble Photos
            </p>
            <h1 className="mt-2 font-heading text-3xl font-bold text-foreground">
              Private site photo log
            </h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-foreground/68">
              Upload progress, delivery, and safety photos to the secure Pymble archive.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-md border border-border px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Photos
              </p>
              <p className="mt-1 font-heading text-2xl font-bold text-foreground">
                {summary.photos}
              </p>
            </div>
            <div className="rounded-md border border-border px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Deliveries
              </p>
              <p className="mt-1 font-heading text-2xl font-bold text-foreground">
                {summary.deliveries}
              </p>
            </div>
            <div className="rounded-md border border-border px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Safety
              </p>
              <p className="mt-1 font-heading text-2xl font-bold text-foreground">
                {summary.safety}
              </p>
            </div>
          </div>
        </div>
      </section>

      {notice ? (
        <div
          className={`rounded-md border px-4 py-3 text-sm font-semibold ${
            notice.tone === "error"
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
          role={notice.tone === "error" ? "alert" : "status"}
        >
          {notice.message}
        </div>
      ) : null}

      {canUpload ? (
        <section className="rounded-lg border border-border bg-card p-5">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-md bg-primary-blue text-white">
              <Plus className="size-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="font-heading text-xl font-bold text-foreground">Upload photo</h2>
              <p className="text-sm text-muted-foreground">
                Photos are stored securely. Each upload is logged with site, tag, and timestamp.
              </p>
            </div>
          </div>
          {siteOptions.length === 0 ? (
            <div className={OPS_NOTICE_WARNING_CLASS}>
              Add at least one site before uploading photos.
            </div>
          ) : (
            <OpsOfflineForm
              action={uploadSitePhotoAction}
              className="grid gap-4 min-[520px]:grid-cols-2 lg:grid-cols-4"
              kind="site_photo.upload"
              replayEndpoint="/api/ops/offline/photos"
              summary="Site photo"
            >
              <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
                Site
                <select className={OPS_INPUT_CLASS} defaultValue="" name="site_id" required>
                  <option value="" disabled>
                    Select Pymble site
                  </option>
                  {siteOptions.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.code} - {site.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={OPS_LABEL_CLASS}>
                Tag
                <select className={OPS_INPUT_CLASS} defaultValue="progress" name="tag">
                  <option value="progress">Progress</option>
                  <option value="delivery">Delivery</option>
                  <option value="safety">Safety</option>
                </select>
              </label>
              <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
                Caption
                <input className={OPS_INPUT_CLASS} name="caption" />
              </label>
              <label className={OPS_LABEL_CLASS}>
                Image
                <input
                  accept="image/gif,image/jpeg,image/png,image/webp"
                  className={OPS_INPUT_CLASS}
                  name="photo"
                  required
                  type="file"
                />
              </label>
              <div className="flex items-end min-[520px]:col-span-2 lg:col-span-4">
                <OpsSubmitButton
                  className={`${OPS_PRIMARY_BUTTON_CLASS} w-full md:w-auto`}
                  pendingLabel="Uploading..."
                >
                  <Camera className="size-4" aria-hidden="true" />
                  Upload photo
                </OpsSubmitButton>
              </div>
            </OpsOfflineForm>
          )}
        </section>
      ) : null}

      <section className="overflow-hidden rounded-lg border border-border bg-card" id="photo-list">
        <OpsListControls
          action="/ops/photos"
          filters={listFilters}
          params={params}
          placeholder="Search captions"
          query={listState.query}
          resultLabel="photos"
        />
        {photos.length > 0 ? (
          <div className="grid gap-4 p-5 min-[520px]:grid-cols-2 xl:grid-cols-3">
            {photos.map((photo) => (
              <article
                className="overflow-hidden rounded-lg border border-border bg-card"
                key={photo.id}
              >
                <a
                  aria-label={`Open ${photo.caption || photo.tag} photo`}
                  className={`block aspect-[4/3] bg-muted/40 bg-cover bg-center ${OPS_FOCUS_CLASS}`}
                  href={photo.signed_url}
                  rel="noreferrer"
                  style={{ backgroundImage: `url("${photo.signed_url}")` }}
                  target="_blank"
                />
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-foreground">
                        {photo.site?.code ?? "Site code unavailable"} -{" "}
                        {photo.site?.name ?? "Site record unavailable"}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {formatDateTime(photo.taken_at)}
                      </p>
                    </div>
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${tagClass(photo.tag)}`}
                    >
                      {photo.tag}
                    </span>
                  </div>
                  <p className="mt-3 min-h-10 text-sm leading-6 text-foreground/68">
                    {photo.caption || "Caption not recorded"}
                  </p>
                  <a
                    className={`mt-3 inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-semibold text-primary-blue hover:text-foreground ${OPS_FOCUS_CLASS}`}
                    href={photo.signed_url}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Open photo
                    <ExternalLink className="size-4" aria-hidden="true" />
                  </a>
                  {photo.uploaded_by === auth.profile.id || canManagePhotos ? (
                    <form action={deleteSitePhotoAction} className="mt-3">
                      <input name="id" type="hidden" value={photo.id} />
                      <OpsConfirmSubmitButton
                        className={OPS_DANGER_BUTTON_CLASS}
                        confirmText="Confirm delete"
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                        Delete photo
                      </OpsConfirmSubmitButton>
                    </form>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="flex min-h-56 flex-col items-center justify-center gap-3 p-8 text-center">
            <Camera className="size-10 text-primary-blue" aria-hidden="true" />
            <div>
              <p className="font-heading text-xl font-bold text-foreground">
                {hasActiveFilter ? "No photos match this search" : "No site photos yet"}
              </p>
              <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
                {hasActiveFilter
                  ? "Clear the search, or pick a different site or tag."
                  : "Site photos will appear here after the first upload."}
              </p>
            </div>
          </div>
        )}
        <OpsPaginationControls
          anchor="photo-list"
          basePath="/ops/photos"
          filters={listFilters}
          pagination={photoPage.pagination}
          params={params}
          query={listState.query}
          resultLabel="photos"
        />
      </section>
    </div>
  );
}
