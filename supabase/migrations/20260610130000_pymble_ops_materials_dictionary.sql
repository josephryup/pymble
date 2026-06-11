-- Pymble Operations — Materials dictionary maturity
-- The existing `stock_items` table already provides the canonical material code
-- (`item_code`) and standard unit (`unit`), so it doubles as the materials
-- dictionary. This migration extends it with the minimum-stock and lead-time
-- attributes the Odoo ERP requirement calls out (Procurement → Required System
-- Setup → "Minimum stock levels", "Delivery periods").

alter table public.stock_items
  add column if not exists minimum_quantity numeric(14, 2) not null default 0
    check (minimum_quantity >= 0),
  add column if not exists target_quantity numeric(14, 2) not null default 0
    check (target_quantity >= 0),
  add column if not exists lead_time_days integer not null default 0
    check (lead_time_days >= 0),
  add column if not exists last_unit_cost numeric(14, 2) not null default 0
    check (last_unit_cost >= 0);

comment on column public.stock_items.minimum_quantity is
  'Reorder-point quantity (aggregate across locations). Used to flag below-min alerts.';
comment on column public.stock_items.target_quantity is
  'Target on-hand quantity for reorder-up-to planning. Optional.';
comment on column public.stock_items.lead_time_days is
  'Typical supplier lead time in days. Optional; used in stock alert urgency.';
comment on column public.stock_items.last_unit_cost is
  'Most recent unit cost seen on a GRN, for valuation and quick estimates.';

create index if not exists stock_items_min_quantity_active_idx
  on public.stock_items (is_active, minimum_quantity);
