-- R4 — what an invoice needs to be a receivable, and where cash receipts live.
--
-- docs/pymble-ops-payables-receivables-split-2026-08.md §5. Until now
-- `invoices` was a tax document: no due date, no way to record a part payment,
-- nowhere to put the money when it arrived, and no way to tell retention from
-- a slow payer.

-- ---------------------------------------------------------------------------
-- Invoice columns
-- ---------------------------------------------------------------------------

alter table public.invoices
  -- STORED, not derived from the customer's terms at read time. The due date
  -- is printed on the document the client holds, so it is a fact about that
  -- invoice, not a live lookup: re-reading it through today's terms would
  -- silently re-date history and restate every past ageing report the day
  -- someone renegotiates. Terms decide the due date when the invoice is
  -- raised; changing them later moves FUTURE invoices only, and re-dating an
  -- existing one is a deliberate edit of that invoice.
  add column if not exists due_date date,
  -- Invoiced but not collectable yet. Kept apart from the outstanding balance
  -- so retention never reads as a slow payer.
  add column if not exists retention_amount numeric(14, 2) not null default 0,
  -- Mirrors payment_requests.cost_treatment. `opening_balance` is a debt that
  -- predates the system: it credits retained earnings rather than revenue, so
  -- loading the old debt book does not fabricate this year's income.
  add column if not exists revenue_treatment public.ops_legacy_cost_treatment
    not null default 'current_period',
  -- Replaces the BOQ link, which was answering "where did this come from"
  -- badly. source_id points at the quotation or IPC behind the invoice.
  add column if not exists source text not null default 'manual',
  add column if not exists source_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'invoices_source_check') then
    alter table public.invoices add constraint invoices_source_check
      check (source in ('manual', 'quotation', 'ipc', 'opening_balance'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'invoices_retention_check') then
    alter table public.invoices add constraint invoices_retention_check
      check (retention_amount >= 0 and retention_amount <= total_amount);
  end if;

  -- A pre-system debt carries the gross owed and no VAT (decision D7): the
  -- original invoice already declared the output VAT, and declaring it again
  -- would double-count it to ZRA.
  if not exists (select 1 from pg_constraint where conname = 'invoices_opening_balance_no_vat') then
    alter table public.invoices add constraint invoices_opening_balance_no_vat
      check (revenue_treatment <> 'opening_balance' or vat_amount = 0);
  end if;
end $$;

comment on column public.invoices.due_date is
  'When payment falls due. Set from the customer''s payment_terms_days when the invoice is raised, then fixed — it is printed on the client''s copy. Drives receivables ageing.';
comment on column public.invoices.retention_amount is
  'Portion invoiced but not collectable until release. Reported separately from overdue.';
comment on column public.invoices.revenue_treatment is
  'current_period = normal, credits revenue. opening_balance = a debt predating the system, credits retained earnings so current-year revenue is not overstated.';
comment on column public.invoices.source is
  'How the invoice came to exist: manual, quotation, ipc, or opening_balance. Replaces the old boq_id link.';

create index if not exists invoices_due_date_idx on public.invoices (due_date);
create index if not exists invoices_source_idx on public.invoices (source, source_id);

-- Existing invoices get a due date from their customer's terms. A no-op today
-- (the register is empty) but correct if any land before this ships.
update public.invoices i
set due_date = i.issued_at + make_interval(days => c.payment_terms_days)
from public.customers c
where i.customer_id = c.id
  and i.due_date is null
  and i.issued_at is not null;

-- ---------------------------------------------------------------------------
-- Cash receipts
-- ---------------------------------------------------------------------------
--
-- The cash event itself, which the system has never stored — marking an
-- invoice paid only flipped a status. Without these rows there is no
-- collections figure, no DSO, and no way to record a part payment, which on a
-- construction contract is normal rather than exceptional.
--
-- Note what is NOT here: no `amount_paid` on invoices and no `receivables`
-- table (decision D6). Outstanding is total_amount minus the sum of these
-- rows, computed in a view. A stored total and a list of receipts is two
-- records of one fact, and the one that drifts is always the total.

create table if not exists public.invoice_receipts (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  received_on date not null,
  amount numeric(14, 2) not null check (amount > 0),
  method text not null default 'bank_transfer',
  bank_reference text not null default '',
  notes text not null default '',
  -- Reversal rather than deletion: a receipt keyed in error has usually
  -- already posted a GL journal, and the cash record must show the correction
  -- rather than lose the original.
  cancelled_at timestamptz,
  cancelled_by uuid references public.users(id) on delete set null,
  cancellation_reason text not null default '',
  journal_entry_id uuid,
  recorded_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'invoice_receipts_method_check') then
    alter table public.invoice_receipts add constraint invoice_receipts_method_check
      check (method in ('bank_transfer', 'cash', 'mobile_money', 'cheque', 'other'));
  end if;
end $$;

create index if not exists invoice_receipts_invoice_idx
  on public.invoice_receipts (invoice_id);
-- Collections in a period read off this pairing; cancelled receipts are
-- excluded everywhere, so the partial index is what those queries actually hit.
create index if not exists invoice_receipts_received_on_idx
  on public.invoice_receipts (received_on)
  where cancelled_at is null;

comment on table public.invoice_receipts is
  'Money actually received against an invoice. The receivables equivalent of marking a payable paid, and the only record of the cash event — outstanding is derived from these, never stored (decision D6).';

drop trigger if exists set_updated_at on public.invoice_receipts;
create trigger set_updated_at before update on public.invoice_receipts
  for each row execute function private.set_updated_at();

alter table public.invoice_receipts enable row level security;
grant select on public.invoice_receipts to authenticated;
grant all on public.invoice_receipts to service_role;

drop policy if exists invoice_receipts_select_ops on public.invoice_receipts;
create policy invoice_receipts_select_ops
on public.invoice_receipts
for select
to authenticated
using (private.is_active_ops_user());
