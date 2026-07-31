import { recordOpsAuditEvent } from "@/lib/ops/audit";
import { postOpsJournalEntry } from "@/lib/ops/gl-posting";
import { logOpsServerError } from "@/lib/ops/log";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

/**
 * The cost subledger → general ledger bridge.
 *
 * Phase 4 of docs/pymble-ops-project-finance-spine-audit.md (§4.5). Today the
 * GL is fed only by invoices, payment requests and payroll — so with none of
 * those in use, 68 accounts hold zero journals and every financial statement
 * renders empty, while K180,910 of real material spend sits in the cost
 * subledger. The two are parallel worlds.
 *
 * This makes the relationship explicit and one-directional:
 *
 *     project_cost_entries   =  the cost subledger (operational truth)
 *              │  cost_code → cost_code_library.gl_account_id
 *              ▼
 *     journal_entries        =  the general ledger (financial truth)
 *              │
 *              └── project_cost_entries.journal_entry_id  (reconciliation)
 *
 * Which stations post, and which do not, is the important part:
 *
 *   reserved / committed — memo only. A commitment is not an expense; posting
 *                          it would overstate cost and misstate the balance
 *                          sheet. Every standard system keeps commitments out
 *                          of the GL, and so does this.
 *   accrued              — goods received, not yet invoiced: Dr expense,
 *                          Cr Accruals (2300).
 *   actual               — supplier invoice matched: Dr expense,
 *                          Cr Accounts Payable (2010).
 *   paid                 — handled by the existing payment-request posting.
 */

/** Goods received but not yet invoiced. */
const ACCRUALS_ACCOUNT = "2300";
/** Supplier invoice matched and owing. */
const ACCOUNTS_PAYABLE_ACCOUNT = "2010";
/** Used only when a cost code has no GL account mapped — visible, not silent. */
const FALLBACK_EXPENSE_ACCOUNT = "5090";

export type CostEntryForPosting = {
  id: string;
  amount: number;
  costDate: string;
  description: string;
  lifecycleState: string;
  siteId: string | null;
  costCentreId: string | null;
  costCodeId: string | null;
  journalEntryId: string | null;
};

