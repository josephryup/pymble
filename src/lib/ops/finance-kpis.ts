import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function toNumber(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

function pct(part: number, whole: number, decimals = 1) {
  if (whole <= 0) {
    return null;
  }
  const factor = 10 ** decimals;
  return Math.round((part / whole) * 100 * factor) / factor;
}

function diffDays(later: Date, earlier: Date) {
  return Math.floor((later.getTime() - earlier.getTime()) / (24 * 60 * 60 * 1000));
}

export const OPS_AGEING_BUCKETS = ["0-30", "31-60", "61-90", "90+"] as const;
export type OpsAgeingBucket = (typeof OPS_AGEING_BUCKETS)[number];

function bucketForDays(days: number): OpsAgeingBucket {
  if (days <= 30) return "0-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}

function emptyBucketTotals(): Record<OpsAgeingBucket, number> {
  return { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
}

// ---------------------------------------------------------------------------
// C1 — Cashflow forecast chart
// ---------------------------------------------------------------------------

export type OpsCashflowChartPoint = {
  period_start: string;
  period_label: string;
  forecast_inflow: number;
  forecast_outflow: number;
  forecast_net: number;
  actual_net: number;
};

export type OpsCashflowChartSummary = {
  points: OpsCashflowChartPoint[];
  totals: {
    forecast_inflow: number;
    forecast_outflow: number;
    forecast_net: number;
    actual_net: number;
  };
};

type CashflowRow = {
  period_start: string;
  period_end: string;
  forecast_revenue: number | string;
  forecast_retention_release: number | string;
  forecast_cost: number | string;
  actual_revenue: number | string;
  actual_cost: number | string;
};

function periodLabel(periodStart: string) {
  return new Intl.DateTimeFormat("en-ZM", {
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(`${periodStart}T00:00:00Z`));
}

export async function fetchOpsCashflowChart(): Promise<OpsCashflowChartSummary> {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("commercial_cashflow_forecasts")
    .select(
      "period_start, period_end, forecast_revenue, forecast_retention_release, forecast_cost, actual_revenue, actual_cost",
    )
    .not("status", "in", '("cancelled","archived")')
    .order("period_start", { ascending: true })
    .limit(36);

  if (error) {
    throw error;
  }

  const rows = ((data ?? []) as CashflowRow[]).map((row) => ({
    period_start: row.period_start,
    period_label: periodLabel(row.period_start),
    forecast_inflow: toNumber(row.forecast_revenue) + toNumber(row.forecast_retention_release),
    forecast_outflow: toNumber(row.forecast_cost),
    forecast_net:
      toNumber(row.forecast_revenue) +
      toNumber(row.forecast_retention_release) -
      toNumber(row.forecast_cost),
    actual_net: toNumber(row.actual_revenue) - toNumber(row.actual_cost),
  }));

  const totals = rows.reduce(
    (acc, row) => ({
      forecast_inflow: acc.forecast_inflow + row.forecast_inflow,
      forecast_outflow: acc.forecast_outflow + row.forecast_outflow,
      forecast_net: acc.forecast_net + row.forecast_net,
      actual_net: acc.actual_net + row.actual_net,
    }),
    { forecast_inflow: 0, forecast_outflow: 0, forecast_net: 0, actual_net: 0 },
  );

  return { points: rows, totals };
}

// ---------------------------------------------------------------------------
// C2 / C3 — Ageing reports
// ---------------------------------------------------------------------------

export type OpsAgeingRow = {
  id: string;
  label: string;
  bucket: OpsAgeingBucket;
  days_outstanding: number;
  outstanding: number;
  reference: string;
};

export type OpsAgeingSummary = {
  rows: OpsAgeingRow[];
  bucketTotals: Record<OpsAgeingBucket, number>;
  total: number;
};

type PaymentRequestRow = {
  id: string;
  request_number: string;
  title: string;
  status: string;
  requested_amount: number | string | null;
  submitted_at: string | null;
  due_date: string | null;
  created_at: string;
  supplier: { legal_name: string } | { legal_name: string }[] | null;
};

type InvoiceRow = {
  id: string;
  invoice_number: string;
  client_name: string;
  status: string;
  total_amount: number | string | null;
  issued_at: string | null;
  sent_at: string | null;
};

function resolveSupplierName(
  supplier: PaymentRequestRow["supplier"],
  fallback: string,
) {
  if (!supplier) return fallback;
  if (Array.isArray(supplier)) return supplier[0]?.legal_name ?? fallback;
  return supplier.legal_name ?? fallback;
}

function ageingSummary(rows: OpsAgeingRow[]): OpsAgeingSummary {
  const bucketTotals = emptyBucketTotals();
  let total = 0;

  for (const row of rows) {
    bucketTotals[row.bucket] += row.outstanding;
    total += row.outstanding;
  }

  return { rows, bucketTotals, total };
}

/** Supplier ageing — outstanding (submitted/finance_review/approved) payment requests. */
export async function fetchOpsSupplierAgeing(now = new Date()): Promise<OpsAgeingSummary> {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("payment_requests")
    .select(
      "id, request_number, title, status, requested_amount, submitted_at, due_date, created_at, supplier:suppliers!payment_requests_supplier_id_fkey(legal_name)",
    )
    .in("status", ["submitted", "finance_review", "approved"]);

  if (error) {
    throw error;
  }

  const rows = ((data ?? []) as PaymentRequestRow[]).map((row) => {
    const anchorIso = row.submitted_at ?? row.created_at;
    const anchor = new Date(anchorIso);
    const days = Math.max(0, diffDays(now, anchor));
    const supplier = resolveSupplierName(row.supplier, "Supplier unavailable");

    return {
      id: row.id,
      label: `${row.request_number} — ${supplier}`,
      bucket: bucketForDays(days),
      days_outstanding: days,
      outstanding: toNumber(row.requested_amount),
      reference: row.title,
    } satisfies OpsAgeingRow;
  });

  rows.sort((a, b) => b.days_outstanding - a.days_outstanding);
  return ageingSummary(rows);
}

/** Receivables ageing — outstanding (sent) client invoices. */
export async function fetchOpsReceivablesAgeing(now = new Date()): Promise<OpsAgeingSummary> {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("invoices")
    .select("id, invoice_number, client_name, status, total_amount, issued_at, sent_at")
    .is("deleted_at", null)
    .eq("status", "sent");

  if (error) {
    throw error;
  }

  const rows = ((data ?? []) as InvoiceRow[]).map((row) => {
    // issued_at is a date; sent_at a timestamptz — prefer sent_at when present.
    const anchorIso =
      row.sent_at ?? (row.issued_at ? `${row.issued_at}T00:00:00Z` : new Date().toISOString());
    const anchor = new Date(anchorIso);
    const days = Math.max(0, diffDays(now, anchor));

    return {
      id: row.id,
      label: `${row.invoice_number} — ${row.client_name}`,
      bucket: bucketForDays(days),
      days_outstanding: days,
      outstanding: toNumber(row.total_amount),
      reference: row.client_name,
    } satisfies OpsAgeingRow;
  });

  rows.sort((a, b) => b.days_outstanding - a.days_outstanding);
  return ageingSummary(rows);
}

// ---------------------------------------------------------------------------
// C4 — Commercial KPIs (gross profit %, variation recovery %, IPC turnaround)
// ---------------------------------------------------------------------------

export type OpsCommercialKpis = {
  // Gross profit: from invoices vs costs (mirrors project-pnl roll-up)
  revenue: number;
  cost: number;
  gross_profit: number;
  gross_profit_pct: number | null;
  // Variation recovery
  variation_submitted: number;
  variation_approved: number;
  variation_recovery_pct: number | null;
  // IPC turnaround (avg days submitted -> paid for completed cycles)
  ipc_avg_turnaround_days: number | null;
  ipc_sample_size: number;
};

type VariationRow = {
  status: string;
  submitted_amount: number | string | null;
  approved_amount: number | string | null;
};

type IpcRow = {
  status: string;
  submitted_at: string | null;
  paid_at: string | null;
};

export async function fetchOpsCommercialKpis(): Promise<OpsCommercialKpis> {
  const supabase = getOpsSupabaseServiceClient();

  const [invoices, costs, variations, ipcs] = await Promise.all([
    supabase
      .from("invoices")
      .select("total_amount, status")
      .is("deleted_at", null)
      .in("status", ["sent", "paid"]),
    supabase
      .from("project_cost_entries")
      .select("amount, status")
      .in("status", ["committed", "posted"]),
    supabase
      .from("commercial_variations")
      .select("status, submitted_amount, approved_amount")
      .in("status", ["submitted", "priced", "approved", "rejected", "closed"]),
    supabase
      .from("commercial_ipcs")
      .select("status, submitted_at, paid_at")
      .eq("status", "paid")
      .not("submitted_at", "is", null)
      .not("paid_at", "is", null),
  ]);

  const revenue = ((invoices.data ?? []) as Array<{ total_amount: number | string }>).reduce(
    (sum, row) => sum + toNumber(row.total_amount),
    0,
  );
  const cost = ((costs.data ?? []) as Array<{ amount: number | string }>).reduce(
    (sum, row) => sum + toNumber(row.amount),
    0,
  );
  const grossProfit = revenue - cost;

  const variationRows = (variations.data ?? []) as VariationRow[];
  const variationSubmitted = variationRows.reduce(
    (sum, row) => sum + toNumber(row.submitted_amount),
    0,
  );
  const variationApproved = variationRows.reduce(
    (sum, row) => sum + toNumber(row.approved_amount),
    0,
  );

  const ipcRows = (ipcs.data ?? []) as IpcRow[];
  let ipcDaysTotal = 0;
  let ipcSample = 0;
  for (const ipc of ipcRows) {
    if (!ipc.submitted_at || !ipc.paid_at) continue;
    const submitted = new Date(ipc.submitted_at);
    const paid = new Date(ipc.paid_at);
    const days = diffDays(paid, submitted);
    if (days >= 0) {
      ipcDaysTotal += days;
      ipcSample += 1;
    }
  }

  return {
    revenue,
    cost,
    gross_profit: grossProfit,
    gross_profit_pct: pct(grossProfit, revenue),
    variation_submitted: variationSubmitted,
    variation_approved: variationApproved,
    variation_recovery_pct: pct(variationApproved, variationSubmitted),
    ipc_avg_turnaround_days: ipcSample > 0 ? Math.round(ipcDaysTotal / ipcSample) : null,
    ipc_sample_size: ipcSample,
  };
}
