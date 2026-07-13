-- Pymble Operations — intern roles and explicit user-to-site assignment.
--
-- Interns must never inherit Engineer or Accountant access. This migration
-- creates distinct roles plus the site-assignment source of truth required for
-- server-side and RLS-scoped Engineering Intern permissions.

alter type public.ops_user_role add value if not exists 'accountant_intern' after 'accountant';
alter type public.ops_user_role add value if not exists 'engineering_intern' after 'engineer';

create table if not exists public.user_site_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  supervisor_user_id uuid references public.users(id) on delete set null,
  assigned_by uuid references public.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  unassigned_at timestamptz,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (unassigned_at is null or unassigned_at >= assigned_at)
);

create unique index if not exists user_site_assignments_active_unique
  on public.user_site_assignments(user_id, site_id)
  where unassigned_at is null;

create index if not exists user_site_assignments_active_user_idx
  on public.user_site_assignments(user_id, site_id)
  where unassigned_at is null;

create index if not exists user_site_assignments_active_site_idx
  on public.user_site_assignments(site_id, user_id)
  where unassigned_at is null;

alter table public.user_site_assignments enable row level security;

drop policy if exists user_site_assignments_select on public.user_site_assignments;
create policy user_site_assignments_select
on public.user_site_assignments for select to authenticated
using (
  user_id = auth.uid()
  or private.current_user_role() in (
    'developer', 'managing_director', 'general_manager', 'owner',
    'operations_manager', 'projects_manager', 'engineering_manager'
  )
);

drop policy if exists user_site_assignments_manage on public.user_site_assignments;
create policy user_site_assignments_manage
on public.user_site_assignments for all to authenticated
using (
  private.current_user_role() in (
    'developer', 'managing_director', 'general_manager', 'owner',
    'operations_manager', 'projects_manager', 'engineering_manager'
  )
)
with check (
  private.current_user_role() in (
    'developer', 'managing_director', 'general_manager', 'owner',
    'operations_manager', 'projects_manager', 'engineering_manager'
  )
);

comment on table public.user_site_assignments is
  'Active and historical user-to-site assignments. Required for least-privilege site-scoped roles such as Engineering Intern.';
