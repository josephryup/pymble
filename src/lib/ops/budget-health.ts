import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

/**
 * The four ways a project budget quietly stops governing anything.
 *
 * ── Why this screen exists (workflow audit F3, F4, F6) ────────────────────
 * Every one of these was true in production on 19 August 2026, and none of
 * them appeared anywhere in the system:
 *
 *   • RUBIS carried 24 requests and K59,720 of spend against a K904,672 budget
 *     that was still in DRAFT — so nothing measured it.
 *   • PARROGATE carried 10 requests and K137,550 of spend against a budget
 *     with two empty lines.
 *   • 16 of 37 budget lines had no cost code, making K1.4M invisible.
 *   • 465 of 468 line items charge the contingency leaf, because the material
 *     schedules are empty and nothing can be matched to planned work.
 *
 * The audit's own conclusion was that "the reason this was necessary is that
 * nothing was watching". This is the watching. It is deliberately a short list
 * of specific, actionable facts rather than a chart — a number nobody can act
 * on is decoration.
 */

export type BudgetHealthIssue = {
  kind:
    | "spend_without_live_budget"
    | "draft_budget_with_spend"
    | "uncoded_budget_lines"
    | "contingency_overrun";
  siteId: string | null;
  siteName: string;
  /** One sentence naming the problem in the reader's terms. */
  headline: string;
  /** What to do about it. */
  action: string;
  /** Money at stake, for ordering by consequence. */
  amount: number;
  severity: "critical" | "warning";
};

/**
 * Spend below this is not worth a person's attention.
 *
 * One site carries ZMW 1.00 of ledger spend against a draft budget. Reporting
 * that as "urgent" alongside PARROGATE's K137,550 is how a health panel
 * becomes something people scroll past — the whole point of this module is
 * that every row earns its place.
 */
const MIN_REPORTABLE_SPEND = 1_000;

