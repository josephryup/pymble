do $$
begin
  if not exists (select 1 from pg_type where typname = 'ops_qa_finding_category') then
    create type public.ops_qa_finding_category as enum (
      'workmanship',
      'material',
      'design',
      'safety',
      'environmental',
      'documentation',
      'dimensional',
      'testing',
      'coordination',
      'other'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'ops_site_instruction_follow_up_status') then
    create type public.ops_site_instruction_follow_up_status as enum (
      'open',
      'in_progress',
      'closed',
      'cancelled'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'ops_site_instruction_follow_up_type') then
    create type public.ops_site_instruction_follow_up_type as enum (
      'qa_inspection',
      'snag',
      'material_test',
      'drawing_update',
      'programme_update',
      'other'
    );
  end if;
end $$;

alter table public.qa_inspection_items
  add column if not exists finding_category public.ops_qa_finding_category not null default 'other';

alter table public.drawing_register
  add column if not exists document_version_id uuid references public.document_versions(id) on delete set null;

create table if not exists public.site_instruction_follow_ups (
  id uuid primary key default gen_random_uuid(),
  instruction_id uuid not null references public.site_instructions(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete restrict,
  task_type public.ops_site_instruction_follow_up_type not null default 'other',
  status public.ops_site_instruction_follow_up_status not null default 'open',
  title text not null check (length(btrim(title)) > 0),
  description text not null default '',
  assigned_to uuid references public.users(id) on delete set null,
  due_date date,
  closed_at timestamptz,
  closed_by uuid references public.users(id) on delete set null,
  cancelled_at timestamptz,
  cancelled_by uuid references public.users(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists qa_inspection_items_finding_category_idx
  on public.qa_inspection_items(finding_category, result, action_required);

create index if not exists drawing_register_document_version_idx
  on public.drawing_register(document_version_id)
  where document_version_id is not null;

create index if not exists site_instruction_follow_ups_instruction_status_idx
  on public.site_instruction_follow_ups(instruction_id, status, due_date, created_at desc);

create index if not exists site_instruction_follow_ups_site_status_idx
  on public.site_instruction_follow_ups(site_id, status, due_date, created_at desc);

create index if not exists site_instruction_follow_ups_assigned_idx
  on public.site_instruction_follow_ups(assigned_to, status, due_date)
  where assigned_to is not null;

drop trigger if exists set_updated_at on public.site_instruction_follow_ups;
create trigger set_updated_at
before update on public.site_instruction_follow_ups
for each row
execute function private.set_updated_at();

alter table public.site_instruction_follow_ups enable row level security;

grant select on public.site_instruction_follow_ups to authenticated;
grant all on public.site_instruction_follow_ups to service_role;

drop policy if exists site_instruction_follow_ups_select_ops on public.site_instruction_follow_ups;
create policy site_instruction_follow_ups_select_ops
on public.site_instruction_follow_ups
for select
to authenticated
using (
  private.can_access_engineering_controls()
  and exists (
    select 1
    from public.site_instructions as instruction
    where instruction.id = site_instruction_follow_ups.instruction_id
  )
);
