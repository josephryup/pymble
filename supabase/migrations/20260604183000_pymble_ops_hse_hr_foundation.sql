do $$
begin
  if not exists (select 1 from pg_type where typname = 'ops_hse_incident_status') then
    create type public.ops_hse_incident_status as enum (
      'reported',
      'investigating',
      'action_required',
      'closed',
      'cancelled'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'ops_hse_incident_type') then
    create type public.ops_hse_incident_type as enum (
      'near_miss',
      'first_aid',
      'medical_treatment',
      'lost_time',
      'property_damage',
      'environmental',
      'unsafe_condition',
      'other'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'ops_hse_incident_severity') then
    create type public.ops_hse_incident_severity as enum (
      'low',
      'medium',
      'high',
      'critical'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'ops_corrective_action_status') then
    create type public.ops_corrective_action_status as enum (
      'open',
      'in_progress',
      'completed',
      'verified',
      'cancelled'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'ops_employee_status') then
    create type public.ops_employee_status as enum (
      'active',
      'probation',
      'on_leave',
      'suspended',
      'exited'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'ops_employment_type') then
    create type public.ops_employment_type as enum (
      'full_time',
      'fixed_term',
      'casual',
      'contractor',
      'intern'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'ops_leave_request_status') then
    create type public.ops_leave_request_status as enum (
      'draft',
      'submitted',
      'approved',
      'rejected',
      'cancelled',
      'completed'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'ops_leave_type') then
    create type public.ops_leave_type as enum (
      'annual',
      'sick',
      'compassionate',
      'unpaid',
      'maternity',
      'paternity',
      'study',
      'other'
    );
  end if;
end $$;

