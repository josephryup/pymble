do $$
begin
  if not exists (select 1 from pg_type where typname = 'ops_commercial_ipc_status') then
    create type public.ops_commercial_ipc_status as enum (
      'draft',
      'submitted',
      'certified',
      'invoiced',
      'paid',
      'rejected',
      'cancelled'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'ops_commercial_variation_status') then
    create type public.ops_commercial_variation_status as enum (
      'draft',
      'submitted',
      'priced',
      'approved',
      'rejected',
      'closed',
      'cancelled'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'ops_commercial_claim_status') then
    create type public.ops_commercial_claim_status as enum (
      'draft',
      'submitted',
      'under_review',
      'agreed',
      'rejected',
      'closed',
      'cancelled'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'ops_commercial_claim_type') then
    create type public.ops_commercial_claim_type as enum (
      'extension_of_time',
      'loss_expense',
      'acceleration',
      'disruption',
      'prolongation',
      'variation_dispute',
      'other'
    );
  end if;
end $$;

create table if not exists public.commercial_ipcs (
  id uuid primary key default gen_random_uuid(),
  ipc_number text not null default (
    'IPC-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  ),
  site_id uuid not null references public.sites(id) on delete restrict,
  boq_id uuid references public.boq_documents(id) on delete set null,
  invoice_id uuid references public.invoices(id) on delete set null,
  status public.ops_commercial_ipc_status not null default 'draft',
  title text not null check (length(btrim(title)) > 0),
  description text not null default '',
  valuation_date date not null default current_date,
  period_start date,
  period_end date,
  claimed_amount numeric(14, 2) not null default 0 check (claimed_amount >= 0),
  certified_amount numeric(14, 2) not null default 0 check (certified_amount >= 0),
  retention_amount numeric(14, 2) not null default 0 check (retention_amount >= 0),
  vat_amount numeric(14, 2) not null default 0 check (vat_amount >= 0),
  total_certified_amount numeric(14, 2) generated always as (
    greatest(certified_amount - retention_amount, 0) + vat_amount
  ) stored,
  client_reference text not null default '',
  submitted_by uuid references public.users(id) on delete set null,
  submitted_at timestamptz,
  certified_by uuid references public.users(id) on delete set null,
  certified_at timestamptz,
  rejected_by uuid references public.users(id) on delete set null,
  rejected_at timestamptz,
  rejection_reason text not null default '',
  invoiced_by uuid references public.users(id) on delete set null,
  invoiced_at timestamptz,
  paid_by uuid references public.users(id) on delete set null,
  paid_at timestamptz,
  cancelled_by uuid references public.users(id) on delete set null,
  cancelled_at timestamptz,
  notes text not null default '',
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end is null or period_start is null or period_end >= period_start)
);

