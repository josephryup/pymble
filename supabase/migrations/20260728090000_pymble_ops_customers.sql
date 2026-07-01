-- Phase 13d: Customers master.
--
-- Closes a real accounts-receivable gap: invoices have only ever carried a
-- free-text client_name, so there has been no customer entity to run AR
-- control, credit limits, or customer statements against. This migration adds
-- a customers register (mirrors the suppliers register's shape) and an
-- optional customer_id link on invoices. Existing invoices are untouched —
-- client_name/tpin remain the display fields; customer_id is populated going
-- forward when an invoice is raised against a known customer.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'ops_customer_status') then
    create type public.ops_customer_status as enum ('active', 'archived');
  end if;
end $$;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  customer_code text not null default (
    'CUS-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  ),
  legal_name text not null check (length(btrim(legal_name)) > 0),
  trading_name text not null default '',
  status public.ops_customer_status not null default 'active',
  tpin text not null default '',
  email text not null default '',
  phone text not null default '',
  address_line text not null default '',
  city text not null default '',
  country text not null default 'Zambia',
  notes text not null default '',
  created_by uuid references public.users(id) on delete set null,
  archived_at timestamptz,
  archived_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists customers_customer_code_unique
  on public.customers(customer_code);
create index if not exists customers_status_idx
  on public.customers(status, created_at desc);
create index if not exists customers_name_lookup_idx
  on public.customers(lower(legal_name), lower(trading_name));

alter table public.invoices
  add column if not exists customer_id uuid references public.customers(id) on delete set null;
create index if not exists invoices_customer_idx
  on public.invoices(customer_id)
  where customer_id is not null;

create or replace function private.can_access_customer_register()
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
        'finance_manager',
        'accountant',
        'quantity_surveyor'
      ),
      false
    )
$$;

grant execute on function private.can_access_customer_register() to authenticated;

drop trigger if exists set_updated_at on public.customers;
create trigger set_updated_at before update on public.customers
  for each row execute function private.set_updated_at();

alter table public.customers enable row level security;

grant select on public.customers to authenticated;
grant all on public.customers to service_role;

drop policy if exists customers_select_ops on public.customers;
create policy customers_select_ops
on public.customers
for select
to authenticated
using (private.can_access_customer_register());
