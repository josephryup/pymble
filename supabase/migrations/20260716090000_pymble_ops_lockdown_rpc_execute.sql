-- Security hardening: lock down EXECUTE on SECURITY DEFINER RPCs.
--
-- Postgres grants EXECUTE on every new function to PUBLIC by default. PostgREST
-- exposes public-schema functions as `/rest/v1/rpc/<name>`, so the default
-- PUBLIC grant means the `anon` role (the public NEXT_PUBLIC anon key shipped to
-- every browser) could call these SECURITY DEFINER maintenance functions while
-- unauthenticated. Concretely, before this migration:
--   * `ops_archive_audit_events(-999999)` -> deletes the entire live audit_events
--     table (forensic/tamper-evidence destruction + repeatable DELETE/INSERT DoS).
--   * `ops_archive_notifications(...)`     -> purges read/archived notifications.
--   * `ops_next_invoice_number(...)`       -> burns/skips invoice numbers.
--
-- These functions are only ever invoked server-side:
--   * the two archive functions run from the monthly cron via the service-role
--     client, so they are revoked down to service_role only.
--   * ops_next_invoice_number is called by invoice creation through the cookie
--     session client (role `authenticated`), so `authenticated` is retained and
--     only public/anon are revoked.

revoke execute on function public.ops_archive_audit_events(integer)  from public, anon, authenticated;
revoke execute on function public.ops_archive_notifications(integer) from public, anon, authenticated;
revoke execute on function public.ops_next_invoice_number(text)      from public, anon;

grant execute on function public.ops_archive_audit_events(integer)  to service_role;
grant execute on function public.ops_archive_notifications(integer) to service_role;
grant execute on function public.ops_next_invoice_number(text)      to authenticated, service_role;

-- Stop the PUBLIC default grant from re-opening this for functions created later
-- in this schema. Existing functions are unaffected; this only changes defaults
-- for functions created after this statement by the migration role.
alter default privileges in schema public revoke execute on functions from public;
