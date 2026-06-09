do $$
begin
  if not exists (select 1 from pg_type where typname = 'ops_rfq_status') then
    create type public.ops_rfq_status as enum (
      'draft',
      'issued',
      'quoted',
      'awarded',
      'closed',
      'cancelled'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'ops_supplier_quote_status') then
    create type public.ops_supplier_quote_status as enum (
      'invited',
      'received',
      'declined',
      'awarded',
      'rejected'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'ops_purchase_order_status') then
    create type public.ops_purchase_order_status as enum (
      'draft',
      'approval_pending',
      'approved',
      'issued',
      'partially_received',
      'closed',
      'cancelled'
    );
  end if;
end $$;

create table if not exists public.rfqs (
  id uuid primary key default gen_random_uuid(),
  rfq_number text not null default (
    'RFQ-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  ),
  site_id uuid not null references public.sites(id) on delete restrict,
  material_request_id uuid references public.material_requests(id) on delete set null,
  title text not null check (length(btrim(title)) > 0),
  description text not null default '',
  status public.ops_rfq_status not null default 'draft',
  due_date date,
  currency_code text not null default 'ZMW' check (currency_code ~ '^[A-Z]{3}$'),
  created_by uuid references public.users(id) on delete set null,
  issued_at timestamptz,
  closed_at timestamptz,
  cancelled_at timestamptz,
  awarded_quote_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rfq_items (
  id uuid primary key default gen_random_uuid(),
  rfq_id uuid not null references public.rfqs(id) on delete cascade,
  material_request_item_id uuid references public.material_request_items(id) on delete set null,
  line_number integer not null check (line_number > 0),
  item_name text not null check (length(btrim(item_name)) > 0),
  specification text not null default '',
  unit text not null default 'each' check (length(btrim(unit)) > 0),
  quantity numeric(12, 2) not null check (quantity > 0),
  estimated_unit_cost numeric(12, 2) not null default 0 check (estimated_unit_cost >= 0),
  estimated_total numeric(14, 2) generated always as (quantity * estimated_unit_cost) stored,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rfq_id, line_number)
);

create table if not exists public.supplier_quotes (
  id uuid primary key default gen_random_uuid(),
  quote_number text not null default (
    'QUO-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  ),
  rfq_id uuid not null references public.rfqs(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  quote_reference text not null default '',
  status public.ops_supplier_quote_status not null default 'invited',
  quoted_total numeric(14, 2) not null default 0 check (quoted_total >= 0),
  currency_code text not null default 'ZMW' check (currency_code ~ '^[A-Z]{3}$'),
  valid_until date,
  notes text not null default '',
  created_by uuid references public.users(id) on delete set null,
  submitted_at timestamptz,
  awarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rfq_id, supplier_id)
);

create table if not exists public.supplier_quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.supplier_quotes(id) on delete cascade,
  rfq_item_id uuid not null references public.rfq_items(id) on delete cascade,
  quantity numeric(12, 2) not null check (quantity > 0),
  unit_price numeric(12, 2) not null default 0 check (unit_price >= 0),
  line_total numeric(14, 2) generated always as (quantity * unit_price) stored,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (quote_id, rfq_item_id)
);

create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  po_number text not null default (
    'PO-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  ),
  rfq_id uuid references public.rfqs(id) on delete set null,
  supplier_quote_id uuid references public.supplier_quotes(id) on delete set null,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  site_id uuid not null references public.sites(id) on delete restrict,
  material_request_id uuid references public.material_requests(id) on delete set null,
  title text not null check (length(btrim(title)) > 0),
  description text not null default '',
  status public.ops_purchase_order_status not null default 'draft',
  currency_code text not null default 'ZMW' check (currency_code ~ '^[A-Z]{3}$'),
  total_amount numeric(14, 2) not null default 0 check (total_amount >= 0),
  created_by uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  issued_at timestamptz,
  closed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  rfq_item_id uuid references public.rfq_items(id) on delete set null,
  line_number integer not null check (line_number > 0),
  item_name text not null check (length(btrim(item_name)) > 0),
  specification text not null default '',
  unit text not null default 'each' check (length(btrim(unit)) > 0),
  quantity numeric(12, 2) not null check (quantity > 0),
  unit_cost numeric(12, 2) not null default 0 check (unit_cost >= 0),
  line_total numeric(14, 2) generated always as (quantity * unit_cost) stored,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (purchase_order_id, line_number)
);

alter table public.rfqs
  drop constraint if exists rfqs_awarded_quote_id_fkey,
  add constraint rfqs_awarded_quote_id_fkey
    foreign key (awarded_quote_id)
    references public.supplier_quotes(id)
    on delete set null;

create unique index if not exists rfqs_rfq_number_unique
  on public.rfqs(rfq_number);
create index if not exists rfqs_site_status_idx
  on public.rfqs(site_id, status, created_at desc);
create index if not exists rfqs_material_request_idx
  on public.rfqs(material_request_id, created_at desc)
  where material_request_id is not null;
create index if not exists rfq_items_rfq_idx
  on public.rfq_items(rfq_id, line_number);

create unique index if not exists supplier_quotes_quote_number_unique
  on public.supplier_quotes(quote_number);
create index if not exists supplier_quotes_rfq_status_idx
  on public.supplier_quotes(rfq_id, status, created_at desc);
create index if not exists supplier_quotes_supplier_idx
  on public.supplier_quotes(supplier_id, created_at desc);
create index if not exists supplier_quote_items_quote_idx
  on public.supplier_quote_items(quote_id);

create unique index if not exists purchase_orders_po_number_unique
  on public.purchase_orders(po_number);
create index if not exists purchase_orders_site_status_idx
  on public.purchase_orders(site_id, status, created_at desc);
create index if not exists purchase_orders_supplier_status_idx
  on public.purchase_orders(supplier_id, status, created_at desc);
create index if not exists purchase_orders_rfq_idx
  on public.purchase_orders(rfq_id, created_at desc)
  where rfq_id is not null;
create index if not exists purchase_order_items_po_idx
  on public.purchase_order_items(purchase_order_id, line_number);

create or replace function private.can_access_procurement_workflows()
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
        'accountant'
      ),
      false
    )
