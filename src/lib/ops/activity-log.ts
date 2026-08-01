import { requireOpsUser } from "@/lib/ops/auth";
import {
  createOpsPagination,
  opsIlikePattern,
  type OpsListState,
  type OpsPaginatedResult,
} from "@/lib/ops/listing";
import { logOpsServerError } from "@/lib/ops/log";
import { canViewOpsBackoffice } from "@/lib/ops/permissions";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type { OpsUserRole } from "@/lib/ops/types";

export type OpsActivityLogEntry = {
  id: string;
  created_at: string;
  action: string;
  entity_type: string;
  module_key: string | null;
  /** Best human description: the stored summary, else a derived label. */
  message: string;
  tone: "info" | "good" | "warn";
  actor_name: string | null;
  actor_role: OpsUserRole | null;
  actor_user_id: string | null;
  actor_has_avatar: boolean;
  actor_avatar_updated_at: string | null;
};

export type FetchOpsActivityLogOptions = {
  listState: OpsListState;
  moduleKey?: string;
  query?: string;
};

type RawActivityRow = {
  id: string;
  action: string;
  entity_type: string;
  module_key: string | null;
  summary: string | null;
  actor_user_id: string | null;
  created_at: string;
};

function deriveMessage(row: RawActivityRow): string {
  if (row.summary && row.summary.trim().length > 0) {
    return row.summary.trim();
  }
  const noun = row.entity_type.replace(/_/g, " ");
  if (row.action.endsWith(".created")) return `${noun} created`;
  if (row.action.endsWith(".updated")) return `${noun} updated`;
  if (row.action.endsWith(".approved")) return `${noun} approved`;
  if (row.action.endsWith(".rejected")) return `${noun} rejected`;
  if (row.action.endsWith(".completed")) return `${noun} completed`;
  if (row.action.endsWith(".uploaded")) return `${noun} uploaded`;
  if (row.action.endsWith(".archived")) return `${noun} archived`;
  if (row.action.endsWith(".cancelled")) return `${noun} cancelled`;
  return row.action.replace(/\./g, " ");
}

function deriveTone(action: string): OpsActivityLogEntry["tone"] {
  if (
    action.includes("approved") ||
    action.includes("completed") ||
    action.includes("uploaded") ||
    action.includes("acknowledged")
  ) {
    return "good";
  }
  if (
    action.includes("rejected") ||
    action.includes("cancelled") ||
    action.includes("archived") ||
    action.includes("deactivated") ||
    action.includes("failed")
  ) {
    return "warn";
  }
  return "info";
}

/**
 * Resolve actor names/roles via the service client (bypassing the per-row
 * `users` RLS — same rationale as the dashboard timeline), keyed by id.
 */
type ResolvedActor = {
  name: string | null;
  role: OpsUserRole | null;
  /** Presence only — the image is served by /api/ops/avatar (audit §3). */
  hasAvatar: boolean;
  avatarUpdatedAt: string | null;
};

async function resolveActors(
  actorIds: string[],
): Promise<Map<string, ResolvedActor>> {
  const map = new Map<string, ResolvedActor>();
  if (actorIds.length === 0) {
    return map;
  }
  const supabase = getOpsSupabaseServiceClient();
  const { data } = await supabase
    .from("users")
    .select("id, full_name, role, avatar_key, avatar_updated_at")
    .in("id", actorIds);
  for (const row of (data ?? []) as Array<{
    id: string;
    full_name: string | null;
    role: OpsUserRole | null;
    avatar_key: string | null;
    avatar_updated_at: string | null;
  }>) {
    map.set(row.id, {
      name: row.full_name?.trim() || null,
      role: row.role ?? null,
      hasAvatar: Boolean(row.avatar_key),
      avatarUpdatedAt: row.avatar_updated_at,
    });
  }
  return map;
}

/**
 * The full system activity log. Restricted to back-office roles (leadership,
 * Operations Manager, Developer) and read via the service client because the
 * audit_events RLS does not grant the Operations Manager select access.
 */
export async function fetchOpsActivityLog(
  options: FetchOpsActivityLogOptions,
): Promise<OpsPaginatedResult<OpsActivityLogEntry>> {
  const { profile } = await requireOpsUser();
  const { listState } = options;

  if (!canViewOpsBackoffice(profile.role)) {
    return { items: [], pagination: createOpsPagination(0, listState) };
  }

  const supabase = getOpsSupabaseServiceClient();
  let query = supabase
    .from("audit_events")
    .select(
      "id, action, entity_type, module_key, summary, actor_user_id, created_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false });

  if (options.moduleKey) {
    query = query.eq("module_key", options.moduleKey);
  }

  const pattern = opsIlikePattern(options.query ?? "");
  if (pattern) {
    query = query.or(`summary.ilike.${pattern},action.ilike.${pattern}`);
  }

  const { data, error, count } = await query.range(listState.from, listState.to);
  if (error) {
    logOpsServerError(error, { module: "activity_log", action: "fetchOpsActivityLog" });
    throw error;
  }

  const rows = (data ?? []) as RawActivityRow[];
  const actorIds = [
    ...new Set(
      rows
        .map((row) => row.actor_user_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];
  const actors = await resolveActors(actorIds);

  const items: OpsActivityLogEntry[] = rows.map((row) => {
    const actor = row.actor_user_id ? actors.get(row.actor_user_id) : undefined;
    return {
      id: row.id,
      created_at: row.created_at,
      action: row.action,
      entity_type: row.entity_type,
      module_key: row.module_key,
      message: deriveMessage(row),
      tone: deriveTone(row.action),
      actor_name: actor?.name ?? null,
      actor_role: actor?.role ?? null,
      actor_user_id: row.actor_user_id,
      actor_has_avatar: actor?.hasAvatar ?? false,
      actor_avatar_updated_at: actor?.avatarUpdatedAt ?? null,
    };
  });

  return { items, pagination: createOpsPagination(count, listState) };
}

/**
 * Distinct module keys present in the audit log, for the filter dropdown.
 * Restricted to the same back-office roles.
 */
export async function fetchOpsActivityModuleKeys(): Promise<string[]> {
  const { profile } = await requireOpsUser();
  if (!canViewOpsBackoffice(profile.role)) {
    return [];
  }
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("audit_events")
    .select("module_key")
    .not("module_key", "is", null)
    .limit(5000);
  if (error) {
    logOpsServerError(error, {
      module: "activity_log",
      action: "fetchOpsActivityModuleKeys",
    });
    return [];
  }
  const keys = new Set<string>();
  for (const row of (data ?? []) as Array<{ module_key: string | null }>) {
    if (row.module_key) keys.add(row.module_key);
  }
  return Array.from(keys).sort();
}
