"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { getOpsSupabaseBrowserClient } from "@/lib/ops/supabase-browser";

type OpsAutoRefreshProps = {
  /**
   * The current user id. We listen for notifications + record_comments
   * targeting this user so the badge counts in the shell stay live.
   */
  userId: string;
  /**
   * Backstop poll interval in ms. When the tab is visible we still call
   * router.refresh() at this cadence so a missed realtime event eventually
   * heals. Defaults to 60s.
   */
  fallbackIntervalMs?: number;
};

/**
 * Drives the workspace's self-refresh. Combines three signals:
 *
 * 1. Supabase Realtime — subscribe to row changes on the highest-traffic
 *    tables (notifications, record_comments, approval_requests). Any change
 *    that could affect what the current user sees triggers a debounced
 *    router.refresh().
 * 2. Window focus / visibilitychange — when the user returns to the tab,
 *    refresh immediately so they see the latest data without manual reload.
 * 3. Backstop interval — every minute while visible, refresh anyway in case a
 *    socket disconnect dropped events.
 *
 * Mounted once in the workspace layout. No UI; effects only.
 */
export function OpsAutoRefresh({ userId, fallbackIntervalMs = 60_000 }: OpsAutoRefreshProps) {
  const router = useRouter();
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!userId) return;

    const debouncedRefresh = () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => {
        if (typeof document === "undefined" || document.visibilityState === "visible") {
          router.refresh();
        }
      }, 400);
    };

    const supabase = getOpsSupabaseBrowserClient();
    if (!supabase) {
      // No Supabase browser client (env vars missing). Skip realtime; the
      // visibility-based refresh below still keeps the page reasonably fresh.
      const onVisibility = () => {
        if (
          typeof document !== "undefined" &&
          document.visibilityState === "visible"
        ) {
          router.refresh();
        }
      };
      document.addEventListener("visibilitychange", onVisibility);
      window.addEventListener("focus", onVisibility);
      const fallback = window.setInterval(() => {
        if (document.visibilityState === "visible") router.refresh();
      }, fallbackIntervalMs);
      return () => {
        document.removeEventListener("visibilitychange", onVisibility);
        window.removeEventListener("focus", onVisibility);
        window.clearInterval(fallback);
      };
    }

    const channel = supabase
      .channel(`ops-auto-refresh:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${userId}`,
        },
        debouncedRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "approval_requests" },
        debouncedRefresh,
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "record_comments" },
        (payload: { new?: Record<string, unknown> | null }) => {
          // Only refresh when the current user is in the new mentioned_user_ids,
          // otherwise we'd be doing pointless refreshes for every comment in
          // the system.
          const mentions = payload.new?.mentioned_user_ids;
          if (Array.isArray(mentions) && mentions.includes(userId)) {
            debouncedRefresh();
          }
        },
      )
      .subscribe();

    const onVisibility = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        debouncedRefresh();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);

    const fallback = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    }, fallbackIntervalMs);

    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisibility);
      window.clearInterval(fallback);
      supabase.removeChannel(channel).catch(() => null);
    };
  }, [router, userId, fallbackIntervalMs]);

  return null;
}
