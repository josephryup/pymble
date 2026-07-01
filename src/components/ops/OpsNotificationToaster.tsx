"use client";

import { Bell, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getOpsSupabaseBrowserClient } from "@/lib/ops/supabase-browser";
import {
  playOpsNotificationChime,
  primeOpsNotificationSound,
} from "@/lib/ops/notification-sound";

type Toast = {
  key: number;
  title: string;
  body: string;
  actionHref: string | null;
  isAction: boolean;
};

const TOAST_TTL_MS = 6500;
const MAX_TOASTS = 3;

/**
 * Shows a brief toast in the top-right whenever a new unread notification is
 * inserted for the current user. Subscribes to Supabase Realtime (RLS-scoped to
 * recipient_id = me). Complements the floating dock + the shell auto-refresh;
 * this one is purely the "something just happened" nudge. No-ops when the
 * browser Supabase client is unavailable.
 */
export function OpsNotificationToaster({ userId }: { userId: string }) {
  const router = useRouter();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = (key: number) => {
    setToasts((prev) => prev.filter((toast) => toast.key !== key));
    const timer = timers.current.get(key);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(key);
    }
  };

  useEffect(() => {
    if (!userId) return;
    const supabase = getOpsSupabaseBrowserClient();
    if (!supabase) return;

    const timersAtMount = timers.current;
    const cleanupSound = primeOpsNotificationSound();
    const channel = supabase
      .channel(`ops-notification-toaster:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${userId}`,
        },
        (payload: { new?: Record<string, unknown> | null }) => {
          const row = payload.new;
          if (!row) return;
          const status = typeof row.status === "string" ? row.status : "unread";
          if (status !== "unread") return;

          const rawHref = typeof row.action_href === "string" ? row.action_href : null;
          const actionHref =
            rawHref && (rawHref === "/ops" || rawHref.startsWith("/ops/")) ? rawHref : null;
          const key = Date.now() + Math.random();
          const toast: Toast = {
            key,
            title: typeof row.title === "string" ? row.title : "New notification",
            body: typeof row.body === "string" ? row.body : "",
            actionHref,
            isAction: row.category === "action",
          };

          setToasts((prev) => [toast, ...prev].slice(0, MAX_TOASTS));
          playOpsNotificationChime();
          const timer = setTimeout(() => {
            setToasts((prev) => prev.filter((item) => item.key !== key));
            timersAtMount.delete(key);
          }, TOAST_TTL_MS);
          timersAtMount.set(key, timer);
        },
      )
      .subscribe();

    return () => {
      cleanupSound();
      timersAtMount.forEach((timer) => clearTimeout(timer));
      timersAtMount.clear();
      supabase.removeChannel(channel).catch(() => null);
    };
  }, [userId]);

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed z-[70] flex w-[20rem] max-w-[calc(100vw-2.5rem)] flex-col gap-2 print:hidden"
      style={{
        top: "max(1.25rem, env(safe-area-inset-top))",
        right: "max(1.25rem, env(safe-area-inset-right))",
      }}
    >
      {toasts.map((toast) => (
        <div
          key={toast.key}
          className={`overflow-hidden rounded-xl border bg-card shadow-2xl ${
            toast.isAction ? "border-primary/30 border-l-4 border-l-primary" : "border-border"
          }`}
        >
          <div className="flex items-start gap-3 p-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary-blue text-white">
              <Bell className="size-4" aria-hidden="true" />
            </span>
            <button
              type="button"
              onClick={() => {
                if (toast.actionHref) router.push(toast.actionHref);
                dismiss(toast.key);
              }}
              className="min-w-0 flex-1 text-left"
            >
              <span className="block truncate text-sm font-bold text-foreground">
                {toast.title}
              </span>
              {toast.body ? (
                <span className="mt-0.5 line-clamp-2 block text-xs leading-5 text-muted-foreground">
                  {toast.body}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              onClick={() => dismiss(toast.key)}
              aria-label="Dismiss notification"
              className="rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
