import { KeyRound, Plus, ShieldCheck, ShieldOff } from "lucide-react";
import { notFound } from "next/navigation";
import { OpsEmptyState } from "@/components/ops/OpsEmptyState";
import { OpsKpiCard } from "@/components/ops/OpsKpiCard";
import { OpsPageHeader } from "@/components/ops/OpsPageHeader";
import { OpsRealtimeRefresh } from "@/components/ops/OpsRealtimeRefresh";
import { requireOpsUser } from "@/lib/ops/auth";
import { fetchOpsItAccessGrants, fetchOpsItAccessStats } from "@/lib/ops/it-access";
import {
  archiveItAccessGrantAction,
  createItAccessGrantAction,
  revokeItAccessGrantAction,
} from "@/lib/ops/it-access-actions";
import { canManageIT } from "@/lib/ops/it-permissions";
import { fetchOpsActiveUsers } from "@/lib/ops/notification-fanout";
import { canAccessOpsHref } from "@/lib/ops/permissions";
import { formatOpsRole } from "@/lib/ops/roles";
import {
  noticeFromParams,
  OPS_DANGER_BUTTON_CLASS,
  OPS_INPUT_CLASS,
  OPS_LABEL_CLASS,
  OPS_PRIMARY_BUTTON_CLASS,
  type OpsSearchParams,
} from "@/lib/ops/ui";

export const dynamic = "force-dynamic";

type PageProps = { searchParams?: Promise<OpsSearchParams> };

export default async function OpsItAccessPage({ searchParams }: PageProps) {
  const [params, { profile }] = await Promise.all([
    searchParams ?? Promise.resolve({} as OpsSearchParams),
    requireOpsUser(),
  ]);

  if (!canAccessOpsHref(profile.role, "/ops/it/access")) {
    notFound();
  }

  const canManage = canManageIT(profile.role);
  const [grants, stats, activeUsers] = await Promise.all([
    fetchOpsItAccessGrants(),
    fetchOpsItAccessStats(),
    fetchOpsActiveUsers(),
  ]);
  const sortedUsers = [...activeUsers].sort((a, b) => a.full_name.localeCompare(b.full_name));
  const notice = noticeFromParams(params, "grant", "Access recorded.");

  return (
    <div className="w-full max-w-none space-y-5">
      <OpsRealtimeRefresh tables={["it_access_grants"]} />
      <OpsPageHeader
        eyebrow="Information Technology"
        title="Access Register"
        description="Who can reach which systems and accounts. Revoke here as part of offboarding so nothing is missed."
        actions={canManage ? (<a className={OPS_PRIMARY_BUTTON_CLASS} href="#grant-create"><Plus className="size-4" aria-hidden="true" />Record access</a>) : undefined}
      />

      {notice ? (
        <div className={`rounded-md border px-4 py-3 text-sm font-semibold ${notice.tone === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`} role={notice.tone === "error" ? "alert" : "status"}>
          {notice.message}
        </div>
      ) : null}

      <section className="grid gap-4 min-[720px]:grid-cols-3">
        <OpsKpiCard href="/ops/it/access" icon={KeyRound} label="Total grants" hint="Register" value={stats.total.toLocaleString("en-ZM")} />
        <OpsKpiCard href="/ops/it/access" icon={ShieldCheck} label="Active" tone="good" value={stats.active.toLocaleString("en-ZM")} />
        <OpsKpiCard href="/ops/it/access" icon={ShieldOff} label="Revoked" value={stats.revoked.toLocaleString("en-ZM")} />
      </section>

      {canManage ? (
        <details className="rounded-lg border border-border bg-card" id="grant-create">
          <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-5 py-3 font-heading text-base font-bold text-foreground [&::-webkit-details-marker]:hidden">
            <KeyRound className="size-5 text-primary-blue" aria-hidden="true" /> Record access
          </summary>
          <form action={createItAccessGrantAction} className="grid gap-4 border-t border-border p-5 min-[520px]:grid-cols-2 lg:grid-cols-6">
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>Employee<select className={OPS_INPUT_CLASS} defaultValue="" name="user_id"><option value="">Unlinked / shared</option>{sortedUsers.map((u) => (<option key={u.id} value={u.id}>{u.full_name} — {formatOpsRole(u.role)}</option>))}</select></label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>System<input className={OPS_INPUT_CLASS} name="system_name" placeholder="e.g. Company Email" required /></label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>Access level<input className={OPS_INPUT_CLASS} name="access_level" placeholder="e.g. Standard / Admin" /></label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-3`}>Account identifier<input className={OPS_INPUT_CLASS} name="account_identifier" placeholder="e.g. j.doe@pymble..." /></label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-3`}>Notes<input className={OPS_INPUT_CLASS} name="notes" /></label>
            <div className="flex items-end lg:col-span-6 lg:justify-end"><button className={`${OPS_PRIMARY_BUTTON_CLASS} w-full min-[520px]:w-auto`} type="submit"><Plus className="size-4" aria-hidden="true" />Record access</button></div>
          </form>
        </details>
      ) : null}

      {grants.length === 0 ? (
        <OpsEmptyState icon={KeyRound} title="No access recorded yet" description={canManage ? "Record which systems each employee can reach so offboarding revocation is reliable." : "Access grants appear here."} actions={canManage ? [{ href: "#grant-create", label: "Record access" }] : []} />
      ) : (
        <ul className="space-y-3">
          {grants.map((grant) => (
            <li key={grant.id} className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{grant.employee ? grant.employee.full_name : "Shared / unlinked"}</p>
                  <h2 className="mt-1 font-heading text-lg font-bold text-foreground">{grant.system_name}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {grant.access_level || "—"}
                    {grant.account_identifier ? ` · ${grant.account_identifier}` : ""}
                    {` · Granted ${grant.granted_at}`}
                    {grant.revoked_at ? ` · Revoked ${grant.revoked_at}` : ""}
                  </p>
                </div>
                <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${grant.status === "active" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-border bg-muted/40 text-muted-foreground"}`}>
                  {grant.status === "active" ? "Active" : "Revoked"}
                </span>
              </div>
              {canManage ? (
                <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
                  {grant.status === "active" ? (
                    <form action={revokeItAccessGrantAction}>
                      <input name="grant_id" type="hidden" value={grant.id} />
                      <button className={OPS_DANGER_BUTTON_CLASS} type="submit"><ShieldOff className="size-4" aria-hidden="true" />Revoke access</button>
                    </form>
                  ) : null}
                  <form action={archiveItAccessGrantAction}>
                    <input name="grant_id" type="hidden" value={grant.id} />
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
