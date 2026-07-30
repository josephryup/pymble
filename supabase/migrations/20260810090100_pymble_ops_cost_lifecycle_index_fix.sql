-- Pymble Operations — correct the lifecycle uniqueness keys
--
-- 20260810090000 widened the material-request cost-entry indexes to include
-- lifecycle_state, but keyed them on (material_request_id, lifecycle_state)
-- with the goods/transport split expressed as a partial predicate. Two
-- problems with that:
--
--   1. `cost_type` belongs IN the key, not in the predicate. Expressing it as
--      `cost_type <> 'transport'` was already a workaround for there being
--      exactly two cost types; it stops being true the moment a third exists.
--
--   2. More seriously: relief. When a request is cancelled, every live station
--      it holds becomes `released`. With `released` inside a uniqueness key,
--      a request holding both a reservation AND a commitment could not release
--      both — the second would violate the index. Relief would fail exactly
--      when it matters most.
--
-- Fix: key on (material_request_id, cost_type, lifecycle_state) and exclude
-- released rows from uniqueness entirely. Released entries are inert history;
-- there is no reason to constrain how many a request accumulates, and every
-- reason to let it release everything it holds.

drop index if exists public.project_cost_entries_material_request_goods_unique;
drop index if exists public.project_cost_entries_material_request_transport_unique;

create unique index if not exists project_cost_entries_material_request_station_unique
  on public.project_cost_entries (material_request_id, cost_type, lifecycle_state)
  where material_request_id is not null and lifecycle_state <> 'released';

comment on index public.project_cost_entries_material_request_station_unique is
  'One ledger entry per (material request, cost type, lifecycle station). Released rows are excluded so a request can relieve every station it holds — see audit §8.4.';
