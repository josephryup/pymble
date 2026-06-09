do $$
begin
  if not exists (select 1 from pg_type where typname = 'ops_material_request_status') then
    create type public.ops_material_request_status as enum (
      'draft',
      'submitted',
      'in_review',
      'approved',
      'rejected',
      'cancelled',
      'ordered',
      'closed'
    );
  end if;
end $$;

create table if not exists public.material_requests (
  id uuid primary key default gen_random_uuid(),
  request_number text not null default (
    'MR-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  ),
  site_id uuid not null references public.sites(id) on delete restrict,
  requested_by uuid references public.users(id) on delete set null,
  title text not null check (length(btrim(title)) > 0),
  description text not null default '',
  priority public.ops_priority not null default 'normal',
  status public.ops_material_request_status not null default 'draft',
  needed_by date,
  approval_request_id uuid references public.approval_requests(id) on delete set null,
  submitted_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  cancelled_at timestamptz,
  ordered_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.material_request_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.material_requests(id) on delete cascade,
  line_number integer not null check (line_number > 0),
  item_name text not null check (length(btrim(item_name)) > 0),
  specification text not null default '',
  unit text not null default 'each' check (length(btrim(unit)) > 0),
  quantity numeric(12, 2) not null check (quantity > 0),
  estimated_unit_cost numeric(12, 2) not null default 0 check (estimated_unit_cost >= 0),
  estimated_total numeric(14, 2) generated always as (quantity * estimated_unit_cost) stored,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, line_number)
);

create unique index if not exists material_requests_request_number_unique
  on public.material_requests(request_number);
create index if not exists material_requests_site_status_idx
  on public.material_requests(site_id, status, created_at desc);
create index if not exists material_requests_requested_by_idx
  on public.material_requests(requested_by, created_at desc);
create index if not exists material_requests_approval_idx
  on public.material_requests(approval_request_id)
  where approval_request_id is not null;
create index if not exists material_request_items_request_idx
  on public.material_request_items(request_id, line_number);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'material_requests',
    'material_request_items'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', table_name);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function private.set_updated_at()',
      table_name
    );
  end loop;
end $$;

alter table public.material_requests enable row level security;
alter table public.material_request_items enable row level security;

grant select on public.material_requests to authenticated;
grant select on public.material_request_items to authenticated;
grant all on public.material_requests to service_role;
grant all on public.material_request_items to service_role;

drop policy if exists material_requests_select_ops on public.material_requests;
create policy material_requests_select_ops
on public.material_requests
for select
to authenticated
using (private.is_active_ops_user());

drop policy if exists material_request_items_select_ops on public.material_request_items;
create policy material_request_items_select_ops
on public.material_request_items
for select
to authenticated
using (
  exists (
    select 1
    from public.material_requests as request
    where request.id = material_request_items.request_id
      and private.is_active_ops_user()
  )
);
