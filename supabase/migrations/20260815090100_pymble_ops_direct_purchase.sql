-- Direct purchases — the second way a material request reaches "procured".
--
-- Decision D1 (docs/pymble-ops-finance-report-metrics-2026-08.md §8): the
-- sourced RFQ→PO path had existed for six weeks, across 24 cost-approved
-- requests, without being used once. A great deal of site material in this
-- trade is bought over the counter, and an RFQ cycle for a bag of cement will
-- never be used however the metric is defined. So "procured" now means a
-- purchase record exists, of either kind.
--
-- A direct purchase is still a purchase_orders row rather than a table of its
-- own. That is deliberate: deriveRequestFulfilment, the partial-procurement
-- arithmetic, three-way match and every existing report read purchase orders,
-- and all of them stay correct for free. The kind is what differs, not the
-- shape.

alter table public.purchase_orders
  add column if not exists purchase_kind text not null default 'sourced',
  -- Receipt / till-slip number for a cash purchase. The only evidence such a
  -- purchase leaves, so it is a column rather than prose in the description.
  add column if not exists receipt_reference text not null default '';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'purchase_orders_purchase_kind_check'
  ) then
    alter table public.purchase_orders
      add constraint purchase_orders_purchase_kind_check
      check (purchase_kind in ('sourced', 'direct'));
  end if;
end $$;

-- Every order written before this migration came through the sourced path.
update public.purchase_orders set purchase_kind = 'sourced' where purchase_kind is null;

comment on column public.purchase_orders.purchase_kind is
  'sourced = raised through RFQ/PO and issued to a supplier; direct = a cash or walk-in purchase recorded after the fact.';
comment on column public.purchase_orders.receipt_reference is
  'Receipt or till-slip number. Direct purchases only; blank on sourced orders.';

-- Reporting reads "what was procured in this period" off this pairing.
create index if not exists purchase_orders_kind_issued_at_idx
  on public.purchase_orders (purchase_kind, issued_at);
