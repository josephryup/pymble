import { z } from "zod";

import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

/**
 * The shared cost-code (WBS) picker layer.
 *
 * ── Why this module exists ────────────────────────────────────────────────
 * The spine in cost-codes.ts was built to be the ONE key that answers planned
 * vs requested vs committed vs actual. Every consumer reads `cost_code_id`: the
 * availability bands (budget-availability.ts), the per-leaf roll-up
 * (cost-codes.ts), the GL bridge (gl-cost-bridge.ts) and the cost ledger
 * itself. But nothing ever WROTE it — `project_budget_lines.cost_code_id` and
 * `boq_line_items.cost_code_id` were populated once by the 20260809 backfill
 * migration and had no runtime writer at all.
 *
 * ── Why picking from the project WBS alone was not enough ─────────────────
 * The first fix added pickers that read `project_cost_codes`. That table is
 * essentially EMPTY for most projects: the backfill only created nodes for the
 * five sites that already had budget lines when it ran, so six of eleven sites
 * — including two carrying live budgets of K901,277 and K523,245 — have not a
 * single cost code. On those projects the picker rendered an empty dropdown,
 * which is a wall, not a prompt.
 *
 * The manual escape hatch (assemble a WBS on /ops/cost-codes: invent a phase
 * code, then attach library codes one at a time) is a chore nobody will do
 * eleven times before they are allowed to write a budget.
 *
 * ── The model this module implements ──────────────────────────────────────
 * The company LIBRARY is the real taxonomy: 53 codes, seeded, GL-mapped, and
 * change-controlled by Finance. `project_cost_codes` is only "which library
 * codes does this project use, under which phase" — bookkeeping that should
 * assemble ITSELF from use rather than being a prerequisite for it.
 *
 * So every picker offers both:
 *
 *   • `node:<id>` — a cost code this project already uses.
 *   • `lib:<id>`  — any library code, provisioned onto the project on first
 *                   use under a default "GEN" phase (created if absent).
 *
 * Picking a library code is therefore one click, the dropdown is never empty,
 * and the WBS grows to match what the project actually spends on. Phases stay
 * available on /ops/cost-codes for projects that genuinely phase their work
 * (SIATONTOLA does); they are simply no longer a gate.
 *
 * Authority note: provisioning uses a code Finance already approved into the
 * library and files it under the default phase. It is *usage*, not taxonomy —
 * so it is allowed to anyone already authorised to edit the record they are
 * on, while adding a NEW library code stays restricted to Finance and the MD
 * (see cost-code-permissions.ts). Deliberately open, because the alternative
 * is people going back to free text, which is the failure the spine ends.
 */

/** Library code of the per-site unplanned/contingency leaf. */
export const CONTINGENCY_LIBRARY_CODE = "90.90";

/** Library code of the per-site transport leaf. */
export const TRANSPORT_LIBRARY_CODE = "90.30";

/** Code and name of the default phase used when a project has none. */
const DEFAULT_PHASE_CODE = "GEN";
const DEFAULT_PHASE_NAME = "General / unphased";

export type OpsCostCodeChoice = {
  /** "node:<uuid>" for an existing project node, "lib:<uuid>" for a library code. */
  value: string;
  label: string;
  /** "project" = already on this project; "library" = provisioned on first use. */
  group: "project" | "library";
  /** Division heading, for grouping library choices in the UI. */
  division: string | null;
  isPhase: boolean;
  isContingency: boolean;
};

/**
 * Build the selectable list for a set of sites, keyed by site id.
 *
 * Phases and leaves come back together with `isPhase` set, so each caller
 * applies its own rule against one query: a budget line may sit on a phase
 * (that is what lets Finance keep a short list while leaves roll up into it),
 * but spend must charge a leaf.
 */
