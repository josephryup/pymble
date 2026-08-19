import { recordOpsAuditEvent } from "@/lib/ops/audit";
import {
  CONTINGENCY_LIBRARY_CODE,
  TRANSPORT_LIBRARY_CODE,
  ensureProjectCostCodeForLibraryCode,
  resolveOpsCostCodeSelection,
} from "@/lib/ops/cost-code-picker";
import {
  buildScheduleLineMatcher,
  type ScheduleLineForMatch,
} from "@/lib/ops/material-schedule-match";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type { OpsMaterialRequestScope } from "@/lib/ops/types";

/**
 * Working out where spend belongs, instead of asking.
 *
 * ── The problem this replaces (workflow audit F6, F7) ─────────────────────
 * A cost code could only arrive three ways, and all three failed in practice:
 *
 *   • Someone picked one from a dropdown. 107 of 491 line items have no code,
 *     so plainly nobody does this reliably — and on six of eleven sites the
 *     dropdown had nothing in it to pick.
 *   • The CSV importer matched item names to schedule lines. Real, but it only
 *     ran on imports, and only against schedules with status `issued` — of
 *     which the database holds exactly one, carrying zero lines.
 *   • Submit-time stamping filled the gaps. Too late to be useful: the request
 *     was already built and reviewed before anyone learned it could not be
 *     charged anywhere.
 *
 * So the code is now derived at WRITE time, from the most specific evidence
 * available, falling back until something answers. A person is asked only when
 * the system genuinely cannot tell — which, with a contingency leaf as the
 * floor, is never for a site-scoped request.
 */

/**
 * Schedule statuses whose lines may be matched against.
 *
 * Deliberately wider than the budget gate. Generating a BUDGET from a schedule
 * must wait until it is issued — that is a financial commitment. But MATCHING
 * an item to a schedule line only records which planned work the item is for,
 * and a schedule still out for pricing already knows that. Restricting
 * matching to `issued` gave the system exactly one usable schedule, with no
 * lines on it, which is why all 491 line items are unlinked (audit F6).
 */
export const MATCHABLE_SCHEDULE_STATUSES = ["issued", "priced"] as const;

export type CostCodeSource =
  | "explicit"
  | "schedule_line"
  | "budget_line"
  | "contingency"
  | "cost_centre"
  | "none";

export type DerivedCostCode = {
  costCodeId: string | null;
  /** Set for requests with no site — company overhead goes to a cost centre. */
  costCentreId: string | null;
  source: CostCodeSource;
  /** The schedule line this item was matched to, when matching found one. */
  boqLineItemId: string | null;
  /** Plain-language note for the audit trail. */
  note: string;
};

/** Which cost centre carries a request that belongs to no project. */
const SCOPE_COST_CENTRE_CODE: Record<Exclude<OpsMaterialRequestScope, "site">, string> = {
  it: "IT",
  general: "HO",
};

/**
 * The site's contingency leaf, provisioned on first use.
 *
 * This is the floor of the derivation chain and the reason it can always
 * answer. Charging contingency is not a good outcome — but it is a TRUE one,
 * and it is enormously better than `null`, which is invisible to the
 * availability bands, the roll-up and every variance report at once.
 */
export async function ensureSiteContingencyCostCode(
  siteId: string,
  actorUserId: string | null,
): Promise<string | null> {
  return ensureSiteLibraryCostCode(siteId, CONTINGENCY_LIBRARY_CODE, actorUserId);
}

/** The site's transport leaf, provisioned on first use. */
export async function ensureSiteTransportCostCode(
  siteId: string,
  actorUserId: string | null,
): Promise<string | null> {
  return ensureSiteLibraryCostCode(siteId, TRANSPORT_LIBRARY_CODE, actorUserId);
}

/**
 * Get, or provision on first use, the site's node for one library code.
 *
 * Provisioning is deliberately open: the code is one Finance already approved
 * into the library, filed under the project's default phase. It is *usage*,
 * not taxonomy — and the alternative is the null that left six of eleven
 * sites with nothing to charge at all.
 */
