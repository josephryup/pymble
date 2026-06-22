-- Sprint 14: overtime support.
--
-- Standard day length + overtime multiplier live on the organization profile
-- so a single change updates the whole company. Defaults: 8-hour day,
-- 1.5× overtime, in line with Zambian labour-code practice.
--
-- Per-row overtime split lives on attendance_records so payroll + payslip can
-- show regular vs overtime breakdown.

alter table public.organization_profile
  add column if not exists standard_daily_hours numeric(5, 2) not null default 8,
  add column if not exists overtime_multiplier numeric(5, 2) not null default 1.5;

comment on column public.organization_profile.standard_daily_hours
  is 'Standard working hours per day. Hours above this are paid at the overtime multiplier.';
comment on column public.organization_profile.overtime_multiplier
  is 'Multiplier applied to the hourly rate for hours worked beyond standard_daily_hours.';

alter table public.attendance_records
  add column if not exists overtime_hours numeric(6, 2) not null default 0,
  add column if not exists overtime_amount numeric(14, 2) not null default 0;

comment on column public.attendance_records.overtime_hours
  is 'Hours above standard_daily_hours for this record.';
comment on column public.attendance_records.overtime_amount
  is 'Pay attributable to overtime hours (rate * multiplier * overtime_hours).';
