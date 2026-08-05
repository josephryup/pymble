-- Payables for completed projects, without putting those projects in the system.
--
-- THE PROBLEM. The company has unpaid supplier and subcontractor balances from
-- projects that finished before this system existed. Those projects are not
-- coming into the sites register — they have no budgets, no attendance, no
-- programme, and putting them there would put finished work back onto live
-- dashboards. But `payment_requests.site_id` is NOT NULL and
-- `createPaymentRequestAction` additionally calls `assertActiveSite`, so today
-- there is no way to record the debt at all.
--
-- WHY NOT JUST MAKE site_id NULLABLE. Because that removes the guarantee for
-- *live* payables too. A nullable attribution column with no discipline means a
-- current-project cost can silently reach no project, which is precisely the
-- leak the project↔finance audit was about. "Blank" is a blind link spelled
-- NULL.
--
-- THE MODEL. Every payable must name exactly one thing it is charged to,
-- chosen from a closed set:
--
--   site           — live project work (unchanged behaviour)
--   legacy_project — a completed project in the register below
--   overhead       — a cost centre; company cost with no project at all
--
-- The CHECK constraint makes "no attribution" and "two attributions"
-- unrepresentable, so this holds no matter what any future code path does.

-- ---------------------------------------------------------------------------
-- The legacy project register. Deliberately thin.
--
-- This is NOT a site and must not grow into one. It carries no budget, no
-- programme, no team, and appears in no operational dashboard. Its only jobs
-- are to be a real thing a payable can point at, and to let someone answer
-- "what do we still owe on Chalala Phase 2?" without inventing a site.
-- ---------------------------------------------------------------------------
create type public.ops_legacy_cost_treatment as enum (
  -- Cost already recognised in closed accounts; we are only recording the
  -- unpaid liability. Dr Retained Earnings / Cr Accounts Payable.
  'opening_balance',
  -- Cost was never booked anywhere and genuinely belongs to the current year.
  -- Dr expense / Cr Accounts Payable, the same as an ordinary bill.
  'current_period'
);

create table if not exists public.legacy_projects (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  client_name text not null default '',
  description text not null default '',
  completed_on date,
  /**
   * How this project's payables hit the general ledger.
   *
   * Asked once here, where it is actually answerable ("were these costs in the
   * accounts we closed?"), rather than once per invoice where whoever is typing
   * a backlog of bills cannot reasonably know. Individual payables may still
   * override it.
   */
  cost_treatment public.ops_legacy_cost_treatment not null default 'opening_balance',
  is_active boolean not null default true,
  notes text not null default '',
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists legacy_projects_code_key
  on public.legacy_projects (lower(code));

comment on table public.legacy_projects is
  'Completed projects that exist only so their outstanding payables can be recorded and reported. Not sites: no budgets, no programme, no operational surface.';

alter table public.legacy_projects enable row level security;

create policy legacy_projects_select
  on public.legacy_projects for select to authenticated
  using (private.can_access_finance_bridge());

create policy legacy_projects_no_direct_write
  on public.legacy_projects for all to authenticated, anon
  using (false) with check (false);

create trigger set_legacy_projects_updated_at
  before update on public.legacy_projects
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Discriminated charge target on payment_requests.
-- ---------------------------------------------------------------------------
create type public.ops_payment_charge_target as enum (
  'site',
  'legacy_project',
  'overhead'
);

alter table public.payment_requests
  add column if not exists charge_target public.ops_payment_charge_target
    not null default 'site',
  add column if not exists legacy_project_id uuid
    references public.legacy_projects(id) on delete restrict,
  add column if not exists cost_centre_id uuid
    references public.cost_centres(id) on delete restrict,
  add column if not exists cost_treatment public.ops_legacy_cost_treatment;

-- site_id can now be absent, but only for the targets that do not use it. The
-- CHECK below is what actually keeps that honest.
alter table public.payment_requests alter column site_id drop not null;

-- Exactly one attribution, always. This is the whole point of the change: it is
-- not possible to save a payable that is charged to nothing, or to two things.
alter table public.payment_requests
  drop constraint if exists payment_requests_charge_target_chk;
alter table public.payment_requests
  add constraint payment_requests_charge_target_chk check (
    (charge_target = 'site'
      and site_id is not null
      and legacy_project_id is null
      and cost_centre_id is null)
    or
    (charge_target = 'legacy_project'
      and legacy_project_id is not null
      and site_id is null
      and cost_centre_id is null)
    or
    (charge_target = 'overhead'
      and cost_centre_id is not null
      and site_id is null
      and legacy_project_id is null)
  );

-- A completed project has no live budget, and an overhead cost is not project
-- budget spend. Allowing either to consume a project budget line would corrupt
-- the budget-availability figures the procurement gates depend on.
alter table public.payment_requests
  drop constraint if exists payment_requests_budget_link_chk;
alter table public.payment_requests
  add constraint payment_requests_budget_link_chk check (
    charge_target = 'site'
    or (budget_id is null and budget_line_id is null)
  );

-- cost_treatment only means anything for a legacy payable; a live-site bill is
-- always a current-period cost.
alter table public.payment_requests
  drop constraint if exists payment_requests_cost_treatment_chk;
alter table public.payment_requests
  add constraint payment_requests_cost_treatment_chk check (
    (charge_target = 'legacy_project' and cost_treatment is not null)
    or (charge_target <> 'legacy_project' and cost_treatment is null)
  );

create index if not exists payment_requests_legacy_project_id_idx
  on public.payment_requests (legacy_project_id);
create index if not exists payment_requests_cost_centre_id_idx
  on public.payment_requests (cost_centre_id);

-- ---------------------------------------------------------------------------
-- The cost ledger already supports non-site cost (site_id nullable,
-- cost_centre_id present). It just needs to know about legacy projects too, so
-- "what did this completed project cost us" stays answerable.
-- ---------------------------------------------------------------------------
alter table public.project_cost_entries
  add column if not exists legacy_project_id uuid
    references public.legacy_projects(id) on delete restrict;

create index if not exists project_cost_entries_legacy_project_id_idx
  on public.project_cost_entries (legacy_project_id);
