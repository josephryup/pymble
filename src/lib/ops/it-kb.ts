import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type { OpsItKbStatus } from "@/lib/ops/types";

export type OpsItKbArticleSummary = {
  archived_at: string | null;
  category: string;
  created_at: string;
  id: string;
  status: OpsItKbStatus;
  title: string;
};

export type OpsItKbArticleDetail = OpsItKbArticleSummary & {
  body: string;
};

export async function fetchOpsItKbArticles(): Promise<OpsItKbArticleSummary[]> {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("it_kb_articles")
    .select("id, title, category, status, archived_at, created_at")
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .returns<OpsItKbArticleSummary[]>();

  if (error) {
    throw error;
  }
  return data ?? [];
}

/** Published KB articles with body, for the staff-facing handbook. */
export async function fetchPublishedItKbArticles(): Promise<OpsItKbArticleDetail[]> {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("it_kb_articles")
    .select("id, title, category, body, status, archived_at, created_at")
    .eq("status", "published")
    .is("archived_at", null)
    .order("category", { ascending: true })
    .returns<OpsItKbArticleDetail[]>();

  if (error) {
    throw error;
  }
  return data ?? [];
}

export async function fetchOpsItKbArticle(articleId: string): Promise<OpsItKbArticleDetail | null> {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("it_kb_articles")
    .select("id, title, category, body, status, archived_at, created_at")
    .eq("id", articleId)
    .maybeSingle<OpsItKbArticleDetail>();

  if (error) {
    throw error;
  }
  return data;
}
