create extension if not exists "pgcrypto";

create schema if not exists private;
revoke all on schema private from public;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'ops_user_role') then
    create type public.ops_user_role as enum ('developer', 'managing_director', 'general_manager', 'human_resource', 'operations_manager', 'projects_manager', 'procurement_manager', 'quantity_surveyor', 'procurement', 'procurement_assistant', 'finance_manager', 'accountant', 'engineer', 'hse_officer', 'hse_assistant_officer', 'admin_receptionist', 'owner', 'hr', 'manager', 'supervisor', 'crew');
  end if;

  if not exists (select 1 from pg_type where typname = 'ops_worker_type') then
    create type public.ops_worker_type as enum ('casual', 'permanent');
  end if;

  if not exists (select 1 from pg_type where typname = 'ops_momo_provider') then
    create type public.ops_momo_provider as enum ('mtn', 'airtel');
  end if;

  if not exists (select 1 from pg_type where typname = 'ops_site_status') then
    create type public.ops_site_status as enum ('active', 'mobilizing', 'closing');
  end if;

  if not exists (select 1 from pg_type where typname = 'ops_attendance_source') then
    create type public.ops_attendance_source as enum ('app', 'manual', 'ussd');
  end if;

  if not exists (select 1 from pg_type where typname = 'ops_attendance_presence') then
    create type public.ops_attendance_presence as enum ('present', 'late', 'absent');
  end if;

  if not exists (select 1 from pg_type where typname = 'ops_payroll_status') then
    create type public.ops_payroll_status as enum ('draft', 'approved', 'disbursing', 'completed');
  end if;

  if not exists (select 1 from pg_type where typname = 'ops_payout_status') then
    create type public.ops_payout_status as enum ('pending', 'sent', 'failed');
  end if;

  if not exists (select 1 from pg_type where typname = 'ops_boq_status') then
    create type public.ops_boq_status as enum ('draft', 'issued');
  end if;

  if not exists (select 1 from pg_type where typname = 'ops_invoice_status') then
    create type public.ops_invoice_status as enum ('draft', 'sent', 'paid');
  end if;

  if not exists (select 1 from pg_type where typname = 'ops_photo_tag') then
    create type public.ops_photo_tag as enum ('progress', 'delivery', 'safety');
  end if;
end $$;

