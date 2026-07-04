import { requireOpsUser } from "@/lib/ops/auth";
import { logOpsServerError } from "@/lib/ops/log";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

/**
 * Project 360 — one site, every department's view of it. This is the hub the
 * Commercial, Finance, and Executive cockpits deep-link into, so a leader
 * moves from "this project looks red" to "here is everything about it" in
 * one click. Every block degrades independently: a failed query renders as
 * zeros, never a broken page.
 */

export type OpsSite360 = {
  site: {
    id: string;
    code: string;
    name: string;
    location: string | null;
    client_name: string | null;
    supervisor_name: string | null;
    status: string;
    stage: string | null;
    progress_percent: number | null;
    target_completion_date: string | null;
    contract_value: number | null;
    is_active: boolean;
  };
  budget: {
    activeBudgetNumber: string | null;
    budgetedTotal: number;
    committed: number;
    posted: number;
    exposure: number;
    remaining: number;
  };
  commercial: {
    contracts: number;
    contractSum: number;
    ipcsOpen: number;
    ipcsCertifiedAmount: number;
    retentionHeld: number;
    variationsOpen: number;
    variationsApprovedAmount: number;
    claimsOpen: number;
    claimsClaimedAmount: number;
  };
  procurement: {
    openMaterialRequests: number;
    openPurchaseOrders: number;
    openPoValue: number;
  };
  delivery: {
    lastReportDate: string | null;
    reportsLast30: number;
    milestonesOverdue: number;
    milestonesOpen: number;
  };
  hse: {
    openIncidents: number;
    incidents90d: number;
  };
  photos: {
    count: number;
    lastTakenAt: string | null;
  };
};

type ServiceClient = ReturnType<typeof getOpsSupabaseServiceClient>;

