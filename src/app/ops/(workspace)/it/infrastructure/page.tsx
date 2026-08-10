import { Network, Plus, Wifi, WifiOff, Wrench } from "lucide-react";
import { notFound } from "next/navigation";
import { OpsEmptyState } from "@/components/ops/OpsEmptyState";
import { OpsKpiCard } from "@/components/ops/OpsKpiCard";
import { OpsPageHeader } from "@/components/ops/OpsPageHeader";
import { OpsRealtimeRefresh } from "@/components/ops/OpsRealtimeRefresh";
import { fetchOpsModuleAccessOverrides } from "@/lib/ops/module-access";
import { requireOpsUser } from "@/lib/ops/auth";
import { fetchOpsItNetworkDevices, fetchOpsItNetworkStats } from "@/lib/ops/it-infrastructure";
import {
  archiveItNetworkDeviceAction,
  createItNetworkDeviceAction,
  setItNetworkDeviceStatusAction,
} from "@/lib/ops/it-infrastructure-actions";
import { canManageIT } from "@/lib/ops/it-permissions";
import { canAccessOpsHref } from "@/lib/ops/permissions";
import { fetchActiveSiteOptions } from "@/lib/ops/sites";
import type { OpsItNetworkDeviceType, OpsItNetworkStatus } from "@/lib/ops/types";
import {
  noticeFromParams,
  OPS_DANGER_BUTTON_CLASS,
  OPS_INPUT_CLASS,
  OPS_LABEL_CLASS,
  OPS_PRIMARY_BUTTON_CLASS,
  OPS_SECONDARY_BUTTON_CLASS,
  type OpsSearchParams,
} from "@/lib/ops/ui";

export const dynamic = "force-dynamic";

type PageProps = { searchParams?: Promise<OpsSearchParams> };

const TYPE_LABELS: Record<OpsItNetworkDeviceType, string> = {
  access_point: "Access point",
  firewall: "Firewall",
  isp_link: "ISP link",
  other: "Other",
  router: "Router",
  server: "Server",
  switch: "Switch",
};

const STATUS_LABELS: Record<OpsItNetworkStatus, string> = {
  maintenance: "Maintenance",
  offline: "Offline",
  online: "Online",
  retired: "Retired",
};

const STATUS_BADGE: Record<OpsItNetworkStatus, string> = {
  maintenance: "border-orange-200 bg-orange-50 text-orange-700",
  offline: "border-red-200 bg-red-50 text-red-700",
  online: "border-emerald-200 bg-emerald-50 text-emerald-700",
  retired: "border-border bg-muted/40 text-muted-foreground",
};

