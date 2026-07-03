-- Two-tier department reporting.
--
-- scope:
--   'individual' — a contributor's own report (engineer, HSE officer,
--                  procurement officer) that routes to their line manager.
--   'compiled'   — the department-level report a manager files upward
--                  (Projects Manager → MD, Procurement Manager → GM+MD, ...).
--                  All pre-existing reports were head-level, hence the default.
--
-- sections: structured template sections ({section_key: text}) replacing the
-- single narrative blob. narrative stays for backwards compatibility and as
-- a fallback rendering for old reports.

alter table public.department_reports
  add column if not exists scope text not null default 'compiled'
    constraint department_reports_scope_check check (scope in ('individual', 'compiled')),
  add column if not exists sections jsonb not null default '{}'::jsonb;

create index if not exists department_reports_scope_idx
  on public.department_reports(department, scope, period_end_date desc)
  where archived_at is null;
