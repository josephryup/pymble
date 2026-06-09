import { requireOpsUser } from "@/lib/ops/auth";
import { isOpsEmailConfigured } from "@/lib/ops/email";
import { canViewOpsHse } from "@/lib/ops/hse-permissions";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type { OpsEmailDeliveryStatus, OpsUserRole } from "@/lib/ops/types";

export type OpsHseEmailDeliveryEventSummary = {
  action_href: string | null;
  attempted_at: string;
  delivery_type: string;
  id: string;
  module_key: string;
  provider: string;
  reason: string;
  recipient_label: string;
  recipient_role: OpsUserRole | null;
  source_id: string | null;
  source_table: string | null;
  status: OpsEmailDeliveryStatus;
};

export type OpsHseEmailDeliveryTrendRow = {
  date: string;
  failed: number;
  sent: number;
  skipped: number;
  total: number;
};

export type OpsHseEmailDeliveryReport = {
  configured: boolean;
  failed7d: number;
  failureRate7d: number;
  lastAttemptAt: string | null;
  lastFailureAt: string | null;
  lastSentAt: string | null;
  recentEvents: OpsHseEmailDeliveryEventSummary[];
  sent7d: number;
  skipped7d: number;
  total7d: number;
  trendRows: OpsHseEmailDeliveryTrendRow[];
};

export type OpsHseEmailDeliveryReportSource = {
  action_href: string | null;
  attempted_at: string;
  delivery_type: string;
  id: string;
  module_key: string;
  provider: string;
  reason: string;
  recipient_email: string | null;
  recipient_name: string | null;
  recipient_role: OpsUserRole | null;
  source_id: string | null;
  source_table: string | null;
  status: OpsEmailDeliveryStatus;
};

function todayInLusaka() {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Africa/Lusaka",
    year: "numeric",
  }).format(new Date());
}

function addDays(date: string, days: number) {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function isMissingEmailDeliveryTable(error: { code?: string; message?: string } | null | undefined) {
  return Boolean(
    error &&
      (error.code === "42P01" ||
        error.code === "PGRST200" ||
        error.code === "PGRST205" ||
        /ops_email_delivery_events|schema cache/i.test(error.message ?? "")),
  );
}

function maskEmailAddress(value: string | null | undefined) {
  const email = value?.trim();

  if (!email || !email.includes("@")) {
    return "Recipient";
  }

  const [local, domain] = email.split("@");
  const visibleLocal = local.slice(0, Math.min(2, local.length));
  return `${visibleLocal}${local.length > 2 ? "***" : "*"}@${domain}`;
}

function trendSeed(today: string): Array<[string, OpsHseEmailDeliveryTrendRow]> {
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(today, index - 6);
    return [date, {
      date,
      failed: 0,
      sent: 0,
      skipped: 0,
      total: 0,
    }];
  });
}

export function buildOpsHseEmailDeliveryReport({
  configured,
  rows,
  today = todayInLusaka(),
}: {
  configured: boolean;
  rows: OpsHseEmailDeliveryReportSource[];
  today?: string;
}): OpsHseEmailDeliveryReport {
  const startDate = addDays(today, -6);
  const trendByDate = new Map(trendSeed(today));
  const recentEvents = rows.slice(0, 8).map((row) => ({
    action_href: row.action_href,
    attempted_at: row.attempted_at,
    delivery_type: row.delivery_type,
    id: row.id,
    module_key: row.module_key,
    provider: row.provider,
    reason: row.reason,
    recipient_label: row.recipient_name?.trim() || maskEmailAddress(row.recipient_email),
    recipient_role: row.recipient_role,
    source_id: row.source_id,
    source_table: row.source_table,
    status: row.status,
  }));
  let sent7d = 0;
  let failed7d = 0;
  let skipped7d = 0;
  let lastAttemptAt: string | null = null;
  let lastFailureAt: string | null = null;
  let lastSentAt: string | null = null;

  for (const row of rows) {
    const date = row.attempted_at.slice(0, 10);

    if (!lastAttemptAt || row.attempted_at > lastAttemptAt) {
      lastAttemptAt = row.attempted_at;
    }

    if (row.status === "failed" && (!lastFailureAt || row.attempted_at > lastFailureAt)) {
      lastFailureAt = row.attempted_at;
    }

    if (row.status === "sent" && (!lastSentAt || row.attempted_at > lastSentAt)) {
      lastSentAt = row.attempted_at;
    }

    if (date < startDate || date > today) {
      continue;
    }

    const trend = trendByDate.get(date);

    if (!trend) {
      continue;
    }

    trend.total += 1;

    if (row.status === "sent") {
      trend.sent += 1;
      sent7d += 1;
    } else if (row.status === "failed") {
      trend.failed += 1;
      failed7d += 1;
    } else {
      trend.skipped += 1;
      skipped7d += 1;
    }
  }

  const total7d = sent7d + failed7d + skipped7d;

  return {
    configured,
    failed7d,
    failureRate7d: total7d > 0 ? (failed7d / total7d) * 100 : 0,
    lastAttemptAt,
    lastFailureAt,
    lastSentAt,
    recentEvents,
    sent7d,
    skipped7d,
    total7d,
    trendRows: Array.from(trendByDate.values()),
  };
}

export async function fetchOpsHseEmailDeliveryReport(): Promise<OpsHseEmailDeliveryReport> {
  const { profile } = await requireOpsUser();
  const configured = isOpsEmailConfigured();
  const emptyReport = buildOpsHseEmailDeliveryReport({ configured, rows: [] });

  if (!canViewOpsHse(profile.role)) {
    return emptyReport;
  }

  const today = todayInLusaka();
  const fromDate = addDays(today, -13);
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("ops_email_delivery_events")
    .select(
      [
        "id",
        "module_key",
        "delivery_type",
        "provider",
        "status",
        "reason",
        "recipient_email",
        "recipient_name",
        "recipient_role",
        "source_table",
        "source_id",
        "action_href",
        "attempted_at",
      ].join(", "),
    )
    .eq("delivery_type", "hse_critical_alert")
    .gte("attempted_at", `${fromDate}T00:00:00+02:00`)
    .order("attempted_at", { ascending: false })
    .limit(200);

  if (isMissingEmailDeliveryTable(error)) {
    return emptyReport;
  }

  if (error) {
    throw error;
  }

  return buildOpsHseEmailDeliveryReport({
    configured,
    rows: (data ?? []) as unknown as OpsHseEmailDeliveryReportSource[],
    today,
  });
}
