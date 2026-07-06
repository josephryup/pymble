import { CheckCircle2, LibraryBig, Plus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OpsEmptyState } from "@/components/ops/OpsEmptyState";
import { OpsKpiCard } from "@/components/ops/OpsKpiCard";
import { OpsPageHeader } from "@/components/ops/OpsPageHeader";
import { OpsRealtimeRefresh } from "@/components/ops/OpsRealtimeRefresh";
import { requireOpsUser } from "@/lib/ops/auth";
import { fetchOpsItKbArticles } from "@/lib/ops/it-kb";
import { createItKbArticleAction } from "@/lib/ops/it-kb-actions";
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

export default async function OpsItKbPage({ searchParams }: PageProps) {
  const [params, { profile }] = await Promise.all([
    searchParams ?? Promise.resolve({} as OpsSearchParams),
    requireOpsUser(),
  ]);

  if (!canAccessOpsHref(profile.role, "/ops/it/kb")) {
    notFound();
  }

  const canManage = canManageIT(profile.role);
  const articles = await fetchOpsItKbArticles();
  const notice = noticeFromParams(params, "article", "Article created.");
  const published = articles.filter((article) => article.status === "published").length;

  return (
    <div className="w-full max-w-none space-y-5">
      <OpsRealtimeRefresh tables={["it_kb_articles"]} />
      <OpsPageHeader
        eyebrow="Information Technology"
        title="Knowledge Base"
        description="Internal how-to articles so staff can self-serve common fixes and cut repeat tickets."
        actions={canManage ? (<a className={OPS_PRIMARY_BUTTON_CLASS} href="#kb-create"><Plus className="size-4" aria-hidden="true" />New article</a>) : undefined}
      />

      {notice ? (
        <div className={`rounded-md border px-4 py-3 text-sm font-semibold ${notice.tone === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`} role={notice.tone === "error" ? "alert" : "status"}>
          {notice.message}
        </div>
      ) : null}

      <section className="grid gap-4 min-[720px]:grid-cols-2">
        <OpsKpiCard href="/ops/it/kb" icon={LibraryBig} label="Articles" hint="Library" value={articles.length.toLocaleString("en-ZM")} />
        <OpsKpiCard href="/ops/it/kb" icon={CheckCircle2} label="Published" tone="good" value={published.toLocaleString("en-ZM")} />
      </section>

      {canManage ? (
        <details className="rounded-lg border border-primary-dark/10 bg-white" id="kb-create">
          <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-5 py-3 font-heading text-base font-bold text-primary-dark [&::-webkit-details-marker]:hidden">
            <LibraryBig className="size-5 text-primary-blue" aria-hidden="true" /> New article
          </summary>
          <form action={createItKbArticleAction} className="grid gap-4 border-t border-primary-dark/10 p-5 lg:grid-cols-6">
            <label className={`${OPS_LABEL_CLASS} lg:col-span-4`}>Title<input className={OPS_INPUT_CLASS} name="title" required /></label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>Category<input className={OPS_INPUT_CLASS} defaultValue="general" name="category" /></label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-6`}>Body<textarea className={`${OPS_INPUT_CLASS} min-h-40`} name="body" placeholder="Step-by-step how-to..." /></label>
            <div className="flex items-end lg:col-span-6 lg:justify-end"><button className={`${OPS_PRIMARY_BUTTON_CLASS} w-full min-[520px]:w-auto`} type="submit"><Plus className="size-4" aria-hidden="true" />Save draft</button></div>
          </form>
        </details>
      ) : null}

      {articles.length === 0 ? (
        <OpsEmptyState icon={LibraryBig} title="No articles yet" description={canManage ? "Write your first how-to article to help staff self-serve." : "Published articles appear here."} actions={canManage ? [{ href: "#kb-create", label: "New article" }] : []} />
      ) : (
        <ul className="space-y-3">
          {articles.map((article) => (
            <li key={article.id} className="rounded-2xl border border-primary-dark/10 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-dark/45">{article.category.replace(/_/g, " ")}</p>
                  <h2 className="mt-1 font-heading text-lg font-bold text-primary-dark">
                    <Link className="hover:underline" href={`/ops/it/kb/${article.id}`}>{article.title}</Link>
                  </h2>
                </div>
                <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${article.status === "published" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : article.status === "draft" ? "border-sky-200 bg-sky-50 text-sky-700" : "border-primary-dark/15 bg-primary-dark/[0.04] text-primary-dark/65"}`}>
                  {article.status}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
