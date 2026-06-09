do $$
begin
  if not exists (select 1 from pg_type where typname = 'ops_employee_onboarding_status') then
    create type public.ops_employee_onboarding_status as enum (
      'pending',
      'in_progress',
      'completed',
      'waived',
      'cancelled'
    );
  end if;
end $$;

create table if not exists public.employee_onboarding_items (
  id uuid primary key default gen_random_uuid(),
  item_number text not null default (
    'ONB-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  ),
  employee_id uuid not null references public.employees(id) on delete cascade,
  category text not null default 'general' check (category ~ '^[a-z][a-z0-9_]*$'),
  title text not null check (length(btrim(title)) > 0),
  description text not null default '',
  owner_user_id uuid references public.users(id) on delete set null,
  due_date date,
  status public.ops_employee_onboarding_status not null default 'pending',
  completion_notes text not null default '',
  completed_at timestamptz,
  completed_by uuid references public.users(id) on delete set null,
  waived_at timestamptz,
  waived_by uuid references public.users(id) on delete set null,
  cancelled_at timestamptz,
  cancelled_by uuid references public.users(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists employee_onboarding_items_number_unique
  on public.employee_onboarding_items(item_number);
create index if not exists employee_onboarding_items_employee_status_idx
  on public.employee_onboarding_items(employee_id, status, due_date, created_at desc);
create index if not exists employee_onboarding_items_owner_status_idx
  on public.employee_onboarding_items(owner_user_id, status, due_date)
  where owner_user_id is not null;
create index if not exists employee_onboarding_items_due_idx
  on public.employee_onboarding_items(status, due_date)
  where due_date is not null;

drop trigger if exists set_updated_at on public.employee_onboarding_items;
create trigger set_updated_at
before update on public.employee_onboarding_items
for each row execute function private.set_updated_at();

alter table public.employee_onboarding_items enable row level security;

grant select on public.employee_onboarding_items to authenticated;
grant all on public.employee_onboarding_items to service_role;

drop policy if exists employee_onboarding_items_select_ops on public.employee_onboarding_items;
create policy employee_onboarding_items_select_ops
on public.employee_onboarding_items
for select
to authenticated
using (private.can_access_hr_maturity());
