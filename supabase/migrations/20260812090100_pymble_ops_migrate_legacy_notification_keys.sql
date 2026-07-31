-- Pymble Operations — retire legacy dated notification keys (audit §9)
--
-- The backlog dedupe (20260812090000) left 852 notifications, of which 434
-- still carried the OLD key format with a date segment. The code now writes a
-- date-free key, so those rows would not match on the next sweep and each
-- still-unresolved item would produce ONE more notification — about 27 per
-- person across the 16 affected recipients. Self-limiting, but a confusing
-- "why another round?" on the first morning after deploy.
--
-- Rewriting the surviving keys to the new format makes the next sweep update
-- those rows in place instead, so the transition is invisible.
--
-- On the shape: the real keys are
--   ops-escalation:material_requests:<id>:overdue:2026-07-31:role:<recipient>
-- The date sits in the MIDDLE, not at the end — `escalations.ts` builds a base
-- key ending in the literal `role` and `queueOpsNotification`'s caller appends
-- `:<recipientId>`. So the rule is simply "remove the date segment", not
-- "strip a dated suffix".
--
-- Every rewrite is guarded on the target key being free, so the unique index
-- can never be violated. A collision means an equivalent notification already
-- exists and the sweep will reconcile the two; the dated row is left for the
-- monthly archive to clear rather than deleted here.

-- Escalation sweep keys (approvals, material requests, POs, RFQs, reports…).
update public.notifications n
set idempotency_key = regexp_replace(n.idempotency_key, ':\d{4}-\d{2}-\d{2}', '')
where n.idempotency_key like 'ops-escalation:%'
  and n.idempotency_key ~ ':\d{4}-\d{2}-\d{2}'
  and not exists (
    select 1
    from public.notifications other
    where other.idempotency_key =
      regexp_replace(n.idempotency_key, ':\d{4}-\d{2}-\d{2}', '')
  );

-- Project schedule overdue sweep.
update public.notifications n
set idempotency_key = regexp_replace(n.idempotency_key, ':\d{4}-\d{2}-\d{2}', '')
where n.idempotency_key like 'project-task-overdue:%'
  and n.idempotency_key ~ ':\d{4}-\d{2}-\d{2}'
  and not exists (
    select 1
    from public.notifications other
    where other.idempotency_key =
      regexp_replace(n.idempotency_key, ':\d{4}-\d{2}-\d{2}', '')
  );

-- IT escalation sweep.
update public.notifications n
set idempotency_key = regexp_replace(n.idempotency_key, ':\d{4}-\d{2}-\d{2}', '')
where n.idempotency_key ~ '^it-'
  and n.idempotency_key ~ ':\d{4}-\d{2}-\d{2}'
  and not exists (
    select 1
    from public.notifications other
    where other.idempotency_key =
      regexp_replace(n.idempotency_key, ':\d{4}-\d{2}-\d{2}', '')
  );

-- Department report submissions: the key now carries the submission timestamp
-- rather than the calendar date, so a re-submission notifies but a
-- double-click does not. Historical rows keep their date — rewriting them
-- would invent a submitted_at that never existed.
