import type { OpsContractDetail, OpsContractMilestone } from "@/lib/ops/contract-types";
import { logOpsServerError } from "@/lib/ops/log";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

/**
 * Where a contract meets Finance.
 *
 * The design sketched the money chain as
 *   milestone certified -> subcontractor_payments -> payment_requests -> GL
 *
 * The middle hop is a dead end. `subcontractor_payments` has no GL posting, no
 * cost code and no budget link — it notifies Finance and stops. Routing
 * certified milestones through it would mean maintaining a second payables
 * spine beside the one that already works.
 *
 * So a certified milestone raises a PAYMENT REQUEST directly. That table
 * already carries `payment_type = 'subcontractor'`, which
 * `opsPaymentPayableAccount` maps to 2050 Subcontractor Payable rather than
 * collapsing it into trade payables, and `postPaymentRequestJournalSafe`
 * already posts it when Finance approves. The chain becomes
 *   milestone certified -> payment_request -> existing approval -> GL + cost ledger
 *
 * Nothing here posts a journal itself. Certification creates a claim; the
 * existing payables workflow decides when it becomes an accounting fact. That
 * separation is deliberate — a site engineer certifying work should not be able
 * to move the general ledger.
 */

export type OpsContractFinanceResult =
  | { ok: true; id: string }
  | { ok: false; reason: string };

/**
 * Post the contract value as a COMMITMENT against the project budget.
 *
 * A commitment is money promised but not yet spent. Without it a project budget
 * looks healthy right up until the invoices arrive — which is most of why ~87%
 * of spend never reaches Finance in time to be acted on.
 *
 * Idempotent: re-approving updates the existing entry rather than stacking a
 * second commitment for the same contract.
 */
export async function postOpsContractCommitment(input: {
  actorUserId: string;
  contract: OpsContractDetail;
}): Promise<OpsContractFinanceResult> {
  const { contract } = input;

  // project_cost_entries requires a site. A contract with no site is legitimate
  // (an overhead engagement, a head-office consultancy) — it simply has no
  // project budget to commit against, so this is a skip, not a failure.
  if (!contract.site_id) {
    return { ok: false, reason: "no_site" };
  }
  if (Number(contract.total_value ?? 0) <= 0) {
    return { ok: false, reason: "no_value" };
  }

  const supabase = getOpsSupabaseServiceClient();

  const payload = {
    amount: Number(contract.total_value ?? 0),
    cost_date: contract.start_date ?? new Date().toISOString().slice(0, 10),
    cost_type: "subcontract",
    currency_code: contract.currency_code || "ZMW",
    description: `${contract.contract_number} — ${contract.title || contract.counterparty_name}`,
    site_id: contract.site_id,
    source_id: contract.id,
    source_table: "contracts",
    status: "committed" as const,
  };

  try {
    if (contract.commitment_cost_entry_id) {
      const { error } = await supabase
        .from("project_cost_entries")
        .update(payload)
        .eq("id", contract.commitment_cost_entry_id);

      if (error) throw error;
      return { ok: true, id: contract.commitment_cost_entry_id };
    }

    const { data, error } = await supabase
      .from("project_cost_entries")
      .insert({ ...payload, created_by: input.actorUserId })
      .select("id")
      .single<{ id: string }>();

    if (error || !data) throw error ?? new Error("No cost entry returned.");

    await supabase
      .from("contracts")
      .update({ commitment_cost_entry_id: data.id })
      .eq("id", contract.id);

    return { ok: true, id: data.id };
  } catch (error) {
    // A failed commitment must not block approval — the contract is still a
    // valid agreement. Log it and let the reconciliation report surface it.
    logOpsServerError(error, {
      module: "contracts",
      action: "postOpsContractCommitment",
      entityId: contract.id,
    });
    return { ok: false, reason: "post_failed" };
  }
}

/**
 * Stand down a commitment when a contract is terminated or cancelled.
 *
 * The entry is cancelled rather than deleted: a budget that silently loses a
 * commitment gives no way to answer "what happened to that K258,000?".
 */
