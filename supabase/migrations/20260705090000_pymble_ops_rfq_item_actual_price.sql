-- Per-item ACTUAL price on RFQ items. Workflow change: the procurement office
-- gets prices directly from the chosen supplier and records them on the line,
-- rather than running the supplier-quote / award subsystem. The estimated cost
-- stays for planning; actual cost drives conversion to purchase orders.

alter table public.rfq_items
  add column if not exists actual_unit_cost numeric(12, 2) not null default 0
    check (actual_unit_cost >= 0);

-- Generated line total from the actual unit cost (mirrors estimated_total).
alter table public.rfq_items
  add column if not exists actual_total numeric(14, 2)
    generated always as (quantity * actual_unit_cost) stored;
