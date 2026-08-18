-- Contracts — phase 1 of docs/pymble-ops-contracts-design-2026-08.md.
--
-- HR generates subcontractor and foreman agreements from a standard template,
-- the way payslips, quotations and POs are already generated. The source
-- instrument is the Costern works order (30x78 / 30x18 warehouses, Mwembeshi):
-- roughly 60% boilerplate clause text, 40% data we already hold.
--
-- Two decisions from 2026-08-18 shape this file:
--
--   D1  "General foreman" is BOTH cases. Some are labour subcontractors —
--       already representable as subcontractors.kind = 'general', which the
--       enum comment defines as an individual/sole-trader with the person's
--       name in company_name. Others are salaried employees who need an
--       employment contract off employee_contracts. So one engine, two template
--       kinds, from the start. Splitting later would mean rebuilding the table.
--
--   D2  Full per-contract clause editing. Clause bodies are COPIED from the
--       template into contract_clauses rows, so HR can rewrite a clause on one
--       contract without touching the master. is_customised flags the drift and
--       the approver sees a diff. Merge-fields-only was considered and rejected.
--
-- D2 is only safe because of contract_signatures.document_sha256: a signature is
-- bound to the exact bytes that were signed, so editable wording cannot silently
-- invalidate what someone already put their name to.
--
-- What this migration deliberately does NOT do: post anything to the GL, or
-- create subcontractor_payments rows. Milestones carry the link column and stay
-- unpopulated until phase 3, because subcontractor_payments do not reach the GL
-- or the budget yet either — wiring one end of a broken chain helps nobody.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'ops_contract_kind') then
    create type public.ops_contract_kind as enum ('subcontract', 'employment');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'ops_contract_status') then
    create type public.ops_contract_status as enum (
      'draft',
      'in_review',
      'approved',
      'issued',
      'signed',
      'active',
      'completed',
      'terminated',
      'cancelled'
    );
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'ops_contract_milestone_status') then
    create type public.ops_contract_milestone_status as enum (
      'pending',
      'certified',
      'invoiced',
      'paid'
    );
  end if;
end $$;

-- Witness roles are separated by side rather than numbered, so the unique
-- (contract_id, signatory_role) constraint below can do the work of "one
-- signature per slot" without a sequence column being load-bearing.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'ops_contract_signatory_role') then
    create type public.ops_contract_signatory_role as enum (
      'hr',
      'general_manager',
      'managing_director',
      'counterparty',
      'witness_internal',
      'witness_counterparty'
    );
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'ops_contract_signature_status') then
    create type public.ops_contract_signature_status as enum (
      'pending',
      'signed',
      'declined'
    );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Template library
-- ---------------------------------------------------------------------------
--
-- A new version is a NEW ROW, never an edit. Live contracts snapshot the
-- version they were built from, so republishing a template must not be able to
-- change the wording of an agreement somebody already signed.

