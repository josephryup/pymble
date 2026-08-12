-- Loans payable — L1 of docs/pymble-ops-loans-design-2026-08.md.
--
-- Nothing modelled borrowing until now. The chart carried 2510 Bank Loans and
-- 2520 Asset Finance and Leases on the liability side, and 4200 Interest
-- INCOME — but no interest EXPENSE account, which is the one a borrower needs.
-- That absence is itself the tell: the system has only ever modelled lending
-- money out.
--
-- The design point that drives everything here: a loan is NOT a payable.
-- Keying repayments as payment requests would book the whole principal as an
-- expense (it is a liability), lose the principal/interest split (only the
-- interest belongs on the P&L), and leave "what do we owe the bank"
-- unanswerable. So loans get their own records and their own posting; the
-- payables VIEW reads them (L4) without them becoming payment_requests rows.

-- ---------------------------------------------------------------------------
-- Interest expense account
-- ---------------------------------------------------------------------------

insert into public.chart_of_accounts (
  code, name, account_type, account_subtype, normal_balance,
  parent_id, is_postable, is_control, currency_code,
  is_active, system_locked, description
)
select
  '6120',
  'Interest and Finance Charges',
  'expense',
  'opex',
  'debit',
  parent_id,
  true,
  false,
  'ZMW',
  true,
  true,
  'Interest and finance costs on loans, asset finance and other borrowings. The only part of a loan repayment that reaches the profit and loss.'
from public.chart_of_accounts
where code = '6110'
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Who we borrow from
-- ---------------------------------------------------------------------------
--
-- A master rather than a name on each loan (decision L-D2), for the same
-- reason the customer master exists: "how much do we owe Stanbic across all
-- facilities" cannot be answered against free text.

create table if not exists public.loan_providers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'bank',
  contact_name text not null default '',
  contact_email text not null default '',
  contact_phone text not null default '',
  notes text not null default '',
  is_active boolean not null default true,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loan_providers_kind_check
    check (kind in ('bank', 'microfinance', 'asset_financier', 'shareholder', 'other'))
);

create unique index if not exists loan_providers_name_unique
  on public.loan_providers (upper(trim(name)));

comment on table public.loan_providers is
  'Lenders. A master record so total exposure per lender is answerable across facilities.';

-- ---------------------------------------------------------------------------
-- The facilities
-- ---------------------------------------------------------------------------

