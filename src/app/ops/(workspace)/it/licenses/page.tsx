import { AlertTriangle, AppWindow, CalendarClock, Plus } from "lucide-react";
import { notFound } from "next/navigation";
import { OpsEmptyState } from "@/components/ops/OpsEmptyState";
import { OpsKpiCard } from "@/components/ops/OpsKpiCard";
import { OpsPageHeader } from "@/components/ops/OpsPageHeader";
import { OpsRealtimeRefresh } from "@/components/ops/OpsRealtimeRefresh";
import { requireOpsUser } from "@/lib/ops/auth";
import {
  archiveItLicenseAction,
  createItLicenseAction,
  setItLicenseStatusAction,
} from "@/lib/ops/it-license-actions";
import { fetchOpsItLicenses, fetchOpsItLicenseStats } from "@/lib/ops/it-licenses";
import { canManageIT } from "@/lib/ops/it-permissions";
import { canAccessOpsHref } from "@/lib/ops/permissions";
import type { OpsItLicenseBilling } from "@/lib/ops/types";
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

const BILLING_LABELS: Record<OpsItLicenseBilling, string> = {
  annual: "Annual",
  monthly: "Monthly",
  one_time: "One-time",
};

function renewalTone(renewal: string | null): "default" | "warn" | "danger" {
  if (!renewal) return "default";
  const today = new Date().toISOString().slice(0, 10);
  if (renewal < today) return "danger";
  const soon = new Date();
  soon.setDate(soon.getDate() + 30);
  if (renewal <= soon.toISOString().slice(0, 10)) return "warn";
  return "default";
}

