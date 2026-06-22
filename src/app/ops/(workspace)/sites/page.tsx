import { Archive, HardHat, MapPin, Pencil, Plus } from "lucide-react";
import { notFound } from "next/navigation";
import { OpsListControls, OpsPaginationControls } from "@/components/ops/OpsListControls";
import {
  OpsMobileRecordCard,
  OpsMobileRecordList,
  OpsMobileRecordRow,
} from "@/components/ops/OpsMobileRecord";
import { OpsRecordActivityPanel } from "@/components/ops/OpsRecordActivityPanel";
import { OpsSubmitButton } from "@/components/ops/OpsSubmitButton";
import { requireOpsUser } from "@/lib/ops/auth";
import { formatCoordinateValue } from "@/lib/ops/coordinates";
import { parseOpsListState } from "@/lib/ops/listing";
import { archiveSiteAction, createSiteAction, updateSiteAction } from "@/lib/ops/site-actions";
import { fetchPaginatedOpsSites, type OpsSite } from "@/lib/ops/sites";
import {
  canAccessOpsHref,
  canArchiveSite,
  canManageSites,
  canViewSiteBudget,
} from "@/lib/ops/permissions";
import type { OpsSiteStage } from "@/lib/ops/types";
import {
  firstParam,
  formatZmw,
  noticeFromParams,
  OPS_DANGER_BUTTON_CLASS,
  OPS_FOCUS_CLASS,
  OPS_INPUT_CLASS,
  OPS_LABEL_CLASS,
  OPS_PRIMARY_BUTTON_CLASS,
  OPS_TABLE_SCROLL_CLASS,
  type OpsSearchParams,
} from "@/lib/ops/ui";

type PageProps = {
  searchParams?: Promise<OpsSearchParams>;
};

const STAGE_SELECT_OPTIONS: Array<{ label: string; value: OpsSiteStage }> = [
  { label: "Planning", value: "planning" },
  { label: "Mobilizing", value: "mobilizing" },
  { label: "In progress", value: "in_progress" },
  { label: "Handover", value: "handover" },
  { label: "Completed", value: "completed" },
  { label: "On hold", value: "on_hold" },
  { label: "Cancelled", value: "cancelled" },
];

const STAGE_FILTER_OPTIONS: Array<{ label: string; value: OpsSiteStage | "" }> = [
  { label: "All stages", value: "" },
  ...STAGE_SELECT_OPTIONS,
];

function stageFromParam(value: string | undefined) {
  return STAGE_SELECT_OPTIONS.some((option) => option.value === value)
    ? (value as OpsSiteStage)
    : "";
}

function stageLabel(stage: OpsSiteStage) {
  return STAGE_SELECT_OPTIONS.find((option) => option.value === stage)?.label ?? stage;
}

function stageClass(stage: OpsSiteStage) {
  switch (stage) {
    case "completed":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "in_progress":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "mobilizing":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "handover":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "cancelled":
      return "border-red-200 bg-red-50 text-red-700";
    case "on_hold":
      return "border-primary-dark/15 bg-primary-dark/[0.05] text-primary-dark/60";
    default:
      return "border-primary-dark/15 bg-primary-dark/[0.04] text-primary-dark/55";
  }
}

function siteNotice(params: OpsSearchParams) {
  const created = noticeFromParams(params, "site", "Site created successfully.");

  if (created) {
    return created;
  }

  const updated = firstParam(params.updated);

  if (updated === "site") {
    return { tone: "success" as const, message: "Site updated." };
  }

  if (updated === "archived") {
    return { tone: "success" as const, message: "Site archived." };
  }

  if (updated === "attachment") {
    return { tone: "success" as const, message: "Site attachment uploaded." };
  }

  if (updated === "comment") {
    return { tone: "success" as const, message: "Site comment added." };
  }

  return null;
}

function ProgressBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-full min-w-[5rem] overflow-hidden rounded-full bg-primary-dark/10">
        <div
          className="h-full rounded-full bg-primary-blue"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="shrink-0 text-xs font-bold text-primary-dark/70">{Math.round(pct)}%</span>
    </div>
  );
}

function StageBadge({ stage }: { stage: OpsSiteStage }) {
  return (
    <span
      className={`inline-flex shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${stageClass(stage)}`}
    >
      {stageLabel(stage)}
    </span>
  );
}

