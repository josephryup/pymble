import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { buildOpsContentSecurityPolicy } from "@/lib/ops/csp";
import {
  canUseOpsLocalRolePreview,
  OPS_LOCAL_ROLE_PREVIEW_COOKIE,
  parseOpsLocalRolePreviewRole,
} from "@/lib/ops/local-role-preview";

const OPS_PATH_PREFIX = "/ops";
const DEFAULT_OPS_HOST = "ops.pymbleconstruction.com";
const OPS_SESSION_REFRESH_TIMEOUT_MS = 2500;

function isStaticAsset(pathname: string) {
  return /\.[a-z0-9]+$/i.test(pathname);
}

function isOpsHost(host: string) {
  const configuredHost = process.env.NEXT_PUBLIC_OPS_HOST ?? DEFAULT_OPS_HOST;
  const normalizedHost = host.split(":")[0]?.toLowerCase() ?? "";

  return (
    normalizedHost === configuredHost.toLowerCase() ||
    normalizedHost.startsWith("ops.")
  );
}

function isRetiredOpsPath(host: string, pathname: string) {
  return (
    pathname === "/ops/setup" ||
    pathname.startsWith("/ops/setup/") ||
    pathname === "/ops/register" ||
    pathname.startsWith("/ops/register/") ||
    pathname === "/ops/signup" ||
    pathname.startsWith("/ops/signup/") ||
    pathname === "/register" ||
    pathname.startsWith("/register/") ||
    pathname === "/signup" ||
    pathname.startsWith("/signup/") ||
    (isOpsHost(host) && (pathname === "/setup" || pathname.startsWith("/setup/")))
  );
}

function shouldApplyOpsSecurityHeaders(host: string, pathname: string) {
  if (pathname.startsWith("/_next") || isStaticAsset(pathname)) {
    return false;
  }

  return (
    isOpsHost(host) ||
    pathname.startsWith(OPS_PATH_PREFIX) ||
    pathname.startsWith("/api/ops")
  );
}

function applyBaselineSecurityHeaders(response: NextResponse) {
  // Applied to every response, including the public marketing site, so the
  // whole origin gets clickjacking + MIME-sniffing + HSTS protection. The
  // stricter ops-only headers (CSP, no-store, noindex) are layered on top.
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  return response;
}

/**
 * Ops endpoints that serve a binary asset rather than a JSON payload, and so
 * must be allowed to keep their own Cache-Control.
 *
 * The blanket `no-store` below is correct and stays: /api/ops responses carry
 * payroll figures, TPINs and finance rows that must not survive in the browser
 * disk or back-button cache. But it was also being applied to the avatar
 * route, silently replacing the `private, max-age=86400, immutable` that route
 * deliberately sets — so every face on every render re-invoked a Node function
 * that does an auth check, a users lookup and an R2 GetObject, and streamed
 * the whole image back through it. An activity feed showing 20 people cost 20
 * invocations, on every render, forever.
 *
 * `private` is the load-bearing word in what the route sets: it permits the
 * user's own browser cache while forbidding the Vercel CDN or any shared proxy
 * from holding an authenticated image. If that ever becomes `public`, a
 * colleague's photo turns world-readable at a guessable URL. Only add paths
 * here that serve non-confidential bytes under their own `private` policy.
 */
export function servesOwnCacheableOpsAsset(pathname: string) {
  return pathname.startsWith("/api/ops/avatar/");
}

function applyOpsSecurityHeaders(
  response: NextResponse,
  host: string,
  pathname: string,
  contentSecurityPolicy: string,
) {
  applyBaselineSecurityHeaders(response);

  if (!shouldApplyOpsSecurityHeaders(host, pathname)) {
    return response;
  }

  if (!servesOwnCacheableOpsAsset(pathname)) {
    response.headers.set("Cache-Control", "no-store, max-age=0");
  }
  response.headers.set("Content-Security-Policy", contentSecurityPolicy);
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(self)");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");

  return response;
}

function hasSupabaseAuthCookie(request: NextRequest) {
  return request.cookies
    .getAll()
    .some((cookie) => cookie.name.startsWith("sb-") && cookie.name.includes("auth-token"));
}

function shouldRefreshOpsSession(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/ops/auth") ||
    pathname === "/ops/login" ||
    isStaticAsset(pathname) ||
    !hasSupabaseAuthCookie(request)
  ) {
    return false;
  }

  return (
    isOpsHost(host) ||
    pathname.startsWith(OPS_PATH_PREFIX) ||
    pathname.startsWith("/api/ops")
  );
}

function hasOpsLocalRolePreview(request: NextRequest, host: string) {
  return Boolean(
    canUseOpsLocalRolePreview(host) &&
      parseOpsLocalRolePreviewRole(
        request.cookies.get(OPS_LOCAL_ROLE_PREVIEW_COOKIE)?.value,
      ),
  );
}

