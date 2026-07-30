-- Pymble Operations — the cost-code (WBS) spine
--
-- Phase 1 of docs/pymble-ops-project-finance-spine-audit.md. Replaces the
-- free-text `category` string that the material schedule ⇄ project budget ⇄
-- material request chain currently joins on. That string join is the root
-- cause of audit findings D2 (duplicate categories crash the resolver), D3
-- (majority-category guessing misallocates cost), D9 (cost_code is free text,
-- empty on 13 of 21 lines, and unlinked from the GL) and the impossibility of
-- rolling project cost up to the general ledger at all.
--
-- Two tables, following the established ERP pattern (SAP PS work breakdown
-- structure, Viewpoint Vista / Sage 300 CRE job cost, Procore budget codes):
--
--   cost_code_library  — the company master. Owned by Finance and the MD
--                        (business decision §7.4). Each code maps to exactly
--                        one postable GL account, which IS the GL bridge:
--                        cost code → gl_account_id → chart_of_accounts.
--
--   project_cost_codes — the per-site work breakdown structure. Deliberately
--                        two levels (business decision §7.3: a material
--                        schedule is per project *phase*), enforced by a check
--                        constraint rather than convention:
--                          • parent_id IS NULL     → a phase node, no library
--                                                    code (phases are project-
--                                                    specific, not catalogue
--                                                    items)
--                          • parent_id IS NOT NULL → a trade leaf, which MUST
--                                                    reference a library code
--
-- The leaf-must-reference-the-library rule is the whole point: it is what stops
-- the taxonomy drifting back into free text. A QS who needs a code that does
-- not exist requests one from Finance instead of typing a new string.
--
-- Nothing in this migration is destructive and no existing column is dropped.
-- The document FKs land in the next migration, so this one is safe to apply on
-- its own.

-- ---------------------------------------------------------------------------
-- Cost type — what kind of resource a code consumes. Drives the default
-- project_cost_entries.cost_type and, with gl_account_id, the GL posting.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'ops_cost_code_kind') then
    create type public.ops_cost_code_kind as enum (
      'materials',
      'labour',
      'plant',
      'subcontract',
      'transport',
      'preliminaries',
      'other'
    );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- The company cost-code library.
