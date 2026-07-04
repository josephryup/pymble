import { Cpu, Download, Laptop, Plus, ShieldCheck, Wrench } from "lucide-react";
import { notFound } from "next/navigation";
import { OpsEmptyState } from "@/components/ops/OpsEmptyState";
import { OpsKpiCard } from "@/components/ops/OpsKpiCard";
import { OpsPageHeader } from "@/components/ops/OpsPageHeader";
import { OpsRealtimeRefresh } from "@/components/ops/OpsRealtimeRefresh";
import { requireOpsUser } from "@/lib/ops/auth";
import {
  archiveItAssetAction,
  assignItAssetAction,
  createItAssetAction,
  updateItAssetSpecsAction,
  updateItAssetStatusAction,
} from "@/lib/ops/it-asset-actions";
import { fetchOpsItAssets, fetchOpsItAssetStats } from "@/lib/ops/it-assets";
import { canManageItAssets } from "@/lib/ops/it-permissions";
import { fetchOpsActiveUsers } from "@/lib/ops/notification-fanout";
import { canAccessOpsHref } from "@/lib/ops/permissions";
import { formatOpsRole } from "@/lib/ops/roles";
import { fetchActiveSiteOptions } from "@/lib/ops/sites";
import type { OpsItAssetStatus, OpsItAssetType } from "@/lib/ops/types";
import {
  firstParam,
  noticeFromParams,
  OPS_DANGER_BUTTON_CLASS,
  OPS_INPUT_CLASS,
  OPS_LABEL_CLASS,
  OPS_PRIMARY_BUTTON_CLASS,
  OPS_SECONDARY_BUTTON_CLASS,
  type OpsSearchParams,
} from "@/lib/ops/ui";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<OpsSearchParams>;
};

const ASSET_TYPE_LABELS: Record<OpsItAssetType, string> = {
  desktop: "Desktop",
  laptop: "Laptop",
  monitor: "Monitor",
  network: "Network device",
  other: "Other",
  phone: "Phone",
  printer: "Printer",
  server: "Server",
  tablet: "Tablet",
};

const ASSET_STATUS_LABELS: Record<OpsItAssetStatus, string> = {
  disposed: "Disposed",
  in_use: "In use",
  lost: "Lost",
  repair: "Under repair",
  retired: "Retired",
  spare: "Spare",
};

const STATUS_BADGE: Record<OpsItAssetStatus, string> = {
  disposed: "border-primary-dark/15 bg-primary-dark/[0.04] text-primary-dark/65",
  in_use: "border-emerald-200 bg-emerald-50 text-emerald-700",
  lost: "border-red-200 bg-red-50 text-red-700",
  repair: "border-orange-200 bg-orange-50 text-orange-700",
  retired: "border-primary-dark/15 bg-primary-dark/[0.04] text-primary-dark/65",
  spare: "border-sky-200 bg-sky-50 text-sky-700",
};

function assetStatusFromParam(value: string | undefined): OpsItAssetStatus | undefined {
  if (value && value in ASSET_STATUS_LABELS) {
    return value as OpsItAssetStatus;
  }
  return undefined;
}

