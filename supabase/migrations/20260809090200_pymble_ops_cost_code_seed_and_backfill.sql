-- Pymble Operations — seed the cost-code library, backfill the per-site WBS
--
-- Part 3 of Phase 1 (docs/pymble-ops-project-finance-spine-audit.md).
--
-- Two jobs:
--
--   1. Seed a standard construction cost-code library for Zambian building and
--      civils work, every code mapped to a postable COGS account (5010–5090).
--      That mapping is the GL bridge — it is why a cost booked to "09.20
--      Tiling" can post to "5010 Materials" without anyone deciding again.
--      Seeded codes are system_locked: Finance may deactivate but not delete.
--
--   2. Migrate the 15 free-text `category` strings already in use onto that
--      library, and give every affected site a work breakdown structure.
--
-- On the migration of existing categories — the honest part. Ten of the
-- fifteen map cleanly onto a standard trade code and are mapped. Five do not:
--
--      phase_1_3no_culverts            — a phase, not a trade
--      genset_house                    — a structure, not a trade
--      ancillary_works                 — undefined scope
--      external_and_internal_finishes  — spans several finishes trades
--      general                         — the BOQ default, meaningless
--
--   These get MIG.* codes flagged `division = 'Migrated — needs review'`
--   rather than being force-fitted. Guessing would silently misattribute real
--   money (phase_1_3no_culverts alone carries K5,628,096); a visible review
--   queue will not. Finance and the QS rationalise them, and the leak detector
--   reports the residue until they do.
--
-- On phases: existing budget lines predate project_budget_lines.boq_id, so
-- there is no evidence of which phase any of them belongs to. Every migrated
-- leaf therefore lands under a single "GEN — General / unphased" phase node
-- per site. That is a truthful starting point, not a guess; the QS re-parents
-- them as real phases are defined.
--
-- Idempotent throughout: re-running inserts nothing and overwrites nothing.

-- ---------------------------------------------------------------------------
-- 1. The library.
-- ---------------------------------------------------------------------------
drop table if exists _cost_code_seed;
create temporary table _cost_code_seed (
  code text primary key,
  name text not null,
  division text not null,
  kind public.ops_cost_code_kind not null,
  gl_code text not null
);

insert into _cost_code_seed (code, name, division, kind, gl_code) values
  -- Preliminaries and general
  ('01.10','Site establishment and set-up','Preliminaries and General','preliminaries','5060'),
  ('01.20','Site supervision and site staff','Preliminaries and General','labour','5030'),
  ('01.30','Temporary works and enabling works','Preliminaries and General','preliminaries','5060'),
  ('01.40','Health, safety and PPE','Preliminaries and General','preliminaries','5060'),
  ('01.50','Insurances, permits and statutory fees','Preliminaries and General','preliminaries','5060'),
  -- Earthworks and substructure
  ('02.10','Site clearance and demolition','Earthworks and Substructure','subcontract','5020'),
  ('02.20','Excavation and earthworks','Earthworks and Substructure','plant','5090'),
  ('02.30','Filling, hardcore and compaction','Earthworks and Substructure','materials','5010'),
  ('02.40','Anti-termite and soil treatment','Earthworks and Substructure','materials','5010'),
  -- Concrete
  ('03.10','Cement, sand and aggregates','Concrete','materials','5010'),
  ('03.20','Reinforcement steel','Concrete','materials','5010'),
  ('03.30','Concrete works (in-situ)','Concrete','materials','5010'),
  ('03.40','Formwork and shuttering','Concrete','materials','5010'),
  ('03.50','Precast concrete','Concrete','materials','5010'),
  -- Masonry
  ('04.10','Blockwork and brickwork','Masonry','materials','5010'),
  ('04.20','Mortar, plaster and rendering','Masonry','materials','5010'),
  -- Metals
  ('05.10','Structural steelwork','Metals','materials','5010'),
  ('05.20','Metalwork, railings and balustrades','Metals','materials','5010'),
  -- Carpentry and joinery
  ('06.10','Roof timber and trusses','Carpentry and Joinery','materials','5010'),
  ('06.20','Doors, frames and ironmongery','Carpentry and Joinery','materials','5010'),
  ('06.30','Joinery, fittings and built-in units','Carpentry and Joinery','materials','5010'),
  -- Roofing and waterproofing
  ('07.10','Roof sheeting and accessories','Roofing and Waterproofing','materials','5010'),
  ('07.20','Waterproofing and damp-proofing','Roofing and Waterproofing','materials','5010'),
  -- Openings
  ('08.10','Aluminium doors and windows','Openings','materials','5010'),
  ('08.20','Glazing','Openings','materials','5010'),
  -- Finishes
  ('09.10','Plastering and floor screeds','Finishes','materials','5010'),
  ('09.20','Tiling and accessories','Finishes','materials','5010'),
  ('09.30','Painting and decorating','Finishes','materials','5010'),
  ('09.40','Ceilings and partitions','Finishes','materials','5010'),
  -- Plumbing and drainage
  ('22.10','Plumbing works and pipework','Plumbing and Drainage','materials','5010'),
  ('22.20','Sanitaryware and fittings','Plumbing and Drainage','materials','5010'),
  ('22.30','Drainage and sewer reticulation','Plumbing and Drainage','materials','5010'),
  ('22.40','Septic tank and soakaway','Plumbing and Drainage','materials','5010'),
  ('22.50','Water reticulation and storage','Plumbing and Drainage','materials','5010'),
  ('22.60','Oil and grease interceptor','Plumbing and Drainage','materials','5010'),
  -- Electrical
  ('26.10','Electrical installation','Electrical','materials','5010'),
  ('26.20','Generator, changeover and standby power','Electrical','materials','5010'),
  ('26.30','Solar and backup power','Electrical','materials','5010'),
  -- External works
  ('32.10','Roads, driveways and paving','External Works','materials','5010'),
  ('32.20','Culverts and stormwater drainage','External Works','materials','5010'),
  ('32.30','Fencing, gates and boundary walls','External Works','materials','5010'),
  ('32.40','Landscaping and site finishes','External Works','materials','5010'),
  -- Cross-cutting resources. Not trades — these are the codes that catch cost
  -- which belongs to a project but not to a work section.
  ('90.10','Plant and equipment hire','Resources','plant','5040'),
  ('90.20','Fuel','Resources','plant','5050'),
  ('90.30','Transport and logistics','Resources','transport','5080'),
  ('90.40','Subcontractor works','Resources','subcontract','5020'),
  ('90.50','Direct labour and wages','Resources','labour','5030'),
  ('90.60','Equipment maintenance and repairs','Resources','plant','5070'),
  ('90.90','Unplanned / contingency','Resources','other','5090');

