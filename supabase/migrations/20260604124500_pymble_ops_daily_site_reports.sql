do $$
begin
  if not exists (select 1 from pg_type where typname = 'ops_daily_site_report_status') then
    create type public.ops_daily_site_report_status as enum (
      'draft',
      'submitted',
      'reviewed',
      'closed'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'ops_daily_site_report_entry_type') then
    create type public.ops_daily_site_report_entry_type as enum (
      'progress',
      'labour',
      'equipment',
      'material',
      'delay',
      'hse',
      'commercial'
    );
  end if;
end $$;

create table if not exists public.daily_site_reports (
  id uuid primary key default gen_random_uuid(),
  report_number text not null default (
    'DSR-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  ),
  site_id uuid not null references public.sites(id) on delete restrict,
  report_date date not null default current_date,
  prepared_by uuid references public.users(id) on delete set null,
  reviewed_by uuid references public.users(id) on delete set null,
  status public.ops_daily_site_report_status not null default 'draft',
  weather text not null default '',
  progress_summary text not null default '',
  labour_notes text not null default '',
  equipment_notes text not null default '',
  material_notes text not null default '',
  delay_notes text not null default '',
  hse_notes text not null default '',
  commercial_notes text not null default '',
  overall_progress_percent numeric(5, 2) not null default 0 check (overall_progress_percent >= 0 and overall_progress_percent <= 100),
  labour_count integer not null default 0 check (labour_count >= 0),
  equipment_count integer not null default 0 check (equipment_count >= 0),
  material_deliveries_count integer not null default 0 check (material_deliveries_count >= 0),
  incident_count integer not null default 0 check (incident_count >= 0),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.daily_site_report_entries (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.daily_site_reports(id) on delete cascade,
  entry_type public.ops_daily_site_report_entry_type not null,
  title text not null check (length(btrim(title)) > 0),
  quantity numeric(14, 2) not null default 0 check (quantity >= 0),
  unit text not null default '',
  hours numeric(10, 2) not null default 0 check (hours >= 0),
  notes text not null default '',
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists daily_site_reports_number_unique
  on public.daily_site_reports(report_number);
create unique index if not exists daily_site_reports_site_date_unique
  on public.daily_site_reports(site_id, report_date)
  where status <> 'closed';
create index if not exists daily_site_reports_site_status_idx
  on public.daily_site_reports(site_id, status, report_date desc);
create index if not exists daily_site_reports_prepared_by_idx
  on public.daily_site_reports(prepared_by, report_date desc);
create index if not exists daily_site_report_entries_report_type_idx
  on public.daily_site_report_entries(report_id, entry_type, created_at desc);

create or replace function private.can_access_daily_site_reports()
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

grant execute on function private.can_access_daily_site_reports() to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'daily_site_reports',
    'daily_site_report_entries'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', table_name);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function private.set_updated_at()',
      table_name
    );
  end loop;
end $$;

alter table public.daily_site_reports enable row level security;
alter table public.daily_site_report_entries enable row level security;

grant select on public.daily_site_reports to authenticated;
grant select on public.daily_site_report_entries to authenticated;
grant all on public.daily_site_reports to service_role;
grant all on public.daily_site_report_entries to service_role;

drop policy if exists daily_site_reports_select_ops on public.daily_site_reports;
create policy daily_site_reports_select_ops
on public.daily_site_reports
for select
to authenticated
using (private.can_access_daily_site_reports());

drop policy if exists daily_site_report_entries_select_ops on public.daily_site_report_entries;
create policy daily_site_report_entries_select_ops
on public.daily_site_report_entries
for select
to authenticated
using (
  exists (
    select 1
    from public.daily_site_reports as report
    where report.id = daily_site_report_entries.report_id
      and private.can_access_daily_site_reports()
  )
);
