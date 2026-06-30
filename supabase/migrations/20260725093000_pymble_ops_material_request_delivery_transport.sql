-- Pymble Operations — Material Request delivery milestone (part 2: columns)
--
-- Adds two independent pieces of data to material_requests:
--
--   • transport_cost — the procurement department's OWN internal cost of moving
--     around to source / collect the materials. It is NOT part of the goods
--     price, never rolls into the per-line or request estimate/actual totals,
--     and is deliberately excluded from both the Material Request PDF and the
--     Purchase Order PDF (both render only goods totals). Captured by
--     procurement while the request is in the procurement window.
--
--   • delivered_at / delivered_by / delivery_notes — the site requester's
--     confirmation that materials arrived (Option A: requester-confirmed
--     delivery is the primary close path, with the Goods Received Note flow as
--     a fallback for requests routed through a store).

alter table public.material_requests
  add column if not exists transport_cost numeric(14, 2) not null default 0
    check (transport_cost >= 0);

alter table public.material_requests
  add column if not exists delivered_at timestamptz,
  add column if not exists delivered_by uuid references public.users(id) on delete set null,
  add column if not exists delivery_notes text not null default '';

comment on column public.material_requests.transport_cost is
  'Internal procurement transport/sourcing cost (running around to collect materials). Excluded from goods totals and from both PDFs.';
comment on column public.material_requests.delivered_at is
  'Timestamp the site requester confirmed materials were delivered.';
comment on column public.material_requests.delivered_by is
  'User (usually the requester) who confirmed delivery.';
comment on column public.material_requests.delivery_notes is
  'Free-text note captured at delivery confirmation (condition, partial receipt, who received).';