create table if not exists public.contract_templates (
  id uuid primary key default gen_random_uuid(),
  template_code text not null check (template_code ~ '^[a-z][a-z0-9_]*$'),
  name text not null check (length(btrim(name)) > 0),
  kind public.ops_contract_kind not null default 'subcontract',
  version integer not null default 1 check (version > 0),
  is_active boolean not null default true,
  description text not null default '',
  -- Commercial defaults lifted from the source instrument. Every one of these
  -- is overridable per contract; they exist so a drafter starts from house
  -- terms rather than a blank field.
  default_vat_percent numeric(5, 2) not null default 16.00 check (default_vat_percent >= 0),
  default_retention_percent numeric(5, 2) not null default 5.00
    check (default_retention_percent >= 0 and default_retention_percent <= 50),
  default_penalty_percent_per_week numeric(5, 2) not null default 0.30
    check (default_penalty_percent_per_week >= 0),
  default_penalty_cap_percent numeric(5, 2) not null default 3.00
    check (default_penalty_cap_percent >= 0),
  default_warranty_months integer not null default 6 check (default_warranty_months >= 0),
  default_defects_liability_months integer not null default 1
    check (default_defects_liability_months >= 0),
  default_variation_threshold_percent numeric(5, 2) not null default 10.00
    check (default_variation_threshold_percent >= 0),
  default_payment_terms_days integer not null default 14 check (default_payment_terms_days >= 0),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists contract_templates_code_version_unique
  on public.contract_templates (template_code, version);

-- One live version per code. A partial unique index cannot arbitrate an upsert
-- (ON CONFLICT needs a plain index), but nothing upserts this table — versions
-- are published by an action that deactivates the previous row first.
create unique index if not exists contract_templates_active_code_unique
  on public.contract_templates (template_code)
  where is_active;

comment on table public.contract_templates is
  'Master contract templates. A new version is a new row; live contracts snapshot the version they were built from so republishing never rewrites a signed agreement.';

create table if not exists public.contract_template_clauses (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.contract_templates(id) on delete cascade,
  section_key text not null check (section_key ~ '^[a-z][a-z0-9_]*$'),
  heading text not null default '',
  body_markdown text not null default '',
  sort_order integer not null default 0,
  -- Required clauses cannot be deleted from a contract. The three that matter
  -- legally — governing law, warranty, entire agreement — are marked required
  -- in the seed below.
  is_required boolean not null default false,
  -- False pins the wording to the master even under D2. Reserved for clauses a
  -- lawyer signs off on; nothing uses it in v1.
  is_editable boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (template_id, section_key)
);

create index if not exists contract_template_clauses_template_order_idx
  on public.contract_template_clauses (template_id, sort_order);

comment on column public.contract_template_clauses.body_markdown is
  'Clause text with {{merge_tokens}} resolved at render time — {{org_legal_name}}, {{counterparty_name}}, {{contract_total}}, {{duration_days}}, {{warranty_months}}, {{penalty_percent_per_week}}, {{penalty_cap_percent}}, {{variation_threshold_percent}}, {{min_workers}}, {{payment_terms_days}}, {{retention_percent}}, {{defects_liability_months}}, {{site_name}}.';

-- ---------------------------------------------------------------------------
-- The contract instance
-- ---------------------------------------------------------------------------

create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  contract_number text not null default (
    'CT-' || to_char(now(), 'YYYYMMDD') || '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  ),
  template_id uuid references public.contract_templates(id) on delete restrict,
  template_version integer,
  kind public.ops_contract_kind not null default 'subcontract',
  status public.ops_contract_status not null default 'draft',

  -- Counterparty: exactly one side populated (D1). The check is what stops an
  -- employment contract quietly pointing at a subcontractor.
  counterparty_type text not null default 'subcontractor'
    check (counterparty_type in ('subcontractor', 'employee')),
  subcontractor_id uuid references public.subcontractors(id) on delete restrict,
  employee_id uuid references public.employees(id) on delete restrict,
  -- Frozen at issue: name, address, tpin, contact name/phone/email. A contract
  -- must not change because someone tidied the register a year later.
  counterparty_snapshot jsonb not null default '{}'::jsonb,
  org_snapshot jsonb not null default '{}'::jsonb,

  -- Works order header (subcontract kind). The source PDF had these two
  -- swapped — the number field held a date — so they are typed separately here.
  work_order_number text not null default '',
  work_order_date date,

  site_id uuid references public.sites(id) on delete set null,
  assignment_id uuid references public.subcontractor_assignments(id) on delete set null,
  cost_code_id uuid references public.project_cost_codes(id) on delete set null,

  title text not null default '',
  preamble text not null default '',
  scope_summary text not null default '',

  -- Commercial
  currency_code text not null default 'ZMW',
  subtotal numeric(14, 2) not null default 0 check (subtotal >= 0),
  -- Individual subcontractors are usually not VAT registered. The source
  -- instrument showed "VAT (16%)" against a blank amount and a TOTAL equal to
  -- the net — an ambiguity this flag exists to remove. Still open (§9.2)
  -- whether the drafting default should be false; the column defaults to
  -- charging VAT and the action layer decides.
  vat_applicable boolean not null default true,
  vat_percent numeric(5, 2) not null default 16.00 check (vat_percent >= 0),
  vat_amount numeric(14, 2) not null default 0 check (vat_amount >= 0),
  total_value numeric(14, 2) not null default 0 check (total_value >= 0),
  roe_reference text not null default '',
  retention_percent numeric(5, 2) not null default 5.00
    check (retention_percent >= 0 and retention_percent <= 50),
  penalty_percent_per_week numeric(5, 2) not null default 0.30
    check (penalty_percent_per_week >= 0),
  penalty_cap_percent numeric(5, 2) not null default 3.00 check (penalty_cap_percent >= 0),
  variation_threshold_percent numeric(5, 2) not null default 10.00
    check (variation_threshold_percent >= 0),
  warranty_months integer not null default 6 check (warranty_months >= 0),
  defects_liability_months integer not null default 1 check (defects_liability_months >= 0),
  min_workers integer not null default 0 check (min_workers >= 0),
  payment_terms_days integer not null default 14 check (payment_terms_days >= 0),

  -- Programme
  start_date date,
  end_date date,
  duration_days integer not null default 0 check (duration_days >= 0),
  expected_start_date date,
  expected_finish_date date,

  -- Execution
  approved_at timestamptz,
  approved_by uuid references public.users(id) on delete set null,
  issued_at timestamptz,
  issued_by uuid references public.users(id) on delete set null,
  -- Set when the countersigned copy is in hand, internal marks or wet ink.
  signed_at timestamptz,
  signed_document_id uuid references public.documents(id) on delete set null,
  -- Immutable archive of exactly what was issued, written to R2 at issue.
  generated_pdf_r2_key text,
  terminated_at timestamptz,
  termination_reason text not null default '',

  -- Addenda. A variation above variation_threshold_percent becomes a child
  -- contract rather than an edit, which is also how an issued record stays
  -- immutable while the commercial reality moves.
  parent_contract_id uuid references public.contracts(id) on delete set null,

  notes text not null default '',
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.users(id) on delete set null,

  constraint contracts_counterparty_exactly_one check (
    (counterparty_type = 'subcontractor'
      and subcontractor_id is not null and employee_id is null)
    or
    (counterparty_type = 'employee'
      and employee_id is not null and subcontractor_id is null)
  ),
  constraint contracts_dates_ordered check (
    end_date is null or start_date is null or end_date >= start_date
  ),
  constraint contracts_expected_dates_ordered check (
    expected_finish_date is null or expected_start_date is null
      or expected_finish_date >= expected_start_date
  ),
  -- An issued contract must say when and by whom. Without this a draft can
  -- carry an 'issued' status and appear on the counterparty's side of a report.
  constraint contracts_issued_has_stamp check (
    status not in ('issued', 'signed', 'active', 'completed')
      or (issued_at is not null and issued_by is not null)
  ),
  constraint contracts_terminated_has_reason check (
    status <> 'terminated'
      or (terminated_at is not null and length(btrim(termination_reason)) > 0)
  ),
  constraint contracts_no_self_parent check (parent_contract_id is null or parent_contract_id <> id)
);

create unique index if not exists contracts_number_unique
  on public.contracts (contract_number);
create index if not exists contracts_status_kind_idx
  on public.contracts (status, kind, created_at desc)
  where archived_at is null;
create index if not exists contracts_subcontractor_idx
  on public.contracts (subcontractor_id, status, start_date desc)
  where subcontractor_id is not null;
create index if not exists contracts_employee_idx
  on public.contracts (employee_id, status, start_date desc)
  where employee_id is not null;
create index if not exists contracts_site_idx
  on public.contracts (site_id, status)
  where site_id is not null;
-- Drives the expiry / retention-release / warranty sweep in phase 2.
create index if not exists contracts_end_date_idx
  on public.contracts (end_date, status)
  where archived_at is null and end_date is not null;
create index if not exists contracts_parent_idx
  on public.contracts (parent_contract_id)
  where parent_contract_id is not null;

comment on table public.contracts is
  'Subcontractor works orders and employment contracts. One engine, two template kinds (D1). Counterparty and org details are snapshotted at issue so later register edits cannot rewrite an executed agreement.';

-- ---------------------------------------------------------------------------
-- Scope, pricing, milestones, clauses
-- ---------------------------------------------------------------------------

-- The numbered "Scope of works includes, but is not limited to" list.
create table if not exists public.contract_scope_items (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  sort_order integer not null default 0,
  heading text not null default '',
  detail text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contract_scope_items_contract_idx
  on public.contract_scope_items (contract_id, sort_order);

-- The priced schedule (S/NO, description, qty, UoM, rate, amount).
create table if not exists public.contract_lines (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  sort_order integer not null default 0,
  description text not null default '',
  quantity numeric(14, 3) not null default 1 check (quantity >= 0),
  uom text not null default 'Item',
  rate numeric(14, 2) not null default 0 check (rate >= 0),
  amount numeric(14, 2) not null default 0 check (amount >= 0),
  -- Charge the leaf. Budgets may sit on a phase, spend charges a leaf.
  cost_code_id uuid references public.project_cost_codes(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contract_lines_contract_idx
  on public.contract_lines (contract_id, sort_order);

-- The payment plan: 30 / 25 / 20 / 20 / 5 retention in the source instrument.
create table if not exists public.contract_milestones (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  sort_order integer not null default 0,
  label text not null default '',
  percent numeric(6, 3) not null default 0 check (percent >= 0 and percent <= 100),
  amount numeric(14, 2) not null default 0 check (amount >= 0),
  trigger_description text not null default '',
  payable_within_days integer not null default 14 check (payable_within_days >= 0),
  is_retention boolean not null default false,
  status public.ops_contract_milestone_status not null default 'pending',
  certified_at timestamptz,
  certified_by uuid references public.users(id) on delete set null,
  -- The money link. Stays null until phase 3 wires certification through to
  -- subcontractor_payments, which do not reach the GL or the budget yet.
  subcontractor_payment_id uuid references public.subcontractor_payments(id) on delete set null,
  -- Retention releases are what get forgotten; phase 2 sweeps this column.
  release_due_date date,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contract_milestones_certified_has_stamp check (
    status = 'pending' or certified_at is not null
  )
);

create index if not exists contract_milestones_contract_idx
  on public.contract_milestones (contract_id, sort_order);
create index if not exists contract_milestones_release_idx
  on public.contract_milestones (release_due_date, status)
  where release_due_date is not null;

comment on table public.contract_milestones is
  'Payment plan. Percentages must total 100 — enforced in the action layer, not here, because a milestone set is legitimately incomplete mid-draft.';

-- The per-contract editable copy of the template clauses (D2).
create table if not exists public.contract_clauses (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  section_key text not null,
  heading text not null default '',
  body_markdown text not null default '',
  sort_order integer not null default 0,
  is_required boolean not null default false,
  -- True once the body drifts from the template it was copied from. The
  -- approval screen diffs every customised clause against template_body_snapshot
  -- so "customised" is never just a flag nobody can act on.
  is_customised boolean not null default false,
  template_body_snapshot text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contract_id, section_key)
);

create index if not exists contract_clauses_contract_idx
  on public.contract_clauses (contract_id, sort_order);

-- Restore points. Cheap insurance on a table people edit free text in.
create table if not exists public.contract_revisions (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  revision_no integer not null,
  snapshot jsonb not null default '{}'::jsonb,
  change_summary text not null default '',
  changed_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (contract_id, revision_no)
);

create index if not exists contract_revisions_contract_idx
  on public.contract_revisions (contract_id, revision_no desc);

-- ---------------------------------------------------------------------------
-- Signature specimens
-- ---------------------------------------------------------------------------
--
-- Your signature is private to you. This table deliberately breaks the pattern
-- used by documents, where owner and developer bypass every visibility tier: a
-- signature is not a document, it is the means of authenticating one, and an
-- admin who can view it can forge with it. The select policy below is
-- ownership-only — no role list, no bypass.
--
-- Defence in depth, because RLS is not the only door: the serving route is
-- /api/ops/signature/me with no [userId] parameter, so no URL can even express
-- a request for someone else's specimen; and the mark is embedded server-side
-- into the PDF as a data URL (the way PYMBLE_LOGO_DATA_URL already works),
-- never served to a browser as a standalone asset.

create table if not exists public.user_signatures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  r2_key text not null,
  content_type text not null default 'image/png',
  byte_size integer not null default 0 check (byte_size >= 0),
  -- Printed beneath the mark. Defaults to the user's full name but a signature
  -- block often carries a formal variant.
  specimen_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

comment on table public.user_signatures is
  'One signature specimen per person, private to its owner. No admin, HR or developer bypass — see the ownership-only select policy below.';

-- ---------------------------------------------------------------------------
-- Signing ledger
-- ---------------------------------------------------------------------------

create table if not exists public.contract_signatures (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  signatory_role public.ops_contract_signatory_role not null,
  sequence integer not null default 0,
  is_required boolean not null default true,
  -- Who is expected to sign. Null for the counterparty, who signs on paper.
  assigned_user_id uuid references public.users(id) on delete set null,
  status public.ops_contract_signature_status not null default 'pending',
  signed_by_user_id uuid references public.users(id) on delete set null,
  -- Name and job title AS AT signing. People change roles; a contract signed by
  -- the Operations Manager of 2026 must still say that in 2030.
  signed_name text not null default '',
  signed_title text not null default '',
  -- A COPY of the specimen, not a pointer to it. Re-uploading a signature next
  -- year must not retroactively change what last year's contracts look like.
  signature_r2_key text,
  signed_at timestamptz,
  decline_reason text not null default '',
  -- Hash of the exact rendered PDF bytes at the instant of signing. This is
  -- what makes D2 (editable clauses) safe: if the wording later changes, the
  -- hash stops matching and the document prints "signature recorded against a
  -- different version" rather than showing a mark that no longer means anything.
  document_sha256 text,
  -- Short code printed beneath the mark so a paper copy can be traced back.
  verification_code text,
  signed_ip text,
  signed_user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contract_id, signatory_role),
  constraint contract_signatures_signed_is_evidenced check (
    status <> 'signed'
      or (signed_at is not null and signed_by_user_id is not null and document_sha256 is not null)
  ),
  constraint contract_signatures_declined_has_reason check (
    status <> 'declined' or length(btrim(decline_reason)) > 0
  )
);

create index if not exists contract_signatures_contract_idx
  on public.contract_signatures (contract_id, sequence);
-- "What is waiting on me to sign" — the query the signing queue runs.
create index if not exists contract_signatures_pending_idx
  on public.contract_signatures (assigned_user_id, status)
  where status = 'pending';

comment on table public.contract_signatures is
  'Who signed what, when, and against which exact bytes. Records the evidence a court would ask for; whether these marks bind under Zambian law is a question for counsel, not for this schema.';

-- ---------------------------------------------------------------------------
-- Housekeeping
-- ---------------------------------------------------------------------------

do $$
declare
  target text;
begin
  foreach target in array array[
    'contract_templates',
    'contract_template_clauses',
    'contracts',
    'contract_scope_items',
    'contract_lines',
    'contract_milestones',
    'contract_clauses',
    'user_signatures',
    'contract_signatures'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', target);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function private.set_updated_at()',
      target
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------
--
-- Deliberately narrower than private.is_active_ops_user(), which is what the
-- loans tables use. Contracts carry commercial values and — for the employment
-- kind — salaries, so "every signed-in user" is the wrong width. The known
-- ops-RLS finding is that policies drift WIDER than the code that reads them;
-- this helper is written to match contract-permissions.ts instead.

create or replace function private.can_access_contracts()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select private.is_active_ops_user()
    and coalesce(
      private.current_user_role()::text in (
        'developer',
        'managing_director',
        'general_manager',
        'owner',
        'manager',
        'human_resource',
        'hr',
        'operations_manager',
        'projects_manager',
        'procurement_manager',
        'quantity_surveyor',
        'finance_manager',
        'accountant'
      ),
      false
    );
$$;

grant execute on function private.can_access_contracts() to authenticated;

-- Employment contracts expose pay. They are visible only to the roles that can
-- already see HR maturity data, which is where salaries live today.
create or replace function private.can_read_contract(target_contract_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.contracts c
    where c.id = target_contract_id
      and private.can_access_contracts()
      and (c.kind <> 'employment' or private.can_access_hr_maturity())
  );
$$;

grant execute on function private.can_read_contract(uuid) to authenticated;

alter table public.contract_templates enable row level security;
alter table public.contract_template_clauses enable row level security;
alter table public.contracts enable row level security;
alter table public.contract_scope_items enable row level security;
alter table public.contract_lines enable row level security;
alter table public.contract_milestones enable row level security;
alter table public.contract_clauses enable row level security;
alter table public.contract_revisions enable row level security;
alter table public.user_signatures enable row level security;
alter table public.contract_signatures enable row level security;

grant select on public.contract_templates to authenticated;
grant select on public.contract_template_clauses to authenticated;
grant select on public.contracts to authenticated;
grant select on public.contract_scope_items to authenticated;
grant select on public.contract_lines to authenticated;
grant select on public.contract_milestones to authenticated;
grant select on public.contract_clauses to authenticated;
grant select on public.contract_revisions to authenticated;
grant select on public.user_signatures to authenticated;
grant select on public.contract_signatures to authenticated;

grant all on public.contract_templates to service_role;
grant all on public.contract_template_clauses to service_role;
grant all on public.contracts to service_role;
grant all on public.contract_scope_items to service_role;
grant all on public.contract_lines to service_role;
grant all on public.contract_milestones to service_role;
grant all on public.contract_clauses to service_role;
grant all on public.contract_revisions to service_role;
grant all on public.user_signatures to service_role;
grant all on public.contract_signatures to service_role;

drop policy if exists contract_templates_select_ops on public.contract_templates;
create policy contract_templates_select_ops on public.contract_templates
  for select to authenticated using (private.can_access_contracts());

drop policy if exists contract_template_clauses_select_ops on public.contract_template_clauses;
create policy contract_template_clauses_select_ops on public.contract_template_clauses
  for select to authenticated using (private.can_access_contracts());

drop policy if exists contracts_select_ops on public.contracts;
create policy contracts_select_ops on public.contracts
  for select to authenticated
  using (
    private.can_access_contracts()
    and (kind <> 'employment' or private.can_access_hr_maturity())
  );

drop policy if exists contract_scope_items_select_ops on public.contract_scope_items;
create policy contract_scope_items_select_ops on public.contract_scope_items
  for select to authenticated using (private.can_read_contract(contract_id));

drop policy if exists contract_lines_select_ops on public.contract_lines;
create policy contract_lines_select_ops on public.contract_lines
  for select to authenticated using (private.can_read_contract(contract_id));

drop policy if exists contract_milestones_select_ops on public.contract_milestones;
create policy contract_milestones_select_ops on public.contract_milestones
  for select to authenticated using (private.can_read_contract(contract_id));

drop policy if exists contract_clauses_select_ops on public.contract_clauses;
create policy contract_clauses_select_ops on public.contract_clauses
  for select to authenticated using (private.can_read_contract(contract_id));

drop policy if exists contract_revisions_select_ops on public.contract_revisions;
create policy contract_revisions_select_ops on public.contract_revisions
  for select to authenticated using (private.can_read_contract(contract_id));

drop policy if exists contract_signatures_select_ops on public.contract_signatures;
create policy contract_signatures_select_ops on public.contract_signatures
  for select to authenticated using (private.can_read_contract(contract_id));

-- Ownership only. No role list, no is_ops_admin() escape hatch — that omission
-- is the point of the table, not an oversight. Do not add one.
drop policy if exists user_signatures_select_own on public.user_signatures;
create policy user_signatures_select_own on public.user_signatures
  for select to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Seed: works order template v1
-- ---------------------------------------------------------------------------
--
-- Transcribed from the Costern subcontract with its defects corrected: §1.2
-- referenced "UNO ENERGIES ZAMBIA LTD" (leftover from a different contract),
-- "PYMBLE CONTRUCTION LTD" was misspelled in several places, and the VAT line
-- showed 16% against a blank amount. Names come from merge tokens now, so the
-- first two classes of error cannot recur.

insert into public.contract_templates (
  template_code, name, kind, version, is_active, description
)
values (
  'subcontract_works_order',
  'Subcontract works order',
  'subcontract',
  1,
  true,
  'Standard works order and subcontract agreement for trade packages and labour-only subcontractors, including individual (general) subcontractors. Derived from the Mwembeshi warehouse instrument.'
)
on conflict (template_code, version) do nothing;

insert into public.contract_template_clauses (
  template_id, section_key, heading, body_markdown, sort_order, is_required
)
select
  t.id, v.section_key, v.heading, v.body_markdown, v.sort_order, v.is_required
from public.contract_templates t
cross join (values
  (
    'site_conditions',
    'Site conditions',
    'Any variation, being extra works, will be paid only where the variation cost exceeds {{variation_threshold_percent}} percent of the total project cost.

The Contractor shall provide a minimum of {{min_workers}} workers on site for the agreed duration. Any reduction in the number of workers is subject to discussion with the Client before implementation.

No worker shall be permitted to work within the premises without the appropriate personal protective equipment.

Work shall resume during holidays where required in order to meet the agreed timelines, and no additional cost shall be entertained for such work.',
    10,
    false
  ),
  (
    'quality_of_works',
    'Quality of works',
    'The Contractor shall ensure that all works strictly adhere to the specified standards and meet the satisfaction of the Engineer In-Charge in terms of workmanship. Any work found to be non-compliant with the required specifications or quality standards due to poor workmanship shall be rejected. The Contractor shall bear full responsibility for all costs associated with the removal, replacement or rectification of defective work resulting from poor workmanship, and the Client shall not incur any additional expense. The Contractor shall remain liable for workmanship but shall not be held responsible for defects arising solely from substandard materials supplied by the Client.',
    20,
    false
  ),
  (
    'updates',
    'Updates',
    'The Contractor''s team shall provide daily updates on site progress. These updates shall include evidence such as photographs, videos or reports, and shall be shared promptly through the designated communication channel.',
    30,
    false
  ),
  (
    'communication',
    'Communication',
    'All official communication shall be conducted by email. Any discussion or instruction given by telephone shall be confirmed in writing by email within 48 hours. Any change order or site instruction issued by the Client shall be documented, signed on site, and retained for record-keeping.',
    40,
    false
  ),
  (
    'client_notes',
    'Materials, records and tools',
    '1. All materials required for the site shall be provided by the Client.
2. Material usage records shall be updated daily and shall be verified and reconciled by the Client-appointed stores personnel to ensure accurate tracking. All materials supplied shall be accounted for accordingly, with ultimate responsibility for material reconciliation resting with the Client-appointed stores personnel.
3. The Contractor shall submit material requests before the required date. The Client shall endeavour to arrange materials in a timely manner; however, the Contractor remains responsible for ensuring that requests are made with sufficient lead time to prevent work stoppage.
4. The Contractor shall provide all basic tools required for the work, including hand grinders, poker vibrators, wheelbarrows, picks, shovels and hammers. Any specialised equipment, such as concrete cutters, may be supplied by the Client upon request, subject to availability, and a standard hire charge shall apply.',
    50,
    false
  ),
  (
    'performance',
    'Performance of works order',
    '1.1 Obligation fulfilment. {{counterparty_name}} shall diligently execute the specified works, subject to the approval of the Engineer or any designated representative of {{org_legal_name}}, ensuring that all responsibilities are discharged to the complete satisfaction of {{org_legal_name}}.

1.2 Comprehensive execution. {{counterparty_name}} commits to carrying out the specified work and any additional tasks of a similar nature that may be necessitated from time to time, ensuring that the satisfaction of {{org_legal_name}} is consistently met.',
    60,
    false
  ),
  (
    'payment_terms',
    'Payment terms',
    'Payment shall be disbursed against the agreed payment schedule, each instalment falling due within {{payment_terms_days}} days of the certified completion of the corresponding stage, subject to inspection and approval.

{{org_legal_name}} agrees to pay {{counterparty_name}} for the satisfactory completion of the work in accordance with the schedule of payments set out in this agreement. A retention of {{retention_percent}} percent shall be held for a period of {{defects_liability_months}} month(s) following completion, to cover any defects, and shall be released upon satisfactory rectification of any identified defects.',
    70,
    false
  ),
  (
    'governing_law',
    'Governing law',
    '4.1 Applicable jurisdiction. The construction, validity and execution of this works order shall be subject to and governed exclusively by the laws of the Republic of Zambia.

4.2 Explanation. Any dispute, legal matter or issue arising from this works order shall be resolved in accordance with the legal framework and regulations of Zambia. The parties shall abide by and seek recourse within the legal system of Zambia in the case of any disagreement or legal proceeding related to this works order. Arbitration shall be considered first before any legal steps are taken.',
    80,
    true
  ),
  (
    'duration',
    'Duration of work',
    '5.1 Estimated timeframe. The anticipated duration for completion of the specified works is approximately {{duration_days}} days, commencing from receipt of the signed order and the initial instalment payment, followed by timely payment of subsequent instalments.

5.2 Unforeseen delays. {{counterparty_name}} shall not be held liable for delays resulting from circumstances beyond their control, including but not limited to natural disasters, war, civil disturbance, strikes or legislative changes. In such cases {{counterparty_name}} shall promptly notify {{org_legal_name}} in writing, detailing the nature of the delay and providing supporting documentation. A reasonable extension of time shall be granted, to be agreed in writing by both parties.

5.3 Penalty provisions. In the event of delay attributable to {{counterparty_name}}, a penalty of {{penalty_percent_per_week}} percent of the contract value shall be imposed for each week of delay, capped at a maximum of {{penalty_cap_percent}} percent of the total contract value. Delays shall be assessed against the agreed project timeline. Where delay occurs due to non-payment, late material supply or lack of approvals from the Client, the Contractor shall be granted an extension equal to the delay period and any additional costs incurred shall be negotiated.',
    90,
    false
  ),
  (
    'workmanship',
    'Workmanship',
    '6.1 Number of workers. The Contractor shall maintain an adequate workforce based on the project''s requirements and in alignment with project phases. The daily workforce requirement may vary depending on the stage of the project and shall be subject to approval by the Project Engineer. In the event of persistent failure to meet the approved workforce requirement without prior approval, the Client may make proportionate deductions from the contract value, provided such deductions are based on a fair and reasonable assessment of the impact on progress.

6.2 Quality standards. All work shall adhere to established civil engineering norms and the highest quality standards. Performance metrics, including compliance with timelines, material quality and workmanship, shall be evaluated at key project milestones.

6.3 Adherence to regulations. {{counterparty_name}} shall ensure full compliance with all relevant regulations, codes and safety standards governing the nature of the work.

6.4 Continuous quality assurance. Quality assurance and control mechanisms shall be in place to monitor and evaluate progress throughout the duration of the project. Any deviation from the established quality norms shall be promptly addressed and rectified.',
    100,
    false
  ),
  (
    'warranty',
    'Warranty and maintenance',
    '7.1 Warranty period. {{counterparty_name}} warrants the satisfactory performance of all work conducted under this contract for a period of {{warranty_months}} months from the date of project completion. The warranty takes effect after a completion certificate is issued and is limited to workmanship-related defects, not material-related defects.

7.2 Maintenance responsibility. During the warranty period {{counterparty_name}} shall be responsible for promptly addressing and rectifying any deficiency arising in connection with the work performed under this contract.

7.3 Repairs and remediation. {{counterparty_name}} shall, at their own expense, conduct any remediation necessary to bring the work back to the agreed specifications and standards.

7.4 Reporting. {{counterparty_name}} shall maintain records of all maintenance activity conducted during the warranty period and provide periodic reports to the Client upon request.

7.5 Extension of warranty. Maintenance activity performed during the warranty period shall not extend the original warranty period, which remains in effect from the date of project completion or the date of possession, whichever is later.',
    110,
    true
  ),
  (
    'entire_agreement',
    'Entire agreement',
    '8.1 Comprehensive representation. This works order, including any accompanying attachment or addendum, constitutes the complete and inclusive embodiment of the agreement between {{org_legal_name}} and {{counterparty_name}}.

8.2 Superseding prior agreements. This agreement prevails over and supersedes any previous agreement, commitment, promise, condition or understanding, whether oral or written, between {{org_legal_name}} and {{counterparty_name}}.

8.3 Clarity and certainty. The purpose of this clause is to ensure that both parties proceed with a shared understanding of their commitments and obligations under this works order, and to rely exclusively on the terms and conditions set out in this document.',
    120,
    true
  )
) as v(section_key, heading, body_markdown, sort_order, is_required)
where t.template_code = 'subcontract_works_order' and t.version = 1
on conflict (template_id, section_key) do nothing;

-- ---------------------------------------------------------------------------
-- Seed: employment contract template v1
-- ---------------------------------------------------------------------------
--
-- D1 gave us two kinds but only one source document — the attached PDF is a
-- works order, and there is no equivalent signed employment contract to
-- transcribe. These clauses are drafted from the employee_contracts fields plus
-- Employment Code defaults, and are marked as a starting point.
--
-- NOT LEGALLY REVIEWED. Open decision §9.1 of the design doc: either HR supplies
-- an existing signed employment contract to codify, or counsel reviews this
-- wording before it is used on a real engagement. The clauses are seeded now so
-- the engine has both kinds to work against; publishing a v2 after review is a
-- new row, not an edit.

insert into public.contract_templates (
  template_code, name, kind, version, is_active, description,
  default_vat_percent, default_retention_percent, default_penalty_percent_per_week,
  default_penalty_cap_percent, default_warranty_months, default_defects_liability_months,
  default_variation_threshold_percent, default_payment_terms_days
)
values (
  'employment_contract',
  'Employment contract',
  'employment',
  1,
  true,
  'Contract of employment for salaried staff, including site foremen engaged on payroll. DRAFT WORDING — requires legal review before use (design doc §9.1).',
  0, 0, 0, 0, 0, 0, 0, 0
)
on conflict (template_code, version) do nothing;

insert into public.contract_template_clauses (
  template_id, section_key, heading, body_markdown, sort_order, is_required
)
select
  t.id, v.section_key, v.heading, v.body_markdown, v.sort_order, v.is_required
from public.contract_templates t
cross join (values
  (
    'appointment',
    'Appointment and duties',
    '{{org_legal_name}} appoints {{counterparty_name}} to the position stated in this contract. The Employee shall perform the duties of that position, together with any other duties reasonably assigned, faithfully and to the best of their ability, and shall comply with all lawful instructions of the Employer.',
    10,
    true
  ),
  (
    'place_of_work',
    'Place of work',
    'The Employee''s principal place of work is {{site_name}}. The Employer may require the Employee to work at any other site or office, within Zambia, where the operational requirements of the business so demand.',
    20,
    false
  ),
  (
    'remuneration',
    'Remuneration',
    'The Employee shall be paid the basic salary and allowances set out in the schedule to this contract, payable monthly in arrears, less all statutory deductions required by law including PAYE, NAPSA and NHIMA contributions. Salary shall be reviewed at the Employer''s discretion and any review does not create an entitlement to an increase.',
    30,
    true
  ),
  (
    'hours_of_work',
    'Hours of work',
    'Normal hours of work are as advised by the Employer and in accordance with the Employment Code Act. The Employee may be required to work additional hours where the operational requirements of a site so demand, and overtime shall be compensated in accordance with the applicable law and the Employer''s policy.',
    40,
    false
  ),
  (
    'probation',
    'Probation',
    'The Employee shall serve the probationary period stated in this contract. During probation either party may terminate this contract on the notice provided by law. Confirmation in the position is subject to satisfactory performance.',
    50,
    false
  ),
  (
    'leave',
    'Leave',
    'The Employee is entitled to annual leave, sick leave and other statutory leave in accordance with the Employment Code Act and the Employer''s leave policy. Leave must be applied for in advance and is subject to approval and the operational requirements of the business.',
    60,
    false
  ),
  (
    'confidentiality',
    'Confidentiality and company property',
    'The Employee shall not, during or after employment, disclose to any third party any confidential information belonging to the Employer or its clients, including drawings, pricing, tender information, client details and employee records. All company property, documents and equipment issued to the Employee remain the property of the Employer and shall be returned on termination.',
    70,
    true
  ),
  (
    'health_and_safety',
    'Health and safety',
    'The Employee shall comply with all health and safety rules, wear the personal protective equipment issued, and report any accident, incident or unsafe condition immediately. Failure to comply with safety requirements constitutes a disciplinary offence.',
    80,
    false
  ),
  (
    'termination',
    'Termination',
    'This contract may be terminated by either party by giving the notice period stated in this contract or as provided by the Employment Code Act, or by payment in lieu of notice. The Employer may terminate without notice in the case of gross misconduct, following a disciplinary process.',
    90,
    true
  ),
  (
    'governing_law',
    'Governing law',
    'This contract is governed by the laws of the Republic of Zambia, and in particular the Employment Code Act. Any dispute shall be resolved in accordance with the applicable statutory dispute resolution procedures.',
    100,
    true
  ),
  (
    'entire_agreement',
    'Entire agreement',
    'This contract, together with its schedule and the Employer''s policies as amended from time to time, constitutes the entire agreement between the parties and supersedes any prior agreement or understanding, whether oral or written.',
    110,
    true
  )
) as v(section_key, heading, body_markdown, sort_order, is_required)
where t.template_code = 'employment_contract' and t.version = 1
on conflict (template_id, section_key) do nothing;
