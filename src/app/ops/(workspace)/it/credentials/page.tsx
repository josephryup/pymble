import { CalendarClock, KeySquare, Plus, RotateCw } from "lucide-react";
import { notFound } from "next/navigation";
import { OpsEmptyState } from "@/components/ops/OpsEmptyState";
import { OpsKpiCard } from "@/components/ops/OpsKpiCard";
import { OpsPageHeader } from "@/components/ops/OpsPageHeader";
import { OpsRealtimeRefresh } from "@/components/ops/OpsRealtimeRefresh";
import { fetchOpsModuleAccessOverrides } from "@/lib/ops/module-access";
import { requireOpsUser } from "@/lib/ops/auth";
import { fetchOpsItCredentials, fetchOpsItCredentialStats } from "@/lib/ops/it-credentials";
import {
  archiveItCredentialAction,
  createItCredentialAction,
  markItCredentialRotatedAction,
} from "@/lib/ops/it-credential-actions";
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
  OPS_SECONDARY_BUTTON_CLASS,
  type OpsSearchParams,
} from "@/lib/ops/ui";

export const dynamic = "force-dynamic";

type PageProps = { searchParams?: Promise<OpsSearchParams> };

export default async function OpsItCredentialsPage({ searchParams }: PageProps) {
  const [params, { profile }] = await Promise.all([
    searchParams ?? Promise.resolve({} as OpsSearchParams),
    requireOpsUser(),
  ]);

  if (!canAccessOpsHref(profile.role, "/ops/it/credentials", await fetchOpsModuleAccessOverrides())) {
    notFound();
  }

  const canManage = canManageIT(profile.role);
  const [credentials, stats, activeUsers] = await Promise.all([
    fetchOpsItCredentials(),
    fetchOpsItCredentialStats(),
    fetchOpsActiveUsers(),
  ]);
  const sortedUsers = [...activeUsers].sort((a, b) => a.full_name.localeCompare(b.full_name));
  const notice = noticeFromParams(params, "credential", "Credential recorded.");
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="w-full max-w-none space-y-5">
      <OpsRealtimeRefresh tables={["it_credentials"]} />
      <OpsPageHeader
        eyebrow="Information Technology"
        title="Credential Register"
        description="A register of shared and service accounts — owner, where the secret lives, and rotation due dates. Metadata only; the secret itself stays in Bitwarden."
        actions={canManage ? (<a className={OPS_PRIMARY_BUTTON_CLASS} href="#credential-create"><Plus className="size-4" aria-hidden="true" />Record credential</a>) : undefined}
      />

      <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <strong>Never store actual passwords here.</strong> This register tracks where each secret lives (Bitwarden) and when it is due for rotation — not the secret value.
      </div>

      {notice ? (
        <div className={`rounded-md border px-4 py-3 text-sm font-semibold ${notice.tone === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`} role={notice.tone === "error" ? "alert" : "status"}>
          {notice.message}
        </div>
      ) : null}

      <section className="grid gap-4 min-[720px]:grid-cols-2">
        <OpsKpiCard href="/ops/it/credentials" icon={KeySquare} label="Tracked credentials" hint="Register" value={stats.total.toLocaleString("en-ZM")} />
        <OpsKpiCard href="/ops/it/credentials" icon={CalendarClock} label="Rotation due" tone={stats.rotation_due > 0 ? "warn" : "good"} value={stats.rotation_due.toLocaleString("en-ZM")} />
      </section>

      {canManage ? (
        <details className="rounded-lg border border-border bg-card" id="credential-create">
          <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-5 py-3 font-heading text-base font-bold text-foreground [&::-webkit-details-marker]:hidden">
            <KeySquare className="size-5 text-primary-blue" aria-hidden="true" /> Record credential
          </summary>
          <form action={createItCredentialAction} className="grid gap-4 border-t border-border p-5 min-[520px]:grid-cols-2 lg:grid-cols-6">
            <label className={`${OPS_LABEL_CLASS} lg:col-span-3`}>Name<input className={OPS_INPUT_CLASS} name="name" placeholder="e.g. Domain registrar admin" required /></label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-3`}>System<input className={OPS_INPUT_CLASS} name="system_name" placeholder="e.g. Cloudflare" /></label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-3`}>Account identifier<input className={OPS_INPUT_CLASS} name="account_identifier" placeholder="username / email (not the password)" /></label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-3`}>Owner<select className={OPS_INPUT_CLASS} defaultValue="" name="owner_user_id"><option value="">Unassigned</option>{sortedUsers.map((u) => (<option key={u.id} value={u.id}>{u.full_name} — {formatOpsRole(u.role)}</option>))}</select></label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-3`}>Vault location<input className={OPS_INPUT_CLASS} name="vault_location" placeholder="e.g. Bitwarden › IT collection" /></label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-3`}>Rotation due<input className={OPS_INPUT_CLASS} name="rotation_due_date" type="date" /></label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-6`}>Notes<input className={OPS_INPUT_CLASS} name="notes" /></label>
            <div className="flex items-end lg:col-span-6 lg:justify-end"><button className={`${OPS_PRIMARY_BUTTON_CLASS} w-full min-[520px]:w-auto`} type="submit"><Plus className="size-4" aria-hidden="true" />Record credential</button></div>
          </form>
        </details>
      ) : null}

      {credentials.length === 0 ? (
        <OpsEmptyState icon={KeySquare} title="No credentials registered yet" description={canManage ? "Record shared and service accounts so ownership and rotation are tracked — without storing the secret." : "Credential metadata appears here."} actions={canManage ? [{ href: "#credential-create", label: "Record credential" }] : []} />
      ) : (
        <ul className="space-y-3">
          {credentials.map((credential) => {
            const overdue = credential.rotation_due_date !== null && credential.rotation_due_date <= today;
            return (
              <li key={credential.id} className="rounded-lg border border-border bg-card p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{credential.system_name || "—"}{credential.owner ? ` · ${credential.owner.full_name}` : ""}</p>
                    <h2 className="mt-1 font-heading text-lg font-bold text-foreground">{credential.name}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {credential.account_identifier || "—"}
                      {credential.vault_location ? ` · ${credential.vault_location}` : ""}
                      {credential.last_rotated_at ? ` · Rotated ${credential.last_rotated_at}` : ""}
                      {credential.rotation_due_date ? ` · Due ${credential.rotation_due_date}` : ""}
                    </p>
                  </div>
                  {overdue ? (
                    <span className="inline-flex rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-orange-700">Rotation due</span>
                  ) : null}
                </div>
                {canManage ? (
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
                    <form action={markItCredentialRotatedAction}>
                      <input name="credential_id" type="hidden" value={credential.id} />
                      <button className={OPS_SECONDARY_BUTTON_CLASS} type="submit"><RotateCw className="size-4" aria-hidden="true" />Mark rotated</button>
                    </form>
                    <form action={archiveItCredentialAction}>
                      <input name="credential_id" type="hidden" value={credential.id} />
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
