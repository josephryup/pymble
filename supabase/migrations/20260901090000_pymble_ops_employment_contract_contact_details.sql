-- Optional employment-contract party details. Blank contact fields fall back to
-- the employee register; address is entered here because employees currently
-- have no address column. Values are frozen into counterparty_snapshot at approval.

alter table public.contracts
  add column if not exists employee_address text not null default '',
  add column if not exists employee_tpin text not null default '',
  add column if not exists employee_phone text not null default '',
  add column if not exists employee_email text not null default '';

comment on column public.contracts.employee_address is
  'Address shown on an employment contract; entered by HR.';
comment on column public.contracts.employee_tpin is
  'Optional employment-contract TPIN override; blank falls back to employees.tpin.';
comment on column public.contracts.employee_phone is
  'Optional employment-contract phone override; blank falls back to employees.phone.';
comment on column public.contracts.employee_email is
  'Optional employment-contract email override; blank falls back to employees.email.';
