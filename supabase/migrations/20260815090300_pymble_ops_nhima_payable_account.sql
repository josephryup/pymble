-- NHIMA Payable, so staff payroll can post to the general ledger.
--
-- Staff payroll has never posted a journal at all — `postPayrollRunJournalSafe`
-- only handles the casual `payroll_runs` engine. Adding the staff journal needs
-- somewhere to credit the NHIMA deduction, and there is no such account:
-- staff_payroll_items carries `nhima_employee` and `nhima_employer`, but the
-- chart stops at NAPSA (2210) and WCF (2220).
--
-- NHIMA is remitted to a different authority on its own return, so it gets its
-- own control account rather than being folded into NAPSA. Sits alongside its
-- siblings under the same statutory-payable parent.

insert into public.chart_of_accounts (
  code, name, account_type, account_subtype, normal_balance,
  parent_id, is_postable, is_control, control_key, currency_code,
  is_active, system_locked, description
)
select
  '2230',
  'NHIMA Payable',
  'liability',
  'statutory_payable',
  'credit',
  parent_id,
  true,
  true,
  'nhima_payable',
  'ZMW',
  true,
  true,
  'National Health Insurance deductions withheld from staff pay and the employer contribution, pending remittance.'
from public.chart_of_accounts
where code = '2210'
on conflict (code) do nothing;
