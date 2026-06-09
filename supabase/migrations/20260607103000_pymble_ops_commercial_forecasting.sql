do $$
begin
  if not exists (select 1 from pg_type where typname = 'ops_commercial_retention_release_status') then
    create type public.ops_commercial_retention_release_status as enum (
      'draft',
      'submitted',
      'approved',
      'released',
      'rejected',
      'cancelled'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'ops_commercial_retention_release_type') then
    create type public.ops_commercial_retention_release_type as enum (
      'interim',
      'practical_completion',
      'defects_liability',
      'final_account',
      'other'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'ops_commercial_cashflow_status') then
    create type public.ops_commercial_cashflow_status as enum (
      'draft',
      'approved',
      'locked',
      'archived',
      'cancelled'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'ops_commercial_forecast_confidence') then
    create type public.ops_commercial_forecast_confidence as enum (
      'low',
      'medium',
      'high'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'ops_commercial_milestone_status') then
    create type public.ops_commercial_milestone_status as enum (
      'planned',
      'due',
      'achieved',
      'certified',
      'delayed',
      'cancelled'
    );
  end if;
end $$;

alter table public.commercial_contract_milestones
  add column if not exists site_id uuid references public.sites(id) on delete restrict,
  add column if not exists status public.ops_commercial_milestone_status not null default 'planned',
  add column if not exists planned_date date,
  add column if not exists forecast_date date,
  add column if not exists actual_date date,
  add column if not exists billing_weight_percent numeric(5, 2) not null default 0 check (billing_weight_percent >= 0 and billing_weight_percent <= 100),
  add column if not exists invoice_trigger boolean not null default false,
  add column if not exists retention_trigger boolean not null default false,
  add column if not exists owner_id uuid references public.users(id) on delete set null,
  add column if not exists achieved_by uuid references public.users(id) on delete set null,
  add column if not exists certified_by uuid references public.users(id) on delete set null,
  add column if not exists certified_at timestamptz,
  add column if not exists cancelled_by uuid references public.users(id) on delete set null,
  add column if not exists cancelled_at timestamptz,
  add column if not exists notes text not null default '';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'commercial_contract_milestones_date_order'
      and conrelid = 'public.commercial_contract_milestones'::regclass
  ) then
    alter table public.commercial_contract_milestones
      add constraint commercial_contract_milestones_date_order
      check (forecast_date is null or planned_date is null or forecast_date >= planned_date);
  end if;
end $$;

update public.commercial_contract_milestones milestone
set site_id = contract.site_id
from public.commercial_contracts contract
where milestone.contract_id = contract.id
  and milestone.site_id is null;

create or replace function private.set_commercial_milestone_site_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select site_id into new.site_id
  from public.commercial_contracts
  where id = new.contract_id;

  if new.site_id is null then
    raise exception 'Commercial milestone contract was not found.';
  end if;

  return new;
end;
$$;

