import { NextResponse } from "next/server";
import { rejectMismatchedOpsOrigin } from "@/lib/ops/api-security";
import { createOpsServerSessionClient } from "@/lib/ops/auth";
import { OPS_LOCAL_ROLE_PREVIEW_COOKIE } from "@/lib/ops/local-role-preview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const originError = rejectMismatchedOpsOrigin(request);

  if (originError) {
    return originError;
  }

  const supabase = await createOpsServerSessionClient();
  await supabase.auth.signOut();

  const response = NextResponse.redirect(new URL("/ops/login", request.url), {
    status: 303,
  });

  response.cookies.set(OPS_LOCAL_ROLE_PREVIEW_COOKIE, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "lax",
    secure: false,
  });

  return response;
}
