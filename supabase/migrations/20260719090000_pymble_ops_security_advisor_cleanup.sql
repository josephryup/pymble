-- Security advisor cleanup.
--
-- 1) rls_auto_enable() is an event-trigger function (returns event_trigger) and
--    cannot actually be invoked via PostgREST RPC, but it still carries the
--    default PUBLIC EXECUTE grant which trips the SECURITY DEFINER advisor.
--    Revoke it down to nothing callable; the event trigger fires regardless of
--    EXECUTE privilege.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

-- 2) Pin a stable search_path on the material-request total trigger function.
--    It only touches NEW.* columns (no unqualified object lookups), so an empty
--    search_path is safe and removes the function_search_path_mutable warning.
alter function public.set_material_request_item_actual_total() set search_path = '';
