"use client";

import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { OPS_ENTER, OPS_TRANSITION } from "@/lib/ops/motion";

/**
 * Transient action feedback (audit §12).
 *
 * Confirmation used to arrive as a banner pinned to the top of the page — so
 * after editing something near the bottom of a long register, the message
 * appeared somewhere you were not looking, on a page you had just been thrown
 * to the top of.
 *
 * The trick that makes this cheap: every action already reports its result
 * through the URL (`?updated=…`, `?created=…`, `?error=…`). Watching that gives
 * toast coverage across all 363 redirects without touching a single server
 * action — and it keeps working for actions that have not adopted anything new.
 *
 * The flag is stripped from the URL once shown, so a refresh or a back
 * navigation does not replay a stale success message.
 *
 * Deliberately hand-rolled rather than pulling in a toast library: this needs
 * one behaviour, it must match the existing status-tone vocabulary, and adding
 * a dependency for ~120 lines is a poor trade in a codebase this size.
 *
 * Distinct from OpsNotificationToaster, and the split is intentional:
 *   • OpsNotificationToaster — top-right, chime: "something happened elsewhere"
 *   • OpsActionToaster       — bottom-centre, silent: "the thing you just did
 *                              worked"
 * Different origin, different urgency, different place on screen. Merging them
 * would make an incoming approval request look like confirmation of your own
 * save.
 */

type ToastTone = "success" | "error" | "info";

type Toast = {
  id: number;
  tone: ToastTone;
  message: string;
};

const AUTO_DISMISS_MS = 5_000;

/**
 * Turn a URL flag into human text.
 *
 * Deliberately generic: pages already own their specific wording in their own
 * notice maps. This is the safety net for the ~360 actions whose flags nobody
 * has written prose for, so it must never produce something misleading — an
 * unknown flag becomes "Saved.", not an invented sentence.
 */
function messageForFlag(flag: string, raw: string): { tone: ToastTone; message: string } {
  if (flag === "error") {
    return { tone: "error", message: raw };
  }

  const readable = raw
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());

  if (flag === "created") {
    return { tone: "success", message: `${readable} created.` };
  }

  return { tone: "success", message: readable ? `${readable}. Saved.` : "Saved." };
}

export function OpsActionToaster() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  // Guards against re-firing when the router refreshes for another reason.
  const lastHandled = useRef<string | null>(null);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  useEffect(() => {
    if (!searchParams) return;

    const flag = (["error", "updated", "created"] as const).find((key) =>
      searchParams.get(key),
    );
    if (!flag) return;

    const raw = searchParams.get(flag) ?? "";
    const signature = `${pathname}?${flag}=${raw}`;
    if (lastHandled.current === signature) return;
    lastHandled.current = signature;

    const { tone, message } = messageForFlag(flag, raw);
    const id = nextId.current++;
    setToasts((current) => [...current, { id, tone, message }]);

    // Strip the flag so a refresh or Back does not replay it. `replace` keeps
    // history clean; `scroll: false` matters because the user may already have
    // scrolled to what they were doing.
    const params = new URLSearchParams(searchParams.toString());
    params.delete(flag);
    const query = params.toString();
    router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });

    const timer = setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [dismiss, pathname, router, searchParams]);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 sm:bottom-6"
    >
      {toasts.map((toast) => (
        <div
          className={`pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg ${OPS_ENTER} ${
            toast.tone === "error"
              ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950 dark:text-red-100"
              : toast.tone === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950 dark:text-emerald-100"
                : "border-border bg-card text-foreground"
          }`}
          key={toast.id}
          role={toast.tone === "error" ? "alert" : "status"}
        >
          {toast.tone === "error" ? (
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          ) : toast.tone === "success" ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          ) : (
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          )}
          <p className="flex-1 font-semibold leading-5">{toast.message}</p>
          <button
            aria-label="Dismiss"
            className={`shrink-0 rounded p-0.5 opacity-70 hover:opacity-100 ${OPS_TRANSITION}`}
            onClick={() => dismiss(toast.id)}
            type="button"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}
