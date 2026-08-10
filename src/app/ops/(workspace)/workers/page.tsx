import React from "react";
import { BadgeDollarSign, Phone, Plus, Users } from "lucide-react";
import { notFound } from "next/navigation";
import { OpsCollapsible } from "@/components/ops/OpsCollapsible";
import { OpsField, OpsFormGrid } from "@/components/ops/OpsForm";
import {
  OpsListControls,
  OpsPaginationControls,
  type OpsListSelectFilter,
} from "@/components/ops/OpsListControls";
import {
  OpsMobileRecordCard,
  OpsMobileRecordList,
  OpsMobileRecordRow,
} from "@/components/ops/OpsMobileRecord";
import { OpsSubmitButton } from "@/components/ops/OpsSubmitButton";
import { fetchOpsModuleAccessOverrides } from "@/lib/ops/module-access";
import { DEFAULT_WORKER_DAILY_RATE } from "@/lib/ops/attendance-earnings";
import { requireOpsUser } from "@/lib/ops/auth";
import { parseOpsListState } from "@/lib/ops/listing";
import { canAccessOpsHref, canManageOps } from "@/lib/ops/permissions";
import { fetchActiveSiteOptions } from "@/lib/ops/sites";
import { OpsConfirmSubmitButton } from "@/components/ops/OpsConfirmSubmitButton";
import { archiveWorkerAction, createWorkerAction, updateWorkerAction } from "@/lib/ops/worker-actions";
import {
  fetchOpsWorkerRegisterSummary,
  fetchOpsWorkerTradeOptions,
  fetchPaginatedOpsWorkers,
  OPS_WORKER_UNASSIGNED_SITE,
} from "@/lib/ops/workers";
import {
  firstParam,
  formatZmw,
  noticeFromParams,
  OPS_DANGER_BUTTON_CLASS,
  OPS_INPUT_CLASS,
  OPS_LABEL_CLASS,
  OPS_PRIMARY_BUTTON_CLASS,
  OPS_TABLE_SCROLL_CLASS,
  type OpsSearchParams,
} from "@/lib/ops/ui";

type PageProps = {
  searchParams?: Promise<OpsSearchParams>;
};

