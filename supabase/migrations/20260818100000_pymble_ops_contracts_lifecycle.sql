-- Contracts, phases 2-4: the links that carry a contract into Finance.
--
-- The design sketched the money chain as
--   milestone certified -> subcontractor_payments -> payment_requests -> GL
--
-- That middle hop is a dead end. subcontractor_payments has no GL posting, no
-- cost-code column and no budget link; it notifies Finance and stops. Routing
-- certified milestones through it would mean building a second payables spine
-- alongside the one that already works.
--
-- So a certified milestone raises a PAYMENT REQUEST directly. That table
-- already carries payment_type = 'subcontractor', which
-- opsPaymentPayableAccount maps to 2050 Subcontractor Payable rather than
-- collapsing it into trade payables, and postPaymentRequestJournalSafe already
-- posts it. The chain becomes
--   milestone certified -> payment_request -> existing approval -> GL + cost ledger
--
-- contract_milestones.subcontractor_payment_id stays for now but is superseded;
-- see the comment on it below.

-- ---------------------------------------------------------------------------
-- Milestone -> payables
-- ---------------------------------------------------------------------------

alter table public.contract_milestones
  add column if not exists payment_request_id uuid
    references public.payment_requests(id) on delete set null;

create index if not exists contract_milestones_payment_request_idx
  on public.contract_milestones (payment_request_id)
  where payment_request_id is not null;

comment on column public.contract_milestones.payment_request_id is
  'The payable raised when this milestone was certified. This is the live money link.';

comment on column public.contract_milestones.subcontractor_payment_id is
  'SUPERSEDED by payment_request_id. subcontractor_payments never reached the GL or the budget; certified milestones go through payment_requests instead. Retained only so any row written before 2026-08-18 keeps its reference.';

-- ---------------------------------------------------------------------------
-- Payables -> contract
-- ---------------------------------------------------------------------------
--
-- Both directions are recorded. The milestone needs to know its payable to show
-- status; Finance, looking at a payment request in its own queue, needs to know
-- which contract and which stage it settles without joining backwards through
-- three tables.

alter table public.payment_requests
  add column if not exists contract_id uuid
    references public.contracts(id) on delete set null;

alter table public.payment_requests
  add column if not exists contract_milestone_id uuid
    references public.contract_milestones(id) on delete set null;

create index if not exists payment_requests_contract_idx
  on public.payment_requests (contract_id)
  where contract_id is not null;

-- One payable per milestone. Certification is idempotent by construction: a
-- double-click cannot raise the same payment twice.
create unique index if not exists payment_requests_contract_milestone_unique
  on public.payment_requests (contract_milestone_id)
  where contract_milestone_id is not null;

comment on column public.payment_requests.contract_id is
  'Set when this payable was raised by certifying a contract milestone.';

-- ---------------------------------------------------------------------------
-- Contract -> budget commitment
-- ---------------------------------------------------------------------------
--
-- On approval the contract value is posted to project_cost_entries with
-- status 'committed', so a project budget shows money that is promised but not
-- yet spent. Roughly 87% of material spend never reaches Finance today
-- (project-finance spine audit); subcontract commitments are a large slice of
-- what is missing.

alter table public.contracts
  add column if not exists commitment_cost_entry_id uuid
    references public.project_cost_entries(id) on delete set null;

comment on column public.contracts.commitment_cost_entry_id is
  'The committed cost entry raised at approval. Null means no commitment was posted — normally because the contract carries no site, which project_cost_entries requires.';

-- ---------------------------------------------------------------------------
-- Retention and lifecycle sweep support
-- ---------------------------------------------------------------------------

alter table public.contracts
  add column if not exists completed_at timestamptz;

-- Which reminders have already gone out. Without this the daily sweep re-sends
-- the same warning every morning until the date passes, which is how people
-- learn to ignore the notification channel entirely.
alter table public.contracts
  add column if not exists expiry_notified_at timestamptz;

alter table public.contracts
  add column if not exists warranty_notified_at timestamptz;

alter table public.contract_milestones
  add column if not exists release_notified_at timestamptz;

comment on column public.contracts.completed_at is
  'Works finished. Starts the defects liability clock for retention release and the warranty clock.';

-- ---------------------------------------------------------------------------
-- Addenda
-- ---------------------------------------------------------------------------
--
-- parent_contract_id already exists. This numbers the children so a bundle
-- reads as "Addendum 1", "Addendum 2" rather than by contract number alone.

alter table public.contracts
  add column if not exists addendum_number integer;

create unique index if not exists contracts_addendum_unique
  on public.contracts (parent_contract_id, addendum_number)
  where parent_contract_id is not null;

comment on column public.contracts.addendum_number is
  'Sequence within a parent contract. Null on an original. A variation above variation_threshold_percent becomes an addendum rather than an edit, which is how an issued contract stays immutable while the commercial reality moves.';
