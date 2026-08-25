-- ---------------------------------------------------------------------------
-- Contracts: a stamp for the outstanding-signature reminder
-- ---------------------------------------------------------------------------
--
-- Approval fires a one-time notification and nothing after it. A contract could
-- sit approved and unsigned indefinitely with nothing asking after it — the
-- 2026-08 HR contracts audit, F7: "an unsigned contract chases nobody".
--
-- Two things now chase it. The standing one is the My Queue entry, which is
-- computed live and needs no column. This column is for the other one: a single
-- nudge to the outstanding signatories once a contract has been waiting too
-- long.
--
-- Stamped when the nudge is sent, exactly like expiry_notified_at,
-- retention_notified_at and warranty_notified_at beside it. Without the stamp
-- the sweep re-sends every morning until someone signs, which is how people
-- learn to ignore a notification channel entirely.

alter table public.contracts
  add column if not exists signature_reminder_notified_at timestamptz;

comment on column public.contracts.signature_reminder_notified_at is
  'When the outstanding-signature reminder was sent. One nudge per contract, not a daily one — see runOpsContractLifecycleSweep.';

-- Drives the sweep: contracts open for signature, not yet nudged.
create index if not exists contracts_awaiting_signature_idx
  on public.contracts (status, approved_at)
  where archived_at is null
    and signature_reminder_notified_at is null
    and status in ('approved', 'issued');
