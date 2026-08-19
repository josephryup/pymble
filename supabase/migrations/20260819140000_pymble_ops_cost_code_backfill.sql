-- =============================================================================
-- Workflow audit — Phase 2: backfill the cost-code spine (F4, F5, F6, F7)
-- 19 August 2026
--
-- The application now derives a cost code when a line is WRITTEN, so new spend
-- can no longer arrive uncharged. This migration deals with what is already in
-- the system, which the derivation will never revisit on its own:
--
--   • 84 material request items on site-scoped requests, with no cost code.
--   • 23 items on IT / general requests, which cannot have a project cost code
--     at all — they belong to a cost centre.
--   •  1 IT / general request carrying no cost centre.
--   • 16 project budget lines with no `cost_code_id`, across four sites —
--     including Kangila (K901,277) and Musangu (K523,246), whose budgets are
--     100% uncoded and therefore invisible to every control in the system.
--
-- ── Why a null cost code is worse than an imperfect one ────────────────────
-- `fetchOpsCostCodePosition` keys entirely on `cost_code_id`. A line without
-- one contributes nothing to the availability bands, nothing to the per-leaf
-- roll-up, and nothing to any variance report — the money is not "unclassified",
-- it is absent. An honest bucket that says "not broken down yet" is visible,
-- reviewable and fixable. Null is none of those things.
--
-- So the ambiguous lump-sum lines go to library code 95.00, "Uncategorised —
-- to be broken down", which exists for exactly this and reads as a to-do
-- rather than as precision nobody has earned.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. The SQL twin of ensureProjectCostCodeForLibraryCode().
--
-- Six of eleven sites have no cost code nodes at all, so a backfill that could
-- only USE existing nodes would leave those sites exactly as broken as it
-- found them. This provisions the node, under the project's default "GEN"
-- phase, creating that phase on first use — the same rule the application
-- follows, so the two cannot drift into producing different trees.
-- ---------------------------------------------------------------------------
create or replace function ops_ensure_project_cost_code(
  p_site_id uuid,
  p_library_code text,
  p_actor_user_id uuid default null
)
returns uuid
language plpgsql
as $$
declare
  v_library_id uuid;
  v_library_name text;
  v_existing_id uuid;
  v_phase_id uuid;
  v_phase_path text;
  v_node_id uuid;
begin
  select id, name into v_library_id, v_library_name
  from cost_code_library where code = p_library_code;

  if v_library_id is null then
    return null;
  end if;

  -- Already on the project under ANY phase? Reuse it. Matching on the library
  -- code rather than the path means a project that files a code under its own
  -- phase is not given a second copy under GEN.
  select id into v_existing_id
  from project_cost_codes
  where site_id = p_site_id and library_code_id = v_library_id and is_active
  order by path
  limit 1;

  if v_existing_id is not null then
    return v_existing_id;
  end if;

  select id, path into v_phase_id, v_phase_path
  from project_cost_codes
  where site_id = p_site_id and code = 'GEN' and parent_id is null;

  if v_phase_id is null then
    insert into project_cost_codes (site_id, parent_id, library_code_id, code, path, name, created_by, sort_order)
    values (p_site_id, null, null, 'GEN', 'GEN', 'General / unphased', p_actor_user_id, 0)
    returning id, path into v_phase_id, v_phase_path;
  end if;

  insert into project_cost_codes (site_id, parent_id, library_code_id, code, path, name, created_by)
  values (
    p_site_id, v_phase_id, v_library_id, p_library_code,
    v_phase_path || '.' || p_library_code, v_library_name, p_actor_user_id
  )
  on conflict do nothing
  returning id into v_node_id;

  if v_node_id is null then
    select id into v_node_id
    from project_cost_codes
    where site_id = p_site_id and path = v_phase_path || '.' || p_library_code;
  end if;

  return v_node_id;
end $$;

comment on function ops_ensure_project_cost_code(uuid, text, uuid) is
  'SQL twin of ensureProjectCostCodeForLibraryCode() in src/lib/ops/cost-code-picker.ts. Provisions a project node for a library code under the default GEN phase.';

