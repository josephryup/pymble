-- Pymble Operations — backfill financial trace for pre-linkage requests (audit D6)
--
-- Seven delivered/closed site material requests predate the 2026-07-29 budget
-- linkage migrations: goods arrived and were paid for, but they carry no
-- budget_line_id and no project_cost_entries row — zero financial trace. Four
-- transport_requests cost entries likewise carry no budget line, so budget
-- variance under-reports them.
--
-- This backfill mirrors what the application would have done had the linkage
-- existed: resolve each site's open budget (active first, else newest draft —
-- matching findOrCreateSiteBudget), ensure its unplanned/transport lines
-- (source='boq', same shape as ensureBudgetLineForCategory), link the
-- requests and entries, and post the ledger rows. Amounts use the priced
-- total where one exists, else the engineer's estimate (marked as such in
-- the description). Every statement is guarded, so re-running is a no-op.

-- 1. Any affected site with no open budget gets a draft placeholder.
with affected_sites as (
  select distinct m.site_id
  from public.material_requests m
  where m.scope = 'site' and m.site_id is not null
    and m.status in ('delivered', 'closed')
    and not exists (
      select 1 from public.project_cost_entries c where c.material_request_id = m.id
    )
  union
  select distinct c.site_id
  from public.project_cost_entries c
  where c.budget_line_id is null and c.status <> 'cancelled' and c.site_id is not null
)
insert into public.project_budgets (site_id, title, description, status)
select
  a.site_id,
  'Budget generated from Unplanned spend',
  'Auto-created by the audit D6 backfill so historical spend has a budget to reconcile to.',
  'draft'
from affected_sites a
where not exists (
  select 1 from public.project_budgets b
  where b.site_id = a.site_id and b.status in ('draft', 'active')
);

-- 2. Ensure the chosen budget on each affected site has unplanned + transport
--    lines (source='boq'), respecting the partial unique index.
with affected_sites as (
  select distinct m.site_id
  from public.material_requests m
  where m.scope = 'site' and m.site_id is not null
    and m.status in ('delivered', 'closed')
    and not exists (
      select 1 from public.project_cost_entries c where c.material_request_id = m.id
    )
  union
  select distinct c.site_id
  from public.project_cost_entries c
  where c.budget_line_id is null and c.status <> 'cancelled' and c.site_id is not null
),
chosen as (
  select distinct on (b.site_id) b.site_id, b.id as budget_id
  from public.project_budgets b
  join affected_sites a on a.site_id = b.site_id
  where b.status in ('draft', 'active')
  order by b.site_id, (b.status = 'active') desc, b.created_at desc
),
needed as (
  select c.budget_id, v.category, v.cost_code, v.description
  from chosen c
  cross join (
    values
      ('unplanned', 'UNPLANNED',
       'Unplanned / contingency — requests not tied to a planned schedule line'),
      ('transport', 'TRANSPORT', 'Transport — planning estimate')
  ) as v(category, cost_code, description)
)
insert into public.project_budget_lines
  (budget_id, line_number, cost_code, category, description, budgeted_amount, source)
select
  n.budget_id,
  coalesce(
    (select max(l.line_number) from public.project_budget_lines l where l.budget_id = n.budget_id),
    0
  ) + row_number() over (partition by n.budget_id order by n.category),
  n.cost_code,
  n.category,
  n.description,
  0,
  'boq'
from needed n
where not exists (
  select 1 from public.project_budget_lines l
  where l.budget_id = n.budget_id and l.category = n.category and l.source = 'boq'
);

-- 3. Point the untracked delivered/closed requests at their site's unplanned
--    line. Must run before step 4, whose guard is "no cost entry yet".
with chosen as (
  select distinct on (b.site_id) b.site_id, b.id as budget_id
  from public.project_budgets b
  where b.status in ('draft', 'active')
  order by b.site_id, (b.status = 'active') desc, b.created_at desc
),
unplanned as (
  select c.site_id, l.id as line_id
  from chosen c
  join public.project_budget_lines l
    on l.budget_id = c.budget_id and l.category = 'unplanned' and l.source = 'boq'
)
update public.material_requests m
set budget_line_id = u.line_id
from unplanned u
where u.site_id = m.site_id
  and m.scope = 'site'
  and m.status in ('delivered', 'closed')
  and m.budget_line_id is null
  and not exists (
    select 1 from public.project_cost_entries c where c.material_request_id = m.id
  );

-- 4. Post the missing ledger rows: one materials entry per untracked request,
--    status 'posted' (goods arrived — mirrors the close transition).
insert into public.project_cost_entries
  (site_id, budget_id, budget_line_id, material_request_id, source_table, source_id,
   cost_type, description, amount, status, cost_date)
select
  m.site_id,
  l.budget_id,
  m.budget_line_id,
  m.id,
  'material_requests',
  m.id,
  'materials',
  m.request_number || ' / ' || m.title
    || case when act.total > 0 then '' else ' (estimated — never priced)' end
    || ' — audit D6 backfill',
  case when act.total > 0 then act.total else est.total end,
  'posted',
  coalesce(m.closed_at::date, m.delivered_at::date, current_date)
from public.material_requests m
join public.project_budget_lines l on l.id = m.budget_line_id
cross join lateral (
  select coalesce(sum(i.actual_total), 0) as total
  from public.material_request_items i where i.request_id = m.id
) act
cross join lateral (
  select coalesce(sum(i.estimated_total), 0) as total
  from public.material_request_items i where i.request_id = m.id
) est
where m.scope = 'site'
  and m.status in ('delivered', 'closed')
  and not exists (
    select 1 from public.project_cost_entries c where c.material_request_id = m.id
  );

-- 5. Link the orphaned transport entries to their site's transport line.
with chosen as (
  select distinct on (b.site_id) b.site_id, b.id as budget_id
  from public.project_budgets b
  where b.status in ('draft', 'active')
  order by b.site_id, (b.status = 'active') desc, b.created_at desc
),
transport as (
  select c.site_id, l.id as line_id, l.budget_id
  from chosen c
  join public.project_budget_lines l
    on l.budget_id = c.budget_id and l.category = 'transport' and l.source = 'boq'
)
update public.project_cost_entries c
set budget_line_id = t.line_id, budget_id = t.budget_id
from transport t
where t.site_id = c.site_id
  and c.budget_line_id is null
  and c.status <> 'cancelled';
