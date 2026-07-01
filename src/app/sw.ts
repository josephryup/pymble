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
