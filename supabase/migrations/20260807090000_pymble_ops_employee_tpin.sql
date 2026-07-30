-- Employee TPIN (Taxpayer Identification Number).
--
-- Sits alongside nrc_number and napsa_number on employees: HR records it once
-- on the employee, and every payroll run snapshots it onto the payslip line.
--
-- The snapshot is the point. A payslip is a statutory document issued at a
-- moment in time, so it must keep the TPIN it was issued with even if the
-- employee record is corrected later — the same reason nrc_number and
-- napsa_number are already copied onto staff_payroll_items rather than joined.

alter table public.employees
  add column if not exists tpin text not null default '';

comment on column public.employees.tpin is
  'ZRA Taxpayer Identification Number. Recorded by HR; snapshotted onto each payslip line.';

alter table public.staff_payroll_items
  add column if not exists tpin text not null default '';

comment on column public.staff_payroll_items.tpin is
  'Employee TPIN as at the time this payslip was generated. Snapshot — do not join to employees for this.';
