/**
 * Content-Security-Policy for the ops workspace.
 *
 * NOTE ON script-src: production uses `'self' 'unsafe-inline'`, NOT a
 * per-request nonce. The ops workspace is an offline-first PWA whose service
 * worker caches page HTML (and its CSP response header) so field crews can
 * keep working with no signal. A per-request nonce is fundamentally
 * incompatible with that: each cached page carries a different `nonce-XYZ`,
 * and client-side (RSC) navigation between cached pages then runs one page's
 * scripts under another page's enforced nonce. With `'strict-dynamic'` the
 * browser ignores `'self'`, so those mismatched scripts are blocked and
 * offline navigation dies. Offline is a hard requirement here, so the policy
 * must be cache-stable. Every other directive below is already static and is
 * kept as tight as the app allows.
 */

export function buildOpsContentSecurityPolicy(options: { isDev: boolean }) {
  const { isDev } = options;

  // React in development uses eval() for hot reload + dev tooling. Production
  // never calls eval(). Inline is required because Next.js emits inline
  // bootstrap/flight scripts and the SW must be able to replay them offline
  // (a nonce cannot survive caching — see the file header).
  const scriptSrc = isDev
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'";
  // Supabase Realtime opens a websocket (`wss://*.supabase.co/realtime/...`),
  // so `wss:` to the Supabase origins must be allowed in production too,
  // otherwise the OpsAutoRefresh + OpsRealtimeRefresh subscriptions silently
  // fail and the workspace looks stale.
  const connectSrc = isDev
    ? "connect-src 'self' ws: wss: https://*.supabase.co https://*.supabase.in https://*.sentry.io https://*.ingest.sentry.io https://vitals.vercel-insights.com https://*.vercel-insights.com"
    : "connect-src 'self' wss://*.supabase.co wss://*.supabase.in https://*.supabase.co https://*.supabase.in https://*.sentry.io https://*.ingest.sentry.io https://vitals.vercel-insights.com https://*.vercel-insights.com";

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://tile.openstreetmap.org https://*.tile.openstreetmap.org https://*.r2.cloudflarestorage.com",
    "font-src 'self' data:",
    connectSrc,
    "media-src 'self' data: blob:",
    "worker-src 'self' blob:",
  ].join("; ");
}
