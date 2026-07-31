-- Pymble Operations — clear the duplicate notification backlog (audit §9)
--
-- Companion to the code change that removed dates from notification
-- idempotency keys. That stops NEW duplicates; this clears the ones already
-- accumulated.
--
-- How the backlog happened: `queueOpsNotification` upserts on
-- `idempotency_key`, and several key builders embedded the sweep date
-- (`buildOpsEscalationIdempotencyKey`, IT escalations, project-overdue) or a
-- full timestamp (`material-request-unmet`). Six cron sweeps run daily, so
-- every morning each unresolved item minted a brand-new key and therefore a
-- brand-new notification. The dedupe never failed — it was handed an identity
-- designed to change.
--
-- State before this migration:
--   6,935 notifications, only 852 distinct by (recipient, source, title)
--   6,083 redundant copies (88%), 5,364 unread, across 16 recipients
--
-- What this does: keeps the NEWEST notification per
-- (recipient_id, source_table, source_id, title) and deletes the rest.
--
-- The one subtlety worth the extra step: a duplicate group often contains
-- copies the recipient already read or archived. Deleting those and keeping an
-- unread newer copy would RESURFACE 1,316 items people had already dealt
-- with — turning a cleanup into a fresh pile of noise. So the survivor first
-- inherits the group's earliest read/archived state. Someone who dismissed a
-- notification stays dismissed.
--
-- Idempotent: after it runs there are no duplicate groups left, so a re-run
-- matches nothing.

-- ---------------------------------------------------------------------------
-- 1. Rank each notification within its duplicate group.
-- ---------------------------------------------------------------------------
drop table if exists _notification_dedupe;
create temporary table _notification_dedupe as
select
  id,
  recipient_id,
  source_table,
  source_id,
  title,
  status,
  read_at,
  archived_at,
  row_number() over (
    partition by recipient_id, source_table, source_id, title
    order by created_at desc, id desc
  ) as rn
from public.notifications;

create index on _notification_dedupe (recipient_id, source_table, source_id, title);

-- ---------------------------------------------------------------------------
-- 2. Carry the group's "already dealt with" state onto the survivor.
--    Uses the EARLIEST read/archived timestamp in the group, because that is
--    when the recipient actually acted on it.
-- ---------------------------------------------------------------------------
with group_state as (
  select
    recipient_id,
    source_table,
    source_id,
    title,
    min(read_at) filter (where read_at is not null) as first_read_at,
    min(archived_at) filter (where archived_at is not null) as first_archived_at,
    bool_or(status = 'archived') as any_archived,
    bool_or(status = 'read') as any_read
  from _notification_dedupe
  group by 1, 2, 3, 4
),
survivors as (
  select d.id, g.*
  from _notification_dedupe d
  join group_state g
    on g.recipient_id is not distinct from d.recipient_id
   and g.source_table is not distinct from d.source_table
   and g.source_id is not distinct from d.source_id
   and g.title = d.title
  where d.rn = 1
)
update public.notifications n
set
  status = case
    when s.any_archived then 'archived'
    when s.any_read then 'read'
    else n.status
  end,
  read_at = coalesce(n.read_at, s.first_read_at),
  archived_at = coalesce(n.archived_at, s.first_archived_at)
from survivors s
where n.id = s.id
  and n.status = 'unread'
  and (s.any_archived or s.any_read);

-- ---------------------------------------------------------------------------
-- 3. Delete the redundant copies.
-- ---------------------------------------------------------------------------
delete from public.notifications n
using _notification_dedupe d
where n.id = d.id
  and d.rn > 1;
