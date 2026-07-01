"use server";

import { requireOpsUser } from "@/lib/ops/auth";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

export type OpsPushSubscriptionInput = {
  endpoint: string;
  keys: { auth: string; p256dh: string };
  userAgent?: string;
};

/**
 * Registers (or re-registers) a browser push endpoint for the signed-in user.
 * Called directly from OpsPushNotificationPrompt after the browser grants
 * Notification permission and pushManager.subscribe() resolves.
 *
 * Upserts on `endpoint` rather than (user, endpoint): a push endpoint belongs
 * to one browser installation, so if a different ops user later signs in on
 * the same device the row is simply reassigned to them.
 */
export async function subscribeOpsPushAction(input: OpsPushSubscriptionInput) {
  const { profile } = await requireOpsUser();

  if (!input?.endpoint || !input.keys?.p256dh || !input.keys?.auth) {
    return { ok: false as const };
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase.from("ops_push_subscriptions").upsert(
    {
      auth_key: input.keys.auth,
      endpoint: input.endpoint,
      last_seen_at: new Date().toISOString(),
      p256dh: input.keys.p256dh,
      user_agent: (input.userAgent ?? "").slice(0, 300),
      user_id: profile.id,
    },
    { onConflict: "endpoint" },
  );

  return { ok: !error };
}

/** Removes a device's push subscription — used when the user turns notifications off. */
export async function unsubscribeOpsPushAction(endpoint: string) {
  const { profile } = await requireOpsUser();

  if (!endpoint) {
    return { ok: false as const };
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("ops_push_subscriptions")
    .delete()
    .eq("endpoint", endpoint)
    .eq("user_id", profile.id);

  return { ok: !error };
}
