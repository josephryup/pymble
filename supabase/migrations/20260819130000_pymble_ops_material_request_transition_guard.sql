-- =============================================================================
-- Workflow audit — Phase 1: the material request state machine, enforced
-- 19 August 2026
--
-- The application now routes every status write through one guarded helper
-- (`transitionMaterialRequest` in src/lib/ops/material-request-lifecycle.ts).
-- This makes the same rule true at the database, so a future writer that
-- forgets — a script, a console fix, a new module — fails loudly instead of
-- quietly corrupting a request the way ten scattered writers did before.
--
-- ── What went wrong without it ──────────────────────────────────────────────
--   • Two rival writers advanced requests to `ordered`; one recorded no money.
--   • The approval sync wrote status with no prior-state filter at all, so a
--     stale decision could throw a priced or ordered request back to
--     `pricing_pending`.
--   • Converting a requisition into DRAFT purchase orders closed the request,
--     stranding four requests as `closed` against orders never issued.
--
-- ── Deliberately permissive in three places ─────────────────────────────────
--   • A no-op update (status unchanged) always passes — most updates touch
--     other columns and must not be caught by this.
--   • Anything may move to `cancelled` except the terminal states.
--   • `priced -> priced`, `ordered -> ordered` and `delivered -> delivered`
--     are no-ops by the rule above; re-running a round is legitimate.
--
-- `closed` deliberately does NOT accept `approved`: a request that was never
-- ordered has nothing to close, and that edge existed only through the
-- requisition-conversion bug.
-- =============================================================================

create or replace function ops_guard_material_request_transition()
returns trigger
language plpgsql
as $$
declare
  ok boolean;
begin
  -- Status unchanged: not a transition, nothing to police.
  if new.status = old.status then
    return new;
  end if;

  ok := case
    -- Raise / re-raise
    when old.status in ('draft','rejected')            and new.status = 'submitted'       then true
    -- Operations review
    when old.status = 'submitted'                      and new.status = 'in_review'       then true
    when old.status in ('submitted','in_review')       and new.status = 'pricing_pending' then true
    when old.status in ('submitted','in_review')       and new.status = 'rejected'        then true
    -- Procurement pricing
    when old.status = 'pricing_pending'                and new.status = 'priced'          then true
    -- Cost decision (Finance, then the MD for IT)
    when old.status = 'priced'                         and new.status = 'md_review'       then true
    when old.status in ('priced','md_review')          and new.status = 'approved'        then true
    when old.status in ('priced','md_review')          and new.status = 'rejected'        then true
    -- Procurement ordering
    when old.status in ('approved','partially_ordered') and new.status = 'ordered'           then true
    when old.status in ('approved','partially_ordered') and new.status = 'partially_ordered' then true
    -- Delivery and close
    when old.status in ('ordered','partially_ordered')            and new.status = 'delivered' then true
    when old.status in ('ordered','partially_ordered','delivered') and new.status = 'closed'   then true
    -- Withdrawal, from anywhere that has not already finished
    when old.status not in ('closed','cancelled')      and new.status = 'cancelled'       then true
    else false
  end;

  if not ok then
    raise exception
      'Illegal material request transition: % -> % (request %). Legal edges are declared in src/lib/ops/material-request-lifecycle.ts; route the write through transitionMaterialRequest().',
      old.status, new.status, old.request_number
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

comment on function ops_guard_material_request_transition() is
  'Workflow audit Phase 1: enforces the material request state machine. Mirrors MATERIAL_REQUEST_TRANSITIONS in src/lib/ops/material-request-lifecycle.ts — change both together.';

drop trigger if exists ops_material_request_transition_guard on material_requests;

create trigger ops_material_request_transition_guard
  before update of status on material_requests
  for each row
  execute function ops_guard_material_request_transition();
