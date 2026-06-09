do $$
begin
  if not exists (select 1 from pg_type where typname = 'ops_project_budget_status') then
    create type public.ops_project_budget_status as enum (
      'draft',
      'active',
      'locked',
      'archived'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'ops_payment_request_status') then
    create type public.ops_payment_request_status as enum (
      'draft',
      'submitted',
      'finance_review',
      'approved',
      'rejected',
      'paid',
      'cancelled'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'ops_payment_request_type') then
    create type public.ops_payment_request_type as enum (
      'supplier_invoice',
      'expense',
      'subcontractor',
      'payroll',
      'tax',
      'other'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'ops_project_cost_entry_status') then
    create type public.ops_project_cost_entry_status as enum (
      'committed',
      'posted',
      'cancelled'
    );
  end if;
end $$;

create table if not exists public.project_budgets (
  id uuid primary key default gen_random_uuid(),
  budget_number text not null default (
    'BUD-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  ),
  site_id uuid not null references public.sites(id) on delete restrict,
  title text not null check (length(btrim(title)) > 0),
  description text not null default '',
  status public.ops_project_budget_status not null default 'draft',
  currency_code text not null default 'ZMW' check (currency_code ~ '^[A-Z]{3}$'),
  contingency_amount numeric(14, 2) not null default 0 check (contingency_amount >= 0),
  effective_from date not null default current_date,
  active_at timestamptz,
  active_by uuid references public.users(id) on delete set null,
  locked_at timestamptz,
  locked_by uuid references public.users(id) on delete set null,
  archived_at timestamptz,
  archived_by uuid references public.users(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_budget_lines (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.project_budgets(id) on delete cascade,
  line_number integer not null check (line_number > 0),
  cost_code text not null default '',
  category text not null default 'general' check (category ~ '^[a-z][a-z0-9_]*$'),
  description text not null check (length(btrim(description)) > 0),
  budgeted_amount numeric(14, 2) not null default 0 check (budgeted_amount >= 0),
  notes text not null default '',
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (budget_id, line_number)
);

create table if not exists public.payment_requests (
  id uuid primary key default gen_random_uuid(),
  request_number text not null default (
    'PAY-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  ),
  site_id uuid not null references public.sites(id) on delete restrict,
  supplier_id uuid references public.suppliers(id) on delete restrict,
  purchase_order_id uuid references public.purchase_orders(id) on delete set null,
  budget_id uuid references public.project_budgets(id) on delete set null,
  budget_line_id uuid references public.project_budget_lines(id) on delete set null,
  payment_type public.ops_payment_request_type not null default 'supplier_invoice',
  status public.ops_payment_request_status not null default 'draft',
  title text not null check (length(btrim(title)) > 0),
  description text not null default '',
  invoice_reference text not null default '',
  currency_code text not null default 'ZMW' check (currency_code ~ '^[A-Z]{3}$'),
  requested_amount numeric(14, 2) not null default 0 check (requested_amount >= 0),
  due_date date,
  requested_by uuid references public.users(id) on delete set null,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  approved_by uuid references public.users(id) on delete set null,
  rejected_at timestamptz,
  rejected_by uuid references public.users(id) on delete set null,
  paid_at timestamptz,
  paid_by uuid references public.users(id) on delete set null,
  cancelled_at timestamptz,
  cancelled_by uuid references public.users(id) on delete set null,
  approval_request_id uuid references public.approval_requests(id) on delete set null,
  payment_reference text not null default '',
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_request_items (
  id uuid primary key default gen_random_uuid(),
  payment_request_id uuid not null references public.payment_requests(id) on delete cascade,
  budget_line_id uuid references public.project_budget_lines(id) on delete set null,
  line_number integer not null check (line_number > 0),
  description text not null check (length(btrim(description)) > 0),
  quantity numeric(12, 2) not null default 1 check (quantity > 0),
  unit_cost numeric(12, 2) not null default 0 check (unit_cost >= 0),
  line_total numeric(14, 2) generated always as (quantity * unit_cost) stored,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (payment_request_id, line_number)
);

create table if not exists public.project_cost_entries (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete restrict,
  budget_id uuid references public.project_budgets(id) on delete set null,
  budget_line_id uuid references public.project_budget_lines(id) on delete set null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  purchase_order_id uuid references public.purchase_orders(id) on delete set null,
  payment_request_id uuid references public.payment_requests(id) on delete set null,
  source_table text not null check (source_table ~ '^[a-z][a-z0-9_]*$'),
  source_id uuid not null,
  cost_type text not null default 'general' check (cost_type ~ '^[a-z][a-z0-9_]*$'),
  description text not null default '',
  amount numeric(14, 2) not null check (amount >= 0),
  currency_code text not null default 'ZMW' check (currency_code ~ '^[A-Z]{3}$'),
  cost_date date not null default current_date,
  status public.ops_project_cost_entry_status not null default 'committed',
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists project_budgets_number_unique
  on public.project_budgets(budget_number);
create index if not exists project_budgets_site_status_idx
  on public.project_budgets(site_id, status, effective_from desc);
create index if not exists project_budget_lines_budget_idx
  on public.project_budget_lines(budget_id, line_number);
create index if not exists project_budget_lines_category_idx
  on public.project_budget_lines(category, cost_code);

create unique index if not exists payment_requests_number_unique
  on public.payment_requests(request_number);
create index if not exists payment_requests_status_due_idx
  on public.payment_requests(status, due_date, created_at desc);
create index if not exists payment_requests_site_status_idx
  on public.payment_requests(site_id, status, created_at desc);
create index if not exists payment_requests_supplier_idx
  on public.payment_requests(supplier_id, status, created_at desc)
  where supplier_id is not null;
create index if not exists payment_requests_po_idx
  on public.payment_requests(purchase_order_id, created_at desc)
  where purchase_order_id is not null;
create index if not exists payment_request_items_request_idx
  on public.payment_request_items(payment_request_id, line_number);

create index if not exists project_cost_entries_site_status_idx
  on public.project_cost_entries(site_id, status, cost_date desc);
create index if not exists project_cost_entries_budget_line_idx
  on public.project_cost_entries(budget_line_id, status, cost_date desc)
  where budget_line_id is not null;
create index if not exists project_cost_entries_source_idx
  on public.project_cost_entries(source_table, source_id);
create unique index if not exists project_cost_entries_payment_request_unique
  on public.project_cost_entries(payment_request_id)
  where payment_request_id is not null;

create or replace function private.can_access_finance_bridge()
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
        'procurement_manager',
        'quantity_surveyor',
        'procurement',
        'finance_manager',
        'accountant'
      ),
      false
    )
$$;

grant execute on function private.can_access_finance_bridge() to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'project_budgets',
    'project_budget_lines',
    'payment_requests',
    'payment_request_items',
    'project_cost_entries'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', table_name);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function private.set_updated_at()',
      table_name
    );
  end loop;
end $$;

alter table public.project_budgets enable row level security;
alter table public.project_budget_lines enable row level security;
alter table public.payment_requests enable row level security;
alter table public.payment_request_items enable row level security;
alter table public.project_cost_entries enable row level security;

grant select on public.project_budgets to authenticated;
grant select on public.project_budget_lines to authenticated;
grant select on public.payment_requests to authenticated;
grant select on public.payment_request_items to authenticated;
grant select on public.project_cost_entries to authenticated;
grant all on public.project_budgets to service_role;
grant all on public.project_budget_lines to service_role;
grant all on public.payment_requests to service_role;
grant all on public.payment_request_items to service_role;
grant all on public.project_cost_entries to service_role;

drop policy if exists project_budgets_select_ops on public.project_budgets;
create policy project_budgets_select_ops
on public.project_budgets
for select
to authenticated
using (private.can_access_finance_bridge());

drop policy if exists project_budget_lines_select_ops on public.project_budget_lines;
create policy project_budget_lines_select_ops
on public.project_budget_lines
for select
to authenticated
using (
  exists (
    select 1
    from public.project_budgets as budget
    where budget.id = project_budget_lines.budget_id
      and private.can_access_finance_bridge()
  )
);

drop policy if exists payment_requests_select_ops on public.payment_requests;
create policy payment_requests_select_ops
on public.payment_requests
for select
to authenticated
using (private.can_access_finance_bridge());

drop policy if exists payment_request_items_select_ops on public.payment_request_items;
create policy payment_request_items_select_ops
on public.payment_request_items
for select
to authenticated
using (
  exists (
    select 1
    from public.payment_requests as payment_request
    where payment_request.id = payment_request_items.payment_request_id
      and private.can_access_finance_bridge()
  )
);

drop policy if exists project_cost_entries_select_ops on public.project_cost_entries;
create policy project_cost_entries_select_ops
on public.project_cost_entries
for select
to authenticated
using (private.can_access_finance_bridge());
