/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import {
  type PrecacheEntry,
  type SerwistGlobalConfig,
  Serwist,
} from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// Bump this string whenever src/app/ops/offline/page.tsx's content changes so
// Serwist knows to re-fetch and re-precache it. Next doesn't include plain
// app-router pages in its build manifest (only JS/CSS/static assets), so this
// one page is added by hand as the offline navigation fallback.
const OPS_OFFLINE_FALLBACK_REVISION = "1";
const OPS_OFFLINE_FALLBACK_URL = "/ops/offline";

/**
 * Pymble Operations service worker.
 *
 * Scope is the entire site but our runtime caching rules only kick in for
 * /ops paths — the marketing site keeps its current behaviour.
 *
 * Strategy:
 *  - Precache the Next.js build manifest (shell + static assets)
 *  - Use Serwist's defaults for typical asset traffic
 *  - Fall back to /ops/offline (precached by hand, see above) when a
 *    navigation fails offline, instead of the browser's raw error page
 *  - The IndexedDB outbox (src/lib/ops/offline/outbox.ts) handles outbound
 *    writes; this worker does NOT intercept POSTs — replay is owned by the
 *    page so we keep failed attempts visible to the user.
 */
const serwist = new Serwist({
  precacheEntries: [
    ...(self.__SW_MANIFEST ?? []),
    { url: OPS_OFFLINE_FALLBACK_URL, revision: OPS_OFFLINE_FALLBACK_REVISION },
  ],
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
  fallbacks: {
    entries: [
      {
        url: OPS_OFFLINE_FALLBACK_URL,
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
});

serwist.addEventListeners();

/**
 * One-time purge of the page runtime caches on activation.
 *
 * Earlier builds cached page HTML alongside a per-request nonce CSP header.
 * That made cached soft-navigation break offline (a page's scripts ran under
 * another page's enforced nonce). The CSP is now static and cache-stable, but
 * clients that installed the old worker still hold those poisoned entries in
 * the NetworkFirst page caches. Dropping them here forces a clean re-cache
 * from the first online navigation after this worker takes over.
 */
const OPS_PAGE_CACHES_TO_RESET = [
  "pages",
  "pages-rsc",
  "pages-rsc-prefetch",
  "others",
];

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await Promise.all(
        OPS_PAGE_CACHES_TO_RESET.map((name) => caches.delete(name).catch(() => false)),
      );
    })(),
  );
});

/**
 * Web Push handlers.
 *
 * Independent of Serwist's precache/runtime-cache listeners above — this is
 * what lets the ops PWA show an OS-level notification even when it's closed
 * or backgrounded. The payload shape is produced by sendOpsPushToUser in
 * src/lib/ops/push-sender.ts.
 */
type OpsPushPayload = {
  actionHref?: string;
  body?: string;
  tag?: string;
  title?: string;
};

function safeOpsPushHref(href: string | undefined) {
  return href && (href === "/ops" || href.startsWith("/ops/")) ? href : "/ops/notifications";
}

self.addEventListener("push", (event) => {
  let payload: OpsPushPayload = {};
  try {
    payload = event.data ? (event.data.json() as OpsPushPayload) : {};
  } catch {
    payload = { body: event.data?.text() };
  }

  const href = safeOpsPushHref(payload.actionHref);

  event.waitUntil(
    self.registration.showNotification(payload.title || "Pymble Operations", {
      badge: "/favicon.png",
      body: payload.body || "",
      data: { href },
      icon: "/favicon.png",
      tag: payload.tag || "ops-notification",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = safeOpsPushHref((event.notification.data as { href?: string } | undefined)?.href);

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
      const opsWindow = windows.find((client) => client.url.includes("/ops"));

      if (opsWindow && "focus" in opsWindow) {
        await opsWindow.focus();
        if ("navigate" in opsWindow) {
          await (opsWindow as WindowClient).navigate(href);
        }
        return;
      }

      await self.clients.openWindow(href);
    })(),
  );
});

/**
 * Background Sync — drain the offline outbox when connectivity returns
 * (audit §7, Option A).
 *
 * Why this exists: the outbox previously only drained while the app was OPEN
 * and the `online` event fired in that tab. On site that is the wrong
 * assumption — someone records attendance in a dead spot, locks the phone, and
 * the queue sits untouched until they happen to reopen the workspace. This
 * lets the browser wake the worker instead.
 *
 * The worker cannot replay the intents itself: the outbox lives in IndexedDB
 * behind app code (auth, Supabase clients, server actions) that a service
 * worker has no access to. So the strategy is:
 *
 *   1. if a window is open, tell it to flush — it has everything it needs;
 *   2. if none is open, keep the sync registration alive by rejecting, so the
 *      browser retries later with its own backoff rather than dropping the
 *      work silently.
 *
 * Rejecting is deliberate. A resolved sync event means "handled"; resolving
 * without having flushed anything would quietly discard the retry, which is
 * exactly the failure mode this is meant to remove.
 */
const OPS_OUTBOX_SYNC_TAG = "ops-outbox-sync";

self.addEventListener("sync", (event) => {
  const syncEvent = event as ExtendableEvent & { tag?: string };
  if (syncEvent.tag !== OPS_OUTBOX_SYNC_TAG) {
    return;
  }

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        includeUncontrolled: true,
        type: "window",
      });

      const opsWindows = windows.filter((client) => client.url.includes("/ops"));
      if (opsWindows.length === 0) {
        // No client to do the work. Throwing keeps the registration pending so
        // the browser tries again — silently succeeding would strand the queue.
        throw new Error("ops-outbox-sync: no ops client available to flush");
      }

      for (const client of opsWindows) {
        client.postMessage({ type: "ops:flush-outbox" });
      }
    })(),
  );
});