$$;

grant execute on function private.can_access_procurement_workflows() to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'rfqs',
    'rfq_items',
    'supplier_quotes',
    'supplier_quote_items',
    'purchase_orders',
    'purchase_order_items'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', table_name);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function private.set_updated_at()',
      table_name
    );
  end loop;
end $$;

alter table public.rfqs enable row level security;
alter table public.rfq_items enable row level security;
alter table public.supplier_quotes enable row level security;
alter table public.supplier_quote_items enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;

grant select on public.rfqs to authenticated;
grant select on public.rfq_items to authenticated;
grant select on public.supplier_quotes to authenticated;
grant select on public.supplier_quote_items to authenticated;
grant select on public.purchase_orders to authenticated;
grant select on public.purchase_order_items to authenticated;
grant all on public.rfqs to service_role;
grant all on public.rfq_items to service_role;
grant all on public.supplier_quotes to service_role;
grant all on public.supplier_quote_items to service_role;
grant all on public.purchase_orders to service_role;
grant all on public.purchase_order_items to service_role;

drop policy if exists rfqs_select_ops on public.rfqs;
create policy rfqs_select_ops
on public.rfqs
for select
to authenticated
using (private.can_access_procurement_workflows());

drop policy if exists rfq_items_select_ops on public.rfq_items;
create policy rfq_items_select_ops
on public.rfq_items
for select
to authenticated
using (
  exists (
    select 1
    from public.rfqs as rfq
    where rfq.id = rfq_items.rfq_id
      and private.can_access_procurement_workflows()
  )
);

drop policy if exists supplier_quotes_select_ops on public.supplier_quotes;
create policy supplier_quotes_select_ops
on public.supplier_quotes
for select
to authenticated
using (
  exists (
    select 1
    from public.rfqs as rfq
    where rfq.id = supplier_quotes.rfq_id
      and private.can_access_procurement_workflows()
  )
);

drop policy if exists supplier_quote_items_select_ops on public.supplier_quote_items;
create policy supplier_quote_items_select_ops
on public.supplier_quote_items
for select
to authenticated
using (
  exists (
    select 1
    from public.supplier_quotes as quote
    join public.rfqs as rfq on rfq.id = quote.rfq_id
    where quote.id = supplier_quote_items.quote_id
      and private.can_access_procurement_workflows()
  )
);

drop policy if exists purchase_orders_select_ops on public.purchase_orders;
create policy purchase_orders_select_ops
on public.purchase_orders
for select
to authenticated
using (private.can_access_procurement_workflows());

drop policy if exists purchase_order_items_select_ops on public.purchase_order_items;
create policy purchase_order_items_select_ops
on public.purchase_order_items
for select
to authenticated
using (
  exists (
    select 1
    from public.purchase_orders as po
    where po.id = purchase_order_items.purchase_order_id
      and private.can_access_procurement_workflows()
  )
);
