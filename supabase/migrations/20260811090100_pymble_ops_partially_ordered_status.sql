-- Pymble Operations — the `partially_ordered` material request status
--
-- Companion to 20260811090000. ALTER TYPE ... ADD VALUE cannot run inside a
-- transaction block, so the enum addition lives in its own migration — the same
-- split the BOQ pricing flow needed (see 20260729090000).
--
-- `partially_ordered` sits between `approved` and `ordered`. It is a WORKING
-- state, not a terminal one (audit §8.7): the request stays on Procurement's
-- queue with its outstanding items, and a second procure action issues a second
-- purchase order. It becomes `ordered` only when every item is either ordered
-- or declined, and closes on full delivery.
--
-- The enum already carries fractional sort orders for exactly this kind of
-- insertion (pricing_pending 3.5, priced 3.75, md_review 3.875).

alter type public.ops_material_request_status
  add value if not exists 'partially_ordered' before 'ordered';
