do $$
begin
  if not exists (select 1 from pg_type where typname = 'ops_supplier_performance_event_type') then
    create type public.ops_supplier_performance_event_type as enum (
      'delivery',
      'quality',
      'commercial',
      'safety',
      'communication',
      'compliance',
      'general'
    );
  end if;
end $$;

create table if not exists public.supplier_performance_events (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  site_id uuid references public.sites(id) on delete set null,
  event_type public.ops_supplier_performance_event_type not null default 'general',
  rating smallint not null check (rating between 1 and 5),
  title text not null check (length(btrim(title)) > 0),
  description text not null default '',
  event_date date not null default current_date,
  source_table text check (source_table is null or source_table ~ '^[a-z][a-z0-9_]*$'),
  source_id uuid,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (source_table is null and source_id is null)
    or (source_table is not null and source_id is not null)
  )
);

create index if not exists supplier_performance_events_supplier_idx
  on public.supplier_performance_events(supplier_id, event_date desc, created_at desc);
create index if not exists supplier_performance_events_site_idx
  on public.supplier_performance_events(site_id, event_date desc)
  where site_id is not null;
create index if not exists supplier_performance_events_type_rating_idx
  on public.supplier_performance_events(event_type, rating, event_date desc);

drop trigger if exists set_updated_at on public.supplier_performance_events;
create trigger set_updated_at
before update on public.supplier_performance_events
for each row execute function private.set_updated_at();

alter table public.supplier_performance_events enable row level security;

grant select on public.supplier_performance_events to authenticated;
grant all on public.supplier_performance_events to service_role;

drop policy if exists supplier_performance_events_select_ops on public.supplier_performance_events;
create policy supplier_performance_events_select_ops
on public.supplier_performance_events
for select
to authenticated
using (
  exists (
    select 1
    from public.suppliers as supplier
    where supplier.id = supplier_performance_events.supplier_id
      and private.can_access_supplier_register()
  )
);
