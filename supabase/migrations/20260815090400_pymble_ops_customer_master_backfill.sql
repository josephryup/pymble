-- R3 — the customer master, and payment terms.
--
-- docs/pymble-ops-payables-receivables-split-2026-08.md §6 step 3. This is the
-- gate: with no customers there are no invoices, with no invoices there are no
-- receivables, which is why every receivables table is empty and the ageing
-- panel has always rendered zeros.
--
-- Fifteen quotations already carry their client inline (client_name,
-- client_tpin, client_email, client_phone, client_address) and none of them
-- sets customer_id, though the column exists. So the master is recovered from
-- data already recorded, not invented — the same standard applied to the
-- cost_approved_at backfill.

-- ---------------------------------------------------------------------------
-- Payment terms — what makes a due date, and therefore what makes "overdue"
-- ---------------------------------------------------------------------------
--
-- Receivables ageing currently buckets on days since issue, which is AGE, not
-- lateness: a 45-day-old invoice on 60-day terms is not late but reports as
-- 31-60. A due date fixes that, and a due date needs terms.
--
-- 30 days as the default because it is the ordinary commercial default and the
-- safest thing to assume when nobody has said otherwise — it will under-state
-- the grace on a longer contract rather than let a genuinely late invoice look
-- current. Per-customer, so a council on 60 days is recorded as such.

alter table public.customers
  add column if not exists payment_terms_days integer not null default 30;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'customers_payment_terms_days_check'
  ) then
    alter table public.customers
      add constraint customers_payment_terms_days_check
      check (payment_terms_days between 0 and 365);
  end if;
end $$;

comment on column public.customers.payment_terms_days is
  'Days from invoice issue to due date. Drives invoice due_date, and therefore receivables ageing. Default 30.';

-- ---------------------------------------------------------------------------
-- Backfill the master from the quotations
-- ---------------------------------------------------------------------------
--
-- Deduplicated on upper(trim(client_name)), NOT on the whole client tuple.
-- Lusaka City Council appears twice with the same phone and two spellings of
-- the same address ("Civic Centre, Independence Avenue, P.O. Box 30077" and
-- "Civic Centre Independence Ave, P.O Box  30077"). Grouping by the full tuple
-- would create two councils, which is exactly the duplicate-customer mess a
-- master exists to prevent.
--
-- Where the spellings differ, the most recent quotation wins: it is the most
-- likely to be current. Blank fields never overwrite a populated one.

with ranked as (
  select
    upper(trim(client_name)) as key,
    trim(client_name) as legal_name,
    nullif(trim(coalesce(client_tpin, '')), '') as tpin,
    nullif(trim(coalesce(client_email, '')), '') as email,
    nullif(trim(coalesce(client_phone, '')), '') as phone,
    nullif(trim(coalesce(client_address, '')), '') as address_line,
    row_number() over (
      partition by upper(trim(client_name))
      order by created_at desc
    ) as recency
  from public.quotations
  where trim(coalesce(client_name, '')) <> ''
),
merged as (
  select
    key,
    -- The newest spelling of the name…
    max(legal_name) filter (where recency = 1) as legal_name,
    -- …but the newest NON-BLANK value of everything else, so a later
    -- quotation that left the email empty does not erase an earlier one.
    (array_remove(array_agg(tpin order by recency), null))[1] as tpin,
    (array_remove(array_agg(email order by recency), null))[1] as email,
    (array_remove(array_agg(phone order by recency), null))[1] as phone,
    (array_remove(array_agg(address_line order by recency), null))[1] as address_line
  from ranked
  group by key
)
insert into public.customers (
  legal_name, trading_name, tpin, email, phone, address_line, city, country, notes
)
select
  merged.legal_name,
  '',
  coalesce(merged.tpin, ''),
  coalesce(merged.email, ''),
  coalesce(merged.phone, ''),
  coalesce(merged.address_line, ''),
  '',
  'Zambia',
  'Created from the quotation register when the customer master was introduced.'
from merged
where not exists (
  select 1 from public.customers c
  where upper(trim(c.legal_name)) = merged.key
);

-- ---------------------------------------------------------------------------
-- Link the quotations to the master
-- ---------------------------------------------------------------------------

update public.quotations q
set customer_id = c.id
from public.customers c
where q.customer_id is null
  and trim(coalesce(q.client_name, '')) <> ''
  and upper(trim(c.legal_name)) = upper(trim(q.client_name));

create index if not exists customers_legal_name_lower_idx
  on public.customers (upper(trim(legal_name)));
