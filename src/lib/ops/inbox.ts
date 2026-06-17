import { requireOpsUser } from "@/lib/ops/auth";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type { OpsUserRole } from "@/lib/ops/types";

export type OpsInboxMention = {
  id: string;
  body: string;
  module_key: string;
  source_table: string;
  source_id: string;
  site_id: string | null;
  created_at: string;
  author: {
    id: string;
    full_name: string;
    role: OpsUserRole;
  } | null;
};

type RawMention = Omit<OpsInboxMention, "author"> & {
  author: OpsInboxMention["author"] | OpsInboxMention["author"][];
};

function normalizeAuthor(author: RawMention["author"]) {
  return Array.isArray(author) ? (author[0] ?? null) : author;
}

/**
 * Count of comments mentioning the current user that haven't been "marked read"
 * — for now we approximate "unread" as "added in the last 7 days" since we
 * don't yet track per-mention read state. Used by the sidebar badge.
 */
export async function fetchOpsInboxUnreadCountForCurrentUser() {
  const { profile } = await requireOpsUser();
  const supabase = getOpsSupabaseServiceClient();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from("record_comments")
    .select("id", { count: "exact", head: true })
    .contains("mentioned_user_ids", [profile.id])
    .is("deleted_at", null)
    .gte("created_at", sevenDaysAgo);

  if (error) {
    return 0;
  }
  return count ?? 0;
}

/**
 * Fetch the comments where the current user has been @mentioned, newest first.
 * Used by /ops/inbox.
 */
export async function fetchOpsInboxMentionsForCurrentUser(limit = 50) {
  const { profile } = await requireOpsUser();
  const supabase = getOpsSupabaseServiceClient();

  const { data, error } = await supabase
    .from("record_comments")
    .select(
      "id, body, module_key, source_table, source_id, site_id, created_at, author:users!record_comments_author_id_fkey(id, full_name, role)",
    )
    .contains("mentioned_user_ids", [profile.id])
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return ((data ?? []) as unknown as RawMention[]).map((mention) => ({
    ...mention,
    author: normalizeAuthor(mention.author),
  }));
}

export type OpsInboxConversation = {
  key: string;
  source_table: string;
  source_id: string;
  module_key: string;
  latest_at: string;
  mentions: OpsInboxMention[];
};

/**
 * Group the raw mentions by source_table + source_id so each conversation
 * surfaces once with all of its mentions inside. Sorted newest-first by the
 * latest mention in each thread.
 */
export function groupOpsInboxMentions(mentions: OpsInboxMention[]): OpsInboxConversation[] {
  const buckets = new Map<string, OpsInboxConversation>();
  for (const mention of mentions) {
    const key = `${mention.source_table}:${mention.source_id}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.mentions.push(mention);
      if (mention.created_at > existing.latest_at) {
        existing.latest_at = mention.created_at;
      }
    } else {
      buckets.set(key, {
        key,
        source_table: mention.source_table,
        source_id: mention.source_id,
        module_key: mention.module_key,
        latest_at: mention.created_at,
        mentions: [mention],
      });
    }
  }
  return Array.from(buckets.values()).sort((a, b) => (a.latest_at < b.latest_at ? 1 : -1));
}
