import { NextResponse, type NextRequest } from "next/server";

export function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const redirectUrl = new URL("/ops/auth/callback", requestUrl.origin);

  requestUrl.searchParams.forEach((value, key) => {
    redirectUrl.searchParams.set(key, value);
  });

  return NextResponse.redirect(redirectUrl);
}
