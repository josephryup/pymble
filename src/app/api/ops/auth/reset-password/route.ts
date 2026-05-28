import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getOpsAuthCallbackUrlFromRequest } from "@/lib/ops/auth-redirect";
import { getOpsSupabaseAnonServerClient } from "@/lib/ops/supabase-server";

const resetPasswordSchema = z.object({
  email: z.string().trim().email(),
});

export async function POST(request: NextRequest) {
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
    return NextResponse.json(
      { error: "Password reset email could not be sent right now." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    message: "If the account exists, a password reset email has been sent.",
  });
}
