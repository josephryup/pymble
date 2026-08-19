-- =============================================================================
-- Workflow audit — Phase 5: the last ghost purchase order
-- 19 August 2026 · APPLIED to project zuezxgyhhrhklrhqsvvs on 19 Aug 2026
--
-- Surfaced by the new workflow-integrity checks, which is the point of them.
--
-- Same defect as the five orders cancelled in Phase 0: the requisition-
-- conversion bug closed the material request on 10 July, the same day the
-- order was raised, leaving the order stranded against a closed parent. This
-- one was `approved` rather than `approval_pending`, so the Phase 0 filter did
-- not reach it.
--
-- Never issued, so no cost entry and no journal exist for it — nothing
-- financial to unwind. Cancelled under the same decision that settled the
-- other five.
-- =============================================================================

begin;

update purchase_orders
set status = 'cancelled', updated_at = now()
where po_number = 'PO-20260710-6A74EA'
  and status = 'approved';

insert into audit_events (
  action, actor_user_id, entity_id, entity_type, metadata,
  module_key, source_id, source_table, summary
)
select
  'purchase_order.cancelled', null, po.id, 'purchase_order',
  jsonb_build_object(
    'repair', 'phase5_repair',
    'po_number', po.po_number,
    'total_amount', po.total_amount,
    'reason', 'Parent material request was closed on 10 July without delivery by the requisition-conversion defect; the order was never issued and produced no cost entry.'
  ),
  'rfq_po', po.id, 'purchase_orders',
  'Cancelled stale purchase order ' || po.po_number || ' (workflow audit Phase 5 repair)'
from purchase_orders po
where po.po_number = 'PO-20260710-6A74EA' and po.status = 'cancelled';

commit;
