import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type { OpsMaterialRequestStatus } from "@/lib/ops/types";

/**
 * Financial leak detector (project↔finance spine audit, Phase 0).
 *
 * Reconciles the request→budget→cost-ledger chain and reports every record
 * that fell out of it. The design goal: when every count here is zero,
 * nothing is leaking — which makes this panel the regression test for every
 * later phase of the spine work. Read-only; nothing here mutates.
 *
 * Built as a pure fold over plain row shapes (buildOpsFinanceLeakReport) so
 * the classification rules are testable without a database, mirroring
 * boq-actuals.ts.
 */

/** Statuses that mean the request is dead — never expected to carry money. */
const TERMINAL_DEAD_STATUSES = new Set<string>(["draft", "rejected", "cancelled"]);

/** Statuses that mean goods arrived, so a cost entry must exist by now. */
const COST_EXPECTED_STATUSES = new Set<string>(["delivered", "closed"]);

export type LeakMaterialRequestRow = {
  id: string;
  request_number: string;
  status: OpsMaterialRequestStatus;
  scope: string;
  site_id: string | null;
  budget_line_id: string | null;
};

export type LeakRequestItemRow = {
  request_id: string;
  estimated_total: number | string | null;
  actual_total: number | string | null;
};

export type LeakCostEntryRow = {
  material_request_id: string | null;
  budget_line_id: string | null;
  status: string;
  amount: number | string | null;
  site_id: string | null;
};

export type LeakBudgetRow = {
  id: string;
  site_id: string;
  status: string;
};

export type LeakBudgetLineRow = {
  budget_id: string;
  budgeted_amount: number | string | null;
  description?: string | null;
  category?: string | null;
};

export type LeakSiteRow = {
  id: string;
  code: string;
  name: string;
};

export type OpsFinanceLeakCheck = {
  key:
    | "requests_without_budget_line"
    | "arrived_without_cost_entry"
    | "cost_entries_without_budget_line"
    | "spend_without_funded_budget"
    | "multiple_open_budgets"
    | "duplicate_budget_lines";
  label: string;
  /** What a non-zero count means, in Finance's language. */
  description: string;
  count: number;
  /** ZMW at stake; null when an amount would be meaningless for the check. */
  amount: number | null;
  /** Up to three human-readable examples (request numbers / site codes). */
  samples: string[];
  href: string;
};

export type OpsFinanceLeakReport = {
  checks: OpsFinanceLeakCheck[];
  /** Total ZMW across amount-bearing checks (a request counted once). */
  leakAmount: number;
  /** True when every count is zero — the chain reconciles. */
  clean: boolean;
};