create table if not exists public.commercial_retention_releases (
  id uuid primary key default gen_random_uuid(),
  release_number text not null default (
    'RET-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  ),
  site_id uuid not null references public.sites(id) on delete restrict,
  contract_id uuid not null references public.commercial_contracts(id) on delete restrict,
  ipc_id uuid references public.commercial_ipcs(id) on delete set null,
  status public.ops_commercial_retention_release_status not null default 'draft',
  release_type public.ops_commercial_retention_release_type not null default 'interim',
  title text not null check (length(btrim(title)) > 0),
  description text not null default '',
  due_date date,
  release_date date,
  claimed_amount numeric(14, 2) not null default 0 check (claimed_amount >= 0),
  approved_amount numeric(14, 2) not null default 0 check (approved_amount >= 0),
  released_amount numeric(14, 2) not null default 0 check (released_amount >= 0),
  client_reference text not null default '',
  submitted_by uuid references public.users(id) on delete set null,
  submitted_at timestamptz,
  approved_by uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  released_by uuid references public.users(id) on delete set null,
  released_at timestamptz,
  rejected_by uuid references public.users(id) on delete set null,
  rejected_at timestamptz,
  rejection_reason text not null default '',
  cancelled_by uuid references public.users(id) on delete set null,
  cancelled_at timestamptz,
  notes text not null default '',
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (release_date is null or due_date is null or release_date >= due_date)
);

create table if not exists public.commercial_cashflow_forecasts (
  id uuid primary key default gen_random_uuid(),
  forecast_number text not null default (
    'CF-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  ),
  site_id uuid not null references public.sites(id) on delete restrict,
  contract_id uuid references public.commercial_contracts(id) on delete set null,
  status public.ops_commercial_cashflow_status not null default 'draft',
  confidence public.ops_commercial_forecast_confidence not null default 'medium',
  title text not null check (length(btrim(title)) > 0),
  period_start date not null,
  period_end date not null,
  forecast_revenue numeric(14, 2) not null default 0 check (forecast_revenue >= 0),
  forecast_retention_release numeric(14, 2) not null default 0 check (forecast_retention_release >= 0),
  forecast_cost numeric(14, 2) not null default 0 check (forecast_cost >= 0),
  actual_revenue numeric(14, 2) not null default 0 check (actual_revenue >= 0),
  actual_cost numeric(14, 2) not null default 0 check (actual_cost >= 0),
  forecast_net_cash numeric(14, 2) generated always as (
    forecast_revenue + forecast_retention_release - forecast_cost
  ) stored,
  actual_net_cash numeric(14, 2) generated always as (
    actual_revenue - actual_cost
  ) stored,
  assumptions text not null default '',
  approved_by uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  locked_by uuid references public.users(id) on delete set null,
  locked_at timestamptz,
  archived_by uuid references public.users(id) on delete set null,
  archived_at timestamptz,
  cancelled_by uuid references public.users(id) on delete set null,
  cancelled_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end >= period_start)
);

create unique index if not exists commercial_retention_releases_number_unique
  on public.commercial_retention_releases(release_number);
create index if not exists commercial_retention_releases_site_status_idx
  on public.commercial_retention_releases(site_id, status, due_date, created_at desc);
create index if not exists commercial_retention_releases_contract_idx
  on public.commercial_retention_releases(contract_id, status, due_date)
  where status <> 'cancelled';
create index if not exists commercial_retention_releases_ipc_idx
  on public.commercial_retention_releases(ipc_id, created_at desc)
  where ipc_id is not null;

create unique index if not exists commercial_cashflow_forecasts_number_unique
  on public.commercial_cashflow_forecasts(forecast_number);
create index if not exists commercial_cashflow_forecasts_site_period_idx
  on public.commercial_cashflow_forecasts(site_id, period_start desc, status);
create index if not exists commercial_cashflow_forecasts_contract_period_idx
  on public.commercial_cashflow_forecasts(contract_id, period_start desc)
  where contract_id is not null;

create index if not exists commercial_contract_milestones_site_status_idx
  on public.commercial_contract_milestones(site_id, status, coalesce(forecast_date, due_date, planned_date), created_at desc);
create index if not exists commercial_contract_milestones_owner_idx
  on public.commercial_contract_milestones(owner_id, status, coalesce(forecast_date, due_date, planned_date))
  where owner_id is not null;

drop trigger if exists set_commercial_milestone_site_id on public.commercial_contract_milestones;
create trigger set_commercial_milestone_site_id
before insert or update of contract_id
on public.commercial_contract_milestones
for each row
execute function private.set_commercial_milestone_site_id();

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'commercial_contract_milestones',
    'commercial_retention_releases',
    'commercial_cashflow_forecasts'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', table_name);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function private.set_updated_at()',
      table_name
    );
  end loop;
end $$;

alter table public.commercial_retention_releases enable row level security;
alter table public.commercial_cashflow_forecasts enable row level security;
alter table public.commercial_contract_milestones enable row level security;

grant select on public.commercial_retention_releases to authenticated;
grant select on public.commercial_cashflow_forecasts to authenticated;
grant select on public.commercial_contract_milestones to authenticated;
grant all on public.commercial_retention_releases to service_role;
grant all on public.commercial_cashflow_forecasts to service_role;
grant all on public.commercial_contract_milestones to service_role;

drop policy if exists commercial_retention_releases_select_ops on public.commercial_retention_releases;
create policy commercial_retention_releases_select_ops
on public.commercial_retention_releases
for select
to authenticated
using (private.can_access_commercial_controls());

drop policy if exists commercial_cashflow_forecasts_select_ops on public.commercial_cashflow_forecasts;
create policy commercial_cashflow_forecasts_select_ops
on public.commercial_cashflow_forecasts
for select
to authenticated
using (private.can_access_commercial_controls());

drop policy if exists commercial_contract_milestones_select_ops on public.commercial_contract_milestones;
create policy commercial_contract_milestones_select_ops
on public.commercial_contract_milestones
for select
to authenticated
using (private.can_access_commercial_controls());
