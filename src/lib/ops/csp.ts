/**
 * Content-Security-Policy for the ops workspace. Built per-request in
 * src/proxy.ts so production can use a nonce instead of 'unsafe-inline':
 * the proxy forwards the policy on the request headers, Next.js reads the
 * nonce from there and stamps it onto every framework <script> tag, and
 * 'strict-dynamic' lets those trusted scripts load the chunks they import.
 */

/** Base64 nonce from 16 crypto-random bytes. Edge- and Node-runtime safe. */
export function generateOpsCspNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function buildOpsContentSecurityPolicy(options: {
  isDev: boolean;
  nonce?: string;
}) {
  const { isDev, nonce } = options;

  // React in development uses eval() for hot reload + dev tooling, and dev
  // pages are not guaranteed a fresh nonce per render, so development keeps
  // the permissive policy. Production requires the nonce.
  const scriptSrc = isDev
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`;
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
