-- Pymble Operations — Material Request pricing workflow (part 1: enum values)
--
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction block, so the enum
-- additions live in their own migration. Table changes follow in part 2.
--
-- Workflow per Part 2.2 of pymble-ops-workflow-design.md:
--   draft → submitted → in_review → pricing_pending → priced → approved →
--   ordered → closed
--
-- pricing_pending — operations has approved; waiting for procurement to attach
--                   supplier prices.
-- priced          — procurement has filled in actual supplier prices; ready for
--                   finance to approve the cost.

alter type public.ops_material_request_status add value if not exists 'pricing_pending' before 'approved';
alter type public.ops_material_request_status add value if not exists 'priced' before 'approved';