create table if not exists public.organization_profile (
  id smallint primary key default 1 check (id = 1),
  legal_name text not null,
  trading_name text not null,
  tpin text,
  email text,
  phone_primary text,
  phone_secondary text,
  address_line text,
  city text,
  country text not null default 'Zambia',
  headquarters_latitude numeric(10, 7),
  headquarters_longitude numeric(10, 7),
  logo_r2_key text,
  invoice_prefix text not null default 'PCL',
  currency_code text not null default 'ZMW',
  vat_rate numeric(5, 4) not null default 0.1600 check (vat_rate >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role public.ops_user_role not null,
  phone text,
  email text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sites (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  location text not null,
  supervisor_user_id uuid references public.users(id) on delete set null,
  supervisor_name text not null default '',
  client_name text not null default '',
  budget_zmw numeric(14, 2) not null default 0 check (budget_zmw >= 0),
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  status public.ops_site_status not null default 'active',
  is_active boolean not null default true,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workers (
  id uuid primary key default gen_random_uuid(),
  worker_code text not null unique,
  full_name text not null,
  trade text not null,
  phone text not null,
  momo_provider public.ops_momo_provider,
  momo_number text,
  daily_rate numeric(12, 2) not null check (daily_rate > 0),
  site_id uuid references public.sites(id) on delete set null,
  nrc_last4 text,
  worker_type public.ops_worker_type not null default 'casual',
  is_active boolean not null default true,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.workers(id) on delete restrict,
  site_id uuid not null references public.sites(id) on delete restrict,
  clock_in_at timestamptz not null,
  clock_out_at timestamptz,
  hours_worked numeric(8, 2) not null default 0 check (hours_worked >= 0),
  amount_earned numeric(12, 2) not null default 0 check (amount_earned >= 0),
  presence public.ops_attendance_presence not null default 'present',
  source public.ops_attendance_source not null default 'app',
  gps_label text not null default '',
  gps_latitude numeric(10, 7),
  gps_longitude numeric(10, 7),
  approved_at timestamptz,
  approved_by uuid references public.users(id) on delete set null,
  is_active boolean not null default true,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cash_advances (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.workers(id) on delete restrict,
  amount numeric(12, 2) not null check (amount > 0),
  note text not null default '',
  issued_at date not null default current_date,
  deducted_in_run_id uuid,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  period_label text not null,
  period_start date not null,
  period_end date not null,
  status public.ops_payroll_status not null default 'draft',
  total_gross numeric(14, 2) not null default 0 check (total_gross >= 0),
  total_advances numeric(14, 2) not null default 0 check (total_advances >= 0),
  total_net numeric(14, 2) not null default 0 check (total_net >= 0),
  created_by uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  approved_by uuid references public.users(id) on delete set null,
  disbursed_at timestamptz,
  disbursed_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end >= period_start)
);

create table if not exists public.payroll_run_items (
  id uuid primary key default gen_random_uuid(),
  payroll_run_id uuid not null references public.payroll_runs(id) on delete cascade,
  worker_id uuid not null references public.workers(id) on delete restrict,
  gross_pay numeric(12, 2) not null default 0 check (gross_pay >= 0),
  advance_deduction numeric(12, 2) not null default 0 check (advance_deduction >= 0),
  net_pay numeric(12, 2) not null default 0 check (net_pay >= 0),
  payout_status public.ops_payout_status not null default 'pending',
  payout_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (payroll_run_id, worker_id)
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'cash_advances_deducted_in_run_id_fkey'
      and conrelid = 'public.cash_advances'::regclass
  ) then
    alter table public.cash_advances
      add constraint cash_advances_deducted_in_run_id_fkey
      foreign key (deducted_in_run_id) references public.payroll_runs(id)
      on delete set null;
  end if;
end $$;

alter table public.attendance_records
  add column if not exists payroll_run_id uuid references public.payroll_runs(id) on delete set null;

create table if not exists public.boq_documents (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete restrict,
  title text not null,
  version integer not null default 1 check (version > 0),
  status public.ops_boq_status not null default 'draft',
  created_by uuid references public.users(id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.boq_line_items (
  id uuid primary key default gen_random_uuid(),
  boq_id uuid not null references public.boq_documents(id) on delete cascade,
  description text not null,
  unit text not null,
  quantity numeric(12, 2) not null check (quantity >= 0),
  unit_rate numeric(12, 2) not null check (unit_rate >= 0),
  budgeted_total numeric(14, 2) generated always as (quantity * unit_rate) stored,
  actual_quantity numeric(12, 2) not null default 0 check (actual_quantity >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete restrict,
  boq_id uuid references public.boq_documents(id) on delete set null,
  invoice_number text not null unique,
  client_name text not null,
  tpin text,
  subtotal numeric(14, 2) not null default 0 check (subtotal >= 0),
  vat_amount numeric(14, 2) not null default 0 check (vat_amount >= 0),
  total_amount numeric(14, 2) not null default 0 check (total_amount >= 0),
  status public.ops_invoice_status not null default 'draft',
  pdf_r2_key text,
  created_by uuid references public.users(id) on delete set null,
  issued_at date not null default current_date,
  sent_at timestamptz,
  paid_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.site_photos (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete restrict,
  r2_key text not null unique,
  caption text not null default '',
  tag public.ops_photo_tag not null default 'progress',
  mime_type text not null,
  taken_at timestamptz not null default now(),
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  uploaded_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.otp_challenges (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid references public.workers(id) on delete cascade,
  phone text not null,
  code text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists users_role_active_idx on public.users(role, is_active);
create index if not exists sites_status_idx on public.sites(status, is_active);
create index if not exists workers_site_idx on public.workers(site_id, is_active);
create unique index if not exists workers_active_phone_unique on public.workers(phone) where is_active = true;
create index if not exists attendance_worker_clock_in_idx on public.attendance_records(worker_id, clock_in_at desc);
create index if not exists attendance_site_clock_in_idx on public.attendance_records(site_id, clock_in_at desc);
create unique index if not exists attendance_open_record_unique
  on public.attendance_records(worker_id)
  where clock_out_at is null and is_active = true;
create index if not exists cash_advances_worker_issued_idx on public.cash_advances(worker_id, issued_at desc);
create index if not exists cash_advances_deducted_idx on public.cash_advances(deducted_in_run_id);
create index if not exists payroll_runs_period_idx on public.payroll_runs(period_start desc, period_end desc);
create index if not exists payroll_run_items_run_idx on public.payroll_run_items(payroll_run_id);
create index if not exists boq_documents_site_idx on public.boq_documents(site_id, created_at desc);
create index if not exists boq_line_items_boq_idx on public.boq_line_items(boq_id);
create index if not exists invoices_issued_idx on public.invoices(issued_at desc, created_at desc);
create index if not exists site_photos_site_taken_idx on public.site_photos(site_id, taken_at desc, created_at desc);
create index if not exists otp_challenges_phone_created_idx on public.otp_challenges(phone, created_at desc);
create index if not exists audit_events_entity_idx on public.audit_events(entity_type, entity_id, created_at desc);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.current_user_role()
returns public.ops_user_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.users
  where id = auth.uid()
    and is_active = true
  limit 1
$$;

grant usage on schema private to authenticated, service_role;
grant execute on function private.current_user_role() to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'organization_profile',
    'users',
    'sites',
    'workers',
    'attendance_records',
    'cash_advances',
    'payroll_runs',
    'payroll_run_items',
    'boq_documents',
    'boq_line_items',
    'invoices',
    'site_photos'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', table_name);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function private.set_updated_at()',
      table_name
    );
  end loop;
end $$;

insert into public.organization_profile (
  id,
  legal_name,
  trading_name,
  email,
  phone_primary,
  phone_secondary,
  address_line,
  city,
  country,
  headquarters_latitude,
  headquarters_longitude,
  invoice_prefix,
  currency_code,
  vat_rate
)
values (
  1,
  'Pymble Construction Limited',
  'Pymble Construction',
  'info@pymbleconstruction.com',
  '+260 979 521 035',
  '+260 974 998 463',
  'Plot No. 1822 Azikiwe Road',
  'Lusaka',
  'Zambia',
  -15.4029868,
  28.2877427,
  'PCL',
  'ZMW',
  0.1600
)
on conflict (id) do update
set
  legal_name = excluded.legal_name,
  trading_name = excluded.trading_name,
  email = excluded.email,
  phone_primary = excluded.phone_primary,
  phone_secondary = excluded.phone_secondary,
  address_line = excluded.address_line,
  city = excluded.city,
  country = excluded.country,
  headquarters_latitude = excluded.headquarters_latitude,
  headquarters_longitude = excluded.headquarters_longitude,
  invoice_prefix = excluded.invoice_prefix,
  currency_code = excluded.currency_code,
  vat_rate = excluded.vat_rate;

alter table public.organization_profile enable row level security;
alter table public.users enable row level security;
alter table public.sites enable row level security;
alter table public.workers enable row level security;
alter table public.attendance_records enable row level security;
alter table public.cash_advances enable row level security;
alter table public.payroll_runs enable row level security;
alter table public.payroll_run_items enable row level security;
alter table public.boq_documents enable row level security;
alter table public.boq_line_items enable row level security;
alter table public.invoices enable row level security;
alter table public.site_photos enable row level security;
alter table public.otp_challenges enable row level security;
alter table public.audit_events enable row level security;

grant usage on schema public to authenticated, service_role;
grant select on public.organization_profile to authenticated;
grant update on public.organization_profile to authenticated;
grant select on public.users to authenticated;
grant update (full_name, phone) on public.users to authenticated;
grant select, insert, update on public.sites to authenticated;
grant select, insert, update on public.workers to authenticated;
grant select, insert, update on public.attendance_records to authenticated;
grant select, insert, update on public.cash_advances to authenticated;
grant select, insert, update on public.payroll_runs to authenticated;
grant select, insert, update on public.payroll_run_items to authenticated;
grant select, insert, update on public.boq_documents to authenticated;
grant select, insert, update on public.boq_line_items to authenticated;
grant select, insert, update on public.invoices to authenticated;
grant select, insert, update on public.site_photos to authenticated;
grant select, insert, update on public.audit_events to authenticated;
grant all on all tables in schema public to service_role;

drop policy if exists organization_profile_select_ops on public.organization_profile;
create policy organization_profile_select_ops
on public.organization_profile
for select
to authenticated
using (private.current_user_role()::text in ('developer', 'managing_director', 'general_manager', 'human_resource', 'operations_manager', 'projects_manager', 'procurement_manager', 'quantity_surveyor', 'procurement', 'procurement_assistant', 'finance_manager', 'accountant', 'engineer', 'hse_officer', 'hse_assistant_officer', 'admin_receptionist', 'owner', 'hr', 'manager', 'supervisor'));

drop policy if exists organization_profile_update_admin on public.organization_profile;
create policy organization_profile_update_admin
on public.organization_profile
for update
to authenticated
using (private.current_user_role() in ('developer', 'managing_director', 'general_manager', 'human_resource', 'operations_manager', 'projects_manager', 'procurement_manager', 'quantity_surveyor', 'procurement', 'procurement_assistant', 'finance_manager', 'accountant', 'engineer', 'hse_officer', 'hse_assistant_officer', 'admin_receptionist', 'owner', 'hr', 'manager', 'supervisor'))
with check (private.current_user_role() in ('developer', 'managing_director', 'general_manager', 'human_resource', 'operations_manager', 'projects_manager', 'procurement_manager', 'quantity_surveyor', 'procurement', 'procurement_assistant', 'finance_manager', 'accountant', 'engineer', 'hse_officer', 'hse_assistant_officer', 'admin_receptionist', 'owner', 'hr', 'manager', 'supervisor'));

drop policy if exists users_select_self_or_admin on public.users;
create policy users_select_self_or_admin
on public.users
for select
to authenticated
using (
  id = auth.uid()
  or private.current_user_role()::text = 'developer'
  or (
    private.current_user_role()::text in ('managing_director', 'general_manager', 'human_resource', 'owner', 'hr', 'manager')
    and role::text <> 'developer'
  )
);

drop policy if exists users_insert_owner on public.users;
drop policy if exists users_insert_owner_hr on public.users;

drop policy if exists users_update_self_or_owner on public.users;
drop policy if exists users_update_self_or_owner_hr on public.users;
drop policy if exists users_update_self on public.users;
create policy users_update_self
on public.users
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists sites_select_ops on public.sites;
create policy sites_select_ops
on public.sites
for select
to authenticated
using (private.current_user_role() in ('developer', 'managing_director', 'general_manager', 'human_resource', 'operations_manager', 'projects_manager', 'procurement_manager', 'quantity_surveyor', 'procurement', 'procurement_assistant', 'finance_manager', 'accountant', 'engineer', 'hse_officer', 'hse_assistant_officer', 'admin_receptionist', 'owner', 'hr', 'manager', 'supervisor'));

drop policy if exists sites_write_admin on public.sites;
create policy sites_write_admin
on public.sites
for all
to authenticated
using (private.current_user_role() in ('developer', 'managing_director', 'general_manager', 'human_resource', 'operations_manager', 'projects_manager', 'procurement_manager', 'quantity_surveyor', 'procurement', 'procurement_assistant', 'finance_manager', 'accountant', 'engineer', 'hse_officer', 'hse_assistant_officer', 'admin_receptionist', 'owner', 'hr', 'manager', 'supervisor'))
with check (private.current_user_role() in ('developer', 'managing_director', 'general_manager', 'human_resource', 'operations_manager', 'projects_manager', 'procurement_manager', 'quantity_surveyor', 'procurement', 'procurement_assistant', 'finance_manager', 'accountant', 'engineer', 'hse_officer', 'hse_assistant_officer', 'admin_receptionist', 'owner', 'hr', 'manager', 'supervisor'));

drop policy if exists workers_select_ops on public.workers;
create policy workers_select_ops
on public.workers
for select
to authenticated
using (private.current_user_role() in ('developer', 'managing_director', 'general_manager', 'human_resource', 'operations_manager', 'projects_manager', 'procurement_manager', 'quantity_surveyor', 'procurement', 'procurement_assistant', 'finance_manager', 'accountant', 'engineer', 'hse_officer', 'hse_assistant_officer', 'admin_receptionist', 'owner', 'hr', 'manager', 'supervisor'));

drop policy if exists workers_write_admin on public.workers;
create policy workers_write_admin
on public.workers
for all
to authenticated
using (private.current_user_role() in ('developer', 'managing_director', 'general_manager', 'human_resource', 'operations_manager', 'projects_manager', 'procurement_manager', 'quantity_surveyor', 'procurement', 'procurement_assistant', 'finance_manager', 'accountant', 'engineer', 'hse_officer', 'hse_assistant_officer', 'admin_receptionist', 'owner', 'hr', 'manager', 'supervisor'))
with check (private.current_user_role() in ('developer', 'managing_director', 'general_manager', 'human_resource', 'operations_manager', 'projects_manager', 'procurement_manager', 'quantity_surveyor', 'procurement', 'procurement_assistant', 'finance_manager', 'accountant', 'engineer', 'hse_officer', 'hse_assistant_officer', 'admin_receptionist', 'owner', 'hr', 'manager', 'supervisor'));

drop policy if exists attendance_select_ops on public.attendance_records;
create policy attendance_select_ops
on public.attendance_records
for select
to authenticated
using (private.current_user_role() in ('developer', 'managing_director', 'general_manager', 'human_resource', 'operations_manager', 'projects_manager', 'procurement_manager', 'quantity_surveyor', 'procurement', 'procurement_assistant', 'finance_manager', 'accountant', 'engineer', 'hse_officer', 'hse_assistant_officer', 'admin_receptionist', 'owner', 'hr', 'manager', 'supervisor'));

drop policy if exists attendance_write_ops on public.attendance_records;
create policy attendance_write_ops
on public.attendance_records
for all
to authenticated
using (private.current_user_role() in ('developer', 'managing_director', 'general_manager', 'human_resource', 'operations_manager', 'projects_manager', 'procurement_manager', 'quantity_surveyor', 'procurement', 'procurement_assistant', 'finance_manager', 'accountant', 'engineer', 'hse_officer', 'hse_assistant_officer', 'admin_receptionist', 'owner', 'hr', 'manager', 'supervisor'))
with check (private.current_user_role() in ('developer', 'managing_director', 'general_manager', 'human_resource', 'operations_manager', 'projects_manager', 'procurement_manager', 'quantity_surveyor', 'procurement', 'procurement_assistant', 'finance_manager', 'accountant', 'engineer', 'hse_officer', 'hse_assistant_officer', 'admin_receptionist', 'owner', 'hr', 'manager', 'supervisor'));

drop policy if exists cash_advances_select_ops on public.cash_advances;
create policy cash_advances_select_ops
on public.cash_advances
for select
to authenticated
using (private.current_user_role() in ('developer', 'managing_director', 'general_manager', 'human_resource', 'operations_manager', 'projects_manager', 'procurement_manager', 'quantity_surveyor', 'procurement', 'procurement_assistant', 'finance_manager', 'accountant', 'engineer', 'hse_officer', 'hse_assistant_officer', 'admin_receptionist', 'owner', 'hr', 'manager', 'supervisor'));

drop policy if exists cash_advances_write_admin on public.cash_advances;
create policy cash_advances_write_admin
on public.cash_advances
for all
to authenticated
using (private.current_user_role() in ('developer', 'managing_director', 'general_manager', 'human_resource', 'operations_manager', 'projects_manager', 'procurement_manager', 'quantity_surveyor', 'procurement', 'procurement_assistant', 'finance_manager', 'accountant', 'engineer', 'hse_officer', 'hse_assistant_officer', 'admin_receptionist', 'owner', 'hr', 'manager', 'supervisor'))
with check (private.current_user_role() in ('developer', 'managing_director', 'general_manager', 'human_resource', 'operations_manager', 'projects_manager', 'procurement_manager', 'quantity_surveyor', 'procurement', 'procurement_assistant', 'finance_manager', 'accountant', 'engineer', 'hse_officer', 'hse_assistant_officer', 'admin_receptionist', 'owner', 'hr', 'manager', 'supervisor'));

drop policy if exists payroll_runs_select_ops on public.payroll_runs;
create policy payroll_runs_select_ops
on public.payroll_runs
for select
to authenticated
using (private.current_user_role() in ('developer', 'managing_director', 'general_manager', 'human_resource', 'operations_manager', 'projects_manager', 'procurement_manager', 'quantity_surveyor', 'procurement', 'procurement_assistant', 'finance_manager', 'accountant', 'engineer', 'hse_officer', 'hse_assistant_officer', 'admin_receptionist', 'owner', 'hr', 'manager', 'supervisor'));

drop policy if exists payroll_runs_write_admin on public.payroll_runs;
create policy payroll_runs_write_admin
on public.payroll_runs
for all
to authenticated
using (private.current_user_role() in ('developer', 'managing_director', 'general_manager', 'human_resource', 'operations_manager', 'projects_manager', 'procurement_manager', 'quantity_surveyor', 'procurement', 'procurement_assistant', 'finance_manager', 'accountant', 'engineer', 'hse_officer', 'hse_assistant_officer', 'admin_receptionist', 'owner', 'hr', 'manager', 'supervisor'))
with check (private.current_user_role() in ('developer', 'managing_director', 'general_manager', 'human_resource', 'operations_manager', 'projects_manager', 'procurement_manager', 'quantity_surveyor', 'procurement', 'procurement_assistant', 'finance_manager', 'accountant', 'engineer', 'hse_officer', 'hse_assistant_officer', 'admin_receptionist', 'owner', 'hr', 'manager', 'supervisor'));

drop policy if exists payroll_run_items_select_ops on public.payroll_run_items;
create policy payroll_run_items_select_ops
on public.payroll_run_items
for select
to authenticated
using (private.current_user_role() in ('developer', 'managing_director', 'general_manager', 'human_resource', 'operations_manager', 'projects_manager', 'procurement_manager', 'quantity_surveyor', 'procurement', 'procurement_assistant', 'finance_manager', 'accountant', 'engineer', 'hse_officer', 'hse_assistant_officer', 'admin_receptionist', 'owner', 'hr', 'manager', 'supervisor'));

drop policy if exists payroll_run_items_write_admin on public.payroll_run_items;
create policy payroll_run_items_write_admin
on public.payroll_run_items
for all
to authenticated
using (private.current_user_role() in ('developer', 'managing_director', 'general_manager', 'human_resource', 'operations_manager', 'projects_manager', 'procurement_manager', 'quantity_surveyor', 'procurement', 'procurement_assistant', 'finance_manager', 'accountant', 'engineer', 'hse_officer', 'hse_assistant_officer', 'admin_receptionist', 'owner', 'hr', 'manager', 'supervisor'))
with check (private.current_user_role() in ('developer', 'managing_director', 'general_manager', 'human_resource', 'operations_manager', 'projects_manager', 'procurement_manager', 'quantity_surveyor', 'procurement', 'procurement_assistant', 'finance_manager', 'accountant', 'engineer', 'hse_officer', 'hse_assistant_officer', 'admin_receptionist', 'owner', 'hr', 'manager', 'supervisor'));

drop policy if exists boq_documents_select_ops on public.boq_documents;
create policy boq_documents_select_ops
on public.boq_documents
for select
to authenticated
using (private.current_user_role() in ('developer', 'managing_director', 'general_manager', 'human_resource', 'operations_manager', 'projects_manager', 'procurement_manager', 'quantity_surveyor', 'procurement', 'procurement_assistant', 'finance_manager', 'accountant', 'engineer', 'hse_officer', 'hse_assistant_officer', 'admin_receptionist', 'owner', 'hr', 'manager', 'supervisor'));

drop policy if exists boq_documents_write_admin on public.boq_documents;
create policy boq_documents_write_admin
on public.boq_documents
for all
to authenticated
using (private.current_user_role() in ('developer', 'managing_director', 'general_manager', 'human_resource', 'operations_manager', 'projects_manager', 'procurement_manager', 'quantity_surveyor', 'procurement', 'procurement_assistant', 'finance_manager', 'accountant', 'engineer', 'hse_officer', 'hse_assistant_officer', 'admin_receptionist', 'owner', 'hr', 'manager', 'supervisor'))
with check (private.current_user_role() in ('developer', 'managing_director', 'general_manager', 'human_resource', 'operations_manager', 'projects_manager', 'procurement_manager', 'quantity_surveyor', 'procurement', 'procurement_assistant', 'finance_manager', 'accountant', 'engineer', 'hse_officer', 'hse_assistant_officer', 'admin_receptionist', 'owner', 'hr', 'manager', 'supervisor'));

drop policy if exists boq_line_items_select_ops on public.boq_line_items;
create policy boq_line_items_select_ops
on public.boq_line_items
for select
to authenticated
using (private.current_user_role() in ('developer', 'managing_director', 'general_manager', 'human_resource', 'operations_manager', 'projects_manager', 'procurement_manager', 'quantity_surveyor', 'procurement', 'procurement_assistant', 'finance_manager', 'accountant', 'engineer', 'hse_officer', 'hse_assistant_officer', 'admin_receptionist', 'owner', 'hr', 'manager', 'supervisor'));

drop policy if exists boq_line_items_write_admin on public.boq_line_items;
create policy boq_line_items_write_admin
on public.boq_line_items
for all
to authenticated
using (private.current_user_role() in ('developer', 'managing_director', 'general_manager', 'human_resource', 'operations_manager', 'projects_manager', 'procurement_manager', 'quantity_surveyor', 'procurement', 'procurement_assistant', 'finance_manager', 'accountant', 'engineer', 'hse_officer', 'hse_assistant_officer', 'admin_receptionist', 'owner', 'hr', 'manager', 'supervisor'))
with check (private.current_user_role() in ('developer', 'managing_director', 'general_manager', 'human_resource', 'operations_manager', 'projects_manager', 'procurement_manager', 'quantity_surveyor', 'procurement', 'procurement_assistant', 'finance_manager', 'accountant', 'engineer', 'hse_officer', 'hse_assistant_officer', 'admin_receptionist', 'owner', 'hr', 'manager', 'supervisor'));

drop policy if exists invoices_select_ops on public.invoices;
create policy invoices_select_ops
on public.invoices
for select
to authenticated
using (private.current_user_role() in ('developer', 'managing_director', 'general_manager', 'human_resource', 'operations_manager', 'projects_manager', 'procurement_manager', 'quantity_surveyor', 'procurement', 'procurement_assistant', 'finance_manager', 'accountant', 'engineer', 'hse_officer', 'hse_assistant_officer', 'admin_receptionist', 'owner', 'hr', 'manager', 'supervisor'));

drop policy if exists invoices_write_admin on public.invoices;
create policy invoices_write_admin
on public.invoices
for all
to authenticated
using (private.current_user_role() in ('developer', 'managing_director', 'general_manager', 'human_resource', 'operations_manager', 'projects_manager', 'procurement_manager', 'quantity_surveyor', 'procurement', 'procurement_assistant', 'finance_manager', 'accountant', 'engineer', 'hse_officer', 'hse_assistant_officer', 'admin_receptionist', 'owner', 'hr', 'manager', 'supervisor'))
with check (private.current_user_role() in ('developer', 'managing_director', 'general_manager', 'human_resource', 'operations_manager', 'projects_manager', 'procurement_manager', 'quantity_surveyor', 'procurement', 'procurement_assistant', 'finance_manager', 'accountant', 'engineer', 'hse_officer', 'hse_assistant_officer', 'admin_receptionist', 'owner', 'hr', 'manager', 'supervisor'));

drop policy if exists site_photos_select_ops on public.site_photos;
create policy site_photos_select_ops
on public.site_photos
for select
to authenticated
using (private.current_user_role() in ('developer', 'managing_director', 'general_manager', 'human_resource', 'operations_manager', 'projects_manager', 'procurement_manager', 'quantity_surveyor', 'procurement', 'procurement_assistant', 'finance_manager', 'accountant', 'engineer', 'hse_officer', 'hse_assistant_officer', 'admin_receptionist', 'owner', 'hr', 'manager', 'supervisor'));

drop policy if exists site_photos_write_ops on public.site_photos;
create policy site_photos_write_ops
on public.site_photos
for all
to authenticated
using (private.current_user_role() in ('developer', 'managing_director', 'general_manager', 'human_resource', 'operations_manager', 'projects_manager', 'procurement_manager', 'quantity_surveyor', 'procurement', 'procurement_assistant', 'finance_manager', 'accountant', 'engineer', 'hse_officer', 'hse_assistant_officer', 'admin_receptionist', 'owner', 'hr', 'manager', 'supervisor'))
with check (private.current_user_role() in ('developer', 'managing_director', 'general_manager', 'human_resource', 'operations_manager', 'projects_manager', 'procurement_manager', 'quantity_surveyor', 'procurement', 'procurement_assistant', 'finance_manager', 'accountant', 'engineer', 'hse_officer', 'hse_assistant_officer', 'admin_receptionist', 'owner', 'hr', 'manager', 'supervisor'));

drop policy if exists audit_events_select_admin on public.audit_events;
create policy audit_events_select_admin
on public.audit_events
for select
to authenticated
using (private.current_user_role()::text in ('developer', 'managing_director', 'general_manager', 'human_resource', 'owner', 'hr', 'manager'));

drop policy if exists audit_events_insert_ops on public.audit_events;
create policy audit_events_insert_ops
on public.audit_events
for insert
to authenticated
with check (private.current_user_role() in ('developer', 'managing_director', 'general_manager', 'human_resource', 'operations_manager', 'projects_manager', 'procurement_manager', 'quantity_surveyor', 'procurement', 'procurement_assistant', 'finance_manager', 'accountant', 'engineer', 'hse_officer', 'hse_assistant_officer', 'admin_receptionist', 'owner', 'hr', 'manager', 'supervisor'));
