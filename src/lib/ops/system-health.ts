import { requireOpsUser } from "@/lib/ops/auth";
import { canManageOps } from "@/lib/ops/permissions";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

/**
 * A place to look at the silent failures.
 *
 * `.catch(() => null)` appears 338 times in src/lib/ops. That is a deliberate
 * and largely correct pattern — a notification that fails to send must not roll
 * back the approval it was announcing — and it is nearly always paired with an
 * audit row recording what went wrong.
 *
 * The problem was never the swallowing. It was that the audit rows are
 * write-only: nothing in the workspace reads them back. The project↔finance
 * audit found `material_request.budget_line_resolution_failed` events that had
 * been accumulating unnoticed for weeks, and the follow-up audit found them
 * still accumulating. Nobody looks, because there was nowhere to look
 * (independent audit 2026-08-04, finding R2).
 *
 * This module is that surface. It deliberately does no interpretation — it
 * counts, groups and orders. Deciding what a spike means is the reader's job;
 * the failure being invisible was the actual bug.
 */

/** Audit `action` values that record a swallowed failure. */
const FAILURE_ACTION_PATTERNS = ["%_failed", "%_failure", "%_error"] as const;

export type OpsSystemHealthRow = {
  /** The audit action, e.g. `material_request.budget_line_resolution_failed`. */
  action: string;
  /** Total occurrences inside the window. */
  count: number;
  /** Most recent occurrence, ISO. */
  latest: string;
  /** Human-facing module name derived from the action prefix. */
  module: string;
};

export type OpsSystemHealth = {
  rows: OpsSystemHealthRow[];
  /** Total failures in the window, across all actions. */
  total: number;
  /** How many days back the window reaches. */
  windowDays: number;
};

/**
 * `material_request.budget_line_resolution_failed` → `Material request`.
 *
 * Exported for testing and because the mapping is the only part of this module
 * with any judgement in it: everything before the first dot is the module, and
 * a bare key with no dot (`send_failed`) belongs to whatever wrote it, which we
 * cannot know from the action alone.
 */
export function opsFailureModuleLabel(action: string) {
  const [prefix, ...rest] = action.split(".");

  if (rest.length === 0) {
    return "Platform";
  }

  return prefix
    .replace(/_/g, " ")
    .replace(/^./, (character) => character.toUpperCase());
}

/**
 * Turn raw audit rows into ordered counts. Pure, so the ordering and grouping
 * can be tested without a database.
 */
export function summariseOpsFailureEvents(
  events: { action: string; created_at: string }[],
  windowDays: number,
): OpsSystemHealth {
  const grouped = new Map<string, { count: number; latest: string }>();

  for (const event of events) {
    const existing = grouped.get(event.action);

    if (!existing) {
      grouped.set(event.action, { count: 1, latest: event.created_at });
      continue;
    }

    existing.count += 1;
    if (event.created_at > existing.latest) {
      existing.latest = event.created_at;
    }
  }

  const rows = [...grouped.entries()]
    .map(([action, { count, latest }]) => ({
      action,
      count,
      latest,
      module: opsFailureModuleLabel(action),
    }))
    // Most frequent first; ties broken by most recent, so a new failure does
    // not get buried under an old noisy one with the same count.
    .sort((a, b) => b.count - a.count || b.latest.localeCompare(a.latest));

  return {
    rows,
    total: rows.reduce((sum, row) => sum + row.count, 0),
    windowDays,
  };
}

export async function fetchOpsSystemHealth(windowDays = 30): Promise<OpsSystemHealth> {
  const { profile } = await requireOpsUser();

  // Failure actions can name records the reader may not otherwise see, so this
  // sits behind the same gate as the rest of the settings area.
  if (!canManageOps(profile.role)) {
    return { rows: [], total: 0, windowDays };
  }

  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  const supabase = getOpsSupabaseServiceClient();

  const { data, error } = await supabase
    .from("audit_events")
    .select("action, created_at")
    .or(FAILURE_ACTION_PATTERNS.map((pattern) => `action.like.${pattern}`).join(","))
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error || !data) {
    return { rows: [], total: 0, windowDays };
  }

  return summariseOpsFailureEvents(data, windowDays);
}