function SiteFields({ site, canSeeBudget }: { site?: OpsSite; canSeeBudget: boolean }) {
  return (
    <>
      <label className={OPS_LABEL_CLASS}>
        Code
        <input className={OPS_INPUT_CLASS} defaultValue={site?.code ?? ""} name="code" required />
      </label>
      <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
        Site name
        <input className={OPS_INPUT_CLASS} defaultValue={site?.name ?? ""} name="name" required />
      </label>
      <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
        Location
        <input
          className={OPS_INPUT_CLASS}
          defaultValue={site?.location ?? ""}
          name="location"
          required
        />
      </label>
      <label className={OPS_LABEL_CLASS}>
        Stage
        <select className={OPS_INPUT_CLASS} defaultValue={site?.stage ?? "planning"} name="stage">
          {STAGE_SELECT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className={OPS_LABEL_CLASS}>
        Progress %
        <input
          className={OPS_INPUT_CLASS}
          defaultValue={site ? String(site.progress_percent) : "0"}
          max="100"
          min="0"
          name="progress_percent"
          step="1"
          type="number"
        />
      </label>
      <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
        Supervisor
        <input
          className={OPS_INPUT_CLASS}
          defaultValue={site?.supervisor_name ?? ""}
          name="supervisor_name"
        />
      </label>
      <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
        Client
        <input
          className={OPS_INPUT_CLASS}
          defaultValue={site?.client_name ?? ""}
          name="client_name"
        />
      </label>
      {canSeeBudget ? (
        <label className={OPS_LABEL_CLASS}>
          Budget ZMW
          <input
            className={OPS_INPUT_CLASS}
            defaultValue={site ? String(site.budget_zmw) : ""}
            min="0"
            name="budget_zmw"
            step="0.01"
            type="number"
          />
        </label>
      ) : null}
      <label className={OPS_LABEL_CLASS}>
        Latitude
        <input
          className={OPS_INPUT_CLASS}
          defaultValue={site?.latitude ?? ""}
          inputMode="decimal"
          name="latitude"
        />
      </label>
      <label className={OPS_LABEL_CLASS}>
        Longitude
        <input
          className={OPS_INPUT_CLASS}
          defaultValue={site?.longitude ?? ""}
          inputMode="decimal"
          name="longitude"
        />
      </label>
    </>
  );
}

function SiteManagePanel({
  canArchive,
  canSeeBudget,
  site,
}: {
  canArchive: boolean;
  canSeeBudget: boolean;
  site: OpsSite;
}) {
  return (
    <details className="rounded-md border border-primary-dark/10">
      <summary
        className={`flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 text-sm font-bold text-primary-dark transition hover:text-primary-blue [&::-webkit-details-marker]:hidden ${OPS_FOCUS_CLASS}`}
      >
        <span className="inline-flex items-center gap-2">
          <Pencil className="size-4" aria-hidden="true" />
          Edit site
        </span>
        <span className="text-xs uppercase tracking-[0.12em] text-primary-dark/45">Open</span>
      </summary>
      <div className="border-t border-primary-dark/10 p-4">
        <form action={updateSiteAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <input name="id" type="hidden" value={site.id} />
          <SiteFields canSeeBudget={canSeeBudget} site={site} />
          <div className="flex items-end sm:col-span-2 lg:col-span-6">
            <OpsSubmitButton
              className={`${OPS_PRIMARY_BUTTON_CLASS} w-full sm:w-auto`}
              pendingLabel="Saving..."
            >
              <Pencil className="size-4" aria-hidden="true" />
              Save changes
            </OpsSubmitButton>
          </div>
        </form>
        {canArchive ? (
          <form action={archiveSiteAction} className="mt-3 border-t border-primary-dark/10 pt-3">
            <input name="id" type="hidden" value={site.id} />
            <OpsSubmitButton
              className={`${OPS_DANGER_BUTTON_CLASS} w-full sm:w-auto`}
              pendingLabel="Archiving..."
            >
              <Archive className="size-4" aria-hidden="true" />
              Archive site
            </OpsSubmitButton>
          </form>
        ) : null}
      </div>
    </details>
  );
}

export default async function OpsSitesPage({ searchParams }: PageProps) {
  const [params, auth] = await Promise.all([
    searchParams ?? Promise.resolve({} as OpsSearchParams),
    requireOpsUser(),
  ]);

  if (!canAccessOpsHref(auth.profile.role, "/ops/sites")) {
    notFound();
  }

  const listState = parseOpsListState(params, { defaultPageSize: 10 });
  const stage = stageFromParam(firstParam(params.stage));
  const sitePage = await fetchPaginatedOpsSites({
    listState,
    query: listState.query,
    stage: stage || undefined,
  });
  const sites = sitePage.items;
  const hasActiveListFilter = listState.query.length > 0 || Boolean(stage);
  const canManage = canManageSites(auth.profile.role);
  const canArchive = canArchiveSite(auth.profile.role);
  const canSeeBudget = canViewSiteBudget(auth.profile.role);
  const notice = siteNotice(params);
  const totalBudget = sites.reduce((sum, site) => sum + site.budget_zmw, 0);
  const avgCompletion =
    sites.length > 0
      ? Math.round(sites.reduce((sum, site) => sum + site.progress_percent, 0) / sites.length)
      : 0;

  return (
    <div className="w-full max-w-none space-y-6">
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
              Manage project sites, supervisors, GPS coordinates, budgets, lifecycle stage, and
              completion progress.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border border-primary-dark/10 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-dark/45">
                Matching sites
              </p>
              <p className="mt-1 font-heading text-2xl font-bold text-primary-dark">
                {sitePage.pagination.total}
              </p>
            </div>
            <div className="rounded-md border border-primary-dark/10 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-dark/45">
                Avg completion
              </p>
              <p className="mt-1 font-heading text-2xl font-bold text-primary-dark">
                {avgCompletion}%
              </p>
            </div>
            {canSeeBudget ? (
              <div className="rounded-md border border-primary-dark/10 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-dark/45">
                  Shown budget
                </p>
                <p className="mt-1 font-heading text-2xl font-bold text-primary-dark">
                  {formatZmw(totalBudget)}
                </p>
              </div>
            ) : null}
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
                New site records are created by operations and projects managers and above.
              </p>
            </div>
          </div>
          <form action={createSiteAction} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
            <SiteFields canSeeBudget={canSeeBudget} />
            <div className="flex items-end sm:col-span-2 lg:col-span-2">
              <OpsSubmitButton
                className={`${OPS_PRIMARY_BUTTON_CLASS} w-full`}
                pendingLabel="Adding site..."
              >
                <Plus className="size-4" aria-hidden="true" />
                Add site
              </OpsSubmitButton>
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
        <OpsListControls
          action="/ops/sites"
          filters={[
            {
              label: "Stage",
              name: "stage",
              options: STAGE_FILTER_OPTIONS,
              value: stage,
            },
          ]}
          placeholder="Search code, site, location, client, or supervisor"
          query={listState.query}
          resultLabel="sites"
        />
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
                    <StageBadge stage={site.stage} />
                  </div>
                  <OpsMobileRecordRow label="Progress">
                    <ProgressBar value={site.progress_percent} />
                  </OpsMobileRecordRow>
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
                  {canSeeBudget ? (
                    <OpsMobileRecordRow label="Budget">
                      {formatZmw(site.budget_zmw)}
                    </OpsMobileRecordRow>
                  ) : null}
                  {canManage ? (
                    <SiteManagePanel
                      canArchive={canArchive}
                      canSeeBudget={canSeeBudget}
                      site={site}
                    />
                  ) : null}
                  <OpsRecordActivityPanel
                    canManage={canManage}
                    sourceId={site.id}
                    sourceTable="sites"
                  />
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
                  Current Pymble sites with location, supervisor, GPS, budget, stage, and progress.
                </caption>
                <thead className="bg-primary-dark/[0.03] text-left text-xs uppercase tracking-[0.12em] text-primary-dark/52">
                  <tr>
                    <th className="px-5 py-3" scope="col">
                      Site
                    </th>
                    <th className="px-5 py-3" scope="col">
                      Stage
                    </th>
                    <th className="px-5 py-3" scope="col">
                      Progress
                    </th>
                    <th className="px-5 py-3" scope="col">
                      Location
                    </th>
                    <th className="px-5 py-3" scope="col">
                      Supervisor
                    </th>
                    {canSeeBudget ? (
                      <th className="px-5 py-3" scope="col">
                        Budget
                      </th>
                    ) : null}
                    {canManage ? (
                      <th className="px-5 py-3" scope="col">
                        Manage
                      </th>
                    ) : null}
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
                      <td className="px-5 py-4">
                        <StageBadge stage={site.stage} />
                      </td>
                      <td className="min-w-[10rem] px-5 py-4">
                        <ProgressBar value={site.progress_percent} />
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
                      {canSeeBudget ? (
                        <td className="px-5 py-4 font-semibold text-primary-dark">
                          {formatZmw(site.budget_zmw)}
                        </td>
                      ) : null}
                      {canManage ? (
                        <td className="min-w-[26rem] px-5 py-4 align-top">
                          <SiteManagePanel
                            canArchive={canArchive}
                            canSeeBudget={canSeeBudget}
                            site={site}
                          />
                        </td>
                      ) : null}
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
                {hasActiveListFilter ? "No matching sites" : "No sites registered yet"}
              </p>
              <p className="mt-2 max-w-lg text-sm leading-6 text-primary-dark/60">
                {hasActiveListFilter
                  ? "Adjust the search or stage filter to widen the site register."
                  : "Create your first site above. Site coordinates will appear on the overview map and enable worker assignment."}
              </p>
            </div>
          </div>
        )}
        <OpsPaginationControls
          basePath="/ops/sites"
          filters={[
            {
              label: "Stage",
              name: "stage",
              options: [],
              value: stage,
            },
          ]}
          pagination={sitePage.pagination}
          query={listState.query}
          resultLabel="sites"
        />
      </section>
    </div>
  );
}
