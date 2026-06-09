do $$
begin
  if not exists (select 1 from pg_type where typname = 'ops_site_instruction_status') then
    create type public.ops_site_instruction_status as enum (
      'draft',
      'issued',
      'acknowledged',
      'closed',
      'cancelled'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'ops_qa_inspection_status') then
    create type public.ops_qa_inspection_status as enum (
      'planned',
      'completed',
      'action_required',
      'closed',
      'cancelled'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'ops_qa_inspection_item_result') then
    create type public.ops_qa_inspection_item_result as enum (
      'pending',
      'pass',
      'fail',
      'observation',
      'not_applicable'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'ops_material_test_status') then
    create type public.ops_material_test_status as enum (
      'scheduled',
      'submitted',
      'passed',
      'failed',
      'cancelled'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'ops_snag_item_status') then
    create type public.ops_snag_item_status as enum (
      'open',
      'in_progress',
      'resolved',
      'verified',
      'cancelled'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'ops_drawing_register_status') then
    create type public.ops_drawing_register_status as enum (
      'current',
      'superseded',
      'archived'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'ops_programme_milestone_status') then
    create type public.ops_programme_milestone_status as enum (
      'planned',
      'on_track',
      'delayed',
      'completed',
      'cancelled'
    );
  end if;
end $$;