create table if not exists public.commercial_variations (
  id uuid primary key default gen_random_uuid(),
  variation_number text not null default (
    'VAR-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  ),
  site_id uuid not null references public.sites(id) on delete restrict,
  boq_id uuid references public.boq_documents(id) on delete set null,
  status public.ops_commercial_variation_status not null default 'draft',
  title text not null check (length(btrim(title)) > 0),
  description text not null default '',
  reason text not null default '',
  instruction_reference text not null default '',
  client_reference text not null default '',
  submitted_amount numeric(14, 2) not null default 0 check (submitted_amount >= 0),
  approved_amount numeric(14, 2) not null default 0 check (approved_amount >= 0),
  submitted_by uuid references public.users(id) on delete set null,
  submitted_at timestamptz,
  priced_by uuid references public.users(id) on delete set null,
  priced_at timestamptz,
  approved_by uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  rejected_by uuid references public.users(id) on delete set null,
  rejected_at timestamptz,
  rejection_reason text not null default '',
  closed_by uuid references public.users(id) on delete set null,
  closed_at timestamptz,
  cancelled_by uuid references public.users(id) on delete set null,
  cancelled_at timestamptz,
  notes text not null default '',
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.commercial_claims (
  id uuid primary key default gen_random_uuid(),
  claim_number text not null default (
    'CLM-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  ),
  site_id uuid not null references public.sites(id) on delete restrict,
  variation_id uuid references public.commercial_variations(id) on delete set null,
  claim_type public.ops_commercial_claim_type not null default 'other',
  status public.ops_commercial_claim_status not null default 'draft',
  title text not null check (length(btrim(title)) > 0),
  description text not null default '',
  event_date date,
  due_date date,
  claimed_amount numeric(14, 2) not null default 0 check (claimed_amount >= 0),
  agreed_amount numeric(14, 2) not null default 0 check (agreed_amount >= 0),
  client_reference text not null default '',
  submitted_by uuid references public.users(id) on delete set null,
  submitted_at timestamptz,
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  agreed_by uuid references public.users(id) on delete set null,
  agreed_at timestamptz,
  rejected_by uuid references public.users(id) on delete set null,
  rejected_at timestamptz,
  rejection_reason text not null default '',
  closed_by uuid references public.users(id) on delete set null,
  closed_at timestamptz,
  cancelled_by uuid references public.users(id) on delete set null,
  cancelled_at timestamptz,
  notes text not null default '',
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (due_date is null or event_date is null or due_date >= event_date)
);

create unique index if not exists commercial_ipcs_number_unique
  on public.commercial_ipcs(ipc_number);
create index if not exists commercial_ipcs_site_status_idx
  on public.commercial_ipcs(site_id, status, valuation_date desc);
create index if not exists commercial_ipcs_boq_idx
  on public.commercial_ipcs(boq_id, valuation_date desc)
  where boq_id is not null;
create index if not exists commercial_ipcs_invoice_idx
  on public.commercial_ipcs(invoice_id)
  where invoice_id is not null;

create unique index if not exists commercial_variations_number_unique
  on public.commercial_variations(variation_number);
create index if not exists commercial_variations_site_status_idx
  on public.commercial_variations(site_id, status, created_at desc);
create index if not exists commercial_variations_boq_idx
  on public.commercial_variations(boq_id, created_at desc)
  where boq_id is not null;

create unique index if not exists commercial_claims_number_unique
  on public.commercial_claims(claim_number);
create index if not exists commercial_claims_site_status_idx
  on public.commercial_claims(site_id, status, due_date desc, created_at desc);
create index if not exists commercial_claims_variation_idx
  on public.commercial_claims(variation_id, created_at desc)
  where variation_id is not null;

create or replace function private.can_access_commercial_controls()
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
        'quantity_surveyor',
        'finance_manager',
        'accountant',
        'engineer'
      ),
      false
    )
$$;

grant execute on function private.can_access_commercial_controls() to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'commercial_ipcs',
    'commercial_variations',
    'commercial_claims'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', table_name);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function private.set_updated_at()',
      table_name
    );
  end loop;
end $$;

alter table public.commercial_ipcs enable row level security;
alter table public.commercial_variations enable row level security;
alter table public.commercial_claims enable row level security;

grant select on public.commercial_ipcs to authenticated;
grant select on public.commercial_variations to authenticated;
grant select on public.commercial_claims to authenticated;
grant all on public.commercial_ipcs to service_role;
grant all on public.commercial_variations to service_role;
grant all on public.commercial_claims to service_role;

drop policy if exists commercial_ipcs_select_ops on public.commercial_ipcs;
create policy commercial_ipcs_select_ops
on public.commercial_ipcs
for select
to authenticated
using (private.can_access_commercial_controls());

drop policy if exists commercial_variations_select_ops on public.commercial_variations;
create policy commercial_variations_select_ops
on public.commercial_variations
for select
to authenticated
using (private.can_access_commercial_controls());

drop policy if exists commercial_claims_select_ops on public.commercial_claims;
create policy commercial_claims_select_ops
on public.commercial_claims
for select
to authenticated
using (private.can_access_commercial_controls());
