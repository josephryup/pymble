import { z } from "zod";

import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

/**
 * The shared cost-code (WBS) picker layer.
 *
 * Background — why this module exists at all. The spine in cost-codes.ts was
 * built to be the ONE key that answers planned vs requested vs committed vs
 * actual. Every consumer reads `cost_code_id`: the availability bands
 * (budget-availability.ts), the per-leaf roll-up (cost-codes.ts), the GL bridge
 * (gl-cost-bridge.ts) and the cost ledger itself (project_cost_entries).
 *
 * But until now NOTHING wrote it. `project_budget_lines.cost_code_id` and
 * `boq_line_items.cost_code_id` were populated once by the 20260809 backfill
 * migration and had no runtime writer at all, and a material request item could
 * only inherit a code from a schedule line — via a dropdown that was itself
 * hidden unless the site had a live issued schedule. With no live issued
 * schedule anywhere in the system, every request in the database landed on the
 * site's unplanned/contingency leaf with a zero budget, while the budget lines
 * holding the real money never saw a single unit of actual spend.
 *
 * This module is the missing writer. One option source, one validator, one
 * site-ownership guard, used by all three forms (budget line, schedule line,
 * material request item) so they cannot drift apart.
 *
 * Selection rule: a budget may be held at a PHASE node — that is what lets
 * Finance keep a short list of lines while the leaves beneath still roll up
 * into it — but spend (a schedule line, a request item) must charge a LEAF.
 * Phase totals are computed by rollUpCostCodeTree and would double-count if
 * money were bookable at both levels on the same branch.
 */

/** Library code of the per-site unplanned/contingency leaf. */
export const CONTINGENCY_LIBRARY_CODE = "90.90";

/** Library code of the per-site transport leaf. */
export const TRANSPORT_LIBRARY_CODE = "90.30";

export type OpsCostCodeOption = {
  id: string;
  path: string;
  name: string;
  /** "GEN.03.30 · Concrete works (in-situ)" — the one label used everywhere. */
  label: string;
  isPhase: boolean;
  isContingency: boolean;
};

/**
 * Selectable WBS nodes for a set of sites, keyed by site id.
 *
 * Returns phases and leaves together with `isPhase` set, so each caller applies
 * its own rule (see the selection rule above) against one query rather than
 * each form growing its own fetch.
 */
