-- ---------------------------------------------------------------------------
-- Contracts: tie `kind` to `counterparty_type`, and gate on both
-- ---------------------------------------------------------------------------
--
-- The two columns were independent, and every privacy gate in the module read
-- only `kind`:
--
--   * contracts_select_ops              -> kind <> 'employment' or hr_maturity
--   * private.can_read_contract(uuid)   -> same test, for the six child tables
--   * canViewOpsContractKind (TypeScript)
--   * the contract PDF and DOCX routes
--
-- Nothing checked counterparty_type against kind. contracts_counterparty_
-- exactly_one only ties counterparty_type to WHICH id column is populated, so
-- this row was valid:
--
--   kind = 'subcontract', counterparty_type = 'employee', employee_id = <staff>
--
-- On approval, buildCounterpartySnapshot writes that employee's full name,
-- phone and email into counterparty_snapshot. Because kind = 'subcontract',
-- every commercial role — quantity surveyor, procurement, procurement
-- assistant, finance manager, accountant, projects manager, operations
-- manager — could read the whole row. None of them pass
-- private.can_access_hr_maturity().
--
-- Two changes, deliberately belt and braces:
--   1. a CHECK so the mismatched row cannot exist;
--   2. the read gates widened to test BOTH columns, so even if the constraint
--      is ever dropped the row stays behind the HR gate.
--
-- The order matters: gates first, then the constraint. If the constraint fails
-- on unexpected data the migration aborts with the wider gates already in
-- place, rather than leaving the leak open.

-- ---------------------------------------------------------------------------
-- 1. Widen the read gates from kind to kind-or-counterparty
-- ---------------------------------------------------------------------------

create or replace function private.can_read_contract(target_contract_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.contracts c
    where c.id = target_contract_id
      and private.can_access_contracts()
      and (
        (c.kind <> 'employment' and c.counterparty_type <> 'employee')
        or private.can_access_hr_maturity()
      )
  );
$$;

grant execute on function private.can_read_contract(uuid) to authenticated;

drop policy if exists contracts_select_ops on public.contracts;
create policy contracts_select_ops on public.contracts
  for select to authenticated
  using (
    private.can_access_contracts()
    and (
      (kind <> 'employment' and counterparty_type <> 'employee')
      or private.can_access_hr_maturity()
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Make the mismatch impossible
-- ---------------------------------------------------------------------------
--
-- Added NOT VALID then validated separately so the migration reports which
-- rows are wrong instead of failing with an opaque constraint error. The table
-- is a week old; this is expected to validate against zero exceptions.

do $$
declare
  bad_rows integer;
begin
  select count(*)
    into bad_rows
    from public.contracts
   where (kind = 'employment') <> (counterparty_type = 'employee');

  if bad_rows > 0 then
    raise exception
      'contracts: % row(s) have kind and counterparty_type disagreeing. These may have leaked employee details to commercial roles — review them before this constraint is applied.',
      bad_rows;
  end if;
end $$;

alter table public.contracts
  drop constraint if exists contracts_kind_matches_counterparty;

alter table public.contracts
  add constraint contracts_kind_matches_counterparty
  check ((kind = 'employment') = (counterparty_type = 'employee'))
  not valid;

alter table public.contracts
  validate constraint contracts_kind_matches_counterparty;

comment on constraint contracts_kind_matches_counterparty on public.contracts is
  'An employment contract is with an employee and a subcontract is with a subcontractor. Without this, a subcontract-kind row could name an employee and slip past the kind-only privacy gates (2026-08-25).';
