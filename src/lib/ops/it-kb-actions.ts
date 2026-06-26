"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeOpsActionErrorMessage } from "@/lib/ops/action-errors";
import { requireOpsUser } from "@/lib/ops/auth";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import { canManageIT } from "@/lib/ops/it-permissions";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

const ROUTE = "/ops/it/kb";

const articleSchema = z.object({
  body: z.string().trim().max(20000).default(""),
  category: z.string().trim().max(80).default("general"),
  title: z.string().trim().min(3, "Give the article a title.").max(180),
});

const idSchema = z.object({ article_id: z.string().uuid("Select an article.") });

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function kbError(route: string, message: string): never {
  redirect(`${route}?error=${encodeURIComponent(safeOpsActionErrorMessage(message))}`);
}

function normalizeCategory(value: string) {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48);
  return normalized || "general";
}

export async function createItKbArticleAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  if (!canManageIT(profile.role)) {
    kbError(ROUTE, "Your role cannot manage the knowledge base.");
  }

  const parsed = articleSchema.safeParse({
    body: field(formData, "body"),
    category: field(formData, "category") || "general",
    title: field(formData, "title"),
  });
  if (!parsed.success) {
    kbError(ROUTE, parsed.error.issues[0]?.message ?? "Check the article details.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("it_kb_articles")
    .insert({
      body: parsed.data.body,
      category: normalizeCategory(parsed.data.category),
      created_by: profile.id,
      status: "draft",
      title: parsed.data.title,
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) {
    kbError(ROUTE, error?.message ?? "Could not create the article.");
  }

  await recordOpsAuditEvent({
    action: "it_kb.create",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "it_kb_article",
    moduleKey: "it-kb",
    sourceId: data.id,
    sourceTable: "it_kb_articles",
    summary: `Drafted KB article ${parsed.data.title}`,
  });

  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${data.id}`);
}

export async function publishItKbArticleAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  if (!canManageIT(profile.role)) {
    kbError(ROUTE, "Your role cannot manage the knowledge base.");
  }

  const parsed = idSchema.safeParse({ article_id: field(formData, "article_id") });
  if (!parsed.success) {
    kbError(ROUTE, "Select an article.");
  }

  const articleRoute = `${ROUTE}/${parsed.data.article_id}`;
  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("it_kb_articles")
    .update({ status: "published" })
    .eq("id", parsed.data.article_id)
    .is("archived_at", null);
  if (error) {
    kbError(articleRoute, error.message);
  }

  revalidatePath(articleRoute);
  revalidatePath(ROUTE);
  redirect(`${articleRoute}?updated=published`);
}

export async function archiveItKbArticleAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  if (!canManageIT(profile.role)) {
    kbError(ROUTE, "Your role cannot manage the knowledge base.");
  }

  const parsed = idSchema.safeParse({ article_id: field(formData, "article_id") });
  if (!parsed.success) {
    kbError(ROUTE, "Select an article to archive.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("it_kb_articles")
    .update({ archived_at: new Date().toISOString(), archived_by: profile.id, status: "archived" })
    .eq("id", parsed.data.article_id)
    .is("archived_at", null);
  if (error) {
    kbError(ROUTE, error.message);
  }

  revalidatePath(ROUTE);
  redirect(`${ROUTE}?updated=archived`);
}
