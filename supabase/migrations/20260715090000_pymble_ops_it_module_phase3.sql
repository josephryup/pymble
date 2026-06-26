-- Phase IT-3: Information Technology infrastructure & oversight.
--
-- Network/infrastructure inventory, security-incident log, backup status
-- register, internal knowledge base, and the IT department (added to the
-- existing ops_department_key enum so IT plugs into department reporting).
-- All deny-all RLS, service-role only.

-- Add IT to the department enum (used by department_reports). Safe: the value
-- is not consumed within this migration.
alter type public.ops_department_key add value if not exists 'it';

-- ── Enums ──────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'ops_it_network_device_type') then
    create type public.ops_it_network_device_type as enum (
      'router', 'switch', 'access_point', 'firewall', 'server', 'isp_link', 'other'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'ops_it_network_status') then
    create type public.ops_it_network_status as enum ('online', 'offline', 'maintenance', 'retired');
  end if;
  if not exists (select 1 from pg_type where typname = 'ops_it_incident_severity') then
    create type public.ops_it_incident_severity as enum ('low', 'medium', 'high', 'critical');
  end if;
  if not exists (select 1 from pg_type where typname = 'ops_it_incident_status') then
    create type public.ops_it_incident_status as enum ('open', 'investigating', 'resolved');
  end if;
  if not exists (select 1 from pg_type where typname = 'ops_it_backup_status') then
    create type public.ops_it_backup_status as enum ('success', 'failed', 'in_progress');
  end if;
  if not exists (select 1 from pg_type where typname = 'ops_it_kb_status') then
    create type public.ops_it_kb_status as enum ('draft', 'published', 'archived');
  end if;
end$$;

-- ── Network & infrastructure ─────────────────────────────────────────────────
create table if not exists public.it_network_devices (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  device_type public.ops_it_network_device_type not null default 'other',
  status public.ops_it_network_status not null default 'online',
  site_id uuid references public.sites(id) on delete set null,
  ip_address text not null default '',
  location text not null default '',
  isp_provider text not null default '',
  last_checked_at timestamptz,
  notes text not null default '',
  created_by uuid references public.users(id) on delete set null,
  archived_at timestamptz,
  archived_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists it_network_devices_status_idx
  on public.it_network_devices(status, device_type, created_at desc)
  where archived_at is null;

drop trigger if exists it_network_devices_set_updated_at on public.it_network_devices;
create trigger it_network_devices_set_updated_at
  before update on public.it_network_devices
  for each row execute function private.set_updated_at();

-- ── Security incidents ───────────────────────────────────────────────────────
create table if not exists public.it_security_incidents (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) > 0),
  severity public.ops_it_incident_severity not null default 'medium',
  status public.ops_it_incident_status not null default 'open',
  summary text not null default '',
  detected_at date not null default current_date,
  resolved_at date,
  created_by uuid references public.users(id) on delete set null,
  archived_at timestamptz,
  archived_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists it_security_incidents_status_idx
  on public.it_security_incidents(status, severity, detected_at desc)
  where archived_at is null;

drop trigger if exists it_security_incidents_set_updated_at on public.it_security_incidents;
create trigger it_security_incidents_set_updated_at
  before update on public.it_security_incidents
  for each row execute function private.set_updated_at();

-- ── Backup status register ───────────────────────────────────────────────────
create table if not exists public.it_backup_records (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  target text not null default '',
  frequency text not null default '',
  status public.ops_it_backup_status not null default 'success',
  last_run_at timestamptz,
  notes text not null default '',
  created_by uuid references public.users(id) on delete set null,
  archived_at timestamptz,
  archived_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists it_backup_records_status_idx
  on public.it_backup_records(status, last_run_at desc)
  where archived_at is null;

drop trigger if exists it_backup_records_set_updated_at on public.it_backup_records;
create trigger it_backup_records_set_updated_at
  before update on public.it_backup_records
  for each row execute function private.set_updated_at();

-- ── Knowledge base ───────────────────────────────────────────────────────────
create table if not exists public.it_kb_articles (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) > 0),
  category text not null default 'general',
  body text not null default '',
  status public.ops_it_kb_status not null default 'draft',
  created_by uuid references public.users(id) on delete set null,
  archived_at timestamptz,
  archived_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists it_kb_articles_status_idx
  on public.it_kb_articles(status, category, created_at desc)
  where archived_at is null;

drop trigger if exists it_kb_articles_set_updated_at on public.it_kb_articles;
create trigger it_kb_articles_set_updated_at
  before update on public.it_kb_articles
  for each row execute function private.set_updated_at();

-- ── Row-level security: deny-all for anon/authenticated (service role only) ──
do $$
declare t text;
begin
  foreach t in array array[
    'it_network_devices', 'it_security_incidents', 'it_backup_records', 'it_kb_articles'
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
  begin execute 'alter publication supabase_realtime add table public.it_network_devices'; exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.it_security_incidents'; exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.it_backup_records'; exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.it_kb_articles'; exception when duplicate_object then null; end;
end$$;
