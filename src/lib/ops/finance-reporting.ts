const DAY_MS = 24 * 60 * 60 * 1000;
const FINANCE_REPORTING_TIME_ZONE = "Africa/Lusaka";

export type OpsFinanceAgeingBucket =
  | "current"
  | "due_soon"
  | "overdue_1_30"
  | "overdue_31_60"
  | "overdue_61_plus";

export type OpsFinanceAgeingBucketSummary = {
  amount: number;
  bucket: OpsFinanceAgeingBucket;
  count: number;
  label: string;
};

export const OPS_FINANCE_AGEING_BUCKETS: Array<{
  bucket: OpsFinanceAgeingBucket;
  label: string;
}> = [
  { bucket: "current", label: "Current" },
  { bucket: "due_soon", label: "Due soon" },
  { bucket: "overdue_1_30", label: "1-30 days" },
  { bucket: "overdue_31_60", label: "31-60 days" },
  { bucket: "overdue_61_plus", label: "61+ days" },
];

export function getOpsFinanceTodayIso(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: FINANCE_REPORTING_TIME_ZONE,
    year: "numeric",
  }).format(now);
}

function parseDateOnlyToUtc(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

export function getOpsFinanceCalendarDayDelta(
  targetDate: string | null,
  todayDate = getOpsFinanceTodayIso(),
) {
  if (!targetDate) {
    return null;
  }

  return Math.round(
    (parseDateOnlyToUtc(targetDate) - parseDateOnlyToUtc(todayDate)) / DAY_MS,
  );
}

export function getOpsFinanceDatePlusDays(date: string, days: number) {
  const nextDate = new Date(parseDateOnlyToUtc(date) + days * DAY_MS);
  return nextDate.toISOString().slice(0, 10);
}

export function getOpsFinanceMonthStartIso(date: string) {
  const [year, month] = date.split("-");
  return `${year}-${month}-01`;
}

export function getOpsFinanceAgeingBucket(
  dueDate: string | null,
  todayDate = getOpsFinanceTodayIso(),
): OpsFinanceAgeingBucket {
  const daysUntilDue = getOpsFinanceCalendarDayDelta(dueDate, todayDate);

  if (daysUntilDue === null || daysUntilDue > 7) {
    return "current";
  }

  if (daysUntilDue >= 0) {
    return "due_soon";
  }

  const overdueDays = Math.abs(daysUntilDue);

  if (overdueDays <= 30) {
    return "overdue_1_30";
  }

  if (overdueDays <= 60) {
    return "overdue_31_60";
  }

  return "overdue_61_plus";
}

export function createOpsFinanceAgeingBucketSummaries(): OpsFinanceAgeingBucketSummary[] {
  return OPS_FINANCE_AGEING_BUCKETS.map((bucket) => ({
    ...bucket,
    amount: 0,
    count: 0,
  }));
}
