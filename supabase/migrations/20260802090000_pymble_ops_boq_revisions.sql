-- Material schedule revisions (audit B1 / A7 / A1).
--
-- Until now an issued schedule was final: canEditBoq requires 'draft', and the
-- promised supersede action was never built. Scope changes are constant in
-- construction, so the issued schedule — and therefore the budget generated
-- from it — simply drifted from reality.
--
-- Model: a revision is a NEW boq_documents row (version = previous + 1) that
-- points back at the one it replaces. The predecessor is untouched until the
-- revision is issued, at which point it is stamped superseded_* and drops out
-- of the working list. Nothing is edited in place, so every issued version
-- stays auditable and the budget delta between versions is reconstructable.

alter table public.boq_documents
  add column if not exists supersedes_id uuid references public.boq_documents(id) on delete set null,
  add column if not exists superseded_at timestamptz,
  add column if not exists superseded_by uuid references public.users(id) on delete set null;

comment on column public.boq_documents.supersedes_id is
  'The schedule this one revises. Set when the revision is created; the predecessor is only marked superseded when this revision is issued.';
comment on column public.boq_documents.superseded_at is
  'Set when a later revision of this schedule was issued. Superseded schedules stay readable as history but leave the working list.';
comment on column public.boq_documents.version is
  'Revision number within a supersedes_id chain, starting at 1.';

-- One live revision per predecessor: prevents two people branching v2 off the
-- same v1 and racing to issue. Superseded rows are excluded so a long chain
-- (v1 → v2 → v3) stays legal.
create unique index if not exists boq_documents_one_open_revision_unique
  on public.boq_documents (supersedes_id)
  where supersedes_id is not null and superseded_at is null and deleted_at is null;

create index if not exists boq_documents_superseded_idx
  on public.boq_documents (superseded_at)
  where superseded_at is null;

-- A1: the manual actual column is superseded by figures derived from linked
-- material requests (see src/lib/ops/boq-actuals.ts). Retained so historical
-- entries survive, but no longer written or shown.
comment on column public.boq_line_items.actual_quantity is
  'Deprecated: manually keyed and frozen once a schedule was issued. Real consumption is derived from material_request_items.boq_line_item_id. Retained for historical rows only.';
