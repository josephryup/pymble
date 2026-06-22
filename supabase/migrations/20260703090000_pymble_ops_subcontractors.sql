-- Sprint 17: subcontractor workflow.
--
-- A subcontractor is an external company we engage for specialist trades
-- (electrical, plumbing, finishes, etc.). They are allocated to project
-- tasks for a defined scope at an agreed rate. Operations Manager owns the
-- subcontractor register; Finance owns payments and retention.
--
-- Tables:
--   subcontractors                — company register + KYC
--   subcontractor_assignments     — links subcontractor to a site / task
--   subcontractor_payments        — advance / interim / retention / final

do $$
begin
  if not exists (select 1 from pg_type where typname = 'ops_subcontractor_status') then
    create type public.ops_subcontractor_status as enum (
      'prospect',
      'kyc_pending',
      'approved',
      'suspended',
      'blacklisted'
    );
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'ops_subcontractor_assignment_status') then
    create type public.ops_subcontractor_assignment_status as enum (
      'planned',
      'active',
      'completed',
      'cancelled'
    );
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'ops_subcontractor_payment_type') then
    create type public.ops_subcontractor_payment_type as enum (
      'advance',
      'interim',
      'retention_release',
      'final'
    );
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'ops_subcontractor_payment_status') then
    create type public.ops_subcontractor_payment_status as enum (
      'pending',
      'approved',
      'paid',
      'rejected'
    );
  end if;
end$$;

create table if not exists public.subcontractors (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  trade_specialty text not null default '',
  contact_name text not null default '',
  contact_phone text not null default '',
  contact_email text not null default '',
  tpin text not null default '',
  registration_number text not null default '',
  bank_name text not null default '',
  bank_account_number text not null default '',
  status public.ops_subcontractor_status not null default 'prospect',
  kyc_notes text not null default '',
  performance_rating smallint default null check (performance_rating is null or (performance_rating between 1 and 5)),
  performance_notes text not null default '',
  retention_percent numeric(5, 2) not null default 5.00 check (retention_percent >= 0 and retention_percent <= 50),
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.users(id),
  unique (company_name)
);

create index if not exists subcontractors_status_idx
  on public.subcontractors (status)
  where archived_at is null;

drop trigger if exists subcontractors_set_updated_at on public.subcontractors;
create trigger subcontractors_set_updated_at
  before update on public.subcontractors
  for each row execute function private.set_updated_at();

alter table public.subcontractors enable row level security;

drop policy if exists "subcontractors_service_role_all" on public.subcontractors;
create policy "subcontractors_service_role_all"
  on public.subcontractors
  for all to anon, authenticated
  using (false) with check (false);

create table if not exists public.subcontractor_assignments (
  id uuid primary key default gen_random_uuid(),
  subcontractor_id uuid not null references public.subcontractors(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  project_task_id uuid references public.project_tasks(id) on delete set null,
  scope text not null,
  agreed_amount numeric(14, 2) not null default 0 check (agreed_amount >= 0),
  start_date date not null,
  end_date date,
  status public.ops_subcontractor_assignment_status not null default 'planned',
  notes text not null default '',
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.users(id),
  check (end_date is null or end_date >= start_date)
);

create index if not exists subcontractor_assignments_sub_idx
  on public.subcontractor_assignments (subcontractor_id)
  where archived_at is null;
create index if not exists subcontractor_assignments_site_idx
  on public.subcontractor_assignments (site_id)
  where archived_at is null;

drop trigger if exists subcontractor_assignments_set_updated_at on public.subcontractor_assignments;
create trigger subcontractor_assignments_set_updated_at
  before update on public.subcontractor_assignments
  for each row execute function private.set_updated_at();

alter table public.subcontractor_assignments enable row level security;

drop policy if exists "subcontractor_assignments_service_role_all" on public.subcontractor_assignments;
create policy "subcontractor_assignments_service_role_all"
  on public.subcontractor_assignments
  for all to anon, authenticated
  using (false) with check (false);

create table if not exists public.subcontractor_payments (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.subcontractor_assignments(id) on delete cascade,
  payment_type public.ops_subcontractor_payment_type not null,
  amount numeric(14, 2) not null check (amount > 0),
  retention_held numeric(14, 2) not null default 0 check (retention_held >= 0),
  reference text not null default '',
  status public.ops_subcontractor_payment_status not null default 'pending',
  scheduled_for date,
  paid_at timestamptz,
  requested_by uuid references public.users(id),
  approved_by uuid references public.users(id),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.users(id)
);

create index if not exists subcontractor_payments_assignment_idx
  on public.subcontractor_payments (assignment_id)
  where archived_at is null;
create index if not exists subcontractor_payments_status_idx
  on public.subcontractor_payments (status)
  where archived_at is null;

drop trigger if exists subcontractor_payments_set_updated_at on public.subcontractor_payments;
create trigger subcontractor_payments_set_updated_at
  before update on public.subcontractor_payments
  for each row execute function private.set_updated_at();

alter table public.subcontractor_payments enable row level security;

drop policy if exists "subcontractor_payments_service_role_all" on public.subcontractor_payments;
create policy "subcontractor_payments_service_role_all"
  on public.subcontractor_payments
  for all to anon, authenticated
  using (false) with check (false);

do $$
begin
  begin
    execute 'alter publication supabase_realtime add table public.subcontractors';
  exception when duplicate_object then null;
  end;
  begin
    execute 'alter publication supabase_realtime add table public.subcontractor_assignments';
  exception when duplicate_object then null;
  end;
  begin
    execute 'alter publication supabase_realtime add table public.subcontractor_payments';
  exception when duplicate_object then null;
  end;
end$$;
