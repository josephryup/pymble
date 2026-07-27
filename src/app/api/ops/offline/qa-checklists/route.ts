import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getOptionalOpsUser } from "@/lib/ops/auth";
import { startQaChecklistCore } from "@/lib/ops/qa-checklist-core";
import { checkOpsOfflineReplayRateLimit } from "@/lib/ops/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Replay endpoint for site checklists started offline. Site inspections happen
 * exactly where signal fails, so starting one must survive a dead connection.
 *
 * See src/app/api/ops/offline/attendance/route.ts for why this is a plain
 * Route Handler rather than the server action itself.
 */
export async function POST(request: Request) {
  const auth = await getOptionalOpsUser();

  if (!auth) {
    return NextResponse.json(
      { message: "Sign in again, then resubmit this checklist.", ok: false },
      { status: 401 },
    );
  }

  const rateLimit = await checkOpsOfflineReplayRateLimit(
    auth.profile.id,
    "qa-checklists",
    request.headers,
  );

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { message: "Too many checklist syncs. The outbox will retry shortly.", ok: false },
      {
        status: 429,
        headers: { "Retry-After": String(Math.max(rateLimit.retryAfterSeconds, 1)) },
      },
    );
  }

  const formData = await request.formData();
  const result = await startQaChecklistCore(formData, auth.profile);

  if (!result.ok) {
    return NextResponse.json({ message: result.message, ok: false }, { status: 422 });
  }

  revalidatePath("/ops/site-checklists");

  return NextResponse.json({ id: result.id, ok: true });
}
