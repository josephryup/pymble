-- Pymble Operations — Weekly HSE Reports
--
-- A separate table from daily site reports so HSE Officers can roll up the
-- week's safety picture for leadership without it being mixed into the
-- engineering daily report cadence. Per Part 2.6 of the workflow design.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'ops_hse_weekly_report_status') then
    create type public.ops_hse_weekly_report_status as enum (
      'draft',
      'submitted',
      'reviewed'
    );
  end if;
end $$;

create table if not exists public.hse_weekly_reports (
  id uuid primary key default gen_random_uuid(),
  report_number text not null default (
    'HWR-' || to_char(now(), 'YYYYMMDD') || '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  ),
  site_id uuid not null references public.sites(id) on delete restrict,
  week_start date not null,
  week_end date not null check (week_end >= week_start),
  status public.ops_hse_weekly_report_status not null default 'draft',
  incidents_count integer not null default 0 check (incidents_count >= 0),
  near_misses_count integer not null default 0 check (near_misses_count >= 0),
  ppe_compliance_pct numeric(5, 2)
    check (ppe_compliance_pct is null or (ppe_compliance_pct >= 0 and ppe_compliance_pct <= 100)),
  toolbox_talks_held integer not null default 0 check (toolbox_talks_held >= 0),
  inspections_completed integer not null default 0 check (inspections_completed >= 0),
  concerns text not null default '',
  actions_planned_next_week text not null default '',
  prepared_by uuid references public.users(id) on delete set null,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references public.users(id) on delete set null,
  archived_at timestamptz,
  archived_by uuid references public.users(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists hse_weekly_reports_number_unique
  on public.hse_weekly_reports(report_number);

-- One report per site per week.
create unique index if not exists hse_weekly_reports_site_week_unique
  on public.hse_weekly_reports(site_id, week_start);

create index if not exists hse_weekly_reports_site_status_idx
  on public.hse_weekly_reports(site_id, status, week_start desc);

create index if not exists hse_weekly_reports_archived_idx
  on public.hse_weekly_reports(archived_at)
  where archived_at is not null;

-- RLS
alter table public.hse_weekly_reports enable row level security;

grant select on public.hse_weekly_reports to authenticated;
grant all on public.hse_weekly_reports to service_role;

drop policy if exists hse_weekly_reports_select_ops on public.hse_weekly_reports;
create policy hse_weekly_reports_select_ops
on public.hse_weekly_reports
for select
to authenticated
using (private.can_access_hr_maturity());

-- updated_at trigger
drop trigger if exists set_updated_at on public.hse_weekly_reports;
create trigger set_updated_at
  before update on public.hse_weekly_reports
  for each row
  execute function private.set_updated_at();

comment on table public.hse_weekly_reports is
  'Weekly HSE rollup filed by HSE Officer / HSE Assistant. Submission notifies Operations Manager, Projects Manager, General Manager, and MD.';
