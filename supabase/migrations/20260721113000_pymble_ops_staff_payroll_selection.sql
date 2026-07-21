-- Finance payroll controls: choose staff for each run and opt employees out
-- of NAPSA, NHIMA, and WCF when contributions do not apply to their engagement.
alter table public.employees
  add column if not exists statutory_contributions_enabled boolean not null default true;

comment on column public.employees.statutory_contributions_enabled is
  'Whether NAPSA, NHIMA, and WCF are calculated for this employee. PAYE remains applicable.';
