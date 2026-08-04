-- Narrow the RLS write policies that were wider than the TypeScript gate.
--
-- Context (independent audit 2026-08-04, §0). NEXT_PUBLIC_SUPABASE_ANON_KEY
-- ships in the client bundle because Realtime needs it, so any signed-in user
-- can call /rest/v1/<table> directly. On that path the 354 TypeScript
-- permission functions are not involved at all — RLS is the only gate. Where
-- an RLS policy names more roles than the TS predicate that guards the same
-- table in the app, the database is the weaker of the two doors.
--
-- Five tables were confirmed wider in the database than in code. Each one
-- below replaces an inline 20-role array with a helper that mirrors the exact
-- TypeScript predicate, following the pattern already set by
-- private.can_access_staff_payroll().
--
-- Deliberately NOT changed, and why:
--   * payroll_runs, payroll_run_items, cash_advances, organization_profile,
--     attendance_records — the RLS list (20 roles) is TIGHTER than the TS gate
--     (`canManageOps` / `canRecordAttendance` = every role except `crew`).
--     Narrowing RLS here would not match code, and widening it to match would
--     make things worse. The real problem on these tables is the weak
--     application-layer gate, which is a code change, not a policy change.
--   * site_photos — uploads are intentionally broad (field crews post photos
--     through the offline replay route). Only deletion is restricted, and that
--     is an ownership check in code, not a role list.

-- ---------------------------------------------------------------------------
-- Helpers. STABLE SECURITY DEFINER + pinned search_path, matching the existing
-- private.* helpers. Each is the SQL mirror of a named TypeScript predicate;
-- the comment records which one, so the two cannot drift silently.
-- ---------------------------------------------------------------------------

-- Mirrors INVOICE_CREATE_ROLES / INVOICE_EDIT_ROLES in
-- src/lib/ops/invoice-permissions.ts
create or replace function private.can_manage_invoices()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select private.is_active_ops_user()
    and coalesce(
      private.current_user_role()::text in (
        'developer',
        'managing_director',
        'owner',
        'general_manager',
        'manager',
        'finance_manager',
        'accountant',
        'quantity_surveyor'
      ),
      false
    )
$$;

-- Mirrors the union of BOQ_CREATE_ROLES, BOQ_ARCHIVE_ROLES and
-- BOQ_PRICING_ROLES in src/lib/ops/boq-permissions.ts. Procurement is included
-- because pricing a submitted schedule is a write to the same rows.
create or replace function private.can_manage_boq()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select private.is_active_ops_user()
    and coalesce(
      private.current_user_role()::text in (
        'developer',
        'managing_director',
        'owner',
        'general_manager',
        'manager',
        'operations_manager',
        'projects_manager',
        'quantity_surveyor',
        'procurement_manager',
        'procurement',
        'procurement_assistant'
      ),
      false
    )
$$;

-- Mirrors SITE_MANAGE_ROLES / canManageSites in src/lib/ops/permissions.ts
create or replace function private.can_manage_sites()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select private.is_active_ops_user()
    and coalesce(
      private.current_user_role()::text in (
        'developer',
        'managing_director',
        'owner',
        'general_manager',
        'manager',
        'operations_manager',
        'projects_manager',
        'supervisor'
      ),
      false
    )
$$;

-- Mirrors canEditWorker in src/lib/ops/worker-actions.ts. Note this ADDS
-- engineering_manager, which the old 20-role array omitted even though the
-- application allows it — the previous policy was both too wide and, for one
-- role, too narrow.
create or replace function private.can_manage_workers()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select private.is_active_ops_user()
    and coalesce(
      private.current_user_role()::text in (
        'developer',
        'managing_director',
        'owner',
        'general_manager',
        'manager',
        'human_resource',
        'hr',
        'operations_manager',
        'projects_manager',
        'engineering_manager'
      ),
      false
    )
$$;

revoke all on function private.can_manage_invoices() from public, anon, authenticated;
revoke all on function private.can_manage_boq() from public, anon, authenticated;
revoke all on function private.can_manage_sites() from public, anon, authenticated;
revoke all on function private.can_manage_workers() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Repoint the write policies. Each table keeps its existing SELECT policy;
-- only the `cmd = ALL` write policy is replaced.
-- ---------------------------------------------------------------------------

drop policy if exists invoices_write_admin on public.invoices;
create policy invoices_write_admin on public.invoices
  for all to authenticated
  using (private.can_manage_invoices())
  with check (private.can_manage_invoices());

drop policy if exists boq_documents_write_admin on public.boq_documents;
create policy boq_documents_write_admin on public.boq_documents
  for all to authenticated
  using (private.can_manage_boq())
  with check (private.can_manage_boq());

drop policy if exists boq_line_items_write_admin on public.boq_line_items;
create policy boq_line_items_write_admin on public.boq_line_items
  for all to authenticated
  using (private.can_manage_boq())
  with check (private.can_manage_boq());

drop policy if exists sites_write_admin on public.sites;
create policy sites_write_admin on public.sites
  for all to authenticated
  using (private.can_manage_sites())
  with check (private.can_manage_sites());

drop policy if exists workers_write_admin on public.workers;
create policy workers_write_admin on public.workers
  for all to authenticated
  using (private.can_manage_workers())
  with check (private.can_manage_workers());