export async function fetchOpsCostCodeChoices(
  siteIds: string[],
): Promise<Map<string, OpsCostCodeChoice[]>> {
  const out = new Map<string, OpsCostCodeChoice[]>();
  const uniqueSiteIds = Array.from(new Set(siteIds.filter(Boolean)));
  if (uniqueSiteIds.length === 0) {
    return out;
  }

  const supabase = getOpsSupabaseServiceClient();

  const [nodeResult, libraryResult] = await Promise.all([
    supabase
      .from("project_cost_codes")
      .select(
        "id, site_id, parent_id, path, name, library_code_id, library:cost_code_library!project_cost_codes_library_code_id_fkey(code)",
      )
      .in("site_id", uniqueSiteIds)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("path", { ascending: true }),
    supabase
      .from("cost_code_library")
      .select("id, code, name, division")
      .eq("is_active", true)
      .order("division", { ascending: true })
      .order("code", { ascending: true }),
  ]);

  if (nodeResult.error) {
    throw nodeResult.error;
  }
  if (libraryResult.error) {
    throw libraryResult.error;
  }

  type NodeRow = {
    id: string;
    site_id: string;
    parent_id: string | null;
    path: string;
    name: string;
    library_code_id: string | null;
    library: { code: string } | { code: string }[] | null;
  };
  type LibraryRow = { id: string; code: string; name: string; division: string };

  const library = (libraryResult.data ?? []) as LibraryRow[];

  // Which library codes each site already carries, so the same code is never
  // offered twice — once as an existing node and once as "add from library".
  const usedBySite = new Map<string, Set<string>>();
  for (const row of (nodeResult.data ?? []) as unknown as NodeRow[]) {
    const lib = Array.isArray(row.library) ? (row.library[0] ?? null) : row.library;
    const choices = out.get(row.site_id) ?? [];
    choices.push({
      value: `node:${row.id}`,
      label: `${row.path} · ${row.name}`,
      group: "project",
      division: null,
      isPhase: row.parent_id === null,
      isContingency: lib?.code === CONTINGENCY_LIBRARY_CODE,
    });
    out.set(row.site_id, choices);

    if (row.library_code_id) {
      const used = usedBySite.get(row.site_id) ?? new Set<string>();
      used.add(row.library_code_id);
      usedBySite.set(row.site_id, used);
    }
  }

  for (const siteId of uniqueSiteIds) {
    const choices = out.get(siteId) ?? [];
    const used = usedBySite.get(siteId) ?? new Set<string>();
    for (const entry of library) {
      if (used.has(entry.id)) {
        continue;
      }
      choices.push({
        value: `lib:${entry.id}`,
        label: `${entry.code} · ${entry.name}`,
        group: "library",
        division: entry.division,
        isPhase: false,
        isContingency: entry.code === CONTINGENCY_LIBRARY_CODE,
      });
    }
    out.set(siteId, choices);
  }

  return out;
}

/** Convenience wrapper for the common single-site case. */
export async function fetchOpsCostCodeChoicesForSite(
  siteId: string | null,
): Promise<OpsCostCodeChoice[]> {
  if (!siteId) {
    return [];
  }
  const bySite = await fetchOpsCostCodeChoices([siteId]);
  return bySite.get(siteId) ?? [];
}

/** Leaves only — for anything that books money rather than budgets it. */
export function leafCostCodeChoices(
  choices: OpsCostCodeChoice[],
): OpsCostCodeChoice[] {
  return choices.filter((choice) => !choice.isPhase);
}

