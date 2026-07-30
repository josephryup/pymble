-- Pymble Operations — hang every costed document off the cost-code spine
--
-- Part 2 of Phase 1 (docs/pymble-ops-project-finance-spine-audit.md). Adds a
-- nullable cost_code_id to each document that carries money or quantity, so
-- estimate → budget → requisition → commitment → actual all aggregate on ONE
-- key instead of on a free-text category string.
--
-- Every column is nullable and nothing is dropped: existing rows keep working
-- unchanged, `category` keeps rendering, and the FKs fill in as the backfill
-- and then normal use populate them. The spine becomes authoritative only once
-- coverage is complete — which the leak detector will report on.
--
-- Also lands two structural fixes the audit called for alongside the spine:
--
--   • project_budget_lines.boq_id — which material schedule generated this
--     line. The D14 companion: with schedules per project phase, the budget
--     needs to know which phase owns each generated line, so a phase can be
--     revised or retired without touching its siblings. The Phase 0 fix made
--     the sync recompute from all live schedules; this makes the ownership
--     explicit and queryable.
--
--   • boq_documents.phase_cost_code_id — the phase this schedule covers,
--     as a real FK rather than a convention buried in `title` (audit §7.3).

-- ---------------------------------------------------------------------------
-- The seven costed documents.
-- ---------------------------------------------------------------------------

-- Programme: lets schedule progress roll up by the same breakdown as cost,
-- which is the precondition for earned-value reporting later (Phase 6).
alter table public.project_tasks
  add column if not exists cost_code_id uuid
    references public.project_cost_codes(id) on delete set null;

-- Estimate.
alter table public.boq_line_items
  add column if not exists cost_code_id uuid
    references public.project_cost_codes(id) on delete set null;

-- Budget. `restrict` here rather than `set null`: a budget line is the one
-- place the cost code carries authorised money, so silently detaching it
-- would leave money attributed to nothing.
alter table public.project_budget_lines
  add column if not exists cost_code_id uuid
    references public.project_cost_codes(id) on delete restrict;

-- Requisition (per item, since one request spans several codes — this is what
-- makes audit D3's majority-category guessing unnecessary).
alter table public.material_request_items
  add column if not exists cost_code_id uuid
    references public.project_cost_codes(id) on delete set null;

-- Commitment.
alter table public.purchase_order_items
  add column if not exists cost_code_id uuid
    references public.project_cost_codes(id) on delete set null;

-- Actual / accrual. Same reasoning as the budget line: `restrict`.
alter table public.project_cost_entries
  add column if not exists cost_code_id uuid
    references public.project_cost_codes(id) on delete restrict;

create index if not exists project_tasks_cost_code_id_idx
  on public.project_tasks (cost_code_id) where cost_code_id is not null;
create index if not exists boq_line_items_cost_code_id_idx
  on public.boq_line_items (cost_code_id) where cost_code_id is not null;
create index if not exists project_budget_lines_cost_code_id_idx
  on public.project_budget_lines (cost_code_id) where cost_code_id is not null;
create index if not exists material_request_items_cost_code_id_idx
  on public.material_request_items (cost_code_id) where cost_code_id is not null;
create index if not exists purchase_order_items_cost_code_id_idx
  on public.purchase_order_items (cost_code_id) where cost_code_id is not null;
create index if not exists project_cost_entries_cost_code_id_idx
  on public.project_cost_entries (cost_code_id) where cost_code_id is not null;

comment on column public.project_budget_lines.cost_code_id is
  'The WBS leaf this line budgets. Replaces matching on the free-text `category` string; `category` stays as a display label only (audit D9).';
comment on column public.material_request_items.cost_code_id is
  'The WBS leaf this item draws against — resolved from the linked schedule line, or chosen directly for off-schedule items. Per item, so a request spanning several codes no longer has to be attributed wholesale to one (audit D3).';
comment on column public.project_cost_entries.cost_code_id is
  'The WBS leaf this cost belongs to. With cost_code_library.gl_account_id this is what lets the cost subledger post to, and reconcile against, the general ledger (audit §4.5).';

-- ---------------------------------------------------------------------------
-- Which schedule generated a budget line (the D14 companion).
-- ---------------------------------------------------------------------------
alter table public.project_budget_lines
  add column if not exists boq_id uuid
    references public.boq_documents(id) on delete set null;

create index if not exists project_budget_lines_boq_id_idx
  on public.project_budget_lines (boq_id) where boq_id is not null;

comment on column public.project_budget_lines.boq_id is
  'The material schedule whose issue generated this line, when source = ''boq''. With schedules per project phase (audit §7.3), this is what lets one phase be revised or retired without disturbing its siblings — see syncProjectBudgetFromBoq and audit D14.';

-- ---------------------------------------------------------------------------
-- Which phase a schedule covers.
-- ---------------------------------------------------------------------------
alter table public.boq_documents
  add column if not exists phase_cost_code_id uuid
    references public.project_cost_codes(id) on delete set null;

create index if not exists boq_documents_phase_cost_code_id_idx
  on public.boq_documents (phase_cost_code_id) where phase_cost_code_id is not null;

comment on column public.boq_documents.phase_cost_code_id is
  'The WBS phase node this schedule covers. A project has one schedule per phase (audit §7.3); this makes the phase a queryable FK instead of a convention inside `title`.';
