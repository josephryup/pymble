import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

/**
 * The cost-code (WBS) spine read layer — Phase 1 of
 * docs/pymble-ops-project-finance-spine-audit.md.
 *
 * The point of the spine is that ONE key answers planned vs requested vs
 * committed vs actual at any level of any project. `rollUpCostCodeTree` is
 * that answer: it folds per-leaf amounts up through the phase nodes, so a
 * phase total is never a separately-maintained figure that can drift from the
 * leaves beneath it.
 *
 * The fold is pure and dependency-free so the roll-up arithmetic is testable
 * without a database — same pattern as boq-actuals.ts and finance-leaks.ts.
 */

export type OpsCostCodeKind =
  | "materials"
  | "labour"
  | "plant"
  | "subcontract"
  | "transport"
  | "preliminaries"
  | "other";

export type OpsCostCodeLibraryEntry = {
  id: string;
  code: string;
  name: string;
  division: string;
  kind: OpsCostCodeKind;
  gl_account_id: string | null;
  gl_account_code: string | null;
  gl_account_name: string | null;
  description: string;
  system_locked: boolean;
  is_active: boolean;
};

/** A WBS node as stored: phase (parent_id null) or trade leaf. */
export type OpsProjectCostCodeRow = {
  id: string;
  site_id: string;
  parent_id: string | null;
  library_code_id: string | null;
  code: string;
  path: string;
  name: string;
  sort_order: number;
  is_active: boolean;
};

/** Money already booked against a single leaf, by lifecycle station. */
export type CostCodeAmounts = {
  budgeted: number;
  committed: number;
  actual: number;
};

export const EMPTY_COST_CODE_AMOUNTS: CostCodeAmounts = {
  budgeted: 0,
  committed: 0,
  actual: 0,
};

export type OpsCostCodeNode = {
  id: string;
  parentId: string | null;
  code: string;
  path: string;
  name: string;
  isPhase: boolean;
  isActive: boolean;
  /** Booked directly against this node. Always zero for a phase node. */
  own: CostCodeAmounts;
  /** This node plus every descendant — what a phase total means. */
  total: CostCodeAmounts;
  children: OpsCostCodeNode[];
};

function toNumber(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function addAmounts(a: CostCodeAmounts, b: CostCodeAmounts): CostCodeAmounts {
  return {
    budgeted: roundMoney(a.budgeted + b.budgeted),
    committed: roundMoney(a.committed + b.committed),
    actual: roundMoney(a.actual + b.actual),
  };
}

/**
 * Build the phase → leaf tree and roll amounts upward.
 *
 * Phase nodes hold no money of their own by construction (only leaves carry a
 * library code, and only leaves are referenced by documents), so a phase's
 * `total` is purely the sum beneath it and can never disagree with its leaves.
 *
 * Orphans — a leaf whose parent is missing or inactive-and-pruned — are
 * surfaced at the root rather than dropped. Silently losing money from a
 * roll-up is the exact class of bug this spine exists to prevent.
 */
export function rollUpCostCodeTree(
  nodes: OpsProjectCostCodeRow[],
  amountsByNodeId: Map<string, CostCodeAmounts>,
): { roots: OpsCostCodeNode[]; totals: CostCodeAmounts } {
  const byId = new Map<string, OpsCostCodeNode>();

  for (const row of nodes) {
    const own = amountsByNodeId.get(row.id) ?? EMPTY_COST_CODE_AMOUNTS;
    byId.set(row.id, {
      id: row.id,
      parentId: row.parent_id,
      code: row.code,
      path: row.path,
      name: row.name,
      isPhase: row.parent_id === null,
      isActive: row.is_active,
      // A phase node must never report money as its OWN: only leaves carry a
      // library code and only leaves are referenced by documents, so
      // "phase.own" would be meaningless. But if a document does somehow point
      // at a phase, that amount must still reach `total` — see fold(), which
      // reads the raw map rather than `own` for exactly this reason. Dropping
      // it would hide real money, which is the bug class this spine exists to
      // prevent.
      own: row.parent_id === null ? EMPTY_COST_CODE_AMOUNTS : own,
      total: EMPTY_COST_CODE_AMOUNTS,
      children: [],
    });
  }

  const roots: OpsCostCodeNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parentId ? byId.get(node.parentId) : null;
    if (parent) {
      parent.children.push(node);
    } else {
      // Covers real phase nodes AND orphaned leaves — see the note above.
      roots.push(node);
    }
  }

  // Depth-first so a child's total is final before it folds into its parent.
  // Seeded from the RAW map, not from `node.own`, so an amount mis-pointed at
  // a phase node still lands in the total instead of vanishing.
  function fold(node: OpsCostCodeNode): CostCodeAmounts {
    let total = amountsByNodeId.get(node.id) ?? EMPTY_COST_CODE_AMOUNTS;
    for (const child of node.children) {
      total = addAmounts(total, fold(child));
    }
    node.total = total;
    node.children.sort(
      (a, b) => a.code.localeCompare(b.code) || a.name.localeCompare(b.name),
    );
    return total;
  }

  let totals = EMPTY_COST_CODE_AMOUNTS;
  for (const root of roots) {
    totals = addAmounts(totals, fold(root));
  }

  roots.sort((a, b) => a.code.localeCompare(b.code) || a.name.localeCompare(b.name));

  return { roots, totals };
}

