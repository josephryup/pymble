import { sendOpsCriticalHseAlertEmail } from "@/lib/ops/email";
import { queueOpsNotification } from "@/lib/ops/notifications";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type { OpsUserRole } from "@/lib/ops/types";

export const OPS_HSE_REVIEW_NOTIFICATION_ROLES = [
  "developer",
  "hse_officer",
] as const satisfies readonly OpsUserRole[];

export const OPS_HSE_ESCALATION_NOTIFICATION_ROLES = [
  "developer",
  "managing_director",
  "owner",
  "general_manager",
  "manager",
  "operations_manager",
  "supervisor",
  "projects_manager",
  "hse_officer",
] as const satisfies readonly OpsUserRole[];

export const OPS_HSE_TRAINING_RENEWAL_NOTIFICATION_ROLES = [
  "developer",
  "hse_officer",
  "human_resource",
  "hr",
] as const satisfies readonly OpsUserRole[];

type OpsHseNotificationRecipient = {
  email?: string | null;
  full_name?: string | null;
  id: string;
  role: OpsUserRole;
};

export type QueueOpsHseRoleNotificationInput = {
  actionHref: string;
  actorUserId?: string | null;
  body: string;
  idempotencyKeyPrefix: string;
  moduleKey: "employees" | "hse" | "hse_compliance";
  recipientRoles: readonly OpsUserRole[];
  sendCriticalEmail?: boolean;
  sourceId: string;
  sourceTable: string;
  title: string;
};

export type QueueOpsHseUserNotificationInput = Omit<
  QueueOpsHseRoleNotificationInput,
  "recipientRoles"
> & {
  recipientId: string | null | undefined;
};

type OpsHseNotificationEmailInput = Pick<
  QueueOpsHseRoleNotificationInput,
  "actionHref" | "body" | "moduleKey" | "sendCriticalEmail" | "sourceId" | "sourceTable" | "title"
>;

export function selectOpsHseNotificationRecipients(
  users: OpsHseNotificationRecipient[],
  actorUserId?: string | null,
) {
  const seen = new Set<string>();

  return users.filter((user) => {
    if (user.id === actorUserId || seen.has(user.id)) {
      return false;
    }

    seen.add(user.id);
    return true;
  });
}

async function fetchOpsHseNotificationRecipient(recipientId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("users")
    .select("id, role, email, full_name")
    .eq("id", recipientId)
    .eq("is_active", true)
    .maybeSingle<OpsHseNotificationRecipient>();

  if (error) {
    throw error;
  }

  return data;
}

async function sendCriticalEmailToRecipient(
  input: OpsHseNotificationEmailInput,
  recipient: OpsHseNotificationRecipient | null | undefined,
  idempotencyKey: string,
) {
  if (!input.sendCriticalEmail || !recipient?.email) {
    return;
  }

  await sendOpsCriticalHseAlertEmail({
    actionHref: input.actionHref,
    body: input.body,
    idempotencyKey,
    moduleKey: input.moduleKey,
    recipientName: recipient.full_name,
    recipientId: recipient.id,
    recipientRole: recipient.role,
    sourceId: input.sourceId,
    sourceTable: input.sourceTable,
    title: input.title,
    to: recipient.email,
  });
}

export async function queueOpsHseRoleNotifications(input: QueueOpsHseRoleNotificationInput) {
  const roles = [...new Set(input.recipientRoles)];

  if (roles.length === 0) {
    return 0;
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("users")
    .select("id, role, email, full_name")
    .in("role", roles)
    .eq("is_active", true);

  if (error) {
    throw error;
  }

  const recipients = selectOpsHseNotificationRecipients(
    (data ?? []) as OpsHseNotificationRecipient[],
    input.actorUserId,
  );

  await Promise.all(
    recipients.map(async (recipient) => {
      const idempotencyKey = `${input.idempotencyKeyPrefix}:${recipient.id}`;

      await queueOpsNotification({
        actionHref: input.actionHref,
        body: input.body,
        idempotencyKey,
        moduleKey: input.moduleKey,
        recipientId: recipient.id,
        sourceId: input.sourceId,
        sourceTable: input.sourceTable,
        title: input.title,
      }).catch(() => null);

      await sendCriticalEmailToRecipient(input, recipient, idempotencyKey).catch(() => null);
    }),
  );

  return recipients.length;
}

export async function queueOpsHseUserNotification(input: QueueOpsHseUserNotificationInput) {
  if (!input.recipientId || input.recipientId === input.actorUserId) {
    return 0;
  }

  const idempotencyKey = `${input.idempotencyKeyPrefix}:${input.recipientId}`;

  await queueOpsNotification({
    actionHref: input.actionHref,
    body: input.body,
    idempotencyKey,
    moduleKey: input.moduleKey,
    recipientId: input.recipientId,
    sourceId: input.sourceId,
    sourceTable: input.sourceTable,
    title: input.title,
  });

  if (input.sendCriticalEmail) {
    const recipient = await fetchOpsHseNotificationRecipient(input.recipientId).catch(() => null);
    await sendCriticalEmailToRecipient(input, recipient, idempotencyKey).catch(() => null);
  }

  return 1;
}
