import { requireOpsUser } from "@/lib/ops/auth";
import { canViewSensitiveOpsFoundation } from "@/lib/ops/permissions";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type { OpsNotificationStatus } from "@/lib/ops/types";

export type OpsNotification = {
  action_href: string | null;
  archived_at: string | null;
  body: string;
  created_at: string;
  id: string;
  module_key: string;
  read_at: string | null;
  recipient_id: string;
  source_id: string | null;
  source_table: string | null;
  status: OpsNotificationStatus;
  title: string;
};

export type FetchOpsNotificationsOptions = {
  limit?: number;
  recipientId?: string;
  status?: OpsNotificationStatus;
};

export type QueueOpsNotificationInput = {
  actionHref?: string | null;
  body?: string;
  idempotencyKey?: string | null;
  moduleKey?: string;
  recipientId: string;
  sourceId?: string | null;
  sourceTable?: string | null;
  title: string;
};

export type OpsNotificationStatusCounts = Record<OpsNotificationStatus, number>;

function normalizeLimit(limit: number | undefined) {
  return Math.min(Math.max(limit ?? 20, 1), 100);
}

async function updateOpsNotificationStatus(
  notificationId: string,
  status: OpsNotificationStatus,
) {
  const { profile } = await requireOpsUser();
  const now = new Date().toISOString();
  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("notifications")
    .update({
      archived_at: status === "archived" ? now : null,
      read_at: status === "unread" ? null : now,
      status,
    })
    .eq("id", notificationId)
    .eq("recipient_id", profile.id);

  if (error) {
    throw error;
  }
}

export async function fetchOpsNotifications(options: FetchOpsNotificationsOptions = {}) {
  const { profile } = await requireOpsUser();
  const recipientId = options.recipientId ?? profile.id;

  if (recipientId !== profile.id && !canViewSensitiveOpsFoundation(profile.role)) {
    return [];
  }

  const supabase = getOpsSupabaseServiceClient();
  let query = supabase
    .from("notifications")
    .select(
      "id, recipient_id, module_key, source_table, source_id, title, body, status, action_href, read_at, archived_at, created_at",
    )
    .eq("recipient_id", recipientId)
    .order("created_at", { ascending: false })
    .limit(normalizeLimit(options.limit));

  if (options.status) {
    query = query.eq("status", options.status);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data ?? []) as OpsNotification[];
}

export async function fetchOpsUnreadNotificationCount() {
  const { profile } = await requireOpsUser();
  const supabase = getOpsSupabaseServiceClient();
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", profile.id)
    .eq("status", "unread");

  if (error) {
    throw error;
  }

  return count ?? 0;
}

export async function fetchOpsNotificationStatusCounts(): Promise<OpsNotificationStatusCounts> {
  const { profile } = await requireOpsUser();
  const supabase = getOpsSupabaseServiceClient();
  const statuses: OpsNotificationStatus[] = ["unread", "read", "archived"];
  const results = await Promise.all(
    statuses.map(async (status) => {
      const { count, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", profile.id)
        .eq("status", status);

      if (error) {
        throw error;
      }

      return [status, count ?? 0] as const;
    }),
  );

  return {
    archived: results.find(([status]) => status === "archived")?.[1] ?? 0,
    read: results.find(([status]) => status === "read")?.[1] ?? 0,
    unread: results.find(([status]) => status === "unread")?.[1] ?? 0,
  };
}

export async function markOpsNotificationRead(notificationId: string) {
  await updateOpsNotificationStatus(notificationId, "read");
}

export async function markAllOpsNotificationsRead() {
  const { profile } = await requireOpsUser();
  const now = new Date().toISOString();
  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("notifications")
    .update({
      archived_at: null,
      read_at: now,
      status: "read",
    })
    .eq("recipient_id", profile.id)
    .eq("status", "unread");

  if (error) {
    throw error;
  }
}

export async function archiveOpsNotification(notificationId: string) {
  await updateOpsNotificationStatus(notificationId, "archived");
}

export async function restoreOpsNotification(notificationId: string) {
  await updateOpsNotificationStatus(notificationId, "read");
}

export async function queueOpsNotification(input: QueueOpsNotificationInput) {
  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase.from("notifications").upsert(
    {
      action_href: input.actionHref ?? null,
      body: input.body ?? "",
      idempotency_key: input.idempotencyKey ?? null,
      module_key: input.moduleKey ?? "ops",
      recipient_id: input.recipientId,
      source_id: input.sourceId ?? null,
      source_table: input.sourceTable ?? null,
      title: input.title,
    },
    input.idempotencyKey
      ? {
          onConflict: "idempotency_key",
        }
      : undefined,
  );

  if (error) {
    throw error;
  }
}