export async function cancelOpsContractCommitment(contract: {
  id: string;
  commitment_cost_entry_id: string | null;
}) {
  if (!contract.commitment_cost_entry_id) return;

  const supabase = getOpsSupabaseServiceClient();
  await supabase
    .from("project_cost_entries")
    .update({ status: "cancelled" })
    .eq("id", contract.commitment_cost_entry_id)
    .then(() => null);
}

/**
 * Raise the payable for a certified milestone.
 *
 * Created as `submitted`, not `draft`: a certified stage is a claim that Finance
 * must act on, and a draft would sit invisible in someone's queue until they
 * remembered to submit it. It lands on the Submitted tile on /ops/payment-requests.
 *
 * The unique index on `payment_requests.contract_milestone_id` makes this
 * idempotent at the database level, so a double-click cannot raise the same
 * payment twice — the second insert fails on the constraint rather than on a
 * check we remembered to write.
 */
export async function raiseOpsContractMilestonePayable(input: {
  actorUserId: string;
  contract: OpsContractDetail;
  milestone: OpsContractMilestone;
}): Promise<OpsContractFinanceResult> {
  const { contract, milestone } = input;

  if (!contract.site_id) {
    return { ok: false, reason: "no_site" };
  }
  if (Number(milestone.amount ?? 0) <= 0) {
    return { ok: false, reason: "no_value" };
  }

  const supabase = getOpsSupabaseServiceClient();

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + Number(milestone.payable_within_days ?? 14));

  const { data, error } = await supabase
    .from("payment_requests")
    .insert({
      charge_target: "site",
      site_id: contract.site_id,
      contract_id: contract.id,
      contract_milestone_id: milestone.id,
      // 'subcontractor' routes this to 2050 Subcontractor Payable rather than
      // trade payables — retention-bearing balances behave differently and a
      // director is regularly asked to quote them.
      payment_type: "subcontractor",
      status: "submitted",
      submitted_at: new Date().toISOString(),
      title: `${contract.contract_number} — ${milestone.label}`,
      description: milestone.trigger_description,
      invoice_reference: contract.work_order_number,
      currency_code: contract.currency_code || "ZMW",
      requested_amount: Number(milestone.amount ?? 0),
      due_date: dueDate.toISOString().slice(0, 10),
      requested_by: input.actorUserId,
      created_by: input.actorUserId,
    })
    .select("id, request_number")
    .single<{ id: string; request_number: string }>();

  if (error || !data) {
    logOpsServerError(error, {
      module: "contracts",
      action: "raiseOpsContractMilestonePayable",
      entityId: milestone.id,
    });
    // 23505 is the unique violation on contract_milestone_id: this milestone
    // already has a payable, which is a no-op rather than an error.
    return {
      ok: false,
      reason: error?.code === "23505" ? "already_raised" : "insert_failed",
    };
  }

  await supabase
    .from("contract_milestones")
    .update({ payment_request_id: data.id })
    .eq("id", milestone.id);

  return { ok: true, id: data.id };
}

/**
 * What Pymble is holding back across live contracts, and when it falls due.
 *
 * Retention is the single thing most reliably forgotten: it is a small
 * percentage, it falls due months after everyone has moved on, and nothing
 * chases it. This is the query behind both the register tile and the sweep.
 */
export async function fetchOpsContractRetentionLedger() {
  const supabase = getOpsSupabaseServiceClient();

  const { data, error } = await supabase
    .from("contract_milestones")
    .select(
      "id, contract_id, label, amount, status, release_due_date, contract:contracts!contract_milestones_contract_id_fkey(id, contract_number, title, status, counterparty_snapshot, completed_at)",
    )
    .eq("is_retention", true)
    .neq("status", "paid")
    .order("release_due_date", { ascending: true, nullsFirst: false });

  if (error) {
    logOpsServerError(error, {
      module: "contracts",
      action: "fetchOpsContractRetentionLedger",
    });
    return [];
  }

  return data ?? [];
}
