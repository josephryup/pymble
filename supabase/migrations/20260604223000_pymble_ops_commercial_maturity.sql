do $$
begin
  if not exists (select 1 from pg_type where typname = 'ops_commercial_contract_status') then
    create type public.ops_commercial_contract_status as enum (
      'draft',
      'active',
      'on_hold',
      'completed',
      'terminated',
      'cancelled'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'ops_commercial_contract_type') then
    create type public.ops_commercial_contract_type as enum (
      'main_contract',
      'subcontract',
      'professional_service',
      'supply',
      'other'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'ops_commercial_valuation_status') then
    create type public.ops_commercial_valuation_status as enum (
      'draft',
      'submitted',
      'certified',
      'rejected',
      'cancelled'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'ops_commercial_risk_status') then
    create type public.ops_commercial_risk_status as enum (
      'open',
      'mitigating',
      'closed',
      'cancelled'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'ops_commercial_risk_category') then
    create type public.ops_commercial_risk_category as enum (
      'client',
      'contract',
      'scope',
      'cost',
      'programme',
      'payment',
      'dispute',
      'other'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'ops_commercial_risk_severity') then
    create type public.ops_commercial_risk_severity as enum (
      'low',
      'medium',
      'high',
      'critical'
    );
  end if;
end $$;

create table if not exists public.commercial_contracts (
  id uuid primary key default gen_random_uuid(),
  contract_number text not null default (
    'CON-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  ),
  site_id uuid not null references public.sites(id) on delete restrict,
  boq_id uuid references public.boq_documents(id) on delete set null,
  status public.ops_commercial_contract_status not null default 'draft',
  contract_type public.ops_commercial_contract_type not null default 'main_contract',
  title text not null check (length(btrim(title)) > 0),
  client_name text not null check (length(btrim(client_name)) > 0),
  client_reference text not null default '',
  description text not null default '',
  start_date date,
  end_date date,
  contract_sum numeric(14, 2) not null default 0 check (contract_sum >= 0),
  retention_percent numeric(5, 2) not null default 0 check (retention_percent >= 0 and retention_percent <= 100),
  performance_security_amount numeric(14, 2) not null default 0 check (performance_security_amount >= 0),
  currency_code text not null default 'ZMW',
  activated_by uuid references public.users(id) on delete set null,
  activated_at timestamptz,
  completed_by uuid references public.users(id) on delete set null,
  completed_at timestamptz,
  cancelled_by uuid references public.users(id) on delete set null,
  cancelled_at timestamptz,
  notes text not null default '',
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);

alter table public.commercial_ipcs
  add column if not exists contract_id uuid references public.commercial_contracts(id) on delete set null;

create table if not exists public.commercial_contract_milestones (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.commercial_contracts(id) on delete cascade,
  milestone_number text not null default (
    'CMS-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  ),
  title text not null check (length(btrim(title)) > 0),
  description text not null default '',
  due_date date,
  target_amount numeric(14, 2) not null default 0 check (target_amount >= 0),
  achieved_amount numeric(14, 2) not null default 0 check (achieved_amount >= 0),
  is_complete boolean not null default false,
  completed_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.commercial_valuations (
  id uuid primary key default gen_random_uuid(),
  valuation_number text not null default (
    'VAL-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  ),
  site_id uuid not null references public.sites(id) on delete restrict,
  boq_id uuid references public.boq_documents(id) on delete set null,
  contract_id uuid references public.commercial_contracts(id) on delete set null,
  ipc_id uuid references public.commercial_ipcs(id) on delete set null,
  status public.ops_commercial_valuation_status not null default 'draft',
  title text not null check (length(btrim(title)) > 0),
  description text not null default '',
  valuation_date date not null default current_date,
  period_start date,
  period_end date,
  submitted_by uuid references public.users(id) on delete set null,
  submitted_at timestamptz,
  certified_by uuid references public.users(id) on delete set null,
  certified_at timestamptz,
  rejected_by uuid references public.users(id) on delete set null,
  rejected_at timestamptz,
  rejection_reason text not null default '',
  cancelled_by uuid references public.users(id) on delete set null,
  cancelled_at timestamptz,
  notes text not null default '',
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end is null or period_start is null or period_end >= period_start)
);

create table if not exists public.commercial_valuation_lines (
  id uuid primary key default gen_random_uuid(),
  valuation_id uuid not null references public.commercial_valuations(id) on delete cascade,
  boq_line_item_id uuid references public.boq_line_items(id) on delete set null,
  description text not null check (length(btrim(description)) > 0),
  unit text not null default '',
  claimed_quantity numeric(12, 2) not null default 0 check (claimed_quantity >= 0),
  certified_quantity numeric(12, 2) not null default 0 check (certified_quantity >= 0),
  unit_rate numeric(12, 2) not null default 0 check (unit_rate >= 0),
  claimed_amount numeric(14, 2) generated always as (claimed_quantity * unit_rate) stored,
  certified_amount numeric(14, 2) generated always as (certified_quantity * unit_rate) stored,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.commercial_ipcs
  add column if not exists valuation_id uuid references public.commercial_valuations(id) on delete set null;

create table if not exists public.commercial_risks (
  id uuid primary key default gen_random_uuid(),
  risk_number text not null default (
    'CRR-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  ),
  site_id uuid not null references public.sites(id) on delete restrict,
  contract_id uuid references public.commercial_contracts(id) on delete set null,
  status public.ops_commercial_risk_status not null default 'open',
  category public.ops_commercial_risk_category not null default 'other',
  severity public.ops_commercial_risk_severity not null default 'medium',
  title text not null check (length(btrim(title)) > 0),
  description text not null default '',
  impact_amount numeric(14, 2) not null default 0 check (impact_amount >= 0),
  mitigation_plan text not null default '',
  due_date date,
  owner_id uuid references public.users(id) on delete set null,
  closed_by uuid references public.users(id) on delete set null,
  closed_at timestamptz,
  cancelled_by uuid references public.users(id) on delete set null,
  cancelled_at timestamptz,
  notes text not null default '',
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists commercial_contracts_number_unique
  on public.commercial_contracts(contract_number);
create index if not exists commercial_contracts_site_status_idx
  on public.commercial_contracts(site_id, status, created_at desc);
create index if not exists commercial_contracts_boq_idx
  on public.commercial_contracts(boq_id, created_at desc)
  where boq_id is not null;

create unique index if not exists commercial_contract_milestones_number_unique
  on public.commercial_contract_milestones(milestone_number);
create index if not exists commercial_contract_milestones_contract_idx
  on public.commercial_contract_milestones(contract_id, due_date, created_at desc);

create unique index if not exists commercial_valuations_number_unique
  on public.commercial_valuations(valuation_number);
create index if not exists commercial_valuations_site_status_idx
  on public.commercial_valuations(site_id, status, valuation_date desc);
create index if not exists commercial_valuations_contract_idx
  on public.commercial_valuations(contract_id, valuation_date desc)
  where contract_id is not null;
create index if not exists commercial_valuations_ipc_idx
  on public.commercial_valuations(ipc_id)
  where ipc_id is not null;

create index if not exists commercial_valuation_lines_valuation_idx
  on public.commercial_valuation_lines(valuation_id, created_at);
create index if not exists commercial_valuation_lines_boq_line_idx
  on public.commercial_valuation_lines(boq_line_item_id)
  where boq_line_item_id is not null;

create unique index if not exists commercial_risks_number_unique
  on public.commercial_risks(risk_number);
create index if not exists commercial_risks_site_status_idx
  on public.commercial_risks(site_id, status, severity, due_date, created_at desc);
create index if not exists commercial_risks_contract_idx
  on public.commercial_risks(contract_id, status, due_date)
  where contract_id is not null;

create index if not exists commercial_ipcs_contract_idx
  on public.commercial_ipcs(contract_id, valuation_date desc)
  where contract_id is not null;
create index if not exists commercial_ipcs_valuation_idx
  on public.commercial_ipcs(valuation_id)
  where valuation_id is not null;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'commercial_contracts',
    'commercial_contract_milestones',
    'commercial_valuations',
    'commercial_valuation_lines',
    'commercial_risks'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', table_name);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function private.set_updated_at()',
      table_name
    );
  end loop;
end $$;

alter table public.commercial_contracts enable row level security;
alter table public.commercial_contract_milestones enable row level security;
alter table public.commercial_valuations enable row level security;
alter table public.commercial_valuation_lines enable row level security;
alter table public.commercial_risks enable row level security;

grant select on public.commercial_contracts to authenticated;
grant select on public.commercial_contract_milestones to authenticated;
grant select on public.commercial_valuations to authenticated;
grant select on public.commercial_valuation_lines to authenticated;
grant select on public.commercial_risks to authenticated;
grant all on public.commercial_contracts to service_role;
grant all on public.commercial_contract_milestones to service_role;
grant all on public.commercial_valuations to service_role;
grant all on public.commercial_valuation_lines to service_role;
grant all on public.commercial_risks to service_role;

drop policy if exists commercial_contracts_select_ops on public.commercial_contracts;
create policy commercial_contracts_select_ops
on public.commercial_contracts
for select
to authenticated
using (private.can_access_commercial_controls());

drop policy if exists commercial_contract_milestones_select_ops on public.commercial_contract_milestones;
create policy commercial_contract_milestones_select_ops
on public.commercial_contract_milestones
for select
to authenticated
using (private.can_access_commercial_controls());

drop policy if exists commercial_valuations_select_ops on public.commercial_valuations;
create policy commercial_valuations_select_ops
on public.commercial_valuations
for select
to authenticated
using (private.can_access_commercial_controls());

drop policy if exists commercial_valuation_lines_select_ops on public.commercial_valuation_lines;
create policy commercial_valuation_lines_select_ops
on public.commercial_valuation_lines
for select
to authenticated
using (private.can_access_commercial_controls());

drop policy if exists commercial_risks_select_ops on public.commercial_risks;
create policy commercial_risks_select_ops
on public.commercial_risks
for select
to authenticated
using (private.can_access_commercial_controls());
