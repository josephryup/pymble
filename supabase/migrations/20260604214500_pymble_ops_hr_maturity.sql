do $$
begin
  if not exists (select 1 from pg_type where typname = 'ops_recruitment_requisition_status') then
    create type public.ops_recruitment_requisition_status as enum (
      'draft',
      'submitted',
      'approved',
      'open',
      'interviewing',
      'offered',
      'filled',
      'cancelled'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'ops_employee_contract_status') then
    create type public.ops_employee_contract_status as enum (
      'draft',
      'active',
      'expired',
      'terminated',
      'superseded',
      'cancelled'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'ops_performance_appraisal_status') then
    create type public.ops_performance_appraisal_status as enum (
      'planned',
      'in_progress',
      'completed',
      'cancelled'
    );
  end if;
end $$;

create table if not exists public.recruitment_requisitions (
  id uuid primary key default gen_random_uuid(),
  requisition_number text not null default (
    'RR-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  ),
  site_id uuid references public.sites(id) on delete set null,
  job_title text not null check (length(btrim(job_title)) > 0),
  department text not null default '',
  employment_type public.ops_employment_type not null default 'full_time',
  status public.ops_recruitment_requisition_status not null default 'draft',
  priority public.ops_priority not null default 'normal',
  positions_count integer not null default 1 check (positions_count > 0),
  target_start_date date,
  salary_range text not null default '',
  justification text not null default '',
  requested_by uuid references public.users(id) on delete set null,
  hiring_manager_id uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  approved_by uuid references public.users(id) on delete set null,
  filled_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid references public.users(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.employee_contracts (
  id uuid primary key default gen_random_uuid(),
  contract_number text not null default (
    'EC-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  ),
  employee_id uuid not null references public.employees(id) on delete restrict,
  contract_type public.ops_employment_type not null default 'full_time',
  status public.ops_employee_contract_status not null default 'draft',
  title text not null default '',
  start_date date not null default current_date,
  end_date date,
  probation_end_date date,
  salary_amount numeric(14, 2) not null default 0 check (salary_amount >= 0),
  pay_frequency text not null default 'monthly' check (
    pay_frequency in ('monthly', 'weekly', 'daily', 'hourly', 'contract_sum')
  ),
  signed_at timestamptz,
  terminated_at timestamptz,
  termination_reason text not null default '',
  notes text not null default '',
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date),
  check (probation_end_date is null or probation_end_date >= start_date)
);

create table if not exists public.performance_appraisals (
  id uuid primary key default gen_random_uuid(),
  appraisal_number text not null default (
    'PA-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  ),
  employee_id uuid not null references public.employees(id) on delete restrict,
  reviewer_id uuid references public.users(id) on delete set null,
  cycle_name text not null default '',
  period_start date not null,
  period_end date not null,
  status public.ops_performance_appraisal_status not null default 'planned',
  overall_rating numeric(4, 2) check (overall_rating is null or (overall_rating >= 0 and overall_rating <= 5)),
  strengths text not null default '',
  improvement_areas text not null default '',
  goals text not null default '',
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid references public.users(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end >= period_start)
);

create table if not exists public.leave_balances (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  leave_type public.ops_leave_type not null default 'annual',
  balance_year integer not null default extract(year from current_date)::integer check (balance_year between 2000 and 2100),
  opening_balance numeric(7, 2) not null default 0,
  accrued_days numeric(7, 2) not null default 0,
  used_days numeric(7, 2) not null default 0 check (used_days >= 0),
  adjustment_days numeric(7, 2) not null default 0,
  available_days numeric(8, 2) generated always as (
    opening_balance + accrued_days + adjustment_days - used_days
  ) stored,
  notes text not null default '',
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, leave_type, balance_year)
);

create table if not exists public.hr_document_categories (
  id uuid primary key default gen_random_uuid(),
  category_code text not null check (category_code ~ '^[a-z][a-z0-9_]*$'),
  name text not null check (length(btrim(name)) > 0),
  description text not null default '',
  is_required boolean not null default false,
  retention_years integer check (retention_years is null or retention_years between 0 and 100),
  is_active boolean not null default true,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists recruitment_requisitions_number_unique
  on public.recruitment_requisitions(requisition_number);
create index if not exists recruitment_requisitions_status_priority_idx
  on public.recruitment_requisitions(status, priority, target_start_date);
create index if not exists recruitment_requisitions_site_status_idx
  on public.recruitment_requisitions(site_id, status, created_at desc)
  where site_id is not null;

create unique index if not exists employee_contracts_number_unique
  on public.employee_contracts(contract_number);
create index if not exists employee_contracts_employee_status_idx
  on public.employee_contracts(employee_id, status, start_date desc);
create index if not exists employee_contracts_status_end_idx
  on public.employee_contracts(status, end_date)
  where end_date is not null;

create unique index if not exists performance_appraisals_number_unique
  on public.performance_appraisals(appraisal_number);
create index if not exists performance_appraisals_employee_status_idx
  on public.performance_appraisals(employee_id, status, period_end desc);
create index if not exists performance_appraisals_status_due_idx
  on public.performance_appraisals(status, period_end);

create index if not exists leave_balances_employee_year_idx
  on public.leave_balances(employee_id, balance_year desc, leave_type);
create index if not exists leave_balances_available_idx
  on public.leave_balances(balance_year, available_days);

create unique index if not exists hr_document_categories_code_unique
  on public.hr_document_categories(category_code);
create index if not exists hr_document_categories_active_idx
  on public.hr_document_categories(is_active, name);

create or replace function private.can_access_hr_maturity()
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

grant execute on function private.can_access_hr_maturity() to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'recruitment_requisitions',
    'employee_contracts',
    'performance_appraisals',
    'leave_balances',
    'hr_document_categories'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', table_name);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function private.set_updated_at()',
      table_name
    );
  end loop;
end $$;

alter table public.recruitment_requisitions enable row level security;
alter table public.employee_contracts enable row level security;
alter table public.performance_appraisals enable row level security;
alter table public.leave_balances enable row level security;
alter table public.hr_document_categories enable row level security;

grant select on public.recruitment_requisitions to authenticated;
grant select on public.employee_contracts to authenticated;
grant select on public.performance_appraisals to authenticated;
grant select on public.leave_balances to authenticated;
grant select on public.hr_document_categories to authenticated;

grant all on public.recruitment_requisitions to service_role;
grant all on public.employee_contracts to service_role;
grant all on public.performance_appraisals to service_role;
grant all on public.leave_balances to service_role;
grant all on public.hr_document_categories to service_role;

drop policy if exists recruitment_requisitions_select_ops on public.recruitment_requisitions;
create policy recruitment_requisitions_select_ops
on public.recruitment_requisitions
for select
to authenticated
using (private.can_access_hr_maturity());

drop policy if exists employee_contracts_select_ops on public.employee_contracts;
create policy employee_contracts_select_ops
on public.employee_contracts
for select
to authenticated
using (private.can_access_hr_maturity());

drop policy if exists performance_appraisals_select_ops on public.performance_appraisals;
create policy performance_appraisals_select_ops
on public.performance_appraisals
for select
to authenticated
using (private.can_access_hr_maturity());

drop policy if exists leave_balances_select_ops on public.leave_balances;
create policy leave_balances_select_ops
on public.leave_balances
for select
to authenticated
using (private.can_access_hr_maturity());

drop policy if exists hr_document_categories_select_ops on public.hr_document_categories;
create policy hr_document_categories_select_ops
on public.hr_document_categories
for select
to authenticated
using (private.can_access_hr_maturity());

insert into public.hr_document_categories (category_code, name, description, is_required, retention_years)
values
  ('contract', 'Employment contract', 'Signed employment agreements, extensions, addenda, and termination letters.', true, 7),
  ('identity', 'Identity document', 'NRC, passport, permit, and right-to-work evidence.', true, 7),
  ('medical', 'Medical and fitness', 'Fitness certificates, medical clearance, and role-specific medical records.', false, 7),
  ('training', 'Training and certification', 'Training evidence, certificates, inductions, and renewals.', false, 5),
  ('appraisal', 'Performance appraisal', 'Completed appraisals, goals, development plans, and performance correspondence.', false, 5),
  ('leave', 'Leave evidence', 'Leave forms, sick notes, handover evidence, and approval supporting documents.', false, 5),
  ('disciplinary', 'Disciplinary record', 'Warnings, investigations, and employee relations correspondence.', false, 7),
  ('onboarding', 'Onboarding pack', 'Offer letters, onboarding checklists, policy acknowledgements, and starter documents.', true, 7)
on conflict (category_code) do update
set
  description = excluded.description,
  is_required = excluded.is_required,
  name = excluded.name,
  retention_years = excluded.retention_years,
  updated_at = now();
