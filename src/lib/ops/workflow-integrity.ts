import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

/**
 * The invariants this audit had to check by hand.
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 * Every defect in the August 2026 workflow audit had been true in production
 * for weeks, and every one of them was discoverable with a single query. The
 * audit's own conclusion was blunt: "the reason this audit was necessary is
 * that nothing was watching."
 *
 * This is the watching. Each check is one fact that must be true if the
 * workflow is wired correctly, phrased so a failure names its own cause.
 *
 * Run in CI against a seeded database, and nightly against production with the
 * result going to the Ops inbox. A check that only runs when someone
 * remembers is the state we were already in.
 */

export type IntegrityCheck = {
  key: string;
  /** What must be true, in one sentence. */
  invariant: string;
  /** Which audit finding this guards against coming back. */
  finding: string;
  /** How many rows currently violate it. Zero is the only healthy value. */
  violations: number;
  /** Enough detail to start fixing, without dumping the table. */
  examples: string[];
  severity: "critical" | "warning";
};

export type IntegrityReport = {
  checks: IntegrityCheck[];
  failing: number;
  clean: boolean;
  ranAt: string;
};

const SAMPLE = 5;

/**
 * Run every workflow invariant and report which ones are broken.
 *
 * Read-only by design. This reports; it never repairs. A watchdog that quietly
 * fixes things is a watchdog nobody can trust, because it hides how often the
 * thing it fixes goes wrong.
 */
