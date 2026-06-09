import { NextResponse } from "next/server";
import { rejectMismatchedOpsOrigin } from "@/lib/ops/api-security";
import {
  canUseOpsLocalRolePreview,
  OPS_LOCAL_ROLE_PREVIEW_COOKIE,
  OPS_LOCAL_ROLE_PREVIEW_MAX_AGE_SECONDS,
  parseOpsLocalRolePreviewRole,
} from "@/lib/ops/local-role-preview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PreviewPayload = {
  action: string;
  role: string;
};

function redirectTo(request: Request, pathname: string) {
  return NextResponse.redirect(new URL(pathname, request.url), { status: 303 });
}

async function readPreviewPayload(request: Request): Promise<PreviewPayload> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    return {
      action: typeof payload?.action === "string" ? payload.action : "",
      role: typeof payload?.role === "string" ? payload.role : "",
    };
  }

  const formData = await request.formData().catch(() => null);

  return {
    action: typeof formData?.get("action") === "string" ? String(formData.get("action")) : "",
    role: typeof formData?.get("role") === "string" ? String(formData.get("role")) : "",
  };
}

export async function POST(request: Request) {
  const host = request.headers.get("host");

  if (!canUseOpsLocalRolePreview(host)) {
    return new NextResponse(null, { status: 404 });
  }

  const originError = rejectMismatchedOpsOrigin(request);

  if (originError) {
    return originError;
  }

  const payload = await readPreviewPayload(request);
  const { action } = payload;
  const response = redirectTo(request, action === "stop" ? "/ops/login" : "/ops");

  if (action === "stop") {
    response.cookies.set(OPS_LOCAL_ROLE_PREVIEW_COOKIE, "", {
      httpOnly: true,
      maxAge: 0,
      path: "/",
      sameSite: "lax",
      secure: false,
    });
    return response;
  }

  const role = parseOpsLocalRolePreviewRole(payload.role);

  if (!role) {
    return redirectTo(request, "/ops/login?error=Select+a+valid+local+preview+role.");
  }

  response.cookies.set(OPS_LOCAL_ROLE_PREVIEW_COOKIE, role, {
    httpOnly: true,
    maxAge: OPS_LOCAL_ROLE_PREVIEW_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax",
    secure: false,
  });

  return response;
}
