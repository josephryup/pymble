import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";

/**
 * Tiny health endpoint to verify Sentry is wired in production.
 *
 *   GET /api/ops/sentry-check  -> returns whether the SDK is enabled
 *   GET /api/ops/sentry-check?throw=1 -> throws a test error so you can
 *     confirm it lands in the Sentry dashboard
 *
 * Lives under /api/ops so it's behind the same proxy headers as the rest of
 * the ops surface. No authentication is required — only used as a probe and
 * doesn't leak anything sensitive.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const shouldThrow = url.searchParams.get("throw") === "1";

  if (shouldThrow) {
    try {
      throw new Error("Sentry verification test — safe to ignore");
    } catch (error) {
      Sentry.captureException(error, {
        tags: { scope: "ops.sentry-check.manual" },
      });
      await Sentry.flush(2000);
      return NextResponse.json({
        ok: true,
        sent: true,
        message:
          "Test exception sent to Sentry. Check the Sentry dashboard within ~30s.",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    sdkEnabled: Boolean(
      process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
    ),
    org: process.env.SENTRY_ORG ?? "joseph-5u",
    project: process.env.SENTRY_PROJECT ?? "pymble-ops",
    note: "Add ?throw=1 to send a test exception.",
  });
}
