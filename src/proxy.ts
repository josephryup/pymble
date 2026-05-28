import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

const OPS_PATH_PREFIX = "/ops";
const DEFAULT_OPS_HOST = "ops.pymbleconstruction.com";

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

  await supabase.auth.getClaims();

  return response;
}

export async function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const { pathname } = request.nextUrl;

  if (isRetiredOpsPath(host, pathname)) {
    return new NextResponse(null, { status: 404 });
  }

  const authResponse = await refreshOpsSession(request);

  if (
    !isOpsHost(host) ||
    pathname.startsWith(OPS_PATH_PREFIX) ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    isStaticAsset(pathname)
  ) {
    return authResponse;
  }

  const nextUrl = request.nextUrl.clone();
  nextUrl.pathname =
    pathname === "/" ? OPS_PATH_PREFIX : `${OPS_PATH_PREFIX}${pathname}`;

  const rewriteResponse = NextResponse.rewrite(nextUrl, { request });
  copyResponseCookies(authResponse, rewriteResponse);

  return rewriteResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
