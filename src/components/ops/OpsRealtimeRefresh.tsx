"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
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

/**
 * Page-level realtime listener. Drop this into any listing page and it will
 * subscribe to row changes on the given tables and call router.refresh() so
 * the server-rendered list updates without a manual reload.
 *
 * This complements the shell-level OpsAutoRefresh, which only watches
 * notifications + approvals + record_comments. Listing pages can opt in to
 * their own tables.
 */
export function OpsRealtimeRefresh({ tables, debounceMs = 500 }: OpsRealtimeRefreshProps) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (tables.length === 0) return;

    const debouncedRefresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        if (typeof document === "undefined" || document.visibilityState === "visible") {
          router.refresh();
        }
      }, debounceMs);
    };

    const supabase = getOpsSupabaseBrowserClient();
    if (!supabase) return; // Env vars missing; no-op (workspace still renders).
    const channelName = `ops-page-realtime:${tables.join(",")}:${Date.now()}`;
    let channel = supabase.channel(channelName);

    for (const table of tables) {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        debouncedRefresh,
      );
    }

    channel.subscribe();

    return () => {
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(channel).catch(() => null);
    };
  }, [router, tables, debounceMs]);

  return null;
}
