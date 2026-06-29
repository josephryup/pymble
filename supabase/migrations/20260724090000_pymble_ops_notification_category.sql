-- Server-defined notification category so the floating dock groups
-- "Action needed" vs informational alerts from a real column instead of a
-- client-side title heuristic.
--
--   action = the recipient must do something (an approval to decide, a rejected
--            or overdue item to deal with)
--   info   = FYI (approved, issued, created, ...)
--
-- queueOpsNotification derives this from the title at write time (overridable),
-- so every new notification is categorised at the source. Backfill existing
-- rows here using the same rule.

alter table public.notifications
  add column if not exists category text not null default 'info'
    check (category in ('action', 'info'));

update public.notifications
set category = 'action'
where category = 'info'
  and (
    title ~* '\yapproval\y'
    or title ~* 'rejected:'
    or title ~* 'overdue'
    or title ~* 'escalation'
    or title ~* 'requires your'
    or title ~* 'awaiting your'
    or title ~* 'action needed'
  );

comment on column public.notifications.category is
  'action = recipient must act (approval to decide, rejected/overdue item); info = FYI. Set by queueOpsNotification (derived from title unless overridden). Drives dock grouping.';
