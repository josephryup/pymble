-- Client quotations.
--
-- A standalone priced offer to a client: free-text client details (deliberately
-- not linked to the customers register), measured lines, VAT, and a PDF export.
-- It does not convert into an invoice — that link was considered and explicitly
-- deferred, so nothing here references invoices or customers.
--
-- Authoring is open to leadership, accounts, HR and procurement per the agreed
-- role list (see src/lib/ops/quotation-permissions.ts, which is the source of
-- truth for the application; the RLS predicate below mirrors it).

do $$
begin
  if not exists (select 1 from pg_type where typname = 'ops_quotation_status') then
    create type public.ops_quotation_status as enum (
      'draft',
      'sent',
      'accepted',
      'declined',
      'expired'
    );
  end if;
end
$$;

create table if not exists public.quotations (
  id uuid primary key default gen_random_uuid(),
  quotation_number text not null default (
    'QUO-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  ),
  title text not null check (length(btrim(title)) > 0),
  -- Client details are captured on the quotation itself. A quotation is a
  -- point-in-time offer, so it keeps the details as quoted even if the client's
  -- records change later.
  client_name text not null check (length(btrim(client_name)) > 0),
  client_contact text not null default '',
  client_email text not null default '',
  client_phone text not null default '',
  client_address text not null default '',
  client_tpin text not null default '',
  status public.ops_quotation_status not null default 'draft',
  currency_code text not null default 'ZMW' check (currency_code ~ '^[A-Z]{3}$'),
  vat_rate numeric(5, 2) not null default 16 check (vat_rate >= 0 and vat_rate <= 100),
  issued_on date not null default current_date,
  valid_until date,
  scope_summary text not null default '',
  terms text not null default '',
  notes text not null default '',
  sent_at timestamptz,
  accepted_at timestamptz,
  declined_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  archived_at timestamptz,
  archived_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quotation_items (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references public.quotations(id) on delete cascade,
  line_number integer not null check (line_number > 0),
  description text not null check (length(btrim(description)) > 0),
  specification text not null default '',
  unit text not null default 'each' check (length(btrim(unit)) > 0),
  quantity numeric(12, 2) not null default 1 check (quantity >= 0),
  unit_rate numeric(14, 2) not null default 0 check (unit_rate >= 0),
  line_total numeric(14, 2) generated always as (quantity * unit_rate) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (quotation_id, line_number)
);

create unique index if not exists quotations_number_unique
  on public.quotations (quotation_number);
create index if not exists quotations_status_created_idx
  on public.quotations (status, created_at desc);
create index if not exists quotations_client_idx
  on public.quotations (client_name);
create index if not exists quotation_items_quotation_idx
  on public.quotation_items (quotation_id, line_number);

comment on table public.quotations is
  'Standalone client quotations. Deliberately not linked to customers or invoices.';
comment on column public.quotations.vat_rate is
  'VAT percentage applied to the line subtotal on this quotation, captured as quoted.';
comment on table public.quotation_items is
  'Priced lines on a quotation. line_total is generated as quantity * unit_rate.';

-- Who may see and author quotations: leadership + accounts + HR + procurement.
create or replace function private.can_access_quotations()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select private.is_active_ops_user()
    and coalesce(
      private.current_user_role()::text in (
        -- Leadership
        'developer',
        'managing_director',
        'general_manager',
        'owner',
        'manager',
        -- Accounts
        'finance_manager',
        'accountant',
        -- Human resources
        'human_resource',
        'hr',
        -- Procurement
        'procurement_manager',
        'procurement',
        'procurement_assistant'
      ),
      false
    )
$$;

grant execute on function private.can_access_quotations() to authenticated;

drop trigger if exists set_updated_at on public.quotations;
create trigger set_updated_at before update on public.quotations
  for each row execute function private.set_updated_at();

drop trigger if exists set_updated_at on public.quotation_items;
create trigger set_updated_at before update on public.quotation_items
  for each row execute function private.set_updated_at();

alter table public.quotations enable row level security;
alter table public.quotation_items enable row level security;

grant select on public.quotations to authenticated;
grant select on public.quotation_items to authenticated;
grant all on public.quotations to service_role;
grant all on public.quotation_items to service_role;

drop policy if exists quotations_select_ops on public.quotations;
create policy quotations_select_ops
on public.quotations
for select
to authenticated
using (private.can_access_quotations());

drop policy if exists quotation_items_select_ops on public.quotation_items;
create policy quotation_items_select_ops
on public.quotation_items
for select
to authenticated
using (private.can_access_quotations());