export async function runOpsWorkflowIntegrityChecks(): Promise<IntegrityReport> {
  const supabase = getOpsSupabaseServiceClient();
  const checks: IntegrityCheck[] = [];

  const add = (
    check: Omit<IntegrityCheck, "violations" | "examples"> & {
      rows: Array<Record<string, unknown>>;
      label: (row: Record<string, unknown>) => string;
    },
  ) => {
    checks.push({
      key: check.key,
      invariant: check.invariant,
      finding: check.finding,
      severity: check.severity,
      violations: check.rows.length,
      examples: check.rows.slice(0, SAMPLE).map(check.label),
    });
  };

  // ── F2: every ordered request has its money recorded ────────────────────
  const { data: orderedRequests } = await supabase
    .from("material_requests")
    .select("id, request_number")
    .in("status", ["ordered", "partially_ordered"]);

  const orderedIds = ((orderedRequests ?? []) as Array<{ id: string }>).map((row) => row.id);
  let orderedWithoutCommitment: Array<Record<string, unknown>> = [];
  if (orderedIds.length > 0) {
    const { data: committed } = await supabase
      .from("project_cost_entries")
      .select("material_request_id")
      .eq("lifecycle_state", "committed")
      .in("material_request_id", orderedIds);
    const withCommitment = new Set(
      ((committed ?? []) as Array<{ material_request_id: string }>).map(
        (row) => row.material_request_id,
      ),
    );
    orderedWithoutCommitment = (
      (orderedRequests ?? []) as Array<{ id: string; request_number: string }>
    ).filter((row) => !withCommitment.has(row.id));
  }
  add({
    key: "ordered_requests_have_commitment",
    invariant: "Every ordered request has a committed cost entry.",
    finding: "F2 — two rival writers reached `ordered` and one wrote no money.",
    severity: "critical",
    rows: orderedWithoutCommitment,
    label: (row) => String(row.request_number),
  });

  // ── F10: nothing closes against an order that was never issued ──────────
  const { data: closedRequests } = await supabase
    .from("material_requests")
    .select("id, request_number")
    .eq("status", "closed");
  const closedIds = ((closedRequests ?? []) as Array<{ id: string }>).map((row) => row.id);
  let closedAgainstUnissued: Array<Record<string, unknown>> = [];
  if (closedIds.length > 0) {
    const { data: pos } = await supabase
      .from("purchase_orders")
      .select("po_number, status, material_request_id")
      .in("material_request_id", closedIds)
      .in("status", ["draft", "approval_pending", "approved"]);
    closedAgainstUnissued = (pos ?? []) as Array<Record<string, unknown>>;
  }
  add({
    key: "no_close_against_unissued_order",
    invariant: "No closed request has a purchase order that was never issued.",
    finding: "F10 — converting a requisition closed the request on creating DRAFT orders.",
    severity: "critical",
    rows: closedAgainstUnissued,
    label: (row) => `${row.po_number} (${row.status})`,
  });

  // ── F8: everything postable has reached the ledger ──────────────────────
  const { data: unposted } = await supabase
    .from("project_cost_entries")
    .select("id, amount, lifecycle_state")
    .is("journal_entry_id", null)
    .in("lifecycle_state", ["accrued", "actual"]);
  add({
    key: "postable_entries_have_journals",
    invariant: "Every accrued or actual cost entry has a journal entry behind it.",
    finding: "F8 — GL posting was called under a discarding catch and never happened.",
    severity: "critical",
    rows: (unposted ?? []) as Array<Record<string, unknown>>,
    label: (row) => `${row.lifecycle_state} ZMW ${row.amount}`,
  });

  // ── F4/F5: budget lines are visible to the controls ─────────────────────
  const { data: uncodedLines } = await supabase
    .from("project_budget_lines")
    .select("id, line_number, description, budgeted_amount")
    .is("cost_code_id", null);
  add({
    key: "budget_lines_have_cost_codes",
    invariant: "Every project budget line carries a cost code.",
    finding: "F4 — 16 of 37 lines had none, making K1.4M invisible to every control.",
    severity: "critical",
    rows: (uncodedLines ?? []) as Array<Record<string, unknown>>,
    label: (row) => `line ${row.line_number}: ${row.description} (${row.budgeted_amount})`,
  });

  // ── F6/F7: spend charges somewhere ──────────────────────────────────────
  const { data: uncodedItems } = await supabase
    .from("material_request_items")
    .select("id, item_name, request:material_requests!inner(request_number, site_id)")
    .is("cost_code_id", null)
    .not("request.site_id", "is", null);
  add({
    key: "site_items_have_cost_codes",
    invariant: "Every line item on a site request charges a cost code.",
    finding: "F6 — cost codes were only stamped at submit, and only on imports.",
    severity: "critical",
    rows: (uncodedItems ?? []) as Array<Record<string, unknown>>,
    label: (row) => String(row.item_name),
  });

  const { data: noCostCentre } = await supabase
    .from("material_requests")
    .select("id, request_number, scope")
    .is("site_id", null)
    .is("cost_centre_id", null)
    .not("status", "in", "(cancelled,rejected)");
  add({
    key: "overhead_requests_have_cost_centres",
    invariant: "Every request with no site carries a cost centre.",
    finding: "F7 — IT and general requests were promised a contingency budget that cannot exist.",
    severity: "warning",
    rows: (noCostCentre ?? []) as Array<Record<string, unknown>>,
    label: (row) => `${row.request_number} (${row.scope})`,
  });

  // ── F3: money is measured against a live budget ─────────────────────────
  const { data: liveBudgets } = await supabase
    .from("project_budgets")
    .select("site_id")
    .in("status", ["active", "locked"]);
  const liveSites = new Set(
    ((liveBudgets ?? []) as Array<{ site_id: string }>).map((row) => row.site_id),
  );
  const { data: spendRows } = await supabase
    .from("project_cost_entries")
    .select("site_id, amount")
    .neq("lifecycle_state", "released")
    .not("site_id", "is", null);
  const spendBySite = new Map<string, number>();
  for (const row of (spendRows ?? []) as Array<{ site_id: string; amount: number | string }>) {
    spendBySite.set(row.site_id, (spendBySite.get(row.site_id) ?? 0) + Number(row.amount ?? 0));
  }
  const { data: siteRows } = await supabase.from("sites").select("id, name");
  const siteNames = new Map(
    ((siteRows ?? []) as Array<{ id: string; name: string }>).map((row) => [row.id, row.name]),
  );
  const spendWithoutLiveBudget = Array.from(spendBySite.entries())
    .filter(([siteId, amount]) => amount >= 1000 && !liveSites.has(siteId))
    .map(([siteId, amount]) => ({ site: siteNames.get(siteId) ?? siteId, amount }));
  add({
    key: "spend_has_a_live_budget",
    invariant: "No site carries material spend without an active budget.",
    finding: "F3 — activation was a no-op, so draft budgets governed nothing.",
    severity: "critical",
    rows: spendWithoutLiveBudget as Array<Record<string, unknown>>,
    label: (row) => `${row.site}: ZMW ${Number(row.amount).toLocaleString("en-ZM")}`,
  });

  // ── F10: approvals do not outlive what they approve ─────────────────────
  const { data: deadApprovals } = await supabase
    .from("approval_steps")
    .select("id, approval_request:approval_requests!inner(status, title)")
    .eq("status", "pending")
    .eq("approval_request.status", "cancelled");
  add({
    key: "no_pending_steps_on_dead_approvals",
    invariant: "No cancelled approval still has pending steps in someone's queue.",
    finding: "F10 — cancelling a request never withdrew the approval it raised.",
    severity: "warning",
    rows: (deadApprovals ?? []) as Array<Record<string, unknown>>,
    label: (row) => {
      const parent = (row as { approval_request?: { title?: string } }).approval_request;
      return parent?.title ?? "approval step";
    },
  });

  const failing = checks.filter((check) => check.violations > 0).length;

  return {
    checks,
    failing,
    clean: failing === 0,
    ranAt: new Date().toISOString(),
  };
}
