-- Pymble Operations — Material Request delivery milestone (part 1: enum value)
--
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction block, so the enum
-- addition lives in its own migration. Column changes follow in part 2.
--
-- Completes the request lifecycle so the site requester can confirm delivery:
--   ... → approved → ordered → delivered → closed
--
-- delivered — the requester has confirmed materials arrived on site. A request
--             that is received in full skips straight to `closed`; a partial /
--             with-issues delivery rests in `delivered` until the Goods Received
--             Note (or a follow-up confirmation) closes it.

alter type public.ops_material_request_status add value if not exists 'delivered' before 'closed';
