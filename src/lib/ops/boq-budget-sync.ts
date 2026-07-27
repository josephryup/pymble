import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type { OpsProjectBudgetStatus } from "@/lib/ops/types";

// Generates/syncs a project budget from an issued material schedule (BOQ):
// one project_budget_lines row per distinct line category (summed
// budgeted_total), plus one dedicated "transport" line (summed
// estimated_transport_cost across every line, regardless of that line's own
// category — transport is a cross-cutting cost, not a phase). Idempotent, so
// re-issuing a new BOQ version re-syncs cleanly.
//
// Ownership (audit B4/B3): every line this module creates is stamped
// source = 'boq', and every lookup filters on it. Finance's own lines
// (source = 'manual') are invisible here — they are never matched, never
// overwritten, and their categories may repeat freely. A partial unique index
// on (budget_id, category) where source = 'boq' guarantees the lookup below
// matches at most one row.

const TRANSPORT_CATEGORY = "transport";
const UNPLANNED_CATEGORY = "unplanned";
const BOQ_LINE_SOURCE = "boq";

type BoqDocumentForSync = {
  id: string;
  site_id: string;
  title: string;
};

type BoqLineForSync = {
  category: string;
  budgeted_total: number | string;
  estimated_transport_cost: number | string;
};

type ProjectBudgetForSync = {
  id: string;
  status: OpsProjectBudgetStatus;
};

type BudgetLineForSync = {
  id: string;
  category: string;
  line_number: number;
};

