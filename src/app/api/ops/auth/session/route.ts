import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { rejectMismatchedOpsOrigin } from "@/lib/ops/api-security";
import { createOpsCookieSessionClient, getOpsUserProfile } from "@/lib/ops/auth";
import {
  getOpsAuthFlowRedirect,
  parseOpsAuthEmailFlow,
  safeOpsRedirectPath,
} from "@/lib/ops/auth-redirect";

const sessionSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  next: z.string().optional().nullable(),
  type: z.string().optional().nullable(),
});

export async function POST(request: NextRequest) {
  const originError = rejectMismatchedOpsOrigin(request);

  if (originError) {
    return originError;
  }

  const parsed = sessionSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { error: "The secure email link could not be verified." },
      { status: 400 },
    );
  }

  const supabase = await createOpsCookieSessionClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.setSession({
    access_token: parsed.data.access_token,
    refresh_token: parsed.data.refresh_token,
  });

  if (error || !user) {
    return NextResponse.json(
      { error: "The secure email link could not be verified." },
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

  const type = parseOpsAuthEmailFlow(parsed.data.type);
  const next = parsed.data.next
    ? safeOpsRedirectPath(parsed.data.next, getOpsAuthFlowRedirect(type))
    : null;

  return NextResponse.json({
    ok: true,
    redirectTo: getOpsAuthFlowRedirect(type, next),
  });
}