export async function ensureSiteLibraryCostCode(
  siteId: string,
  libraryCode: string,
  actorUserId: string | null,
): Promise<string | null> {
  const supabase = getOpsSupabaseServiceClient();

  const { data: library } = await supabase
    .from("cost_code_library")
    .select("id")
    .eq("code", libraryCode)
    .maybeSingle<{ id: string }>();

  if (!library) {
    return null;
  }

  const provisioned = await ensureProjectCostCodeForLibraryCode({
    siteId,
    libraryCodeId: library.id,
    actorUserId,
  });

  return "error" in provisioned ? null : provisioned.id;
}

/** The cost centre a non-site request belongs to, by scope. */
export async function resolveOpsCostCentreForScope(
  scope: OpsMaterialRequestScope,
): Promise<string | null> {
  if (scope === "site") {
    return null;
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data } = await supabase
    .from("cost_centres")
    .select("id")
    .eq("code", SCOPE_COST_CENTRE_CODE[scope])
    .eq("is_active", true)
    .maybeSingle<{ id: string }>();

  return data?.id ?? null;
}

/**
 * The site's matchable schedule lines, ready for `buildScheduleLineMatcher`.
 *
 * Returns null when the site has no matchable schedule at all, so callers can
 * tell "nothing to match against" apart from "matched nothing".
 */
export async function fetchMatchableScheduleLines(
  siteId: string,
): Promise<ScheduleLineForMatch[] | null> {
  const supabase = getOpsSupabaseServiceClient();

  const { data: docs } = await supabase
    .from("boq_documents")
    .select("id")
    .eq("site_id", siteId)
    .in("status", MATCHABLE_SCHEDULE_STATUSES)
    .is("superseded_at", null)
    .is("archived_at", null)
    .is("deleted_at", null);

  const docIds = ((docs ?? []) as Array<{ id: string }>).map((row) => row.id);
  if (docIds.length === 0) {
    return null;
  }

  const { data: lines } = await supabase
    .from("boq_line_items")
    .select("id, description, unit")
    .in("boq_id", docIds);

  const rows = (lines ?? []) as ScheduleLineForMatch[];
  return rows.length > 0 ? rows : null;
}

/**
 * Work out the cost code for one material request line, at the moment it is
 * written.
 *
 * The chain, most specific first:
 *
 *   1. What the user explicitly picked. Always wins — deriving must never
 *      override a deliberate choice.
 *   2. The schedule line the item is linked to, or matches by name. This is
 *      the real answer: it says which planned work the spend is for.
 *   3. The budget line the request already resolved to.
 *   4. The site's contingency leaf. Not a good home, but a true one, and it
 *      makes off-schedule spend VISIBLE rather than untracked.
 *
 * For a request with no site (IT and general purchasing) there is no project
 * WBS to charge, so the answer is a cost centre instead — see `costCentreId`.
 * The old behaviour was to leave everything null while the screen promised the
 * spend would "charge the unplanned / contingency budget", a destination that
 * cannot exist without a site (audit F7).
 */
