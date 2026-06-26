-- Phase IT-2: Information Technology governance modules.
--
-- Software & licences, the per-employee access register, onboarding/offboarding
-- IT checklists, versioned IT policies + acknowledgements, and a credential
-- METADATA register (never secrets — secrets live in Bitwarden; see
-- docs/pymble-ops-it-module-audit.md §7). All deny-all RLS, service-role only.

-- ── Enums ──────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'ops_it_license_status') then
    create type public.ops_it_license_status as enum ('active', 'cancelled');
  end if;
  if not exists (select 1 from pg_type where typname = 'ops_it_license_billing') then
    create type public.ops_it_license_billing as enum ('monthly', 'annual', 'one_time');
  end if;
  if not exists (select 1 from pg_type where typname = 'ops_it_access_status') then
    create type public.ops_it_access_status as enum ('active', 'revoked');
  end if;
  if not exists (select 1 from pg_type where typname = 'ops_it_checklist_kind') then
    create type public.ops_it_checklist_kind as enum ('onboarding', 'offboarding');
  end if;
  if not exists (select 1 from pg_type where typname = 'ops_it_checklist_status') then
    create type public.ops_it_checklist_status as enum ('in_progress', 'completed');
  end if;
  if not exists (select 1 from pg_type where typname = 'ops_it_policy_category') then
    create type public.ops_it_policy_category as enum (
      'acceptable_use', 'password', 'byod', 'cybersecurity', 'data_retention', 'other'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'ops_it_policy_status') then
    create type public.ops_it_policy_status as enum ('draft', 'published', 'archived');
  end if;
end$$;

-- ── Software & licences ──────────────────────────────────────────────────────
create table if not exists public.it_software_licenses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  vendor text not null default '',
  billing public.ops_it_license_billing not null default 'annual',
  status public.ops_it_license_status not null default 'active',
  seats_total integer check (seats_total is null or seats_total >= 0),
  seats_used integer not null default 0 check (seats_used >= 0),
  unit_cost numeric(14, 2) check (unit_cost is null or unit_cost >= 0),
  renewal_date date,
  notes text not null default '',
  created_by uuid references public.users(id) on delete set null,
  archived_at timestamptz,
  archived_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists it_software_licenses_status_idx
  on public.it_software_licenses(status, renewal_date)
  where archived_at is null;

drop trigger if exists it_software_licenses_set_updated_at on public.it_software_licenses;
create trigger it_software_licenses_set_updated_at
  before update on public.it_software_licenses
  for each row execute function private.set_updated_at();

-- ── Access register (per-employee accounts / permissions) ────────────────────
create table if not exists public.it_access_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  system_name text not null check (length(btrim(system_name)) > 0),
  access_level text not null default '',
  account_identifier text not null default '',
  status public.ops_it_access_status not null default 'active',
  granted_at date not null default current_date,
  revoked_at date,
  notes text not null default '',
  created_by uuid references public.users(id) on delete set null,
  archived_at timestamptz,
  archived_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists it_access_grants_user_idx
  on public.it_access_grants(user_id, status)
  where archived_at is null;

drop trigger if exists it_access_grants_set_updated_at on public.it_access_grants;
create trigger it_access_grants_set_updated_at
  before update on public.it_access_grants
  for each row execute function private.set_updated_at();

-- ── Employee IT checklists (onboarding / offboarding) ────────────────────────
create table if not exists public.it_checklist_runs (
  id uuid primary key default gen_random_uuid(),
  employee_user_id uuid references public.users(id) on delete set null,
  employee_name text not null default '',
  kind public.ops_it_checklist_kind not null,
  status public.ops_it_checklist_status not null default 'in_progress',
  notes text not null default '',
  created_by uuid references public.users(id) on delete set null,
  completed_at timestamptz,
  archived_at timestamptz,
  archived_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists it_checklist_runs_status_idx
  on public.it_checklist_runs(status, kind, created_at desc)
  where archived_at is null;

drop trigger if exists it_checklist_runs_set_updated_at on public.it_checklist_runs;
create trigger it_checklist_runs_set_updated_at
  before update on public.it_checklist_runs
  for each row execute function private.set_updated_at();

create table if not exists public.it_checklist_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.it_checklist_runs(id) on delete cascade,
  label text not null check (length(btrim(label)) > 0),
  is_done boolean not null default false,
  sort_order integer not null default 0,
  done_at timestamptz,
  done_by uuid references public.users(id) on delete set null
);

create index if not exists it_checklist_items_run_idx
  on public.it_checklist_items(run_id, sort_order);

-- ── IT policies + acknowledgements ───────────────────────────────────────────
create table if not exists public.it_policies (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) > 0),
  category public.ops_it_policy_category not null default 'other',
  version integer not null default 1 check (version >= 1),
  body text not null default '',
  status public.ops_it_policy_status not null default 'draft',
  published_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  archived_at timestamptz,
  archived_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists it_policies_status_idx
  on public.it_policies(status, category, created_at desc)
  where archived_at is null;

drop trigger if exists it_policies_set_updated_at on public.it_policies;
create trigger it_policies_set_updated_at
  before update on public.it_policies
  for each row execute function private.set_updated_at();

create table if not exists public.it_policy_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references public.it_policies(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  acknowledged_at timestamptz not null default now()
);

create unique index if not exists it_policy_ack_unique
  on public.it_policy_acknowledgements(policy_id, user_id);

-- ── Credential register (METADATA ONLY — no secrets) ─────────────────────────
create table if not exists public.it_credentials (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  system_name text not null default '',
  account_identifier text not null default '',
  owner_user_id uuid references public.users(id) on delete set null,
  vault_location text not null default '',
  rotation_due_date date,
  last_rotated_at date,
  notes text not null default '',
  created_by uuid references public.users(id) on delete set null,
  archived_at timestamptz,
  archived_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists it_credentials_rotation_idx
  on public.it_credentials(rotation_due_date)
  where archived_at is null;

drop trigger if exists it_credentials_set_updated_at on public.it_credentials;
create trigger it_credentials_set_updated_at
  before update on public.it_credentials
  for each row execute function private.set_updated_at();

-- ── Row-level security: deny-all for anon/authenticated (service role only) ──
do $$
declare t text;
begin
  foreach t in array array[
    'it_software_licenses', 'it_access_grants', 'it_checklist_runs',
    'it_checklist_items', 'it_policies', 'it_policy_acknowledgements',
    'it_credentials'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_service_role_all', t);
    execute format(
      'create policy %I on public.%I for all to anon, authenticated using (false) with check (false)',
      t || '_service_role_all', t
    );
  end loop;
end$$;

-- ── Realtime ─────────────────────────────────────────────────────────────────
do $$
begin
  begin execute 'alter publication supabase_realtime add table public.it_software_licenses'; exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.it_access_grants'; exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.it_checklist_runs'; exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.it_checklist_items'; exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.it_policies'; exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.it_credentials'; exception when duplicate_object then null; end;
end$$;