export default async function OpsItLicensesPage({ searchParams }: PageProps) {
  const [params, { profile }] = await Promise.all([
    searchParams ?? Promise.resolve({} as OpsSearchParams),
    requireOpsUser(),
  ]);

  if (!canAccessOpsHref(profile.role, "/ops/it/licenses")) {
    notFound();
  }

  const canManage = canManageIT(profile.role);
  const [licenses, stats] = await Promise.all([fetchOpsItLicenses(), fetchOpsItLicenseStats()]);
  const notice = noticeFromParams(params, "license", "Licence added.");

  return (
    <div className="w-full max-w-none space-y-5">
      <OpsRealtimeRefresh tables={["it_software_licenses"]} />
      <OpsPageHeader
        eyebrow="Information Technology"
        title="Software & Licenses"
        description="Subscriptions and licences with seats, cost, and renewal dates so nothing lapses unnoticed."
        actions={canManage ? (<a className={OPS_PRIMARY_BUTTON_CLASS} href="#license-create"><Plus className="size-4" aria-hidden="true" />Add licence</a>) : undefined}
      />

      {notice ? (
        <div className={`rounded-md border px-4 py-3 text-sm font-semibold ${notice.tone === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`} role={notice.tone === "error" ? "alert" : "status"}>
          {notice.message}
        </div>
      ) : null}

      <section className="grid gap-4 min-[720px]:grid-cols-4">
        <OpsKpiCard href="/ops/it/licenses" icon={AppWindow} label="Total" trend="Tracked" value={stats.total.toLocaleString("en-ZM")} />
        <OpsKpiCard href="/ops/it/licenses" icon={AppWindow} label="Active" tone="good" value={stats.active.toLocaleString("en-ZM")} />
        <OpsKpiCard href="/ops/it/licenses" icon={CalendarClock} label="Renewing < 30 days" tone={stats.expiring_soon > 0 ? "warn" : "default"} value={stats.expiring_soon.toLocaleString("en-ZM")} />
        <OpsKpiCard href="/ops/it/licenses" icon={AlertTriangle} label="Expired" tone={stats.expired > 0 ? "warn" : "default"} value={stats.expired.toLocaleString("en-ZM")} />
      </section>

      {canManage ? (
        <details className="rounded-lg border border-primary-dark/10 bg-white" id="license-create">
          <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-5 py-3 font-heading text-base font-bold text-primary-dark [&::-webkit-details-marker]:hidden">
            <AppWindow className="size-5 text-primary-blue" aria-hidden="true" /> Add licence
          </summary>
          <form action={createItLicenseAction} className="grid gap-4 border-t border-primary-dark/10 p-5 min-[520px]:grid-cols-2 lg:grid-cols-6">
            <label className={`${OPS_LABEL_CLASS} lg:col-span-3`}>Software<input className={OPS_INPUT_CLASS} name="name" placeholder="e.g. Microsoft 365 Business" required /></label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-3`}>Vendor<input className={OPS_INPUT_CLASS} name="vendor" /></label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>Billing<select className={OPS_INPUT_CLASS} defaultValue="annual" name="billing">{Object.entries(BILLING_LABELS).map(([v, l]) => (<option key={v} value={v}>{l}</option>))}</select></label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>Seats total<input className={OPS_INPUT_CLASS} min="0" name="seats_total" type="number" /></label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>Seats used<input className={OPS_INPUT_CLASS} min="0" name="seats_used" type="number" /></label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>Unit cost (ZMW)<input className={OPS_INPUT_CLASS} min="0" name="unit_cost" step="0.01" type="number" /></label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>Renewal date<input className={OPS_INPUT_CLASS} name="renewal_date" type="date" /></label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>Notes<input className={OPS_INPUT_CLASS} name="notes" /></label>
            <div className="flex items-end lg:col-span-6 lg:justify-end"><button className={`${OPS_PRIMARY_BUTTON_CLASS} w-full min-[520px]:w-auto`} type="submit"><Plus className="size-4" aria-hidden="true" />Add licence</button></div>
          </form>
        </details>
      ) : null}

      {licenses.length === 0 ? (
        <OpsEmptyState icon={AppWindow} title="No licences tracked yet" description={canManage ? "Add your software subscriptions to track seats, cost, and renewal dates." : "Tracked software licences appear here."} actions={canManage ? [{ href: "#license-create", label: "Add licence" }] : []} />
      ) : (
        <ul className="space-y-3">
          {licenses.map((license) => {
            const tone = renewalTone(license.renewal_date);
            return (
              <li key={license.id} className="rounded-2xl border border-primary-dark/10 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-dark/45">{BILLING_LABELS[license.billing]}{license.vendor ? ` · ${license.vendor}` : ""}</p>
                    <h2 className="mt-1 font-heading text-lg font-bold text-primary-dark">{license.name}</h2>
                    <p className="mt-1 text-xs text-primary-dark/55">
                      {license.seats_total !== null ? `${license.seats_used}/${license.seats_total} seats` : `${license.seats_used} seats`}
                      {license.unit_cost !== null ? ` · ZMW ${license.unit_cost.toLocaleString("en-ZM")}` : ""}
                      {license.renewal_date ? ` · Renews ${license.renewal_date}` : ""}
                    </p>
                  </div>
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${
                    license.status === "cancelled"
                      ? "border-primary-dark/15 bg-primary-dark/[0.04] text-primary-dark/65"
                      : tone === "danger"
                        ? "border-red-200 bg-red-50 text-red-700"
                        : tone === "warn"
                          ? "border-orange-200 bg-orange-50 text-orange-700"
                          : "border-emerald-200 bg-emerald-50 text-emerald-700"
                  }`}>
                    {license.status === "cancelled" ? "Cancelled" : tone === "danger" ? "Expired" : tone === "warn" ? "Renewing soon" : "Active"}
                  </span>
                </div>
                {canManage ? (
                  <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-primary-dark/10 pt-3">
                    <form action={setItLicenseStatusAction} className="flex items-end gap-2">
                      <input name="license_id" type="hidden" value={license.id} />
                      <label className={OPS_LABEL_CLASS}>Status<select className={OPS_INPUT_CLASS} defaultValue={license.status} name="status"><option value="active">Active</option><option value="cancelled">Cancelled</option></select></label>
                      <button className={OPS_SECONDARY_BUTTON_CLASS} type="submit">Update</button>
                    </form>
                    <form action={archiveItLicenseAction}>
                      <input name="license_id" type="hidden" value={license.id} />
                      <button className={OPS_DANGER_BUTTON_CLASS} type="submit">Archive</button>
                    </form>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
