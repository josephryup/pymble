-- Material schedule lines ↔ materials dictionary (audit A3 / A4 / A5).
--
-- Schedule lines carried a free-text description, so nothing connected a
-- planned material to the item master. Three consequences, all fixed by one
-- link:
--   A3 — no price history or unit consistency behind a line;
--   A4 — deriveOpsBoqLineDates fell back to a zero-day lead time, so a line
--        without a manual override triggered on the day it was needed;
--   A5 — Procurement priced lines with no reference to the last paid price.
--
-- stock_items already is the materials dictionary: item_code, unit,
-- lead_time_days and last_unit_cost all live there
-- (20260730090400_pymble_ops_it_asset_specs.sql and the materials-dictionary
-- migration). The link is optional — ad-hoc lines for one-off materials stay
-- valid, they just do not get the dictionary's help.

alter table public.boq_line_items
  add column if not exists stock_item_id uuid references public.stock_items(id) on delete set null;

comment on column public.boq_line_items.stock_item_id is
  'Optional link to the materials dictionary (stock_items). Supplies the lead-time fallback for trigger dates and the last-paid price used to benchmark the unit rate.';

create index if not exists boq_line_items_stock_item_idx
  on public.boq_line_items (stock_item_id)
  where stock_item_id is not null;
