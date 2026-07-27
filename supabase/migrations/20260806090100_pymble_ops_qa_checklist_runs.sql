-- Site inspection checklists, part 2: templates, hold points, client sign-off.
--
-- Digitises the seven CONSTRUCTION PROCESS inspection forms on top of the
-- existing qa_inspections / qa_inspection_items tables rather than adding a
-- parallel module — the shape already matched almost exactly.
--
-- Four capabilities the paper forms have and the tables did not:
--
--  * Contractor AND client verdicts per item. The forms carry two independent
--    YES/NO columns; that second opinion is the client's acceptance and is the
--    commercially significant one. `result` stays as the contractor verdict so
--    existing rows keep their meaning; `client_result` is new.
--
--  * Hold points. Items that guard work about to be covered up.
--
--  * Client sign-off by an EXTERNAL party. Deliberately no account, no login,
--    no invite: the client representative signs on the engineer's device at the
--    inspection, and the record captures who signed, in what capacity, when,
--    and on whose device. A typed name plus a witnessed timestamp is the same
--    evidentiary weight as the paper signature it replaces, without dragging an
--    external person into the ERP's identity model.
--
--  * Offline capture. client_id mirrors the attendance / daily-report pattern
--    so a queued checklist replays exactly once.

alter table public.qa_inspections
  add column if not exists template_key text,
  add column if not exists location text not null default '',
  add column if not exists client_id uuid,
  -- External client sign-off (no user account involved).
  add column if not exists client_rep_name text not null default '',
  add column if not exists client_rep_role text not null default '',
  add column if not exists client_signed_at timestamptz,
  add column if not exists client_signature_name text not null default '',
  add column if not exists client_comment text not null default '',
  add column if not exists client_witnessed_by uuid references public.users(id) on delete set null,
  -- Hold-point override.
  add column if not exists hold_point_override_reason text not null default '',
  add column if not exists hold_point_override_by uuid references public.users(id) on delete set null,
  add column if not exists hold_point_override_at timestamptz;

comment on column public.qa_inspections.template_key is
  'Key of the company checklist template this run was created from (src/lib/ops/qa-checklist-templates.ts). Null for ad-hoc inspections.';
comment on column public.qa_inspections.client_signature_name is
  'Name typed by the external client representative as their signature, witnessed on the inspector''s device. There is no client user account by design.';
comment on column public.qa_inspections.client_witnessed_by is
  'Internal user whose device captured the client signature.';
comment on column public.qa_inspections.hold_point_override_reason is
  'Written justification for releasing an unmet hold point. Required, and cannot be given by the inspector themselves.';

alter table public.qa_inspection_items
  add column if not exists client_result public.ops_qa_inspection_item_result not null default 'pending',
  add column if not exists is_hold_point boolean not null default false,
  add column if not exists criterion text not null default '';

comment on column public.qa_inspection_items.result is
  'Contractor (Pymble) verdict — the left YES/NO column on the paper form.';
comment on column public.qa_inspection_items.client_result is
  'Client verdict — the right YES/NO column on the paper form. Recorded by the inspector on the client representative''s behalf.';
comment on column public.qa_inspection_items.is_hold_point is
  'Guards work that is about to be covered up. Must pass before the inspection can complete, unless an override is recorded.';

-- Photo evidence for a failed item. Reuses site_photos so checklist evidence
-- flows through the existing R2 upload and offline replay path instead of a
-- second, parallel photo pipeline.
alter table public.site_photos
  add column if not exists qa_inspection_item_id uuid
    references public.qa_inspection_items(id) on delete set null;

comment on column public.site_photos.qa_inspection_item_id is
  'Set when the photo is evidence against a failed checklist item.';

create index if not exists site_photos_qa_item_idx
  on public.site_photos (qa_inspection_item_id)
  where qa_inspection_item_id is not null;

create index if not exists qa_inspections_template_idx
  on public.qa_inspections (template_key, inspection_date desc)
  where template_key is not null;

-- Offline replay lands the same queued checklist at most once.
create unique index if not exists qa_inspections_client_id_unique
  on public.qa_inspections (client_id)
  where client_id is not null;
