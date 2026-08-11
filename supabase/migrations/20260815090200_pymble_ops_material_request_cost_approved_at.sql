-- Separate the two approvals a material request receives.
--
-- `approved_at` is written by two different events into one column:
--   • approval-actions.ts, when the Operations/PM chain completes and the
--     request moves to `pricing_pending` — the operational green light;
--   • material-request-actions.ts, at the Finance/MD cost approval — the
--     authority to spend the money.
--
-- The second overwrites the first, so the column means "operations approved"
-- until Finance decides and "Finance approved" afterwards. Any report reading
-- it alone counts both: measured over August the funnel called K749,994 of
-- still-being-priced requests "approved by Finance", when the last cost
-- approval was 21 July.
--
-- The existing comment in approval-actions.ts already says these are meant to
-- be different timestamps. This gives the second one its own column so they
-- actually are.

alter table public.material_requests
  add column if not exists cost_approved_at timestamptz,
  add column if not exists cost_approved_by uuid references public.users (id);

comment on column public.material_requests.cost_approved_at is
  'When Finance (or the MD, for IT) approved the COST. Distinct from approved_at, which is the operational green light that sends the request for pricing.';

-- Backfill from the audit trail. This is recovered fact, not invention: every
-- cost approval already wrote a `material_request.cost_approved` event
-- carrying the request id, the actor and the instant (24 of them, 2026-06-29
-- to 2026-07-21). Decision D3 forbids inventing history, not reading it.
update public.material_requests m
set cost_approved_at = a.created_at,
    cost_approved_by = a.actor_user_id
from (
  select distinct on (entity_id)
    entity_id, created_at, actor_user_id
  from public.audit_events
  where action = 'material_request.cost_approved'
  order by entity_id, created_at desc
) a
where a.entity_id = m.id
  and m.cost_approved_at is null;

-- Reporting reads "what did Finance approve in this period" off this.
create index if not exists material_requests_cost_approved_at_idx
  on public.material_requests (cost_approved_at);
