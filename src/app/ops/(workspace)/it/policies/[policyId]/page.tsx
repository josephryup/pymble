import { ArrowLeft, CheckCircle2, Send } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OpsPageHeader } from "@/components/ops/OpsPageHeader";
import { OpsRealtimeRefresh } from "@/components/ops/OpsRealtimeRefresh";
import { fetchOpsModuleAccessOverrides } from "@/lib/ops/module-access";
import { requireOpsUser } from "@/lib/ops/auth";
import { fetchOpsItPolicy, IT_POLICY_CATEGORY_LABELS } from "@/lib/ops/it-policies";
import {
  acknowledgeItPolicyAction,
  archiveItPolicyAction,
  publishItPolicyAction,
} from "@/lib/ops/it-policy-actions";
import { canManageIT } from "@/lib/ops/it-permissions";
import { canAccessOpsHref } from "@/lib/ops/permissions";
import {
  firstParam,
  OPS_DANGER_BUTTON_CLASS,
  OPS_PRIMARY_BUTTON_CLASS,
  OPS_SECONDARY_BUTTON_CLASS,
  type OpsSearchParams,
  OPS_NOTICE_ERROR_CLASS,
} from "@/lib/ops/ui";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ policyId: string }>;
  searchParams?: Promise<OpsSearchParams>;
};

export default async function OpsItPolicyDetailPage({ params, searchParams }: PageProps) {
  const [{ policyId }, sp, { profile }] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({} as OpsSearchParams),
    requireOpsUser(),
  ]);

  if (!canAccessOpsHref(profile.role, "/ops/it/policies", await fetchOpsModuleAccessOverrides())) {
    notFound();
  }

  const policy = await fetchOpsItPolicy(policyId, profile.id);
  if (!policy || policy.archived_at) {
    notFound();
  }

  const canManage = canManageIT(profile.role);
  const error = firstParam(sp.error);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
      <OpsRealtimeRefresh tables={["it_policies", "it_policy_acknowledgements"]} />
      <OpsPageHeader
        eyebrow={`${IT_POLICY_CATEGORY_LABELS[policy.category]} · v${policy.version}`}
        title={policy.title}
        description={`${policy.ack_count} acknowledgement${policy.ack_count === 1 ? "" : "s"}`}
        actions={
          <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/it/policies">
            <ArrowLeft className="size-4" aria-hidden="true" />
            All policies
          </Link>
        }
      />

      {error ? (
        <div className={OPS_NOTICE_ERROR_CLASS} role="alert">{error}</div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${policy.status === "published" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : policy.status === "draft" ? "border-sky-200 bg-sky-50 text-sky-700" : "border-border bg-muted/40 text-muted-foreground"}`}>
          {policy.status}
        </span>
        {policy.acknowledged_by_me ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
            <CheckCircle2 className="size-3.5" aria-hidden="true" /> You acknowledged this
          </span>
        ) : null}
      </div>

      <article className="whitespace-pre-wrap rounded-lg border border-border bg-card p-5 text-sm text-foreground/80">
        {policy.body || "No policy text yet."}
      </article>

      <div className="flex flex-wrap gap-2">
        {policy.status === "published" && !policy.acknowledged_by_me ? (
          <form action={acknowledgeItPolicyAction}>
            <input name="policy_id" type="hidden" value={policy.id} />
            <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              Acknowledge
            </button>
          </form>
        ) : null}
        {canManage && policy.status === "draft" ? (
          <form action={publishItPolicyAction}>
            <input name="policy_id" type="hidden" value={policy.id} />
            <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
              <Send className="size-4" aria-hidden="true" />
              Publish
            </button>
          </form>
        ) : null}
        {canManage ? (
          <form action={archiveItPolicyAction}>
            <input name="policy_id" type="hidden" value={policy.id} />
            <button className={OPS_DANGER_BUTTON_CLASS} type="submit">Archive</button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