export default async function OpsWorkersPage({ searchParams }: PageProps) {
  const [params, auth] = await Promise.all([searchParams ?? Promise.resolve({} as OpsSearchParams), requireOpsUser()]);

  if (!canAccessOpsHref(auth.profile.role, "/ops/workers", await fetchOpsModuleAccessOverrides())) {
    notFound();
  }

  // Search covers name, code, trade and phone; the two selects narrow by the
  // things a foreman actually asks for — who is on this site, who is a mason.
  const listState = parseOpsListState(params);
  const siteFilter = firstParam(params.site) ?? "";
  const tradeFilter = firstParam(params.trade) ?? "";

  const [workerPage, summary, siteOptions, trades] = await Promise.all([
    fetchPaginatedOpsWorkers({ listState, siteId: siteFilter, trade: tradeFilter }),
    fetchOpsWorkerRegisterSummary(),
    fetchActiveSiteOptions(),
    fetchOpsWorkerTradeOptions(),
  ]);
  const workers = workerPage.items;
  const canManage = canManageOps(auth.profile.role);
  const notice =
    noticeFromParams(params, "worker", "Worker created successfully.") ??
    (firstParam(params.updated) === "worker"
      ? { tone: "success" as const, message: "Worker details updated." }
      : null);

  const listFilters: OpsListSelectFilter[] = [
    {
      label: "Site",
      name: "site",
      options: [
        { label: "All sites", value: "" },
        { label: "Not assigned", value: OPS_WORKER_UNASSIGNED_SITE },
        ...siteOptions.map((site) => ({
          label: `${site.code} - ${site.name}`,
          value: site.id,
        })),
      ],
      value: siteFilter,
    },
    {
      label: "Trade",
      name: "trade",
      options: [
        { label: "All trades", value: "" },
        ...trades.map((trade) => ({ label: trade, value: trade })),
      ],
      value: tradeFilter,
    },
  ];
  const hasActiveFilter =
    listState.query.length > 0 || siteFilter.length > 0 || tradeFilter.length > 0;

  return (
    <div className="w-full max-w-none space-y-6">
      <section className="rounded-lg border border-border bg-card p-5 md:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-blue">
              Pymble Workers
            </p>
            <h1 className="mt-2 font-heading text-3xl font-bold text-foreground">
              Crew register
            </h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-foreground/68">
              Worker profiles, daily rates, mobile money details, and current site assignment.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-md border border-border px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Active workers
              </p>
              <p className="mt-1 font-heading text-2xl font-bold text-foreground">
                {summary.activeWorkers}
              </p>
            </div>
            <div className="rounded-md border border-border px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Daily exposure
              </p>
              <p className="mt-1 font-heading text-2xl font-bold text-foreground">
                {formatZmw(summary.dailyExposure)}
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
        <section className="rounded-lg border border-border bg-card p-5">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-md bg-primary-blue text-white">
              <Plus className="size-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="font-heading text-xl font-bold text-foreground">Add worker</h2>
              <p className="text-sm text-muted-foreground">
                Create payroll-ready crew records for Pymble.
              </p>
            </div>
          </div>
          {/* Reference use of the shared form primitives — see OpsForm.tsx. */}
          <form action={createWorkerAction}>
            <OpsFormGrid>
              <OpsField label="Code">
                <input className={OPS_INPUT_CLASS} name="worker_code" required />
              </OpsField>
              <OpsField label="Full name" span={2}>
                <input className={OPS_INPUT_CLASS} name="full_name" required />
              </OpsField>
              <OpsField label="Trade">
                <input className={OPS_INPUT_CLASS} name="trade" required />
              </OpsField>
              <OpsField label="Phone">
                <input className={OPS_INPUT_CLASS} name="phone" required />
              </OpsField>
              <OpsField
                hint="Fixed rate paid for a day's attendance, regardless of hours worked."
                label="Daily rate"
              >
                <input
                  className={OPS_INPUT_CLASS}
                  defaultValue={DEFAULT_WORKER_DAILY_RATE}
                  min="1"
                  name="daily_rate"
                  required
                  step="0.01"
                  type="number"
                />
              </OpsField>
              <OpsField label="Site assignment" span={2}>
                <select className={OPS_INPUT_CLASS} defaultValue="" name="site_id">
                  <option value="">Site assignment not set</option>
                  {siteOptions.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.code} - {site.name}
                    </option>
                  ))}
                </select>
              </OpsField>
              <OpsField label="Worker type">
                <select className={OPS_INPUT_CLASS} defaultValue="casual" name="worker_type">
                  <option value="casual">Casual</option>
                  <option value="permanent">Permanent</option>
                </select>
              </OpsField>
              <OpsField label="MoMo provider">
                <select className={OPS_INPUT_CLASS} defaultValue="" name="momo_provider">
                  <option value="">None</option>
                  <option value="mtn">MTN</option>
                  <option value="airtel">Airtel</option>
                </select>
              </OpsField>
              <OpsField label="MoMo number">
                <input className={OPS_INPUT_CLASS} name="momo_number" />
              </OpsField>
              <div className="flex items-end">
                <OpsSubmitButton
                  className={`${OPS_PRIMARY_BUTTON_CLASS} w-full`}
                  pendingLabel="Adding worker..."
                >
                  <Plus className="size-4" aria-hidden="true" />
                  Add worker
                </OpsSubmitButton>
              </div>
            </OpsFormGrid>
          </form>
        </section>
      ) : (
        <div className="rounded-md border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          Your role has read-only access to the crew register.
        </div>
      )}

      <section className="rounded-lg border border-border bg-card" id="worker-list">
        <div className="border-b border-border p-5">
          <h2 className="font-heading text-xl font-bold text-foreground">Current workers</h2>
        </div>
        <OpsListControls
          action="/ops/workers"
          filters={listFilters}
          params={params}
          placeholder="Name, worker code, trade or phone"
          query={listState.query}
          resultLabel="workers"
        />
        {workers.length > 0 ? (
          <>
            <OpsMobileRecordList>
              {workers.map((worker) => (
                <OpsMobileRecordCard key={worker.id}>
                  <div>
                    <p className="font-heading text-lg font-bold text-foreground">
                      {worker.full_name}
                    </p>
                    <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      {worker.worker_code} - {worker.trade}
                    </p>
                  </div>
                  <OpsMobileRecordRow label="Contact">{worker.phone}</OpsMobileRecordRow>
                  <OpsMobileRecordRow label="Site">
                    {worker.site
                      ? `${worker.site.code} - ${worker.site.name}`
                      : "Site assignment not set"}
                  </OpsMobileRecordRow>
                  <OpsMobileRecordRow label="Daily rate">
                    {formatZmw(worker.daily_rate)}
                  </OpsMobileRecordRow>
                  <OpsMobileRecordRow label="Type">{worker.worker_type}</OpsMobileRecordRow>
                </OpsMobileRecordCard>
              ))}
            </OpsMobileRecordList>
            <div
              aria-label="Current workers table"
              className={`hidden md:block ${OPS_TABLE_SCROLL_CLASS}`}
              tabIndex={0}
            >
            <table className="min-w-full divide-y divide-border text-sm">
              <caption className="sr-only">
                Current Pymble workers with contact, site assignment, daily rate, and worker type.
              </caption>
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-[0.12em] text-muted-foreground">
                <tr>
                  <th className="px-5 py-3" scope="col">
                    Worker
                  </th>
                  <th className="px-5 py-3" scope="col">
                    Contact
                  </th>
                  <th className="px-5 py-3" scope="col">
                    Site
                  </th>
                  <th className="px-5 py-3" scope="col">
                    Daily rate
                  </th>
                  <th className="px-5 py-3" scope="col">
                    Type
                  </th>
                  {canManage ? (
                    <th className="px-5 py-3" scope="col">
                      Actions
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {workers.map((worker) => (
                  <React.Fragment key={worker.id}>
                  <tr>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary-dark text-white">
                          <Users className="size-4" aria-hidden="true" />
                        </div>
                        <div>
                          <p className="font-bold text-foreground">{worker.full_name}</p>
                          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                            {worker.worker_code} - {worker.trade}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-foreground/70">
                      <span className="inline-flex items-center gap-2">
                        <Phone className="size-4 text-primary-blue" aria-hidden="true" />
                        {worker.phone}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-foreground/70">
                      {worker.site
                        ? `${worker.site.code} - ${worker.site.name}`
                        : "Site assignment not set"}
                    </td>
                    <td className="px-5 py-4 font-semibold text-foreground">
                      <span className="inline-flex items-center gap-2">
                        <BadgeDollarSign className="size-4 text-primary-blue" aria-hidden="true" />
                        {formatZmw(worker.daily_rate)}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-flex rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-foreground/70">
                        {worker.worker_type}
                      </span>
                    </td>
                    {canManage ? (
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap gap-2">
                          <form action={archiveWorkerAction}>
                            <input name="id" type="hidden" value={worker.id} />
                            <OpsConfirmSubmitButton
                              className={OPS_DANGER_BUTTON_CLASS}
                              confirmText="Confirm archive"
                            >
                              Archive
                            </OpsConfirmSubmitButton>
                          </form>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                  {canManage ? (
                    <tr>
                      <td className="px-5 pb-4 pt-0" colSpan={6}>
                        <OpsCollapsible title="Edit worker details">
                          <form
                            action={updateWorkerAction}
                            className="mt-3 grid gap-3 border-t border-border pt-4 min-[520px]:grid-cols-2 lg:grid-cols-4"
                          >
                            <input name="id" type="hidden" value={worker.id} />
                            <label className={OPS_LABEL_CLASS}>
                              Code
                              <input
                                className={OPS_INPUT_CLASS}
                                defaultValue={worker.worker_code}
                                name="worker_code"
                                required
                              />
                            </label>
                            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
                              Full name
                              <input
                                className={OPS_INPUT_CLASS}
                                defaultValue={worker.full_name}
                                name="full_name"
                                required
                              />
                            </label>
                            <label className={OPS_LABEL_CLASS}>
                              Trade
                              <input
                                className={OPS_INPUT_CLASS}
                                defaultValue={worker.trade}
                                name="trade"
                                required
                              />
                            </label>
                            <label className={OPS_LABEL_CLASS}>
                              Phone
                              <input
                                className={OPS_INPUT_CLASS}
                                defaultValue={worker.phone}
                                name="phone"
                                required
                              />
                            </label>
                            <label className={OPS_LABEL_CLASS}>
                              Daily rate (ZMW)
                              <input
                                className={OPS_INPUT_CLASS}
                                defaultValue={worker.daily_rate}
                                min="1"
                                name="daily_rate"
                                required
                                step="0.01"
                                type="number"
                              />
                            </label>
                            <label className={OPS_LABEL_CLASS}>
                              Site assignment
                              <select
                                className={OPS_INPUT_CLASS}
                                defaultValue={worker.site?.id ?? ""}
                                name="site_id"
                              >
                                <option value="">Site assignment not set</option>
                                {siteOptions.map((site) => (
                                  <option key={site.id} value={site.id}>
                                    {site.code} - {site.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className={OPS_LABEL_CLASS}>
                              Worker type
                              <select
                                className={OPS_INPUT_CLASS}
                                defaultValue={worker.worker_type}
                                name="worker_type"
                              >
                                <option value="casual">Casual</option>
                                <option value="permanent">Permanent</option>
                              </select>
                            </label>
                            <label className={OPS_LABEL_CLASS}>
                              MoMo provider
                              <select
                                className={OPS_INPUT_CLASS}
                                defaultValue={worker.momo_provider ?? ""}
                                name="momo_provider"
                              >
                                <option value="">None</option>
                                <option value="mtn">MTN</option>
                                <option value="airtel">Airtel</option>
                              </select>
                            </label>
                            <label className={OPS_LABEL_CLASS}>
                              MoMo number
                              <input
                                className={OPS_INPUT_CLASS}
                                defaultValue={worker.momo_number ?? ""}
                                name="momo_number"
                              />
                            </label>
                            <div className="flex items-end">
                              <button className={`${OPS_PRIMARY_BUTTON_CLASS} w-full`} type="submit">
                                Save
                              </button>
                            </div>
                          </form>
                        </OpsCollapsible>
                      </td>
                    </tr>
                  ) : null}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
            </div>
          </>
        ) : (
          <div className="flex min-h-56 flex-col items-center justify-center gap-3 p-8 text-center">
            <Users className="size-10 text-primary-blue" aria-hidden="true" />
            <div>
              <p className="font-heading text-xl font-bold text-foreground">
                {hasActiveFilter ? "No workers match this search" : "No workers registered yet"}
              </p>
              <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
                {hasActiveFilter
                  ? "Clear the search or pick a different site or trade."
                  : "Add your first worker above. Worker records are used in attendance and payroll."}
              </p>
            </div>
          </div>
        )}
        <OpsPaginationControls
          anchor="worker-list"
          basePath="/ops/workers"
          filters={listFilters}
          pagination={workerPage.pagination}
          params={params}
          query={listState.query}
          resultLabel="workers"
        />
      </section>
    </div>
  );
}
