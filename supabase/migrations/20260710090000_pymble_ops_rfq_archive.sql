-- Allow requisitions (RFQs) to be archived and restored, like material requests
-- and other operational records. Visibility/restore is enforced in the app layer
-- (canEditOpsRfq / Archive viewer). A partial index keeps the active-list query
-- (archived_at is null) fast.

alter table public.rfqs
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.users(id) on delete set null;

create index if not exists rfqs_archived_at_idx on public.rfqs(archived_at) where archived_at is null;
