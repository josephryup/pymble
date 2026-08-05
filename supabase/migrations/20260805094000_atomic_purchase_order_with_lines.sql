-- R1 — a purchase order and its lines are now written in one transaction.
--
-- Independent audit 2026-08-04, finding R1, applied to procure-and-commit.
--
-- Scope note, deliberately narrow. The audit suggested moving the whole
-- procure-and-commit flow into Postgres. On reading it, that would be the
-- wrong trade: `procureMaterialRequestAction` is ~250 lines of per-supplier
-- grouping, approval-inheritance and idempotency logic currently covered by
-- tests in TypeScript. Porting all of it to plpgsql would move tested logic
-- into untested SQL to buy atomicity over steps that are already ordered
-- defensively (the PO is created as DRAFT; issuing is a separate act).
--
-- What genuinely needed fixing is smaller. The flow did:
--
--   insert into purchase_orders ... returning id, po_number
--   insert into purchase_order_items (many rows referencing that id)
--
-- as two calls. If the second failed, the action redirected with an error and
-- left an orphaned draft purchase order behind — one that had already consumed
-- a number from the PO sequence, and that appears in the register as a real PO
-- with no lines and a total matching nothing.
--
-- TWO SHARP EDGES, both found by exercising this against the real schema
-- rather than by reading it.
--
-- IMPLEMENTATION NOTE 1. The obvious shape,
--   insert into purchase_orders select * from jsonb_populate_record(null::…, p_order)
-- is wrong, and quietly so. jsonb_populate_record fills keys absent from the
-- JSON with NULL rather than leaving them to the column default, and this
-- table has NOT NULL defaults for id, po_number, created_at, updated_at,
-- currency_code, description, status, scope, total_amount and
-- approval_source. That form would drive an explicit NULL into every one of
-- them and fail on `id` — so the insert names only the columns the caller
-- actually supplied, letting Postgres apply defaults for the rest.
--
-- IMPLEMENTATION NOTE 2. `purchase_order_items.line_total` is
-- GENERATED ALWAYS AS (quantity * unit_cost). PostgREST silently drops
-- generated columns from an INSERT, which is why the existing TypeScript can
-- send `line_total` and still work; raw SQL is not so forgiving and errors
-- with 428C9. Both column filters therefore exclude generated columns, which
-- also keeps this correct if either table gains one later.

create or replace function public.ops_insert_purchase_order_with_lines(
  p_order jsonb,
  p_lines jsonb
)
returns table (
  id uuid,
  po_number text
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_order_columns text;
  v_line_columns text;
  v_order_id uuid;
  v_po_number text;
begin
  if p_order is null or jsonb_typeof(p_order) <> 'object' then
    raise exception 'p_order must be a JSON object' using errcode = 'invalid_parameter_value';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    -- A PO with no lines is the exact artefact this function exists to
    -- prevent, so refuse to create one rather than clean one up later.
    raise exception 'A purchase order must have at least one line'
      using errcode = 'check_violation';
  end if;

  -- Only real columns, quoted. Unknown keys are dropped rather than erroring,
  -- and quote_ident keeps the dynamic SQL safe even though every caller here
  -- is our own server.
  select string_agg(quote_ident(key), ', ' order by key)
    into v_order_columns
  from jsonb_object_keys(p_order) as key
  where exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'purchase_orders'
      and c.column_name = key
      and c.is_generated = 'NEVER'
  );

  if v_order_columns is null then
    raise exception 'p_order contained no recognisable purchase_orders columns'
      using errcode = 'invalid_parameter_value';
  end if;

  execute format(
    'insert into public.purchase_orders (%1$s) '
    'select %1$s from jsonb_populate_record(null::public.purchase_orders, $1) '
    'returning id, po_number',
    v_order_columns
  )
  using p_order
  into v_order_id, v_po_number;

  -- Lines are uniform, so the first element defines the column set.
  select string_agg(quote_ident(key), ', ' order by key)
    into v_line_columns
  from jsonb_object_keys(p_lines -> 0) as key
  where exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'purchase_order_items'
      and c.column_name = key
      and c.is_generated = 'NEVER'
  );

  if v_line_columns is null then
    raise exception 'p_lines contained no recognisable purchase_order_items columns'
      using errcode = 'invalid_parameter_value';
  end if;

  -- The caller cannot know the generated id, so stamp it on every line here
  -- rather than making them round-trip for it.
  if position('purchase_order_id' in v_line_columns) = 0 then
    v_line_columns := v_line_columns || ', purchase_order_id';
  end if;

  execute format(
    'insert into public.purchase_order_items (%1$s) '
    'select %1$s from jsonb_populate_recordset(null::public.purchase_order_items, $1)',
    v_line_columns
  )
  using (
    select jsonb_agg(line || jsonb_build_object('purchase_order_id', v_order_id))
    from jsonb_array_elements(p_lines) as line
  );

  return query select v_order_id, v_po_number;
end;
$$;

-- Service-role only, like every other write path in this app.
revoke all on function public.ops_insert_purchase_order_with_lines(jsonb, jsonb) from public, anon, authenticated;
