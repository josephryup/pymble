-- ops_trial_balance aggregates the whole general ledger, but it was created
-- with Postgres view defaults: definer semantics (runs with the owner's
-- rights, skipping the caller's RLS) plus the automatic PUBLIC grants. Net
-- effect: any holder of the public anon key could read company account
-- balances via /rest/v1/ops_trial_balance. The app only reads the view with
-- the service client (src/lib/ops/gl.ts), so both doors can be closed.

alter view public.ops_trial_balance set (security_invoker = true);

revoke all on public.ops_trial_balance from public;
revoke all on public.ops_trial_balance from anon;
revoke all on public.ops_trial_balance from authenticated;
