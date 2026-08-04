import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { rejectMismatchedOpsOrigin } from "@/lib/ops/api-security";
import { getOpsAuthCallbackUrlFromRequest } from "@/lib/ops/auth-redirect";
import { checkOpsPublicFormRateLimit } from "@/lib/ops/rate-limit";
import { getOpsSupabaseAnonServerClient } from "@/lib/ops/supabase-server";

const resetPasswordSchema = z.object({
  email: z.string().trim().email(),
});

const RESET_PASSWORD_RESPONSE = {
  message: "If the account exists, a password reset email has been sent.",
} as const;

export async function POST(request: NextRequest) {
  const originError = rejectMismatchedOpsOrigin(request);

  if (originError) {
    return originError;
  }

  // Keyed by IP, not by email, so throttling cannot become an account-existence
  // oracle — the constant RESET_PASSWORD_RESPONSE below exists for exactly that
  // reason. Unthrottled, this route lets anyone email-bomb a known address
  // through our own domain (audit finding S4).
  const rateLimit = await checkOpsPublicFormRateLimit("reset", request.headers);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many reset attempts. Please try again shortly." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.max(rateLimit.retryAfterSeconds, 1)) },
      },
    );
  }

  const payload = await request.json().catch(() => null);
  const parsed = resetPasswordSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const supabase = getOpsSupabaseAnonServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: getOpsAuthCallbackUrlFromRequest(request.nextUrl, "/ops/profile#password"),
  });

  if (error) {
    console.error("Pymble password reset email failed", error.message);
    return NextResponse.json(RESET_PASSWORD_RESPONSE);
  }

  return NextResponse.json(RESET_PASSWORD_RESPONSE);
}