/** Flatten a rolled-up tree for table rendering, parents before children. */
export function flattenCostCodeTree(
  roots: OpsCostCodeNode[],
): Array<OpsCostCodeNode & { depth: number }> {
  const out: Array<OpsCostCodeNode & { depth: number }> = [];
  function walk(node: OpsCostCodeNode, depth: number) {
    out.push({ ...node, depth });
    for (const child of node.children) {
      walk(child, depth + 1);
    }
  }
  for (const root of roots) {
    walk(root, 0);
  }
  return out;
}

/** The company library, for pickers and for Finance's maintenance screen. */
export async function fetchOpsCostCodeLibrary(options?: {
  includeInactive?: boolean;
}): Promise<OpsCostCodeLibraryEntry[]> {
  const supabase = getOpsSupabaseServiceClient();

  let query = supabase
    .from("cost_code_library")
    .select(
      "id, code, name, division, kind, gl_account_id, description, system_locked, is_active, gl_account:chart_of_accounts!cost_code_library_gl_account_id_fkey(code, name)",
    )
    .order("division", { ascending: true })
    .order("code", { ascending: true });

  if (!options?.includeInactive) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  type Row = Omit<
    OpsCostCodeLibraryEntry,
    "gl_account_code" | "gl_account_name"
  > & {
    gl_account: { code: string; name: string } | { code: string; name: string }[] | null;
  };

  return ((data ?? []) as unknown as Row[]).map((row) => {
    const account = Array.isArray(row.gl_account) ? (row.gl_account[0] ?? null) : row.gl_account;
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      division: row.division,
      kind: row.kind,
      gl_account_id: row.gl_account_id,
      gl_account_code: account?.code ?? null,
      gl_account_name: account?.name ?? null,
      description: row.description,
      system_locked: row.system_locked,
      is_active: row.is_active,
    };
  });
}

/** Raw WBS rows for one site, phase nodes and leaves together. */
export async function fetchOpsProjectCostCodes(
  siteId: string,
  options?: { includeInactive?: boolean },
): Promise<OpsProjectCostCodeRow[]> {
  const supabase = getOpsSupabaseServiceClient();

  let query = supabase
    .from("project_cost_codes")
    .select("id, site_id, parent_id, library_code_id, code, path, name, sort_order, is_active")
    .eq("site_id", siteId)
    .order("sort_order", { ascending: true })
    .order("path", { ascending: true });

  if (!options?.includeInactive) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  return (data ?? []) as OpsProjectCostCodeRow[];
}

