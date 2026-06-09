import { NextResponse } from "next/server";
import { runOpsHseScheduledEscalationSweep } from "@/lib/ops/hse-executive";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json(
      { error: "Scheduled job is not configured.", ok: false },
      { status: 503 },
    );
  }

  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized", ok: false }, { status: 401 });
  }

  const result = await runOpsHseScheduledEscalationSweep();

  return NextResponse.json({ ok: true, result });
}
