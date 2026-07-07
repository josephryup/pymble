import { CheckCircle2, FileText, Plus, ScrollText } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OpsEmptyState } from "@/components/ops/OpsEmptyState";
import { OpsKpiCard } from "@/components/ops/OpsKpiCard";
import { OpsPageHeader } from "@/components/ops/OpsPageHeader";
import { OpsRealtimeRefresh } from "@/components/ops/OpsRealtimeRefresh";
import { requireOpsUser } from "@/lib/ops/auth";
import { fetchOpsItPolicies, IT_POLICY_CATEGORY_LABELS } from "@/lib/ops/it-policies";
import { createItPolicyAction } from "@/lib/ops/it-policy-actions";
import { canManageIT } from "@/lib/ops/it-permissions";
import { canAccessOpsHref } from "@/lib/ops/permissions";
import {
  noticeFromParams,
  OPS_INPUT_CLASS,
  OPS_LABEL_CLASS,
  OPS_PRIMARY_BUTTON_CLASS,
  type OpsSearchParams,
} from "@/lib/ops/ui";

export const dynamic = "force-dynamic";

type PageProps = { searchParams?: Promise<OpsSearchParams> };

export default async function OpsItPoliciesPage({ searchParams }: PageProps) {
  const [params, { profile }] = await Promise.all([
    searchParams ?? Promise.resolve({} as OpsSearchParams),
    requireOpsUser(),
  ]);

  if (!canAccessOpsHref(profile.role, "/ops/it/policies")) {
    notFound();
  }

  const canManage = canManageIT(profile.role);
  const policies = await fetchOpsItPolicies();
  const notice = noticeFromParams(params, "policy", "Policy created.");
  const published = policies.filter((policy) => policy.status === "published").length;
  const drafts = policies.filter((policy) => policy.status === "draft").length;

  return (
    <div className="w-full max-w-none space-y-5">
      <OpsRealtimeRefresh tables={["it_policies"]} />
      <OpsPageHeader
        eyebrow="Information Technology"
        title="IT Policies"
        description="Publish and version IT policies, then track which staff have acknowledged them."
        actions={canManage ? (<a className={OPS_PRIMARY_BUTTON_CLASS} href="#policy-create"><Plus className="size-4" aria-hidden="true" />New policy</a>) : undefined}
      />

      {notice ? (
        <div className={`rounded-md border px-4 py-3 text-sm font-semibold ${notice.tone === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`} role={notice.tone === "error" ? "alert" : "status"}>
          {notice.message}
        </div>
      ) : null}

      <section className="grid gap-4 min-[720px]:grid-cols-3">
        <OpsKpiCard href="/ops/it/policies" icon={ScrollText} label="Total" hint="Library" value={policies.length.toLocaleString("en-ZM")} />
        <OpsKpiCard href="/ops/it/policies" icon={CheckCircle2} label="Published" tone="good" value={published.toLocaleString("en-ZM")} />
        <OpsKpiCard href="/ops/it/policies" icon={FileText} label="Drafts" value={drafts.toLocaleString("en-ZM")} />
      </section>

      {canManage ? (
        <details className="rounded-lg border border-border bg-card" id="policy-create">
          <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-5 py-3 font-heading text-base font-bold text-foreground [&::-webkit-details-marker]:hidden">
            <ScrollText className="size-5 text-primary-blue" aria-hidden="true" /> New policy
          </summary>
          <form action={createItPolicyAction} className="grid gap-4 border-t border-border p-5 min-[520px]:grid-cols-2 lg:grid-cols-6">
            <label className={`${OPS_LABEL_CLASS} lg:col-span-3`}>Title<input className={OPS_INPUT_CLASS} name="title" required /></label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>Category<select className={OPS_INPUT_CLASS} defaultValue="acceptable_use" name="category">{Object.entries(IT_POLICY_CATEGORY_LABELS).map(([v, l]) => (<option key={v} value={v}>{l}</option>))}</select></label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-1`}>Version<input className={OPS_INPUT_CLASS} defaultValue="1" min="1" name="version" type="number" /></label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-6`}>Policy text<textarea className={`${OPS_INPUT_CLASS} min-h-40`} name="body" /></label>
            <div className="flex items-end lg:col-span-6 lg:justify-end"><button className={`${OPS_PRIMARY_BUTTON_CLASS} w-full min-[520px]:w-auto`} type="submit"><Plus className="size-4" aria-hidden="true" />Save draft</button></div>
          </form>
        </details>
      ) : null}

      {policies.length === 0 ? (
        <OpsEmptyState icon={ScrollText} title="No policies yet" description={canManage ? "Draft your first IT policy. Publish it when ready so staff can acknowledge." : "Published IT policies appear here."} actions={canManage ? [{ href: "#policy-create", label: "New policy" }] : []} />
      ) : (
        <ul className="space-y-3">
          {policies.map((policy) => (
            <li key={policy.id} className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{IT_POLICY_CATEGORY_LABELS[policy.category]} · v{policy.version}</p>
                  <h2 className="mt-1 font-heading text-lg font-bold text-foreground">
                    <Link className="hover:underline" href={`/ops/it/policies/${policy.id}`}>{policy.title}</Link>
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">{policy.ack_count} acknowledgement{policy.ack_count === 1 ? "" : "s"}</p>
                </div>
                <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${policy.status === "published" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : policy.status === "draft" ? "border-sky-200 bg-sky-50 text-sky-700" : "border-border bg-muted/40 text-muted-foreground"}`}>
                  {policy.status}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
