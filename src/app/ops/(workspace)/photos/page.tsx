import { Camera, ExternalLink, Plus } from "lucide-react";
import { notFound } from "next/navigation";
import { uploadSitePhotoAction } from "@/lib/ops/photo-actions";
import { fetchOpsSitePhotos, type OpsSitePhoto } from "@/lib/ops/photos";
import { requireOpsUser } from "@/lib/ops/auth";
import { canAccessOpsHref, canRecordAttendance } from "@/lib/ops/permissions";
import { fetchActiveSiteOptions } from "@/lib/ops/sites";
import {
  noticeFromParams,
  OPS_FOCUS_CLASS,
  OPS_INPUT_CLASS,
  OPS_LABEL_CLASS,
  OPS_PRIMARY_BUTTON_CLASS,
  type OpsSearchParams,
} from "@/lib/ops/ui";

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

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-ZM", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Lusaka",
  }).format(new Date(value));
}

export default async function OpsPhotosPage({ searchParams }: PageProps) {
  const [params, auth] = await Promise.all([searchParams ?? Promise.resolve({}), requireOpsUser()]);

  if (!canAccessOpsHref(auth.profile.role, "/ops/photos")) {
    notFound();
  }

  const [photos, siteOptions] = await Promise.all([
    fetchOpsSitePhotos(),
    fetchActiveSiteOptions(),
  ]);
  const canUpload = canRecordAttendance(auth.profile.role);
  const notice = noticeFromParams(params, "photo", "Photo uploaded successfully.");
  const safetyCount = photos.filter((photo) => photo.tag === "safety").length;
  const deliveryCount = photos.filter((photo) => photo.tag === "delivery").length;

  return (
    <div className="w-full max-w-none space-y-6">
      <section className="rounded-lg border border-primary-dark/10 bg-white p-5 md:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-blue">
              Pymble Photos
            </p>
            <h1 className="mt-2 font-heading text-3xl font-bold text-primary-dark">
              Private site photo log
            </h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-primary-dark/68">
              Upload progress, delivery, and safety photos to the secure Pymble archive.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-md border border-primary-dark/10 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-dark/45">
                Photos
              </p>
              <p className="mt-1 font-heading text-2xl font-bold text-primary-dark">
                {photos.length}
              </p>
            </div>
            <div className="rounded-md border border-primary-dark/10 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-dark/45">
                Deliveries
              </p>
              <p className="mt-1 font-heading text-2xl font-bold text-primary-dark">
                {deliveryCount}
              </p>
            </div>
            <div className="rounded-md border border-primary-dark/10 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-dark/45">
                Safety
              </p>
              <p className="mt-1 font-heading text-2xl font-bold text-primary-dark">
                {safetyCount}
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
        <section className="rounded-lg border border-primary-dark/10 bg-white p-5">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-md bg-primary-blue text-white">
              <Plus className="size-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="font-heading text-xl font-bold text-primary-dark">Upload photo</h2>
              <p className="text-sm text-primary-dark/60">
                Photos are stored securely. Each upload is logged with site, tag, and timestamp.
              </p>
            </div>
          </div>
          {siteOptions.length === 0 ? (
            <div className="rounded-md border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
              Add at least one site before uploading photos.
            </div>
          ) : (
            <form
              action={uploadSitePhotoAction}
              className="grid gap-4 min-[520px]:grid-cols-2 lg:grid-cols-6"
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
              <div className="flex items-end min-[520px]:col-span-2 lg:col-span-6">
                <button
                  className={`${OPS_PRIMARY_BUTTON_CLASS} w-full md:w-auto`}
                  type="submit"
                >
                  <Camera className="size-4" aria-hidden="true" />
                  Upload photo
                </button>
              </div>
            </form>
          )}
        </section>
      ) : null}

      <section>
        {photos.length > 0 ? (
          <div className="grid gap-4 min-[520px]:grid-cols-2 xl:grid-cols-3">
            {photos.map((photo) => (
              <article
                className="overflow-hidden rounded-lg border border-primary-dark/10 bg-white"
                key={photo.id}
              >
                <a
                  aria-label={`Open ${photo.caption || photo.tag} photo`}
                  className={`block aspect-[4/3] bg-primary-dark/5 bg-cover bg-center ${OPS_FOCUS_CLASS}`}
                  href={photo.signed_url}
                  rel="noreferrer"
                  style={{ backgroundImage: `url("${photo.signed_url}")` }}
                  target="_blank"
                />
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-primary-dark">
                        {photo.site?.code ?? "Site code unavailable"} -{" "}
                        {photo.site?.name ?? "Site record unavailable"}
                      </p>
                      <p className="mt-1 text-sm text-primary-dark/60">
                        {formatDateTime(photo.taken_at)}
                      </p>
                    </div>
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${tagClass(photo.tag)}`}
                    >
                      {photo.tag}
                    </span>
                  </div>
                  <p className="mt-3 min-h-10 text-sm leading-6 text-primary-dark/68">
                    {photo.caption || "Caption not recorded"}
                  </p>
                  <a
                    className={`mt-3 inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-semibold text-primary-blue hover:text-primary-dark ${OPS_FOCUS_CLASS}`}
                    href={photo.signed_url}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Open photo
                    <ExternalLink className="size-4" aria-hidden="true" />
                  </a>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="flex min-h-56 flex-col items-center justify-center gap-3 rounded-lg border border-primary-dark/10 bg-white p-8 text-center">
            <Camera className="size-10 text-primary-blue" aria-hidden="true" />
            <div>
              <p className="font-heading text-xl font-bold text-primary-dark">
                No site photos yet
              </p>
              <p className="mt-2 max-w-lg text-sm leading-6 text-primary-dark/60">
                Site photos will appear here after the first upload.
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
