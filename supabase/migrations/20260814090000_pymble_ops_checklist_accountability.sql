-- Site checklists become an accountability record rather than a client-facing
-- one (2026-08-14).
--
-- Three changes, all additive:
--
--  1. Projects Manager sign-off. A checklist can no longer be completed by the
--     person who ran it alone — the PM acknowledges it, and that acknowledgement
--     is what completes it. Recorded here so the completion is attributable
--     months later, not just present in an audit event.
--  2. Archive. Developer and Managing Director only; the checklist stays
--     readable in /ops/archive rather than being deleted.
--  3. The client sign-off columns stay in place but stop being written. There
--     are no signed rows to migrate, and dropping columns that a future
--     client-witnessed inspection type might want back is not worth the churn.
--     Application code no longer reads or writes client_rep_name,
--     client_rep_role, client_signature_name, client_signed_at, client_comment,
--     client_witnessed_by, or qa_inspection_items.client_result.
--
--     NOTE: qa_inspections.client_id is NOT a customer reference — it is the
--     offline-replay idempotency key. It is untouched.

alter table public.qa_inspections
  add column if not exists pm_signed_at timestamptz,
  add column if not exists pm_signed_by uuid references public.users(id) on delete set null,
  add column if not exists pm_sign_off_note text not null default '',
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.users(id) on delete set null;

comment on column public.qa_inspections.pm_signed_at is
  'When the Projects Manager acknowledged the checklist. Completion is blocked until this is set.';
comment on column public.qa_inspections.pm_sign_off_note is
  'What the Projects Manager wrote when acknowledging. Free text, may be empty.';

-- The list view filters archived runs out on every read, and the archive page
-- filters to exactly them.
create index if not exists qa_inspections_archived_at_idx
  on public.qa_inspections (archived_at)
  where archived_at is not null;
