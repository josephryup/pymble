-- Pymble Operations — cost centres for non-project spend
--
-- Phase 4 of docs/pymble-ops-project-finance-spine-audit.md. Resolves audit D4.
--
-- The problem, stated exactly: project_cost_entries.site_id is NOT NULL. Every
-- `general` and `it` scope material request has no site, so it can never
-- produce a cost entry. K48,540 of real, approved, spent money is invisible to
-- Finance by SCHEMA, not by oversight — the ledger is structurally incapable of
-- holding it.
--
-- Business decision §7.5: overhead / IT / general spend is real spend and needs
-- cost centres.
--
-- The design choice that matters here: ONE ledger with TWO dimensions, not two
-- ledgers. A cost entry belongs to exactly one of a site (project cost) or a
-- cost centre (overhead) — enforced by a check constraint, so a row can never
-- be both or neither. Every existing report keeps working unchanged, because
-- project reports filter on site_id and simply never see overhead rows. The
-- alternative — a separate overhead ledger — would have duplicated the
-- lifecycle, the relief semantics, the GL posting and the reconciliation, and
-- guaranteed they drift apart.

create table if not exists public.cost_centres (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  description text not null default '',
  -- Where this centre's spend posts when it reaches the general ledger.
  gl_account_id uuid references public.chart_of_accounts(id) on delete restrict,
  -- Optional annual budget, so availability control (§4.3) works for overhead
  -- exactly as it does for projects.
  annual_budget_zmw numeric(14, 2) not null default 0,
  is_active boolean not null default true,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists cost_centres_code_unique
  on public.cost_centres (code);
create index if not exists cost_centres_active_idx
  on public.cost_centres (is_active, code);

comment on table public.cost_centres is
  'Departments and overhead pools that spend money without belonging to a project. The second dimension of the cost ledger: a project_cost_entries row carries exactly one of site_id or cost_centre_id (audit D4 / §7.5).';

drop trigger if exists set_updated_at on public.cost_centres;
create trigger set_updated_at before update on public.cost_centres
  for each row execute function private.set_updated_at();

alter table public.cost_centres enable row level security;
grant select on public.cost_centres to authenticated;
grant all on public.cost_centres to service_role;

drop policy if exists cost_centres_select_ops on public.cost_centres;
create policy cost_centres_select_ops
on public.cost_centres
for select
to authenticated
using (private.is_active_ops_user());

-- ---------------------------------------------------------------------------
-- Seed the departments that already exist in the business, mapped to their
-- operating-expense accounts. Codes mirror the module vocabulary so the
-- mapping from a request's scope is obvious rather than conventional.
-- ---------------------------------------------------------------------------
insert into public.cost_centres (code, name, description, gl_account_id)
select v.code, v.name, v.description, a.id
from (values
  ('HO',      'Head Office',            'General administration and overheads not attributable to a project.', '6900'),
  ('IT',      'Information Technology', 'IT equipment, licences, connectivity and support.',                   '6050'),
  ('FLEET',   'Fleet and Workshop',     'Vehicle and plant running costs held centrally, before allocation.',  '5070'),
  ('HR',      'Human Resources',        'Recruitment, training and staff welfare.',                            '6010'),
  ('STORES',  'Central Stores',         'Stock held centrally before it is issued to a project.',              '1400'),
  ('MKT',     'Marketing and Bids',     'Marketing, tendering and pre-contract costs.',                        '6100')
) as v(code, name, description, gl_code)
left join public.chart_of_accounts a on a.code = v.gl_code
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Widen the ledger to carry overhead.
-- ---------------------------------------------------------------------------
alter table public.project_cost_entries
  add column if not exists cost_centre_id uuid
    references public.cost_centres(id) on delete restrict;

alter table public.project_cost_entries
  alter column site_id drop not null;

-- Exactly one dimension. Not "at least one" — a row belonging to both a
-- project and an overhead pool would be counted twice in any roll-up that
-- unions them, which is the double-count this whole spine exists to prevent.
alter table public.project_cost_entries
  drop constraint if exists project_cost_entries_one_dimension;
alter table public.project_cost_entries
  add constraint project_cost_entries_one_dimension check (
    (site_id is not null and cost_centre_id is null)
    or (site_id is null and cost_centre_id is not null)
  );

create index if not exists project_cost_entries_cost_centre_id_idx
  on public.project_cost_entries (cost_centre_id)
  where cost_centre_id is not null;

comment on column public.project_cost_entries.cost_centre_id is
  'The overhead pool this cost belongs to, when it is not a project cost. Exactly one of site_id / cost_centre_id is set — see project_cost_entries_one_dimension.';
comment on column public.project_cost_entries.site_id is
  'The project this cost belongs to. NULL for overhead spend, which carries cost_centre_id instead (audit D4).';

-- ---------------------------------------------------------------------------
-- Route non-project requests to a cost centre.
-- ---------------------------------------------------------------------------
alter table public.material_requests
  add column if not exists cost_centre_id uuid
    references public.cost_centres(id) on delete set null;

create index if not exists material_requests_cost_centre_id_idx
  on public.material_requests (cost_centre_id)
  where cost_centre_id is not null;

comment on column public.material_requests.cost_centre_id is
  'For general / IT scope requests, the overhead pool the spend belongs to. Site-scope requests use site_id and a project cost code instead.';

-- Default the existing non-project requests to their obvious centre, so the
-- K48,540 already spent stops being invisible the moment the ledger can hold
-- it. IT requests → IT; general office purchasing → Head Office.
update public.material_requests m
set cost_centre_id = c.id
from public.cost_centres c
where m.cost_centre_id is null
  and m.site_id is null
  and (
    (m.scope = 'it' and c.code = 'IT')
    or (m.scope = 'general' and c.code = 'HO')
  );