function toNumber(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Priced-where-priced, estimated otherwise — same rule as boq-actuals. */
function requestValue(items: LeakRequestItemRow[]): number {
  return roundMoney(
    items.reduce((sum, item) => {
      const priced = toNumber(item.actual_total);
      return sum + (priced > 0 ? priced : toNumber(item.estimated_total));
    }, 0),
  );
}

export function buildOpsFinanceLeakReport(input: {
  requests: LeakMaterialRequestRow[];
  items: LeakRequestItemRow[];
  costEntries: LeakCostEntryRow[];
  budgets: LeakBudgetRow[];
  budgetLines: LeakBudgetLineRow[];
  sites: LeakSiteRow[];
}): OpsFinanceLeakReport {
  const itemsByRequest = new Map<string, LeakRequestItemRow[]>();
  for (const item of input.items) {
    const list = itemsByRequest.get(item.request_id) ?? [];
    list.push(item);
    itemsByRequest.set(item.request_id, list);
  }

  const siteById = new Map(input.sites.map((site) => [site.id, site]));
  const siteLabel = (siteId: string | null) => {
    const site = siteId ? siteById.get(siteId) : null;
    return site ? `${site.code} — ${site.name}` : "(unknown site)";
  };

  // Requests that are alive (or done) and should therefore be traceable.
  const liveRequests = input.requests.filter(
    (request) => !TERMINAL_DEAD_STATUSES.has(request.status),
  );

  // ── Check 1: live site requests with no budget line ──────────────────────
  const unlinkedRequests = liveRequests.filter(
    (request) => request.scope === "site" && !request.budget_line_id,
  );
  const unlinkedAmount = roundMoney(
    unlinkedRequests.reduce(
      (sum, request) => sum + requestValue(itemsByRequest.get(request.id) ?? []),
      0,
    ),
  );

  // ── Check 2: goods arrived but the ledger never heard ────────────────────
  const requestIdsWithCostEntry = new Set(
    input.costEntries
      .filter((entry) => entry.material_request_id && entry.status !== "cancelled")
      .map((entry) => entry.material_request_id as string),
  );
  const arrivedUntracked = liveRequests.filter(
    (request) =>
      request.scope === "site" &&
      COST_EXPECTED_STATUSES.has(request.status) &&
      !requestIdsWithCostEntry.has(request.id),
  );
  const arrivedUntrackedAmount = roundMoney(
    arrivedUntracked.reduce(
      (sum, request) => sum + requestValue(itemsByRequest.get(request.id) ?? []),
      0,
    ),
  );

  // ── Check 3: money in the ledger charged to no budget line ───────────────
  const orphanEntries = input.costEntries.filter(
    (entry) => entry.status !== "cancelled" && !entry.budget_line_id,
  );
  const orphanEntriesAmount = roundMoney(
    orphanEntries.reduce((sum, entry) => sum + toNumber(entry.amount), 0),
  );

  // ── Check 4: sites spending without a funded budget ──────────────────────
  const openBudgetsBySite = new Map<string, LeakBudgetRow[]>();
  for (const budget of input.budgets) {
    if (budget.status !== "draft" && budget.status !== "active") continue;
    const list = openBudgetsBySite.get(budget.site_id) ?? [];
    list.push(budget);
    openBudgetsBySite.set(budget.site_id, list);
  }
  const budgetedByBudget = new Map<string, number>();
  for (const line of input.budgetLines) {
    budgetedByBudget.set(
      line.budget_id,
      (budgetedByBudget.get(line.budget_id) ?? 0) + toNumber(line.budgeted_amount),
    );
  }

  const spendBySite = new Map<string, number>();
  for (const request of liveRequests) {
    if (request.scope !== "site" || !request.site_id) continue;
    spendBySite.set(
      request.site_id,
      (spendBySite.get(request.site_id) ?? 0) +
        requestValue(itemsByRequest.get(request.id) ?? []),
    );
  }
  for (const entry of input.costEntries) {
    if (entry.status === "cancelled" || !entry.site_id) continue;
    // Only count ledger entries with no request link, so a request's value is
    // never double-counted with its own cost entry.
    if (entry.material_request_id) continue;
    spendBySite.set(
      entry.site_id,
      (spendBySite.get(entry.site_id) ?? 0) + toNumber(entry.amount),
    );
  }

  const unfundedSites: Array<{ siteId: string; spend: number }> = [];
  for (const [siteId, spend] of spendBySite) {
    if (spend <= 0) continue;
    const openBudgets = openBudgetsBySite.get(siteId) ?? [];
    const funded = openBudgets.some(
      (budget) => (budgetedByBudget.get(budget.id) ?? 0) > 0,
    );
    if (!funded) {
      unfundedSites.push({ siteId, spend: roundMoney(spend) });
    }
  }
  unfundedSites.sort((a, b) => b.spend - a.spend);
  const unfundedAmount = roundMoney(
    unfundedSites.reduce((sum, row) => sum + row.spend, 0),
  );

  // ── Check 5: sites with more than one open budget ────────────────────────
  const ambiguousSites = Array.from(openBudgetsBySite.entries())
    .filter(([, budgets]) => budgets.length > 1)
    .map(([siteId]) => siteId);

  // ── Check 6: suspected duplicate budget lines ────────────────────────────
  // Same budget, same category, same description, same non-zero amount. A
  // budget cannot be trusted while it may be double-counting itself, and a
  // real pair already exists (site 0001: "Core Materials" twice at
  // K2,814,048.14 each). Only Finance can decide whether a pair is a genuine
  // split or a mis-key, so this reports rather than merges.
  const budgetSiteById = new Map(input.budgets.map((budget) => [budget.id, budget.site_id]));
  const duplicateGroups = new Map<string, { count: number; amount: number; label: string }>();
  for (const line of input.budgetLines) {
    const amount = toNumber(line.budgeted_amount);
    if (amount <= 0) continue;
    const description = (line.description ?? "").trim().toLowerCase();
    const category = (line.category ?? "").trim().toLowerCase();
    if (description.length === 0) continue;
    const key = `${line.budget_id}|${category}|${description}|${amount}`;
    const current = duplicateGroups.get(key);
    if (current) {
      current.count += 1;
    } else {
      duplicateGroups.set(key, {
        count: 1,
        amount,
        label: `${siteLabel(budgetSiteById.get(line.budget_id) ?? null)} — ${
          line.description ?? ""
        }`,
      });
    }
  }
  const duplicatePairs = Array.from(duplicateGroups.values()).filter(
    (group) => group.count > 1,
  );
  // The exposure is the redundant copies, not the whole group.
  const duplicateAmount = roundMoney(
    duplicatePairs.reduce((sum, group) => sum + group.amount * (group.count - 1), 0),
  );

  const checks: OpsFinanceLeakCheck[] = [
    {
      key: "requests_without_budget_line",
      label: "Requests with no budget line",
      description:
        "Live site material requests drawing against no budget line — invisible to budget variance.",
      count: unlinkedRequests.length,
      amount: unlinkedAmount,
      samples: unlinkedRequests.slice(0, 3).map((request) => request.request_number),
      href: "/ops/material-requests",
    },
    {
      key: "arrived_without_cost_entry",
      label: "Delivered with no cost entry",
      description:
        "Goods arrived on site but the cost ledger never heard — spend missing from every report.",
      count: arrivedUntracked.length,
      amount: arrivedUntrackedAmount,
      samples: arrivedUntracked.slice(0, 3).map((request) => request.request_number),
      href: "/ops/material-requests?status=closed",
    },
    {
      key: "cost_entries_without_budget_line",
      label: "Cost entries with no budget line",
      description:
        "Ledger entries charged to no budget line — counted in project cost, missing from variance.",
      count: orphanEntries.length,
      amount: orphanEntriesAmount,
      samples: [],
      href: "/ops/project-budgets",
    },
    {
      key: "spend_without_funded_budget",
      label: "Sites spending with no funded budget",
      description:
        "Sites with live request value or ledger cost but no open budget carrying an amount.",
      count: unfundedSites.length,
      amount: unfundedAmount,
      samples: unfundedSites.slice(0, 3).map((row) => siteLabel(row.siteId)),
      href: "/ops/project-budgets",
    },
    {
      key: "multiple_open_budgets",
      label: "Sites with more than one open budget",
      description:
        "Two open budgets make “the site budget” ambiguous — lock or archive the superseded one.",
      count: ambiguousSites.length,
      amount: null,
      samples: ambiguousSites.slice(0, 3).map((siteId) => siteLabel(siteId)),
      href: "/ops/project-budgets",
    },
    {
      key: "duplicate_budget_lines",
      label: "Suspected duplicate budget lines",
      description:
        "Same budget, category, description and amount more than once — the budget may be double-counting itself. Value shown is the redundant copies.",
      count: duplicatePairs.length,
      amount: duplicateAmount,
      samples: duplicatePairs.slice(0, 3).map((group) => group.label),
      href: "/ops/project-budgets",
    },
  ];

  // Checks 1 and 2 can share requests; take the larger rather than summing
  // overlap. Checks 3 and 4 are disjoint from them by construction. Check 6
  // is deliberately excluded: a duplicate line overstates the budget, which is
  // the opposite problem to spend that never reached one, and adding them
  // together would describe neither.
  const requestSideAmount = Math.max(unlinkedAmount, arrivedUntrackedAmount);
  const leakAmount = roundMoney(requestSideAmount + orphanEntriesAmount + unfundedAmount);

  return {
    checks,
    leakAmount,
    clean: checks.every((check) => check.count === 0),
  };
}

/** Fetch the raw rows and fold them into the leak report. */
export async function fetchOpsFinanceLeakReport(): Promise<OpsFinanceLeakReport> {
  const supabase = getOpsSupabaseServiceClient();

  const [requestsResult, costEntriesResult, budgetsResult, budgetLinesResult, sitesResult] =
    await Promise.all([
      supabase
        .from("material_requests")
        .select("id, request_number, status, scope, site_id, budget_line_id")
        .is("archived_at", null),
      supabase
        .from("project_cost_entries")
        .select("material_request_id, budget_line_id, status, amount, site_id"),
      supabase.from("project_budgets").select("id, site_id, status"),
      supabase
        .from("project_budget_lines")
        .select("budget_id, budgeted_amount, description, category"),
      supabase.from("sites").select("id, code, name"),
    ]);

  for (const result of [
    requestsResult,
    costEntriesResult,
    budgetsResult,
    budgetLinesResult,
    sitesResult,
  ]) {
    if (result.error) {
      throw result.error;
    }
  }

  const requests = (requestsResult.data ?? []) as LeakMaterialRequestRow[];

  const liveIds = requests
    .filter((request) => !TERMINAL_DEAD_STATUSES.has(request.status))
    .map((request) => request.id);

  let items: LeakRequestItemRow[] = [];
  if (liveIds.length > 0) {
    const { data: itemRows, error: itemError } = await supabase
      .from("material_request_items")
      .select("request_id, estimated_total, actual_total")
      .in("request_id", liveIds);
    if (itemError) {
      throw itemError;
    }
    items = (itemRows ?? []) as LeakRequestItemRow[];
  }

  return buildOpsFinanceLeakReport({
    requests,
    items,
    costEntries: (costEntriesResult.data ?? []) as LeakCostEntryRow[],
    budgets: (budgetsResult.data ?? []) as LeakBudgetRow[],
    budgetLines: (budgetLinesResult.data ?? []) as LeakBudgetLineRow[],
    sites: (sitesResult.data ?? []) as LeakSiteRow[],
  });
}
