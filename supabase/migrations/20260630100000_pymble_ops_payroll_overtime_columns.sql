-- Sprint 14: overtime breakdown rolled up to payroll line items.
--
-- gross_pay already includes overtime — these columns split out the overtime
-- portion so the payslip can render "X hrs of overtime: ZMW Y" clearly.

alter table public.payroll_run_items
  add column if not exists overtime_hours numeric(8, 2) not null default 0,
  add column if not exists overtime_amount numeric(14, 2) not null default 0;

comment on column public.payroll_run_items.overtime_hours
  is 'Total overtime hours rolled up from attendance for this worker in this run.';
comment on column public.payroll_run_items.overtime_amount
  is 'Total overtime pay (already included in gross_pay) for transparency on the payslip.';