export default async function OpsItAssetsPage({ searchParams }: PageProps) {
  const [params, { profile }] = await Promise.all([
    searchParams ?? Promise.resolve({} as OpsSearchParams),
    requireOpsUser(),
  ]);

  if (!canAccessOpsHref(profile.role, "/ops/it/assets")) {
    notFound();
  }

  const canManage = canManageItAssets(profile.role);
  const statusFilter = assetStatusFromParam(firstParam(params.status));
  const [assets, stats, siteOptions, activeUsers] = await Promise.all([
    fetchOpsItAssets({ status: statusFilter }),
    fetchOpsItAssetStats(),
    fetchActiveSiteOptions(),
    fetchOpsActiveUsers(),
  ]);
  const notice = noticeFromParams(params, "asset", "Asset registered.");
  const sortedUsers = [...activeUsers].sort((a, b) => a.full_name.localeCompare(b.full_name));

  return (
    <div className="w-full max-w-none space-y-5">
      <OpsRealtimeRefresh tables={["it_assets"]} />
      <OpsPageHeader
        eyebrow="Information Technology"
        title="Asset Management"
        description="Every company computer, laptop, printer, phone, and network device — assignment, condition, warranty, and location."
        actions={
          <>
            <a className={OPS_SECONDARY_BUTTON_CLASS} href="/api/ops/pdf/it-asset-register">
              <Download className="size-4" aria-hidden="true" />
              Export PDF
            </a>
            {canManage ? (
              <a className={OPS_PRIMARY_BUTTON_CLASS} href="#asset-create-panel">
                <Plus className="size-4" aria-hidden="true" />
                Register asset
              </a>
            ) : null}
          </>
        }
      />

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

      <section className="grid gap-4 min-[720px]:grid-cols-4">
        <OpsKpiCard href="/ops/it/assets" icon={Laptop} label="Total assets" trend="Register" value={stats.total.toLocaleString("en-ZM")} />
        <OpsKpiCard href="/ops/it/assets?status=in_use" icon={ShieldCheck} label="In use" tone="good" value={stats.in_use.toLocaleString("en-ZM")} />
        <OpsKpiCard href="/ops/it/assets?status=spare" icon={Laptop} label="Spare" tone="default" value={stats.spare.toLocaleString("en-ZM")} />
        <OpsKpiCard href="/ops/it/assets?status=repair" icon={Wrench} label="Under repair" tone={stats.in_repair > 0 ? "warn" : "default"} value={stats.in_repair.toLocaleString("en-ZM")} />
      </section>

      {canManage ? (
        <details className="rounded-lg border border-primary-dark/10 bg-white" id="asset-create-panel">
          <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 transition hover:bg-primary-dark/[0.02] [&::-webkit-details-marker]:hidden">
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-blue text-white">
                <Laptop className="size-5" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block font-heading text-lg font-bold text-primary-dark">Register asset</span>
                <span className="mt-1 block text-sm text-primary-dark/60">Add a new device to the IT asset register.</span>
              </span>
            </span>
            <Plus className="size-5 shrink-0 text-primary-blue" aria-hidden="true" />
          </summary>
          <form action={createItAssetAction} className="grid gap-4 border-t border-primary-dark/10 p-5 min-[520px]:grid-cols-2 lg:grid-cols-6">
            <label className={`${OPS_LABEL_CLASS} lg:col-span-3`}>
              Asset name
              <input className={OPS_INPUT_CLASS} name="name" placeholder="e.g. Dell Latitude 5420" required />
            </label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-1`}>
              Type
              <select className={OPS_INPUT_CLASS} defaultValue="laptop" name="asset_type">
                {Object.entries(ASSET_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
              Status
              <select className={OPS_INPUT_CLASS} defaultValue="in_use" name="status">
                {Object.entries(ASSET_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
              Manufacturer
              <input className={OPS_INPUT_CLASS} name="manufacturer" />
            </label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
              Model
              <input className={OPS_INPUT_CLASS} name="model" />
            </label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
              Serial number
              <input className={OPS_INPUT_CLASS} name="serial_number" />
            </label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
              Assigned to
              <select className={OPS_INPUT_CLASS} defaultValue="" name="assigned_to">
                <option value="">Unassigned</option>
                {sortedUsers.map((user) => (
                  <option key={user.id} value={user.id}>{user.full_name} — {formatOpsRole(user.role)}</option>
                ))}
              </select>
            </label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
              Site
              <select className={OPS_INPUT_CLASS} defaultValue="" name="site_id">
                <option value="">Head office / none</option>
                {siteOptions.map((site) => (
                  <option key={site.id} value={site.id}>{site.code} — {site.name}</option>
                ))}
              </select>
            </label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
              Location
              <input className={OPS_INPUT_CLASS} name="location" placeholder="Desk / room / store" />
            </label>
            <fieldset className="grid gap-4 min-[520px]:grid-cols-2 lg:col-span-6 lg:grid-cols-5">
              <legend className="mb-2 flex items-center gap-2 text-sm font-bold text-primary-dark">
                <Cpu className="size-4 text-primary-blue" aria-hidden="true" />
                Hardware specifications
              </legend>
              <label className={OPS_LABEL_CLASS}>
                Operating system
                <input className={OPS_INPUT_CLASS} name="operating_system" placeholder="e.g. Windows 11 Pro" />
              </label>
              <label className={OPS_LABEL_CLASS}>
                Processor
                <input className={OPS_INPUT_CLASS} name="processor" placeholder="e.g. Intel Core i5-1145G7" />
              </label>
              <label className={OPS_LABEL_CLASS}>
                RAM
                <input className={OPS_INPUT_CLASS} name="ram" placeholder="e.g. 16 GB DDR4" />
              </label>
              <label className={OPS_LABEL_CLASS}>
                Hard drive / storage
                <input className={OPS_INPUT_CLASS} name="storage" placeholder="e.g. 512 GB NVMe SSD" />
              </label>
              <label className={OPS_LABEL_CLASS}>
                Hostname
                <input className={OPS_INPUT_CLASS} name="hostname" placeholder="e.g. PCL-LT-014" />
              </label>
            </fieldset>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
              Purchase date
              <input className={OPS_INPUT_CLASS} name="purchase_date" type="date" />
            </label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
              Warranty expiry
              <input className={OPS_INPUT_CLASS} name="warranty_expiry" type="date" />
            </label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
              Purchase cost (ZMW)
              <input className={OPS_INPUT_CLASS} min="0" name="purchase_cost" step="0.01" type="number" />
            </label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-6`}>
              Notes
              <input className={OPS_INPUT_CLASS} name="notes" />
            </label>
            <div className="flex items-end lg:col-span-6 lg:justify-end">
              <button className={`${OPS_PRIMARY_BUTTON_CLASS} w-full min-[520px]:w-auto`} type="submit">
                <Plus className="size-4" aria-hidden="true" />
                Register asset
              </button>
            </div>
          </form>
        </details>
      ) : null}

      {assets.length === 0 ? (
        <OpsEmptyState
          icon={Laptop}
          title="No assets registered yet"
          description={
            canManage
              ? "Register the company's computers, printers, and network devices to track assignment, condition, and warranty."
              : "Registered IT assets will appear here."
          }
          actions={canManage ? [{ href: "#asset-create-panel", label: "Register asset" }] : []}
        />
      ) : (
        <ul className="space-y-3">
          {assets.map((asset) => (
            <li key={asset.id} className="rounded-2xl border border-primary-dark/10 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-dark/45">
                    {asset.asset_tag} · {ASSET_TYPE_LABELS[asset.asset_type]}
                  </p>
                  <h2 className="mt-1 font-heading text-lg font-bold text-primary-dark">{asset.name}</h2>
                  <p className="mt-1 text-xs text-primary-dark/55">
                    {[asset.manufacturer, asset.model].filter(Boolean).join(" ") || "—"}
                    {asset.serial_number ? ` · S/N ${asset.serial_number}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-primary-dark/55">
                    {asset.assignee ? `Assigned to ${asset.assignee.full_name}` : "Unassigned"}
                    {asset.site ? ` · ${asset.site.code}` : ""}
                    {asset.location ? ` · ${asset.location}` : ""}
                    {asset.warranty_expiry ? ` · Warranty to ${asset.warranty_expiry}` : ""}
                  </p>
                  {[asset.operating_system, asset.processor, asset.ram, asset.storage, asset.hostname].some(Boolean) ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {[
                        asset.operating_system,
                        asset.processor,
                        asset.ram,
                        asset.storage,
                        asset.hostname,
                      ]
                        .filter(Boolean)
                        .map((spec) => (
                          <span
                            key={spec}
                            className="inline-flex items-center gap-1 rounded-full border border-primary-dark/12 bg-primary-dark/[0.03] px-2 py-0.5 text-[11px] font-semibold text-primary-dark/65"
                          >
                            <Cpu className="size-3 text-primary-blue/70" aria-hidden="true" />
                            {spec}
                          </span>
                        ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-[11px] font-semibold text-orange-600">
                      Specs not recorded — add OS, processor, RAM, and storage below.
                    </p>
                  )}
                </div>
                <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${STATUS_BADGE[asset.status]}`}>
                  {ASSET_STATUS_LABELS[asset.status]}
                </span>
              </div>

              {canManage ? (
                <details className="mt-3 border-t border-primary-dark/10 pt-3">
                  <summary className="cursor-pointer text-xs font-semibold text-primary-blue [&::-webkit-details-marker]:hidden">Manage asset</summary>
                  <div className="mt-3 grid gap-4 lg:grid-cols-3">
                    <form action={updateItAssetStatusAction} className="flex items-end gap-2">
                      <input name="asset_id" type="hidden" value={asset.id} />
                      <label className={`${OPS_LABEL_CLASS} flex-1`}>
                        Status
                        <select className={OPS_INPUT_CLASS} defaultValue={asset.status} name="status">
                          {Object.entries(ASSET_STATUS_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                      </label>
                      <button className={OPS_SECONDARY_BUTTON_CLASS} type="submit">Update</button>
                    </form>
                    <form action={assignItAssetAction} className="flex items-end gap-2">
                      <input name="asset_id" type="hidden" value={asset.id} />
                      <label className={`${OPS_LABEL_CLASS} flex-1`}>
                        Assign to
                        <select className={OPS_INPUT_CLASS} defaultValue={asset.assigned_to ?? ""} name="assigned_to">
                          <option value="">Unassigned</option>
                          {sortedUsers.map((user) => (
                            <option key={user.id} value={user.id}>{user.full_name}</option>
                          ))}
                        </select>
                      </label>
                      <button className={OPS_SECONDARY_BUTTON_CLASS} type="submit">Assign</button>
                    </form>
                    <form action={archiveItAssetAction} className="flex items-end">
                      <input name="asset_id" type="hidden" value={asset.id} />
                      <button className={`${OPS_DANGER_BUTTON_CLASS} w-full`} type="submit">Archive asset</button>
                    </form>
                  </div>
                  <form
                    action={updateItAssetSpecsAction}
                    className="mt-4 grid gap-3 rounded-md border border-primary-dark/10 bg-primary-dark/[0.02] p-3 min-[520px]:grid-cols-2 lg:grid-cols-6"
                  >
                    <input name="asset_id" type="hidden" value={asset.id} />
                    <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-primary-dark/55 min-[520px]:col-span-2 lg:col-span-6">
                      <Cpu className="size-3.5 text-primary-blue" aria-hidden="true" />
                      Hardware specifications
                    </p>
                    <label className={OPS_LABEL_CLASS}>
                      Operating system
                      <input className={OPS_INPUT_CLASS} defaultValue={asset.operating_system} name="operating_system" placeholder="Windows 11 Pro" />
                    </label>
                    <label className={OPS_LABEL_CLASS}>
                      Processor
                      <input className={OPS_INPUT_CLASS} defaultValue={asset.processor} name="processor" placeholder="Intel Core i5" />
                    </label>
                    <label className={OPS_LABEL_CLASS}>
                      RAM
                      <input className={OPS_INPUT_CLASS} defaultValue={asset.ram} name="ram" placeholder="16 GB" />
                    </label>
                    <label className={OPS_LABEL_CLASS}>
                      Hard drive / storage
                      <input className={OPS_INPUT_CLASS} defaultValue={asset.storage} name="storage" placeholder="512 GB SSD" />
                    </label>
                    <label className={OPS_LABEL_CLASS}>
                      Hostname
                      <input className={OPS_INPUT_CLASS} defaultValue={asset.hostname} name="hostname" placeholder="PCL-LT-014" />
                    </label>
                    <div className="flex items-end">
                      <button className={`${OPS_SECONDARY_BUTTON_CLASS} w-full`} type="submit">Save specs</button>
                    </div>
                  </form>
                </details>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
