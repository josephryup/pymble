const DAY_MS = 24 * 60 * 60 * 1000;
const DELIVERY_EXCEPTION_REPORTING_TIME_ZONE = "Africa/Lusaka";

export type OpsDeliveryExceptionAgeingBucket =
  | "overdue"
  | "due_today"
  | "due_soon"
  | "stale_no_due"
  | "on_track";

export type OpsDeliveryExceptionAgeingBucketSummary = {
  bucket: OpsDeliveryExceptionAgeingBucket;
  count: number;
  label: string;
};

export const OPS_DELIVERY_EXCEPTION_AGEING_BUCKETS: Array<{
  bucket: OpsDeliveryExceptionAgeingBucket;
  label: string;
}> = [
  { bucket: "overdue", label: "Overdue" },
  { bucket: "due_today", label: "Due today" },
  { bucket: "due_soon", label: "Due soon" },
  { bucket: "stale_no_due", label: "No due date" },
  { bucket: "on_track", label: "On track" },
];

export function getOpsDeliveryExceptionTodayIso(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: DELIVERY_EXCEPTION_REPORTING_TIME_ZONE,
    year: "numeric",
  }).format(now);
}

function parseDateOnlyToUtc(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

export function getOpsDeliveryExceptionCalendarDayDelta(
  targetDate: string | null,
  todayDate = getOpsDeliveryExceptionTodayIso(),
) {
  if (!targetDate) {
    return null;
  }

  return Math.round(
    (parseDateOnlyToUtc(targetDate) - parseDateOnlyToUtc(todayDate)) / DAY_MS,
  );
}

export function getOpsDeliveryExceptionAgeDays(
  reportedAt: string,
  todayDate = getOpsDeliveryExceptionTodayIso(),
) {
  const daysFromToday = getOpsDeliveryExceptionCalendarDayDelta(reportedAt, todayDate) ?? 0;
  return Math.max(0, -daysFromToday);
}

export function getOpsDeliveryExceptionAgeingBucket({
  dueAt,
  reportedAt,
  todayDate = getOpsDeliveryExceptionTodayIso(),
}: {
  dueAt: string | null;
  reportedAt: string;
  todayDate?: string;
}): OpsDeliveryExceptionAgeingBucket {
  const daysUntilDue = getOpsDeliveryExceptionCalendarDayDelta(dueAt, todayDate);

  if (daysUntilDue !== null) {
    if (daysUntilDue < 0) {
      return "overdue";
    }

    if (daysUntilDue === 0) {
      return "due_today";
    }

    if (daysUntilDue <= 3) {
      return "due_soon";
    }

    return "on_track";
  }

  return getOpsDeliveryExceptionAgeDays(reportedAt, todayDate) >= 7
    ? "stale_no_due"
    : "on_track";
}

export function createOpsDeliveryExceptionAgeingBucketSummaries() {
  return OPS_DELIVERY_EXCEPTION_AGEING_BUCKETS.map((bucket) => ({
    ...bucket,
    count: 0,
  })) satisfies OpsDeliveryExceptionAgeingBucketSummary[];
}
