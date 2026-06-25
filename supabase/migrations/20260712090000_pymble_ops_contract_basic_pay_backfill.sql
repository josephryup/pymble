-- Backfill basic_pay from the legacy salary_amount for contracts that haven't
-- yet had their pay structure broken out. HR will set housing_allowance
-- separately through the new contract edit form.

update public.employee_contracts
   set basic_pay = salary_amount
 where basic_pay = 0
   and salary_amount > 0;
