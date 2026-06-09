do $$
begin
  if not exists (select 1 from pg_type where typname = 'ops_fuel_log_status') then
    create type public.ops_fuel_log_status as enum (
      'posted',
      'cancelled'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'ops_maintenance_job_status') then
    create type public.ops_maintenance_job_status as enum (
      'scheduled',
      'in_progress',
      'completed',
      'cancelled'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'ops_maintenance_job_type') then
    create type public.ops_maintenance_job_type as enum (
      'preventive',
      'repair',
      'inspection',
      'service',
      'breakdown',
      'other'
    );
  end if;
end $$;

create table if not exists public.fuel_logs (
  id uuid primary key default gen_random_uuid(),
  fuel_log_number text not null default (
    'FUL-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  ),
  equipment_id uuid not null references public.equipment(id) on delete restrict,
  allocation_id uuid references public.equipment_allocations(id) on delete set null,
  site_id uuid references public.sites(id) on delete set null,
  fuel_date date not null default current_date,
  fuel_type text not null default 'diesel' check (fuel_type ~ '^[a-z][a-z0-9_]*$'),
  quantity_litres numeric(12, 2) not null check (quantity_litres > 0),
  unit_cost numeric(12, 2) not null default 0 check (unit_cost >= 0),
  total_amount numeric(14, 2) generated always as (quantity_litres * unit_cost) stored,
  odometer_hours numeric(12, 2) not null default 0 check (odometer_hours >= 0),
  status public.ops_fuel_log_status not null default 'posted',
  logged_by uuid references public.users(id) on delete set null,
  notes text not null default '',
  cancelled_at timestamptz,
  cancelled_by uuid references public.users(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.maintenance_jobs (
  id uuid primary key default gen_random_uuid(),
  job_number text not null default (
    'MNT-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  ),
  equipment_id uuid not null references public.equipment(id) on delete restrict,
  site_id uuid references public.sites(id) on delete set null,
  job_type public.ops_maintenance_job_type not null default 'service',
  status public.ops_maintenance_job_status not null default 'scheduled',
  priority public.ops_priority not null default 'normal',
  title text not null check (length(btrim(title)) > 0),
  description text not null default '',
  reported_at date not null default current_date,
  scheduled_for date,
  started_at timestamptz,
  started_by uuid references public.users(id) on delete set null,
  completed_at timestamptz,
  completed_by uuid references public.users(id) on delete set null,
  cancelled_at timestamptz,
  cancelled_by uuid references public.users(id) on delete set null,
  estimated_cost numeric(14, 2) not null default 0 check (estimated_cost >= 0),
  actual_cost numeric(14, 2) not null default 0 check (actual_cost >= 0),
  downtime_hours numeric(12, 2) not null default 0 check (downtime_hours >= 0),
  service_provider text not null default '',
  next_service_due date,
  cost_entry_id uuid references public.project_cost_entries(id) on delete set null,
  notes text not null default '',
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.maintenance_job_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.maintenance_jobs(id) on delete cascade,
  line_number integer not null check (line_number > 0),
  description text not null check (length(btrim(description)) > 0),
  quantity numeric(12, 2) not null default 1 check (quantity > 0),
  unit_cost numeric(12, 2) not null default 0 check (unit_cost >= 0),
  line_total numeric(14, 2) generated always as (quantity * unit_cost) stored,
  notes text not null default '',
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, line_number)
);

create unique index if not exists fuel_logs_number_unique
  on public.fuel_logs(fuel_log_number);
create index if not exists fuel_logs_equipment_date_idx
  on public.fuel_logs(equipment_id, fuel_date desc);
create index if not exists fuel_logs_site_date_idx
  on public.fuel_logs(site_id, fuel_date desc)
  where site_id is not null;
create index if not exists fuel_logs_allocation_idx
  on public.fuel_logs(allocation_id, fuel_date desc)
  where allocation_id is not null;

create unique index if not exists maintenance_jobs_number_unique
  on public.maintenance_jobs(job_number);
create index if not exists maintenance_jobs_equipment_status_idx
  on public.maintenance_jobs(equipment_id, status, scheduled_for desc);
create index if not exists maintenance_jobs_site_status_idx
  on public.maintenance_jobs(site_id, status, scheduled_for desc)
  where site_id is not null;
create index if not exists maintenance_jobs_cost_entry_idx
  on public.maintenance_jobs(cost_entry_id)
  where cost_entry_id is not null;
create index if not exists maintenance_job_items_job_idx
  on public.maintenance_job_items(job_id, line_number);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'fuel_logs',
    'maintenance_jobs',
    'maintenance_job_items'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', table_name);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function private.set_updated_at()',
      table_name
    );
  end loop;
end $$;

alter table public.fuel_logs enable row level security;
alter table public.maintenance_jobs enable row level security;
alter table public.maintenance_job_items enable row level security;

grant select on public.fuel_logs to authenticated;
grant select on public.maintenance_jobs to authenticated;
grant select on public.maintenance_job_items to authenticated;
grant all on public.fuel_logs to service_role;
grant all on public.maintenance_jobs to service_role;
grant all on public.maintenance_job_items to service_role;

drop policy if exists fuel_logs_select_ops on public.fuel_logs;
create policy fuel_logs_select_ops
on public.fuel_logs
for select
to authenticated
using (private.can_access_equipment_fleet());

drop policy if exists maintenance_jobs_select_ops on public.maintenance_jobs;
create policy maintenance_jobs_select_ops
on public.maintenance_jobs
for select
to authenticated
using (private.can_access_equipment_fleet());

drop policy if exists maintenance_job_items_select_ops on public.maintenance_job_items;
create policy maintenance_job_items_select_ops
on public.maintenance_job_items
for select
to authenticated
using (
  exists (
    select 1
    from public.maintenance_jobs as job
    where job.id = maintenance_job_items.job_id
      and private.can_access_equipment_fleet()
  )
);
