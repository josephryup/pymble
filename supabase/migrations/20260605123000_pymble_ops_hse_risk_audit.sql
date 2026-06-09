do $$
begin
  if not exists (select 1 from pg_type where typname = 'ops_hse_risk_assessment_status') then
    create type public.ops_hse_risk_assessment_status as enum (
      'draft',
      'submitted',
      'approved',
      'archived',
      'cancelled'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'ops_hse_compliance_audit_status') then
    create type public.ops_hse_compliance_audit_status as enum (
      'planned',
      'completed',
      'action_required',
      'closed',
      'cancelled'
    );
  end if;
end $$;

create table if not exists public.hse_risk_assessments (
  id uuid primary key default gen_random_uuid(),
  assessment_number text not null default (
    'RA-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  ),
  site_id uuid references public.sites(id) on delete set null,
  title text not null check (length(btrim(title)) > 0),
  activity text not null default '',
  area_location text not null default '',
  hazard_category text not null default 'general' check (hazard_category ~ '^[a-z][a-z0-9_]*$'),
  initial_risk public.ops_hse_incident_severity not null default 'medium',
  residual_risk public.ops_hse_incident_severity not null default 'low',
  control_measures text not null default '',
  responsible_user_id uuid references public.users(id) on delete set null,
  assessment_date date not null default current_date,
  review_date date,
  status public.ops_hse_risk_assessment_status not null default 'draft',
  submitted_at timestamptz,
  submitted_by uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  approved_by uuid references public.users(id) on delete set null,
  archived_at timestamptz,
  archived_by uuid references public.users(id) on delete set null,
  cancelled_at timestamptz,
  cancelled_by uuid references public.users(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (review_date is null or review_date >= assessment_date)
);

create table if not exists public.hse_compliance_audits (
  id uuid primary key default gen_random_uuid(),
  audit_number text not null default (
    'AUD-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  ),
  site_id uuid references public.sites(id) on delete set null,
  audit_type text not null default 'general' check (audit_type ~ '^[a-z][a-z0-9_]*$'),
  title text not null check (length(btrim(title)) > 0),
  auditor_id uuid references public.users(id) on delete set null,
  scheduled_date date not null default current_date,
  completed_date date,
  score numeric(5, 2) not null default 0 check (score >= 0 and score <= 100),
  findings_count integer not null default 0 check (findings_count >= 0),
  non_conformance_count integer not null default 0 check (non_conformance_count >= 0),
  summary text not null default '',
  action_required text not null default '',
  next_audit_date date,
  status public.ops_hse_compliance_audit_status not null default 'planned',
  completed_by uuid references public.users(id) on delete set null,
  action_required_at timestamptz,
  closed_at timestamptz,
  closed_by uuid references public.users(id) on delete set null,
  cancelled_at timestamptz,
  cancelled_by uuid references public.users(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (completed_date is null or completed_date >= scheduled_date),
  check (next_audit_date is null or completed_date is null or next_audit_date >= completed_date)
);

create unique index if not exists hse_risk_assessments_number_unique
  on public.hse_risk_assessments(assessment_number);
create index if not exists hse_risk_assessments_site_status_idx
  on public.hse_risk_assessments(site_id, status, review_date, assessment_date desc)
  where site_id is not null;
create index if not exists hse_risk_assessments_status_review_idx
  on public.hse_risk_assessments(status, review_date, initial_risk, residual_risk);
create index if not exists hse_risk_assessments_owner_idx
  on public.hse_risk_assessments(responsible_user_id, status, review_date)
  where responsible_user_id is not null;

create unique index if not exists hse_compliance_audits_number_unique
  on public.hse_compliance_audits(audit_number);
create index if not exists hse_compliance_audits_site_status_idx
  on public.hse_compliance_audits(site_id, status, scheduled_date desc)
  where site_id is not null;
create index if not exists hse_compliance_audits_status_date_idx
  on public.hse_compliance_audits(status, scheduled_date, next_audit_date);
create index if not exists hse_compliance_audits_auditor_idx
  on public.hse_compliance_audits(auditor_id, status, scheduled_date)
  where auditor_id is not null;

drop trigger if exists set_updated_at on public.hse_risk_assessments;
create trigger set_updated_at
before update on public.hse_risk_assessments
for each row execute function private.set_updated_at();

drop trigger if exists set_updated_at on public.hse_compliance_audits;
create trigger set_updated_at
before update on public.hse_compliance_audits
for each row execute function private.set_updated_at();

alter table public.hse_risk_assessments enable row level security;
alter table public.hse_compliance_audits enable row level security;

grant select on public.hse_risk_assessments to authenticated;
grant select on public.hse_compliance_audits to authenticated;
grant all on public.hse_risk_assessments to service_role;
grant all on public.hse_compliance_audits to service_role;

drop policy if exists hse_risk_assessments_select_ops on public.hse_risk_assessments;
create policy hse_risk_assessments_select_ops
on public.hse_risk_assessments
for select
to authenticated
using (private.can_access_hse_compliance());

drop policy if exists hse_compliance_audits_select_ops on public.hse_compliance_audits;
create policy hse_compliance_audits_select_ops
on public.hse_compliance_audits
for select
to authenticated
using (private.can_access_hse_compliance());
