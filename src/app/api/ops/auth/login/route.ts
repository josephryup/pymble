import { NextResponse } from "next/server";
import { z } from "zod";
import { rejectMismatchedOpsOrigin } from "@/lib/ops/api-security";
import { createOpsCookieSessionClient, getOpsUserProfile } from "@/lib/ops/auth";
import { OPS_LOCAL_ROLE_PREVIEW_COOKIE } from "@/lib/ops/local-role-preview";

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
