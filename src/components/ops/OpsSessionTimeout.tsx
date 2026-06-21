"use client";

import { useEffect, useRef } from "react";
import type { OpsUserRole } from "@/lib/ops/types";

type OpsSessionTimeoutProps = {
  role: OpsUserRole;
};

/**
 * Idle-session policy. Time in milliseconds the user can be inactive before
 * the workspace forces a logout. Tightened scopes get tighter timeouts.
 */
const TIMEOUT_BY_ROLE: Record<string, number> = {
  // Finance + HR see sensitive money and PII data — short idle window.
  finance_manager: 60 * 60 * 1000, // 1 hour
  accountant: 60 * 60 * 1000,
  human_resource: 60 * 60 * 1000,
  hr: 60 * 60 * 1000,

  // Leadership has full access — comfortable but bounded.
  managing_director: 8 * 60 * 60 * 1000,
  general_manager: 8 * 60 * 60 * 1000,
  owner: 8 * 60 * 60 * 1000,
  manager: 8 * 60 * 60 * 1000,

  // Developer is treated as a privileged ops user.
  developer: 8 * 60 * 60 * 1000,
};

/** Default for any role not listed above (ops + delivery + HSE + engineering). */
const DEFAULT_TIMEOUT_MS = 4 * 60 * 60 * 1000; // 4 hours

const ACTIVITY_EVENTS = [
  "mousedown",
  "keydown",
  "touchstart",
  "scroll",
  "visibilitychange",
] as const;

/**
 * Auto-logout when the user is inactive past the per-role policy.
 *
 * Mounted once in the workspace layout. Resets a timer on any interaction;
 * when the timer fires, POSTs to the logout endpoint and reloads the page so
 * the cookie-clear takes effect.
 */
export function OpsSessionTimeout({ role }: OpsSessionTimeoutProps) {
  const timeoutMs = TIMEOUT_BY_ROLE[role] ?? DEFAULT_TIMEOUT_MS;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const reset = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(async () => {
        try {
          await fetch("/api/ops/auth/logout", {
            method: "POST",
            credentials: "same-origin",
          });
        } catch {
          // Network error — fall through to the redirect so the user at least
          // sees the login page.
        }
        window.location.assign("/ops/login?reason=idle_timeout");
      }, timeoutMs);
    };

    for (const event of ACTIVITY_EVENTS) {
      document.addEventListener(event, reset, { passive: true });
    }
    reset();

    return () => {
      for (const event of ACTIVITY_EVENTS) {
        document.removeEventListener(event, reset);
      }
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [timeoutMs]);

  return null;
}
