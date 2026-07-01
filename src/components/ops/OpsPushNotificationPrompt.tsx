"use client";

import { Bell, X } from "lucide-react";
import { useEffect, useState } from "react";
import { subscribeOpsPushAction } from "@/lib/ops/push-subscription-actions";

const DISMISS_STORAGE_KEY = "pymble-ops-push-dismissed-at";
const DISMISS_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

function isPushSupported() {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

function recentlyDismissed() {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(DISMISS_STORAGE_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    return Number.isFinite(ts) && Date.now() - ts < DISMISS_COOLDOWN_MS;
  } catch {
    return false;
  }
}

// applicationServerKey must be a Uint8Array, but env vars are base64url strings.
function urlBase64ToUint8Array(base64Url: string) {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

async function registerSubscription(vapidPublicKey: string) {
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      userVisibleOnly: true,
    }));

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false;

  const result = await subscribeOpsPushAction({
    endpoint: json.endpoint,
    keys: { auth: json.keys.auth, p256dh: json.keys.p256dh },
    userAgent: navigator.userAgent,
  });
  return result.ok;
}

/**
 * Asks the signed-in ops user to turn on OS-level notifications for the
 * installed PWA — so alerts (approvals, HSE escalations, material request
 * updates, ...) reach them even when the app is closed or backgrounded.
 *
 * Only ever requests permission from an explicit click on "Turn on" — never
 * auto-prompts. Browsers penalize (and Safari on iOS effectively requires a
 * gesture for) unsolicited permission requests, and a denied prompt can't be
 * re-asked without the user changing browser settings themselves.
 *
 * If permission was already granted in a previous session (e.g. re-install,
 * cleared cache), silently refreshes the subscription in the background with
 * no banner — `Notification.permission === "granted"` means
 * pushManager.subscribe() will not show a browser prompt.
 */
export function OpsPushNotificationPrompt() {
  const [visible, setVisible] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);

  useEffect(() => {
    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidPublicKey || !isPushSupported()) return;

    if (Notification.permission === "granted") {
      registerSubscription(vapidPublicKey).catch(() => {
        // Silent — this is a background refresh, not a user-initiated action.
      });
      return;
    }

    if (Notification.permission === "default" && !recentlyDismissed()) {
      setVisible(true);
    }
  }, []);

  function dismiss() {
    setVisible(false);
    try {
      window.localStorage.setItem(DISMISS_STORAGE_KEY, String(Date.now()));
    } catch {
      // ignore quota / private-mode errors
    }
  }

  async function enable() {
    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidPublicKey || isRequesting) return;

    setIsRequesting(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        await registerSubscription(vapidPublicKey);
      }
    } catch {
      // Swallow — worst case the user just doesn't get push this session.
    } finally {
      setIsRequesting(false);
      dismiss();
    }
  }

  if (!visible) return null;

  return (
    <div
      className="rounded-lg border border-primary-blue/30 bg-primary-blue/5 p-4 shadow-sm"
      role="region"
      aria-label="Turn on ops notifications"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-blue text-white">
          <Bell className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-heading text-base font-bold text-foreground">
            Turn on notifications
          </p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Get alerted the moment something needs you — approvals, HSE escalations, material
            request updates — even when Pymble Operations is closed.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="inline-flex items-center gap-1.5 rounded-md bg-primary-blue px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-primary-blue/88 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isRequesting}
              onClick={enable}
              type="button"
            >
              <Bell className="size-4" aria-hidden="true" />
              {isRequesting ? "Requesting..." : "Turn on"}
            </button>
            <button
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-semibold text-muted-foreground transition hover:bg-muted"
              onClick={dismiss}
              type="button"
            >
              <X className="size-4" aria-hidden="true" />
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
