import { HardHat, MapPin, Plus } from "lucide-react";
import { notFound } from "next/navigation";
import {
  OpsMobileRecordCard,
  OpsMobileRecordList,
  OpsMobileRecordRow,
} from "@/components/ops/OpsMobileRecord";
import { requireOpsUser } from "@/lib/ops/auth";
import { formatCoordinateValue } from "@/lib/ops/coordinates";
import { createSiteAction } from "@/lib/ops/site-actions";
import { fetchOpsSites, type OpsSite } from "@/lib/ops/sites";
import { canAccessOpsHref, canManageOps } from "@/lib/ops/permissions";
import {
  formatZmw,
  noticeFromParams,
  OPS_INPUT_CLASS,
  OPS_LABEL_CLASS,
  OPS_PRIMARY_BUTTON_CLASS,
  OPS_TABLE_SCROLL_CLASS,
  type OpsSearchParams,
} from "@/lib/ops/ui";

type PageProps = {
  searchParams?: Promise<OpsSearchParams>;
};

function statusClass(status: OpsSite["status"]) {
  if (status === "active") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "mobilizing") {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }

  return "border-orange-200 bg-orange-50 text-orange-700";
}

export default async function OpsSitesPage({ searchParams }: PageProps) {
  const [params, auth] = await Promise.all([searchParams ?? Promise.resolve({}), requireOpsUser()]);

  if (!canAccessOpsHref(auth.profile.role, "/ops/sites")) {
    notFound();
  }

  const sites = await fetchOpsSites();
  const canManage = canManageOps(auth.profile.role);
  const notice = noticeFromParams(
    params,
    "site",
    "Site created successfully.",
  );
  const totalBudget = sites.reduce((sum, site) => sum + site.budget_zmw, 0);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="rounded-lg border border-primary-dark/10 bg-white p-5 md:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-blue">
              Pymble Sites
            </p>
            <h1 className="mt-2 font-heading text-3xl font-bold text-primary-dark">
              Project site register
            </h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-primary-dark/68">
              Manage active project sites, supervisors, GPS coordinates, and budgets.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-md border border-primary-dark/10 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-dark/45">
                Active sites
              </p>
              <p className="mt-1 font-heading text-2xl font-bold text-primary-dark">
                {sites.length}
              </p>
            </div>
            <div className="rounded-md border border-primary-dark/10 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-dark/45">
                Budget total
              </p>
              <p className="mt-1 font-heading text-2xl font-bold text-primary-dark">
                {formatZmw(totalBudget)}
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

      {canManage ? (
        <section className="rounded-lg border border-primary-dark/10 bg-white p-5">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-md bg-primary-blue text-white">
              <Plus className="size-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="font-heading text-xl font-bold text-primary-dark">Add site</h2>
              <p className="text-sm text-primary-dark/60">
                New site records are created by operations managers and above.
              </p>
            </div>
          </div>
          <form
            action={createSiteAction}
            className="grid gap-4 min-[520px]:grid-cols-2 lg:grid-cols-6"
          >
            <label className={OPS_LABEL_CLASS}>
              Code
              <input className={OPS_INPUT_CLASS} name="code" required />
            </label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
              Site name
              <input className={OPS_INPUT_CLASS} name="name" required />
            </label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
              Location
              <input className={OPS_INPUT_CLASS} name="location" required />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Status
              <select className={OPS_INPUT_CLASS} defaultValue="active" name="status">
                <option value="active">Active</option>
                <option value="mobilizing">Mobilizing</option>
                <option value="closing">Closing</option>
              </select>
            </label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
              Supervisor
              <input className={OPS_INPUT_CLASS} name="supervisor_name" />
            </label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
              Client
              <input className={OPS_INPUT_CLASS} name="client_name" />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Budget ZMW
              <input
                className={OPS_INPUT_CLASS}
                min="0"
                name="budget_zmw"
                step="0.01"
                type="number"
              />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Latitude
              <input className={OPS_INPUT_CLASS} inputMode="decimal" name="latitude" />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Longitude
              <input className={OPS_INPUT_CLASS} inputMode="decimal" name="longitude" />
            </label>
            <div className="flex items-end min-[520px]:col-span-2 lg:col-span-2">
              <button
                className={`${OPS_PRIMARY_BUTTON_CLASS} w-full`}
                type="submit"
              >
                <Plus className="size-4" aria-hidden="true" />
                Add site
              </button>
            </div>
          </form>
        </section>
      ) : (
        <div className="rounded-md border border-primary-dark/10 bg-white px-4 py-3 text-sm text-primary-dark/65">
          Your role has read-only access to the site register.
        </div>
      )}

      <section className="rounded-lg border border-primary-dark/10 bg-white">
        <div className="border-b border-primary-dark/10 p-5">
          <h2 className="font-heading text-xl font-bold text-primary-dark">Current sites</h2>
        </div>
        {sites.length > 0 ? (
          <>
            <OpsMobileRecordList>
              {sites.map((site) => (
                <OpsMobileRecordCard key={site.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-heading text-lg font-bold text-primary-dark">
                        {site.name}
                      </p>
                      <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-primary-dark/45">
                        {site.code}
                      </p>
                    </div>
                    <span
                      className={`inline-flex shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${statusClass(site.status)}`}
                    >
                      {site.status}
                    </span>
                  </div>
                  <OpsMobileRecordRow label="Location">{site.location}</OpsMobileRecordRow>
                  <OpsMobileRecordRow label="Supervisor">
                    {site.supervisor_name || "Supervisor not assigned"}
                  </OpsMobileRecordRow>
                  <OpsMobileRecordRow label="GPS">
                    {site.latitude !== null && site.longitude !== null
                      ? `${formatCoordinateValue(site.latitude)}, ${formatCoordinateValue(
                          site.longitude,
                        )}`
                      : "Coordinates not set"}
                  </OpsMobileRecordRow>
                  <OpsMobileRecordRow label="Budget">
                    {formatZmw(site.budget_zmw)}
                  </OpsMobileRecordRow>
                </OpsMobileRecordCard>
              ))}
            </OpsMobileRecordList>
            <div
              aria-label="Current sites table"
              className={`hidden md:block ${OPS_TABLE_SCROLL_CLASS}`}
              tabIndex={0}
            >
            <table className="min-w-full divide-y divide-primary-dark/10 text-sm">
              <caption className="sr-only">
                Current Pymble sites with location, supervisor, GPS, budget, and status.
              </caption>
              <thead className="bg-primary-dark/[0.03] text-left text-xs uppercase tracking-[0.12em] text-primary-dark/52">
                <tr>
                  <th className="px-5 py-3" scope="col">
                    Site
                  </th>
                  <th className="px-5 py-3" scope="col">
                    Location
                  </th>
                  <th className="px-5 py-3" scope="col">
                    Supervisor
                  </th>
                  <th className="px-5 py-3" scope="col">
                    GPS
                  </th>
                  <th className="px-5 py-3" scope="col">
                    Budget
                  </th>
                  <th className="px-5 py-3" scope="col">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-primary-dark/10">
                {sites.map((site) => (
                  <tr key={site.id}>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary-dark text-white">
                          <HardHat className="size-4" aria-hidden="true" />
                        </div>
                        <div>
                          <p className="font-bold text-primary-dark">{site.name}</p>
                          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-primary-dark/45">
                            {site.code}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-primary-dark/70">
                      <span className="inline-flex items-center gap-2">
                        <MapPin className="size-4 text-primary-blue" aria-hidden="true" />
                        {site.location}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-primary-dark/70">
                      {site.supervisor_name || "Supervisor not assigned"}
                    </td>
                    <td className="px-5 py-4 text-primary-dark/70">
                      {site.latitude !== null && site.longitude !== null
                        ? `${formatCoordinateValue(site.latitude)}, ${formatCoordinateValue(
                            site.longitude,
                          )}`
                        : "Coordinates not set"}
                    </td>
                    <td className="px-5 py-4 font-semibold text-primary-dark">
                      {formatZmw(site.budget_zmw)}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${statusClass(site.status)}`}
                      >
                        {site.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </>
        ) : (
          <div className="flex min-h-56 flex-col items-center justify-center gap-3 p-8 text-center">
            <HardHat className="size-10 text-primary-blue" aria-hidden="true" />
            <div>
              <p className="font-heading text-xl font-bold text-primary-dark">
                No sites registered yet
              </p>
              <p className="mt-2 max-w-lg text-sm leading-6 text-primary-dark/60">
                Create your first site above. Site coordinates will appear on the overview map and
                enable worker assignment.
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
