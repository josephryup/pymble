import { NextResponse } from "next/server";
import { logOpsServerError } from "@/lib/ops/log";
import { timingSafeEqualString } from "@/lib/ops/secure-compare";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

/**
 * Monthly archive job — moves old rows from audit_events and notifications
 * into archive tables. Scheduled by Vercel cron (configure in
 * `vercel.json`) and called with the shared CRON_SECRET bearer token.
 *
 *   * audit_events older than 365 days → audit_events_archive
 *   * read/archived notifications older than 180 days → notifications_archive
 *
 * Both retentions can be overridden via query string for ad-hoc cleanup,
 * e.g. ?audit_days=730&notification_days=365.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

  const url = new URL(request.url);
  const auditDays = Number(url.searchParams.get("audit_days") ?? "365");
  const notificationDays = Number(
    url.searchParams.get("notification_days") ?? "180",
  );

  const supabase = getOpsSupabaseServiceClient();

  let auditMoved = 0;
  let notificationsMoved = 0;
  const issues: string[] = [];

  try {
    const { data, error } = await supabase.rpc("ops_archive_audit_events", {
      p_older_than_days: auditDays,
    });
    if (error) throw error;
    auditMoved = Number(data ?? 0);
  } catch (error) {
    logOpsServerError(error, {
      module: "observability",
      action: "ops_archive_audit_events",
      extra: { auditDays },
    });
    issues.push(
      `audit_events: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    const { data, error } = await supabase.rpc("ops_archive_notifications", {
      p_older_than_days: notificationDays,
    });
    if (error) throw error;
    notificationsMoved = Number(data ?? 0);
  } catch (error) {
    logOpsServerError(error, {
      module: "observability",
      action: "ops_archive_notifications",
      extra: { notificationDays },
    });
    issues.push(
      `notifications: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return NextResponse.json({
    ok: issues.length === 0,
    auditDays,
    auditMoved,
    notificationDays,
    notificationsMoved,
    issues,
  });
}
