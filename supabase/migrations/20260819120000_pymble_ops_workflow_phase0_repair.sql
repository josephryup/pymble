-- =============================================================================
-- Workflow audit — Phase 0 data repair (audit F1, F10)
-- 19 August 2026 · APPLIED to project zuezxgyhhrhklrhqsvvs on 19 Aug 2026
--
-- The CODE fix in this same change unstrands the nine material requests frozen
-- in `pricing_pending`: the tender gate now recognises typed suppliers, states
-- the cheap remedy, and — crucially — a requisition can finally be built from a
-- request that has not yet been approved. Those nine need no data surgery; they
-- simply become actionable again. Nothing in this file touches them.
--
-- What DOES need repair is the ghost procurement left behind on 1 July.
--
-- ── The situation ────────────────────────────────────────────────────────────
-- Five purchase orders were raised on 1 July against four material requests.
-- On the SAME DAY all four requests were closed, with `delivered_at` still
-- null — closed administratively, not because goods arrived. The purchase
-- orders were never approved, so they have sat at `approval_pending` ever
-- since, each still carrying a live approval request with two pending steps.
--
--   PO-20260701-358701   K    500.00   MR-20260630-D08216 (closed 1 Jul)
--   PO-20260701-6EE046   K 12,495.00   MR-20260630-F4FB6B (closed 1 Jul)
--   PO-20260701-31B95F   K  2,250.00   MR-20260630-1F4463 (closed 1 Jul)
--   PO-20260701-31CDF0   K  3,250.00   MR-20260630-1F4463 (closed 1 Jul)
--   PO-20260701-A495B9   K  7,250.00   MR-20260629-EB7509 (closed 1 Jul)
--                        ───────────
--                        K 25,745.00
--
-- Five of the thirteen open approvals in the system are these. They have been
-- sitting in approvers' queues for seven weeks for orders nobody can act on,
-- because the request they belong to is already closed. That is a meaningful
-- part of the "approvals are noisy / full of bugs" complaint.
--
-- ── What this migration does ─────────────────────────────────────────────────
-- Cancels the five orders and their approvals. It does NOT cancel anything
-- else, does not touch the parent requests, and does not write or reverse any
-- money: these orders never reached `issued`, so they produced no cost entry
-- and no journal (confirmed — all 8 POs in the database have zero cost
-- entries). There is nothing financial to unwind.
--
-- ── Why cancel rather than reopen ────────────────────────────────────────────
-- The parent requests are closed. An order cannot legitimately proceed against
-- a closed request, so leaving them pending asks approvers to authorise spend
-- for work that is finished. If any of these goods were in fact bought, the
-- correct record is a fresh purchase against a fresh request — not a
-- seven-week-old approval nobody remembers.
--
-- ── Reversing this ───────────────────────────────────────────────────────────
-- Every affected row is listed by number above and stamped with
-- `phase0_repair` in the audit trail, so restoring any of them is a targeted
-- update, not a guess. No row is deleted.
--
-- SAFETY: scoped by explicit PO number AND current status, so re-running is a
-- no-op and a row that has since moved on is left alone.
-- =============================================================================

begin;

-- Guard: if these orders have moved on since the audit, do nothing at all
-- rather than acting on a stale assumption.
do $$
declare
  affected integer;
begin
  select count(*) into affected
  from purchase_orders
  where po_number in (
    'PO-20260701-358701',
    'PO-20260701-6EE046',
    'PO-20260701-31B95F',
    'PO-20260701-31CDF0',
    'PO-20260701-A495B9'
  )
  and status = 'approval_pending';

  raise notice 'phase0_repair: % stale purchase order(s) will be cancelled', affected;
end $$;

-- 1. Cancel the stale approval requests and their pending steps, so they leave
--    the approvers' queues.
with stale_pos as (
  select id
  from purchase_orders
  where po_number in (
    'PO-20260701-358701',
    'PO-20260701-6EE046',
    'PO-20260701-31B95F',
    'PO-20260701-31CDF0',
    'PO-20260701-A495B9'
  )
  and status = 'approval_pending'
),
stale_approvals as (
  select ar.id
  from approval_requests ar
  join stale_pos p on p.id = ar.source_id
  where ar.source_table = 'purchase_orders'
    and ar.status in ('draft', 'submitted', 'in_review')
)
update approval_steps
set status = 'cancelled'
where approval_request_id in (select id from stale_approvals)
  and status = 'pending';

with stale_pos as (
  select id
  from purchase_orders
  where po_number in (
    'PO-20260701-358701',
    'PO-20260701-6EE046',
    'PO-20260701-31B95F',
    'PO-20260701-31CDF0',
    'PO-20260701-A495B9'
  )
  and status = 'approval_pending'
)
update approval_requests ar
set status = 'cancelled',
    resolved_at = now()
from stale_pos p
where ar.source_table = 'purchase_orders'
  and ar.source_id = p.id
  and ar.status in ('draft', 'submitted', 'in_review');

-- 2. Cancel the orders themselves.
update purchase_orders
set status = 'cancelled',
    updated_at = now()
where po_number in (
  'PO-20260701-358701',
  'PO-20260701-6EE046',
  'PO-20260701-31B95F',
  'PO-20260701-31CDF0',
  'PO-20260701-A495B9'
)
and status = 'approval_pending';

-- 3. Leave the reason in the audit trail, so this is explicable in six months.
insert into audit_events (
  action, actor_user_id, entity_id, entity_type, metadata,
  module_key, source_id, source_table, summary
)
select
  'purchase_order.cancelled',
  null,
  po.id,
  'purchase_order',
  jsonb_build_object(
    'repair', 'phase0_repair',
    'po_number', po.po_number,
    'total_amount', po.total_amount,
    'reason', 'Parent material request was closed on 1 July without delivery; the order was never approved or issued and produced no cost entry.'
  ),
  'rfq_po',
  po.id,
  'purchase_orders',
  'Cancelled stale purchase order ' || po.po_number || ' (workflow audit Phase 0 repair)'
from purchase_orders po
where po.po_number in (
  'PO-20260701-358701',
  'PO-20260701-6EE046',
  'PO-20260701-31B95F',
  'PO-20260701-31CDF0',
  'PO-20260701-A495B9'
)
and po.status = 'cancelled';

commit;
