do $$
begin
  if not exists (select 1 from pg_type where typname = 'ops_fleet_operator_document_status') then
    create type public.ops_fleet_operator_document_status as enum (
      'active',
      'archived'
    );
  end if;
end $$;

create table if not exists public.fleet_operator_documents (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references public.employees(id) on delete cascade,
  worker_id uuid references public.workers(id) on delete cascade,
  document_type text not null default 'driver_license' check (document_type ~ '^[a-z][a-z0-9_]*$'),
  title text not null check (length(btrim(title)) > 0),
  reference_number text not null default '',
  status public.ops_fleet_operator_document_status not null default 'active',
  issued_at date,
  expires_at date,
  reminder_days integer not null default 30 check (reminder_days >= 0 and reminder_days <= 365),
  document_version_id uuid references public.document_versions(id) on delete set null,
  notes text not null default '',
  created_by uuid references public.users(id) on delete set null,
  archived_by uuid references public.users(id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (employee_id is not null or worker_id is not null),
  check (employee_id is null or worker_id is null),
  check (expires_at is null or issued_at is null or expires_at >= issued_at)
);

create index if not exists fleet_operator_documents_employee_expiry_idx
  on public.fleet_operator_documents(employee_id, status, expires_at)
  where employee_id is not null;
create index if not exists fleet_operator_documents_worker_expiry_idx
  on public.fleet_operator_documents(worker_id, status, expires_at)
  where worker_id is not null;
create index if not exists fleet_operator_documents_status_expiry_idx
  on public.fleet_operator_documents(status, expires_at);
create index if not exists fleet_operator_documents_document_version_idx
  on public.fleet_operator_documents(document_version_id)
  where document_version_id is not null;

drop trigger if exists set_updated_at on public.fleet_operator_documents;
create trigger set_updated_at
before update on public.fleet_operator_documents
for each row execute function private.set_updated_at();

alter table public.fleet_operator_documents enable row level security;

grant select on public.fleet_operator_documents to authenticated;
grant all on public.fleet_operator_documents to service_role;

drop policy if exists fleet_operator_documents_select_ops on public.fleet_operator_documents;
create policy fleet_operator_documents_select_ops
on public.fleet_operator_documents
for select
to authenticated
using (private.can_access_fleet_logistics());
