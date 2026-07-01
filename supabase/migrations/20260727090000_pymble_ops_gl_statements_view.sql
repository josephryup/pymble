-- Phase 13c: extend ops_trial_balance with account_subtype so the
-- Profit & Loss and Balance Sheet statements can split cost-of-sales from
-- operating expenses, and asset/liability/equity rows by subtype, without a
-- second round trip per statement.
--
-- New columns must be appended at the end of a CREATE OR REPLACE VIEW's
-- column list — Postgres rejects inserting them mid-list (would renumber
-- existing positional columns). account_subtype goes last.

create or replace view public.ops_trial_balance as
select
  a.id as account_id,
  a.code,
  a.name,
  a.account_type,
  a.normal_balance,
  coalesce(s.debit, 0) as debit,
  coalesce(s.credit, 0) as credit,
  a.account_subtype
from public.chart_of_accounts a
left join (
  select l.account_id, sum(l.debit) as debit, sum(l.credit) as credit
  from public.journal_lines l
  join public.journal_entries e on e.id = l.entry_id
  where e.status = 'posted'
  group by l.account_id
) s on s.account_id = a.id
where a.is_postable;

grant select on public.ops_trial_balance to service_role;
