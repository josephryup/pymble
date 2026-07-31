-- Pymble Operations — clear the two remaining leak-detector flags
--
-- Both are on site 0004 and both are determinate, so they are fixed here rather
-- than left for Finance (unlike the suspected K2.8m duplicate on site 0001,
-- which stays untouched because only Finance can decide whether it is a
-- mis-key).
--
-- FLAG 1 — the site's spend was split across two open budgets.
--
--   BUD-20260703-2CE6C9 "Budget generated from Unplanned spend"
--       auto-created by ensureBudgetLineForCategory. 2 lines, K0 budgeted,
--       6 cost entries, 9 requests.
--   BUD-20260722-2D05CC "PRACTICAL COMPLETION BUDGET"
--       Finance's real budget. 13 lines, K904,672 budgeted, 10 cost entries,
--       9 requests.
--
--   This is audit D7 doing actual damage rather than threatening to: sixteen
--   cost entries for one site, answering to two different budgets, so neither
--   budget's variance was ever true. The Phase 0 index now prevents two
--   *active* budgets, but these are both drafts, and the resolver's
--   "most recent draft" rule is what let the split happen.
--
--   Consolidation is safe because the placeholder was created by our own
--   helper and holds no budgeted amounts: its two lines (unplanned, transport)
--   have exact counterparts in the real budget, matched on category with
--   source='boq'. Everything is repointed there, the emptied lines are removed,
--   and the placeholder is archived. No amount changes anywhere.
--
-- FLAG 2 — five live requests carrying no budget line.
--
--   All five predate the 2026-07-29 linkage migrations and are still live
--   (2 pricing_pending, 3 approved), so unlike the D6 backfill these are not
--   history — they are spend about to happen with nothing to charge it to.
--   None links to a schedule line, so each resolves to the site's
--   unplanned/contingency line exactly as resolveMaterialRequestBudgetLine
--   would do today, and their items inherit that line's cost code.
--
-- Idempotent: guarded throughout, so re-running is a no-op.

-- ---------------------------------------------------------------------------
-- 1. Identify, per site, the budget to keep and the placeholder to retire.
--    "Keep" = the open budget carrying real money; a placeholder is only ever
--    retired when a funded sibling exists, so a site can never lose its only
--    budget to this migration.
-- ---------------------------------------------------------------------------
drop table if exists _budget_consolidation;
create temporary table _budget_consolidation as
with open_budgets as (
  select b.id, b.site_id, b.created_at,
    coalesce((
      select sum(l.budgeted_amount) from public.project_budget_lines l
      where l.budget_id = b.id
    ), 0) as amount
  from public.project_budgets b
  where b.status in ('draft', 'active')
),
sites_with_many as (
  select site_id from open_budgets group by site_id having count(*) > 1
),
keeper as (
  select distinct on (o.site_id) o.site_id, o.id as keep_id
  from open_budgets o
  join sites_with_many m on m.site_id = o.site_id
  order by o.site_id, o.amount desc, o.created_at desc
)
select o.site_id, k.keep_id, o.id as retire_id
from open_budgets o
join keeper k on k.site_id = o.site_id
join sites_with_many m on m.site_id = o.site_id
where o.id <> k.keep_id
  -- Only ever retire a budget with nothing budgeted on it.
  and o.amount = 0;

-- ---------------------------------------------------------------------------
-- 2. Map each retiring line to its counterpart in the keeper budget.
-- ---------------------------------------------------------------------------
drop table if exists _line_remap;
create temporary table _line_remap as
select old.id as old_line_id, new.id as new_line_id, c.keep_id as new_budget_id
from _budget_consolidation c
join public.project_budget_lines old on old.budget_id = c.retire_id
join public.project_budget_lines new
  on new.budget_id = c.keep_id
 and new.category = old.category
 and new.source = old.source;

-- ---------------------------------------------------------------------------
-- 3. Repoint everything that referenced a retiring line.
-- ---------------------------------------------------------------------------
update public.project_cost_entries e
set budget_line_id = r.new_line_id,
    budget_id = r.new_budget_id,
    cost_code_id = coalesce(nl.cost_code_id, e.cost_code_id)
