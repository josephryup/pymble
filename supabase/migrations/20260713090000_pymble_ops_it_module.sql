-- Phase IT-1: Information Technology module.
--
-- A role-isolated IT area: an asset register, asset assignment history, and an
-- internal help desk (tickets + comments). Access is enforced in the app layer
-- (lib/ops/it-permissions.ts) behind the service role — these tables follow the
-- project convention of deny-all RLS for anon/authenticated, matching
-- department_reports and every other ops table.

-- ── Enums ──────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'ops_it_asset_type') then
    create type public.ops_it_asset_type as enum (
      'laptop', 'desktop', 'printer', 'phone', 'tablet',
      'monitor', 'network', 'server', 'other'
    );
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'ops_it_asset_status') then
    create type public.ops_it_asset_status as enum (
      'in_use', 'spare', 'repair', 'retired', 'disposed', 'lost'
    );
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'ops_it_ticket_category') then
    create type public.ops_it_ticket_category as enum (
      'hardware', 'software', 'network', 'email', 'access',
      'printing', 'site_connectivity', 'security', 'other'
    );
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'ops_it_ticket_priority') then
    create type public.ops_it_ticket_priority as enum (
      'low', 'normal', 'high', 'urgent'
    );
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'ops_it_ticket_status') then
    create type public.ops_it_ticket_status as enum (
      'open', 'in_progress', 'on_hold', 'awaiting_user',
      'resolved', 'closed', 'cancelled'
    );
  end if;
end$$;

-- ── Assets ─────────────────────────────────────────────────────────────────
create table if not exists public.it_assets (
  id uuid primary key default gen_random_uuid(),
  asset_tag text not null default (
    'AST-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  ),
  asset_type public.ops_it_asset_type not null default 'other',
  name text not null check (length(btrim(name)) > 0),
  manufacturer text not null default '',
  model text not null default '',
  serial_number text not null default '',
  status public.ops_it_asset_status not null default 'in_use',
  assigned_to uuid references public.users(id) on delete set null,
  site_id uuid references public.sites(id) on delete set null,
  location text not null default '',
  purchase_date date,
  warranty_expiry date,
  purchase_cost numeric(14, 2) check (purchase_cost is null or purchase_cost >= 0),
  notes text not null default '',
  created_by uuid references public.users(id) on delete set null,
  archived_at timestamptz,
  archived_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists it_assets_asset_tag_unique on public.it_assets(asset_tag);
create index if not exists it_assets_status_idx
  on public.it_assets(status, asset_type, created_at desc)
  where archived_at is null;
create index if not exists it_assets_assigned_idx
  on public.it_assets(assigned_to)
  where assigned_to is not null and archived_at is null;
create index if not exists it_assets_warranty_idx
  on public.it_assets(warranty_expiry)
  where warranty_expiry is not null and archived_at is null;
create index if not exists it_assets_name_lookup_idx
  on public.it_assets(lower(name), lower(serial_number));

drop trigger if exists it_assets_set_updated_at on public.it_assets;
create trigger it_assets_set_updated_at
  before update on public.it_assets
  for each row execute function private.set_updated_at();

-- ── Asset assignment history ─────────────────────────────────────────────────
create table if not exists public.it_asset_assignments (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.it_assets(id) on delete cascade,
  assigned_to uuid references public.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  released_at timestamptz,
  note text not null default '',
  created_by uuid references public.users(id) on delete set null
);

create index if not exists it_asset_assignments_asset_idx
  on public.it_asset_assignments(asset_id, assigned_at desc);

-- ── Help-desk tickets ────────────────────────────────────────────────────────
create table if not exists public.it_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_ref text not null default (
    'TKT-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  ),
  title text not null check (length(btrim(title)) > 0),
  description text not null default '',
  category public.ops_it_ticket_category not null default 'other',
  priority public.ops_it_ticket_priority not null default 'normal',
  status public.ops_it_ticket_status not null default 'open',
  raised_by uuid references public.users(id) on delete set null,
  assigned_to uuid references public.users(id) on delete set null,
  site_id uuid references public.sites(id) on delete set null,
  asset_id uuid references public.it_assets(id) on delete set null,
  first_response_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  resolution_notes text not null default '',
  satisfaction_rating smallint check (satisfaction_rating is null or satisfaction_rating between 1 and 5),
  created_by uuid references public.users(id) on delete set null,
  archived_at timestamptz,
  archived_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists it_tickets_ticket_ref_unique on public.it_tickets(ticket_ref);
create index if not exists it_tickets_status_idx
  on public.it_tickets(status, priority, created_at desc)
  where archived_at is null;
create index if not exists it_tickets_assigned_idx
  on public.it_tickets(assigned_to, status)
  where archived_at is null;
create index if not exists it_tickets_raised_by_idx
  on public.it_tickets(raised_by, created_at desc)
  where archived_at is null;

drop trigger if exists it_tickets_set_updated_at on public.it_tickets;
create trigger it_tickets_set_updated_at
  before update on public.it_tickets
  for each row execute function private.set_updated_at();

-- ── Ticket comments (public + internal IT notes) ─────────────────────────────
create table if not exists public.it_ticket_comments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.it_tickets(id) on delete cascade,
  author_id uuid references public.users(id) on delete set null,
  body text not null check (length(btrim(body)) > 0),
  is_internal boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists it_ticket_comments_ticket_idx
  on public.it_ticket_comments(ticket_id, created_at);

-- ── Row-level security: deny-all for anon/authenticated (service role only) ──
alter table public.it_assets enable row level security;
alter table public.it_asset_assignments enable row level security;
alter table public.it_tickets enable row level security;
alter table public.it_ticket_comments enable row level security;

drop policy if exists "it_assets_service_role_all" on public.it_assets;
create policy "it_assets_service_role_all" on public.it_assets
  for all to anon, authenticated using (false) with check (false);

drop policy if exists "it_asset_assignments_service_role_all" on public.it_asset_assignments;
create policy "it_asset_assignments_service_role_all" on public.it_asset_assignments
  for all to anon, authenticated using (false) with check (false);

drop policy if exists "it_tickets_service_role_all" on public.it_tickets;
create policy "it_tickets_service_role_all" on public.it_tickets
  for all to anon, authenticated using (false) with check (false);

drop policy if exists "it_ticket_comments_service_role_all" on public.it_ticket_comments;
create policy "it_ticket_comments_service_role_all" on public.it_ticket_comments
  for all to anon, authenticated using (false) with check (false);

-- ── Realtime ─────────────────────────────────────────────────────────────────
do $$
begin
  begin execute 'alter publication supabase_realtime add table public.it_assets'; exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.it_tickets'; exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.it_ticket_comments'; exception when duplicate_object then null; end;
end$$;