/**
 * The site's cost position by WBS node: budgeted from project_budget_lines,
 * committed and actual from project_cost_entries.
 *
 * `committed` and `actual` map onto the cost-entry statuses that exist today
 * (committed / posted). When Phase 2 introduces the full lifecycle with relief
 * semantics, this is the one place that changes.
 */
export async function fetchOpsSiteCostCodePosition(siteId: string): Promise<{
  roots: OpsCostCodeNode[];
  totals: CostCodeAmounts;
}> {
  const supabase = getOpsSupabaseServiceClient();

  const [nodes, budgetLinesResult, costEntriesResult] = await Promise.all([
    fetchOpsProjectCostCodes(siteId, { includeInactive: true }),
    supabase
      .from("project_budget_lines")
      .select("cost_code_id, budgeted_amount, budget:project_budgets!inner(site_id, status)")
      .eq("budget.site_id", siteId)
      .in("budget.status", ["draft", "active", "locked"])
      .not("cost_code_id", "is", null),
    supabase
      .from("project_cost_entries")
      .select("cost_code_id, amount, status")
      .eq("site_id", siteId)
      .in("status", ["committed", "posted"])
      .not("cost_code_id", "is", null),
  ]);

  if (budgetLinesResult.error) {
    throw budgetLinesResult.error;
  }
  if (costEntriesResult.error) {
    throw costEntriesResult.error;
  }

  const amounts = new Map<string, CostCodeAmounts>();
  const bump = (nodeId: string, patch: Partial<CostCodeAmounts>) => {
    const current = amounts.get(nodeId) ?? { ...EMPTY_COST_CODE_AMOUNTS };
    amounts.set(nodeId, {
      budgeted: roundMoney(current.budgeted + (patch.budgeted ?? 0)),
      committed: roundMoney(current.committed + (patch.committed ?? 0)),
      actual: roundMoney(current.actual + (patch.actual ?? 0)),
    });
  };

  for (const row of (budgetLinesResult.data ?? []) as Array<{
    cost_code_id: string;
    budgeted_amount: number | string | null;
  }>) {
    bump(row.cost_code_id, { budgeted: toNumber(row.budgeted_amount) });
  }

  for (const row of (costEntriesResult.data ?? []) as Array<{
    cost_code_id: string;
    amount: number | string | null;
    status: string;
  }>) {
    const amount = toNumber(row.amount);
    if (row.status === "posted") {
      bump(row.cost_code_id, { actual: amount });
    } else {
      bump(row.cost_code_id, { committed: amount });
    }
  }

  return rollUpCostCodeTree(nodes, amounts);
}

/**
 * Resolve the WBS leaf a material request item should charge, given the
 * schedule line it fulfils (if any). Returns the site's unplanned/contingency
 * leaf as the fallback, which is what makes off-schedule spend visible rather
 * than untracked (audit §4.4).
 *
 * Note what this does NOT do: guess a category by majority vote across a
 * request's items (audit D3). Every item resolves independently, because
 * cost_code_id lives on the item.
 */
export async function resolveCostCodeForScheduleLine(input: {
  siteId: string;
  boqLineItemId: string | null;
}): Promise<string | null> {
  const supabase = getOpsSupabaseServiceClient();

  if (input.boqLineItemId) {
    const { data, error } = await supabase
      .from("boq_line_items")
      .select("cost_code_id")
      .eq("id", input.boqLineItemId)
      .maybeSingle<{ cost_code_id: string | null }>();
    if (error) {
      throw error;
    }
    if (data?.cost_code_id) {
      return data.cost_code_id;
    }
  }

  // Fall back to the site's unplanned/contingency leaf (library code 90.90).
  const { data: fallback, error: fallbackError } = await supabase
    .from("project_cost_codes")
    .select("id, library:cost_code_library!inner(code)")
    .eq("site_id", input.siteId)
    .eq("library.code", "90.90")
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (fallbackError) {
    throw fallbackError;
  }

  return fallback?.id ?? null;
}
