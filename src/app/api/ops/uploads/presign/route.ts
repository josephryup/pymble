import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getOptionalOpsUser } from "@/lib/ops/auth";
import { logOpsServerError } from "@/lib/ops/log";
import { canManageOps } from "@/lib/ops/permissions";
import { createOpsR2UploadUrl } from "@/lib/ops/r2";
import {
  isOpsUploadScope,
  OPS_MAX_UPLOAD_BYTES,
  OPS_UPLOAD_KEY_PREFIXES,
  safeOpsFileName,
  validateOpsUploadDescriptor,
} from "@/lib/ops/upload-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_UPLOAD_MB = Math.floor(OPS_MAX_UPLOAD_BYTES / (1024 * 1024));

/**
 * Mints a short-lived presigned PUT so the browser can send a file straight to
 * R2, skipping the 4.5 MB Vercel request-body ceiling that a Server Action
 * upload can never get past.
 *
 * This endpoint deliberately does NOT decide whether the user may attach a file
 * to a particular record — that check stays where it already lives, in the
 * action that writes the `documents` / `document_versions` rows. All this grants
 * is "an ops user who can manage records may park bytes at a key we chose".
 * An object nobody attaches is orphaned storage, not exposure: the key is a
 * fresh UUID and every read path goes through a signed URL behind an auth check.
 */
export async function POST(request: NextRequest) {
  const user = await getOptionalOpsUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in to upload files." }, { status: 401 });
  }

  if (!canManageOps(user.profile.role)) {
    return NextResponse.json(
      { error: "Your role cannot upload files yet." },
      { status: 403 },
    );
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid upload request." }, { status: 400 });
  }

  const body = (payload ?? {}) as {
    content_type?: unknown;
    file_name?: unknown;
    scope?: unknown;
    size?: unknown;
  };

  if (!isOpsUploadScope(body.scope)) {
    return NextResponse.json({ error: "Invalid upload request." }, { status: 400 });
  }

  const contentType = typeof body.content_type === "string" ? body.content_type : "";
  const size = typeof body.size === "number" ? body.size : Number.NaN;

  const validation = validateOpsUploadDescriptor(
    { contentType, size },
    {
      empty: "Select a file to upload.",
      tooLarge: `Files must be ${MAX_UPLOAD_MB} MB or smaller.`,
      unsupportedType: "Upload a PDF, Word, Excel, CSV, text, JPEG, PNG, or WebP file.",
    },
  );

  if (!validation.ok) {
    return NextResponse.json({ error: validation.message }, { status: 400 });
  }

  const fileName = typeof body.file_name === "string" ? body.file_name : "";
  const safeName = safeOpsFileName(fileName || "upload");
  const key = `${OPS_UPLOAD_KEY_PREFIXES[body.scope]}/${crypto.randomUUID()}-${safeName}`;

  try {
    const url = await createOpsR2UploadUrl({ contentType, key });

    return NextResponse.json({ key, url });
  } catch (error) {
    logOpsServerError(error, {
      action: "presignOpsUpload",
      module: "documents",
    });

    return NextResponse.json(
      { error: "Could not start the upload. Try again." },
      { status: 500 },
    );
  }
}