-- ---------------------------------------------------------------------------
-- 2. Budget lines (audit F4, F5).
--
-- Category → library code. The unambiguous ones map to their real leaf; the
-- lump-sum ones ("All materials, Tools, Equipment and PPE") map to 95.00,
-- which is the library's own name for money not yet broken down.
-- ---------------------------------------------------------------------------
with mapping(category, library_code) as (
  values
    ('transport',       '90.30'),  -- Transport and logistics
    ('contigency',      '90.90'),  -- Unplanned / contingency (spelling as stored)
    ('contingency',     '90.90'),
    ('unplanned',       '90.90'),
    ('risk_management', '90.90'),  -- "Commercial Risk and Contingency"
    ('labour_cost',     '90.50'),  -- Direct labour and wages
    ('human_resource',  '90.50'),  -- "Labour and Supervision"
    ('plant',           '90.10'),  -- Plant and equipment hire
    ('mobilization',    '01.10'),  -- Site establishment and set-up ("P&G-Site focus")
    ('material_cost',   '95.00'),  -- lump sum, not broken down
    ('material_costs',  '95.00'),
    ('t_e',             '95.00')   -- mixed tools / small equipment / PPE
)
update project_budget_lines l
set cost_code_id = ops_ensure_project_cost_code(b.site_id, m.library_code)
from project_budgets b, mapping m
where l.budget_id = b.id
  and l.cost_code_id is null
  and b.site_id is not null
  and l.category = m.category;

-- Anything the map did not cover still gets a home, so no budget line is left
-- invisible. 95.00 says "break me down", which is true and actionable.
update project_budget_lines l
set cost_code_id = ops_ensure_project_cost_code(b.site_id, '95.00')
from project_budgets b
where l.budget_id = b.id
  and l.cost_code_id is null
  and b.site_id is not null;

-- ---------------------------------------------------------------------------
-- 3. Material request items on site-scoped requests (audit F6).
--
-- The same order the application derives in: the schedule line it fulfils,
-- then the budget line the request draws against, then contingency.
-- ---------------------------------------------------------------------------

-- 3a. From the schedule line.
update material_request_items i
set cost_code_id = bl.cost_code_id
from boq_line_items bl
where i.boq_line_item_id = bl.id
  and i.cost_code_id is null
  and bl.cost_code_id is not null;

-- 3b. From the request's budget line.
update material_request_items i
set cost_code_id = pbl.cost_code_id
from material_requests r
join project_budget_lines pbl on pbl.id = r.budget_line_id
where i.request_id = r.id
  and i.cost_code_id is null
  and pbl.cost_code_id is not null;

-- 3c. Contingency, so off-schedule spend is visible rather than untracked.
update material_request_items i
set cost_code_id = ops_ensure_project_cost_code(r.site_id, '90.90')
from material_requests r
where i.request_id = r.id
  and i.cost_code_id is null
  and r.site_id is not null;

-- ---------------------------------------------------------------------------
-- 4. Requests with no site (audit F7).
--
-- These can never carry a project cost code — there is no project. They get a
-- cost centre, which has its own GL account and its own reporting. The screen
-- used to tell them their spend would "charge the unplanned / contingency
-- budget", a destination that cannot exist without a site.
-- ---------------------------------------------------------------------------
update material_requests r
set cost_centre_id = cc.id
from cost_centres cc
where r.site_id is null
  and r.cost_centre_id is null
  and cc.is_active
  and cc.code = case when r.scope = 'it' then 'IT' else 'HO' end;

-- ---------------------------------------------------------------------------
-- 5. Leave the reasoning in the audit trail.
-- ---------------------------------------------------------------------------
insert into audit_events (
  action, actor_user_id, entity_id, entity_type, metadata,
  module_key, source_id, source_table, summary
)
values (
  'cost_code.backfilled',
  null,
  null,
  'project_cost_code',
  jsonb_build_object(
    'repair', 'phase2_cost_code_backfill',
    'budget_lines_uncoded_remaining', (select count(*) from project_budget_lines where cost_code_id is null),
    'site_items_uncoded_remaining', (
      select count(*) from material_request_items i
      join material_requests r on r.id = i.request_id
      where i.cost_code_id is null and r.site_id is not null
    ),
    'requests_without_cost_centre_remaining', (
      select count(*) from material_requests where site_id is null and cost_centre_id is null
    ),
    'note', 'Lump-sum budget lines were coded 95.00 (Uncategorised - to be broken down) rather than guessed at. Finance should refine them.'
  ),
  'project_budgets',
  null,
  'project_budget_lines',
  'Backfilled the cost-code spine across budget lines, request items and cost centres (workflow audit Phase 2)'
);

commit;
