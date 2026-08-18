import { logOpsServerError } from "@/lib/ops/log";
import { fanoutToOpsAudiences } from "@/lib/ops/notification-fanout";
import { queueOpsNotification } from "@/lib/ops/notifications";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

/**
 * The daily contract sweep.
 *
 * Three dates on a contract fall due long after everyone has moved on, and
 * nothing in the workspace chases them:
 *
 *   - the end date, which arrives while the works are still running;
 *   - the retention release, months after practical completion;
 *   - the warranty expiry, after which defects are no longer the
 *     subcontractor's problem and we would rather know before we ask.
 *
 * Retention is the one that actually costs money. It is a small percentage, it
 * falls due when the file is closed, and unclaimed retention is simply a gift
 * to the subcontractor.
 *
 * Every branch stamps a *_notified_at column when it sends. Without that the
 * sweep re-sends the same warning every morning until the date passes, which is
 * how people learn to ignore a notification channel entirely.
 */

const ROUTE = "/ops/contracts";
const MODULE = "contracts";

/** Warn this far ahead, so there is time to act rather than just be informed. */
const EXPIRY_WARNING_DAYS = 14;
const WARRANTY_WARNING_DAYS = 30;

function isoDaysFromNow(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export type OpsContractSweepResult = {
  expiring: number;
  retentionDue: number;
  warrantyExpiring: number;
};

export async function runOpsContractLifecycleSweep(): Promise<OpsContractSweepResult> {
  const supabase = getOpsSupabaseServiceClient();
  const result: OpsContractSweepResult = {
    expiring: 0,
    retentionDue: 0,
    warrantyExpiring: 0,
  };

  // Commercial + leadership get contract dates; Finance gets the money ones.
  const commercialAudience = await fanoutToOpsAudiences({
    actionNeeded: ["operations_manager", "projects_manager", "quantity_surveyor"],
    oversight: ["managing_director", "general_manager"],
  });
  const financeAudience = await fanoutToOpsAudiences({
    actionNeeded: ["finance_manager", "accountant"],
    oversight: ["managing_director", "general_manager"],
  });

  // -------------------------------------------------------------------------
  // Contracts running out of time
  // -------------------------------------------------------------------------
  try {
    const { data: expiring } = await supabase
      .from("contracts")
      .select("id, contract_number, title, end_date")
      .in("status", ["active", "signed"])
      .is("archived_at", null)
      .is("expiry_notified_at", null)
      .not("end_date", "is", null)
      .lte("end_date", isoDaysFromNow(EXPIRY_WARNING_DAYS));

    for (const contract of expiring ?? []) {
      await Promise.all(
        commercialAudience.map((recipient) =>
          queueOpsNotification({
            actionHref: `${ROUTE}/${contract.id}`,
            body: `The contract period ends on ${contract.end_date}. Extend it by addendum or move it to completion.`,
            // Keyed on the contract, not on the date: a dated key regenerates
            // every day and re-notifies, which is how 88% of notifications
            // ended up being duplicates once before.
            idempotencyKey: `contract-expiry:${contract.id}:${recipient.id}`,
            moduleKey: MODULE,
            recipientId: recipient.id,
            sourceId: contract.id,
            sourceTable: "contracts",
            title: `${contract.contract_number} ends soon`,
          }).catch(() => null),
        ),
      );

      await supabase
        .from("contracts")
        .update({ expiry_notified_at: new Date().toISOString() })
        .eq("id", contract.id);

      result.expiring += 1;
    }
  } catch (error) {
    logOpsServerError(error, { module: MODULE, action: "sweep.expiring" });
  }

  // -------------------------------------------------------------------------
  // Retention falling due for release
  // -------------------------------------------------------------------------
  try {
    const { data: retention } = await supabase
      .from("contract_milestones")
      .select(
        "id, contract_id, label, amount, release_due_date, contract:contracts!contract_milestones_contract_id_fkey(contract_number, title, currency_code)",
      )
      .eq("is_retention", true)
      .eq("status", "pending")
      .is("release_notified_at", null)
      .not("release_due_date", "is", null)
      .lte("release_due_date", today());

    for (const milestone of retention ?? []) {
      const parent = Array.isArray(milestone.contract)
        ? milestone.contract[0]
        : milestone.contract;

      await Promise.all(
        financeAudience.map((recipient) =>
          queueOpsNotification({
            actionHref: `${ROUTE}/${milestone.contract_id}`,
            body: `${parent?.currency_code ?? "ZMW"} ${Number(milestone.amount ?? 0).toLocaleString("en-ZM")} has been held since completion and the defects liability period has now run.`,
            idempotencyKey: `contract-retention:${milestone.id}:${recipient.id}`,
            moduleKey: MODULE,
            recipientId: recipient.id,
            sourceId: milestone.contract_id,
            sourceTable: "contracts",
            title: `Retention due for release — ${parent?.contract_number ?? "contract"}`,
          }).catch(() => null),
        ),
      );

      await supabase
        .from("contract_milestones")
        .update({ release_notified_at: new Date().toISOString() })
        .eq("id", milestone.id);

      result.retentionDue += 1;
    }
  } catch (error) {
    logOpsServerError(error, { module: MODULE, action: "sweep.retention" });
  }

  // -------------------------------------------------------------------------
  // Warranties about to lapse
  // -------------------------------------------------------------------------
  //
  // Computed in SQL from completed_at + warranty_months rather than stored,
  // because the warranty period is a term that can legitimately be edited on a
  // draft and a stored date would silently go stale.
  try {
    const { data: completed } = await supabase
      .from("contracts")
      .select("id, contract_number, title, completed_at, warranty_months")
      .eq("status", "completed")
      .is("archived_at", null)
      .is("warranty_notified_at", null)
      .not("completed_at", "is", null)
      .gt("warranty_months", 0);

    const cutoff = isoDaysFromNow(WARRANTY_WARNING_DAYS);

    for (const contract of completed ?? []) {
      const expiry = new Date(contract.completed_at as string);
      expiry.setMonth(expiry.getMonth() + Number(contract.warranty_months ?? 0));
      const expiryDate = expiry.toISOString().slice(0, 10);

      if (expiryDate > cutoff) continue;

      await Promise.all(
        commercialAudience.map((recipient) =>
          queueOpsNotification({
            actionHref: `${ROUTE}/${contract.id}`,
            body: `Workmanship warranty ends on ${expiryDate}. Raise any outstanding defects before it lapses.`,
            idempotencyKey: `contract-warranty:${contract.id}:${recipient.id}`,
            moduleKey: MODULE,
            recipientId: recipient.id,
            sourceId: contract.id,
            sourceTable: "contracts",
            title: `${contract.contract_number} warranty ends soon`,
          }).catch(() => null),
        ),
      );

      await supabase
        .from("contracts")
        .update({ warranty_notified_at: new Date().toISOString() })
        .eq("id", contract.id);

      result.warrantyExpiring += 1;
    }
  } catch (error) {
    logOpsServerError(error, { module: MODULE, action: "sweep.warranty" });
  }

  return result;
}