function toNumber(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function isoDaysAgo(days: number, now = new Date()) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

async function fetchBudgetBlock(supabase: ServiceClient, siteId: string) {
  const empty = {
    activeBudgetNumber: null,
    budgetedTotal: 0,
    committed: 0,
    posted: 0,
    exposure: 0,
    remaining: 0,
  };
  try {
    const [budgetResult, costsResult] = await Promise.all([
      supabase
        .from("project_budgets")
        .select("id, budget_number, contingency_amount")
        .eq("site_id", siteId)
        .in("status", ["active", "locked"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ id: string; budget_number: string; contingency_amount: number | string }>(),
      supabase
        .from("project_cost_entries")
        .select("amount, status")
        .eq("site_id", siteId)
        .in("status", ["committed", "posted"])
        .limit(2000),
    ]);

    if (budgetResult.error || costsResult.error) return empty;

    let budgetedTotal = 0;
    if (budgetResult.data) {
      const { data: lines } = await supabase
        .from("project_budget_lines")
        .select("budgeted_amount")
        .eq("budget_id", budgetResult.data.id)
        .limit(1000);
      budgetedTotal =
        (lines ?? []).reduce((sum, row) => sum + toNumber(row.budgeted_amount), 0) +
        toNumber(budgetResult.data.contingency_amount);
    }

    const costs = (costsResult.data ?? []) as Array<{ amount: number | string; status: string }>;
    const committed = costs
      .filter((cost) => cost.status === "committed")
      .reduce((sum, cost) => sum + toNumber(cost.amount), 0);
    const posted = costs
      .filter((cost) => cost.status === "posted")
      .reduce((sum, cost) => sum + toNumber(cost.amount), 0);
    const exposure = committed + posted;

    return {
      activeBudgetNumber: budgetResult.data?.budget_number ?? null,
      budgetedTotal: round2(budgetedTotal),
      committed: round2(committed),
      posted: round2(posted),
      exposure: round2(exposure),
      remaining: round2(budgetedTotal - exposure),
    };
  } catch {
    return empty;
  }
}

async function fetchCommercialBlock(supabase: ServiceClient, siteId: string) {
  const empty = {
    contracts: 0,
    contractSum: 0,
    ipcsOpen: 0,
    ipcsCertifiedAmount: 0,
    retentionHeld: 0,
    variationsOpen: 0,
    variationsApprovedAmount: 0,
    claimsOpen: 0,
    claimsClaimedAmount: 0,
  };
  try {
    const [contracts, ipcs, variations, claims] = await Promise.all([
      supabase
        .from("commercial_contracts")
        .select("contract_sum, status")
        .eq("site_id", siteId)
        .limit(200),
      supabase
        .from("commercial_ipcs")
        .select("status, certified_amount, total_certified_amount, retention_amount")
        .eq("site_id", siteId)
        .limit(500),
      supabase
        .from("commercial_variations")
        .select("status, approved_amount")
        .eq("site_id", siteId)
        .limit(500),
      supabase
        .from("commercial_claims")
        .select("status, claimed_amount")
        .eq("site_id", siteId)
        .limit(500),
    ]);
    if (contracts.error || ipcs.error || variations.error || claims.error) return empty;

    const activeContracts = (contracts.data ?? []).filter((row) => row.status === "active");
    const ipcRows = (ipcs.data ?? []) as Array<{
      status: string;
      certified_amount: number | string | null;
      total_certified_amount: number | string | null;
      retention_amount: number | string | null;
    }>;
    const certifiedStatuses = new Set(["certified", "invoiced", "paid"]);
    const openIpcStatuses = new Set(["draft", "submitted"]);
    const certifiedIpcs = ipcRows.filter((row) => certifiedStatuses.has(row.status));
    const variationRows = (variations.data ?? []) as Array<{
      status: string;
      approved_amount: number | string | null;
    }>;
    const claimRows = (claims.data ?? []) as Array<{
      status: string;
      claimed_amount: number | string | null;
    }>;
    const openClaimStatuses = new Set(["draft", "submitted", "under_review"]);

    return {
      contracts: activeContracts.length,
      contractSum: round2(
        activeContracts.reduce((sum, row) => sum + toNumber(row.contract_sum), 0),
      ),
      ipcsOpen: ipcRows.filter((row) => openIpcStatuses.has(row.status)).length,
      ipcsCertifiedAmount: round2(
        certifiedIpcs.reduce(
          (sum, row) => sum + toNumber(row.total_certified_amount ?? row.certified_amount),
          0,
        ),
      ),
      retentionHeld: round2(
        certifiedIpcs.reduce((sum, row) => sum + toNumber(row.retention_amount), 0),
      ),
      variationsOpen: variationRows.filter((row) =>
        ["draft", "submitted", "priced"].includes(row.status),
      ).length,
      variationsApprovedAmount: round2(
        variationRows
          .filter((row) => row.status === "approved")
          .reduce((sum, row) => sum + toNumber(row.approved_amount), 0),
      ),
      claimsOpen: claimRows.filter((row) => openClaimStatuses.has(row.status)).length,
      claimsClaimedAmount: round2(
        claimRows
          .filter((row) => openClaimStatuses.has(row.status) || row.status === "agreed")
          .reduce((sum, row) => sum + toNumber(row.claimed_amount), 0),
      ),
    };
  } catch {
    return empty;
  }
}

async function fetchProcurementBlock(supabase: ServiceClient, siteId: string) {
  const empty = { openMaterialRequests: 0, openPurchaseOrders: 0, openPoValue: 0 };
  try {
    const [mrs, pos] = await Promise.all([
      supabase
        .from("material_requests")
        .select("id", { count: "exact", head: true })
        .eq("site_id", siteId)
        .not("status", "in", "(closed,cancelled)")
        .is("archived_at", null),
      supabase
        .from("purchase_orders")
        .select("status, total_amount")
        .eq("site_id", siteId)
        .in("status", ["approval_pending", "approved", "issued"])
        .limit(500),
    ]);
    if (mrs.error || pos.error) return empty;
    const poRows = (pos.data ?? []) as Array<{ total_amount: number | string | null }>;
    return {
      openMaterialRequests: mrs.count ?? 0,
      openPurchaseOrders: poRows.length,
      openPoValue: round2(poRows.reduce((sum, row) => sum + toNumber(row.total_amount), 0)),
    };
  } catch {
    return empty;
  }
}

async function fetchDeliveryBlock(supabase: ServiceClient, siteId: string, now = new Date()) {
  const empty = { lastReportDate: null, reportsLast30: 0, milestonesOverdue: 0, milestonesOpen: 0 };
  try {
    const [latest, recent, milestones] = await Promise.all([
      supabase
        .from("daily_site_reports")
        .select("report_date")
        .eq("site_id", siteId)
        .is("archived_at", null)
        .order("report_date", { ascending: false })
        .limit(1)
        .maybeSingle<{ report_date: string }>(),
      supabase
        .from("daily_site_reports")
        .select("id", { count: "exact", head: true })
        .eq("site_id", siteId)
        .gte("report_date", isoDaysAgo(30, now).slice(0, 10))
        .is("archived_at", null),
      supabase
        .from("programme_milestones")
        .select("status, baseline_date, forecast_date")
        .eq("site_id", siteId)
        .limit(300),
    ]);
    if (latest.error || recent.error || milestones.error) return empty;

    const today = now.toISOString().slice(0, 10);
    const milestoneRows = (milestones.data ?? []) as Array<{
      status: string;
      baseline_date: string | null;
      forecast_date: string | null;
    }>;
    const open = milestoneRows.filter(
      (row) => row.status !== "completed" && row.status !== "cancelled",
    );

    return {
      lastReportDate: latest.data?.report_date ?? null,
      reportsLast30: recent.count ?? 0,
      milestonesOpen: open.length,
      milestonesOverdue: open.filter((row) => {
        const due = row.forecast_date ?? row.baseline_date;
        return Boolean(due && due < today);
      }).length,
    };
  } catch {
    return empty;
  }
}

async function fetchHseBlock(supabase: ServiceClient, siteId: string, now = new Date()) {
  const empty = { openIncidents: 0, incidents90d: 0 };
  try {
    const [open, recent] = await Promise.all([
      supabase
        .from("hse_incidents")
        .select("id", { count: "exact", head: true })
        .eq("site_id", siteId)
        .is("closed_at", null)
        .is("cancelled_at", null),
      supabase
        .from("hse_incidents")
        .select("id", { count: "exact", head: true })
        .eq("site_id", siteId)
        .gte("occurred_at", isoDaysAgo(90, now)),
    ]);
    if (open.error || recent.error) return empty;
    return { openIncidents: open.count ?? 0, incidents90d: recent.count ?? 0 };
  } catch {
    return empty;
  }
}

async function fetchPhotosBlock(supabase: ServiceClient, siteId: string) {
  const empty = { count: 0, lastTakenAt: null };
  try {
    const [count, latest] = await Promise.all([
      supabase
        .from("site_photos")
        .select("id", { count: "exact", head: true })
        .eq("site_id", siteId),
      supabase
        .from("site_photos")
        .select("taken_at")
        .eq("site_id", siteId)
        .order("taken_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ taken_at: string | null }>(),
    ]);
    if (count.error || latest.error) return empty;
    return { count: count.count ?? 0, lastTakenAt: latest.data?.taken_at ?? null };
  } catch {
    return empty;
  }
}

export async function fetchOpsSite360(siteId: string): Promise<OpsSite360 | null> {
  await requireOpsUser();
  const supabase = getOpsSupabaseServiceClient();

  const { data: site, error } = await supabase
    .from("sites")
    .select(
      "id, code, name, location, client_name, supervisor_name, status, stage, progress_percent, target_completion_date, contract_value, is_active",
    )
    .eq("id", siteId)
    .maybeSingle<OpsSite360["site"]>();

  if (error) {
    logOpsServerError(error, { module: "sites", action: "fetchOpsSite360", entityId: siteId });
    throw error;
  }
  if (!site) return null;

  const [budget, commercial, procurement, delivery, hse, photos] = await Promise.all([
    fetchBudgetBlock(supabase, siteId),
    fetchCommercialBlock(supabase, siteId),
    fetchProcurementBlock(supabase, siteId),
    fetchDeliveryBlock(supabase, siteId),
    fetchHseBlock(supabase, siteId),
    fetchPhotosBlock(supabase, siteId),
  ]);

  return {
    site: { ...site, contract_value: site.contract_value === null ? null : toNumber(site.contract_value) },
    budget,
    commercial,
    procurement,
    delivery,
    hse,
    photos,
  };
}
