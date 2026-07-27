-- Corrective: remove the redundant 'na' verdict added in
-- 20260806090000_pymble_ops_qa_checklist_na_result.sql.
--
-- That migration was written on the assumption that the checklist verdicts had
-- no "not applicable" option. They already did: the enum has carried
-- 'not_applicable' (and 'observation') since the engineering-controls module
-- was built, and engineering-controls-actions.ts has always accepted them.
-- 'na' therefore duplicated an existing concept, which would eventually mean
-- two spellings of the same verdict in the data.
--
-- Postgres cannot drop a single enum label, so the type is rebuilt. Safe to do
-- here: the only columns of this type are qa_inspection_items.result and
-- .client_result, and no row has ever used 'na' (the value existed for minutes
-- and no code path wrote it).

do $$
begin
  if exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'ops_qa_inspection_item_result' and e.enumlabel = 'na'
  ) then
    -- Guard: refuse to run if anything actually used the value.
    if exists (
      select 1 from public.qa_inspection_items
      where result::text = 'na' or client_result::text = 'na'
    ) then
      raise exception 'Rows still use the na verdict; migrate them to not_applicable first.';
    end if;

    create type public.ops_qa_inspection_item_result_new as enum (
      'pending',
      'pass',
      'fail',
      'observation',
      'not_applicable'
    );

    alter table public.qa_inspection_items
      alter column result drop default,
      alter column client_result drop default;

    alter table public.qa_inspection_items
      alter column result type public.ops_qa_inspection_item_result_new
        using result::text::public.ops_qa_inspection_item_result_new,
      alter column client_result type public.ops_qa_inspection_item_result_new
        using client_result::text::public.ops_qa_inspection_item_result_new;

    drop type public.ops_qa_inspection_item_result;
    alter type public.ops_qa_inspection_item_result_new
      rename to ops_qa_inspection_item_result;

    alter table public.qa_inspection_items
      alter column result set default 'pending'::public.ops_qa_inspection_item_result,
      alter column client_result set default 'pending'::public.ops_qa_inspection_item_result;
  end if;
end
$$;