-- ---------------------------------------------------------------------------
create table if not exists public.cost_code_library (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  -- Grouping label for the picker (e.g. "Substructure", "Finishes"). Display
  -- only — never a join key. That is what `code` is for.
  division text not null default '',
  kind public.ops_cost_code_kind not null default 'materials',
  -- The GL bridge. Restricted rather than cascading: deactivate an account,
  -- never silently orphan every cost code pointing at it.
  gl_account_id uuid references public.chart_of_accounts(id) on delete restrict,
  description text not null default '',
  -- Seeded codes may be deactivated but not deleted, mirroring
  -- chart_of_accounts.system_locked.
  system_locked boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists cost_code_library_code_unique
  on public.cost_code_library (code);
create index if not exists cost_code_library_gl_account_id_idx
  on public.cost_code_library (gl_account_id)
  where gl_account_id is not null;
create index if not exists cost_code_library_active_idx
  on public.cost_code_library (is_active, division, code);

comment on table public.cost_code_library is
  'Company master list of cost codes, owned by Finance and the MD. Each code maps to one postable GL account (gl_account_id) — this is the bridge from project cost to the general ledger. Projects instantiate these codes as project_cost_codes leaves; nobody types a cost code as free text.';
comment on column public.cost_code_library.gl_account_id is
  'The postable chart_of_accounts row every cost booked to this code posts against. Finance owns this mapping (audit §7.4).';
comment on column public.cost_code_library.kind is
  'Resource type this code consumes. Supplies the default project_cost_entries.cost_type so the ledger no longer relies on a hand-typed string.';

-- ---------------------------------------------------------------------------
-- The per-site work breakdown structure.
-- ---------------------------------------------------------------------------
create table if not exists public.project_cost_codes (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  -- NULL for a phase node; the owning phase for a trade leaf.
  parent_id uuid references public.project_cost_codes(id) on delete cascade,
  -- NULL for a phase node; required for a trade leaf.
  library_code_id uuid references public.cost_code_library(id) on delete restrict,
  -- Segment within the parent ("P1", "03.30").
  code text not null,
  -- Full dotted path within the site ("P1", "P1.03.30"). Unique per site, so
  -- it is safe to display, sort and search on.
  path text not null,
  name text not null,
  -- Optional link to the programme task this WBS node represents, so schedule
  -- and cost share one breakdown (audit §4.1). Nullable: the WBS must be
  -- usable before the programme is built, which today it must be — there are
  -- 2 project_tasks across 11 sites.
  project_task_id uuid references public.project_tasks(id) on delete set null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Exactly two levels, enforced (audit §7.3). A phase carries no library
  -- code; a leaf must carry one, which is what keeps the taxonomy from
  -- drifting back to free text.
  constraint project_cost_codes_two_level_shape check (
    (parent_id is null and library_code_id is null)
    or (parent_id is not null and library_code_id is not null)
  )
);

create unique index if not exists project_cost_codes_site_path_unique
  on public.project_cost_codes (site_id, path);
create index if not exists project_cost_codes_site_id_idx
  on public.project_cost_codes (site_id, sort_order, path);
create index if not exists project_cost_codes_parent_id_idx
  on public.project_cost_codes (parent_id)
  where parent_id is not null;
create index if not exists project_cost_codes_library_code_id_idx
  on public.project_cost_codes (library_code_id)
  where library_code_id is not null;
create index if not exists project_cost_codes_project_task_id_idx
  on public.project_cost_codes (project_task_id)
  where project_task_id is not null;

comment on table public.project_cost_codes is
  'Per-site work breakdown structure: phase nodes (parent_id null) containing trade leaves (parent_id set, library_code_id required). Every document that touches money or quantity points at a leaf, so planned/committed/actual all aggregate on one key. Two levels are enforced by project_cost_codes_two_level_shape.';
comment on column public.project_cost_codes.path is
  'Full dotted path within the site, e.g. "P1.03.30". Unique per site; safe to display and sort on.';
comment on column public.project_cost_codes.project_task_id is
  'Optional link to the programme task this node represents, so schedule progress and cost share one breakdown.';

-- ---------------------------------------------------------------------------
-- updated_at triggers, matching every other ops table.
-- ---------------------------------------------------------------------------
drop trigger if exists set_updated_at on public.cost_code_library;
create trigger set_updated_at before update on public.cost_code_library
  for each row execute function private.set_updated_at();

drop trigger if exists set_updated_at on public.project_cost_codes;
create trigger set_updated_at before update on public.project_cost_codes
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS. Reads are broad: an engineer raising a request, a QS measuring, and
-- Procurement pricing all need to pick a cost code, so restricting reads would
-- simply push people back to free text. Writes go through server actions on
-- the service role, gated by cost-code-permissions.ts (Finance/MD own the
-- library; QS/PM assemble the project WBS).
-- ---------------------------------------------------------------------------
alter table public.cost_code_library enable row level security;
alter table public.project_cost_codes enable row level security;

grant select on public.cost_code_library to authenticated;
grant all on public.cost_code_library to service_role;
grant select on public.project_cost_codes to authenticated;
grant all on public.project_cost_codes to service_role;

drop policy if exists cost_code_library_select_ops on public.cost_code_library;
create policy cost_code_library_select_ops
on public.cost_code_library
for select
to authenticated
using (private.is_active_ops_user());

drop policy if exists project_cost_codes_select_ops on public.project_cost_codes;
create policy project_cost_codes_select_ops
on public.project_cost_codes
for select
to authenticated
using (private.is_active_ops_user());