/** The form value that preselects an already-saved cost code. */
export function costCodeChoiceValue(costCodeId: string | null | undefined) {
  return costCodeId ? `node:${costCodeId}` : "";
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Empty string → null, so an unset <select> means "not coded" rather than
 * "invalid". Anything else must be a well-formed node: or lib: reference.
 */
export const optionalCostCodeSelectionSchema = z
  .string()
  .trim()
  .default("")
  .transform((value) => (value.length > 0 ? value : null))
  .refine(
    (value) =>
      value === null ||
      ((value.startsWith("node:") || value.startsWith("lib:")) &&
        UUID_PATTERN.test(value.slice(value.indexOf(":") + 1))),
    { message: "Select a valid cost code." },
  );

/**
 * Find or create the project's default phase. Reused rather than recreated, so
 * a project that already has a "GEN" phase from the backfill keeps it (name and
 * all) instead of gaining a near-duplicate.
 */
async function ensureDefaultPhase(
  siteId: string,
  actorUserId: string | null,
): Promise<{ id: string; path: string }> {
  const supabase = getOpsSupabaseServiceClient();

  const { data: existing, error: existingError } = await supabase
    .from("project_cost_codes")
    .select("id, path")
    .eq("site_id", siteId)
    .eq("code", DEFAULT_PHASE_CODE)
    .is("parent_id", null)
    .maybeSingle<{ id: string; path: string }>();

  if (existingError) {
    throw existingError;
  }
  if (existing) {
    return existing;
  }

  const { data: created, error: createError } = await supabase
    .from("project_cost_codes")
    .insert({
      site_id: siteId,
      parent_id: null,
      library_code_id: null,
      code: DEFAULT_PHASE_CODE,
      path: DEFAULT_PHASE_CODE,
      name: DEFAULT_PHASE_NAME,
      created_by: actorUserId,
      sort_order: 0,
    })
    .select("id, path")
    .single<{ id: string; path: string }>();

  if (created) {
    return created;
  }

  // Lost a race against a concurrent provision: the (site_id, path) unique
  // index is the arbiter and the other writer won, so read its row rather than
  // failing a request whose only sin was being second.
  if (createError?.code === "23505") {
    const { data: raced } = await supabase
      .from("project_cost_codes")
      .select("id, path")
      .eq("site_id", siteId)
      .eq("code", DEFAULT_PHASE_CODE)
      .is("parent_id", null)
      .maybeSingle<{ id: string; path: string }>();
    if (raced) {
      return raced;
    }
  }

  throw createError ?? new Error("Could not create the default phase for this project.");
}

/**
 * Return the project's node for a library code, creating it under the default
 * phase on first use.
 *
 * This is the runtime equivalent of what the backfill migration did once, and
 * it is what turns "go and build a work breakdown first" into "pick Concrete
 * works from the list".
 */
export async function ensureProjectCostCodeForLibraryCode(input: {
  siteId: string;
  libraryCodeId: string;
  actorUserId: string | null;
}): Promise<{ id: string; path: string } | { error: string }> {
  const supabase = getOpsSupabaseServiceClient();

  const { data: library, error: libraryError } = await supabase
    .from("cost_code_library")
    .select("id, code, name, is_active")
    .eq("id", input.libraryCodeId)
    .maybeSingle<{ id: string; code: string; name: string; is_active: boolean }>();

  if (libraryError) {
    throw libraryError;
  }
  if (!library) {
    return { error: "That cost code is not in the company library." };
  }
  if (!library.is_active) {
    return { error: `Cost code ${library.code} is deactivated and cannot be used.` };
  }

  // Already on the project under ANY phase? Reuse it. Matching on the library
  // code rather than the path means a project that files 32.20 under "P1" is
  // not given a second copy under "GEN".
  const { data: existing, error: existingError } = await supabase
    .from("project_cost_codes")
    .select("id, path")
    .eq("site_id", input.siteId)
    .eq("library_code_id", library.id)
    .eq("is_active", true)
    .order("path", { ascending: true })
    .limit(1)
    .maybeSingle<{ id: string; path: string }>();

  if (existingError) {
    throw existingError;
  }
  if (existing) {
    return existing;
  }

  const phase = await ensureDefaultPhase(input.siteId, input.actorUserId);
  const path = `${phase.path}.${library.code}`;

  const { data: created, error: createError } = await supabase
    .from("project_cost_codes")
    .insert({
      site_id: input.siteId,
      parent_id: phase.id,
      library_code_id: library.id,
      code: library.code,
      path,
      name: library.name,
      created_by: input.actorUserId,
    })
    .select("id, path")
    .single<{ id: string; path: string }>();

  if (created) {
    return created;
  }

  if (createError?.code === "23505") {
    const { data: raced } = await supabase
      .from("project_cost_codes")
      .select("id, path")
      .eq("site_id", input.siteId)
      .eq("path", path)
      .maybeSingle<{ id: string; path: string }>();
    if (raced) {
      return raced;
    }
  }

  throw createError ?? new Error("Could not add that cost code to the project.");
}

export type CostCodeResolution =
  | { ok: true; costCodeId: string | null }
  | { ok: false; message: string };

/**
 * Turn a submitted picker value into a project cost code id, provisioning the
 * node if the user chose a library code the project does not use yet.
 *
 * The site check is a correctness guard, not a security one (the WBS is
 * deliberately world-readable). What it stops is a stale form — a picker
 * rendered for one site and submitted after the record moved — silently
 * charging another project's cost code, which no downstream report could
 * detect.
 */
export async function resolveOpsCostCodeSelection(input: {
  selection: string | null;
  siteId: string | null;
  actorUserId: string | null;
  /** Reject phase nodes. True for anything that books spend. */
  leafOnly?: boolean;
}): Promise<CostCodeResolution> {
  if (!input.selection) {
    return { ok: true, costCodeId: null };
  }
  if (!input.siteId) {
    return {
      ok: false,
      message: "A cost code belongs to a project, so it cannot be set on a record with no site.",
    };
  }

  const separator = input.selection.indexOf(":");
  const kind = input.selection.slice(0, separator);
  const id = input.selection.slice(separator + 1);

  if (kind === "lib") {
    const provisioned = await ensureProjectCostCodeForLibraryCode({
      siteId: input.siteId,
      libraryCodeId: id,
      actorUserId: input.actorUserId,
    });
    if ("error" in provisioned) {
      return { ok: false, message: provisioned.error };
    }
    // Provisioned nodes are always leaves, so leafOnly needs no further check.
    return { ok: true, costCodeId: provisioned.id };
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("project_cost_codes")
    .select("id, site_id, parent_id, path, is_active")
    .eq("id", id)
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
