-- Align existing payable ledger rows with the stations the code now writes.
--
-- Until now `upsertPaymentCostEntry` passed only the coarse `status`, so
-- `upsertProjectCostEntry` guessed the station from it: an approved payable
-- with no purchase order derived `reserved`, and a PAID one derived `actual`.
-- The GL has always posted `accrued` at approval and `paid` at settlement, so
-- the cost ledger and the general ledger disagreed about the same event.
--
-- The code now passes the station explicitly (finance-actions.ts,
-- upsertPaymentCostEntry). This brings the rows already written into line, so
-- the two ledgers agree about history as well as about everything from here.
--
-- Only the station changes. `status` is recomputed by the same mapping the
-- CHECK constraint project_cost_entries_lifecycle_status_agree enforces, and
-- every station touched here is a LIVE one, so budget consumption is
-- unchanged — no availability figure and no control band moves.

-- Approved, not yet paid → accrued.
update project_cost_entries e
set lifecycle_state = 'accrued',
    status = 'committed',
    updated_at = now()
from payment_requests p
where p.id = e.payment_request_id
  and e.lifecycle_state in ('reserved', 'committed')
  and p.status = 'approved';

-- Paid → paid. These currently read `actual`, which cannot be told apart from
-- an accrual and so makes "money actually released" unanswerable.
update project_cost_entries e
set lifecycle_state = 'paid',
    status = 'posted',
    updated_at = now()
from payment_requests p
where p.id = e.payment_request_id
  and e.lifecycle_state = 'actual'
  and p.status = 'paid';
