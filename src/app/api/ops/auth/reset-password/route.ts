import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { rejectMismatchedOpsOrigin } from "@/lib/ops/api-security";
import { getOpsAuthCallbackUrlFromRequest } from "@/lib/ops/auth-redirect";
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