create table if not exists public.hse_incidents (
  id uuid primary key default gen_random_uuid(),
  incident_number text not null default (
    'INC-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  ),
  site_id uuid not null references public.sites(id) on delete restrict,
  title text not null check (length(btrim(title)) > 0),
  description text not null default '',
  incident_type public.ops_hse_incident_type not null default 'other',
  severity public.ops_hse_incident_severity not null default 'medium',
  status public.ops_hse_incident_status not null default 'reported',
  occurred_at timestamptz not null default now(),
  location_detail text not null default '',
  people_involved text not null default '',
  immediate_action text not null default '',
  investigation_summary text not null default '',
  root_cause text not null default '',
  reported_by uuid references public.users(id) on delete set null,
  assigned_to uuid references public.users(id) on delete set null,
  investigation_started_at timestamptz,
  closed_at timestamptz,
  closed_by uuid references public.users(id) on delete set null,
  cancelled_at timestamptz,
  cancelled_by uuid references public.users(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.corrective_actions (
  id uuid primary key default gen_random_uuid(),
  action_number text not null default (
    'CA-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  ),
  incident_id uuid references public.hse_incidents(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete restrict,
  title text not null check (length(btrim(title)) > 0),
  description text not null default '',
  status public.ops_corrective_action_status not null default 'open',
  priority public.ops_priority not null default 'normal',
  due_date date,
  owner_id uuid references public.users(id) on delete set null,
  completed_at timestamptz,
  completed_by uuid references public.users(id) on delete set null,
  completion_notes text not null default '',
  verified_at timestamptz,
  verified_by uuid references public.users(id) on delete set null,
  verification_notes text not null default '',
  cancelled_at timestamptz,
  cancelled_by uuid references public.users(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  employee_number text not null default (
    'EMP-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  ),
  user_id uuid references public.users(id) on delete set null,
  worker_id uuid references public.workers(id) on delete set null,
  full_name text not null check (length(btrim(full_name)) > 0),
  job_title text not null default '',
  department text not null default '',
  employment_type public.ops_employment_type not null default 'full_time',
  status public.ops_employee_status not null default 'active',
  site_id uuid references public.sites(id) on delete set null,
  phone text not null default '',
  email text not null default '',
  start_date date not null default current_date,
  end_date date,
  emergency_contact_name text not null default '',
  emergency_contact_phone text not null default '',
  notes text not null default '',
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);

create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  leave_number text not null default (
    'LV-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  ),
  employee_id uuid not null references public.employees(id) on delete restrict,
  leave_type public.ops_leave_type not null default 'annual',
  status public.ops_leave_request_status not null default 'draft',
  start_date date not null,
  end_date date not null,
  days_requested numeric(6, 2) not null default 0 check (days_requested >= 0),
  reason text not null default '',
  handover_notes text not null default '',
  submitted_at timestamptz,
  approved_at timestamptz,
  approved_by uuid references public.users(id) on delete set null,
  rejected_at timestamptz,
  rejected_by uuid references public.users(id) on delete set null,
  rejection_reason text not null default '',
  cancelled_at timestamptz,
  cancelled_by uuid references public.users(id) on delete set null,
  completed_at timestamptz,
  completed_by uuid references public.users(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create unique index if not exists hse_incidents_number_unique
  on public.hse_incidents(incident_number);
create index if not exists hse_incidents_site_status_idx
  on public.hse_incidents(site_id, status, occurred_at desc);
create index if not exists hse_incidents_severity_idx
  on public.hse_incidents(severity, status, occurred_at desc);

create unique index if not exists corrective_actions_number_unique
  on public.corrective_actions(action_number);
create index if not exists corrective_actions_incident_idx
  on public.corrective_actions(incident_id, status, due_date)
  where incident_id is not null;
create index if not exists corrective_actions_site_status_idx
  on public.corrective_actions(site_id, status, due_date);

create unique index if not exists employees_number_unique
  on public.employees(employee_number);
create index if not exists employees_status_department_idx
  on public.employees(status, department, full_name);
create index if not exists employees_user_idx
  on public.employees(user_id)
  where user_id is not null;
create index if not exists employees_worker_idx
  on public.employees(worker_id)
  where worker_id is not null;

create unique index if not exists leave_requests_number_unique
  on public.leave_requests(leave_number);
create index if not exists leave_requests_employee_status_idx
  on public.leave_requests(employee_id, status, start_date desc);
create index if not exists leave_requests_status_dates_idx
  on public.leave_requests(status, start_date, end_date);

create or replace function private.can_access_hse_foundation()
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

create or replace function private.can_access_hr_foundation()
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
        'human_resource',
        'hr',
        'admin_receptionist'
      ),
      false
    )
$$;

grant execute on function private.can_access_hse_foundation() to authenticated;
grant execute on function private.can_access_hr_foundation() to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'hse_incidents',
    'corrective_actions',
    'employees',
    'leave_requests'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', table_name);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function private.set_updated_at()',
      table_name
    );
  end loop;
end $$;

alter table public.hse_incidents enable row level security;
alter table public.corrective_actions enable row level security;
alter table public.employees enable row level security;
alter table public.leave_requests enable row level security;

grant select on public.hse_incidents to authenticated;
grant select on public.corrective_actions to authenticated;
grant select on public.employees to authenticated;
grant select on public.leave_requests to authenticated;
grant all on public.hse_incidents to service_role;
grant all on public.corrective_actions to service_role;
grant all on public.employees to service_role;
grant all on public.leave_requests to service_role;

drop policy if exists hse_incidents_select_ops on public.hse_incidents;
create policy hse_incidents_select_ops
on public.hse_incidents
for select
to authenticated
using (private.can_access_hse_foundation());

drop policy if exists corrective_actions_select_ops on public.corrective_actions;
create policy corrective_actions_select_ops
on public.corrective_actions
for select
to authenticated
using (private.can_access_hse_foundation());

drop policy if exists employees_select_ops on public.employees;
create policy employees_select_ops
on public.employees
for select
to authenticated
using (private.can_access_hr_foundation());

drop policy if exists leave_requests_select_ops on public.leave_requests;
create policy leave_requests_select_ops
on public.leave_requests
for select
to authenticated
using (
  private.can_access_hr_foundation()
  or exists (
    select 1
    from public.employees as employee
    where employee.id = leave_requests.employee_id
      and employee.user_id = auth.uid()
  )
);
