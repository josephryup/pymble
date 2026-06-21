-- Sprint 11: archive policy for high-cardinality append-only tables.
--
-- audit_events and notifications grow forever otherwise. Move rows older
-- than retention into archive tables that live in the same schema so
-- historical queries still work, but the hot tables stay small.
--
-- Defaults: audit_events archive after 365 days, notifications after 180.
-- Override by passing a different `p_older_than_days` to either function.
-- Notifications only archive once they've been read or archived by the user
-- so the inbox stays intact.

create table if not exists public.audit_events_archive (
  id uuid primary key,
  actor_user_id uuid,
  action text,
  entity_type text,
  entity_id uuid,
  metadata jsonb,
  created_at timestamptz,
  module_key text,
  source_table text,
  source_id uuid,
  summary text,
  archived_at timestamptz not null default now()
);

create index if not exists audit_events_archive_created_at_idx
  on public.audit_events_archive (created_at);
create index if not exists audit_events_archive_module_key_idx
  on public.audit_events_archive (module_key);

alter table public.audit_events_archive enable row level security;
create policy "audit_events_archive_no_anon"
  on public.audit_events_archive for all
  to anon, authenticated
  using (false) with check (false);

create table if not exists public.notifications_archive (
  id uuid primary key,
  recipient_id uuid,
  title text,
  body text,
  action_href text,
  source_table text,
  source_id uuid,
  module_key text,
  status text,
  created_at timestamptz,
  read_at timestamptz,
  archived_at timestamptz not null default now()
);

create index if not exists notifications_archive_recipient_id_idx
  on public.notifications_archive (recipient_id);
create index if not exists notifications_archive_created_at_idx
  on public.notifications_archive (created_at);

alter table public.notifications_archive enable row level security;
create policy "notifications_archive_no_anon"
  on public.notifications_archive for all
  to anon, authenticated
  using (false) with check (false);

create or replace function public.ops_archive_audit_events(
  p_older_than_days integer default 365
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cutoff timestamptz := now() - (p_older_than_days || ' days')::interval;
  v_moved integer;
begin
  with moved as (
    delete from public.audit_events
    where created_at < v_cutoff
    returning *
  )
  insert into public.audit_events_archive (
    id, actor_user_id, action, entity_type, entity_id, metadata,
    created_at, module_key, source_table, source_id, summary
  )
  select
    id, actor_user_id, action, entity_type, entity_id, metadata,
    created_at, module_key, source_table, source_id, summary
  from moved;

  get diagnostics v_moved = row_count;
  return v_moved;
end;
$$;

grant execute on function public.ops_archive_audit_events(integer) to service_role;

create or replace function public.ops_archive_notifications(
  p_older_than_days integer default 180
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cutoff timestamptz := now() - (p_older_than_days || ' days')::interval;
  v_moved integer;
begin
  with moved as (
    delete from public.notifications
    where created_at < v_cutoff
      and status in ('read', 'archived')
    returning *
  )
  insert into public.notifications_archive (
    id, recipient_id, title, body, action_href,
    source_table, source_id, module_key, status,
    created_at, read_at
  )
  select
    id, recipient_id, title, body, action_href,
    source_table, source_id, module_key, status,
    created_at, read_at
  from moved;

  get diagnostics v_moved = row_count;
  return v_moved;
end;
$$;

grant execute on function public.ops_archive_notifications(integer) to service_role;
