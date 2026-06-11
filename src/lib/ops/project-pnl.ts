import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

export type OpsProjectPnlCostType = {
  type: string;
  amount: number;
};

export type OpsProjectPnlRow = {
  site_id: string;
  code: string;
  name: string;
  revenue: number;
  total_cost: number;
  margin: number;
  margin_pct: number | null;
  cost_by_type: OpsProjectPnlCostType[];
};

export type OpsProjectPnlSummary = {
  rows: OpsProjectPnlRow[];
  totals: {
    revenue: number;
    cost: number;
    margin: number;
    margin_pct: number | null;
  };
};

type SiteRow = { id: string; code: string; name: string };
type CostRow = { site_id: string; cost_type: string; amount: number | string };
type InvoiceRow = { site_id: string; total_amount: number | string };

function toNumber(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

function marginPct(revenue: number, margin: number) {
  return revenue > 0 ? Math.round((margin / revenue) * 1000) / 10 : null;
}

/**
 * Real-time project profitability: revenue (issued/paid invoices) minus cost
 * (committed/posted cost entries) per site, with a cost breakdown by type.
 * Powers the executive "profitability by project" / gross-margin view.
 */
export async function fetchOpsProjectPnl(): Promise<OpsProjectPnlSummary> {
  const supabase = getOpsSupabaseServiceClient();

  const [sitesResult, costsResult, invoicesResult] = await Promise.all([
    supabase.from("sites").select("id, code, name").eq("is_active", true),
    supabase
      .from("project_cost_entries")
      .select("site_id, cost_type, amount")
      .in("status", ["committed", "posted"]),
    supabase
      .from("invoices")
      .select("site_id, total_amount")
      .is("deleted_at", null)
      .in("status", ["sent", "paid"]),
  ]);

  if (sitesResult.error) {
    throw sitesResult.error;
  }

  const sites = (sitesResult.data ?? []) as SiteRow[];
  const costs = (costsResult.data ?? []) as CostRow[];
  const invoices = (invoicesResult.data ?? []) as InvoiceRow[];

  const revenueBySite = new Map<string, number>();
  for (const invoice of invoices) {
    revenueBySite.set(
      invoice.site_id,
      (revenueBySite.get(invoice.site_id) ?? 0) + toNumber(invoice.total_amount),
    );
  }

  const costBySite = new Map<string, Map<string, number>>();
  for (const cost of costs) {
    const byType = costBySite.get(cost.site_id) ?? new Map<string, number>();
    const type = cost.cost_type || "general";
    byType.set(type, (byType.get(type) ?? 0) + toNumber(cost.amount));
    costBySite.set(cost.site_id, byType);
  }

  const rows: OpsProjectPnlRow[] = sites
    .map((site) => {
      const revenue = revenueBySite.get(site.id) ?? 0;
      const byTypeMap = costBySite.get(site.id) ?? new Map<string, number>();
      const cost_by_type = Array.from(byTypeMap.entries())
        .map(([type, amount]) => ({ type, amount }))
        .sort((a, b) => b.amount - a.amount);
      const total_cost = cost_by_type.reduce((sum, item) => sum + item.amount, 0);
      const margin = revenue - total_cost;

      return {
        site_id: site.id,
        code: site.code,
        name: site.name,
        revenue,
        total_cost,
        margin,
        margin_pct: marginPct(revenue, margin),
        cost_by_type,
      };
    })
    .filter((row) => row.revenue > 0 || row.total_cost > 0)
    .sort((a, b) => b.revenue - a.revenue || b.total_cost - a.total_cost);

  const totalRevenue = rows.reduce((sum, row) => sum + row.revenue, 0);
  const totalCost = rows.reduce((sum, row) => sum + row.total_cost, 0);
  const totalMargin = totalRevenue - totalCost;

  return {
    rows,
    totals: {
      revenue: totalRevenue,
      cost: totalCost,
      margin: totalMargin,
      margin_pct: marginPct(totalRevenue, totalMargin),
    },
  };
}
