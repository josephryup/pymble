import { fanoutToOpsAudiences } from "@/lib/ops/notification-fanout";
import { queueOpsNotification } from "@/lib/ops/notifications";
import type { OpsUserRole } from "@/lib/ops/types";

/**
 * One-call workflow notification: resolves the audiences (action-needed roles,
 * specific stakeholders such as the requester, oversight roles) with the
 * standard role-fallback chain, dedupes, excludes the actor, and queues one
 * notification per recipient with a stable idempotency key.
 *
 * Introduced by the system-wide audit (§2): 12 modules had submit→decide
 * workflows where the decider was never told. Every workflow transition that
 * needs someone's attention should go through here — best-effort by design,
 * a notification failure must never block the action itself.
 */
export async function notifyOpsWorkflowEvent(input: {
  /** The acting user — always excluded from recipients. */
  actorId: string;
  /** Roles that must act next (resolved with role fallback). */
  actionNeededRoles?: OpsUserRole[];
  /** Specific user ids affected (e.g. the original requester). */
  stakeholderIds?: Array<string | null | undefined>;
  /** Leadership that should see this class of event. */
  oversightRoles?: OpsUserRole[];
  title: string;
  body: string;
  actionHref: string;
  moduleKey: string;
  sourceTable: string;
  sourceId: string;
  /** Distinguishes transitions on the same record, e.g. "submitted"/"approved". */
  eventKey: string;
  category?: "action" | "info";
}): Promise<void> {
  try {
    const recipients = await fanoutToOpsAudiences({
      actionNeeded: input.actionNeededRoles,
      oversight: input.oversightRoles,
      extraUserIds: input.stakeholderIds,
      excludeUserIds: [input.actorId],
    });

    await Promise.all(
      recipients.map((recipient) =>
        queueOpsNotification({
          actionHref: input.actionHref,
          body: input.body,
          category: input.category ?? "action",
          idempotencyKey: `${input.sourceTable}:${input.sourceId}:${input.eventKey}:${recipient.id}`,
          moduleKey: input.moduleKey,
          recipientId: recipient.id,
          sourceId: input.sourceId,
          sourceTable: input.sourceTable,
          title: input.title,
        }).catch(() => null),
      ),
    );
  } catch {
    // Never let a notification hiccup break the workflow action.
  }
}