function toNumber(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatZmw(value: number) {
  return `ZMW ${value.toLocaleString("en-ZM", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Everything wrong with the budget spine right now, worst money first.
 *
 * One query per table rather than per site: this renders on a list page and
 * must not become the reason it is slow.
 */
export async function fetchOpsBudgetHealth(): Promise<BudgetHealthIssue[]> {
  const supabase = getOpsSupabaseServiceClient();

  const [sitesResult, budgetsResult, linesResult, requestsResult] = await Promise.all([
    supabase.from("sites").select("id, name").eq("is_active", true),
    supabase
      .from("project_budgets")
      .select("id, site_id, status, budget_number, title, contingency_amount")
      .in("status", ["draft", "active", "locked"]),
    supabase
      .from("project_budget_lines")
      .select("id, budget_id, budgeted_amount, cost_code_id"),
    supabase
      .from("material_requests")
      .select("id, site_id, status")
      .not("site_id", "is", null)
      .not("status", "in", "(cancelled,rejected)"),
  ]);

  const siteNames = new Map(
    ((sitesResult.data ?? []) as Array<{ id: string; name: string }>).map((site) => [
      site.id,
      site.name,
    ]),
  );

  type Budget = {
    id: string;
    site_id: string;
    status: string;
    budget_number: string;
    title: string;
    contingency_amount: number | string | null;
  };
  const budgets = (budgetsResult.data ?? []) as Budget[];

  type Line = {
    id: string;
    budget_id: string;
    budgeted_amount: number | string | null;
    cost_code_id: string | null;
  };
  const lines = (linesResult.data ?? []) as Line[];

  const requestCountBySite = new Map<string, number>();
  for (const row of (requestsResult.data ?? []) as Array<{ site_id: string }>) {
    requestCountBySite.set(row.site_id, (requestCountBySite.get(row.site_id) ?? 0) + 1);
  }

  // Spend per site, from the ledger rather than from request estimates, so the
  // figure matches what the budget screens report.
  const { data: entryRows } = await supabase
    .from("project_cost_entries")
    .select("site_id, amount")
    .neq("lifecycle_state", "released")
    .not("site_id", "is", null);

  const spendBySite = new Map<string, number>();
  for (const row of (entryRows ?? []) as Array<{
    site_id: string;
    amount: number | string | null;
  }>) {
    spendBySite.set(row.site_id, (spendBySite.get(row.site_id) ?? 0) + toNumber(row.amount));
  }

  const linesByBudget = new Map<string, Line[]>();
  for (const line of lines) {
    const list = linesByBudget.get(line.budget_id) ?? [];
    list.push(line);
    linesByBudget.set(line.budget_id, list);
  }

  const liveBudgetSites = new Set(
    budgets.filter((budget) => budget.status !== "draft").map((budget) => budget.site_id),
  );

  const issues: BudgetHealthIssue[] = [];

  // 1. Spend on a site with no live budget at all.
  for (const [siteId, spend] of spendBySite) {
    if (spend < MIN_REPORTABLE_SPEND || liveBudgetSites.has(siteId)) {
      continue;
    }
    const draft = budgets.find(
      (budget) => budget.site_id === siteId && budget.status === "draft",
    );
    const requests = requestCountBySite.get(siteId) ?? 0;
    const siteName = siteNames.get(siteId) ?? "Unknown site";

    if (draft) {
      const planned = (linesByBudget.get(draft.id) ?? []).reduce(
        (sum, line) => sum + toNumber(line.budgeted_amount),
        0,
      );
      issues.push({
        kind: "draft_budget_with_spend",
        siteId,
        siteName,
        headline: `${siteName} has ${formatZmw(spend)} of spend and ${requests} open request${requests === 1 ? "" : "s"}, but its budget is still a draft.`,
        action:
          planned > 0
            ? `${draft.budget_number} plans ${formatZmw(planned)}. Activate it — a draft budget measures nothing.`
            : `${draft.budget_number} has no amounts on it yet. Add the lines, then activate it.`,
        amount: spend,
        severity: "critical",
      });
    } else {
      issues.push({
        kind: "spend_without_live_budget",
        siteId,
        siteName,
        headline: `${siteName} has ${formatZmw(spend)} of spend and no project budget at all.`,
        action: "Create a budget for this site so the spend has something to be measured against.",
        amount: spend,
        severity: "critical",
      });
    }
  }

  // 2. Budget lines with no cost code — money no control can see.
  for (const budget of budgets) {
    const budgetLines = linesByBudget.get(budget.id) ?? [];
    const uncoded = budgetLines.filter((line) => !line.cost_code_id);
    if (uncoded.length === 0) {
      continue;
    }
    const amount = uncoded.reduce((sum, line) => sum + toNumber(line.budgeted_amount), 0);
    issues.push({
      kind: "uncoded_budget_lines",
      siteId: budget.site_id,
      siteName: siteNames.get(budget.site_id) ?? budget.title,
      headline: `${uncoded.length} line${uncoded.length === 1 ? "" : "s"} on ${budget.budget_number} (${formatZmw(amount)}) have no cost code.`,
      action:
        "Set a cost code on each line — without one the money is invisible to the availability bands, the roll-up and every variance report.",
      amount,
      severity: "warning",
    });
  }

  // 3. Contingency charged well beyond what contingency is funded for.
  //
  // This is where off-schedule spend lands by design, so it is expected to
  // carry traffic — but on 19 Aug it carried K2.26M across 465 of 468 items,
  // against contingency allowances of zero on the two busiest sites. That is
  // not a contingency position, it is the whole project running unplanned, and
  // it stays true until the material schedules are populated.
  const { data: contingencyNodes } = await supabase
    .from("project_cost_codes")
    .select("id, site_id, library:cost_code_library!project_cost_codes_library_code_id_fkey(code)")
    .not("site_id", "is", null);

  const contingencyNodeIds = new Map<string, string>();
  for (const row of (contingencyNodes ?? []) as unknown as Array<{
    id: string;
    site_id: string;
    library: { code: string } | { code: string }[] | null;
  }>) {
    const library = Array.isArray(row.library) ? (row.library[0] ?? null) : row.library;
    if (library?.code === "90.90") {
      contingencyNodeIds.set(row.id, row.site_id);
    }
  }

  if (contingencyNodeIds.size > 0) {
    const { data: contingencyEntries } = await supabase
      .from("project_cost_entries")
      .select("cost_code_id, amount")
      .in("cost_code_id", Array.from(contingencyNodeIds.keys()))
      .neq("lifecycle_state", "released");

    const chargedBySite = new Map<string, number>();
    for (const row of (contingencyEntries ?? []) as Array<{
      cost_code_id: string;
      amount: number | string | null;
    }>) {
      const siteId = contingencyNodeIds.get(row.cost_code_id);
      if (siteId) {
        chargedBySite.set(siteId, (chargedBySite.get(siteId) ?? 0) + toNumber(row.amount));
      }
    }

    for (const [siteId, charged] of chargedBySite) {
      if (charged < MIN_REPORTABLE_SPEND || !liveBudgetSites.has(siteId)) {
        continue;
      }
      const funded = budgets
        .filter((budget) => budget.site_id === siteId && budget.status !== "draft")
        .reduce((sum, budget) => sum + toNumber(budget.contingency_amount), 0);
      const fundedLines = budgets
        .filter((budget) => budget.site_id === siteId && budget.status !== "draft")
        .flatMap((budget) => linesByBudget.get(budget.id) ?? [])
        .filter((line) => line.cost_code_id && contingencyNodeIds.has(line.cost_code_id))
        .reduce((sum, line) => sum + toNumber(line.budgeted_amount), 0);
      const allowance = funded + fundedLines;

      if (charged > allowance) {
        const siteName = siteNames.get(siteId) ?? "Unknown site";
        issues.push({
          kind: "contingency_overrun",
          siteId,
          siteName,
          headline:
            allowance > 0
              ? `${siteName} has charged ${formatZmw(charged)} to contingency against an allowance of ${formatZmw(allowance)}.`
              : `${siteName} has charged ${formatZmw(charged)} to contingency, which has no allowance set.`,
          action:
            "Spend lands here when it cannot be matched to a material schedule line. Populate the site's material schedule so requests charge the work they are for, and set a contingency amount for what genuinely is unplanned.",
          amount: charged - allowance,
          severity: "critical",
        });
      }
    }
  }

  return issues.sort((a, b) => {
    if (a.severity !== b.severity) {
      return a.severity === "critical" ? -1 : 1;
    }
    return b.amount - a.amount;
  });
}
