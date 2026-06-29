import { NextResponse } from "next/server";
import { runOpsProjectOverdueSweep } from "@/lib/ops/project-task-escalations";
import { timingSafeEqualString } from "@/lib/ops/secure-compare";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json(
      { error: "Scheduled job is not configured.", ok: false },
      { status: 503 },
    );
  }

  if (!timingSafeEqualString(request.headers.get("authorization") ?? "", `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: "Unauthorized", ok: false }, { status: 401 });
  }

  const result = await runOpsProjectOverdueSweep();
  return NextResponse.json({ ok: true, result });
}
