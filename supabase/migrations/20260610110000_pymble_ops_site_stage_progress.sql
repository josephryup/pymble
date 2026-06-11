-- Pymble Operations — Site lifecycle stage and progress tracking
-- Adds a richer lifecycle stage + completion percentage to sites so progress is
-- visible to delivery teams and rolls up to the executive "Project completion %".
-- The legacy `status` field is retained (derived from stage in the app) for
-- backward compatibility and will be deprecated once all reads move to `stage`.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'ops_site_stage') then
    create type public.ops_site_stage as enum (
      'planning',
      'mobilizing',
      'in_progress',
      'handover',
      'completed',
      'on_hold',
      'cancelled'
    );
  end if;
end $$;

alter table public.sites
  add column if not exists stage public.ops_site_stage not null default 'planning',
  add column if not exists progress_percent numeric(5, 2) not null default 0
    check (progress_percent >= 0 and progress_percent <= 100),
  add column if not exists target_completion_date date,
  add column if not exists actual_completion_date date;

-- Backfill stage from the legacy status for any pre-existing rows.
update public.sites
set stage = case status
  when 'closing' then 'handover'::public.ops_site_stage
  when 'mobilizing' then 'mobilizing'::public.ops_site_stage
  else 'in_progress'::public.ops_site_stage
end
where stage = 'planning';

create index if not exists sites_stage_idx on public.sites(stage);
