import { NextResponse } from "next/server";
import { z } from "zod";
import { trackOpsEvent } from "@/lib/ops/analytics";
import { rejectMismatchedOpsOrigin } from "@/lib/ops/api-security";
import { createOpsCookieSessionClient, getOpsUserProfile } from "@/lib/ops/auth";
import { OPS_LOCAL_ROLE_PREVIEW_COOKIE } from "@/lib/ops/local-role-preview";
import {
  checkOpsLoginRateLimit,
  resetOpsLoginRateLimit,
} from "@/lib/ops/rate-limit";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  const originError = rejectMismatchedOpsOrigin(request);

  if (originError) {
    return originError;
  }

  const parsed = loginSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email and password." }, { status: 400 });
  }

  const rateLimit = await checkOpsLoginRateLimit(parsed.data.email, request.headers);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many login attempts. Wait a few minutes and try again." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.max(rateLimit.retryAfterSeconds, 1)) },
      },
    );
  }

  const supabase = await createOpsCookieSessionClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.signInWithPassword(parsed.data);

  if (error || !user) {
    return NextResponse.json(
      { error: "Login failed. Check your credentials." },
      { status: 401 },
    );
  }

  try {
    await getOpsUserProfile(user.id);
  } catch {
    await supabase.auth.signOut();
    return NextResponse.json(
      { error: "This Supabase user is not active in Pymble Operations." },
      { status: 403 },
    );
  }

  trackOpsEvent("ops.login_succeeded");
  await resetOpsLoginRateLimit(parsed.data.email);

  const response = NextResponse.json({ ok: true });

  response.cookies.set(OPS_LOCAL_ROLE_PREVIEW_COOKIE, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "lax",
    secure: false,
  });

  return response;
}
