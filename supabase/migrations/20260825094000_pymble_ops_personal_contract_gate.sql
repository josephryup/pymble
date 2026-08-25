-- ---------------------------------------------------------------------------
-- Contracts: give the personal-contract gate its own function
-- ---------------------------------------------------------------------------
--
-- The RLS on `contracts` reused private.can_access_hr_maturity() for the
-- "contract with a person" test. That function is the general HR gate and
-- includes 'admin_receptionist', who belongs in HR for the directory and the
-- leave diary — but not for salaries.
--
-- PERSONAL_CONTRACT_VIEWER_ROLES in contract-permissions.ts has always excluded
-- them. So the policy was WIDER than the code reading through it by exactly one
-- role: the standing finding of this codebase, reappearing in the module whose
-- own comments warn about it.
--
-- Nothing was exposed in practice — every app read of contracts goes through
-- the service-role client and is gated in TypeScript — but "the second line of
-- defence is wider than the first" is not a state to leave in place. If
-- anything ever reads contracts through RLS, the receptionist sees salaries.
--
-- One function, one role list, matching the TypeScript exactly. Compared by
-- tests/ops-contract-rls-parity.test.ts, which parses both.

create or replace function private.can_access_personal_contracts()
returns boolean
returns null on null input
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
        'operations_manager'
      ),
      false
    );
$$;

grant execute on function private.can_access_personal_contracts() to authenticated;

comment on function private.can_access_personal_contracts() is
  'Who may read a contract whose counterparty is a person — it carries pay and personal contact details. Mirrors PERSONAL_CONTRACT_VIEWER_ROLES in contract-permissions.ts EXACTLY; narrower than can_access_hr_maturity(), which admits admin_receptionist for the directory and leave diary but not for salaries.';

-- Repoint both contract gates at it.

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
        or private.can_access_personal_contracts()
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
      or private.can_access_personal_contracts()
    )
  );
