-- Per-item supplier on RFQ items. Aligns RFQ with the workflow change in
-- pymble_ops_per_item_supplier: each line nominates its own supplier (or a
-- typed free-text name) instead of the RFQ "inviting" external suppliers.

alter table public.rfq_items
  add column if not exists supplier_id uuid references public.suppliers(id),
  add column if not exists supplier_name_freeform text;

create index if not exists rfq_items_supplier_idx on public.rfq_items (supplier_id);
