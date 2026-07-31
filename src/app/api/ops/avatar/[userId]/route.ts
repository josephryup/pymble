import { NextResponse } from "next/server";
import { requireOpsUser } from "@/lib/ops/auth";
import { logOpsServerError } from "@/lib/ops/log";
import { getOpsR2BucketName, getOpsR2Client } from "@/lib/ops/r2";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import { GetObjectCommand } from "@aws-sdk/client-s3";

/**
 * Serve a person's profile photo (audit §3).
 *
 * Why a route rather than a signed URL on the page: R2 read URLs expire, and an
 * avatar is rendered on every page and beside every timeline entry. Embedding
 * signed URLs would mean re-signing dozens of them on every server render —
 * exactly the kind of per-render cost §8 is trying to remove. A stable route
 * plus browser caching means the image is fetched once and reused.
 *
 * Access: any signed-in workspace user. Colleagues' faces are not confidential
 * inside the company, but they are not public either — an unauthenticated
 * request gets a 401, never the image.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RouteContext = {
  params: Promise<{ userId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  // Authentication only — no role check. Every workspace user sees the same
  // faces in the same lists.
  await requireOpsUser();

  const { userId } = await context.params;
  if (!UUID.test(userId)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data: user } = await supabase
    .from("users")
    .select("avatar_key")
    .eq("id", userId)
    .maybeSingle<{ avatar_key: string | null }>();

  if (!user?.avatar_key) {
    return new NextResponse("Not found", { status: 404 });
  }

  try {
    const object = await getOpsR2Client().send(
      new GetObjectCommand({
        Bucket: getOpsR2BucketName(),
        Key: user.avatar_key,
      }),
    );

    const body = await object.Body?.transformToByteArray();
    if (!body) {
      return new NextResponse("Not found", { status: 404 });
    }

    return new NextResponse(Buffer.from(body), {
      headers: {
        "Content-Type": object.ContentType ?? "image/jpeg",
        // `private` because this is behind auth and must not sit in a shared
        // cache. The URL carries an `?v=` stamped with avatar_updated_at, so a
        // new photo busts the cache immediately despite the long max-age.
        "Cache-Control": "private, max-age=86400, immutable",
      },
    });
  } catch (error) {
    logOpsServerError(error, {
      module: "profile",
      action: "avatar.read",
      entityId: userId,
    });
    return new NextResponse("Not found", { status: 404 });
  }
}
