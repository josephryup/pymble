import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getOptionalOpsUser } from "@/lib/ops/auth";
import { createAttendanceRecordCore } from "@/lib/ops/attendance-core";
import { checkOpsOfflineReplayRateLimit } from "@/lib/ops/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Replay endpoint for attendance records queued in the offline outbox
 * (src/lib/ops/offline/outbox.ts) while a field worker had no signal.
 *
 * This is a plain Route Handler rather than the server action directly: a
 * raw `fetch()` replay can't invoke a Next.js Server Action (that requires
 * React's client-side RPC protocol), and calling `requireOpsUser()` here
 * would `redirect()` an expired session to /ops/login — which `fetch`
 * follows by default, turning an auth failure into a false "200 OK" for the
 * outbox. So auth failures return an explicit 401 instead.
 */
export async function POST(request: Request) {
  const auth = await getOptionalOpsUser();

  if (!auth) {
    return NextResponse.json(
      { message: "Sign in again, then resubmit this attendance record.", ok: false },
      { status: 401 },
    );
  }

  const rateLimit = await checkOpsOfflineReplayRateLimit(
    auth.profile.id,
    "attendance",
    request.headers,
  );

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { message: "Too many attendance syncs. The outbox will retry shortly.", ok: false },
      {
        status: 429,
        headers: { "Retry-After": String(Math.max(rateLimit.retryAfterSeconds, 1)) },
      },
    );
  }

  const formData = await request.formData();
  const result = await createAttendanceRecordCore(formData, auth.profile);

  if (!result.ok) {
    return NextResponse.json({ message: result.message, ok: false }, { status: 422 });
  }

  revalidatePath("/ops");
  revalidatePath("/ops/attendance");

  return NextResponse.json({ id: result.id, ok: true });
}
