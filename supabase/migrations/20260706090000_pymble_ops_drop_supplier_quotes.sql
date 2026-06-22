-- Retire the supplier-quote subsystem. The RFQ workflow now nominates a
-- supplier per line item and records the actual price directly on the line
-- (see 20260624 / 20260705 migrations), so the invite / record / award flow
-- and its tables are no longer used.
--
-- Order matters: drop the inbound FK columns and the child table before the
-- parent so no dependency blocks the drop.

alter table public.purchase_orders drop column if exists supplier_quote_id;
alter table public.rfqs drop column if exists awarded_quote_id;

drop table if exists public.supplier_quote_items;
drop table if exists public.supplier_quotes;
