import { NextResponse, type NextRequest } from "next/server";
import { createOpsServerSessionClient } from "@/lib/ops/auth";

function safeOpsNext(value: string | null) {
  if (!value || !value.startsWith("/ops") || value.startsWith("//")) {
    return "/ops/profile?updated=welcome";
  }

  return value;
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = safeOpsNext(requestUrl.searchParams.get("next"));

  if (code) {
    const supabase = await createOpsServerSessionClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(new URL(next, requestUrl.origin));
    }
  }

  return NextResponse.redirect(
    new URL(
      `/ops/login?error=${encodeURIComponent("The secure email link could not be verified.")}`,
      requestUrl.origin,
    ),
  );
}
