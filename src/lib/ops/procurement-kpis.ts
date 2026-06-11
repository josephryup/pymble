import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

function toNumber(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

// ---------------------------------------------------------------------------
// D2 — Stock alerts (items below minimum)
// ---------------------------------------------------------------------------

export type OpsStockAlertRow = {
  stock_item_id: string;
  item_code: string;
  item_name: string;
  unit: string;
  minimum_quantity: number;
  on_hand: number;
  shortfall: number;
  lead_time_days: number;
  severity: "critical" | "warn";
};

export type OpsStockAlertSummary = {
  rows: OpsStockAlertRow[];
  critical: number;
  warning: number;
};

/**
 * Items where aggregate on-hand quantity is at or below the configured minimum.
 * "critical" = on-hand is at zero or below ~50% of minimum; "warn" otherwise.
 */
export async function fetchOpsStockAlerts(): Promise<OpsStockAlertSummary> {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("stock_items")
    .select(
      "id, item_code, item_name, unit, minimum_quantity, lead_time_days, stock_levels(quantity_on_hand)",
    )
    .eq("is_active", true)
    .gt("minimum_quantity", 0);

  if (error) {
    throw error;
  }

  type StockRow = {
    id: string;
    item_code: string;
    item_name: string;
    unit: string;
    minimum_quantity: number | string;
    lead_time_days: number | string | null;
    stock_levels: Array<{ quantity_on_hand: number | string }> | null;
  };

  const rows = ((data ?? []) as StockRow[])
    .map((row) => {
      const minimum = toNumber(row.minimum_quantity);
      const onHand = (row.stock_levels ?? []).reduce(
        (sum, level) => sum + toNumber(level.quantity_on_hand),
        0,
      );
      const shortfall = Math.max(0, minimum - onHand);

      return {
        stock_item_id: row.id,
        item_code: row.item_code,
        item_name: row.item_name,
        unit: row.unit,
        minimum_quantity: minimum,
        on_hand: onHand,
        shortfall,
        lead_time_days: Number(row.lead_time_days ?? 0),
        severity: (onHand === 0 || onHand <= minimum / 2 ? "critical" : "warn") as
          | "critical"
          | "warn",
      } satisfies OpsStockAlertRow;
    })
    .filter((row) => row.on_hand <= row.minimum_quantity)
    .sort((a, b) => b.shortfall - a.shortfall);

  return {
    rows,
    critical: rows.filter((row) => row.severity === "critical").length,
    warning: rows.filter((row) => row.severity === "warn").length,
  };
}

// ---------------------------------------------------------------------------
// D3 — Supplier scorecard
// ---------------------------------------------------------------------------

export type OpsSupplierScorecardRow = {
  supplier_id: string;
  supplier_code: string;
  legal_name: string;
  active_pos: number;
  closed_pos: number;
  total_po_amount: number;
  performance_events: number;
  avg_rating: number | null;
  avg_lead_time_days: number | null;
  on_time_delivery_pct: number | null;
};

type PoRow = {
  id: string;
  supplier_id: string;
  status: string;
  total_amount: number | string;
  issued_at: string | null;
  delivery_date: string | null;
  required_by: string | null;
};

type GrnRow = {
  purchase_order_id: string;
  received_date: string;
};

type EventRow = { supplier_id: string; rating: number | string };

function daysBetween(later: string, earlier: string) {
  const days = Math.floor(
    (new Date(later).getTime() - new Date(earlier).getTime()) / (24 * 60 * 60 * 1000),
  );
  return days;
}

export async function fetchOpsSupplierScorecards(): Promise<OpsSupplierScorecardRow[]> {
  const supabase = getOpsSupabaseServiceClient();
  const [suppliersResult, posResult, grnResult, eventsResult] = await Promise.all([
    supabase
      .from("suppliers")
      .select("id, supplier_code, legal_name, status")
      .eq("status", "active"),
    supabase
      .from("purchase_orders")
      .select("id, supplier_id, status, total_amount, issued_at, delivery_date, required_by"),
    supabase
      .from("goods_received_notes")
      .select("purchase_order_id, received_date")
      .eq("status", "posted"),
    supabase.from("supplier_performance_events").select("supplier_id, rating"),
  ]);

  if (suppliersResult.error || posResult.error || grnResult.error || eventsResult.error) {
    return [];
  }

  type SupplierRow = { id: string; supplier_code: string; legal_name: string };

  const suppliers = (suppliersResult.data ?? []) as SupplierRow[];
  const pos = (posResult.data ?? []) as PoRow[];
  const grns = (grnResult.data ?? []) as GrnRow[];
  const events = (eventsResult.data ?? []) as EventRow[];

  // earliest GRN per PO (closest to "delivered" event we have)
  const earliestGrnByPo = new Map<string, string>();
  for (const grn of grns) {
    const existing = earliestGrnByPo.get(grn.purchase_order_id);
    if (!existing || grn.received_date < existing) {
      earliestGrnByPo.set(grn.purchase_order_id, grn.received_date);
    }
  }

  return suppliers.map((supplier) => {
    const supplierPos = pos.filter((po) => po.supplier_id === supplier.id);
    const activePos = supplierPos.filter((po) =>
      ["issued", "partially_received"].includes(po.status),
    ).length;
    const closedPos = supplierPos.filter((po) => po.status === "closed").length;
    const totalAmount = supplierPos
      .filter((po) => po.status !== "cancelled" && po.status !== "draft")
      .reduce((sum, po) => sum + toNumber(po.total_amount), 0);

    const supplierEvents = events.filter((event) => event.supplier_id === supplier.id);
    const avgRating =
      supplierEvents.length > 0
        ? Math.round(
            (supplierEvents.reduce((sum, event) => sum + Number(event.rating), 0) /
              supplierEvents.length) *
              10,
          ) / 10
        : null;

    // Lead time: days from issued_at to earliest GRN, for POs that received goods.
    const leadTimeSamples: number[] = [];
    let onTimeCount = 0;
    let dueSamples = 0;

    for (const po of supplierPos) {
      const grnDate = earliestGrnByPo.get(po.id);
      if (po.issued_at && grnDate) {
        const lt = daysBetween(grnDate, po.issued_at);
        if (lt >= 0) leadTimeSamples.push(lt);
      }

      const target = po.delivery_date ?? po.required_by;
      if (target && grnDate) {
        dueSamples += 1;
        if (grnDate <= target) onTimeCount += 1;
      }
    }

    const avgLeadTime =
      leadTimeSamples.length > 0
        ? Math.round(
            leadTimeSamples.reduce((sum, day) => sum + day, 0) / leadTimeSamples.length,
          )
        : null;
    const onTimePct =
      dueSamples > 0 ? Math.round((onTimeCount / dueSamples) * 100) : null;

    return {
      supplier_id: supplier.id,
      supplier_code: supplier.supplier_code,
      legal_name: supplier.legal_name,
      active_pos: activePos,
      closed_pos: closedPos,
      total_po_amount: totalAmount,
      performance_events: supplierEvents.length,
      avg_rating: avgRating,
      avg_lead_time_days: avgLeadTime,
      on_time_delivery_pct: onTimePct,
    } satisfies OpsSupplierScorecardRow;
  });
}

// ---------------------------------------------------------------------------
// D4 — Delivery tracker board
// ---------------------------------------------------------------------------

export type OpsDeliveryTrackerRow = {
  purchase_order_id: string;
  po_number: string;
  supplier_code: string;
  supplier_name: string;
  site_code: string;
  site_name: string;
  status: string;
  total_amount: number;
  required_by: string | null;
  delivery_date: string | null;
  grn_count: number;
  exception_count: number;
  days_open: number;
  flag: "ok" | "overdue" | "exception";
};

export type OpsDeliveryTrackerSummary = {
  rows: OpsDeliveryTrackerRow[];
  byStatus: Record<string, number>;
  overdue: number;
  withExceptions: number;
};

export async function fetchOpsDeliveryTracker(
  now = new Date(),
): Promise<OpsDeliveryTrackerSummary> {
  const supabase = getOpsSupabaseServiceClient();
  const [posResult, grnResult, exceptionsResult] = await Promise.all([
    supabase
      .from("purchase_orders")
      .select(
        "id, po_number, status, total_amount, required_by, delivery_date, issued_at, created_at, supplier:suppliers!purchase_orders_supplier_id_fkey(supplier_code, legal_name), site:sites!purchase_orders_site_id_fkey(code, name)",
      )
      .in("status", ["issued", "partially_received", "closed"])
      .order("issued_at", { ascending: false, nullsFirst: false })
      .limit(50),
    supabase
      .from("goods_received_notes")
      .select("purchase_order_id")
      .eq("status", "posted"),
    supabase
      .from("delivery_exceptions")
      .select("purchase_order_id, status")
      .not("status", "in", '("resolved","cancelled")'),
  ]);

  if (posResult.error || grnResult.error || exceptionsResult.error) {
    return { rows: [], byStatus: {}, overdue: 0, withExceptions: 0 };
  }

  type PoRelation<T> = T | T[] | null;
  type RawPo = {
    id: string;
    po_number: string;
    status: string;
    total_amount: number | string;
    required_by: string | null;
    delivery_date: string | null;
    issued_at: string | null;
    created_at: string;
    supplier: PoRelation<{ supplier_code: string; legal_name: string }>;
    site: PoRelation<{ code: string; name: string }>;
  };

  function relation<T>(value: PoRelation<T>): T | null {
    return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
  }

  const grnCounts = new Map<string, number>();
  for (const grn of (grnResult.data ?? []) as Array<{ purchase_order_id: string }>) {
    grnCounts.set(grn.purchase_order_id, (grnCounts.get(grn.purchase_order_id) ?? 0) + 1);
  }

  const exceptionCounts = new Map<string, number>();
  for (const exc of (exceptionsResult.data ?? []) as Array<{ purchase_order_id: string | null }>) {
    if (!exc.purchase_order_id) continue;
    exceptionCounts.set(
      exc.purchase_order_id,
      (exceptionCounts.get(exc.purchase_order_id) ?? 0) + 1,
    );
  }

  const today = now.toISOString().slice(0, 10);
  const rows = ((posResult.data ?? []) as RawPo[]).map((po) => {
    const supplier = relation(po.supplier);
    const site = relation(po.site);
    const requiredBy = po.delivery_date ?? po.required_by;
    const exceptionCount = exceptionCounts.get(po.id) ?? 0;
    const overdue =
      po.status !== "closed" && requiredBy !== null && requiredBy < today;

    let daysOpen = 0;
    if (po.issued_at) {
      daysOpen = Math.max(
        0,
        Math.floor(
          (now.getTime() - new Date(po.issued_at).getTime()) / (24 * 60 * 60 * 1000),
        ),
      );
    }

    return {
      purchase_order_id: po.id,
      po_number: po.po_number,
      supplier_code: supplier?.supplier_code ?? "",
      supplier_name: supplier?.legal_name ?? "Supplier unavailable",
      site_code: site?.code ?? "",
      site_name: site?.name ?? "Site unavailable",
      status: po.status,
      total_amount: toNumber(po.total_amount),
      required_by: requiredBy,
      delivery_date: po.delivery_date,
      grn_count: grnCounts.get(po.id) ?? 0,
      exception_count: exceptionCount,
      days_open: daysOpen,
      flag:
        exceptionCount > 0 ? ("exception" as const) : overdue ? ("overdue" as const) : ("ok" as const),
    } satisfies OpsDeliveryTrackerRow;
  });

  const byStatus: Record<string, number> = {};
  for (const row of rows) {
    byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
  }

  return {
    rows,
    byStatus,
    overdue: rows.filter((row) => row.flag === "overdue").length,
    withExceptions: rows.filter((row) => row.flag === "exception").length,
  };
}
