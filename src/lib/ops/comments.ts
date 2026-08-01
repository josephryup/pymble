import { requireOpsUser } from "@/lib/ops/auth";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type { OpsUserRole } from "@/lib/ops/types";

export type OpsRecordComment = {
  author: {
    /** R2 key presence only — the image itself is served by route (audit §3). */
    avatar_key: string | null;
    avatar_updated_at: string | null;
    full_name: string;
    id: string;
    role: OpsUserRole;
  } | null;
  author_id: string | null;
  body: string;
  created_at: string;
  id: string;
  is_internal: boolean;
  module_key: string;
  site_id: string | null;
  source_id: string;
  source_table: string;
  updated_at: string;
};

export type FetchOpsRecordCommentsInput = {
  moduleKey?: string;
  sourceId: string;
  sourceTable: string;
};

export type FetchOpsRecordCommentsForRecordsInput = {
  moduleKey?: string;
  sourceIds: string[];
  sourceTable: string;
};

type RawOpsRecordComment = Omit<OpsRecordComment, "author"> & {
  author: OpsRecordComment["author"] | OpsRecordComment["author"][];
};

function normalizeAuthor(author: RawOpsRecordComment["author"]) {
  return Array.isArray(author) ? (author[0] ?? null) : author;
}

export async function fetchOpsRecordComments(input: FetchOpsRecordCommentsInput) {
  await requireOpsUser();

  const supabase = getOpsSupabaseServiceClient();
  let query = supabase
    .from("record_comments")
    .select(
      "id, module_key, source_table, source_id, site_id, author_id, body, is_internal, created_at, updated_at, author:users!record_comments_author_id_fkey(id, full_name, role, avatar_key, avatar_updated_at)",
    )
    .eq("source_table", input.sourceTable)
    .eq("source_id", input.sourceId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (input.moduleKey) {
    query = query.eq("module_key", input.moduleKey);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return ((data ?? []) as unknown as RawOpsRecordComment[]).map((comment) => ({
    ...comment,
    author: normalizeAuthor(comment.author),
  }));
}

export async function fetchOpsRecordCommentsForRecords(
  input: FetchOpsRecordCommentsForRecordsInput,
) {
  await requireOpsUser();

  if (input.sourceIds.length === 0) {
    return new Map<string, OpsRecordComment[]>();
  }

  const supabase = getOpsSupabaseServiceClient();
  let query = supabase
    .from("record_comments")
    .select(
      "id, module_key, source_table, source_id, site_id, author_id, body, is_internal, created_at, updated_at, author:users!record_comments_author_id_fkey(id, full_name, role, avatar_key, avatar_updated_at)",
    )
    .eq("source_table", input.sourceTable)
    .in("source_id", input.sourceIds)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (input.moduleKey) {
    query = query.eq("module_key", input.moduleKey);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  const grouped = new Map<string, OpsRecordComment[]>();

  ((data ?? []) as unknown as RawOpsRecordComment[]).forEach((comment) => {
    const normalized = {
      ...comment,
      author: normalizeAuthor(comment.author),
    };
    grouped.set(comment.source_id, [...(grouped.get(comment.source_id) ?? []), normalized]);
  });

  return grouped;
}
