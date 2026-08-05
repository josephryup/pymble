-- S7 — legacy payroll and cash advances were gated only by "not crew".
--
-- Independent audit 2026-08-04, finding S7 (added 2026-08-05). The write paths
-- for payroll_runs, payroll_run_items and cash_advances were guarded in code by
-- `canManageOps`, which is literally `role !== "crew"` — 25 of 26 roles. Create,
-- approve and complete a payroll run were all reachable by, among others,
-- admin_receptionist and engineering_intern, through the normal UI.
--
-- Destructive operations were already correct (cancel/archive = MD, Owner or
-- Developer; delete = Developer only, all inline role checks in
-- payroll-actions.ts). It was the money-moving middle of the lifecycle that was
-- open.
--
-- The code side now uses `canManagePayrollRun` (src/lib/ops/permissions.ts),
-- deliberately identical to `canManageOpsStaffPayroll`. This migration brings
-- the database to the same answer, so neither door is the weak one.
--
-- Note this is the opposite direction to the 20260805090000 migration: there,
-- RLS was wider than code. Here, code has just become narrower than RLS.

-- Mirrors canManagePayrollRun / canManageOpsStaffPayroll: leadership, HR, and
-- the Finance Manager. Note this excludes `accountant`, who may *view* staff
-- payroll (private.can_access_staff_payroll) but may not run it.
create or replace function private.can_manage_payroll_run()
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
        'finance_manager'
      ),
      false
    )
$$;

-- EXECUTE stays granted to `authenticated`: RLS policies are evaluated as the
-- calling role. The `private` schema is not exposed by PostgREST, so this is
-- not a reachable RPC. See 20260805090100 for the full reasoning.
revoke all on function private.can_manage_payroll_run() from public, anon;
grant execute on function private.can_manage_payroll_run() to authenticated;

drop policy if exists payroll_runs_write_admin on public.payroll_runs;
create policy payroll_runs_write_admin on public.payroll_runs
  for all to authenticated
  using (private.can_manage_payroll_run())
  with check (private.can_manage_payroll_run());

drop policy if exists payroll_run_items_write_admin on public.payroll_run_items;
create policy payroll_run_items_write_admin on public.payroll_run_items
  for all to authenticated
  using (private.can_manage_payroll_run())
  with check (private.can_manage_payroll_run());

drop policy if exists cash_advances_write_admin on public.cash_advances;
create policy cash_advances_write_admin on public.cash_advances
  for all to authenticated
  using (private.can_manage_payroll_run())
  with check (private.can_manage_payroll_run());
