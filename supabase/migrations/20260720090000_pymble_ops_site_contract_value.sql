-- Add the agreed client contract sum (revenue) to sites.
--
-- Distinct from budget_zmw (internal cost budget) and actual_budget_zmw (spend):
-- contract_value is the top-line contract amount agreed with the client. It's
-- commercially sensitive and is gated in the app exactly like budget_zmw
-- (canViewSiteBudget).

alter table public.sites
  add column if not exists contract_value numeric(14, 2) not null default 0
    check (contract_value >= 0);

comment on column public.sites.contract_value is
  'Agreed contract sum with the client (revenue), in ZMW. Commercially sensitive — gated like budget_zmw.';
