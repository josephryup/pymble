import { BookOpen, CheckCircle2, ScrollText } from "lucide-react";
import { OpsEmptyState } from "@/components/ops/OpsEmptyState";
import { OpsPageHeader } from "@/components/ops/OpsPageHeader";
import { OpsRealtimeRefresh } from "@/components/ops/OpsRealtimeRefresh";
import { requireOpsUser } from "@/lib/ops/auth";
import { fetchPublishedItKbArticles } from "@/lib/ops/it-kb";
import { fetchPublishedItPoliciesForStaff, IT_POLICY_CATEGORY_LABELS } from "@/lib/ops/it-policies";
import { acknowledgeItPolicyAction } from "@/lib/ops/it-policy-actions";
import { OPS_PRIMARY_BUTTON_CLASS } from "@/lib/ops/ui";

export const dynamic = "force-dynamic";

export default async function OpsItHandbookPage() {
  const { profile } = await requireOpsUser();

  const [policies, articles] = await Promise.all([
    fetchPublishedItPoliciesForStaff(profile.id),
    fetchPublishedItKbArticles(),
  ]);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <OpsRealtimeRefresh tables={["it_policies", "it_kb_articles", "it_policy_acknowledgements"]} />
      <OpsPageHeader
        eyebrow="IT Help Desk"
        title="IT Policies & Guides"
        description="Company IT policies to read and acknowledge, plus how-to guides for common IT tasks."
      />

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 font-heading text-sm font-bold uppercase tracking-[0.14em] text-primary-dark/55">
          <ScrollText className="size-4" aria-hidden="true" /> Policies
        </h2>
        {policies.length === 0 ? (
          <p className="rounded-xl border border-dashed border-primary-dark/15 bg-white p-4 text-sm text-primary-dark/55">
            No published IT policies yet.
          </p>
        ) : (
          <ul className="space-y-3">
            {policies.map((policy) => (
              <li key={policy.id} className="rounded-2xl border border-primary-dark/10 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-dark/45">{IT_POLICY_CATEGORY_LABELS[policy.category]} · v{policy.version}</p>
                    <h3 className="mt-1 font-heading text-lg font-bold text-primary-dark">{policy.title}</h3>
                  </div>
                  {policy.acknowledged_by_me ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                      <CheckCircle2 className="size-3.5" aria-hidden="true" /> Acknowledged
                    </span>
                  ) : null}
                </div>
                {policy.body ? (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs font-semibold text-primary-blue [&::-webkit-details-marker]:hidden">Read policy</summary>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-primary-dark/80">{policy.body}</p>
                  </details>
                ) : null}
                {!policy.acknowledged_by_me ? (
                  <form action={acknowledgeItPolicyAction} className="mt-3">
                    <input name="policy_id" type="hidden" value={policy.id} />
                    <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
                      <CheckCircle2 className="size-4" aria-hidden="true" />
                      Acknowledge
                    </button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 font-heading text-sm font-bold uppercase tracking-[0.14em] text-primary-dark/55">
          <BookOpen className="size-4" aria-hidden="true" /> How-to guides
        </h2>
        {articles.length === 0 ? (
          <OpsEmptyState icon={BookOpen} title="No guides published yet" description="IT how-to guides will appear here as they're published." />
        ) : (
          <ul className="space-y-2">
            {articles.map((article) => (
              <li key={article.id} className="rounded-2xl border border-primary-dark/10 bg-white p-4 shadow-sm">
                <details>
                  <summary className="cursor-pointer font-heading text-base font-bold text-primary-dark [&::-webkit-details-marker]:hidden">
                    {article.title}
                    <span className="ml-2 text-xs font-semibold uppercase tracking-[0.12em] text-primary-dark/45">{article.category.replace(/_/g, " ")}</span>
                  </summary>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-primary-dark/80">{article.body || "No content yet."}</p>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
