import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

/**
 * Chart data for the Commercial cockpit: the revenue funnel (how much of what
 * was claimed actually became certified, invoiced, then paid) and the
 * certified S-curve (cumulative certified value by month — the standard QS
 * progress artefact). Pure bucketing is split out so it can be unit tested.
 */

export type OpsCommercialFunnelStage = {
  key: "claimed" | "certified" | "invoiced" | "paid";
  label: string;
  amount: number;
  /** Share of the claimed total, 0–100. */
  pct: number;
};

export type OpsCommercialScurvePoint = {
  month: string;
  label: string;
  certified: number;
  cumulative: number;
};

export type OpsCommercialChartData = {
  funnel: OpsCommercialFunnelStage[];
  scurve: OpsCommercialScurvePoint[];
  hasActivity: boolean;
};

export type OpsIpcChartRow = {
  status: string;
  claimed_amount: number | string | null;
  certified_amount: number | string | null;
  total_certified_amount: number | string | null;
  certified_at: string | null;
  invoiced_at: string | null;
  paid_at: string | null;
};

function toNumber(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function monthLabel(month: string) {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-GB", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}

const CERTIFIED_STATUSES = new Set(["certified", "invoiced", "paid"]);

export function buildCommercialFunnel(rows: OpsIpcChartRow[]): OpsCommercialFunnelStage[] {
  const certifiedValue = (row: OpsIpcChartRow) =>
    toNumber(row.total_certified_amount ?? row.certified_amount);

  const claimed = rows
    .filter((row) => row.status !== "cancelled")
    .reduce((sum, row) => sum + toNumber(row.claimed_amount), 0);
  const certified = rows
    .filter((row) => CERTIFIED_STATUSES.has(row.status))
    .reduce((sum, row) => sum + certifiedValue(row), 0);
  const invoiced = rows
    .filter((row) => row.invoiced_at !== null || row.status === "paid")
    .reduce((sum, row) => sum + certifiedValue(row), 0);
  const paid = rows
    .filter((row) => row.status === "paid")
    .reduce((sum, row) => sum + certifiedValue(row), 0);

  const base = claimed > 0 ? claimed : 1;
  const stage = (
    key: OpsCommercialFunnelStage["key"],
    label: string,
    amount: number,
  ): OpsCommercialFunnelStage => ({
    key,
    label,
    amount: round2(amount),
    pct: Math.round((amount / base) * 100),
  });

  return [
    stage("claimed", "Claimed", claimed),
    stage("certified", "Certified", certified),
    stage("invoiced", "Invoiced", invoiced),
    stage("paid", "Paid", paid),
  ];
}

/**
 * Cumulative certified value by month, using certified_at. Returns the last
 * `monthsBack` months as a continuous, zero-filled series; the cumulative
 * total opens with everything certified before the window.
 */
export function buildCertifiedScurve(
  rows: OpsIpcChartRow[],
  monthsBack = 8,
  now = new Date(),
): OpsCommercialScurvePoint[] {
  const perMonth = new Map<string, number>();
  for (const row of rows) {
    if (!row.certified_at || !CERTIFIED_STATUSES.has(row.status)) continue;
    const month = row.certified_at.slice(0, 7);
    const value = toNumber(row.total_certified_amount ?? row.certified_amount);
    perMonth.set(month, (perMonth.get(month) ?? 0) + value);
  }

  const windowMonths: string[] = [];
  for (let offset = monthsBack - 1; offset >= 0; offset -= 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
    windowMonths.push(date.toISOString().slice(0, 7));
  }

  const windowStart = windowMonths[0];
  let cumulative = Array.from(perMonth.entries())
    .filter(([month]) => month < windowStart)
    .reduce((sum, [, value]) => sum + value, 0);

  return windowMonths.map((month) => {
    const certified = perMonth.get(month) ?? 0;
    cumulative += certified;
    return {
      month,
      label: monthLabel(month),
      certified: round2(certified),
      cumulative: round2(cumulative),
    };
  });
}

export async function fetchOpsCommercialChartData(
  now = new Date(),
): Promise<OpsCommercialChartData> {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("commercial_ipcs")
    .select(
      "status, claimed_amount, certified_amount, total_certified_amount, certified_at, invoiced_at, paid_at",
    )
    .limit(2000);

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as OpsIpcChartRow[];
  const funnel = buildCommercialFunnel(rows);
  const scurve = buildCertifiedScurve(rows, 8, now);

  return {
    funnel,
    scurve,
    hasActivity: funnel[0].amount > 0 || scurve.some((point) => point.cumulative > 0),
  };
}
