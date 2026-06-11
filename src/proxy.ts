import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import {
  canUseOpsLocalRolePreview,
  OPS_LOCAL_ROLE_PREVIEW_COOKIE,
  parseOpsLocalRolePreviewRole,
} from "@/lib/ops/local-role-preview";

const OPS_PATH_PREFIX = "/ops";
const DEFAULT_OPS_HOST = "ops.pymbleconstruction.com";
const OPS_SESSION_REFRESH_TIMEOUT_MS = 2500;

function opsContentSecurityPolicy() {
  // React in development uses eval() for hot reload + dev tooling. Production
  // builds never call eval() so we keep production strict.
  const isDev = process.env.NODE_ENV !== "production";
  const scriptSrc = isDev
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'";
  const connectSrc = isDev
    ? "connect-src 'self' ws: wss: https://*.supabase.co https://*.supabase.in https://*.sentry.io https://*.ingest.sentry.io https://vitals.vercel-insights.com https://*.vercel-insights.com"
    : "connect-src 'self' https://*.supabase.co https://*.supabase.in https://*.sentry.io https://*.ingest.sentry.io https://vitals.vercel-insights.com https://*.vercel-insights.com";

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

function applyOpsSecurityHeaders(
  response: NextResponse,
  host: string,
  pathname: string,
) {
  if (!shouldApplyOpsSecurityHeaders(host, pathname)) {
    return response;
  }

  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Content-Security-Policy", opsContentSecurityPolicy());
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(self)");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
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

  await Promise.race([
    supabase.auth.getClaims(),
    new Promise((resolve) => {
      setTimeout(resolve, OPS_SESSION_REFRESH_TIMEOUT_MS);
    }),
  ]).catch(() => undefined);

  return response;
}

export async function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const { pathname } = request.nextUrl;

  if (shouldBlockOpsLocalRolePreviewMutation(request, host)) {
    const response = pathname.startsWith("/api/ops")
      ? NextResponse.json(
          { error: "Local role preview is read-only." },
          { status: 403 },
        )
      : NextResponse.redirect(new URL("/ops?error=local_preview_read_only", request.url), {
          status: 303,
        });

    return applyOpsSecurityHeaders(response, host, pathname);
  }

  if (isRetiredOpsPath(host, pathname)) {
    return applyOpsSecurityHeaders(new NextResponse(null, { status: 404 }), host, pathname);
  }

  const authResponse = await refreshOpsSession(request);

  if (
    !isOpsHost(host) ||
    pathname.startsWith(OPS_PATH_PREFIX) ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    isStaticAsset(pathname)
  ) {
    return applyOpsSecurityHeaders(authResponse, host, pathname);
  }

  const nextUrl = request.nextUrl.clone();
  nextUrl.pathname =
    pathname === "/" ? OPS_PATH_PREFIX : `${OPS_PATH_PREFIX}${pathname}`;

  const rewriteResponse = NextResponse.rewrite(nextUrl, { request });
  copyResponseCookies(authResponse, rewriteResponse);

  return applyOpsSecurityHeaders(rewriteResponse, host, pathname);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
