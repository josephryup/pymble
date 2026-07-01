-- Phase 13: Chart of Accounts — the first stone of the native general ledger.
--
-- This is the account master that the GL spine (journal_entries / journal_lines,
-- a later migration) will post against. Seeded with a Zambian construction chart
-- of accounts: control accounts (AR/AP/retention/VAT/statutory) are flagged so a
-- later posting engine writes them only from subledgers, never by hand.
--
-- Read access mirrors the finance bridge (private.can_access_finance_bridge());
-- writes go through the service role from guarded server actions.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'ops_gl_account_type') then
    create type public.ops_gl_account_type as enum (
      'asset',
      'liability',
      'equity',
      'income',
      'expense'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'ops_gl_normal_balance') then
    create type public.ops_gl_normal_balance as enum (
      'debit',
      'credit'
    );
  end if;
end $$;

create table if not exists public.chart_of_accounts (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null check (length(btrim(name)) > 0),
  account_type public.ops_gl_account_type not null,
  account_subtype text not null default 'general'
    check (account_subtype ~ '^[a-z][a-z0-9_]*$'),
  normal_balance public.ops_gl_normal_balance not null,
  parent_id uuid references public.chart_of_accounts(id) on delete restrict,
  is_postable boolean not null default true,
  is_control boolean not null default false,
  control_key text check (control_key is null or control_key ~ '^[a-z][a-z0-9_]*$'),
  currency_code text not null default 'ZMW' check (currency_code ~ '^[A-Z]{3}$'),
  is_active boolean not null default true,
  system_locked boolean not null default false,
  description text not null default '',
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists chart_of_accounts_code_unique
  on public.chart_of_accounts(code);
create index if not exists chart_of_accounts_type_idx
  on public.chart_of_accounts(account_type, account_subtype);
create index if not exists chart_of_accounts_parent_idx
  on public.chart_of_accounts(parent_id)
  where parent_id is not null;
create index if not exists chart_of_accounts_control_idx
  on public.chart_of_accounts(control_key)
  where control_key is not null;

drop trigger if exists set_updated_at on public.chart_of_accounts;
create trigger set_updated_at before update on public.chart_of_accounts
  for each row execute function private.set_updated_at();

alter table public.chart_of_accounts enable row level security;

grant select on public.chart_of_accounts to authenticated;
grant all on public.chart_of_accounts to service_role;

drop policy if exists chart_of_accounts_select_ops on public.chart_of_accounts;
create policy chart_of_accounts_select_ops
on public.chart_of_accounts
for select
to authenticated
using (private.can_access_finance_bridge());

-- ---------------------------------------------------------------------------
-- Seed — Zambian construction chart of accounts.
-- Idempotent: on conflict (code) do nothing, then a parent-link pass. Safe to
-- re-run. Seeded rows are system_locked so they cannot be deleted, only
-- deactivated; users may add their own accounts freely.
-- ---------------------------------------------------------------------------

drop table if exists _coa_seed;
create temporary table _coa_seed (
  code text primary key,
  name text not null,
  account_type public.ops_gl_account_type not null,
  account_subtype text not null,
  normal_balance public.ops_gl_normal_balance not null,
  parent_code text,
  is_postable boolean not null,
  is_control boolean not null,
  control_key text,
  currency_code text not null default 'ZMW'
);

insert into _coa_seed
  (code, name, account_type, account_subtype, normal_balance, parent_code, is_postable, is_control, control_key, currency_code)
values
  -- Assets
  ('1000','Current Assets','asset','header','debit',null,false,false,null,'ZMW'),
  ('1010','Bank - Main Operating (ZMW)','asset','bank','debit','1000',true,false,null,'ZMW'),
  ('1020','Bank - USD','asset','bank','debit','1000',true,false,null,'USD'),
  ('1030','Petty Cash','asset','cash','debit','1000',true,false,null,'ZMW'),
  ('1040','Mobile Money Float','asset','cash','debit','1000',true,false,null,'ZMW'),
  ('1100','Accounts Receivable','asset','accounts_receivable','debit','1000',true,true,'accounts_receivable','ZMW'),
  ('1150','Retention Receivable','asset','retention_receivable','debit','1000',true,true,'retention_receivable','ZMW'),
  ('1200','Work in Progress','asset','work_in_progress','debit','1000',true,false,null,'ZMW'),
  ('1250','Input VAT (recoverable)','asset','input_vat','debit','1000',true,true,'input_vat','ZMW'),
  ('1300','Staff and Subcontractor Advances','asset','advances','debit','1000',true,false,null,'ZMW'),
  ('1350','Prepayments','asset','prepayments','debit','1000',true,false,null,'ZMW'),
  ('1400','Inventory / Stock on Hand','asset','inventory','debit','1000',true,true,'inventory','ZMW'),
  ('1500','Non-Current Assets','asset','header','debit',null,false,false,null,'ZMW'),
  ('1510','Plant and Equipment - Cost','asset','fixed_asset','debit','1500',true,false,null,'ZMW'),
  ('1515','Plant and Equipment - Accumulated Depreciation','asset','accumulated_depreciation','credit','1500',true,false,null,'ZMW'),
  ('1520','Motor Vehicles - Cost','asset','fixed_asset','debit','1500',true,false,null,'ZMW'),
  ('1525','Motor Vehicles - Accumulated Depreciation','asset','accumulated_depreciation','credit','1500',true,false,null,'ZMW'),
  ('1530','Office Equipment - Cost','asset','fixed_asset','debit','1500',true,false,null,'ZMW'),
  ('1535','Office Equipment - Accumulated Depreciation','asset','accumulated_depreciation','credit','1500',true,false,null,'ZMW'),
  -- Liabilities
  ('2000','Current Liabilities','liability','header','credit',null,false,false,null,'ZMW'),
  ('2010','Accounts Payable','liability','accounts_payable','credit','2000',true,true,'accounts_payable','ZMW'),
  ('2050','Subcontractor Payable','liability','subcontractor_payable','credit','2000',true,true,'subcontractor_payable','ZMW'),
  ('2080','Retention Payable','liability','retention_payable','credit','2000',true,true,'retention_payable','ZMW'),
  ('2100','Output VAT (payable)','liability','output_vat','credit','2000',true,true,'output_vat','ZMW'),
  ('2150','VAT Control - net due to ZRA','liability','vat_control','credit','2000',true,false,null,'ZMW'),
  ('2200','PAYE Payable (ZRA)','liability','statutory_payable','credit','2000',true,true,'paye_payable','ZMW'),
  ('2210','NAPSA Payable','liability','statutory_payable','credit','2000',true,true,'napsa_payable','ZMW'),
  ('2220','WCF Payable','liability','statutory_payable','credit','2000',true,true,'wcf_payable','ZMW'),
  ('2300','Accruals','liability','accruals','credit','2000',true,false,null,'ZMW'),
  ('2350','Net Wages Payable','liability','wages_payable','credit','2000',true,false,null,'ZMW'),
  ('2400','Customer Deposits and Advances','liability','customer_deposits','credit','2000',true,false,null,'ZMW'),
  ('2500','Non-Current Liabilities','liability','header','credit',null,false,false,null,'ZMW'),
  ('2510','Bank Loans','liability','loan','credit','2500',true,false,null,'ZMW'),
  ('2520','Asset Finance and Leases','liability','lease','credit','2500',true,false,null,'ZMW'),
  -- Equity
  ('3000','Equity','equity','header','credit',null,false,false,null,'ZMW'),
  ('3010','Share Capital','equity','equity','credit','3000',true,false,null,'ZMW'),
  ('3020','Retained Earnings','equity','equity','credit','3000',true,false,null,'ZMW'),
  ('3030','Current Year Earnings','equity','equity','credit','3000',false,false,null,'ZMW'),
  ('3040','Director Current Account','equity','equity','credit','3000',true,false,null,'ZMW'),
  -- Income
  ('4000','Income','income','header','credit',null,false,false,null,'ZMW'),
  ('4010','Contract Revenue - Certified (IPC)','income','revenue','credit','4000',true,false,null,'ZMW'),
  ('4020','Contract Revenue - Variations','income','revenue','credit','4000',true,false,null,'ZMW'),
  ('4030','Contract Revenue - Claims','income','revenue','credit','4000',true,false,null,'ZMW'),
  ('4100','Other Income','income','other_income','credit','4000',true,false,null,'ZMW'),
  ('4200','Interest Income','income','other_income','credit','4000',true,false,null,'ZMW'),
  -- Cost of sales (direct project cost — tagged by site + cost_code by the engine)
  ('5000','Cost of Sales','expense','header','debit',null,false,false,null,'ZMW'),
  ('5010','Materials','expense','cogs','debit','5000',true,false,null,'ZMW'),
  ('5020','Subcontractor Costs','expense','cogs','debit','5000',true,false,null,'ZMW'),
  ('5030','Direct Labour and Wages','expense','cogs','debit','5000',true,false,null,'ZMW'),
  ('5040','Plant and Equipment Hire','expense','cogs','debit','5000',true,false,null,'ZMW'),
  ('5050','Fuel','expense','cogs','debit','5000',true,false,null,'ZMW'),
  ('5060','Site Establishment and Preliminaries','expense','cogs','debit','5000',true,false,null,'ZMW'),
  ('5070','Equipment Maintenance','expense','cogs','debit','5000',true,false,null,'ZMW'),
  ('5080','Transport and Logistics','expense','cogs','debit','5000',true,false,null,'ZMW'),
  ('5090','Other Direct Costs','expense','cogs','debit','5000',true,false,null,'ZMW'),
  -- Operating expenses (overhead)
  ('6000','Operating Expenses','expense','header','debit',null,false,false,null,'ZMW'),
  ('6010','Office Salaries','expense','opex','debit','6000',true,false,null,'ZMW'),
  ('6020','Rent and Rates','expense','opex','debit','6000',true,false,null,'ZMW'),
  ('6030','Utilities','expense','opex','debit','6000',true,false,null,'ZMW'),
  ('6040','Office Supplies','expense','opex','debit','6000',true,false,null,'ZMW'),
  ('6050','IT and Software','expense','opex','debit','6000',true,false,null,'ZMW'),
  ('6060','Professional Fees','expense','opex','debit','6000',true,false,null,'ZMW'),
  ('6070','Insurance','expense','opex','debit','6000',true,false,null,'ZMW'),
  ('6080','Depreciation Expense','expense','depreciation','debit','6000',true,false,null,'ZMW'),
  ('6090','Bank Charges','expense','opex','debit','6000',true,false,null,'ZMW'),
  ('6100','Marketing','expense','opex','debit','6000',true,false,null,'ZMW'),
  ('6110','Employer Statutory Contributions (NAPSA/WCF)','expense','opex','debit','6000',true,false,null,'ZMW'),
  ('6900','Other Expenses','expense','opex','debit','6000',true,false,null,'ZMW');

-- Pass 1: insert the accounts (parents linked in pass 2).
insert into public.chart_of_accounts
  (code, name, account_type, account_subtype, normal_balance, is_postable, is_control, control_key, currency_code, system_locked)
select
  s.code, s.name, s.account_type, s.account_subtype, s.normal_balance,
  s.is_postable, s.is_control, s.control_key, s.currency_code, true
from _coa_seed s
on conflict (code) do nothing;

-- Pass 2: link each child to its parent header.
update public.chart_of_accounts c
set parent_id = p.id
from _coa_seed s
join public.chart_of_accounts p on p.code = s.parent_code
where c.code = s.code
  and s.parent_code is not null
  and c.parent_id is distinct from p.id;

drop table if exists _coa_seed;
