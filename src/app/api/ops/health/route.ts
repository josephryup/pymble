import { NextResponse } from "next/server";
import { getOpsEnvironmentStatus, OPS_ENV_REQUIREMENTS } from "@/lib/ops/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorizedReadinessRequest(request: Request, cronSecret: string) {
  return request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);

  if (url.searchParams.get("mode") !== "readiness") {
    return NextResponse.json({
      ok: true,
      service: "pymble-operations",
      timestamp: new Date().toISOString(),
    });
  }

  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json(
      { error: "Readiness checks are not configured.", ok: false },
      { status: 503 },
    );
  }

  if (!isAuthorizedReadinessRequest(request, cronSecret)) {
    return NextResponse.json({ error: "Unauthorized", ok: false }, { status: 401 });
  }

  const status = getOpsEnvironmentStatus();
  const missingRequiredKeys = status.variables
    .filter((variable) => variable.requiredForProduction && !variable.configured)
    .map((variable) => variable.key);
  const requiredProductionKeys = OPS_ENV_REQUIREMENTS.filter(
    (variable) => variable.requiredForProduction,
  ).map((variable) => variable.key);
  const checks = {
    cron: status.isCronConfigured,
    email: status.isEmailConfigured,
    monitoring: status.isMonitoringConfigured,
    r2: status.isR2Configured,
    supabase: status.isSupabaseConfigured,
  };
  const blockingChecks = {
    cron: checks.cron,
    email: checks.email,
    r2: checks.r2,
    supabase: checks.supabase,
  };
  const warnings = [
    ...(checks.monitoring ? [] : ["Monitoring is not configured."]),
    ...(process.env.OPS_EMAIL_REPLY_TO?.trim() ? [] : ["OPS_EMAIL_REPLY_TO is using the support email fallback."]),
  ];
  const ok = Object.values(blockingChecks).every(Boolean) && missingRequiredKeys.length === 0;

  return NextResponse.json(
    {
      checks,
      missingRequiredKeys,
      ok,
      requiredProductionKeys,
      service: "pymble-operations",
      timestamp: new Date().toISOString(),
      warnings,
    },
    { status: ok ? 200 : 503 },
  );
}
