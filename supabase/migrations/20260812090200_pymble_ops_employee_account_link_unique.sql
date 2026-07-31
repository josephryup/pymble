-- Pymble Operations — one login account, one employee record (audit §2)
--
-- `employees.user_id` is the only bridge between "the person we employ" and
-- "the account that signs in". The payslip gate reads it directly, so it
-- decides whose payslip a person can open. Nothing has ever constrained it.
--
-- Found in production: three accounts were each linked to TWO employee
-- records. In every case the pair is the same person recorded twice —
--
--   John Mulilo      EMP-20260721-880CBD  active  5 payslips, 1 contract
--                    EMP-20260721-1A168C  exited  nothing at all
--   Matimba Hatimba  EMP-20260721-AAAD20  active  6 payslips, 1 contract
--                    EMP-20260721-A7F10A  exited  nothing at all
--   Mukuka Ngulube   EMP-20260626-B2F888  active  13 payslips, 1 contract
--                    EMP-20260626-B62A21  exited  nothing at all
--
-- The shape is identical each time: a duplicate record was created, marked
-- exited, and left holding no payslips, contracts, documents, leave requests or
-- onboarding items. So the fix is unambiguous — the ACTIVE record keeps the
-- account link, the empty exited duplicate gives it up.
--
-- The duplicate rows are deliberately NOT deleted. Deleting an employee record
-- is HR's call, not a migration's, and an unlinked exited record is harmless
-- where an orphaned payslip would not be. This only removes the link.
--
-- Guarded throughout: the unlink only touches rows that are exited AND carry
-- nothing, so it cannot strip an account from a record that matters.

-- ---------------------------------------------------------------------------
-- 1. Release the account link from empty exited duplicates.
-- ---------------------------------------------------------------------------
update public.employees dup
set user_id = null
where dup.user_id is not null
  and dup.status = 'exited'
  -- Another employee shares this account…
  and exists (
    select 1
    from public.employees keeper
    where keeper.user_id = dup.user_id
      and keeper.id <> dup.id
      and keeper.status <> 'exited'
  )
  -- …and this record carries nothing that would be orphaned.
  and not exists (
    select 1 from public.staff_payroll_items i where i.employee_id = dup.id
  )
  and not exists (
    select 1 from public.employee_contracts c where c.employee_id = dup.id
  )
  and not exists (
    select 1 from public.employee_documents d where d.employee_id = dup.id
  )
  and not exists (
    select 1 from public.leave_requests l where l.employee_id = dup.id
  )
  and not exists (
    select 1 from public.employee_onboarding_items o where o.employee_id = dup.id
  );

-- ---------------------------------------------------------------------------
-- 2. Enforce it from here on.
-- ---------------------------------------------------------------------------
-- Partial, so the many employees with no account yet remain unconstrained —
-- an unlinked employee is a gap to fill (§2), not an error.
create unique index if not exists employees_user_id_unique
  on public.employees (user_id)
  where user_id is not null;

comment on index public.employees_user_id_unique is
  'One login account maps to at most one employee record. This column decides whose payslip an account can open, so a duplicate link is a privacy defect, not a tidiness one (audit §2).';
