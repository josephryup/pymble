-- Staff payroll: opting out of statutory contributions now also excludes PAYE.
--
-- The flag previously meant "no NAPSA / NHIMA / WCF, but still withhold PAYE",
-- which is what the old column comment documented. For the engagements this
-- flag actually gets used for — people who are not employees for tax purposes
-- and invoice gross — withholding PAYE was wrong: they settle their own tax
-- with ZRA and should receive the full gross.
--
-- Behaviour is now all-or-nothing: opted out means no PAYE, no NAPSA, no NHIMA,
-- no WCF, employee or employer side. Advances are still recovered, since
-- repaying an advance is not a deduction — it is money already received.
--
-- Only the comment changes here; the calculation lives in
-- src/lib/ops/statutory/calculator.ts. Payslip rows already written keep the
-- figures they were computed with, as they must.

comment on column public.employees.statutory_contributions_enabled is
  'Whether statutory deductions apply at all: PAYE, NAPSA, NHIMA and WCF. False = paid full gross with no withholding (non-employment engagements that settle their own tax). Advances are still deducted.';
