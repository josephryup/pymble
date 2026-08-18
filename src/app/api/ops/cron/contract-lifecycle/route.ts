import { NextResponse } from "next/server";

import { runOpsContractLifecycleSweep } from "@/lib/ops/contract-lifecycle";
import { timingSafeEqualString } from "@/lib/ops/secure-compare";

/**
 * Daily contract sweep: contracts running out of time, retention falling due
 * for release, and warranties about to lapse. See contract-lifecycle.ts for why
 * each one earns a notification.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json(
      { error: "Scheduled job is not configured.", ok: false },
      { status: 503 },
    );
  }

  if (
    !timingSafeEqualString(
      request.headers.get("authorization") ?? "",
      `Bearer ${cronSecret}`,
    )
  ) {
    return NextResponse.json({ error: "Unauthorized", ok: false }, { status: 401 });
  }

  const result = await runOpsContractLifecycleSweep();
  return NextResponse.json({ ok: true, result });
}
