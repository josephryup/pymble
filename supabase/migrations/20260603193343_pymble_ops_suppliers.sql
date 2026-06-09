do $$
begin
  if not exists (select 1 from pg_type where typname = 'ops_supplier_status') then
    create type public.ops_supplier_status as enum ('active', 'on_hold', 'archived');
  end if;
end $$;

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  supplier_code text not null default (
    'SUP-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  ),
  legal_name text not null check (length(btrim(legal_name)) > 0),
  trading_name text not null default '',
  category text not null default 'general' check (category ~ '^[a-z][a-z0-9_]*$'),
  status public.ops_supplier_status not null default 'active',
  tpin text not null default '',
  email text not null default '',
  phone text not null default '',
  address_line text not null default '',
  city text not null default '',
  country text not null default 'Zambia',
  rating smallint check (rating is null or rating between 1 and 5),
  notes text not null default '',
  created_by uuid references public.users(id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.supplier_contacts (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  full_name text not null check (length(btrim(full_name)) > 0),
  role_title text not null default '',
  email text not null default '',
  phone text not null default '',
  is_primary boolean not null default false,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists suppliers_supplier_code_unique
  on public.suppliers(supplier_code);
create index if not exists suppliers_status_category_idx
  on public.suppliers(status, category, created_at desc);
create index if not exists suppliers_city_idx
  on public.suppliers(city)
  where city <> '';
create index if not exists suppliers_name_lookup_idx
  on public.suppliers(lower(legal_name), lower(trading_name));
create index if not exists supplier_contacts_supplier_idx
  on public.supplier_contacts(supplier_id, is_primary desc, created_at desc);
create unique index if not exists supplier_contacts_one_primary_unique
  on public.supplier_contacts(supplier_id)
  where is_primary = true;

create or replace function private.can_access_supplier_register()
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

grant execute on function private.can_access_supplier_register() to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'suppliers',
    'supplier_contacts'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', table_name);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function private.set_updated_at()',
      table_name
    );
  end loop;
end $$;

alter table public.suppliers enable row level security;
alter table public.supplier_contacts enable row level security;

grant select on public.suppliers to authenticated;
grant select on public.supplier_contacts to authenticated;
grant all on public.suppliers to service_role;
grant all on public.supplier_contacts to service_role;

drop policy if exists suppliers_select_ops on public.suppliers;
create policy suppliers_select_ops
on public.suppliers
for select
to authenticated
using (private.can_access_supplier_register());

drop policy if exists supplier_contacts_select_ops on public.supplier_contacts;
create policy supplier_contacts_select_ops
on public.supplier_contacts
for select
to authenticated
using (
  exists (
    select 1
    from public.suppliers as supplier
    where supplier.id = supplier_contacts.supplier_id
      and private.can_access_supplier_register()
  )
);
