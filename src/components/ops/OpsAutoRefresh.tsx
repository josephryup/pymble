"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { decideRefresh, isEditableTag } from "@/lib/ops/refresh-policy";
import { getOpsSupabaseBrowserClient } from "@/lib/ops/supabase-browser";

/** Reads the DOM; the decision itself lives in refresh-policy.ts. */
function isUserMidEdit() {
  if (typeof document === "undefined") return false;
  const active = document.activeElement as HTMLElement | null;
  return isEditableTag(active?.tagName, active?.isContentEditable === true);
}

type OpsAutoRefreshProps = {
  /**
   * The current user id. We listen for notifications + record_comments
   * targeting this user so the badge counts in the shell stay live.
   */
  userId: string;
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
 *    This also heals any realtime events that were dropped while the socket
 *    was disconnected (e.g. the tab was backgrounded).
 *
 * Deliberately no polling backstop: a timed router.refresh() re-runs the full
 * server render of a data-heavy dashboard every interval for every open tab,
 * which burns serverless CPU continuously even when nothing has changed.
 * Realtime + focus/visibility refresh keeps the page fresh event-driven only.
 *
 * Mounted once in the workspace layout. No UI; effects only.
 */
export function OpsAutoRefresh({ userId }: OpsAutoRefreshProps) {
  const router = useRouter();
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRefreshAt = useRef(0);
  // A refresh that was held back, so the update still lands once it is cheap
  // and safe to apply. Mirrors OpsRealtimeRefresh.
  const pending = useRef(false);

  useEffect(() => {
    if (!userId) return;

    // Why this is not just a debounce: the approval_requests subscription below
    // is deliberately unfiltered, because RLS already scopes it correctly
    // (private.can_access_approval_request). But "correctly" is wide for the
    // people most likely to leave this open all day — is_ops_admin() matches
    // every approval in the company, and an approver matches everything for
    // their role. A 400ms debounce collapses a burst but puts no floor on the
    // sustained rate, so a busy afternoon re-rendered a force-dynamic page
    // every 400ms in every open tab. decideRefresh adds the 10s floor and
    // defers while the tab is hidden or the user is mid-edit.
    const runRefresh = () => {
      const now = Date.now();
      const decision = decideRefresh({
        now,
        lastRefreshAt: lastRefreshAt.current,
        isVisible:
          typeof document === "undefined" || document.visibilityState === "visible",
        isEditing: isUserMidEdit(),
      });

      if (!decision.refresh) {
        pending.current = true;
        return;
      }

      pending.current = false;
      lastRefreshAt.current = now;
      router.refresh();
    };

    const debouncedRefresh = () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(runRefresh, 400);
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
      return () => {
        document.removeEventListener("visibilitychange", onVisibility);
        window.removeEventListener("focus", onVisibility);
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

    // A refresh deferred because the user was typing lands as soon as they
    // finish, so the badge counts are never left stale by the new guard.
    const onBlur = () => {
      if (pending.current && !isUserMidEdit()) {
        runRefresh();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("focusout", onBlur);
    window.addEventListener("focus", onVisibility);

    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("focusout", onBlur);
      window.removeEventListener("focus", onVisibility);
      supabase.removeChannel(channel).catch(() => null);
    };
  }, [router, userId]);

  return null;
}