export async function deriveMaterialRequestItemCostCode(input: {
  actorUserId: string | null;
  /** The picker value the user submitted, if any. */
  explicitSelection: string | null;
  /** A schedule line the caller already knows about. */
  boqLineItemId: string | null;
  itemName: string;
  unit: string;
  requestId: string;
  scope: OpsMaterialRequestScope;
  siteId: string | null;
}): Promise<DerivedCostCode | { error: string }> {
  // 1. An explicit choice is authoritative.
  if (input.explicitSelection) {
    const resolved = await resolveOpsCostCodeSelection({
      selection: input.explicitSelection,
      siteId: input.siteId,
      actorUserId: input.actorUserId,
      leafOnly: true,
    });
    if (!resolved.ok) {
      return { error: resolved.message };
    }
    if (resolved.costCodeId) {
      return {
        costCodeId: resolved.costCodeId,
        costCentreId: null,
        source: "explicit",
        boqLineItemId: input.boqLineItemId,
        note: "Cost code chosen on the line.",
      };
    }
  }

  // No project, no project cost code. Company overhead belongs to a cost
  // centre, which has its own GL account and its own reporting.
  if (!input.siteId) {
    const costCentreId = await resolveOpsCostCentreForScope(input.scope).catch(() => null);
    return {
      costCodeId: null,
      costCentreId,
      source: costCentreId ? "cost_centre" : "none",
      boqLineItemId: null,
      note: costCentreId
        ? `Charged to the ${input.scope === "it" ? "IT" : "Head Office"} cost centre — this request is not against a project.`
        : "No project and no cost centre matched, so this spend is uncharged.",
    };
  }

  const supabase = getOpsSupabaseServiceClient();

  // 2. The schedule line — given, or found by matching the item name.
  let scheduleLineId = input.boqLineItemId;
  let matchedByName = false;

  if (!scheduleLineId) {
    const lines = await fetchMatchableScheduleLines(input.siteId).catch(() => null);
    if (lines) {
      const match = buildScheduleLineMatcher(lines)({
        itemName: input.itemName,
        unit: input.unit,
      });
      if (match) {
        scheduleLineId = match.lineId;
        matchedByName = true;
      }
    }
  }

  if (scheduleLineId) {
    const { data: line } = await supabase
      .from("boq_line_items")
      .select("cost_code_id")
      .eq("id", scheduleLineId)
      .maybeSingle<{ cost_code_id: string | null }>();

    if (line?.cost_code_id) {
      return {
        costCodeId: line.cost_code_id,
        costCentreId: null,
        source: "schedule_line",
        boqLineItemId: scheduleLineId,
        note: matchedByName
          ? "Matched to a line on the site's material schedule by name, and charged where that line is charged."
          : "Charged where its material schedule line is charged.",
      };
    }
  }

  // 3. The budget line the request already draws against.
  const { data: request } = await supabase
    .from("material_requests")
    .select("budget_line_id")
    .eq("id", input.requestId)
    .maybeSingle<{ budget_line_id: string | null }>();

  if (request?.budget_line_id) {
    const { data: budgetLine } = await supabase
      .from("project_budget_lines")
      .select("cost_code_id")
      .eq("id", request.budget_line_id)
      .maybeSingle<{ cost_code_id: string | null }>();

    if (budgetLine?.cost_code_id) {
      return {
        costCodeId: budgetLine.cost_code_id,
        costCentreId: null,
        source: "budget_line",
        boqLineItemId: scheduleLineId,
        note: "Charged to the budget line this request draws against.",
      };
    }
  }

  // 4. Contingency — the floor, so the answer is never "nowhere".
  const contingencyId = await ensureSiteContingencyCostCode(
    input.siteId,
    input.actorUserId,
  ).catch(() => null);

  return {
    costCodeId: contingencyId,
    costCentreId: null,
    source: contingencyId ? "contingency" : "none",
    boqLineItemId: scheduleLineId,
    note: contingencyId
      ? "Not on the material schedule and not on a budget line, so it charges the site's unplanned / contingency budget."
      : "This site has no cost codes yet, so the spend is uncharged.",
  };
}

/**
 * Re-run the derivation chain over items that are already in the system.
 *
 * ── Why this is needed (workflow audit, Phase 2 follow-up) ────────────────
 * Derivation happens when a line is WRITTEN, which is the right moment — but
 * it means the chain never reaches backwards. On 19 Aug 2026 that mattered a
 * great deal: 465 of 468 site line items charge the contingency leaf, not
 * because they belong there but because the material schedules are empty and
 * there was nothing to match them against.
 *
 * When the schedules are populated, those items will still be sitting on
 * contingency unless something re-asks the question. This is that something.
 *
 * Deliberately narrow: it only moves items that are currently on the
 * CONTINGENCY leaf, and only when the chain now finds a real schedule line.
 * An item somebody coded deliberately is never touched, and an item the chain
 * still cannot place is left where it is rather than shuffled sideways.
 */