function toNumber(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

/** Stations that belong in the general ledger at all. */
export function isPostableStation(state: string): boolean {
  return state === "accrued" || state === "actual";
}

/** Which liability the expense sits against, by station. */
export function creditAccountForStation(state: string): string {
  return state === "accrued" ? ACCRUALS_ACCOUNT : ACCOUNTS_PAYABLE_ACCOUNT;
}

/**
 * Post one cost entry to the general ledger and record the link back.
 *
 * Best-effort by design, matching every other posting path in this codebase: a
 * GL hiccup must never block an operational transition. But unlike the older
 * paths, a failure here is not merely logged and forgotten — the entry keeps
 * `journal_entry_id = null`, which the reconciliation report surfaces as a
 * break. That is the difference between an invisible failure and a visible one.
 */
export async function postCostEntryToGlSafe(input: {
  actorUserId: string;
  costEntryId: string;
}): Promise<{ posted: boolean; reason?: string }> {
  const supabase = getOpsSupabaseServiceClient();

  const { data, error } = await supabase
    .from("project_cost_entries")
    .select(
      "id, amount, cost_date, description, lifecycle_state, site_id, cost_centre_id, cost_code_id, journal_entry_id, cost_code:project_cost_codes!project_cost_entries_cost_code_id_fkey(path, library:cost_code_library!project_cost_codes_library_code_id_fkey(code, gl_account:chart_of_accounts!cost_code_library_gl_account_id_fkey(code))), cost_centre:cost_centres!project_cost_entries_cost_centre_id_fkey(code, gl_account:chart_of_accounts!cost_centres_gl_account_id_fkey(code))",
    )
    .eq("id", input.costEntryId)
    .maybeSingle();

  if (error) {
    throw error;
  }
  if (!data) {
    return { posted: false, reason: "not_found" };
  }

  const row = data as unknown as {
    id: string;
    amount: number | string;
    cost_date: string;
    description: string;
    lifecycle_state: string;
    site_id: string | null;
    cost_centre_id: string | null;
    journal_entry_id: string | null;
    cost_code:
      | {
          path: string;
          library:
            | { code: string; gl_account: { code: string } | { code: string }[] | null }
            | Array<{
                code: string;
                gl_account: { code: string } | { code: string }[] | null;
              }>
            | null;
        }
      | Array<unknown>
      | null;
    cost_centre:
      | { code: string; gl_account: { code: string } | { code: string }[] | null }
      | Array<unknown>
      | null;
  };

  if (row.journal_entry_id) {
    return { posted: false, reason: "already_posted" };
  }
  if (!isPostableStation(row.lifecycle_state)) {
    // Commitments and reservations are memo-only — not a failure.
    return { posted: false, reason: "not_postable_station" };
  }

  const amount = toNumber(row.amount);
  if (amount <= 0) {
    return { posted: false, reason: "zero_amount" };
  }

  const first = <T,>(value: T | T[] | null | undefined): T | null =>
    Array.isArray(value) ? ((value[0] as T) ?? null) : ((value as T) ?? null);

  const costCode = first(row.cost_code) as {
    path: string;
    library: unknown;
  } | null;
  const library = costCode
    ? (first(costCode.library) as {
        code: string;
        gl_account: unknown;
      } | null)
    : null;
  const codeAccount = library
    ? (first(library.gl_account) as { code: string } | null)
    : null;

  const centre = first(row.cost_centre) as {
    code: string;
    gl_account: unknown;
  } | null;
  const centreAccount = centre
    ? (first(centre.gl_account) as { code: string } | null)
    : null;

  // Project cost follows its cost code's account; overhead follows its cost
  // centre's. The fallback is deliberately "Other Direct Costs" rather than a
  // silent skip: unmapped spend must still reach the ledger, and it lands
  // somewhere obviously wrong so Finance fixes the mapping.
  const expenseAccount =
    codeAccount?.code ?? centreAccount?.code ?? FALLBACK_EXPENSE_ACCOUNT;
  const usedFallback = !codeAccount?.code && !centreAccount?.code;

  const creditAccount = creditAccountForStation(row.lifecycle_state);
  const costCodeLabel = costCode?.path ?? centre?.code ?? "";

  try {
    const result = await postOpsJournalEntry({
      entryDate: row.cost_date,
      memo: row.description,
      sourceTable: "project_cost_entries",
      sourceId: row.id,
      sourceEvent: `cost_entry.${row.lifecycle_state}`,
      createdBy: input.actorUserId,
      lines: [
        {
          account_code: expenseAccount,
          debit: amount,
          description: row.description,
          site_id: row.site_id,
          cost_code: costCodeLabel,
        },
        {
          account_code: creditAccount,
          credit: amount,
          description: row.description,
          site_id: row.site_id,
          cost_code: costCodeLabel,
        },
      ],
    });

    if (result.entryId) {
      await supabase
        .from("project_cost_entries")
        .update({ journal_entry_id: result.entryId })
        .eq("id", row.id);
    }

    if (usedFallback) {
      await recordOpsAuditEvent({
        action: "cost_entry.posted_without_gl_mapping",
        actorUserId: input.actorUserId,
        entityId: row.id,
        entityType: "project_cost_entry",
        metadata: { fallback_account: FALLBACK_EXPENSE_ACCOUNT, amount },
        moduleKey: "finance",
        sourceId: row.id,
        sourceTable: "project_cost_entries",
        summary: `Posted ${row.description} to ${FALLBACK_EXPENSE_ACCOUNT} — its cost code has no GL account mapped.`,
      }).catch(() => null);
    }

    return { posted: Boolean(result.entryId), reason: result.duplicate ? "duplicate" : undefined };
  } catch (postingError) {
    logOpsServerError(postingError, {
      module: "finance",
      action: "postCostEntryToGl",
      actorUserId: input.actorUserId,
      entityType: "project_cost_entry",
      entityId: row.id,
    });
    return { posted: false, reason: "error" };
  }
}

// ---------------------------------------------------------------------------
// Reconciliation — the leak detector for the GL itself.
// ---------------------------------------------------------------------------

export type GlReconciliationReport = {
  /** Actual/paid cost with no journal behind it. */
  unpostedCount: number;
  unpostedAmount: number;
  /** System journals whose source row has gone. */
  orphanJournalCount: number;
  /** Cost codes carrying spend but with no GL account mapped. */
  unmappedCostCodeCount: number;
  unmappedCostCodeLabels: string[];
  subledgerTotal: number;
  postedTotal: number;
  /** Zero means the subledger and the ledger agree. */
  variance: number;
  clean: boolean;
};

/**
 * Reconcile the cost subledger against the general ledger.
 *
 * "If this is empty, nothing is leaking" — the audit's own test for whether the
 * bridge works. Reports both directions: cost that never posted, and journals
 * whose source has vanished.
 */
export async function fetchOpsGlReconciliation(): Promise<GlReconciliationReport> {
  const supabase = getOpsSupabaseServiceClient();

  const [entriesResult, unmappedResult] = await Promise.all([
    supabase
      .from("project_cost_entries")
      .select("id, amount, lifecycle_state, journal_entry_id"),
    supabase
      .from("project_cost_codes")
      .select(
        "id, path, name, library:cost_code_library!project_cost_codes_library_code_id_fkey(code, gl_account_id)",
      )
      .not("library_code_id", "is", null),
  ]);

  if (entriesResult.error) {
    throw entriesResult.error;
  }

  const entries = (entriesResult.data ?? []) as Array<{
    id: string;
    amount: number | string;
    lifecycle_state: string;
    journal_entry_id: string | null;
  }>;

  let unpostedCount = 0;
  let unpostedAmount = 0;
  let subledgerTotal = 0;
  let postedTotal = 0;

  for (const entry of entries) {
    if (!isPostableStation(entry.lifecycle_state)) continue;
    const amount = toNumber(entry.amount);
    subledgerTotal += amount;
    if (entry.journal_entry_id) {
      postedTotal += amount;
    } else {
      unpostedCount += 1;
      unpostedAmount += amount;
    }
  }

  const unmappedLabels: string[] = [];
  for (const row of (unmappedResult.data ?? []) as unknown as Array<{
    path: string;
    name: string;
    library:
      | { code: string; gl_account_id: string | null }
      | Array<{ code: string; gl_account_id: string | null }>
      | null;
  }>) {
    const library = Array.isArray(row.library) ? (row.library[0] ?? null) : row.library;
    if (library && !library.gl_account_id) {
      unmappedLabels.push(`${row.path} · ${row.name}`);
    }
  }

  const { count: orphanJournalCount } = await supabase
    .from("journal_entries")
    .select("id", { count: "exact", head: true })
    .eq("source_table", "project_cost_entries")
    .not("source_id", "in", `(${entries.map((e) => e.id).join(",") || "null"})`);

  const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

  return {
    unpostedCount,
    unpostedAmount: round(unpostedAmount),
    orphanJournalCount: orphanJournalCount ?? 0,
    unmappedCostCodeCount: unmappedLabels.length,
    unmappedCostCodeLabels: unmappedLabels.slice(0, 5),
    subledgerTotal: round(subledgerTotal),
    postedTotal: round(postedTotal),
    variance: round(subledgerTotal - postedTotal),
    clean:
      unpostedCount === 0 &&
      (orphanJournalCount ?? 0) === 0 &&
      unmappedLabels.length === 0,
  };
}
