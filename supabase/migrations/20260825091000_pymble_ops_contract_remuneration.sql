-- ---------------------------------------------------------------------------
-- Contracts: remuneration, and the employment terms that had nowhere to live
-- ---------------------------------------------------------------------------
--
-- public.contracts had no pay column of any kind, so an employment contract
-- carried no figures. The seeded Remuneration clause says the salary is "set
-- out in the schedule to this contract" — and there was no schedule to point
-- at. Meanwhile employee_contracts holds basic_pay, housing_allowance and
-- other_allowances and is what staff payroll actually pays from.
--
-- The link goes ONE way (design decision D1): employee_contracts stays the pay
-- record that payroll reads, and a contract points at the pay record it was
-- drawn from. Replacing employee_contracts would mean editing the payslip
-- route, the payroll run builder and the leave-accrual cron — the highest
-- blast-radius area in the system — to solve a documentation problem.
--
-- remuneration_snapshot freezes the computed figures at APPROVAL, the same
-- moment and for the same reason as counterparty_snapshot: a pay review next
-- year must not silently rewrite a contract signed this year.
--
-- The employment-terms columns exist because the employment template's clauses
-- already refer to a probation period, a notice period, hours of work and a
-- place of work, and the record could not hold any of them. Until now an
-- employment contract borrowed the subcontract columns — retention, penalties,
-- defects liability — which is Phase 2's problem, but these columns are what
-- Phase 2 renders instead.

alter table public.contracts
  -- The pay record this contract was drawn from. RESTRICT, not cascade: a
  -- signed contract must not lose the figures behind it because someone tidied
  -- the HR register.
  add column if not exists employee_contract_id uuid
    references public.employee_contracts(id) on delete restrict,

  -- NULL means "inherit from the employee". Set explicitly when the engagement
  -- is agreed on a different basis — a consultant who invoices gross and
  -- settles with ZRA themselves. Agreed at contract time, which is why it lives
  -- here and not only on employees.statutory_contributions_enabled.
  add column if not exists statutory_contributions_apply boolean,

  -- Frozen at approval. Shape is documented on the column, not just in
  -- TypeScript, because a reader in psql three years from now is exactly who
  -- this record is for.
  add column if not exists remuneration_snapshot jsonb not null default '{}'::jsonb,

  -- Employment terms. Defaults are Zambian Employment Code minimums where the
  -- Act sets one, and zero where it does not — never a guess dressed as policy.
  add column if not exists job_title text not null default '',
  add column if not exists place_of_work text not null default '',
  add column if not exists probation_months integer not null default 0,
  add column if not exists notice_period_days integer not null default 0,
  add column if not exists annual_leave_days numeric(6, 2) not null default 0,
  add column if not exists hours_per_week numeric(5, 2) not null default 0;

-- ---------------------------------------------------------------------------
-- Constraints
-- ---------------------------------------------------------------------------

alter table public.contracts
  drop constraint if exists contracts_probation_months_range;
alter table public.contracts
  add constraint contracts_probation_months_range
  check (probation_months >= 0 and probation_months <= 12);

comment on constraint contracts_probation_months_range on public.contracts is
  'The Employment Code Act caps probation at six months, extendable once to twelve. Twelve is the ceiling; the form warns above six.';

alter table public.contracts
  drop constraint if exists contracts_notice_period_days_range;
alter table public.contracts
  add constraint contracts_notice_period_days_range
  check (notice_period_days >= 0 and notice_period_days <= 365);

alter table public.contracts
  drop constraint if exists contracts_annual_leave_days_range;
alter table public.contracts
  add constraint contracts_annual_leave_days_range
  check (annual_leave_days >= 0 and annual_leave_days <= 365);

alter table public.contracts
  drop constraint if exists contracts_hours_per_week_range;
alter table public.contracts
  add constraint contracts_hours_per_week_range
  check (hours_per_week >= 0 and hours_per_week <= 168);

-- A pay record can only hang off a contract with a person. Mirrors
-- contracts_kind_matches_counterparty from the previous migration: the same
-- class of mismatch, caught the same way, rather than left to the action layer.
alter table public.contracts
  drop constraint if exists contracts_pay_record_is_employment;
alter table public.contracts
  add constraint contracts_pay_record_is_employment
  check (employee_contract_id is null or kind = 'employment');

-- An approved employment contract must carry its figures. Without this a
-- contract could reach signature with an empty schedule — exactly the state
-- this migration exists to end. Subcontracts are unaffected: their money lives
-- in contract_lines and contract_milestones.
alter table public.contracts
  drop constraint if exists contracts_employment_approved_has_remuneration;
alter table public.contracts
  add constraint contracts_employment_approved_has_remuneration
  check (
    kind <> 'employment'
    or status in ('draft', 'in_review', 'cancelled')
    or remuneration_snapshot ? 'net'
  )
  not valid;

-- NOT VALID above, validated here, so the migration names any pre-existing
-- exception instead of aborting on an opaque constraint error. Nothing has
-- been approved on the employment kind yet, so this is expected to be a no-op.
do $$
declare
  offending integer;
begin
  select count(*)
    into offending
    from public.contracts
   where kind = 'employment'
     and status not in ('draft', 'in_review', 'cancelled')
     and not (remuneration_snapshot ? 'net');

  if offending > 0 then
    raise warning
      'contracts: % approved employment contract(s) have no remuneration snapshot. They pre-date this migration; re-approve or backfill them, then run: alter table public.contracts validate constraint contracts_employment_approved_has_remuneration;',
      offending;
  else
    alter table public.contracts
      validate constraint contracts_employment_approved_has_remuneration;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Indexes and documentation
-- ---------------------------------------------------------------------------

create index if not exists contracts_employee_contract_idx
  on public.contracts (employee_contract_id)
  where employee_contract_id is not null;

comment on column public.contracts.employee_contract_id is
  'The employee_contracts row this contract was priced from. employee_contracts remains the record staff payroll pays against; this column links the signed instrument to it rather than duplicating the figures.';

comment on column public.contracts.statutory_contributions_apply is
  'NULL inherits employees.statutory_contributions_enabled. False only for an engagement that is not employment for tax purposes — no PAYE withheld and no contributions either side.';

comment on column public.contracts.remuneration_snapshot is
  'Frozen at approval, alongside counterparty_snapshot. Keys: basic, housing, other_allowances, gross, statutory_applies, paye, napsa_employee, napsa_employer, nhima_employee, nhima_employer, wcf_employer, total_deductions, net, employer_total_cost, tax_year, citation, computed_at, source_employee_contract_id. Empty {} on a draft.';
