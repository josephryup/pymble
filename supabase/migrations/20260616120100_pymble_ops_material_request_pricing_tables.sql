-- Pymble Operations — Material Request pricing workflow (part 2: table changes)
-- Adds:
--   • priced_at + priced_by columns on material_requests
--   • actual_unit_cost + actual_total columns on material_request_items
--   • trigger to keep actual_total = actual_unit_cost * quantity
--
-- The estimated_unit_cost column stays as the original engineer estimate so we
-- can report on procurement variance later (actual_total vs estimated_total).

alter table public.material_requests
  add column if not exists priced_at timestamptz,
  add column if not exists priced_by uuid references public.users(id) on delete set null;

alter table public.material_request_items
  add column if not exists actual_unit_cost numeric(14, 2) not null default 0
    check (actual_unit_cost >= 0);

alter table public.material_request_items
  add column if not exists actual_total numeric(14, 2) not null default 0
    check (actual_total >= 0);

create or replace function public.set_material_request_item_actual_total()
returns trigger
language plpgsql
as $$
begin
  new.actual_total := new.actual_unit_cost * new.quantity;
  return new;
end;
$$;

drop trigger if exists material_request_item_actual_total on public.material_request_items;
create trigger material_request_item_actual_total
  before insert or update of actual_unit_cost, quantity
  on public.material_request_items
  for each row
  execute function public.set_material_request_item_actual_total();

comment on column public.material_request_items.actual_unit_cost is
  'Actual supplier price per unit captured by procurement during the pricing_pending → priced transition.';
comment on column public.material_request_items.actual_total is
  'Auto-computed: actual_unit_cost * quantity. Used as the input to finance cost approval.';
comment on column public.material_requests.priced_at is
  'Timestamp procurement attached supplier prices and moved the request to priced.';
comment on column public.material_requests.priced_by is
  'User who attached supplier prices (procurement role).';
