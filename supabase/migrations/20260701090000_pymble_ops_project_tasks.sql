-- Sprint 15: project schedule + progress tracker.
--
-- Each construction site has an ordered list of tasks. Each task has planned
-- start/end dates, an optional assigned engineer, a status, and a 0–100
-- completion percent. Site-level progress rolls up from task completion.
--
-- Overdue = planned_end_date < today AND status NOT IN (completed, cancelled).

do $$
begin
  if not exists (select 1 from pg_type where typname = 'ops_project_task_status') then
    create type public.ops_project_task_status as enum (
      'planned',
      'in_progress',
      'completed',
      'blocked',
      'cancelled'
    );
  end if;
end$$;

create table if not exists public.project_tasks (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  parent_task_id uuid references public.project_tasks(id) on delete cascade,
  title text not null,
  description text not null default '',
  status public.ops_project_task_status not null default 'planned',
  planned_start_date date not null,
  planned_end_date date not null,
  actual_start_date date,
  actual_end_date date,
  completion_percent smallint not null default 0
    check (completion_percent >= 0 and completion_percent <= 100),
  assigned_to uuid references public.users(id),
  sort_order integer not null default 0,
  notes text not null default '',
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.users(id)
);

create index if not exists project_tasks_site_id_idx
  on public.project_tasks (site_id) where archived_at is null;
create index if not exists project_tasks_assigned_to_idx
  on public.project_tasks (assigned_to) where archived_at is null;
create index if not exists project_tasks_planned_end_date_idx
  on public.project_tasks (planned_end_date)
  where archived_at is null and status not in ('completed', 'cancelled');

drop trigger if exists project_tasks_set_updated_at on public.project_tasks;
create trigger project_tasks_set_updated_at
  before update on public.project_tasks
  for each row execute function private.set_updated_at();

alter table public.project_tasks enable row level security;

drop policy if exists "project_tasks_service_role_all" on public.project_tasks;
create policy "project_tasks_service_role_all"
  on public.project_tasks
  for all
  to anon, authenticated
  using (false) with check (false);

do $$
begin
  begin
    execute 'alter publication supabase_realtime add table public.project_tasks';
  exception when duplicate_object then null;
  end;
end$$;
