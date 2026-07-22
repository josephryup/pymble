-- Add bank account fields to employees for payroll disbursement.
-- Finance uses these to know where to send each employee's payroll payment.
-- The fields are also snapshotted on staff_payroll_items so the bank details
-- at the time of each payroll run are preserved.

alter table public.employees
  add column if not exists bank_name text not null default '',
  add column if not exists bank_branch text not null default '',
  add column if not exists bank_account_number text not null default '';

alter table public.staff_payroll_items
  add column if not exists bank_name text not null default '',
  add column if not exists bank_branch text not null default '',
  add column if not exists bank_account_number text not null default '';
