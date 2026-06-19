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
