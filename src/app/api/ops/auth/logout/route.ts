import { NextResponse } from "next/server";
import { createOpsServerSessionClient } from "@/lib/ops/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = await createOpsServerSessionClient();
  await supabase.auth.signOut();

  return NextResponse.redirect(new URL("/ops/login", request.url), {
    status: 303,
  });
}
