-- The internal signing panel is HR, the General Manager and the Managing
-- Director — not the Operations Manager.
--
-- Renaming rather than adding-and-deprecating is safe because
-- contract_signatures was still empty when this ran: the contracts migration
-- landed hours earlier and nothing had been drafted yet. Once real signatures
-- exist this would have to become add + backfill + drop instead.
--
-- Guarded so it is a no-op on a database built from the current
-- 20260818090000 file, which already declares 'general_manager'.

do $$
begin
  if exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'ops_contract_signatory_role'
      and e.enumlabel = 'operations_manager'
  ) then
    alter type public.ops_contract_signatory_role
      rename value 'operations_manager' to 'general_manager';
  end if;
end $$;
