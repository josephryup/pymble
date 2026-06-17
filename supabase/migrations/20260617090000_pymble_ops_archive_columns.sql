-- Pymble Operations — Archive columns for BOQ documents and Material Requests
--
-- Adds soft-archive support (archived_at / archived_by) per Part 4 of
-- pymble-ops-workflow-design.md. The existing `deleted_at` on boq_documents is
-- kept for the developer-only hard delete; archive is the everyday "stop
-- showing this" action.

alter table public.boq_documents
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.users(id) on delete set null;

alter table public.material_requests
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.users(id) on delete set null,
  add column if not exists cancelled_by uuid references public.users(id) on delete set null;

create index if not exists boq_documents_archived_idx on public.boq_documents(archived_at)
  where archived_at is not null;
create index if not exists material_requests_archived_idx on public.material_requests(archived_at)
  where archived_at is not null;

comment on column public.boq_documents.archived_at is
  'Soft-archive timestamp. Archived BOQs are hidden from normal listings.';
comment on column public.material_requests.archived_at is
  'Soft-archive timestamp. Archived material requests are hidden from normal listings.';
comment on column public.material_requests.cancelled_by is
  'User who cancelled the request (audit field paired with cancelled_at).';