function shouldBlockOpsLocalRolePreviewMutation(request: NextRequest, host: string) {
  if (!hasOpsLocalRolePreview(request, host)) {
    return false;
  }

  const { pathname } = request.nextUrl;

  if (
    pathname === "/api/ops/dev-preview" ||
    pathname === "/api/ops/auth/logout"
  ) {
    return false;
  }

  if (pathname.startsWith("/api/ops")) {
    return true;
  }

  if (pathname.startsWith(OPS_PATH_PREFIX)) {
    return request.method !== "GET" && request.method !== "HEAD" && request.method !== "OPTIONS";
  }

  return false;
}

function copyResponseCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie);
  });
}

async function refreshOpsSession(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let response = NextResponse.next({ request });

  if (!supabaseUrl || !supabaseAnonKey || !shouldRefreshOpsSession(request)) {
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        response = NextResponse.next({ request });

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  // The timeout handle is kept so it can be cleared once the race settles.
  // Promise.race resolves on the FIRST settle, but it does not cancel the
  // loser: an uncleared timer stayed pending on the event loop for up to
  // 2.5s after every ops request had already been answered, keeping the
  // Fluid instance from going idle. Clearing it costs nothing and lets the
  // instance settle as soon as the work is actually done.
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  try {
    await Promise.race([
      supabase.auth.getClaims(),
      new Promise((resolve) => {
        timeoutHandle = setTimeout(resolve, OPS_SESSION_REFRESH_TIMEOUT_MS);
      }),
    ]).catch(() => undefined);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }

  return response;
}

export async function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const { pathname } = request.nextUrl;
  const isDev = process.env.NODE_ENV !== "production";
  // Static (cache-stable) policy: the offline-first service worker caches
  // page HTML with its CSP header, so a per-request value cannot be used
  // without breaking offline navigation. See src/lib/ops/csp.ts.
  const contentSecurityPolicy = buildOpsContentSecurityPolicy({ isDev });

  if (shouldBlockOpsLocalRolePreviewMutation(request, host)) {
    const response = pathname.startsWith("/api/ops")
      ? NextResponse.json(
          { error: "Local role preview is read-only." },
          { status: 403 },
        )
      : NextResponse.redirect(new URL("/ops?error=local_preview_read_only", request.url), {
          status: 303,
        });

    return applyOpsSecurityHeaders(response, host, pathname, contentSecurityPolicy);
  }

  if (isRetiredOpsPath(host, pathname)) {
    return applyOpsSecurityHeaders(
      new NextResponse(null, { status: 404 }),
      host,
      pathname,
      contentSecurityPolicy,
    );
  }

  const authResponse = await refreshOpsSession(request);

  if (
    !isOpsHost(host) ||
    pathname.startsWith(OPS_PATH_PREFIX) ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    isStaticAsset(pathname)
  ) {
    return applyOpsSecurityHeaders(authResponse, host, pathname, contentSecurityPolicy);
  }

  const nextUrl = request.nextUrl.clone();
  nextUrl.pathname =
    pathname === "/" ? OPS_PATH_PREFIX : `${OPS_PATH_PREFIX}${pathname}`;

  const rewriteResponse = NextResponse.rewrite(nextUrl, { request });
  copyResponseCookies(authResponse, rewriteResponse);

  return applyOpsSecurityHeaders(rewriteResponse, host, pathname, contentSecurityPolicy);
}

export const config = {
  matcher: [
    // Listed explicitly, and FIRST, so that no path under them can ever be
    // dropped by the static-asset exclusion in the catch-all below. A request
    // to /api/ops/anything.png must still reach this proxy — otherwise a
    // crafted extension would be a way to skip the ops security headers and
    // the local-role-preview mutation block.
    "/ops/:path*",
    "/api/ops/:path*",
    // Bare redirect into /ops/auth/callback, but it forwards OAuth params, so
    // it keeps proxy coverage rather than relying on the destination alone.
    "/auth/:path*",
    // Retired paths, 404'd by isRetiredOpsPath. They resolve to nothing in the
    // build either way; this keeps the existing behaviour exactly.
    "/register/:path*",
    "/signup/:path*",
    // Everything else — this is what powers the ops-host path rewrite, so it
    // cannot be dropped, but it no longer needs to run for static files.
    //
    // Until now this proxy ran on EVERY request: X-Frame-Options was
    // observable on /logo.png, on a 1.7MB PDF, and on / while it was being
    // served from the CDN (X-Vercel-Cache: HIT). Because a proxy is a Node
    // function on Vercel (every deployment reports lambdaRuntimeStats
    // {"nodejs":3}, no edge runtime), each of those was billed Fluid CPU —
    // and for a static asset all it did was attach four headers that
    // next.config.ts now sets at the edge for free.
    //
    // The extension list is the set actually present in public/ plus the
    // common font/style types, deliberately NOT including .json, .csv or
    // .webmanifest: those could plausibly be dynamic routes, and
    // /ops/manifest.webmanifest is one.
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpe?g|webp|avif|gif|svg|ico|mp4|webm|mov|pdf|txt|xlsx|ai|js|mjs|map|css|woff2?|ttf|otf|eot)$).*)",
  ],
};
