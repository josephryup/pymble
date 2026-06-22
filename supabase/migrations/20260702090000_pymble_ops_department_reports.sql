-- Sprint 16: department reporting + hierarchical escalation.
--
-- Department heads (Ops Mgr, Eng Mgr, Proj Mgr, Proc Mgr, Finance Mgr,
-- HSE Officer, HR head, QS) periodically submit a department report
-- (weekly / monthly / quarterly). The report routes up to MD + GM for
-- review. Reports DO NOT leak across departments — only the submitting
-- department, leadership (MD/GM/Owner/Developer), and reviewers can see them.
--
-- Lifecycle:
--   draft -> submitted -> under_review -> acknowledged | revision_requested
--   revision_requested -> draft (back to head, re-submit)

do $$
begin
  if not exists (select 1 from pg_type where typname = 'ops_department_report_period') then
    create type public.ops_department_report_period as enum (
      'weekly',
      'monthly',
      'quarterly',
      'ad_hoc'
    );
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'ops_department_report_status') then
    create type public.ops_department_report_status as enum (
      'draft',
      'submitted',
      'under_review',
      'acknowledged',
      'revision_requested'
    );
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'ops_department_key') then
    create type public.ops_department_key as enum (
      'operations',
      'engineering',
      'procurement',
      'finance',
      'commercial',
      'hse',
      'hr',
      'executive'
    );
  end if;
end$$;

create table if not exists public.department_reports (
  id uuid primary key default gen_random_uuid(),
  department public.ops_department_key not null,
  period public.ops_department_report_period not null,
  period_start_date date not null,
  period_end_date date not null,
  title text not null,
  narrative text not null default '',
  metrics jsonb not null default '{}'::jsonb,
  status public.ops_department_report_status not null default 'draft',
  submitted_at timestamptz,
  submitted_by uuid references public.users(id),
  reviewed_at timestamptz,
  reviewed_by uuid references public.users(id),
  review_notes text not null default '',
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.users(id),
  check (period_end_date >= period_start_date)
);

create index if not exists department_reports_dept_idx
  on public.department_reports (department, period_end_date desc)
  where archived_at is null;
create index if not exists department_reports_status_idx
  on public.department_reports (status, period_end_date desc)
  where archived_at is null;

drop trigger if exists department_reports_set_updated_at on public.department_reports;
create trigger department_reports_set_updated_at
  before update on public.department_reports
  for each row execute function private.set_updated_at();

alter table public.department_reports enable row level security;

drop policy if exists "department_reports_service_role_all" on public.department_reports;
create policy "department_reports_service_role_all"
  on public.department_reports
  for all
  to anon, authenticated
  using (false) with check (false);

do $$
begin
  begin
    execute 'alter publication supabase_realtime add table public.department_reports';
  exception when duplicate_object then null;
  end;
end$$;
