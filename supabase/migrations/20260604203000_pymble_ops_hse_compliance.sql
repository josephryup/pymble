do $$
begin
  if not exists (select 1 from pg_type where typname = 'ops_ppe_issue_status') then
    create type public.ops_ppe_issue_status as enum (
      'issued',
      'returned',
      'damaged',
      'lost',
      'cancelled'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'ops_ppe_item_type') then
    create type public.ops_ppe_item_type as enum (
      'helmet',
      'vest',
      'boots',
      'gloves',
      'goggles',
      'harness',
      'respirator',
      'ear_protection',
      'other'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'ops_toolbox_talk_status') then
    create type public.ops_toolbox_talk_status as enum (
      'planned',
      'completed',
      'cancelled'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'ops_hse_inspection_status') then
    create type public.ops_hse_inspection_status as enum (
      'planned',
      'completed',
      'action_required',
      'closed',
      'cancelled'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'ops_hse_inspection_type') then
    create type public.ops_hse_inspection_type as enum (
      'site_walk',
      'scaffolding',
      'lifting',
      'electrical',
      'excavation',
      'fire',
      'environmental',
      'plant_equipment',
      'housekeeping',
      'other'
    );
  end if;
end $$;

create table if not exists public.ppe_issues (
  id uuid primary key default gen_random_uuid(),
  issue_number text not null default (
    'PPE-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  ),
  site_id uuid references public.sites(id) on delete set null,
  employee_id uuid references public.employees(id) on delete set null,
  issued_to_name text not null check (length(btrim(issued_to_name)) > 0),
  ppe_type public.ops_ppe_item_type not null default 'other',
  item_description text not null default '',
  quantity integer not null default 1 check (quantity > 0),
  status public.ops_ppe_issue_status not null default 'issued',
  issue_date date not null default current_date,
  due_return_date date,
  issued_by uuid references public.users(id) on delete set null,
  returned_at timestamptz,
  return_condition_notes text not null default '',
  replacement_cost numeric(12, 2) not null default 0 check (replacement_cost >= 0),
  notes text not null default '',
  cancelled_at timestamptz,
  cancelled_by uuid references public.users(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (due_return_date is null or due_return_date >= issue_date)
);

create table if not exists public.toolbox_talks (
  id uuid primary key default gen_random_uuid(),
  talk_number text not null default (
    'TBT-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  ),
  site_id uuid not null references public.sites(id) on delete restrict,
  topic text not null check (length(btrim(topic)) > 0),
  safety_category text not null default '',
  status public.ops_toolbox_talk_status not null default 'planned',
  talk_date date not null default current_date,
  facilitator_id uuid references public.users(id) on delete set null,
  attendees_count integer not null default 0 check (attendees_count >= 0),
  duration_minutes integer not null default 0 check (duration_minutes >= 0),
  summary text not null default '',
  actions_required text not null default '',
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid references public.users(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hse_inspections (
  id uuid primary key default gen_random_uuid(),
  inspection_number text not null default (
    'INSP-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  ),
  site_id uuid not null references public.sites(id) on delete restrict,
  inspection_type public.ops_hse_inspection_type not null default 'other',
  title text not null check (length(btrim(title)) > 0),
  status public.ops_hse_inspection_status not null default 'planned',
  scheduled_date date not null default current_date,
  inspector_id uuid references public.users(id) on delete set null,
  score numeric(5, 2) not null default 0 check (score >= 0 and score <= 100),
  findings_count integer not null default 0 check (findings_count >= 0),
  action_count integer not null default 0 check (action_count >= 0),
  summary text not null default '',
  corrective_actions_required text not null default '',
  completed_at timestamptz,
  action_required_at timestamptz,
  closed_at timestamptz,
  closed_by uuid references public.users(id) on delete set null,
  cancelled_at timestamptz,
  cancelled_by uuid references public.users(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ppe_issues_number_unique
  on public.ppe_issues(issue_number);
create index if not exists ppe_issues_status_due_idx
  on public.ppe_issues(status, due_return_date, issue_date desc);
create index if not exists ppe_issues_site_employee_idx
  on public.ppe_issues(site_id, employee_id, status);

create unique index if not exists toolbox_talks_number_unique
  on public.toolbox_talks(talk_number);
create index if not exists toolbox_talks_site_status_date_idx
  on public.toolbox_talks(site_id, status, talk_date desc);

create unique index if not exists hse_inspections_number_unique
  on public.hse_inspections(inspection_number);
create index if not exists hse_inspections_site_status_date_idx
  on public.hse_inspections(site_id, status, scheduled_date desc);
create index if not exists hse_inspections_type_status_idx
  on public.hse_inspections(inspection_type, status, scheduled_date desc);

create or replace function private.can_access_hse_compliance()
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
        'engineer',
        'hse_officer',
        'hse_assistant_officer',
        'supervisor'
      ),
      false
    )
$$;

grant execute on function private.can_access_hse_compliance() to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'ppe_issues',
    'toolbox_talks',
    'hse_inspections'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', table_name);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function private.set_updated_at()',
      table_name
    );
  end loop;
end $$;

alter table public.ppe_issues enable row level security;
alter table public.toolbox_talks enable row level security;
alter table public.hse_inspections enable row level security;

grant select on public.ppe_issues to authenticated;
grant select on public.toolbox_talks to authenticated;
grant select on public.hse_inspections to authenticated;
grant all on public.ppe_issues to service_role;
grant all on public.toolbox_talks to service_role;
grant all on public.hse_inspections to service_role;

drop policy if exists ppe_issues_select_ops on public.ppe_issues;
create policy ppe_issues_select_ops
on public.ppe_issues
for select
to authenticated
using (private.can_access_hse_compliance());

drop policy if exists toolbox_talks_select_ops on public.toolbox_talks;
create policy toolbox_talks_select_ops
on public.toolbox_talks
for select
to authenticated
using (private.can_access_hse_compliance());

drop policy if exists hse_inspections_select_ops on public.hse_inspections;
create policy hse_inspections_select_ops
on public.hse_inspections
for select
to authenticated
using (private.can_access_hse_compliance());
