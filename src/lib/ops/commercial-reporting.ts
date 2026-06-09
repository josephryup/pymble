export type OpsCommercialMarginTone = "danger" | "default" | "good" | "warn";
export type OpsCommercialForecastTone = "danger" | "default" | "good" | "warn";

export type OpsCommercialMarginSiteSummary = {
  code: string;
  id: string;
  name: string;
};

export type OpsCommercialMarginContractSource = {
  contract_sum: number | string | null;
  site?: OpsCommercialMarginSiteSummary | OpsCommercialMarginSiteSummary[] | null;
  site_id: string;
  status: string;
};

export type OpsCommercialMarginVariationSource = {
  approved_amount: number | string | null;
  site_id: string;
  status: string;
  submitted_amount?: number | string | null;
};

export type OpsCommercialMarginClaimSource = {
  agreed_amount: number | string | null;
  claimed_amount?: number | string | null;
  site_id: string;
  status: string;
};

export type OpsCommercialMarginValuationLineSource = {
  certified_amount: number | string | null;
  valuation?: { site_id: string; status: string } | { site_id: string; status: string }[] | null;
};

export type OpsCommercialMarginCostSource = {
  amount: number | string | null;
  site_id: string;
  status: string;
};

export type OpsCommercialSiteMarginSnapshot = {
  agreedClaimValue: number;
  approvedVariationValue: number;
  certifiedRevenue: number;
  committedCost: number;
  contractValue: number;
  forecastMargin: number;
  forecastMarginPercent: number | null;
  forecastRevenue: number;
  postedCost: number;
  realizedMargin: number;
  realizedMarginPercent: number | null;
  site: OpsCommercialMarginSiteSummary | null;
  siteId: string;
  tone: OpsCommercialMarginTone;
  totalCostExposure: number;
};

export type OpsCommercialMarginReport = {
  snapshots: OpsCommercialSiteMarginSnapshot[];
  totals: {
    certifiedRevenue: number;
    dangerCount: number;
    forecastMargin: number;
    forecastMarginPercent: number | null;
    forecastRevenue: number;
    postedCost: number;
    realizedMargin: number;
    realizedMarginPercent: number | null;
    siteCount: number;
    totalCostExposure: number;
    watchCount: number;
  };
};

export type OpsCommercialCashflowForecastSource = {
  actual_net_cash: number | string | null;
  forecast_cost: number | string | null;
  forecast_net_cash: number | string | null;
  forecast_retention_release: number | string | null;
  forecast_revenue: number | string | null;
  period_start: string;
  status: string;
};

export type OpsCommercialRetentionReleaseSource = {
  approved_amount: number | string | null;
  claimed_amount: number | string | null;
  due_date: string | null;
  released_amount: number | string | null;
  status: string;
};

export type OpsCommercialMilestoneForecastSource = {
  achieved_amount: number | string | null;
  due_date: string | null;
  forecast_date: string | null;
  planned_date: string | null;
  status: string;
  target_amount: number | string | null;
};

export type OpsCommercialForecastReport = {
  totals: {
    approvedCashflowNet: number;
    cashflowDangerCount: number;
    forecastCost: number;
    forecastRevenue: number;
    forecastRetentionRelease: number;
    milestoneAchievedAmount: number;
    milestoneForecastAmount: number;
    milestoneOverdueCount: number;
    pendingRetentionAmount: number;
    releasedRetentionAmount: number;
    retentionDueCount: number;
  };
};

type MutableSnapshot = Omit<
  OpsCommercialSiteMarginSnapshot,
  "forecastMargin" | "forecastMarginPercent" | "forecastRevenue" | "realizedMargin" | "realizedMarginPercent" | "tone" | "totalCostExposure"
>;

const activeContractStatuses = new Set(["active", "completed"]);
const approvedVariationStatuses = new Set(["approved", "closed"]);
const agreedClaimStatuses = new Set(["agreed", "closed"]);
const costStatuses = new Set(["committed", "posted"]);
const activeCashflowStatuses = new Set(["draft", "approved", "locked"]);
const pendingRetentionStatuses = new Set(["submitted", "approved"]);
const releasedRetentionStatuses = new Set(["released"]);
const activeMilestoneStatuses = new Set(["planned", "due", "achieved", "certified", "delayed"]);
const achievedMilestoneStatuses = new Set(["achieved", "certified"]);

