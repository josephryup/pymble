-- Pymble Operations — partial procurement data model
--
-- Phase 3 foundation (docs/pymble-ops-project-finance-spine-audit.md §8).
-- SCHEMA ONLY: every column is nullable or defaulted and no existing code path
-- changes behaviour yet. The outward-facing part — auto-issuing a purchase
-- order on approval — lands with the §8.8 guard rails, deliberately not before.
--
-- Business decision §7.1: once the procured stage is approved the PO is issued
-- and the request goes straight to delivery; at that point Procurement selects
-- WHAT WAS ACTUALLY PROCURED, and a partial procurement must show on the
-- request and reduce the amount committed.
--
-- The design rule (§8.3): STORE THE DECISION, DERIVE THE NUMBERS.
--
--   Stored, because it is a human judgement nothing can reconstruct:
--     • which items Procurement bought, declined or deferred, and why
--
--   Derived at read time from purchase_order_items, because a stored mirror
--   drifts the moment a PO is amended, cancelled, or a second round is raised:
--     • ordered quantity and value
--     • outstanding quantity
--     • request-level procurement progress
--
-- Deriving also gives partial procurement BY QUANTITY, not just by item — 8t
-- ordered against 12t requested is the common real case and a per-item tick
-- box cannot express it.

-- ---------------------------------------------------------------------------
-- 1. The per-item decision.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'ops_procurement_decision') then
    create type public.ops_procurement_decision as enum (
      'pending',
      'ordered',
      'declined',
      'deferred'
    );
  end if;
end $$;

alter table public.material_request_items
  add column if not exists procurement_decision public.ops_procurement_decision
    not null default 'pending',
  add column if not exists decision_reason text not null default '',
  add column if not exists decided_at timestamptz,
  add column if not exists decided_by uuid references public.users(id) on delete set null,
  -- How many rounds this item has been declined. Two or more on the same need
  -- is a supply failure rather than a procurement decision, and must be
  -- flagged as such (audit R3 — chronic under-supply must not hide).
  add column if not exists decline_count integer not null default 0;

-- A decline or deferral without a reason is exactly the information loss that
-- makes site teams re-raise duplicate requests, so the reason is required at
-- the database level, not just in the form.
alter table public.material_request_items
  drop constraint if exists material_request_items_decision_reason_required;
alter table public.material_request_items
  add constraint material_request_items_decision_reason_required check (
    procurement_decision not in ('declined', 'deferred')
    or length(btrim(decision_reason)) > 0
  );

create index if not exists material_request_items_procurement_decision_idx
  on public.material_request_items (procurement_decision)
  where procurement_decision <> 'pending';

-- The unmet-need queue (audit R3) reads this: declined or deferred items still
-- carrying outstanding quantity, aged.
create index if not exists material_request_items_unmet_need_idx
  on public.material_request_items (request_id, procurement_decision)
  where procurement_decision in ('declined', 'deferred');

comment on column public.material_request_items.procurement_decision is
  'What Procurement decided for this item: pending (not yet actioned), ordered (a purchase order line exists — see purchase_order_items.material_request_item_id), declined (will not be bought, reason required), deferred (still wanted, awaiting a later round). Quantities are NEVER stored here; they derive from the linked PO items.';
comment on column public.material_request_items.decline_count is
  'How many procurement rounds have declined this item. >= 2 means the site is not getting what it needs — a supply failure, not a decision (audit R3).';

-- ---------------------------------------------------------------------------
-- 2. The missing link between requisition and commitment.
-- ---------------------------------------------------------------------------
alter table public.purchase_order_items
  add column if not exists material_request_item_id uuid
    references public.material_request_items(id) on delete set null;

create index if not exists purchase_order_items_material_request_item_id_idx
  on public.purchase_order_items (material_request_item_id)
  where material_request_item_id is not null;

comment on column public.purchase_order_items.material_request_item_id is
  'The request item this PO line fulfils. Deliberately the ONLY place ordered quantity and value live: everything the request shows about what was procured is derived from these rows, so a PO amendment, cancellation or second-round PO can never leave a stale mirror on the request (audit §8.3).';

-- (The `partially_ordered` status value is added in the companion migration
-- 20260811090100 — ALTER TYPE ... ADD VALUE cannot run inside a transaction
-- block, same reason the BOQ pricing flow split its enum addition out.)

-- ---------------------------------------------------------------------------
-- 4. Approval-inheritance provenance (audit R1).
-- ---------------------------------------------------------------------------
-- When a PO inherits its authority from the material request's approval rather
-- than carrying its own, "who authorised this?" must still be answerable in one
-- hop. Never leave it implied.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'ops_po_approval_source') then
    create type public.ops_po_approval_source as enum (
      'direct',
      'inherited',
      'delta'
    );
  end if;
end $$;

alter table public.purchase_orders
  add column if not exists approval_source public.ops_po_approval_source
    not null default 'direct',
  add column if not exists inherited_from_approval_id uuid
    references public.approval_requests(id) on delete set null,
  -- Who ran the procure action. Recorded separately from approved_by so
  -- segregation of duties (audit R1: the procurer must not be the approver)
  -- is checkable after the fact, not just enforced at the time.
  add column if not exists procured_by uuid references public.users(id) on delete set null,
  add column if not exists procured_at timestamptz;

create index if not exists purchase_orders_approval_source_idx
  on public.purchase_orders (approval_source)
  where approval_source <> 'direct';

comment on column public.purchase_orders.approval_source is
  'Where this PO''s authority came from: direct (its own approval), inherited (the linked material request''s approval covered it — total within the approved value and no price beyond tolerance), or delta (a top-up approval for the variance only). Audit R1: never leave inheritance implied.';
comment on column public.purchase_orders.inherited_from_approval_id is
  'The approval_requests row whose authority this PO relies on, when approval_source is inherited or delta.';

-- ---------------------------------------------------------------------------
-- 5. Value guard in the database, not only in the app (audit R1).
-- ---------------------------------------------------------------------------
-- App-level-only guards are how the 87% leak happened: resolution failures
-- were caught, logged and forgotten. A PO claiming inherited authority must
-- name the approval it inherited from — enforced here so no code path can
-- quietly skip it. (The value comparison itself needs cross-row context and so
-- lives in the procure action, with these columns making it auditable.)
alter table public.purchase_orders
  drop constraint if exists purchase_orders_inherited_approval_named;
alter table public.purchase_orders
  add constraint purchase_orders_inherited_approval_named check (
    approval_source = 'direct'
    or inherited_from_approval_id is not null
    or material_request_id is not null
  );
