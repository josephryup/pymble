import { NextResponse } from "next/server";
import { runOpsScheduledEscalationSweep } from "@/lib/ops/escalations";
import { sweepOpsLoanArrears } from "@/lib/ops/loans";
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

  const result = await runOpsScheduledEscalationSweep();

  // Loan arrears ride the same daily sweep. A missed instalment is the one
  // thing in the loans module nobody discovers by opening a page — it happens
  // on a date, in silence, and the penalty interest lands weeks later.
  //
  // Run separately rather than folded into the sweep so a failure in either
  // cannot take the other down, and caught so an arrears problem never costs
  // the escalation run its result.
  const loanArrears = await sweepOpsLoanArrears().catch((error: unknown) => ({
    error: error instanceof Error ? error.message : "Loan arrears sweep failed",
  }));

  return NextResponse.json({ loanArrears, ok: true, result });
}
