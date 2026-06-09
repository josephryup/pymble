do $$
begin
  if not exists (select 1 from pg_type where typname = 'ops_priority') then
    create type public.ops_priority as enum ('low', 'normal', 'high', 'urgent');
  end if;

  if not exists (select 1 from pg_type where typname = 'ops_approval_status') then
    create type public.ops_approval_status as enum (
      'draft',
      'submitted',
      'in_review',
      'approved',
      'rejected',
      'cancelled',
      'closed'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'ops_approval_step_status') then
    create type public.ops_approval_step_status as enum (
      'pending',
      'approved',
      'rejected',
      'skipped',
      'cancelled'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'ops_document_status') then
    create type public.ops_document_status as enum ('active', 'superseded', 'archived');
  end if;

  if not exists (select 1 from pg_type where typname = 'ops_document_visibility') then
    create type public.ops_document_visibility as enum ('company', 'restricted', 'private');
  end if;

  if not exists (select 1 from pg_type where typname = 'ops_notification_status') then
    create type public.ops_notification_status as enum ('unread', 'read', 'archived');
  end if;
end $$;

alter table public.audit_events
  add column if not exists module_key text,
  add column if not exists source_table text,
  add column if not exists source_id uuid,
  add column if not exists summary text;

create table if not exists public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  module_key text not null check (module_key ~ '^[a-z][a-z0-9_]*$'),
  source_table text not null check (source_table ~ '^[a-z][a-z0-9_]*$'),
  source_id uuid not null,
  site_id uuid references public.sites(id) on delete set null,
  title text not null check (length(btrim(title)) > 0),
  description text not null default '',
  priority public.ops_priority not null default 'normal',
  status public.ops_approval_status not null default 'draft',
  amount numeric(14, 2) check (amount is null or amount >= 0),
  currency_code text not null default 'ZMW' check (currency_code ~ '^[A-Z]{3}$'),
  requested_by uuid references public.users(id) on delete set null,
  current_step_number integer not null default 1 check (current_step_number > 0),
  idempotency_key text,
  submitted_at timestamptz,
  resolved_at timestamptz,
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.approval_steps (
  id uuid primary key default gen_random_uuid(),
  approval_request_id uuid not null references public.approval_requests(id) on delete cascade,
  step_number integer not null check (step_number > 0),
  approver_sequence integer not null default 1 check (approver_sequence > 0),
  step_label text not null default '',
  approver_role public.ops_user_role,
  approver_user_id uuid references public.users(id) on delete set null,
  status public.ops_approval_step_status not null default 'pending',
  decision_by uuid references public.users(id) on delete set null,
  decision_at timestamptz,
  due_at timestamptz,
  comments text not null default '',
  created_at timestamptz not null default now(),
  check (approver_role is not null or approver_user_id is not null),
  unique (approval_request_id, step_number, approver_sequence)
);

create table if not exists public.approval_comments (
  id uuid primary key default gen_random_uuid(),
  approval_request_id uuid not null references public.approval_requests(id) on delete cascade,
  author_id uuid references public.users(id) on delete set null,
  body text not null check (length(btrim(body)) > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) > 0),
  description text not null default '',
  category text not null default 'general' check (category ~ '^[a-z][a-z0-9_]*$'),
  visibility public.ops_document_visibility not null default 'restricted',
  status public.ops_document_status not null default 'active',
  current_version_number integer not null default 1 check (current_version_number > 0),
  uploaded_by uuid references public.users(id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  r2_key text not null unique,
  file_name text not null,
  content_type text not null,
  file_size_bytes bigint not null check (file_size_bytes > 0),
  checksum_sha256 text,
  uploaded_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (document_id, version_number)
);

