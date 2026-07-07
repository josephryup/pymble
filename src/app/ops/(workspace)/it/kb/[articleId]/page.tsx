import { ArrowLeft, Send } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OpsPageHeader } from "@/components/ops/OpsPageHeader";
import { OpsRealtimeRefresh } from "@/components/ops/OpsRealtimeRefresh";
import { requireOpsUser } from "@/lib/ops/auth";
import { fetchOpsItKbArticle } from "@/lib/ops/it-kb";
import { archiveItKbArticleAction, publishItKbArticleAction } from "@/lib/ops/it-kb-actions";
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
  params: Promise<{ articleId: string }>;
  searchParams?: Promise<OpsSearchParams>;
};

export default async function OpsItKbArticlePage({ params, searchParams }: PageProps) {
  const [{ articleId }, sp, { profile }] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({} as OpsSearchParams),
    requireOpsUser(),
  ]);

  if (!canAccessOpsHref(profile.role, "/ops/it/kb")) {
    notFound();
  }

  const article = await fetchOpsItKbArticle(articleId);
  if (!article || article.archived_at) {
    notFound();
  }

  const canManage = canManageIT(profile.role);
  const error = firstParam(sp.error);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
      <OpsRealtimeRefresh tables={["it_kb_articles"]} />
      <OpsPageHeader
        eyebrow={`Knowledge base · ${article.category.replace(/_/g, " ")}`}
        title={article.title}
        description={article.status === "published" ? "Published article" : `Status: ${article.status}`}
        actions={
          <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/it/kb">
            <ArrowLeft className="size-4" aria-hidden="true" />
            All articles
          </Link>
        }
      />

      {error ? (
        <div className={OPS_NOTICE_ERROR_CLASS} role="alert">{error}</div>
      ) : null}

      <article className="whitespace-pre-wrap rounded-lg border border-border bg-card p-5 text-sm text-foreground/80">
        {article.body || "No content yet."}
      </article>

      {canManage ? (
        <div className="flex flex-wrap gap-2">
          {article.status === "draft" ? (
            <form action={publishItKbArticleAction}>
              <input name="article_id" type="hidden" value={article.id} />
              <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
                <Send className="size-4" aria-hidden="true" />
                Publish
              </button>
            </form>
          ) : null}
          <form action={archiveItKbArticleAction}>
            <input name="article_id" type="hidden" value={article.id} />
            <button className={OPS_DANGER_BUTTON_CLASS} type="submit">Archive</button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
