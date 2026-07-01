import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getOptionalOpsUser } from "@/lib/ops/auth";
import { uploadSitePhotoCore } from "@/lib/ops/photo-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Replay endpoint for site photos queued in the offline outbox while a field
 * worker took a photo with no signal. See
 * src/app/api/ops/offline/attendance/route.ts for why this is a plain Route
 * Handler rather than the server action itself.
 */
export async function POST(request: Request) {
  const auth = await getOptionalOpsUser();

  if (!auth) {
    return NextResponse.json(
      { message: "Sign in again, then re-upload this photo.", ok: false },
      { status: 401 },
    );
  }

  const formData = await request.formData();
  const result = await uploadSitePhotoCore(formData, auth.profile);

  if (!result.ok) {
    return NextResponse.json({ message: result.message, ok: false }, { status: 422 });
  }

  revalidatePath("/ops/photos");

  return NextResponse.json({ id: result.id, ok: true });
}