export async function fetchOpsCostCodeOptions(
  siteIds: string[],
): Promise<Map<string, OpsCostCodeOption[]>> {
  const out = new Map<string, OpsCostCodeOption[]>();
  const uniqueSiteIds = Array.from(new Set(siteIds.filter(Boolean)));
  if (uniqueSiteIds.length === 0) {
    return out;
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("project_cost_codes")
    .select(
      "id, site_id, parent_id, path, name, sort_order, library:cost_code_library!project_cost_codes_library_code_id_fkey(code)",
    )
    .in("site_id", uniqueSiteIds)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("path", { ascending: true });

  if (error) {
    throw error;
  }

  type Row = {
    id: string;
    site_id: string;
    parent_id: string | null;
    path: string;
    name: string;
    library: { code: string } | { code: string }[] | null;
  };

  for (const row of (data ?? []) as unknown as Row[]) {
    const library = Array.isArray(row.library) ? (row.library[0] ?? null) : row.library;
    const options = out.get(row.site_id) ?? [];
    options.push({
      id: row.id,
      path: row.path,
      name: row.name,
      label: `${row.path} · ${row.name}`,
      isPhase: row.parent_id === null,
      isContingency: library?.code === CONTINGENCY_LIBRARY_CODE,
    });
    out.set(row.site_id, options);
  }

  return out;
}

/** Convenience wrapper for the common single-site case. */
export async function fetchOpsCostCodeOptionsForSite(
  siteId: string | null,
): Promise<OpsCostCodeOption[]> {
  if (!siteId) {
    return [];
  }
  const bySite = await fetchOpsCostCodeOptions([siteId]);
  return bySite.get(siteId) ?? [];
}

/** Leaves only — for anything that books money rather than budgets it. */
export function leafCostCodeOptions(options: OpsCostCodeOption[]): OpsCostCodeOption[] {
  return options.filter((option) => !option.isPhase);
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Empty string → null, so an unset <select> means "not coded" not "invalid". */
export const optionalCostCodeIdSchema = z
  .string()
  .trim()
  .default("")
  .transform((value) => (value.length > 0 ? value : null))
  .refine((value) => value === null || UUID_PATTERN.test(value), {
    message: "Select a valid cost code.",
  });

export type CostCodeValidation =
  | { ok: true; costCodeId: string | null }
  | { ok: false; message: string };

/**
 * Confirm a submitted cost code really belongs to the site being charged, and
 * satisfies the caller's leaf/phase rule.
 *
 * This is a correctness guard, not a security one: the WBS is deliberately
 * world-readable (see cost-code-permissions.ts). What it stops is a stale form
 * — a picker rendered for one site and submitted after the record moved, or a
 * request whose scope changed from site to general — silently charging another
 * project's cost code, which no downstream report could ever detect.
 */
export async function validateCostCodeForSite(input: {
  costCodeId: string | null;
  siteId: string | null;
  /** Reject phase nodes. True for anything that books spend. */
  leafOnly?: boolean;
}): Promise<CostCodeValidation> {
  if (!input.costCodeId) {
    return { ok: true, costCodeId: null };
  }
  if (!input.siteId) {
    return {
      ok: false,
      message: "A cost code belongs to a project, so it cannot be set on a request with no site.",
    };
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("project_cost_codes")
    .select("id, site_id, parent_id, path, is_active")
    .eq("id", input.costCodeId)
    .maybeSingle<{
      id: string;
      site_id: string;
      parent_id: string | null;
      path: string;
      is_active: boolean;
    }>();

  if (error) {
    throw error;
  }
  if (!data || data.site_id !== input.siteId) {
    return { ok: false, message: "That cost code does not belong to this project." };
  }
  if (!data.is_active) {
    return { ok: false, message: `Cost code ${data.path} is deactivated.` };
  }
  if (input.leafOnly && data.parent_id === null) {
    return {
      ok: false,
      message: `${data.path} is a phase, not a cost code. Pick the specific work beneath it.`,
    };
  }

  return { ok: true, costCodeId: data.id };
}

/**
 * The site's contingency leaf ids, for callers that need to treat "budgeted to
 * the unplanned bucket" differently from "budgeted nowhere at all" — see
 * decideBudgetControl, where the difference decides whether the MD is woken up.
 */
export async function fetchOpsContingencyCostCodeIds(
  siteIds: string[],
): Promise<Set<string>> {
  const bySite = await fetchOpsCostCodeOptions(siteIds);
  const out = new Set<string>();
  for (const options of bySite.values()) {
    for (const option of options) {
      if (option.isContingency) {
        out.add(option.id);
      }
    }
  }
  return out;
}

/**
 * Which of the given cost code ids are contingency leaves. One query for a
 * batch, so a list page never issues a lookup per row.
 */
export async function fetchOpsContingencyCostCodeIdsFor(
  costCodeIds: string[],
): Promise<Set<string>> {
  const out = new Set<string>();
  const unique = Array.from(new Set(costCodeIds.filter(Boolean)));
  if (unique.length === 0) {
    return out;
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("project_cost_codes")
    .select(
      "id, library:cost_code_library!project_cost_codes_library_code_id_fkey(code)",
    )
    .in("id", unique);

  if (error) {
    throw error;
  }

  type Row = { id: string; library: { code: string } | { code: string }[] | null };
  for (const row of (data ?? []) as unknown as Row[]) {
    const library = Array.isArray(row.library) ? (row.library[0] ?? null) : row.library;
    if (library?.code === CONTINGENCY_LIBRARY_CODE) {
      out.add(row.id);
    }
  }

  return out;
}

/** Whether one cost code id is a contingency leaf. */
export async function isOpsContingencyCostCode(costCodeId: string): Promise<boolean> {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("project_cost_codes")
    .select("library:cost_code_library!project_cost_codes_library_code_id_fkey(code)")
    .eq("id", costCodeId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const row = data as unknown as {
    library: { code: string } | { code: string }[] | null;
  } | null;
  const library = Array.isArray(row?.library) ? (row?.library[0] ?? null) : (row?.library ?? null);
  return library?.code === CONTINGENCY_LIBRARY_CODE;
}
