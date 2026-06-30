import { AlertTriangle, ChevronRight, Star, Timer, Truck, Warehouse } from "lucide-react";
import Link from "next/link";
import type {
  OpsDeliveryTrackerSummary,
  OpsStockAlertSummary,
  OpsSupplierScorecardRow,
} from "@/lib/ops/procurement-kpis";
import { formatZmw, OPS_EYEBROW_CLASS } from "@/lib/ops/ui";

// ---------------------------------------------------------------------------
// Stock alerts panel
// ---------------------------------------------------------------------------

export function OpsStockAlertsPanel({ summary }: { summary: OpsStockAlertSummary }) {
  return (
    <section className="rounded-lg border border-border border-l-4 border-l-orange-500 bg-card p-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className={OPS_EYEBROW_CLASS}>
            Stock alerts
          </p>
          <h2 className="mt-1 font-heading text-xl font-bold text-foreground">
            Items at or below minimum
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Aggregated across all locations. Set a minimum on each stock item to enable alerts.
          </p>
        </div>
        <span className="flex size-9 items-center justify-center rounded-md bg-orange-50 text-orange-700">
          <Warehouse className="size-5" aria-hidden="true" />
        </span>
      </header>

      <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-red-700">
            Critical
          </p>
          <p className="mt-0.5 text-sm font-bold text-red-700">{summary.critical}</p>
        </div>
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-amber-700">
            Warning
          </p>
          <p className="mt-0.5 text-sm font-bold text-amber-700">{summary.warning}</p>
        </div>
        <div className="rounded-md border border-border px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
            Tracked items
          </p>
          <p className="mt-0.5 text-sm font-bold text-foreground">
            {summary.rows.length}
          </p>
        </div>
      </dl>

      {summary.rows.length > 0 ? (
        <ul className="mt-4 grid gap-2">
          {summary.rows.slice(0, 8).map((row) => (
            <li
              className={`flex items-start justify-between gap-3 rounded-md border px-3 py-2.5 ${
                row.severity === "critical"
                  ? "border-red-200 bg-red-50"
                  : "border-amber-200 bg-amber-50"
              }`}
              key={row.stock_item_id}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-foreground">
                  <span className="text-primary-blue">{row.item_code}</span> — {row.item_name}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  On hand {row.on_hand} {row.unit} · min {row.minimum_quantity} {row.unit}
                  {row.lead_time_days > 0 ? ` · lead ${row.lead_time_days}d` : ""}
                </p>
              </div>
              <p className="shrink-0 text-sm font-bold text-foreground">
                {row.shortfall > 0 ? `-${row.shortfall} ${row.unit}` : "At minimum"}
              </p>
            </li>
          ))}
          {summary.rows.length > 8 ? (
            <li className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              +{summary.rows.length - 8} more
            </li>
          ) : null}
        </ul>
      ) : (
        <p className="mt-4 rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          All tracked stock items are at or above their minimums.
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Supplier scorecard panel
// ---------------------------------------------------------------------------

function ratingBadgeClass(rating: number | null) {
  if (rating === null) return "border-border bg-muted text-muted-foreground";
  if (rating >= 4) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (rating >= 3) return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-red-200 bg-red-50 text-red-700";
}

function onTimeClass(pct: number | null) {
  if (pct === null) return "text-muted-foreground";
  if (pct >= 90) return "text-emerald-700";
  if (pct >= 75) return "text-amber-700";
  return "text-red-700";
}

export function OpsSupplierScorecardPanel({
  scorecards,
}: {
  scorecards: OpsSupplierScorecardRow[];
}) {
  const sorted = [...scorecards]
    .filter((row) => row.active_pos + row.closed_pos + row.performance_events > 0)
    .sort((a, b) => b.total_po_amount - a.total_po_amount)
    .slice(0, 10);

  return (
    <section className="rounded-lg border border-border border-l-4 border-l-primary bg-card p-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className={OPS_EYEBROW_CLASS}>
            Supplier scorecard
          </p>
          <h2 className="mt-1 font-heading text-xl font-bold text-foreground">
            Top suppliers by spend
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Lead time, on-time delivery, and rating from purchase orders + performance events.
          </p>
        </div>
        <span className="flex size-9 items-center justify-center rounded-md bg-primary-blue/10 text-primary-blue">
          <Star className="size-5" aria-hidden="true" />
        </span>
      </header>

      {sorted.length > 0 ? (
        <ul className="mt-4 grid gap-2">
          {sorted.map((row) => (
            <li
              className="grid gap-2 rounded-md border border-border px-3 py-3 sm:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))] sm:items-center"
              key={row.supplier_id}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-foreground">
                  <span className="text-primary-blue">{row.supplier_code}</span> — {row.legal_name}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {row.active_pos} active · {row.closed_pos} closed · {row.performance_events} events
                </p>
              </div>
              <div className="text-xs">
                <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                  Spend
                </p>
                <p className="mt-0.5 font-bold text-foreground">{formatZmw(row.total_po_amount)}</p>
              </div>
              <div className="text-xs">
                <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                  Lead time
                </p>
                <p className="mt-0.5 font-bold text-foreground">
                  {row.avg_lead_time_days !== null ? `${row.avg_lead_time_days}d` : "—"}
                </p>
              </div>
              <div className="text-xs">
                <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                  On time
                </p>
                <p className={`mt-0.5 font-bold ${onTimeClass(row.on_time_delivery_pct)}`}>
                  {row.on_time_delivery_pct !== null ? `${row.on_time_delivery_pct}%` : "—"}
                </p>
              </div>
              <div className="text-xs">
                <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                  Rating
                </p>
                <span
                  className={`mt-0.5 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-bold ${ratingBadgeClass(row.avg_rating)}`}
                >
                  {row.avg_rating !== null ? `${row.avg_rating}/5` : "no rating"}
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No supplier activity yet. Issue purchase orders and log performance events to populate the
          scorecard.
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Delivery tracker board
// ---------------------------------------------------------------------------

const DELIVERY_COLUMNS = [
  { key: "issued", label: "Issued" },
  { key: "partially_received", label: "Partially received" },
  { key: "closed", label: "Closed" },
] as const;

function flagClass(flag: "ok" | "overdue" | "exception") {
  if (flag === "exception") return "border-red-200 bg-red-50";
  if (flag === "overdue") return "border-amber-200 bg-amber-50";
  return "border-border bg-card";
}

function flagBadgeClass(flag: "ok" | "overdue" | "exception") {
  if (flag === "exception") return "border-red-200 bg-red-100 text-red-700";
  if (flag === "overdue") return "border-amber-200 bg-amber-100 text-amber-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

export function OpsDeliveryTrackerPanel({
  summary,
}: {
  summary: OpsDeliveryTrackerSummary;
}) {
  return (
    <section className="rounded-lg border border-border border-l-4 border-l-primary bg-card p-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className={OPS_EYEBROW_CLASS}>
            Delivery tracker
          </p>
          <h2 className="mt-1 font-heading text-xl font-bold text-foreground">
            Purchase orders in flight
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Issued → partially received → closed, with GRN and exception counts per PO.
          </p>
        </div>
        <span className="flex size-9 items-center justify-center rounded-md bg-primary-blue/10 text-primary-blue">
          <Truck className="size-5" aria-hidden="true" />
        </span>
      </header>

      <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {DELIVERY_COLUMNS.map((column) => (
          <div className="rounded-md border border-border px-3 py-2.5" key={column.key}>
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
              {column.label}
            </p>
            <p className="mt-0.5 text-sm font-bold text-foreground">
              {summary.byStatus[column.key] ?? 0}
            </p>
          </div>
        ))}
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5">
          <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.1em] text-amber-700">
            <Timer className="size-3" aria-hidden="true" /> Overdue
          </p>
          <p className="mt-0.5 text-sm font-bold text-amber-700">{summary.overdue}</p>
        </div>
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5">
          <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.1em] text-red-700">
            <AlertTriangle className="size-3" aria-hidden="true" /> Exceptions
          </p>
          <p className="mt-0.5 text-sm font-bold text-red-700">{summary.withExceptions}</p>
        </div>
      </dl>

      {summary.rows.length > 0 ? (
        <ul className="mt-4 grid gap-2">
          {summary.rows.slice(0, 12).map((row) => (
            <li
              className={`grid gap-2 rounded-md border px-3 py-3 sm:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))_auto] sm:items-center ${flagClass(row.flag)}`}
              key={row.purchase_order_id}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-foreground">
                  <span className="text-primary-blue">{row.po_number}</span> — {row.supplier_name}
                </p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {row.site_code} · {row.site_name}
                </p>
              </div>
              <p className="text-xs font-semibold text-muted-foreground">
                {row.status.replace(/_/g, " ")}
              </p>
              <p className="text-xs font-semibold text-muted-foreground">
                {row.grn_count} GRN
                {row.grn_count === 1 ? "" : "s"}
              </p>
              <p className="text-xs font-semibold text-muted-foreground">
                {row.required_by ?? "no due date"}
              </p>
              <p className="text-xs font-bold text-foreground">{formatZmw(row.total_amount)}</p>
              <span
                className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] ${flagBadgeClass(row.flag)}`}
              >
                {row.flag === "exception"
                  ? `${row.exception_count} exception${row.exception_count === 1 ? "" : "s"}`
                  : row.flag === "overdue"
                    ? `${row.days_open}d open`
                    : `${row.days_open}d`}
              </span>
            </li>
          ))}
          {summary.rows.length > 12 ? (
            <li className="text-right">
              <Link
                className="inline-flex items-center text-xs font-bold text-primary-blue hover:underline"
                href="/ops/rfq-po"
              >
                See all purchase orders
                <ChevronRight className="size-3.5" aria-hidden="true" />
              </Link>
            </li>
          ) : null}
        </ul>
      ) : (
        <p className="mt-4 rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No purchase orders in flight.
        </p>
      )}
    </section>
  );
}
