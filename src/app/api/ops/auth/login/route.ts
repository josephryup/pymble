import { NextResponse } from "next/server";
import { z } from "zod";
import { createOpsServerSessionClient, getOpsUserProfile } from "@/lib/ops/auth";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  const parsed = loginSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email and password." }, { status: 400 });
  }

  const supabase = await createOpsServerSessionClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.signInWithPassword(parsed.data);

  if (error || !user) {
    return NextResponse.json(
      { error: error?.message ?? "Login failed. Check your credentials." },
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

  return NextResponse.json({ ok: true });
}
