do $$
begin
  if not exists (select 1 from pg_type where typname = 'ops_employee_document_status') then
    create type public.ops_employee_document_status as enum (
      'submitted',
      'accepted',
      'rejected',
      'expired',
      'archived'
    );
  end if;
end $$;

create table if not exists public.employee_documents (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  category_id uuid not null references public.hr_document_categories(id) on delete restrict,
  document_id uuid not null references public.documents(id) on delete cascade,
  document_version_id uuid references public.document_versions(id) on delete set null,
  status public.ops_employee_document_status not null default 'submitted',
  expiry_date date,
  review_notes text not null default '',
  uploaded_by uuid references public.users(id) on delete set null,
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists employee_documents_employee_category_idx
  on public.employee_documents(employee_id, category_id, status, created_at desc);
create index if not exists employee_documents_document_idx
  on public.employee_documents(document_id, document_version_id);
create index if not exists employee_documents_review_idx
  on public.employee_documents(status, expiry_date, created_at desc)
  where status <> 'archived';

create or replace function private.can_access_employee_document(target_employee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (
      private.is_active_ops_user()
      and coalesce(
        private.current_user_role()::text in (
          'developer',
          'managing_director',
          'general_manager',
          'owner',
          'manager',
          'human_resource',
          'hr'
        ),
        false
      )
    )
    or exists (
      select 1
      from public.employees as employee
      where employee.id = target_employee_id
        and employee.user_id = auth.uid()
    )
$$;

grant execute on function private.can_access_employee_document(uuid) to authenticated;

drop trigger if exists set_updated_at on public.employee_documents;
create trigger set_updated_at
before update on public.employee_documents
for each row execute function private.set_updated_at();

alter table public.employee_documents enable row level security;

grant select on public.employee_documents to authenticated;
grant all on public.employee_documents to service_role;

drop policy if exists employee_documents_select_ops on public.employee_documents;
create policy employee_documents_select_ops
on public.employee_documents
for select
to authenticated
using (private.can_access_employee_document(employee_id));
