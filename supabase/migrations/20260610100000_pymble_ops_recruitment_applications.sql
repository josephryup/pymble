-- Pymble Operations — Recruitment: public job postings and candidate applications
-- Adds public-facing job postings that HR can publish, and a candidate
-- application inbox wired from the public website careers page.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'ops_job_application_status') then
    create type public.ops_job_application_status as enum (
      'new',
      'screening',
      'shortlisted',
      'interview',
      'offer',
      'hired',
      'rejected',
      'withdrawn'
    );
  end if;
end $$;

create table if not exists public.job_postings (
  id uuid primary key default gen_random_uuid(),
  posting_number text not null default (
    'JP-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  ),
  requisition_id uuid references public.recruitment_requisitions(id) on delete set null,
  site_id uuid references public.sites(id) on delete set null,
  title text not null check (length(btrim(title)) > 0),
  department text not null default '',
  employment_type public.ops_employment_type not null default 'full_time',
  location text not null default '',
  summary text not null default '',
  description text not null default '',
  responsibilities text not null default '',
  requirements text not null default '',
  salary_range text not null default '',
  is_published boolean not null default false,
  published_at timestamptz,
  closes_at date,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists job_postings_number_unique on public.job_postings(posting_number);
create index if not exists job_postings_published_idx
  on public.job_postings(is_published, published_at desc);

create table if not exists public.job_applications (
  id uuid primary key default gen_random_uuid(),
  application_number text not null default (
    'JA-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  ),
  job_posting_id uuid references public.job_postings(id) on delete set null,
  full_name text not null check (length(btrim(full_name)) > 0),
  email text not null check (position('@' in email) > 1),
  phone text not null default '',
  cover_letter text not null default '',
  linkedin_url text not null default '',
  cv_document_id uuid references public.documents(id) on delete set null,
  cv_r2_key text,
  status public.ops_job_application_status not null default 'new',
  source text not null default 'website',
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists job_applications_number_unique
  on public.job_applications(application_number);
create index if not exists job_applications_posting_status_idx
  on public.job_applications(job_posting_id, status, created_at desc);
create index if not exists job_applications_status_idx
  on public.job_applications(status, created_at desc);

do $$
declare
  table_name text;
begin
  foreach table_name in array array['job_postings', 'job_applications']
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', table_name);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function private.set_updated_at()',
      table_name
    );
  end loop;
end $$;

alter table public.job_postings enable row level security;
alter table public.job_applications enable row level security;

grant select on public.job_postings to authenticated;
grant select on public.job_applications to authenticated;
grant all on public.job_postings to service_role;
grant all on public.job_applications to service_role;

-- HR/leadership can read in the ops app. Public website reads of published
-- postings and public application submissions are handled server-side with the
-- service role, so no anonymous policies are granted here.
drop policy if exists job_postings_select_ops on public.job_postings;
create policy job_postings_select_ops
on public.job_postings
for select
to authenticated
using (private.can_access_hr_maturity());

drop policy if exists job_applications_select_ops on public.job_applications;
create policy job_applications_select_ops
on public.job_applications
for select
to authenticated
using (private.can_access_hr_maturity());
