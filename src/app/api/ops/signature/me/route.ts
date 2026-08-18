import { NextResponse } from "next/server";

import { loadMyOpsSignatureSpecimenBytes } from "@/lib/ops/contract-signatures";
import { logOpsServerError } from "@/lib/ops/log";

/**
 * Serve YOUR OWN signature specimen, and only yours.
 *
 * Note the route shape: `/api/ops/signature/me`, with no [userId] segment.
 * Contrast /api/ops/avatar/[userId], which is correctly open to every
 * colleague. Here there is no URL that can ask for someone else's mark — the
 * identity comes from the session cookie and nowhere else, so there is no
 * parameter to tamper with, enumerate, or get wrong at a call site.
 *
 * This exists purely so you can confirm on your profile page that the right
 * image is on file. Applied marks never come through here: they are composited
 * into the contract PDF server-side and are never addressable as an asset.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const specimen = await loadMyOpsSignatureSpecimenBytes();

    if (!specimen) {
      return new NextResponse("Not found", { status: 404 });
    }

    return new NextResponse(Buffer.from(specimen.bytes), {
      headers: {
        "Content-Type": specimen.contentType,
        // no-store, not the avatar's long private max-age: a signature must not
        // sit in a disk cache where a shared machine could surface it later.
        "Cache-Control": "no-store, max-age=0, must-revalidate",
        // Belt and braces against a specimen being framed or sniffed into
        // something executable.
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    logOpsServerError(error, { module: "contracts", action: "signature.read_own" });
    return new NextResponse("Not found", { status: 404 });
  }
}
