import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type { OpsUserRole } from "@/lib/ops/types";

export type OpsActiveUser = {
  id: string;
  full_name: string;
  role: OpsUserRole;
};

// Workflow fallback chain — used when a primary recipient role has zero active
// users in the org. Matches Part 10.3.A of pymble-ops-workflow-design.md.
//
// The chain is walked tier by tier (not flattened). When the first tier where
// at least one role has at least one active user is reached, those users are
// returned. This guarantees the "first non-empty tier wins" semantic.
//
// If two primary roles are passed, both chains are walked together — each tier
// pools all unvisited candidate roles from every primary's chain.
const OPS_ROLE_FALLBACK_CHAIN: Partial<Record<OpsUserRole, OpsUserRole[]>> = {
  // Commercial
  quantity_surveyor: ["projects_manager", "operations_manager", "managing_director"],

  // Delivery
  projects_manager: ["operations_manager", "general_manager", "managing_director"],
  operations_manager: ["general_manager", "managing_director"],
  supervisor: ["operations_manager", "general_manager", "managing_director"],

  // Finance
  finance_manager: ["accountant", "managing_director"],
  accountant: ["finance_manager", "managing_director"],

  // Procurement
  procurement_manager: ["operations_manager", "managing_director"],
  procurement: ["procurement_manager", "operations_manager"],
  procurement_assistant: ["procurement", "procurement_manager"],

  // HSE
  hse_officer: ["operations_manager", "managing_director"],
  hse_assistant_officer: ["hse_officer", "operations_manager"],

  // HR
  human_resource: ["general_manager", "managing_director"],
  hr: ["general_manager", "managing_director"],

  // Engineering / site
  engineer: ["projects_manager", "operations_manager"],
  admin_receptionist: ["human_resource", "operations_manager"],

  // Leadership
  general_manager: ["managing_director"],
  manager: ["operations_manager", "general_manager", "managing_director"],
};

// Roles that always exist (Developer + MD are bootstrap-required) — used as
// the ultimate fallback if every primary role + its entire chain resolved to
// nothing. Notifications never silently drop.
const OPS_ULTIMATE_FALLBACK_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "owner",
];

function uniqueById(users: OpsActiveUser[]): OpsActiveUser[] {
  return Array.from(new Map(users.map((user) => [user.id, user])).values());
}

/**
 * Fetches every active user, suitable for a single resolveOpsRecipients() call
 * per action. Cache this in your action and reuse across multiple fanouts.
 */
export async function fetchOpsActiveUsers(): Promise<OpsActiveUser[]> {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("users")
    .select("id, full_name, role")
    .eq("is_active", true);

  if (error) {
    throw error;
  }

  return (data ?? []) as OpsActiveUser[];
}

/**
 * Resolves a list of primary recipient roles into active users.
 *
 * Semantics:
 * - Each primary role expands into its own chain: [primary, fallback1, fallback2, ...].
 * - We walk the chains tier-by-tier in parallel. At each tier we collect the
 *   union of roles across every primary's chain that haven't been tried yet.
 * - The first tier where at least one user is found wins — those users are
 *   returned and we stop walking.
 * - If every tier in every chain is empty, fall back to the ultimate
 *   (Developer + Managing Director + Owner) so notifications never drop.
 *
 * Returns deduplicated users (by id). Use excludeUserIds to drop the actor
 * (you usually don't notify yourself).
 */
export function resolveOpsRecipients(
  users: OpsActiveUser[],
  primaryRoles: OpsUserRole[],
  options: { excludeUserIds?: Array<string | null | undefined> } = {},
): OpsActiveUser[] {
  const excluded = new Set(
    (options.excludeUserIds ?? []).filter((id): id is string => Boolean(id)),
  );

  function matchRoles(candidateRoles: OpsUserRole[]): OpsActiveUser[] {
    if (candidateRoles.length === 0) {
      return [];
    }
    const roleSet = new Set(candidateRoles);
    return uniqueById(
      users.filter((user) => roleSet.has(user.role) && !excluded.has(user.id)),
    );
  }

  // Build the per-primary chains: [primary, fallback1, fallback2, ...]
  const chains: OpsUserRole[][] = primaryRoles.map((role) => [
    role,
    ...(OPS_ROLE_FALLBACK_CHAIN[role] ?? []),
  ]);

  const maxDepth = chains.reduce((max, chain) => Math.max(max, chain.length), 0);
  const visited = new Set<OpsUserRole>();

  for (let tier = 0; tier < maxDepth; tier += 1) {
    const candidates: OpsUserRole[] = [];
    for (const chain of chains) {
      const role = chain[tier];
      if (role && !visited.has(role)) {
        candidates.push(role);
        visited.add(role);
      }
    }
    const matches = matchRoles(candidates);
    if (matches.length > 0) {
      return matches;
    }
  }

  // Ultimate fallback so a notification is never silently dropped.
  return matchRoles(OPS_ULTIMATE_FALLBACK_ROLES);
}

/**
 * Convenience: load the active user pool and resolve recipients in one call.
 * Use this when only one fanout is needed; otherwise call fetchOpsActiveUsers
 * once and reuse.
 */
export async function fanoutToOpsRoles(
  primaryRoles: OpsUserRole[],
  options: { excludeUserIds?: Array<string | null | undefined> } = {},
): Promise<OpsActiveUser[]> {
  const users = await fetchOpsActiveUsers();
  return resolveOpsRecipients(users, primaryRoles, options);
}

/**
 * Phase P: 3-audience model per Part 12 of the workflow design.
 *
 * - actionNeeded: people the system is asking to act on this record next
 *   (e.g. the next approver in the chain, the procurement officer who must
 *   attach pricing).
 * - stakeholders: people affected by the change but not the actor — typically
 *   the original requester, the QS, peer leads on the same project.
 * - oversight: leadership that should always have visibility on this class
 *   of event (MD, GM, owner).
 *
 * Each audience is resolved independently — fallback chains do NOT cross
 * audience boundaries. The combined recipient list is deduped by id and the
 * actor is always excluded.
 */
export async function fanoutToOpsAudiences(input: {
  actionNeeded?: OpsUserRole[];
  stakeholders?: OpsUserRole[];
  oversight?: OpsUserRole[];
  extraUserIds?: Array<string | null | undefined>;
  excludeUserIds?: Array<string | null | undefined>;
}): Promise<OpsActiveUser[]> {
  const users = await fetchOpsActiveUsers();
  const exclude = input.excludeUserIds ?? [];
  const buckets: OpsActiveUser[][] = [];
  if (input.actionNeeded && input.actionNeeded.length > 0) {
    buckets.push(resolveOpsRecipients(users, input.actionNeeded, { excludeUserIds: exclude }));
  }
  if (input.stakeholders && input.stakeholders.length > 0) {
    buckets.push(resolveOpsRecipients(users, input.stakeholders, { excludeUserIds: exclude }));
  }
  if (input.oversight && input.oversight.length > 0) {
    buckets.push(resolveOpsRecipients(users, input.oversight, { excludeUserIds: exclude }));
  }
  const extraIds = new Set(
    (input.extraUserIds ?? []).filter((id): id is string => Boolean(id)),
  );
  if (extraIds.size > 0) {
    const excludedIds = new Set(
      exclude.filter((id): id is string => Boolean(id)),
    );
    const extras = users.filter(
      (user) => extraIds.has(user.id) && !excludedIds.has(user.id),
    );
    buckets.push(extras);
  }
  return uniqueById(buckets.flat());
}