export default async function OpsItInfrastructurePage({ searchParams }: PageProps) {
  const [params, { profile }] = await Promise.all([
    searchParams ?? Promise.resolve({} as OpsSearchParams),
    requireOpsUser(),
  ]);

  if (!canAccessOpsHref(profile.role, "/ops/it/infrastructure", await fetchOpsModuleAccessOverrides())) {
    notFound();
  }

  const canManage = canManageIT(profile.role);
  const [devices, stats, siteOptions] = await Promise.all([
    fetchOpsItNetworkDevices(),
    fetchOpsItNetworkStats(),
    fetchActiveSiteOptions(),
  ]);
  const notice = noticeFromParams(params, "device", "Device added.");

  return (
    <div className="w-full max-w-none space-y-5">
      <OpsRealtimeRefresh tables={["it_network_devices"]} />
      <OpsPageHeader
        eyebrow="Information Technology"
        title="Network & Infrastructure"
        description="Routers, switches, access points, servers, firewalls, and ISP links per site, with live status."
        actions={canManage ? (<a className={OPS_PRIMARY_BUTTON_CLASS} href="#device-create"><Plus className="size-4" aria-hidden="true" />Add device</a>) : undefined}
      />

      {notice ? (
        <div className={`rounded-md border px-4 py-3 text-sm font-semibold ${notice.tone === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`} role={notice.tone === "error" ? "alert" : "status"}>
          {notice.message}
        </div>
      ) : null}

      <section className="grid gap-4 min-[720px]:grid-cols-4">
        <OpsKpiCard href="/ops/it/infrastructure" icon={Network} label="Total" hint="Inventory" value={stats.total.toLocaleString("en-ZM")} />
        <OpsKpiCard href="/ops/it/infrastructure" icon={Wifi} label="Online" tone="good" value={stats.online.toLocaleString("en-ZM")} />
        <OpsKpiCard href="/ops/it/infrastructure" icon={WifiOff} label="Offline" tone={stats.offline > 0 ? "warn" : "default"} value={stats.offline.toLocaleString("en-ZM")} />
        <OpsKpiCard href="/ops/it/infrastructure" icon={Wrench} label="Maintenance" tone={stats.maintenance > 0 ? "warn" : "default"} value={stats.maintenance.toLocaleString("en-ZM")} />
      </section>

      {canManage ? (
        <details className="rounded-lg border border-border bg-card" id="device-create">
          <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-5 py-3 font-heading text-base font-bold text-foreground [&::-webkit-details-marker]:hidden">
            <Network className="size-5 text-primary-blue" aria-hidden="true" /> Add device
          </summary>
          <form action={createItNetworkDeviceAction} className="grid gap-4 border-t border-border p-5 min-[520px]:grid-cols-2 lg:grid-cols-4">
            <label className={`${OPS_LABEL_CLASS} lg:col-span-3`}>Name<input className={OPS_INPUT_CLASS} name="name" placeholder="e.g. Head office core switch" required /></label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-1`}>Type<select className={OPS_INPUT_CLASS} defaultValue="router" name="device_type">{Object.entries(TYPE_LABELS).map(([v, l]) => (<option key={v} value={v}>{l}</option>))}</select></label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>Status<select className={OPS_INPUT_CLASS} defaultValue="online" name="status">{Object.entries(STATUS_LABELS).map(([v, l]) => (<option key={v} value={v}>{l}</option>))}</select></label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>Site<select className={OPS_INPUT_CLASS} defaultValue="" name="site_id"><option value="">Head office / none</option>{siteOptions.map((s) => (<option key={s.id} value={s.id}>{s.code} — {s.name}</option>))}</select></label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>IP address<input className={OPS_INPUT_CLASS} name="ip_address" placeholder="e.g. 192.168.1.1" /></label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>ISP / provider<input className={OPS_INPUT_CLASS} name="isp_provider" /></label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-3`}>Location<input className={OPS_INPUT_CLASS} name="location" /></label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-3`}>Notes<input className={OPS_INPUT_CLASS} name="notes" /></label>
            <div className="flex items-end lg:col-span-4 lg:justify-end"><button className={`${OPS_PRIMARY_BUTTON_CLASS} w-full min-[520px]:w-auto`} type="submit"><Plus className="size-4" aria-hidden="true" />Add device</button></div>
          </form>
        </details>
      ) : null}

      {devices.length === 0 ? (
        <OpsEmptyState icon={Network} title="No devices in the inventory yet" description={canManage ? "Add routers, switches, access points, and servers to track infrastructure status per site." : "Network devices appear here."} actions={canManage ? [{ href: "#device-create", label: "Add device" }] : []} />
      ) : (
        <ul className="space-y-3">
          {devices.map((device) => (
            <li key={device.id} className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{TYPE_LABELS[device.device_type]}{device.site ? ` · ${device.site.code}` : ""}</p>
                  <h2 className="mt-1 font-heading text-lg font-bold text-foreground">{device.name}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {device.ip_address || "—"}
                    {device.isp_provider ? ` · ${device.isp_provider}` : ""}
                    {device.location ? ` · ${device.location}` : ""}
                  </p>
                </div>
                <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${STATUS_BADGE[device.status]}`}>{STATUS_LABELS[device.status]}</span>
              </div>
              {canManage ? (
                <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-border pt-3">
                  <form action={setItNetworkDeviceStatusAction} className="flex items-end gap-2">
                    <input name="device_id" type="hidden" value={device.id} />
                    <label className={OPS_LABEL_CLASS}>Status<select className={OPS_INPUT_CLASS} defaultValue={device.status} name="status">{Object.entries(STATUS_LABELS).map(([v, l]) => (<option key={v} value={v}>{l}</option>))}</select></label>
                    <button className={OPS_SECONDARY_BUTTON_CLASS} type="submit">Update</button>
                  </form>
                  <form action={archiveItNetworkDeviceAction}>
                    <input name="device_id" type="hidden" value={device.id} />
                    <button className={OPS_DANGER_BUTTON_CLASS} type="submit">Archive</button>
                  </form>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