from _line_remap r
join public.project_budget_lines nl on nl.id = r.new_line_id
where e.budget_line_id = r.old_line_id;

update public.material_requests m
set budget_line_id = r.new_line_id
from _line_remap r
where m.budget_line_id = r.old_line_id;

update public.material_requests m
set transport_budget_line_id = r.new_line_id
from _line_remap r
where m.transport_budget_line_id = r.old_line_id;

update public.payment_requests p
set budget_line_id = r.new_line_id,
    budget_id = r.new_budget_id
from _line_remap r
where p.budget_line_id = r.old_line_id;

update public.payment_request_items pi
set budget_line_id = r.new_line_id
from _line_remap r
where pi.budget_line_id = r.old_line_id;

-- Any cost entry still pointing at the retiring budget header only.
update public.project_cost_entries e
set budget_id = c.keep_id
from _budget_consolidation c
where e.budget_id = c.retire_id;

update public.payment_requests p
set budget_id = c.keep_id
from _budget_consolidation c
where p.budget_id = c.retire_id;

-- ---------------------------------------------------------------------------
-- 4. Remove the emptied lines, then archive the placeholder budget. Both
--    guarded on nothing referencing them, so a failed repoint above leaves the
--    placeholder in place (visible in the leak detector) rather than
--    orphaning a link.
-- ---------------------------------------------------------------------------
delete from public.project_budget_lines l
using _budget_consolidation c
where l.budget_id = c.retire_id
  and not exists (select 1 from public.project_cost_entries e where e.budget_line_id = l.id)
  and not exists (select 1 from public.material_requests m where m.budget_line_id = l.id)
  and not exists (
    select 1 from public.material_requests m where m.transport_budget_line_id = l.id
  )
  and not exists (select 1 from public.payment_requests p where p.budget_line_id = l.id)
  and not exists (
    select 1 from public.payment_request_items pi where pi.budget_line_id = l.id
  );

update public.project_budgets b
set status = 'archived',
    archived_at = now(),
    description = case
      when length(btrim(b.description)) > 0 then b.description || ' '
      else ''
    end || '(Superseded and archived by the audit D7 budget consolidation — its lines and spend were merged into this site''s funded budget.)'
from _budget_consolidation c
where b.id = c.retire_id
  and not exists (
    select 1 from public.project_budget_lines l where l.budget_id = b.id
  );

-- ---------------------------------------------------------------------------
-- 5. Flag 2: give the five live requests a budget line and their items a
--    cost code, exactly as the application would resolve them today.
-- ---------------------------------------------------------------------------
drop table if exists _unplanned_lines;
create temporary table _unplanned_lines as
select distinct on (b.site_id) b.site_id, l.id as line_id, l.cost_code_id
from public.project_budgets b
join public.project_budget_lines l
  on l.budget_id = b.id and l.category = 'unplanned' and l.source = 'boq'
where b.status in ('draft', 'active')
order by b.site_id, (b.status = 'active') desc, b.created_at desc;

drop table if exists _transport_lines;
create temporary table _transport_lines as
select distinct on (b.site_id) b.site_id, l.id as line_id
from public.project_budgets b
join public.project_budget_lines l
  on l.budget_id = b.id and l.category = 'transport' and l.source = 'boq'
where b.status in ('draft', 'active')
order by b.site_id, (b.status = 'active') desc, b.created_at desc;

update public.material_requests m
set budget_line_id = u.line_id
from _unplanned_lines u
where u.site_id = m.site_id
  and m.scope = 'site'
  and m.archived_at is null
  and m.budget_line_id is null
  and m.status not in ('draft', 'rejected', 'cancelled');

update public.material_requests m
set transport_budget_line_id = t.line_id
from _transport_lines t
where t.site_id = m.site_id
  and m.scope = 'site'
  and m.archived_at is null
  and m.transport_budget_line_id is null
  and m.status not in ('draft', 'rejected', 'cancelled');

update public.material_request_items i
set cost_code_id = l.cost_code_id
from public.material_requests m
join public.project_budget_lines l on l.id = m.budget_line_id
where i.request_id = m.id
  and i.cost_code_id is null
  and l.cost_code_id is not null;
