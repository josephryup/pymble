-- Sprint 12: Zambian statutory deduction columns on payroll line items.
--
-- Tracks PAYE, NAPSA (employee + employer), and WCF (employer) per worker
-- per payroll run so payslips and ZRA / NAPSA / WCF returns can be produced.
-- Nullable + default 0 so existing payroll rows stay valid.

alter table public.payroll_run_items
  add column if not exists paye_amount numeric(14, 2) not null default 0,
  add column if not exists napsa_employee numeric(14, 2) not null default 0,
  add column if not exists napsa_employer numeric(14, 2) not null default 0,
  add column if not exists wcf_employer numeric(14, 2) not null default 0,
  add column if not exists tax_year integer,
  add column if not exists statutory_citation text;

comment on column public.payroll_run_items.paye_amount
  is 'PAYE (income tax) deducted from worker, in ZMW. Per ZRA bands.';
comment on column public.payroll_run_items.napsa_employee
  is 'NAPSA contribution deducted from worker, capped at the monthly ceiling.';
comment on column public.payroll_run_items.napsa_employer
  is 'NAPSA contribution paid by Pymble (not deducted from worker).';
comment on column public.payroll_run_items.wcf_employer
  is 'Workers Compensation Fund contribution paid by Pymble.';
comment on column public.payroll_run_items.tax_year
  is 'Tax year whose rates were applied — supports stable replay of historical runs.';
comment on column public.payroll_run_items.statutory_citation
  is 'Human-readable rule citation rendered at the bottom of the payslip.';