create table if not exists public.site_instructions (
  id uuid primary key default gen_random_uuid(),
  instruction_number text not null default (
    'SI-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  ),
  site_id uuid not null references public.sites(id) on delete restrict,
  instruction_type text not null default 'general' check (instruction_type ~ '^[a-z][a-z0-9_]*$'),
  status public.ops_site_instruction_status not null default 'draft',
  priority public.ops_priority not null default 'normal',
  title text not null check (length(btrim(title)) > 0),
  description text not null default '',
  instruction_date date not null default current_date,
  required_by date,
  issued_by uuid references public.users(id) on delete set null,
  assigned_to uuid references public.users(id) on delete set null,
  response_notes text not null default '',
  acknowledged_at timestamptz,
  closed_at timestamptz,
  closed_by uuid references public.users(id) on delete set null,
  cancelled_at timestamptz,
  cancelled_by uuid references public.users(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (required_by is null or required_by >= instruction_date)
);

create table if not exists public.qa_inspections (
  id uuid primary key default gen_random_uuid(),
  inspection_number text not null default (
    'QA-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  ),
  site_id uuid not null references public.sites(id) on delete restrict,
  inspection_type text not null default 'general' check (inspection_type ~ '^[a-z][a-z0-9_]*$'),
  status public.ops_qa_inspection_status not null default 'planned',
  title text not null check (length(btrim(title)) > 0),
  inspection_date date not null default current_date,
  inspector_id uuid references public.users(id) on delete set null,
  score numeric(5, 2) not null default 0 check (score >= 0 and score <= 100),
  findings_count integer not null default 0 check (findings_count >= 0),
  action_count integer not null default 0 check (action_count >= 0),
  summary text not null default '',
  action_required text not null default '',
  completed_at timestamptz,
  closed_at timestamptz,
  closed_by uuid references public.users(id) on delete set null,
  cancelled_at timestamptz,
  cancelled_by uuid references public.users(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.qa_inspection_items (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.qa_inspections(id) on delete cascade,
  line_number integer not null check (line_number > 0),
  checklist_item text not null check (length(btrim(checklist_item)) > 0),
  result public.ops_qa_inspection_item_result not null default 'pending',
  action_required boolean not null default false,
  responsible_user_id uuid references public.users(id) on delete set null,
  due_date date,
  notes text not null default '',
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (inspection_id, line_number)
);

create table if not exists public.material_tests (
  id uuid primary key default gen_random_uuid(),
  test_number text not null default (
    'MT-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  ),
  site_id uuid not null references public.sites(id) on delete restrict,
  qa_inspection_id uuid references public.qa_inspections(id) on delete set null,
  status public.ops_material_test_status not null default 'scheduled',
  test_type text not null check (length(btrim(test_type)) > 0),
  sample_reference text not null default '',
  location text not null default '',
  test_date date not null default current_date,
  required_by date,
  standard_reference text not null default '',
  lab_reference text not null default '',
  tested_by text not null default '',
  result_value text not null default '',
  result_summary text not null default '',
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid references public.users(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (required_by is null or required_by >= test_date)
);

create table if not exists public.snag_items (
  id uuid primary key default gen_random_uuid(),
  snag_number text not null default (
    'SNAG-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  ),
  site_id uuid not null references public.sites(id) on delete restrict,
  qa_inspection_id uuid references public.qa_inspections(id) on delete set null,
  status public.ops_snag_item_status not null default 'open',
  priority public.ops_priority not null default 'normal',
  title text not null check (length(btrim(title)) > 0),
  location text not null default '',
  description text not null default '',
  assigned_to uuid references public.users(id) on delete set null,
  due_date date,
  resolution_notes text not null default '',
  resolved_at timestamptz,
  verified_at timestamptz,
  verified_by uuid references public.users(id) on delete set null,
  cancelled_at timestamptz,
  cancelled_by uuid references public.users(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.drawing_register (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete restrict,
  drawing_number text not null check (length(btrim(drawing_number)) > 0),
  title text not null check (length(btrim(title)) > 0),
  discipline text not null default '',
  revision text not null default '0',
  status public.ops_drawing_register_status not null default 'current',
  issued_date date,
  received_date date not null default current_date,
  document_id uuid references public.documents(id) on delete set null,
  notes text not null default '',
  archived_at timestamptz,
  archived_by uuid references public.users(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.programme_milestones (
  id uuid primary key default gen_random_uuid(),
  milestone_number text not null default (
    'PM-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  ),
  site_id uuid not null references public.sites(id) on delete restrict,
  title text not null check (length(btrim(title)) > 0),
  status public.ops_programme_milestone_status not null default 'planned',
  baseline_date date not null,
  forecast_date date,
  actual_date date,
  progress_percent numeric(5, 2) not null default 0 check (progress_percent >= 0 and progress_percent <= 100),
  owner_id uuid references public.users(id) on delete set null,
  delay_reason text not null default '',
  notes text not null default '',
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid references public.users(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists site_instructions_number_unique
  on public.site_instructions(instruction_number);
create index if not exists site_instructions_site_status_date_idx
  on public.site_instructions(site_id, status, instruction_date desc);
create index if not exists site_instructions_assigned_idx
  on public.site_instructions(assigned_to, status, required_by)
  where assigned_to is not null;

create unique index if not exists qa_inspections_number_unique
  on public.qa_inspections(inspection_number);
create index if not exists qa_inspections_site_status_date_idx
  on public.qa_inspections(site_id, status, inspection_date desc);
create index if not exists qa_inspection_items_inspection_idx
  on public.qa_inspection_items(inspection_id, line_number);

create unique index if not exists material_tests_number_unique
  on public.material_tests(test_number);
create index if not exists material_tests_site_status_date_idx
  on public.material_tests(site_id, status, test_date desc);
create index if not exists material_tests_inspection_idx
  on public.material_tests(qa_inspection_id, test_date desc)
  where qa_inspection_id is not null;

create unique index if not exists snag_items_number_unique
  on public.snag_items(snag_number);
create index if not exists snag_items_site_status_due_idx
  on public.snag_items(site_id, status, due_date, created_at desc);
create index if not exists snag_items_assigned_idx
  on public.snag_items(assigned_to, status, due_date)
  where assigned_to is not null;

create index if not exists drawing_register_site_status_idx
  on public.drawing_register(site_id, status, received_date desc);
create unique index if not exists drawing_register_site_number_revision_unique
  on public.drawing_register(site_id, drawing_number, revision);

create unique index if not exists programme_milestones_number_unique
  on public.programme_milestones(milestone_number);
create index if not exists programme_milestones_site_status_date_idx
  on public.programme_milestones(site_id, status, baseline_date);

create or replace function private.can_access_engineering_controls()
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
        'quantity_surveyor',
        'engineer',
        'hse_officer',
        'hse_assistant_officer',
        'supervisor'
      ),
      false
    )
$$;

grant execute on function private.can_access_engineering_controls() to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'site_instructions',
    'qa_inspections',
    'qa_inspection_items',
    'material_tests',
    'snag_items',
    'drawing_register',
    'programme_milestones'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', table_name);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function private.set_updated_at()',
      table_name
    );
  end loop;
end $$;

alter table public.site_instructions enable row level security;
alter table public.qa_inspections enable row level security;
alter table public.qa_inspection_items enable row level security;
alter table public.material_tests enable row level security;
alter table public.snag_items enable row level security;
alter table public.drawing_register enable row level security;
alter table public.programme_milestones enable row level security;

grant select on public.site_instructions to authenticated;
grant select on public.qa_inspections to authenticated;
grant select on public.qa_inspection_items to authenticated;
grant select on public.material_tests to authenticated;
grant select on public.snag_items to authenticated;
grant select on public.drawing_register to authenticated;
grant select on public.programme_milestones to authenticated;

grant all on public.site_instructions to service_role;
grant all on public.qa_inspections to service_role;
grant all on public.qa_inspection_items to service_role;
grant all on public.material_tests to service_role;
grant all on public.snag_items to service_role;
grant all on public.drawing_register to service_role;
grant all on public.programme_milestones to service_role;

drop policy if exists site_instructions_select_ops on public.site_instructions;
create policy site_instructions_select_ops
on public.site_instructions
for select
to authenticated
using (private.can_access_engineering_controls());

drop policy if exists qa_inspections_select_ops on public.qa_inspections;
create policy qa_inspections_select_ops
on public.qa_inspections
for select
to authenticated
using (private.can_access_engineering_controls());

drop policy if exists qa_inspection_items_select_ops on public.qa_inspection_items;
create policy qa_inspection_items_select_ops
on public.qa_inspection_items
for select
to authenticated
using (
  exists (
    select 1
    from public.qa_inspections as inspection
    where inspection.id = qa_inspection_items.inspection_id
      and private.can_access_engineering_controls()
  )
);

drop policy if exists material_tests_select_ops on public.material_tests;
create policy material_tests_select_ops
on public.material_tests
for select
to authenticated
using (private.can_access_engineering_controls());

drop policy if exists snag_items_select_ops on public.snag_items;
create policy snag_items_select_ops
on public.snag_items
for select
to authenticated
using (private.can_access_engineering_controls());

drop policy if exists drawing_register_select_ops on public.drawing_register;
create policy drawing_register_select_ops
on public.drawing_register
for select
to authenticated
using (private.can_access_engineering_controls());

drop policy if exists programme_milestones_select_ops on public.programme_milestones;
create policy programme_milestones_select_ops
on public.programme_milestones
for select
to authenticated
using (private.can_access_engineering_controls());
