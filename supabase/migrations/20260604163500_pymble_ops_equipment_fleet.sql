do $$
begin
  if not exists (select 1 from pg_type where typname = 'ops_equipment_status') then
    create type public.ops_equipment_status as enum (
      'available',
      'allocated',
      'maintenance',
      'inactive'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'ops_equipment_ownership') then
    create type public.ops_equipment_ownership as enum (
      'company_owned',
      'hired',
      'leased'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'ops_equipment_request_status') then
    create type public.ops_equipment_request_status as enum (
      'draft',
      'submitted',
      'approved',
      'rejected',
      'allocated',
      'cancelled',
      'closed'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'ops_equipment_allocation_status') then
    create type public.ops_equipment_allocation_status as enum (
      'scheduled',
      'active',
      'completed',
      'cancelled'
    );
  end if;
end $$;

create table if not exists public.equipment_categories (
  id uuid primary key default gen_random_uuid(),
  category_code text not null default (
    'EQC-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  ),
  name text not null check (length(btrim(name)) > 0),
  description text not null default '',
  default_daily_rate numeric(14, 2) not null default 0 check (default_daily_rate >= 0),
  is_active boolean not null default true,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.equipment (
  id uuid primary key default gen_random_uuid(),
  equipment_code text not null default (
    'EQ-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  ),
  category_id uuid not null references public.equipment_categories(id) on delete restrict,
  name text not null check (length(btrim(name)) > 0),
  registration_number text not null default '',
  serial_number text not null default '',
  ownership public.ops_equipment_ownership not null default 'company_owned',
  status public.ops_equipment_status not null default 'available',
  base_location text not null default '',
  current_site_id uuid references public.sites(id) on delete set null,
  daily_rate numeric(14, 2) not null default 0 check (daily_rate >= 0),
  fuel_tracking_enabled boolean not null default false,
  notes text not null default '',
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.equipment_requests (
  id uuid primary key default gen_random_uuid(),
  request_number text not null default (
    'EQR-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  ),
  site_id uuid not null references public.sites(id) on delete restrict,
  equipment_category_id uuid references public.equipment_categories(id) on delete set null,
  preferred_equipment_id uuid references public.equipment(id) on delete set null,
  title text not null check (length(btrim(title)) > 0),
  description text not null default '',
  quantity integer not null default 1 check (quantity > 0),
  needed_from date not null default current_date,
  needed_until date,
  priority public.ops_priority not null default 'normal',
  status public.ops_equipment_request_status not null default 'draft',
  requested_by uuid references public.users(id) on delete set null,
  submitted_at timestamptz,
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  approved_by uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  rejected_by uuid references public.users(id) on delete set null,
  rejected_at timestamptz,
  cancelled_by uuid references public.users(id) on delete set null,
  cancelled_at timestamptz,
  closed_by uuid references public.users(id) on delete set null,
  closed_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.equipment_allocations (
  id uuid primary key default gen_random_uuid(),
  allocation_number text not null default (
    'EQA-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  ),
  request_id uuid references public.equipment_requests(id) on delete set null,
  equipment_id uuid not null references public.equipment(id) on delete restrict,
  site_id uuid not null references public.sites(id) on delete restrict,
  allocated_from date not null default current_date,
  allocated_until date,
  status public.ops_equipment_allocation_status not null default 'scheduled',
  planned_daily_rate numeric(14, 2) not null default 0 check (planned_daily_rate >= 0),
  actual_daily_rate numeric(14, 2) not null default 0 check (actual_daily_rate >= 0),
  cost_entry_id uuid references public.project_cost_entries(id) on delete set null,
  notes text not null default '',
  allocated_by uuid references public.users(id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  completed_by uuid references public.users(id) on delete set null,
  cancelled_at timestamptz,
  cancelled_by uuid references public.users(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists equipment_categories_code_unique
  on public.equipment_categories(category_code);
create index if not exists equipment_categories_active_idx
  on public.equipment_categories(is_active, name);

create unique index if not exists equipment_code_unique
  on public.equipment(equipment_code);
create index if not exists equipment_status_category_idx
  on public.equipment(status, category_id, name);
create index if not exists equipment_current_site_idx
  on public.equipment(current_site_id, status)
  where current_site_id is not null;

create unique index if not exists equipment_requests_number_unique
  on public.equipment_requests(request_number);
create index if not exists equipment_requests_status_needed_idx
  on public.equipment_requests(status, needed_from, created_at desc);
create index if not exists equipment_requests_site_status_idx
  on public.equipment_requests(site_id, status, created_at desc);

create unique index if not exists equipment_allocations_number_unique
  on public.equipment_allocations(allocation_number);
create index if not exists equipment_allocations_equipment_status_idx
  on public.equipment_allocations(equipment_id, status, allocated_from desc);
create index if not exists equipment_allocations_site_status_idx
  on public.equipment_allocations(site_id, status, allocated_from desc);
create index if not exists equipment_allocations_request_idx
  on public.equipment_allocations(request_id, created_at desc)
  where request_id is not null;

create or replace function private.can_access_equipment_fleet()
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
        'finance_manager',
        'accountant',
        'engineer',
        'hse_officer',
        'hse_assistant_officer',
        'supervisor'
      ),
      false
    )
$$;

grant execute on function private.can_access_equipment_fleet() to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'equipment_categories',
    'equipment',
    'equipment_requests',
    'equipment_allocations'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', table_name);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function private.set_updated_at()',
      table_name
    );
  end loop;
end $$;

alter table public.equipment_categories enable row level security;
alter table public.equipment enable row level security;
alter table public.equipment_requests enable row level security;
alter table public.equipment_allocations enable row level security;

grant select on public.equipment_categories to authenticated;
grant select on public.equipment to authenticated;
grant select on public.equipment_requests to authenticated;
grant select on public.equipment_allocations to authenticated;
grant all on public.equipment_categories to service_role;
grant all on public.equipment to service_role;
grant all on public.equipment_requests to service_role;
grant all on public.equipment_allocations to service_role;

drop policy if exists equipment_categories_select_ops on public.equipment_categories;
create policy equipment_categories_select_ops
on public.equipment_categories
for select
to authenticated
using (private.can_access_equipment_fleet());

drop policy if exists equipment_select_ops on public.equipment;
create policy equipment_select_ops
on public.equipment
for select
to authenticated
using (private.can_access_equipment_fleet());

drop policy if exists equipment_requests_select_ops on public.equipment_requests;
create policy equipment_requests_select_ops
on public.equipment_requests
for select
to authenticated
using (private.can_access_equipment_fleet());

drop policy if exists equipment_allocations_select_ops on public.equipment_allocations;
create policy equipment_allocations_select_ops
on public.equipment_allocations
for select
to authenticated
using (private.can_access_equipment_fleet());
