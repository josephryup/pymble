do $$
begin
  if not exists (select 1 from pg_type where typname = 'ops_transport_request_status') then
    create type public.ops_transport_request_status as enum (
      'draft',
      'submitted',
      'approved',
      'scheduled',
      'completed',
      'rejected',
      'cancelled'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'ops_transport_request_type') then
    create type public.ops_transport_request_type as enum (
      'staff_transport',
      'material_delivery',
      'equipment_move',
      'site_visit',
      'client_visit',
      'other'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'ops_accommodation_booking_status') then
    create type public.ops_accommodation_booking_status as enum (
      'requested',
      'confirmed',
      'checked_in',
      'completed',
      'cancelled'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'ops_labour_allocation_status') then
    create type public.ops_labour_allocation_status as enum (
      'planned',
      'active',
      'completed',
      'cancelled'
    );
  end if;
end $$;

create table if not exists public.transport_requests (
  id uuid primary key default gen_random_uuid(),
  request_number text not null default (
    'TRN-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  ),
  site_id uuid not null references public.sites(id) on delete restrict,
  request_type public.ops_transport_request_type not null default 'site_visit',
  status public.ops_transport_request_status not null default 'draft',
  priority public.ops_priority not null default 'normal',
  title text not null check (length(btrim(title)) > 0),
  description text not null default '',
  origin text not null default '',
  destination text not null default '',
  requested_for date not null default current_date,
  passenger_count integer not null default 0 check (passenger_count >= 0),
  material_description text not null default '',
  vehicle_requirement text not null default '',
  estimated_cost numeric(14, 2) not null default 0 check (estimated_cost >= 0),
  actual_cost numeric(14, 2) not null default 0 check (actual_cost >= 0),
  cost_entry_id uuid references public.project_cost_entries(id) on delete set null,
  requested_by uuid references public.users(id) on delete set null,
  submitted_at timestamptz,
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  scheduled_by uuid references public.users(id) on delete set null,
  scheduled_at timestamptz,
  completed_by uuid references public.users(id) on delete set null,
  completed_at timestamptz,
  rejected_by uuid references public.users(id) on delete set null,
  rejected_at timestamptz,
  rejection_reason text not null default '',
  cancelled_by uuid references public.users(id) on delete set null,
  cancelled_at timestamptz,
  notes text not null default '',
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.accommodation_bookings (
  id uuid primary key default gen_random_uuid(),
  booking_number text not null default (
    'ACC-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  ),
  site_id uuid not null references public.sites(id) on delete restrict,
  employee_id uuid references public.employees(id) on delete set null,
  worker_id uuid references public.workers(id) on delete set null,
  status public.ops_accommodation_booking_status not null default 'requested',
  location_name text not null check (length(btrim(location_name)) > 0),
  provider_name text not null default '',
  check_in_date date not null default current_date,
  check_out_date date not null,
  occupant_count integer not null default 1 check (occupant_count > 0),
  estimated_cost numeric(14, 2) not null default 0 check (estimated_cost >= 0),
  actual_cost numeric(14, 2) not null default 0 check (actual_cost >= 0),
  cost_entry_id uuid references public.project_cost_entries(id) on delete set null,
  requested_by uuid references public.users(id) on delete set null,
  confirmed_by uuid references public.users(id) on delete set null,
  confirmed_at timestamptz,
  checked_in_by uuid references public.users(id) on delete set null,
  checked_in_at timestamptz,
  completed_by uuid references public.users(id) on delete set null,
  completed_at timestamptz,
  cancelled_by uuid references public.users(id) on delete set null,
  cancelled_at timestamptz,
  notes text not null default '',
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    employee_id is not null
    or worker_id is not null
    or occupant_count > 0
  ),
  check (check_out_date >= check_in_date)
);

create table if not exists public.labour_allocations (
  id uuid primary key default gen_random_uuid(),
  allocation_number text not null default (
    'LAB-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  ),
  site_id uuid not null references public.sites(id) on delete restrict,
  employee_id uuid references public.employees(id) on delete set null,
  worker_id uuid references public.workers(id) on delete set null,
  status public.ops_labour_allocation_status not null default 'planned',
  role_title text not null check (length(btrim(role_title)) > 0),
  trade text not null default '',
  start_date date not null default current_date,
  end_date date,
  planned_days numeric(8, 2) not null default 1 check (planned_days > 0),
  actual_days numeric(8, 2) not null default 0 check (actual_days >= 0),
  daily_rate numeric(14, 2) not null default 0 check (daily_rate >= 0),
  estimated_cost numeric(14, 2) generated always as (planned_days * daily_rate) stored,
  actual_cost numeric(14, 2) generated always as (actual_days * daily_rate) stored,
  cost_entry_id uuid references public.project_cost_entries(id) on delete set null,
  requested_by uuid references public.users(id) on delete set null,
  started_by uuid references public.users(id) on delete set null,
  started_at timestamptz,
  completed_by uuid references public.users(id) on delete set null,
  completed_at timestamptz,
  cancelled_by uuid references public.users(id) on delete set null,
  cancelled_at timestamptz,
  notes text not null default '',
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (employee_id is not null or worker_id is not null),
  check (end_date is null or end_date >= start_date)
);

create unique index if not exists transport_requests_number_unique
  on public.transport_requests(request_number);
create index if not exists transport_requests_site_status_idx
  on public.transport_requests(site_id, status, requested_for desc);
create index if not exists transport_requests_status_date_idx
  on public.transport_requests(status, requested_for desc, created_at desc);
create index if not exists transport_requests_cost_entry_idx
  on public.transport_requests(cost_entry_id)
  where cost_entry_id is not null;

create unique index if not exists accommodation_bookings_number_unique
  on public.accommodation_bookings(booking_number);
create index if not exists accommodation_bookings_site_status_idx
  on public.accommodation_bookings(site_id, status, check_in_date desc);
create index if not exists accommodation_bookings_employee_idx
  on public.accommodation_bookings(employee_id, check_in_date desc)
  where employee_id is not null;
create index if not exists accommodation_bookings_worker_idx
  on public.accommodation_bookings(worker_id, check_in_date desc)
  where worker_id is not null;
create index if not exists accommodation_bookings_cost_entry_idx
  on public.accommodation_bookings(cost_entry_id)
  where cost_entry_id is not null;

create unique index if not exists labour_allocations_number_unique
  on public.labour_allocations(allocation_number);
create index if not exists labour_allocations_site_status_idx
  on public.labour_allocations(site_id, status, start_date desc);
create index if not exists labour_allocations_employee_idx
  on public.labour_allocations(employee_id, start_date desc)
  where employee_id is not null;
create index if not exists labour_allocations_worker_idx
  on public.labour_allocations(worker_id, start_date desc)
  where worker_id is not null;
create index if not exists labour_allocations_cost_entry_idx
  on public.labour_allocations(cost_entry_id)
  where cost_entry_id is not null;

create or replace function private.can_access_fleet_logistics()
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
        'human_resource',
        'hr',
        'admin_receptionist',
        'supervisor'
      ),
      false
    )
$$;

grant execute on function private.can_access_fleet_logistics() to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'transport_requests',
    'accommodation_bookings',
    'labour_allocations'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', table_name);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function private.set_updated_at()',
      table_name
    );
  end loop;
end $$;

alter table public.transport_requests enable row level security;
alter table public.accommodation_bookings enable row level security;
alter table public.labour_allocations enable row level security;

grant select on public.transport_requests to authenticated;
grant select on public.accommodation_bookings to authenticated;
grant select on public.labour_allocations to authenticated;
grant all on public.transport_requests to service_role;
grant all on public.accommodation_bookings to service_role;
grant all on public.labour_allocations to service_role;

drop policy if exists transport_requests_select_ops on public.transport_requests;
create policy transport_requests_select_ops
on public.transport_requests
for select
to authenticated
using (private.can_access_fleet_logistics());

drop policy if exists accommodation_bookings_select_ops on public.accommodation_bookings;
create policy accommodation_bookings_select_ops
on public.accommodation_bookings
for select
to authenticated
using (private.can_access_fleet_logistics());

drop policy if exists labour_allocations_select_ops on public.labour_allocations;
create policy labour_allocations_select_ops
on public.labour_allocations
for select
to authenticated
using (private.can_access_fleet_logistics());
