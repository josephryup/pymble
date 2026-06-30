"use client";

import { CloudOff, RefreshCw, CircleCheck, CircleAlert } from "lucide-react";
import { useCallback, useEffect, useSyncExternalStore, useState } from "react";
import {
  flushOutbox,
  listOutbox,
  subscribeOutbox,
  type OpsOutboxIntent,
} from "@/lib/ops/offline/outbox";

/**
 * Shell indicator showing how many offline actions are waiting to sync.
 *
 *  - "All synced" when the outbox is empty.
 *  - "N items waiting" when there are pending or failed intents.
 *  - "Sync failed" with a retry button when an attempt errored.
 *
 * Mounted once in the workspace layout so it can listen to outbox changes
 * globally and trigger a flush whenever the network comes back.
 */

function subscribeNetwork(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

export function OpsSyncIndicator() {
  const [items, setItems] = useState<OpsOutboxIntent[]>([]);
  const [busy, setBusy] = useState(false);
  // useSyncExternalStore provides the correct server snapshot (true = online)
  // and subscribes to native online/offline events — no hydration mismatch.
  const online = useSyncExternalStore(
    subscribeNetwork,
    () => navigator.onLine,
    () => true,
  );

  const refresh = useCallback(async () => {
    try {
      const next = await listOutbox();
      setItems(next);
    } catch {
      // IndexedDB unavailable (private mode, etc.) — silently treat as empty.
      setItems([]);
    }
  }, []);

  const flush = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await flushOutbox();
    } finally {
      setBusy(false);
      await refresh();
    }
  }, [busy, refresh]);

  useEffect(() => {
    refresh();
    const unsubOutbox = subscribeOutbox(() => refresh());
    // Flush the outbox whenever we reconnect — called from event callback,
    // not directly in the effect body, to comply with no-state-in-effect.
    const onReconnect = () => flush();
    window.addEventListener("online", onReconnect);
    return () => {
      unsubOutbox();
      window.removeEventListener("online", onReconnect);
    };
  }, [flush, refresh]);

  const pending = items.filter((i) => i.status === "pending" || i.status === "in_flight").length;
  const failed = items.filter((i) => i.status === "failed").length;
  const dead = items.filter((i) => i.status === "dead_letter").length;

  if (pending === 0 && failed === 0 && dead === 0 && online) {
    return null;
  }

  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 text-xs shadow-sm shadow-foreground/[0.03]">
      {!online ? (
        <p className="flex items-center gap-2 font-semibold text-amber-700">
          <CloudOff aria-hidden className="h-3.5 w-3.5" />
          Working offline — items will sync when you reconnect
        </p>
      ) : pending > 0 ? (
        <p className="flex items-center gap-2 font-semibold text-primary">
          <RefreshCw aria-hidden className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
          Syncing {pending} item{pending === 1 ? "" : "s"}…
        </p>
      ) : failed > 0 ? (
        <button
          className="flex w-full items-center justify-between gap-2 text-left font-semibold text-orange-700"
          onClick={flush}
          type="button"
        >
          <span className="flex items-center gap-2">
            <CircleAlert aria-hidden className="h-3.5 w-3.5" />
            {failed} item{failed === 1 ? "" : "s"} failed — tap to retry
          </span>
        </button>
      ) : dead > 0 ? (
        <p className="flex items-center gap-2 font-semibold text-red-700">
          <CircleAlert aria-hidden className="h-3.5 w-3.5" />
          {dead} item{dead === 1 ? "" : "s"} rejected — review and discard
        </p>
      ) : (
        <p className="flex items-center gap-2 font-semibold text-emerald-700">
          <CircleCheck aria-hidden className="h-3.5 w-3.5" />
          All synced
        </p>
      )}
    </div>
  );
}
