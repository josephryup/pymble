-- =============================================================================
-- Workflow audit — Phase 0 repair, second pass (audit F10)
-- 19 August 2026 · APPLIED to project zuezxgyhhrhklrhqsvvs on 19 Aug 2026
--
-- Found while applying the ghost-PO repair: `cancelMaterialRequestAction`
-- cancelled the request and released its cost stations, but NEVER withdrew the
-- approval the request had raised. The approval stayed open and its steps
-- stayed `pending`, so every cancelled request left a permanent item in its
-- approvers' queues asking them to authorise something that no longer exists.
--
-- Eleven approvals resolved between 29 June and 11 July had accumulated 23 such
-- orphaned steps — a meaningful share of the "approvals are noisy" complaint,
-- and the same shape as the reservation ghost the cancel path already guards
-- against: a terminal state must release everything it was holding, queues
-- included.
--
-- The code fix lands in `cancelMaterialRequestAction`; this clears the backlog.
--
-- SAFETY: scoped to steps whose parent approval is ALREADY cancelled, so it
-- cannot touch a live chain, and re-running is a no-op.
-- =============================================================================

begin;

update approval_steps s
set status = 'cancelled'
from approval_requests a
where a.id = s.approval_request_id
  and a.status = 'cancelled'
  and s.status = 'pending';

insert into audit_events (
  action, actor_user_id, entity_id, entity_type, metadata,
  module_key, source_id, source_table, summary
)
values (
  'approval_request.steps_cancelled',
  null,
  null,
  'approval_request',
  jsonb_build_object(
    'repair', 'phase0_repair',
    'reason', 'Approvals cancelled with their source request left their steps pending, keeping dead items in approvers'' queues.'
  ),
  'approvals',
  null,
  'approval_steps',
  'Cancelled orphaned pending approval steps on already-cancelled approvals (workflow audit Phase 0 repair)'
);

commit;
