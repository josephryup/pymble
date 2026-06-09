do $$
begin
  if not exists (select 1 from pg_type where typname = 'ops_grn_status') then
    create type public.ops_grn_status as enum ('posted', 'cancelled');
  end if;

  if not exists (select 1 from pg_type where typname = 'ops_inventory_location_type') then
    create type public.ops_inventory_location_type as enum (
      'central_store',
      'site_store',
      'yard',
      'vehicle'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'ops_stock_movement_type') then
    create type public.ops_stock_movement_type as enum (
      'receipt',
      'issue',
      'adjustment',
      'transfer'
    );
  end if;
end $$;

create table if not exists public.inventory_locations (
  id uuid primary key default gen_random_uuid(),
  location_code text not null default (
    'LOC-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  ),
  name text not null check (length(btrim(name)) > 0),
  location_type public.ops_inventory_location_type not null default 'site_store',
  site_id uuid references public.sites(id) on delete set null,
  description text not null default '',
  is_active boolean not null default true,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stock_items (
  id uuid primary key default gen_random_uuid(),
  item_code text not null default (
    'STK-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  ),
  item_name text not null check (length(btrim(item_name)) > 0),
  category text not null default 'material' check (category ~ '^[a-z][a-z0-9_]*$'),
  specification text not null default '',
  unit text not null default 'each' check (length(btrim(unit)) > 0),
  is_active boolean not null default true,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.goods_received_notes (
  id uuid primary key default gen_random_uuid(),
  grn_number text not null default (
    'GRN-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  ),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete restrict,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  site_id uuid not null references public.sites(id) on delete restrict,
  location_id uuid not null references public.inventory_locations(id) on delete restrict,
  delivery_reference text not null default '',
  received_at date not null default current_date,
  received_by uuid references public.users(id) on delete set null,
  status public.ops_grn_status not null default 'posted',
  notes text not null default '',
  posted_at timestamptz not null default now(),
  cancelled_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.goods_received_items (
  id uuid primary key default gen_random_uuid(),
  grn_id uuid not null references public.goods_received_notes(id) on delete cascade,
  purchase_order_item_id uuid references public.purchase_order_items(id) on delete set null,
  stock_item_id uuid not null references public.stock_items(id) on delete restrict,
  line_number integer not null check (line_number > 0),
  item_name text not null check (length(btrim(item_name)) > 0),
  unit text not null default 'each' check (length(btrim(unit)) > 0),
  quantity_ordered numeric(12, 2) not null default 0 check (quantity_ordered >= 0),
  quantity_received numeric(12, 2) not null check (quantity_received > 0),
  quantity_rejected numeric(12, 2) not null default 0 check (quantity_rejected >= 0),
  unit_cost numeric(12, 2) not null default 0 check (unit_cost >= 0),
  line_total numeric(14, 2) generated always as (quantity_received * unit_cost) stored,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (grn_id, line_number)
);

create table if not exists public.stock_levels (
  id uuid primary key default gen_random_uuid(),
  stock_item_id uuid not null references public.stock_items(id) on delete cascade,
  location_id uuid not null references public.inventory_locations(id) on delete cascade,
  quantity_on_hand numeric(14, 2) not null default 0 check (quantity_on_hand >= 0),
  last_movement_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (stock_item_id, location_id)
);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  stock_item_id uuid not null references public.stock_items(id) on delete restrict,
  location_id uuid not null references public.inventory_locations(id) on delete restrict,
  movement_type public.ops_stock_movement_type not null,
  quantity numeric(14, 2) not null check (quantity <> 0),
  unit_cost numeric(12, 2) not null default 0 check (unit_cost >= 0),
  total_amount numeric(14, 2) generated always as (abs(quantity) * unit_cost) stored,
  source_table text not null check (source_table ~ '^[a-z][a-z0-9_]*$'),
  source_id uuid not null,
  movement_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null,
  notes text not null default '',
  created_at timestamptz not null default now()
);

create unique index if not exists inventory_locations_code_unique
  on public.inventory_locations(location_code);
create index if not exists inventory_locations_site_idx
  on public.inventory_locations(site_id, is_active);

create unique index if not exists stock_items_code_unique
  on public.stock_items(item_code);
create index if not exists stock_items_category_active_idx
  on public.stock_items(category, is_active, item_name);

create unique index if not exists goods_received_notes_number_unique
  on public.goods_received_notes(grn_number);
create index if not exists goods_received_notes_po_idx
  on public.goods_received_notes(purchase_order_id, received_at desc);
create index if not exists goods_received_notes_site_status_idx
  on public.goods_received_notes(site_id, status, received_at desc);
create index if not exists goods_received_items_grn_idx
  on public.goods_received_items(grn_id, line_number);
create index if not exists goods_received_items_stock_item_idx
  on public.goods_received_items(stock_item_id, created_at desc);

create index if not exists stock_levels_location_idx
  on public.stock_levels(location_id, quantity_on_hand desc);
create index if not exists stock_movements_item_location_idx
  on public.stock_movements(stock_item_id, location_id, movement_at desc);
create index if not exists stock_movements_source_idx
  on public.stock_movements(source_table, source_id, movement_at desc);

create or replace function private.can_access_stores_inventory()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select private.is_active_ops_user()
    and coalesce(
      private.current_user_role()::text in (
        'developer',
        'managing_director',
        'general_manager',
        'owner',
        'manager',
        'operations_manager',
        'projects_manager',
        'procurement_manager',
        'quantity_surveyor',
        'procurement',
        'procurement_assistant',
        'finance_manager',
        'accountant',
        'engineer',
        'supervisor'
      ),
      false
    )
$$;

grant execute on function private.can_access_stores_inventory() to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'inventory_locations',
    'stock_items',
    'goods_received_notes',
    'goods_received_items',
    'stock_levels'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', table_name);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function private.set_updated_at()',
      table_name
    );
  end loop;
end $$;

alter table public.inventory_locations enable row level security;
alter table public.stock_items enable row level security;
alter table public.goods_received_notes enable row level security;
alter table public.goods_received_items enable row level security;
alter table public.stock_levels enable row level security;
alter table public.stock_movements enable row level security;

grant select on public.inventory_locations to authenticated;
grant select on public.stock_items to authenticated;
grant select on public.goods_received_notes to authenticated;
grant select on public.goods_received_items to authenticated;
grant select on public.stock_levels to authenticated;
grant select on public.stock_movements to authenticated;
grant all on public.inventory_locations to service_role;
grant all on public.stock_items to service_role;
grant all on public.goods_received_notes to service_role;
grant all on public.goods_received_items to service_role;
grant all on public.stock_levels to service_role;
grant all on public.stock_movements to service_role;

drop policy if exists inventory_locations_select_ops on public.inventory_locations;
create policy inventory_locations_select_ops
on public.inventory_locations
for select
to authenticated
using (private.can_access_stores_inventory());

drop policy if exists stock_items_select_ops on public.stock_items;
create policy stock_items_select_ops
on public.stock_items
for select
to authenticated
using (private.can_access_stores_inventory());

drop policy if exists goods_received_notes_select_ops on public.goods_received_notes;
create policy goods_received_notes_select_ops
on public.goods_received_notes
for select
to authenticated
using (private.can_access_stores_inventory());

drop policy if exists goods_received_items_select_ops on public.goods_received_items;
create policy goods_received_items_select_ops
on public.goods_received_items
for select
to authenticated
using (
  exists (
    select 1
    from public.goods_received_notes as grn
    where grn.id = goods_received_items.grn_id
      and private.can_access_stores_inventory()
  )
);

drop policy if exists stock_levels_select_ops on public.stock_levels;
create policy stock_levels_select_ops
on public.stock_levels
for select
to authenticated
using (private.can_access_stores_inventory());

drop policy if exists stock_movements_select_ops on public.stock_movements;
create policy stock_movements_select_ops
on public.stock_movements
for select
to authenticated
using (private.can_access_stores_inventory());