function normalizeMoney(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

function labelForCategory(category: string) {
  return category
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function costCodeForCategory(category: string) {
  return category.toUpperCase().slice(0, 20);
}

async function findOrCreateSiteBudget(
  siteId: string,
  boqTitle: string,
  actorUserId: string,
): Promise<ProjectBudgetForSync> {
  const supabase = getOpsSupabaseServiceClient();

  const { data: existing, error: existingError } = await supabase
    .from("project_budgets")
    .select("id, status")
    .eq("site_id", siteId)
    .in("status", ["draft", "active"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<ProjectBudgetForSync>();

  if (existingError) {
    throw existingError;
  }

  if (existing) {
    return existing;
  }

  const { data: created, error: createError } = await supabase
    .from("project_budgets")
    .insert({
      site_id: siteId,
      title: `Budget generated from ${boqTitle}`,
      description: "Auto-generated from the issued material schedule (Bill of Quantities).",
      status: "draft",
      created_by: actorUserId,
    })
    .select("id, status")
    .single<ProjectBudgetForSync>();

  if (createError || !created) {
    throw createError ?? new Error("Could not create a project budget for this site.");
  }

  return created;
}

/**
 * Ensures the site's active/draft budget has a line for the given category,
 * creating the budget and/or the line on first use if neither exists yet
 * (budgeted_amount starts at 0 — this is a lazy placeholder, not a planning
 * figure). Used for the "unplanned/contingency" fallback (ad-hoc material
 * requests with no linked schedule line) and for the dedicated "transport"
 * line when a material request records transport cost before any schedule
 * has ever been issued for the site.
 */
export async function ensureBudgetLineForCategory(
  siteId: string,
  category: string,
  actorUserId: string,
  description?: string,
): Promise<{ budgetId: string; budgetLineId: string }> {
  const budget = await findOrCreateSiteBudget(siteId, "Unplanned spend", actorUserId);
  const lineId = await upsertBudgetLineByCategory(budget.id, category, 0, actorUserId, {
    description,
    // Never shrink an existing line's budgeted_amount back to zero; only
    // create it if missing.
    updateAmount: false,
  });
  return { budgetId: budget.id, budgetLineId: lineId };
}

export async function ensureUnplannedBudgetLine(siteId: string, actorUserId: string) {
  return ensureBudgetLineForCategory(
    siteId,
    UNPLANNED_CATEGORY,
    actorUserId,
    "Unplanned / contingency — requests not tied to a planned schedule line",
  );
}

export async function ensureTransportBudgetLine(siteId: string, actorUserId: string) {
  return ensureBudgetLineForCategory(
    siteId,
    TRANSPORT_CATEGORY,
    actorUserId,
    "Transport — planning estimate",
  );
}

async function upsertBudgetLineByCategory(
  budgetId: string,
  category: string,
  budgetedAmount: number,
  actorUserId: string,
  options: { description?: string; updateAmount?: boolean } = {},
): Promise<string> {
  const supabase = getOpsSupabaseServiceClient();
  const updateAmount = options.updateAmount ?? true;

  const { data: existing, error: existingError } = await supabase
    .from("project_budget_lines")
    .select("id, category, line_number")
    .eq("budget_id", budgetId)
    .eq("category", category)
    .eq("source", BOQ_LINE_SOURCE)
    .maybeSingle<BudgetLineForSync>();

  if (existingError) {
    throw existingError;
  }

  if (existing) {
    if (updateAmount) {
      const { error: updateError } = await supabase
        .from("project_budget_lines")
        .update({ budgeted_amount: budgetedAmount })
        .eq("id", existing.id);
      if (updateError) {
        throw updateError;
      }
    }
    return existing.id;
  }

  const { data: lastLine, error: lastLineError } = await supabase
    .from("project_budget_lines")
    .select("line_number")
    .eq("budget_id", budgetId)
    .order("line_number", { ascending: false })
    .limit(1)
    .maybeSingle<{ line_number: number }>();

  if (lastLineError) {
    throw lastLineError;
  }

  const lineNumber = (lastLine?.line_number ?? 0) + 1;
  const description =
    options.description ??
    (category === TRANSPORT_CATEGORY
      ? "Transport — planning estimate"
      : `BOQ — ${labelForCategory(category)}`);

  const { data: created, error: createError } = await supabase
    .from("project_budget_lines")
    .insert({
      budget_id: budgetId,
      line_number: lineNumber,
      cost_code: costCodeForCategory(category),
      category,
      description,
      budgeted_amount: budgetedAmount,
      source: BOQ_LINE_SOURCE,
      created_by: actorUserId,
    })
    .select("id")
    .single<{ id: string }>();

  if (createError || !created) {
    throw createError ?? new Error(`Could not create the "${category}" budget line.`);
  }

  return created.id;
}

/**
 * Thrown when the site's budget is locked. Callers surface this rather than
 * silently editing a budget Finance has closed (audit B1/B5).
 */
export class LockedBudgetError extends Error {
  constructor(public readonly budgetId: string) {
    super("The site budget is locked, so it was not updated from this schedule.");
    this.name = "LockedBudgetError";
  }
}

export async function syncProjectBudgetFromBoq(boqId: string, actorUserId: string) {
  const supabase = getOpsSupabaseServiceClient();

  const { data: document, error: documentError } = await supabase
    .from("boq_documents")
    .select("id, site_id, title")
    .eq("id", boqId)
    .maybeSingle<BoqDocumentForSync>();

  if (documentError) {
    throw documentError;
  }
  if (!document) {
    throw new Error("Material schedule was not found.");
  }

  const { data: lineRows, error: lineError } = await supabase
    .from("boq_line_items")
    .select("category, budgeted_total, estimated_transport_cost")
    .eq("boq_id", boqId);

  if (lineError) {
    throw lineError;
  }

  const lines = (lineRows ?? []) as BoqLineForSync[];

  const budget = await findOrCreateSiteBudget(document.site_id, document.title, actorUserId);

  // findOrCreateSiteBudget only matches draft/active budgets, but a budget can
  // be locked between issue and re-issue. Refuse rather than edit it.
  if (budget.status === "locked") {
    throw new LockedBudgetError(budget.id);
  }

  const totalsByCategory = new Map<string, number>();
  let transportTotal = 0;
  for (const line of lines) {
    const category = line.category || "general";
    totalsByCategory.set(
      category,
      (totalsByCategory.get(category) ?? 0) + normalizeMoney(line.budgeted_total),
    );
    transportTotal += normalizeMoney(line.estimated_transport_cost);
  }

  for (const [category, amount] of totalsByCategory) {
    await upsertBudgetLineByCategory(budget.id, category, amount, actorUserId);
  }

  // Always ensure the dedicated transport line exists once a schedule has
  // been issued, even if the current estimate is zero, so material requests
  // always have somewhere to resolve transport_budget_line_id to.
  await upsertBudgetLineByCategory(budget.id, TRANSPORT_CATEGORY, transportTotal, actorUserId);

  // A revision can drop a category entirely. Zero the schedule-owned lines it
  // no longer covers rather than deleting them — cost entries may already
  // reference the line, and a zeroed line still shows the overspend (audit B1).
  const liveCategories = new Set([...totalsByCategory.keys(), TRANSPORT_CATEGORY]);
  const { data: staleRows, error: staleError } = await supabase
    .from("project_budget_lines")
    .select("id, category")
    .eq("budget_id", budget.id)
    .eq("source", BOQ_LINE_SOURCE)
    .gt("budgeted_amount", 0);

  if (staleError) {
    throw staleError;
  }

  const staleIds = ((staleRows ?? []) as Array<{ id: string; category: string }>)
    .filter((row) => !liveCategories.has(row.category) && row.category !== UNPLANNED_CATEGORY)
    .map((row) => row.id);

  if (staleIds.length > 0) {
    const { error: zeroError } = await supabase
      .from("project_budget_lines")
      .update({ budgeted_amount: 0 })
      .in("id", staleIds);
    if (zeroError) {
      throw zeroError;
    }
  }

  const { error: linkError } = await supabase
    .from("boq_documents")
    .update({ budget_id: budget.id })
    .eq("id", boqId);

  if (linkError) {
    throw linkError;
  }

  return budget.id;
}