create table if not exists public.loans (
  id uuid primary key default gen_random_uuid(),
  loan_number text not null default (
    'LN-' || to_char(now(), 'YYYYMMDD') || '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  ),
  provider_id uuid not null references public.loan_providers(id) on delete restrict,
  reference text not null default '',
  purpose text not null default '',
  -- 'overdraft' is deliberately absent from the check: Pymble holds none, and
  -- an unscheduled fluctuating-balance facility needs machinery this does not
  -- have. Add the value with the machinery, not before it.
  kind text not null default 'term_loan',
  principal numeric(14, 2) not null check (principal > 0),
  currency_code text not null default 'ZMW',
  drawdown_date date,
  -- Percent per year. Zero is valid: a director's loan is usually interest free.
  interest_rate numeric(7, 4) not null default 0 check (interest_rate >= 0),
  -- The decision that changes the arithmetic (L-D1). Flat charges interest on
  -- the original principal for the whole term; reducing balance charges it on
  -- what is still owed. On K500,000 at 20% over 3 years that is K300,000
  -- against roughly K167,000.
  rate_basis text not null default 'reducing_balance',
  -- Null / zero term means repayable on demand — a real shape for a
  -- shareholder loan, and it simply has no scheduled instalments.
  term_months integer not null default 0 check (term_months >= 0),
  repayment_frequency text not null default 'monthly',
  first_payment_date date,
  status text not null default 'draft',
  security_notes text not null default '',
  -- What the borrowing funded. At most one, mirroring the cost ledger's rule.
  site_id uuid references public.sites(id) on delete set null,
  cost_centre_id uuid references public.cost_centres(id) on delete set null,
  equipment_id uuid references public.equipment(id) on delete set null,
  gl_liability_account_id uuid references public.chart_of_accounts(id) on delete restrict,
  notes text not null default '',
  created_by uuid references public.users(id) on delete set null,
  archived_at timestamptz,
  archived_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loans_kind_check
    check (kind in ('term_loan', 'asset_finance', 'shareholder')),
  constraint loans_rate_basis_check
    check (rate_basis in ('flat', 'reducing_balance')),
  constraint loans_frequency_check
    check (repayment_frequency in ('monthly', 'quarterly')),
  constraint loans_status_check
    check (status in ('draft', 'active', 'settled', 'written_off', 'cancelled')),
  constraint loans_one_dimension
    check (num_nonnulls(site_id, cost_centre_id) <= 1)
);

create unique index if not exists loans_loan_number_unique on public.loans (loan_number);
create index if not exists loans_provider_idx on public.loans (provider_id, status);
create index if not exists loans_status_idx on public.loans (status);

comment on table public.loans is
  'Borrowing facilities. The principal is a liability, never an expense — see 20260815090600 header.';
comment on column public.loans.rate_basis is
  'flat = interest on the original principal for the whole term; reducing_balance = interest on what is still owed. Changes total interest by ~80% at typical rates.';
comment on column public.loans.term_months is
  'Zero means repayable on demand, which has no schedule. Valid for shareholder loans.';

-- ---------------------------------------------------------------------------
-- Instalments — scheduled, then actually paid
-- ---------------------------------------------------------------------------
--
-- Generated from the loan terms at drawdown, then editable to match the
-- lender's own schedule. The bank's paper is the contract, and a computed
-- schedule disagreeing by a few kwacha on the final instalment costs somebody
-- an afternoon every year.

create table if not exists public.loan_repayments (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.loans(id) on delete cascade,
  instalment_number integer not null,
  due_date date not null,
  paid_on date,
  reference text not null default '',
  total_amount numeric(14, 2) not null default 0 check (total_amount >= 0),
  -- The split is the whole point. Only interest and fees reach the P&L; the
  -- principal portion moves between two balance-sheet accounts.
  principal_portion numeric(14, 2) not null default 0 check (principal_portion >= 0),
  interest_portion numeric(14, 2) not null default 0 check (interest_portion >= 0),
  fees numeric(14, 2) not null default 0 check (fees >= 0),
  status text not null default 'scheduled',
  journal_entry_id uuid,
  notes text not null default '',
  recorded_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loan_repayments_status_check
    check (status in ('scheduled', 'paid', 'missed', 'waived')),
  -- A paid instalment must say when. Without this an unpaid row can carry a
  -- 'paid' status and quietly reduce the outstanding balance.
  constraint loan_repayments_paid_has_date
    check (status <> 'paid' or paid_on is not null)
);

create unique index if not exists loan_repayments_instalment_unique
  on public.loan_repayments (loan_id, instalment_number);
create index if not exists loan_repayments_due_idx
  on public.loan_repayments (due_date, status);

comment on table public.loan_repayments is
  'Loan instalments, scheduled and actual. Outstanding balance is derived from the PRINCIPAL portions of paid rows — summing totals would clear the loan early by the whole interest bill.';

-- ---------------------------------------------------------------------------
-- Housekeeping
-- ---------------------------------------------------------------------------

drop trigger if exists set_updated_at on public.loan_providers;
create trigger set_updated_at before update on public.loan_providers
  for each row execute function private.set_updated_at();

drop trigger if exists set_updated_at on public.loans;
create trigger set_updated_at before update on public.loans
  for each row execute function private.set_updated_at();

drop trigger if exists set_updated_at on public.loan_repayments;
create trigger set_updated_at before update on public.loan_repayments
  for each row execute function private.set_updated_at();

alter table public.loan_providers enable row level security;
alter table public.loans enable row level security;
alter table public.loan_repayments enable row level security;

grant select on public.loan_providers to authenticated;
grant select on public.loans to authenticated;
grant select on public.loan_repayments to authenticated;
grant all on public.loan_providers to service_role;
grant all on public.loans to service_role;
grant all on public.loan_repayments to service_role;

drop policy if exists loan_providers_select_ops on public.loan_providers;
create policy loan_providers_select_ops on public.loan_providers
  for select to authenticated using (private.is_active_ops_user());

drop policy if exists loans_select_ops on public.loans;
create policy loans_select_ops on public.loans
  for select to authenticated using (private.is_active_ops_user());

drop policy if exists loan_repayments_select_ops on public.loan_repayments;
create policy loan_repayments_select_ops on public.loan_repayments
  for select to authenticated using (private.is_active_ops_user());
