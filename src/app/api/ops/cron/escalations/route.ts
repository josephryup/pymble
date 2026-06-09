import { NextResponse } from "next/server";
import { runOpsScheduledEscalationSweep } from "@/lib/ops/escalations";

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

  const result = await runOpsScheduledEscalationSweep();

  return NextResponse.json({ ok: true, result });
}
