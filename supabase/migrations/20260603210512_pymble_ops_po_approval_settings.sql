alter type public.ops_purchase_order_status
  add value if not exists 'rejected';

alter table public.purchase_orders
  add column if not exists approval_request_id uuid references public.approval_requests(id) on delete set null,
  add column if not exists submitted_at timestamptz,
  add column if not exists approved_by uuid references public.users(id) on delete set null,
  add column if not exists issued_by uuid references public.users(id) on delete set null;

create table if not exists public.approval_workflow_settings (
  id uuid primary key default gen_random_uuid(),
  workflow_key text not null unique check (workflow_key ~ '^[a-z][a-z0-9_]*$'),
  module_key text not null check (module_key ~ '^[a-z][a-z0-9_]*$'),
  title text not null check (length(btrim(title)) > 0),
  description text not null default '',
  currency_code text not null default 'ZMW' check (currency_code ~ '^[A-Z]{3}$'),
  threshold_amount numeric(14, 2) not null default 0 check (threshold_amount >= 0),
  threshold_enabled boolean not null default true,
  first_step_role public.ops_user_role not null,
  second_step_role public.ops_user_role,
  threshold_step_role public.ops_user_role,
  is_active boolean not null default true,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not threshold_enabled or threshold_step_role is not null)
);

insert into public.approval_workflow_settings (
  workflow_key,
  module_key,
  title,
  description,
  currency_code,
  threshold_amount,
  threshold_enabled,
  first_step_role,
  second_step_role,
  threshold_step_role,
  is_active
)
values (
  'purchase_order',
  'rfq_po',
  'Purchase order approval',
  'Controls the approval chain before purchase orders can be issued.',
  'ZMW',
  50000,
  true,
  'procurement_manager',
  'finance_manager',
  'managing_director',
  true
)
on conflict (workflow_key) do nothing;

create index if not exists purchase_orders_approval_request_idx
  on public.purchase_orders(approval_request_id)
  where approval_request_id is not null;

create index if not exists approval_workflow_settings_module_idx
  on public.approval_workflow_settings(module_key, is_active);

drop trigger if exists set_updated_at on public.approval_workflow_settings;
create trigger set_updated_at
before update on public.approval_workflow_settings
for each row execute function private.set_updated_at();

alter table public.approval_workflow_settings enable row level security;

grant select on public.approval_workflow_settings to authenticated;
grant all on public.approval_workflow_settings to service_role;

drop policy if exists approval_workflow_settings_select_ops on public.approval_workflow_settings;
create policy approval_workflow_settings_select_ops
on public.approval_workflow_settings
for select
to authenticated
using (private.is_active_ops_user());