create table if not exists public.document_links (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  module_key text not null check (module_key ~ '^[a-z][a-z0-9_]*$'),
  source_table text not null check (source_table ~ '^[a-z][a-z0-9_]*$'),
  source_id uuid not null,
  site_id uuid references public.sites(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (document_id, module_key, source_table, source_id)
);

create table if not exists public.record_comments (
  id uuid primary key default gen_random_uuid(),
  module_key text not null check (module_key ~ '^[a-z][a-z0-9_]*$'),
  source_table text not null check (source_table ~ '^[a-z][a-z0-9_]*$'),
  source_id uuid not null,
  site_id uuid references public.sites(id) on delete set null,
  author_id uuid references public.users(id) on delete set null,
  body text not null check (length(btrim(body)) > 0),
  is_internal boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.users(id) on delete cascade,
  module_key text not null default 'ops' check (module_key ~ '^[a-z][a-z0-9_]*$'),
  source_table text check (source_table is null or source_table ~ '^[a-z][a-z0-9_]*$'),
  source_id uuid,
  title text not null check (length(btrim(title)) > 0),
  body text not null default '',
  status public.ops_notification_status not null default 'unread',
  action_href text check (action_href is null or action_href like '/ops%'),
  idempotency_key text,
  read_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists approval_requests_idempotency_unique
  on public.approval_requests(idempotency_key)
  where idempotency_key is not null;
create index if not exists approval_requests_source_idx
  on public.approval_requests(source_table, source_id, created_at desc);
create index if not exists approval_requests_status_due_idx
  on public.approval_requests(status, due_at, created_at desc);
create index if not exists approval_requests_requested_by_idx
  on public.approval_requests(requested_by, created_at desc);
create index if not exists approval_requests_site_idx
  on public.approval_requests(site_id, created_at desc);

create index if not exists approval_steps_request_status_idx
  on public.approval_steps(approval_request_id, status, step_number);
create index if not exists approval_steps_role_status_idx
  on public.approval_steps(approver_role, status, due_at);
create index if not exists approval_steps_user_status_idx
  on public.approval_steps(approver_user_id, status, due_at);

create index if not exists approval_comments_request_created_idx
  on public.approval_comments(approval_request_id, created_at desc);

create index if not exists documents_category_status_idx
  on public.documents(category, status, created_at desc);
create index if not exists document_versions_document_idx
  on public.document_versions(document_id, version_number desc);
create index if not exists document_links_source_idx
  on public.document_links(source_table, source_id, created_at desc);
create index if not exists document_links_site_idx
  on public.document_links(site_id, created_at desc);

create index if not exists record_comments_source_idx
  on public.record_comments(source_table, source_id, created_at desc)
  where deleted_at is null;
create index if not exists record_comments_site_idx
  on public.record_comments(site_id, created_at desc)
  where deleted_at is null;

create unique index if not exists notifications_idempotency_unique
  on public.notifications(idempotency_key)
  where idempotency_key is not null;
create index if not exists notifications_recipient_status_idx
  on public.notifications(recipient_id, status, created_at desc);
create index if not exists audit_events_module_idx
  on public.audit_events(module_key, created_at desc)
  where module_key is not null;
create index if not exists audit_events_source_idx
  on public.audit_events(source_table, source_id, created_at desc)
  where source_table is not null and source_id is not null;

create or replace function private.is_active_ops_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users
    where id = auth.uid()
      and is_active = true
  )
$$;

create or replace function private.is_ops_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    private.current_user_role()::text in (
      'developer',
      'managing_director',
      'general_manager',
      'owner',
      'manager'
    ),
    false
  )
$$;

create or replace function private.can_access_approval_request(request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.approval_requests as request
    where request.id = request_id
      and (
        private.is_ops_admin()
        or request.requested_by = auth.uid()
        or exists (
          select 1
          from public.approval_steps as step
          where step.approval_request_id = request.id
            and (
              step.approver_user_id = auth.uid()
              or step.approver_role = private.current_user_role()
            )
        )
      )
  )
$$;

create or replace function private.can_access_document(document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.documents as document
    where document.id = document_id
      and (
        private.is_ops_admin()
        or document.visibility = 'company'
        or document.uploaded_by = auth.uid()
      )
  )
$$;

