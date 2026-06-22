-- Add archive columns to cash_advances so open advances can be soft-deleted
-- without interfering with already-deducted advance records.

alter table public.cash_advances
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.users(id) on delete set null;

create index if not exists cash_advances_archived_idx
  on public.cash_advances(archived_at)
  where archived_at is null;
