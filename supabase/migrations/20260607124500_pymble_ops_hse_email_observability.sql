do $$
begin
  if not exists (select 1 from pg_type where typname = 'ops_email_delivery_status') then
    create type public.ops_email_delivery_status as enum (
      'sent',
      'failed',
      'skipped'
    );
  end if;
end $$;

create table if not exists public.ops_email_delivery_events (
  id uuid primary key default gen_random_uuid(),
  module_key text not null default 'ops' check (module_key ~ '^[a-z][a-z0-9_]*$'),
  delivery_type text not null default 'hse_critical_alert' check (delivery_type ~ '^[a-z][a-z0-9_]*$'),
  provider text not null default 'resend' check (provider ~ '^[a-z][a-z0-9_]*$'),
  status public.ops_email_delivery_status not null,
  reason text not null default '',
  idempotency_key text,
  recipient_id uuid references public.users(id) on delete set null,
  recipient_role public.ops_user_role,
  recipient_email text not null default '' check (length(recipient_email) <= 320),
  recipient_name text not null default '' check (length(recipient_name) <= 160),
  source_table text check (source_table is null or source_table ~ '^[a-z][a-z0-9_]*$'),
  source_id uuid,
  action_href text check (action_href is null or action_href like '/ops%'),
  provider_message_id text,
  error_code text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  attempted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ops_email_delivery_events_idempotency_unique
  on public.ops_email_delivery_events(idempotency_key)
  where idempotency_key is not null;
create index if not exists ops_email_delivery_events_status_attempted_idx
  on public.ops_email_delivery_events(status, attempted_at desc);
create index if not exists ops_email_delivery_events_module_attempted_idx
  on public.ops_email_delivery_events(module_key, delivery_type, attempted_at desc);
create index if not exists ops_email_delivery_events_source_idx
  on public.ops_email_delivery_events(source_table, source_id, attempted_at desc)
  where source_table is not null and source_id is not null;
create index if not exists ops_email_delivery_events_recipient_idx
  on public.ops_email_delivery_events(recipient_id, attempted_at desc)
  where recipient_id is not null;

drop trigger if exists set_updated_at on public.ops_email_delivery_events;
create trigger set_updated_at
before update on public.ops_email_delivery_events
for each row execute function private.set_updated_at();

alter table public.ops_email_delivery_events enable row level security;

grant select on public.ops_email_delivery_events to authenticated;
grant all on public.ops_email_delivery_events to service_role;

drop policy if exists ops_email_delivery_events_select_hse_leadership on public.ops_email_delivery_events;
create policy ops_email_delivery_events_select_hse_leadership
on public.ops_email_delivery_events
for select
to authenticated
using (
  private.is_ops_admin()
  or private.current_user_role()::text in (
    'operations_manager',
    'projects_manager',
    'hse_officer',
    'hse_assistant_officer'
  )
);
