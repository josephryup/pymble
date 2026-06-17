-- Pymble Operations — Phase J archive / cancellation columns
--
-- Adds soft-archive (archived_at / archived_by) and cancellation
-- (cancelled_at / cancelled_by) columns to invoices, payment_requests,
-- daily_site_reports, and payroll_runs. Payment requests already have the
-- cancellation pair so only archive columns are added there.

alter table public.invoices
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.users(id) on delete set null,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references public.users(id) on delete set null;

alter table public.payment_requests
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.users(id) on delete set null;

alter table public.daily_site_reports
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.users(id) on delete set null,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references public.users(id) on delete set null;

alter table public.payroll_runs
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.users(id) on delete set null,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references public.users(id) on delete set null;

create index if not exists invoices_archived_idx on public.invoices(archived_at)
  where archived_at is not null;
create index if not exists payment_requests_archived_idx on public.payment_requests(archived_at)
  where archived_at is not null;
create index if not exists daily_site_reports_archived_idx on public.daily_site_reports(archived_at)
  where archived_at is not null;
create index if not exists payroll_runs_archived_idx on public.payroll_runs(archived_at)
  where archived_at is not null;

comment on column public.invoices.cancelled_at is
  'Voided/cancelled timestamp. Status remains as it was; voided invoices are hidden from default listings.';