export async function rederiveContingencyCodedItems(input: {
  actorUserId: string;
  siteId?: string;
  /** Report what would change without changing it. */
  dryRun?: boolean;
}): Promise<{
  examined: number;
  moved: number;
  unchanged: number;
  moves: Array<{ itemName: string; requestNumber: string; to: string }>;
}> {
  const supabase = getOpsSupabaseServiceClient();

  const contingencyIds = new Set<string>();
  const siteByCostCode = new Map<string, string>();

  const { data: nodes } = await supabase
    .from("project_cost_codes")
    .select("id, site_id, library:cost_code_library!project_cost_codes_library_code_id_fkey(code)");

  for (const row of (nodes ?? []) as unknown as Array<{
    id: string;
    site_id: string;
    library: { code: string } | { code: string }[] | null;
  }>) {
    const library = Array.isArray(row.library) ? (row.library[0] ?? null) : row.library;
    if (library?.code === CONTINGENCY_LIBRARY_CODE) {
      contingencyIds.add(row.id);
      siteByCostCode.set(row.id, row.site_id);
    }
  }

  if (contingencyIds.size === 0) {
    return { examined: 0, moved: 0, unchanged: 0, moves: [] };
  }

  let query = supabase
    .from("material_request_items")
    .select(
      "id, item_name, unit, cost_code_id, boq_line_item_id, request:material_requests!inner(id, request_number, site_id, scope, status)",
    )
    .in("cost_code_id", Array.from(contingencyIds))
    .is("boq_line_item_id", null);

  if (input.siteId) {
    query = query.eq("request.site_id", input.siteId);
  }

  const { data: items } = await query;

  type Row = {
    id: string;
    item_name: string;
    unit: string;
    cost_code_id: string | null;
    request: {
      id: string;
      request_number: string;
      site_id: string | null;
      scope: OpsMaterialRequestScope;
      status: string;
    };
  };

  const rows = (items ?? []) as unknown as Row[];
  const moves: Array<{ itemName: string; requestNumber: string; to: string }> = [];
  let moved = 0;

  // Matchers are per site and expensive to build, so build each once.
  const matcherBySite = new Map<
    string,
    ReturnType<typeof buildScheduleLineMatcher> | null
  >();

  for (const row of rows) {
    const siteId = row.request.site_id;
    if (!siteId) {
      continue;
    }

    if (!matcherBySite.has(siteId)) {
      const lines = await fetchMatchableScheduleLines(siteId).catch(() => null);
      matcherBySite.set(siteId, lines ? buildScheduleLineMatcher(lines) : null);
    }
    const matcher = matcherBySite.get(siteId);
    if (!matcher) {
      continue;
    }

    const match = matcher({ itemName: row.item_name, unit: row.unit });
    if (!match) {
      continue;
    }

    const { data: line } = await supabase
      .from("boq_line_items")
      .select("cost_code_id, description")
      .eq("id", match.lineId)
      .maybeSingle<{ cost_code_id: string | null; description: string }>();

    if (!line?.cost_code_id || line.cost_code_id === row.cost_code_id) {
      continue;
    }

    moves.push({
      itemName: row.item_name,
      requestNumber: row.request.request_number,
      to: line.description,
    });

    if (!input.dryRun) {
      await supabase
        .from("material_request_items")
        .update({ cost_code_id: line.cost_code_id, boq_line_item_id: match.lineId })
        .eq("id", row.id);
    }
    moved += 1;
  }

  if (!input.dryRun && moved > 0) {
    await recordOpsAuditEvent({
      action: "cost_code.rederived_from_schedule",
      actorUserId: input.actorUserId,
      entityId: null,
      entityType: "project_cost_code",
      metadata: { examined: rows.length, moved, site_id: input.siteId ?? null },
      moduleKey: "material_requests",
      sourceId: null,
      sourceTable: "material_request_items",
      summary: `Re-derived ${moved} contingency-coded item(s) onto their material schedule lines`,
    }).catch(() => null);
  }

  return {
    examined: rows.length,
    moved,
    unchanged: rows.length - moved,
    moves: moves.slice(0, 20),
  };
}
