import webpush from "web-push";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

export type OpsPushPayload = {
  actionHref?: string | null;
  body: string;
  tag?: string;
  title: string;
};

let vapidConfigured = false;

export function isOpsPushConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY &&
      process.env.VAPID_SUBJECT,
  );
}

function ensureVapidConfigured() {
  if (vapidConfigured || !isOpsPushConfigured()) return;

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT as string,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string,
    process.env.VAPID_PRIVATE_KEY as string,
  );
  vapidConfigured = true;
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function safeActionHref(value: string | null | undefined) {
  return value && (value === "/ops" || value.startsWith("/ops/")) ? value : "/ops/notifications";
}

function pushErrorStatusCode(error: unknown) {
  return error && typeof error === "object" && "statusCode" in error
    ? Number((error as { statusCode?: unknown }).statusCode)
    : undefined;
}

/**
 * Sends an OS-level Web Push notification to every device the given user has
 * subscribed from. Best-effort and fully non-throwing: a caller (notably
 * queueOpsNotification) should never fail because a push endpoint is down or
 * VAPID isn't configured in this environment (e.g. local dev).
 *
 * Dead endpoints (the push service reports 404/410 — user revoked permission,
 * uninstalled, or cleared site data) are pruned from
 * ops_push_subscriptions so they stop being retried.
 */
export async function sendOpsPushToUser(userId: string, payload: OpsPushPayload): Promise<void> {
  if (!userId || !isOpsPushConfigured()) return;

  try {
    ensureVapidConfigured();

    const supabase = getOpsSupabaseServiceClient();
    const { data, error } = await supabase
      .from("ops_push_subscriptions")
      .select("id, endpoint, p256dh, auth_key")
      .eq("user_id", userId);

    if (error || !data || data.length === 0) return;

    const message = JSON.stringify({
      actionHref: safeActionHref(payload.actionHref),
      body: truncate(payload.body, 200),
      tag: payload.tag ?? "ops-notification",
      title: truncate(payload.title, 120),
    });

    await Promise.all(
      data.map(async (subscription) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: { auth: subscription.auth_key, p256dh: subscription.p256dh },
            },
            message,
          );
        } catch (sendError) {
          const statusCode = pushErrorStatusCode(sendError);
          if (statusCode === 404 || statusCode === 410) {
            await supabase.from("ops_push_subscriptions").delete().eq("id", subscription.id);
            return;
          }
          console.warn("Pymble Ops push send failed", {
            statusCode,
            subscriptionId: subscription.id,
          });
        }
      }),
    );
  } catch (error) {
    console.warn("Pymble Ops push dispatch failed", error);
  }
}
