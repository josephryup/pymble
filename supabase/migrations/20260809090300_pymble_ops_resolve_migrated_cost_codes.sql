-- Pymble Operations — resolve the five flagged (MIG.*) cost codes
--
-- Follow-up to 20260809090200. That migration deliberately parked five
-- free-text categories on MIG.* codes rather than guessing. Reading the budget
-- line and schedule line *descriptions* resolved all five, so this migration
-- retires the MIG codes entirely and leaves the library clean.
--
-- What each description revealed:
--
--   phase_1_3no_culverts            "Core Materials" ×2, site 0001
--       → the category names a phase AND its work. Becomes a real phase node
--         "P1 — Phase 1: 3no Culverts" with a 32.20 Culverts and stormwater
--         drainage leaf beneath it. This is the first genuine phase node in
--         the system and the shape every project should follow.
--
--   external_and_internal_finishes  "Ceiling and Painting", site 0004
--       → spans 09.40 Ceilings and 09.30 Painting. Two trades, one
--         un-split amount.
--
--   genset_house                    "Construction", site 0004
--       → constructing a structure: concrete, blockwork, roofing, electrical.
--
--   ancillary_works                 "Soakaway and bollards installation"
--       → spans 22.40 Septic/soakaway and external works. Two unrelated
--         trades, one un-split amount.
--
--   general                         3× "Steel" (site 001), 1× "Test" (0002)
--       → "Steel" is unambiguous: 03.20 Reinforcement steel. "Test" is test
--         data and stays uncategorised.
--
-- On the three "composite" cases: the honest problem was never that the scope
-- was unknowable — it is that the library lacked codes at the level the
-- estimate was actually prepared at. Division-level composite codes are a
-- legitimate construct (Sage 300 CRE and Viewpoint both carry them), so this
-- adds a real "Composite and Packaged Works" division instead of leaving
-- migration artefacts in place. The codes are NOT system_locked and their
-- names say "not broken down", so they read as a prompt to improve the
-- estimate rather than as a permanent home. No money moves.
--
-- ⚠ NOT FIXED HERE, DELIBERATELY: site 0001 carries two budget lines with the
-- same description ("Core Materials") and the same amount (K2,814,048.14
-- each, K5,628,096.28 total). That is very likely one line entered twice,
-- which would overstate the budget by K2.8m. Both are migrated faithfully and
-- a leak-detector check now surfaces the pair. Deleting a budget line on
-- suspicion is Finance's decision, not a migration's.

-- ---------------------------------------------------------------------------
-- 1. Real library codes for work that was estimated as a package.
-- ---------------------------------------------------------------------------
insert into public.cost_code_library
  (code, name, division, kind, gl_account_id, description, system_locked)
select v.code, v.name, 'Composite and Packaged Works',
       v.kind::public.ops_cost_code_kind, a.id, v.description, false
from (values
  ('95.00','Uncategorised — to be broken down','other','5090',
   'Holding code for lines with no meaningful classification. Every line here is an estimating gap; reassign and this code empties itself.'),
  ('95.10','Building works — composite (not broken down)','materials','5010',
   'A structure estimated as one package rather than by trade (concrete, blockwork, roofing, electrical). Split into trade codes when the next estimate is prepared.'),
  ('95.20','Finishes — composite (not broken down)','materials','5010',
   'Finishes estimated as one package. Split into 09.10 plastering, 09.20 tiling, 09.30 painting and 09.40 ceilings when the next estimate is prepared.'),
  ('95.90','Ancillary and sundry works','other','5090',
   'Genuinely mixed minor works that do not sit in one trade. Legitimate for small sundries; a large balance here means the estimate needs breaking down.')
) as v(code, name, kind, gl_code, description)
left join public.chart_of_accounts a on a.code = v.gl_code
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Site 0001: a real phase node for the culverts work.
-- ---------------------------------------------------------------------------
insert into public.project_cost_codes
  (site_id, parent_id, library_code_id, code, path, name, sort_order)
select distinct c.site_id, null::uuid, null::uuid, 'P1', 'P1',
       'Phase 1 — 3no Culverts', 1
from public.project_cost_codes c
join public.cost_code_library lib on lib.id = c.library_code_id
where lib.code = 'MIG.01'
  and not exists (
    select 1 from public.project_cost_codes p
    where p.site_id = c.site_id and p.path = 'P1'
  );

insert into public.project_cost_codes
  (site_id, parent_id, library_code_id, code, path, name, sort_order)
select distinct phase.site_id, phase.id, target.id, target.code,
       'P1.' || target.code, target.name, 1
from public.project_cost_codes old
join public.cost_code_library oldlib on oldlib.id = old.library_code_id
join public.project_cost_codes phase
  on phase.site_id = old.site_id and phase.path = 'P1'
cross join (select id, code, name from public.cost_code_library where code = '32.20') target
where oldlib.code = 'MIG.01'
  and not exists (
    select 1 from public.project_cost_codes n
    where n.site_id = phase.site_id and n.path = 'P1.' || target.code
  );