insert into public.cost_code_library (code, name, division, kind, gl_account_id, system_locked)
select s.code, s.name, s.division, s.kind, a.id, true
from _cost_code_seed s
left join public.chart_of_accounts a on a.code = s.gl_code
on conflict (code) do nothing;

-- Codes for the five categories that do not map to a standard trade. Not
-- system_locked: these exist to be rationalised away.
insert into public.cost_code_library (code, name, division, kind, gl_account_id, description, system_locked)
select v.code, v.name, 'Migrated — needs review', v.kind::public.ops_cost_code_kind, a.id, v.description, false
from (values
  ('MIG.00','Uncategorised (migrated)','other','5090',
   'Placeholder for the BOQ default category "general". Reassign each line to a real trade code, then deactivate this.'),
  ('MIG.01','Phase 1 — 3no culverts (migrated)','materials','5010',
   'Was a free-text budget category describing a phase, not a trade. Split into a real phase node with 32.20 Culverts beneath it.'),
  ('MIG.02','Genset house (migrated)','materials','5010',
   'A structure spanning several trades (concrete, blockwork, roofing, electrical). Break down or keep as a sub-phase.'),
  ('MIG.03','Ancillary works (migrated)','other','5090',
   'Undefined scope. Reassign to the trades it actually covered.'),
  ('MIG.04','External and internal finishes (migrated)','materials','5010',
   'Spans 09.10 plastering, 09.20 tiling, 09.30 painting and 09.40 ceilings. Split when the next budget is drafted.')
) as v(code, name, kind, gl_code, description)
left join public.chart_of_accounts a on a.code = v.gl_code
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Map each free-text category to a library code.
-- ---------------------------------------------------------------------------
drop table if exists _category_map;
create temporary table _category_map (
  category text primary key,
  library_code text not null
);

insert into _category_map (category, library_code) values
  -- Clean matches.
  ('transport','90.30'),
  ('unplanned','90.90'),
  ('concrete_works','03.30'),
  ('plumbing_works','22.10'),
  ('tiling_and_accesories','09.20'),
  ('aluminium_doors_and_windows','08.10'),
  ('water_reticulation','22.50'),
  ('septic_and_soakaway','22.40'),
  ('oil_interceptor','22.60'),
  ('driveways','32.10'),
  -- Flagged for review rather than guessed.
  ('general','MIG.00'),
  ('phase_1_3no_culverts','MIG.01'),
  ('genset_house','MIG.02'),
  ('ancillary_works','MIG.03'),
  ('external_and_internal_finishes','MIG.04');

