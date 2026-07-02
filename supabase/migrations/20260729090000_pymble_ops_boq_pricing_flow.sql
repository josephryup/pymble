-- Pymble Operations — BOQ pricing workflow (part 1: enum values)
--
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction block, so the enum
-- addition lives in its own migration. Column changes follow in part 2.
--
-- Mirrors the Material Request pricing-split pattern (see
-- 20260616120000_pymble_ops_material_request_pricing_flow.sql): the Quantity
-- Surveyor builds the schedule (quantities, classification, dates) but no
-- longer sets the final price directly — Procurement must price every line
-- (including the transport estimate) before the schedule can be issued.
--
-- New lifecycle: draft → pricing_pending → priced → issued
--
-- pricing_pending — QS has submitted the schedule; waiting for Procurement to
--                   price every line (unit_rate + transport estimate).
-- priced          — Procurement has priced the schedule; ready for final
--                   sign-off (issue), which also generates the project budget.

alter type public.ops_boq_status add value if not exists 'pricing_pending' before 'issued';
alter type public.ops_boq_status add value if not exists 'priced' before 'issued';