-- ---------------------------------------------------------------------------
-- 3. Leaves for every other remap target, under the existing GEN phase.
-- ---------------------------------------------------------------------------
drop table if exists _mig_remap;
create temporary table _mig_remap (
  from_code text not null,
  to_code text not null,
  -- Restrict a remap to one site when the same MIG code resolved differently
  -- per site (MIG.00 → 03.20 on site 001, but 95.00 on 0002).
  only_site_code text
);

insert into _mig_remap (from_code, to_code, only_site_code) values
  ('MIG.02','95.10', null),
  ('MIG.03','95.90', null),
  ('MIG.04','95.20', null),
  ('MIG.00','03.20', '001'),
  ('MIG.00','95.00', '0002');

insert into public.project_cost_codes
  (site_id, parent_id, library_code_id, code, path, name, sort_order)
select distinct old.site_id, phase.id, target.id, target.code,
       'GEN.' || target.code, target.name, old.sort_order
from _mig_remap r
join public.cost_code_library fromlib on fromlib.code = r.from_code
join public.project_cost_codes old
  on old.library_code_id = fromlib.id
join public.sites s on s.id = old.site_id
join public.cost_code_library target on target.code = r.to_code
join public.project_cost_codes phase
  on phase.site_id = old.site_id and phase.path = 'GEN'
where (r.only_site_code is null or s.code = r.only_site_code)
  and not exists (
    select 1 from public.project_cost_codes n
    where n.site_id = old.site_id and n.path = 'GEN.' || target.code
  );

-- ---------------------------------------------------------------------------
-- 4. Repoint the documents. Budget lines and cost entries are ON DELETE
--    RESTRICT, so this must complete before step 5 can remove anything.
-- ---------------------------------------------------------------------------

-- Site 0001 culverts budget lines → the new P1.32.20 leaf.
update public.project_budget_lines l
set cost_code_id = target.id
from public.project_cost_codes old
join public.cost_code_library oldlib on oldlib.id = old.library_code_id
join public.project_cost_codes target
  on target.site_id = old.site_id and target.path = 'P1.32.20'
where l.cost_code_id = old.id
  and oldlib.code = 'MIG.01';

-- Everything else → its GEN.<target> leaf.
update public.project_budget_lines l
set cost_code_id = target.id
from _mig_remap r
join public.cost_code_library fromlib on fromlib.code = r.from_code
join public.project_cost_codes old on old.library_code_id = fromlib.id
join public.sites s on s.id = old.site_id
join public.project_cost_codes target
  on target.site_id = old.site_id and target.path = 'GEN.' || r.to_code
where l.cost_code_id = old.id
  and (r.only_site_code is null or s.code = r.only_site_code);

update public.boq_line_items i
set cost_code_id = target.id
from _mig_remap r
join public.cost_code_library fromlib on fromlib.code = r.from_code
join public.project_cost_codes old on old.library_code_id = fromlib.id
join public.sites s on s.id = old.site_id
join public.project_cost_codes target
  on target.site_id = old.site_id and target.path = 'GEN.' || r.to_code
where i.cost_code_id = old.id
  and (r.only_site_code is null or s.code = r.only_site_code);

update public.project_cost_entries e
set cost_code_id = target.id
from _mig_remap r
join public.cost_code_library fromlib on fromlib.code = r.from_code
join public.project_cost_codes old on old.library_code_id = fromlib.id
join public.sites s on s.id = old.site_id
join public.project_cost_codes target
  on target.site_id = old.site_id and target.path = 'GEN.' || r.to_code
where e.cost_code_id = old.id
  and (r.only_site_code is null or s.code = r.only_site_code);

update public.material_request_items mi
set cost_code_id = target.id
from _mig_remap r
join public.cost_code_library fromlib on fromlib.code = r.from_code
join public.project_cost_codes old on old.library_code_id = fromlib.id
join public.sites s on s.id = old.site_id
join public.project_cost_codes target
  on target.site_id = old.site_id and target.path = 'GEN.' || r.to_code
where mi.cost_code_id = old.id
  and (r.only_site_code is null or s.code = r.only_site_code);

-- ---------------------------------------------------------------------------
-- 5. Retire the MIG leaves and then the MIG library codes. Guarded on nothing
--    still referencing them, so a failed repoint above leaves the MIG code in
--    place (visible) instead of throwing away its link (invisible).
-- ---------------------------------------------------------------------------
delete from public.project_cost_codes c
using public.cost_code_library lib
where lib.id = c.library_code_id
  and lib.code like 'MIG.%'
  and not exists (select 1 from public.project_budget_lines l where l.cost_code_id = c.id)
  and not exists (select 1 from public.boq_line_items i where i.cost_code_id = c.id)
  and not exists (select 1 from public.project_cost_entries e where e.cost_code_id = c.id)
  and not exists (select 1 from public.material_request_items mi where mi.cost_code_id = c.id)
  and not exists (select 1 from public.project_tasks t where t.cost_code_id = c.id)
  and not exists (select 1 from public.purchase_order_items poi where poi.cost_code_id = c.id);

delete from public.cost_code_library lib
where lib.code like 'MIG.%'
  and not exists (
    select 1 from public.project_cost_codes c where c.library_code_id = lib.id
  );
