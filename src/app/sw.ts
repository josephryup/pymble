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

/**
 * Pymble Operations service worker.
 *
 * Scope is the entire site but our runtime caching rules only kick in for
 * /ops paths — the marketing site keeps its current behaviour.
 *
 * Strategy:
 *  - Precache the Next.js build manifest (shell + static assets)
 *  - Use Serwist's defaults for typical asset traffic
 *  - The IndexedDB outbox (src/lib/ops/offline/outbox.ts) handles outbound
 *    writes; this worker does NOT intercept POSTs — replay is owned by the
 *    page so we keep failed attempts visible to the user.
 */
const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
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
