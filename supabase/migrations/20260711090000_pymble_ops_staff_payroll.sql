-- Staff payroll. Separate from worker payroll (attendance-driven) because
-- staff are paid a contract-based salary (basic + housing + allowances) with
-- NHIMA on top of the existing PAYE + NAPSA + WCF deductions. The PCL sample
-- payslip drives the column shape.
--
-- All visibility is enforced at the application layer through the
-- staff-payroll service client + role gate. RLS uses a new helper that
-- includes HR, leadership, Developer, Finance Manager, and Accountant so
-- direct reads (e.g. realtime subscriptions) work for the same set.

-- ---------------------------------------------------------------------------
-- 1. New staff identity fields used on the payslip
-- ---------------------------------------------------------------------------
alter table public.employees
  add column if not exists nrc_number text not null default '',
  add column if not exists napsa_number text not null default '';

-- ---------------------------------------------------------------------------
-- 2. Pay structure lives on the employee contract so each contract revision
--    keeps a historical snapshot of what someone was paid under.
-- ---------------------------------------------------------------------------
alter table public.employee_contracts
  add column if not exists basic_pay numeric(12, 2) not null default 0
    check (basic_pay >= 0),
  add column if not exists housing_allowance numeric(12, 2) not null default 0
    check (housing_allowance >= 0),
  add column if not exists other_allowances jsonb not null default '[]'::jsonb,
  add column if not exists leave_rate_per_month numeric(5, 2) not null default 2.5
    check (leave_rate_per_month >= 0);

-- ---------------------------------------------------------------------------
-- 3. Staff payroll runs (parent) + items (child) — mirrors the worker payroll
--    shape but every figure the PCL payslip needs is stored on the row so
--    historical replays stay stable when ZRA bands move.
-- ---------------------------------------------------------------------------
create table if not exists public.staff_payroll_runs (
  id uuid primary key default gen_random_uuid(),
  period_label text not null,
  period_start date not null,
  period_end date not null,
  status public.ops_payroll_status not null default 'draft',
  total_basic numeric(14, 2) not null default 0 check (total_basic >= 0),
  total_gross numeric(14, 2) not null default 0 check (total_gross >= 0),
  total_advances numeric(14, 2) not null default 0 check (total_advances >= 0),
  total_net numeric(14, 2) not null default 0 check (total_net >= 0),
  created_by uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  approved_by uuid references public.users(id) on delete set null,
  disbursed_at timestamptz,
  disbursed_by uuid references public.users(id) on delete set null,
  archived_at timestamptz,
  archived_by uuid references public.users(id) on delete set null,
  cancelled_at timestamptz,
  cancelled_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end >= period_start)
);

create table if not exists public.staff_payroll_items (
  id uuid primary key default gen_random_uuid(),
  staff_payroll_run_id uuid not null references public.staff_payroll_runs(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete restrict,
  -- Identity snapshot (so payslips replay even after the employee record changes)
  employee_number text not null default '',
  full_name text not null default '',
  job_title text not null default '',
  department text not null default '',
  nrc_number text not null default '',
  napsa_number text not null default '',
  -- Earnings
  basic_pay numeric(12, 2) not null default 0 check (basic_pay >= 0),
  housing_allowance numeric(12, 2) not null default 0 check (housing_allowance >= 0),
  other_allowances numeric(12, 2) not null default 0 check (other_allowances >= 0),
  gross_pay numeric(12, 2) not null default 0 check (gross_pay >= 0),
  -- Deductions (statutory per ZRA + NAPSA + NHIMA, plus staff advances)
  paye_amount numeric(12, 2) not null default 0 check (paye_amount >= 0),
  napsa_employee numeric(12, 2) not null default 0 check (napsa_employee >= 0),
  napsa_employer numeric(12, 2) not null default 0 check (napsa_employer >= 0),
  nhima_employee numeric(12, 2) not null default 0 check (nhima_employee >= 0),
  nhima_employer numeric(12, 2) not null default 0 check (nhima_employer >= 0),
  wcf_employer numeric(12, 2) not null default 0 check (wcf_employer >= 0),
  advance_deduction numeric(12, 2) not null default 0 check (advance_deduction >= 0),
  -- Net pay
  net_pay numeric(12, 2) not null default 0 check (net_pay >= 0),
  -- Payout tracking
  payout_status public.ops_payout_status not null default 'pending',
  payout_reference text,
  -- Statutory traceability
  tax_year integer,
  statutory_citation text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (staff_payroll_run_id, employee_id)
);

create index if not exists staff_payroll_runs_status_idx
  on public.staff_payroll_runs(status, period_end desc)
  where archived_at is null;

create index if not exists staff_payroll_items_employee_idx
  on public.staff_payroll_items(employee_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 4. Staff advances — parallel to worker cash_advances. Deducted in a single
--    upcoming staff payroll run, then the link locks the advance.
-- ---------------------------------------------------------------------------
create table if not exists public.staff_advances (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  amount numeric(12, 2) not null check (amount > 0),
  note text not null default '',
  issued_at date not null default current_date,
  deducted_in_run_id uuid references public.staff_payroll_runs(id) on delete set null,
  archived_at timestamptz,
  archived_by uuid references public.users(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists staff_advances_open_idx
  on public.staff_advances(employee_id)
  where deducted_in_run_id is null and archived_at is null;

-- ---------------------------------------------------------------------------
-- 5. RLS helper + policies
-- ---------------------------------------------------------------------------
create or replace function private.can_access_staff_payroll()
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
        'finance_manager',
        'accountant'
      ),
      false
    )
$$;

grant execute on function private.can_access_staff_payroll() to authenticated;

alter table public.staff_payroll_runs enable row level security;
alter table public.staff_payroll_items enable row level security;
alter table public.staff_advances enable row level security;

grant select, insert, update on public.staff_payroll_runs to authenticated;
grant select, insert, update on public.staff_payroll_items to authenticated;
grant select, insert, update on public.staff_advances to authenticated;

drop policy if exists staff_payroll_runs_select on public.staff_payroll_runs;
create policy staff_payroll_runs_select
on public.staff_payroll_runs
for select
to authenticated
using (private.can_access_staff_payroll());

drop policy if exists staff_payroll_runs_write on public.staff_payroll_runs;
create policy staff_payroll_runs_write
on public.staff_payroll_runs
for all
to authenticated
using (private.can_access_staff_payroll())
with check (private.can_access_staff_payroll());

drop policy if exists staff_payroll_items_select on public.staff_payroll_items;
create policy staff_payroll_items_select
on public.staff_payroll_items
for select
to authenticated
using (private.can_access_staff_payroll());

drop policy if exists staff_payroll_items_write on public.staff_payroll_items;
create policy staff_payroll_items_write
on public.staff_payroll_items
for all
to authenticated
using (private.can_access_staff_payroll())
with check (private.can_access_staff_payroll());

drop policy if exists staff_advances_select on public.staff_advances;
create policy staff_advances_select
on public.staff_advances
for select
to authenticated
using (private.can_access_staff_payroll());

drop policy if exists staff_advances_write on public.staff_advances;
create policy staff_advances_write
on public.staff_advances
for all
to authenticated
using (private.can_access_staff_payroll())
with check (private.can_access_staff_payroll());
