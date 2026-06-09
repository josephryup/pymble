do $$
begin
  if not exists (select 1 from pg_type where typname = 'ops_delivery_exception_status') then
    create type public.ops_delivery_exception_status as enum (
      'open',
      'investigating',
      'resolved',
      'closed',
      'cancelled'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'ops_delivery_exception_type') then
    create type public.ops_delivery_exception_type as enum (
      'late_delivery',
      'short_delivery',
      'over_delivery',
      'damaged_goods',
      'wrong_item',
      'quality_rejection',
      'missing_document',
      'other'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'ops_delivery_exception_severity') then
    create type public.ops_delivery_exception_severity as enum (
      'low',
      'medium',
      'high',
      'critical'
    );
  end if;
end $$;

create table if not exists public.delivery_exceptions (
  id uuid primary key default gen_random_uuid(),
  exception_number text not null default (
    'DEX-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  ),
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  site_id uuid not null references public.sites(id) on delete restrict,
  purchase_order_id uuid references public.purchase_orders(id) on delete set null,
  goods_received_note_id uuid references public.goods_received_notes(id) on delete set null,
  exception_type public.ops_delivery_exception_type not null default 'other',
  severity public.ops_delivery_exception_severity not null default 'medium',
  status public.ops_delivery_exception_status not null default 'open',
  title text not null check (length(btrim(title)) > 0),
  description text not null default '',
  delivery_reference text not null default '',
  reported_at date not null default current_date,
  due_at date,
  reported_by uuid references public.users(id) on delete set null,
  assigned_to uuid references public.users(id) on delete set null,
  resolution_summary text not null default '',
  supplier_performance_event_id uuid references public.supplier_performance_events(id) on delete set null,
  resolved_at timestamptz,
  resolved_by uuid references public.users(id) on delete set null,
  closed_at timestamptz,
  closed_by uuid references public.users(id) on delete set null,
  cancelled_at timestamptz,
  cancelled_by uuid references public.users(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (due_at is null or due_at >= reported_at),
  check (
    (status <> 'resolved' or resolved_at is not null)
    and (status <> 'closed' or closed_at is not null)
    and (status <> 'cancelled' or cancelled_at is not null)
  )
);

create unique index if not exists delivery_exceptions_number_unique
  on public.delivery_exceptions(exception_number);
create index if not exists delivery_exceptions_status_severity_idx
  on public.delivery_exceptions(status, severity, reported_at desc);
create index if not exists delivery_exceptions_supplier_idx
  on public.delivery_exceptions(supplier_id, reported_at desc);
create index if not exists delivery_exceptions_site_idx
  on public.delivery_exceptions(site_id, reported_at desc);
create index if not exists delivery_exceptions_grn_idx
  on public.delivery_exceptions(goods_received_note_id)
  where goods_received_note_id is not null;
create index if not exists delivery_exceptions_po_idx
  on public.delivery_exceptions(purchase_order_id)
  where purchase_order_id is not null;

drop trigger if exists set_updated_at on public.delivery_exceptions;
create trigger set_updated_at
before update on public.delivery_exceptions
for each row execute function private.set_updated_at();

create or replace function private.can_access_delivery_exceptions()
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
        'procurement_assistant',
        'finance_manager',
        'accountant',
        'engineer',
        'supervisor'
      ),
      false
    )
$$;

grant execute on function private.can_access_delivery_exceptions() to authenticated;

alter table public.delivery_exceptions enable row level security;

grant select on public.delivery_exceptions to authenticated;
grant all on public.delivery_exceptions to service_role;

drop policy if exists delivery_exceptions_select_ops on public.delivery_exceptions;
create policy delivery_exceptions_select_ops
on public.delivery_exceptions
for select
to authenticated
using (private.can_access_delivery_exceptions());