function normalizeNumber(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

function normalizeRelation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

function marginPercent(margin: number, revenue: number) {
  if (revenue <= 0) {
    return null;
  }

  return (margin / revenue) * 100;
}

function marginTone(forecastRevenue: number, totalCostExposure: number, forecastMarginPercent: number | null) {
  if (forecastRevenue <= 0 && totalCostExposure > 0) {
    return "danger" satisfies OpsCommercialMarginTone;
  }

  if (forecastRevenue <= 0) {
    return "default" satisfies OpsCommercialMarginTone;
  }

  if (totalCostExposure > forecastRevenue || (forecastMarginPercent !== null && forecastMarginPercent < 5)) {
    return "danger" satisfies OpsCommercialMarginTone;
  }

  if (forecastMarginPercent !== null && forecastMarginPercent < 15) {
    return "warn" satisfies OpsCommercialMarginTone;
  }

  return totalCostExposure > 0 ? "good" : "default";
}

function tonePriority(tone: OpsCommercialMarginTone) {
  if (tone === "danger") {
    return 0;
  }

  if (tone === "warn") {
    return 1;
  }

  if (tone === "good") {
    return 2;
  }

  return 3;
}

function getSnapshot(
  snapshots: Map<string, MutableSnapshot>,
  siteId: string,
  site?: OpsCommercialMarginSiteSummary | null,
) {
  const existing = snapshots.get(siteId);

  if (existing) {
    if (!existing.site && site) {
      existing.site = site;
    }

    return existing;
  }

  const snapshot: MutableSnapshot = {
    agreedClaimValue: 0,
    approvedVariationValue: 0,
    certifiedRevenue: 0,
    committedCost: 0,
    contractValue: 0,
    postedCost: 0,
    site: site ?? null,
    siteId,
  };

  snapshots.set(siteId, snapshot);
  return snapshot;
}

export function buildOpsCommercialMarginReport({
  claims,
  contracts,
  costs,
  valuationLines,
  variations,
}: {
  claims: OpsCommercialMarginClaimSource[];
  contracts: OpsCommercialMarginContractSource[];
  costs: OpsCommercialMarginCostSource[];
  valuationLines: OpsCommercialMarginValuationLineSource[];
  variations: OpsCommercialMarginVariationSource[];
}): OpsCommercialMarginReport {
  const snapshots = new Map<string, MutableSnapshot>();

  for (const contract of contracts) {
    if (!activeContractStatuses.has(contract.status)) {
      continue;
    }

    const site = normalizeRelation(contract.site);
    const snapshot = getSnapshot(snapshots, contract.site_id, site);
    snapshot.contractValue += normalizeNumber(contract.contract_sum);
  }

  for (const variation of variations) {
    if (!approvedVariationStatuses.has(variation.status)) {
      continue;
    }

    const snapshot = getSnapshot(snapshots, variation.site_id);
    snapshot.approvedVariationValue += normalizeNumber(variation.approved_amount);
  }

  for (const claim of claims) {
    if (!agreedClaimStatuses.has(claim.status)) {
      continue;
    }

    const snapshot = getSnapshot(snapshots, claim.site_id);
    snapshot.agreedClaimValue += normalizeNumber(claim.agreed_amount);
  }

  for (const line of valuationLines) {
    const valuation = normalizeRelation(line.valuation);

    if (!valuation || valuation.status !== "certified") {
      continue;
    }

    const snapshot = getSnapshot(snapshots, valuation.site_id);
    snapshot.certifiedRevenue += normalizeNumber(line.certified_amount);
  }

  for (const cost of costs) {
    if (!costStatuses.has(cost.status)) {
      continue;
    }

    const snapshot = getSnapshot(snapshots, cost.site_id);

    if (cost.status === "posted") {
      snapshot.postedCost += normalizeNumber(cost.amount);
    } else {
      snapshot.committedCost += normalizeNumber(cost.amount);
    }
  }

  const finalized = [...snapshots.values()].map((snapshot) => {
    const forecastRevenue =
      snapshot.contractValue + snapshot.approvedVariationValue + snapshot.agreedClaimValue;
    const totalCostExposure = snapshot.committedCost + snapshot.postedCost;
    const forecastMargin = forecastRevenue - totalCostExposure;
    const realizedMargin = snapshot.certifiedRevenue - snapshot.postedCost;
    const forecastMarginPercent = marginPercent(forecastMargin, forecastRevenue);
    const realizedMarginPercent = marginPercent(realizedMargin, snapshot.certifiedRevenue);

    return {
      ...snapshot,
      forecastMargin,
      forecastMarginPercent,
      forecastRevenue,
      realizedMargin,
      realizedMarginPercent,
      tone: marginTone(forecastRevenue, totalCostExposure, forecastMarginPercent),
      totalCostExposure,
    } satisfies OpsCommercialSiteMarginSnapshot;
  });

  finalized.sort((a, b) => {
    const toneDifference = tonePriority(a.tone) - tonePriority(b.tone);

    if (toneDifference !== 0) {
      return toneDifference;
    }

    const aPercent = a.forecastMarginPercent ?? Number.POSITIVE_INFINITY;
    const bPercent = b.forecastMarginPercent ?? Number.POSITIVE_INFINITY;

    if (aPercent !== bPercent) {
      return aPercent - bPercent;
    }

    return b.totalCostExposure - a.totalCostExposure;
  });

  const totals = finalized.reduce(
    (sum, snapshot) => ({
      certifiedRevenue: sum.certifiedRevenue + snapshot.certifiedRevenue,
      dangerCount: sum.dangerCount + (snapshot.tone === "danger" ? 1 : 0),
      forecastRevenue: sum.forecastRevenue + snapshot.forecastRevenue,
      postedCost: sum.postedCost + snapshot.postedCost,
      totalCostExposure: sum.totalCostExposure + snapshot.totalCostExposure,
      watchCount: sum.watchCount + (snapshot.tone === "danger" || snapshot.tone === "warn" ? 1 : 0),
    }),
    {
      certifiedRevenue: 0,
      dangerCount: 0,
      forecastRevenue: 0,
      postedCost: 0,
      totalCostExposure: 0,
      watchCount: 0,
    },
  );
  const forecastMargin = totals.forecastRevenue - totals.totalCostExposure;
  const realizedMargin = totals.certifiedRevenue - totals.postedCost;

  return {
    snapshots: finalized,
    totals: {
      ...totals,
      forecastMargin,
      forecastMarginPercent: marginPercent(forecastMargin, totals.forecastRevenue),
      realizedMargin,
      realizedMarginPercent: marginPercent(realizedMargin, totals.certifiedRevenue),
      siteCount: finalized.length,
    },
  };
}

export function buildOpsCommercialForecastReport({
  cashflowForecasts,
  milestones,
  retentionReleases,
  today,
}: {
  cashflowForecasts: OpsCommercialCashflowForecastSource[];
  milestones: OpsCommercialMilestoneForecastSource[];
  retentionReleases: OpsCommercialRetentionReleaseSource[];
  today: string;
}): OpsCommercialForecastReport {
  const totals: OpsCommercialForecastReport["totals"] = {
    approvedCashflowNet: 0,
    cashflowDangerCount: 0,
    forecastCost: 0,
    forecastRevenue: 0,
    forecastRetentionRelease: 0,
    milestoneAchievedAmount: 0,
    milestoneForecastAmount: 0,
    milestoneOverdueCount: 0,
    pendingRetentionAmount: 0,
    releasedRetentionAmount: 0,
    retentionDueCount: 0,
  };

  for (const forecast of cashflowForecasts) {
    if (!activeCashflowStatuses.has(forecast.status)) {
      continue;
    }

    const netCash = normalizeNumber(forecast.forecast_net_cash);
    totals.forecastRevenue += normalizeNumber(forecast.forecast_revenue);
    totals.forecastRetentionRelease += normalizeNumber(forecast.forecast_retention_release);
    totals.forecastCost += normalizeNumber(forecast.forecast_cost);
    totals.approvedCashflowNet += netCash;

    if (netCash < 0) {
      totals.cashflowDangerCount += 1;
    }
  }

  for (const release of retentionReleases) {
    if (pendingRetentionStatuses.has(release.status)) {
      totals.pendingRetentionAmount +=
        normalizeNumber(release.approved_amount) || normalizeNumber(release.claimed_amount);
    }

    if (releasedRetentionStatuses.has(release.status)) {
      totals.releasedRetentionAmount += normalizeNumber(release.released_amount);
    }

    if (
      release.due_date &&
      release.due_date <= today &&
      release.status !== "released" &&
      release.status !== "cancelled" &&
      release.status !== "rejected"
    ) {
      totals.retentionDueCount += 1;
    }
  }

  for (const milestone of milestones) {
    if (!activeMilestoneStatuses.has(milestone.status)) {
      continue;
    }

    const targetAmount = normalizeNumber(milestone.target_amount);
    totals.milestoneForecastAmount += targetAmount;

    if (achievedMilestoneStatuses.has(milestone.status)) {
      totals.milestoneAchievedAmount += normalizeNumber(milestone.achieved_amount) || targetAmount;
    }

    const milestoneDate = milestone.forecast_date ?? milestone.due_date ?? milestone.planned_date;

    if (
      milestoneDate &&
      milestoneDate < today &&
      !achievedMilestoneStatuses.has(milestone.status)
    ) {
      totals.milestoneOverdueCount += 1;
    }
  }

  return { totals };
}