-- ---------------------------------------------------------------------------
-- 3. One "GEN" phase node per affected site.
-- ---------------------------------------------------------------------------
insert into public.project_cost_codes (site_id, parent_id, library_code_id, code, path, name, sort_order)
select distinct b.site_id, null::uuid, null::uuid, 'GEN', 'GEN', 'General / unphased (migrated)', 0
from public.project_budgets b
join public.project_budget_lines l on l.budget_id = b.id
where not exists (
  select 1 from public.project_cost_codes c
  where c.site_id = b.site_id and c.path = 'GEN'
);

insert into public.project_cost_codes (site_id, parent_id, library_code_id, code, path, name, sort_order)
select distinct d.site_id, null::uuid, null::uuid, 'GEN', 'GEN', 'General / unphased (migrated)', 0
from public.boq_documents d
join public.boq_line_items i on i.boq_id = d.id
where not exists (
  select 1 from public.project_cost_codes c
  where c.site_id = d.site_id and c.path = 'GEN'
);

-- ---------------------------------------------------------------------------
-- 4. A trade leaf under GEN for every category each site actually uses.
-- ---------------------------------------------------------------------------
drop table if exists _site_categories;
create temporary table _site_categories (site_id uuid, category text);

insert into _site_categories (site_id, category)
select distinct b.site_id, l.category
from public.project_budget_lines l
join public.project_budgets b on b.id = l.budget_id
where coalesce(l.category, '') <> ''
union
select distinct d.site_id, coalesce(nullif(i.category, ''), 'general')
from public.boq_line_items i
join public.boq_documents d on d.id = i.boq_id;

insert into public.project_cost_codes
  (site_id, parent_id, library_code_id, code, path, name, sort_order)
select
  sc.site_id,
  phase.id,
  lib.id,
  lib.code,
  'GEN.' || lib.code,
  lib.name,
  row_number() over (partition by sc.site_id order by lib.code)
from _site_categories sc
join _category_map m on m.category = sc.category
join public.cost_code_library lib on lib.code = m.library_code
join public.project_cost_codes phase
  on phase.site_id = sc.site_id and phase.path = 'GEN'
where not exists (
  select 1 from public.project_cost_codes c
  where c.site_id = sc.site_id and c.path = 'GEN.' || lib.code
);

-- ---------------------------------------------------------------------------
-- 5. Point the existing documents at their new leaves.
-- ---------------------------------------------------------------------------

-- Budget lines.
update public.project_budget_lines l
set cost_code_id = leaf.id
from public.project_budgets b, _category_map m, public.cost_code_library lib,
     public.project_cost_codes leaf
where b.id = l.budget_id
  and m.category = l.category
  and lib.code = m.library_code
  and leaf.site_id = b.site_id
  and leaf.path = 'GEN.' || lib.code
  and l.cost_code_id is null;

-- Schedule lines.
update public.boq_line_items i
set cost_code_id = leaf.id
from public.boq_documents d, _category_map m, public.cost_code_library lib,
     public.project_cost_codes leaf
where d.id = i.boq_id
  and m.category = coalesce(nullif(i.category, ''), 'general')
  and lib.code = m.library_code
  and leaf.site_id = d.site_id
  and leaf.path = 'GEN.' || lib.code
  and i.cost_code_id is null;

-- Cost entries inherit from the budget line they are charged to — the ledger
-- and the budget must never disagree about which code money sits on.
update public.project_cost_entries c
set cost_code_id = l.cost_code_id
from public.project_budget_lines l
where l.id = c.budget_line_id
  and l.cost_code_id is not null
  and c.cost_code_id is null;

-- Request items inherit from the schedule line they fulfil, where linked.
update public.material_request_items i
set cost_code_id = b.cost_code_id
from public.boq_line_items b
where b.id = i.boq_line_item_id
  and b.cost_code_id is not null
  and i.cost_code_id is null;

-- Generated budget lines: record which schedule produced them where it can be
-- established unambiguously (exactly one live issued schedule on the site).
update public.project_budget_lines l
set boq_id = pick.boq_id
from public.project_budgets b,
     lateral (
       select d.id as boq_id
       from public.boq_documents d
       where d.site_id = b.site_id
         and d.status = 'issued'
         and d.superseded_at is null
         and d.archived_at is null
         and d.deleted_at is null
       limit 2
     ) pick
where b.id = l.budget_id
  and l.source = 'boq'
  and l.boq_id is null
  and (
    select count(*) from public.boq_documents d2
    where d2.site_id = b.site_id
      and d2.status = 'issued'
      and d2.superseded_at is null
      and d2.archived_at is null
      and d2.deleted_at is null
  ) = 1;
