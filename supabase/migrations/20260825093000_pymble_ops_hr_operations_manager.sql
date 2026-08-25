-- ---------------------------------------------------------------------------
-- Operations Manager joins HR
-- ---------------------------------------------------------------------------
--
-- Decision of 2026-08-25: the OM runs HR admin day to day — approving leave,
-- maintaining employee records, and drawing up employment contracts — so they
-- get the full HR view, salaries included.
--
-- Four lists must agree or the app and the database disagree about who this
-- person is:
--
--   * OPS_HR_ROLES                     constants.ts        (nav + module access)
--   * HR_VIEW_ROLES / HR_MANAGE_ROLES  hr-permissions.ts   (every hr.ts fetcher)
--   * PERSONAL_CONTRACT_VIEWER_ROLES   contract-permissions.ts
--   * private.can_access_hr_maturity() THIS FILE           (RLS)
--
-- The first three shipped with this migration. This is the fourth. Without it
-- the OM would reach a register the RLS policy on `contracts` refuses, because
-- contracts_select_ops calls this function directly.
--
-- Deliberately NOT extended: EMPLOYEE_ACCOUNT_LINK_ROLES in hr-permissions.ts.
-- That list decides who may bind an employee record to a login account, and
-- employees.user_id is the only bridge the payslip self-service gate reads.
-- Widening HR admin is a workload decision; deciding whose payslip an account
-- can open is not. It stays at HR, MD, Owner and developer.

create or replace function private.can_access_hr_maturity()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select private.is_active_ops_user()
    and coalesce(
      private.current_user_role()::text in (
        'developer',
        'managing_director',
        'general_manager',
        'owner',
        'manager',
        'human_resource',
        'hr',
        'admin_receptionist',
        -- Added 2026-08-25. See the header: three TypeScript lists carry the
        -- same addition and all four are meant to be compared together.
        'operations_manager'
      ),
      false
    )
$$;

grant execute on function private.can_access_hr_maturity() to authenticated;

comment on function private.can_access_hr_maturity() is
  'HR data gate: employee records, contracts, appraisals, leave balances and the employment kind of public.contracts. Mirrors HR_VIEW_ROLES in hr-permissions.ts and PERSONAL_CONTRACT_VIEWER_ROLES in contract-permissions.ts — change all of them together.';
