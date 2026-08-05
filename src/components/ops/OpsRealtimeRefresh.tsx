"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef } from "react";
import { decideRefresh, isEditableTag } from "@/lib/ops/refresh-policy";
import { getOpsSupabaseBrowserClient } from "@/lib/ops/supabase-browser";

type OpsRealtimeRefreshProps = {
  /**
   * Postgres tables whose changes should trigger a refresh of this page.
   * Use the bare table name as it appears in the `public` schema, e.g.
   * "boq_documents", "material_requests".
   */
  tables: string[];
  /**
   * Per-page debounce in ms. Multiple events within the window collapse into
   * a single router.refresh(). Defaults to 500ms.
   */
  debounceMs?: number;
};

/** Reads the DOM; the decision itself lives in refresh-policy.ts. */
function isUserMidEdit() {
  if (typeof document === "undefined") return false;
  const active = document.activeElement as HTMLElement | null;
  return isEditableTag(active?.tagName, active?.isContentEditable === true);
}

/**
 * Page-level realtime listener. Drop this into any listing page and it will
 * subscribe to row changes on the given tables and call router.refresh() so
 * the server-rendered list updates without a manual reload.
 *
 * This complements the shell-level OpsAutoRefresh, which only watches
 * notifications + approvals + record_comments. Listing pages can opt in to
 * their own tables.
 *
 * Refreshes are rate-limited and deferred while the tab is hidden or the user
 * is typing — see refresh-policy.ts for why (audit §8).
 */
export function OpsRealtimeRefresh({ tables, debounceMs = 500 }: OpsRealtimeRefreshProps) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRefreshAt = useRef(0);
  // Set when a refresh was suppressed, so the update is not lost — it lands as
  // soon as the reason for suppressing it goes away.
  const pending = useRef(false);
  // Every call site passes an inline array literal (`tables={["invoices"]}`),
  // so `tables` is a NEW array identity on each render. Depending on it
  // directly tore the channel down and resubscribed after every render —
  // including every router.refresh() this component itself triggers. Depending
  // on the joined string instead makes the effect run only when the tables
  // genuinely change.
  const tablesKey = tables.join(",");
  // Stable across re-renders, unique per mounted instance. The channel name
  // previously embedded Date.now(), which guaranteed a fresh topic on every
  // resubscribe; a bare name would instead collide when two instances watch
  // the same tables (department-reports renders two).
  const instanceId = useId();

  useEffect(() => {
    if (tablesKey === "") return;
    const watchedTables = tablesKey.split(",");

    const runRefresh = () => {
      const now = Date.now();
      const decision = decideRefresh({
        now,
        lastRefreshAt: lastRefreshAt.current,
        isVisible:
          typeof document === "undefined" || document.visibilityState === "visible",
        isEditing: isUserMidEdit(),
      });

      // Every "no" defers rather than drops — the update still lands, once it
      // is cheap and safe to apply.
      if (!decision.refresh) {
        pending.current = true;
        return;
      }

      pending.current = false;
      lastRefreshAt.current = now;
      router.refresh();
    };

    const debouncedRefresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(runRefresh, debounceMs);
    };

    // A deferred refresh lands when the tab comes back, so returning to a page
    // still shows current data without having re-rendered while nobody looked.
    const onVisible = () => {
      if (document.visibilityState === "visible" && pending.current) {
        runRefresh();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    // …and when the user finishes editing.
    const onBlur = () => {
      if (pending.current && !isUserMidEdit()) {
        runRefresh();
      }
    };
    document.addEventListener("focusout", onBlur);

    const supabase = getOpsSupabaseBrowserClient();
    if (!supabase) return; // Env vars missing; no-op (workspace still renders).
    const channelName = `ops-page-realtime:${tablesKey}:${instanceId}`;
    let channel = supabase.channel(channelName);

    for (const table of watchedTables) {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        debouncedRefresh,
      );
    }

    channel.subscribe();

    return () => {
      if (timer.current) clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", onVisible);
      document.removeEventListener("focusout", onBlur);
      supabase.removeChannel(channel).catch(() => null);
    };
  }, [router, tablesKey, instanceId, debounceMs]);

  return null;
}