grant usage on schema private to authenticated, service_role;
grant execute on function private.is_active_ops_user() to authenticated;
grant execute on function private.is_ops_admin() to authenticated;
grant execute on function private.can_access_approval_request(uuid) to authenticated;
grant execute on function private.can_access_document(uuid) to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'approval_requests',
    'documents',
    'record_comments'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', table_name);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function private.set_updated_at()',
      table_name
    );
  end loop;
end $$;

alter table public.approval_requests enable row level security;
alter table public.approval_steps enable row level security;
alter table public.approval_comments enable row level security;
alter table public.documents enable row level security;
alter table public.document_versions enable row level security;
alter table public.document_links enable row level security;
alter table public.record_comments enable row level security;
alter table public.notifications enable row level security;

grant select on public.approval_requests to authenticated;
grant select on public.approval_steps to authenticated;
grant select, insert on public.approval_comments to authenticated;
grant select on public.documents to authenticated;
grant select on public.document_versions to authenticated;
grant select on public.document_links to authenticated;
grant select, insert, update on public.record_comments to authenticated;
grant select on public.notifications to authenticated;
grant update (status, read_at, archived_at) on public.notifications to authenticated;
grant all on public.approval_requests to service_role;
grant all on public.approval_steps to service_role;
grant all on public.approval_comments to service_role;
grant all on public.documents to service_role;
grant all on public.document_versions to service_role;
grant all on public.document_links to service_role;
grant all on public.record_comments to service_role;
grant all on public.notifications to service_role;

drop policy if exists approval_requests_select_visible on public.approval_requests;
create policy approval_requests_select_visible
on public.approval_requests
for select
to authenticated
using (private.can_access_approval_request(id));

drop policy if exists approval_steps_select_visible on public.approval_steps;
create policy approval_steps_select_visible
on public.approval_steps
for select
to authenticated
using (private.can_access_approval_request(approval_request_id));

drop policy if exists approval_comments_select_visible on public.approval_comments;
create policy approval_comments_select_visible
on public.approval_comments
for select
to authenticated
using (private.can_access_approval_request(approval_request_id));

drop policy if exists approval_comments_insert_visible on public.approval_comments;
create policy approval_comments_insert_visible
on public.approval_comments
for insert
to authenticated
with check (
  author_id = auth.uid()
  and private.can_access_approval_request(approval_request_id)
);

drop policy if exists documents_select_visible on public.documents;
create policy documents_select_visible
on public.documents
for select
to authenticated
using (private.can_access_document(id));

drop policy if exists document_versions_select_visible on public.document_versions;
create policy document_versions_select_visible
on public.document_versions
for select
to authenticated
using (private.can_access_document(document_id));

drop policy if exists document_links_select_visible on public.document_links;
create policy document_links_select_visible
on public.document_links
for select
to authenticated
using (private.can_access_document(document_id));

drop policy if exists record_comments_select_ops on public.record_comments;
create policy record_comments_select_ops
on public.record_comments
for select
to authenticated
using (deleted_at is null and private.is_active_ops_user());

drop policy if exists record_comments_insert_ops on public.record_comments;
create policy record_comments_insert_ops
on public.record_comments
for insert
to authenticated
with check (
  author_id = auth.uid()
  and private.is_active_ops_user()
);

drop policy if exists record_comments_update_author_or_admin on public.record_comments;
create policy record_comments_update_author_or_admin
on public.record_comments
for update
to authenticated
using (
  author_id = auth.uid()
  or private.is_ops_admin()
)
with check (
  author_id = auth.uid()
  or private.is_ops_admin()
);

drop policy if exists notifications_select_recipient_or_admin on public.notifications;
create policy notifications_select_recipient_or_admin
on public.notifications
for select
to authenticated
using (
  recipient_id = auth.uid()
  or private.is_ops_admin()
);

drop policy if exists notifications_update_recipient_or_admin on public.notifications;
create policy notifications_update_recipient_or_admin
on public.notifications
for update
to authenticated
using (
  recipient_id = auth.uid()
  or private.is_ops_admin()
)
with check (
  recipient_id = auth.uid()
  or private.is_ops_admin()
);
