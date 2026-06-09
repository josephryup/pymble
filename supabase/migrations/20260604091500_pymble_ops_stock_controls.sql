create or replace function public.ops_post_stock_movement(
  p_stock_item_id uuid,
  p_location_id uuid,
  p_movement_type public.ops_stock_movement_type,
  p_quantity numeric,
  p_unit_cost numeric,
  p_source_table text,
  p_source_id uuid,
  p_movement_at timestamptz,
  p_created_by uuid,
  p_notes text
)
returns table (
  stock_level_id uuid,
  movement_id uuid,
  quantity_on_hand numeric
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_level_id uuid;
  v_current_quantity numeric(14, 2);
  v_next_quantity numeric(14, 2);
begin
  if p_quantity = 0 then
    raise exception 'Stock movement quantity cannot be zero.';
  end if;

  if p_source_table !~ '^[a-z][a-z0-9_]*$' then
    raise exception 'Invalid stock movement source table.';
  end if;

  if not exists (
    select 1
    from public.stock_items
    where id = p_stock_item_id
      and is_active = true
  ) then
    raise exception 'Active stock item was not found.';
  end if;

  if not exists (
    select 1
    from public.inventory_locations
    where id = p_location_id
      and is_active = true
  ) then
    raise exception 'Active stock location was not found.';
  end if;

  select id, quantity_on_hand
  into v_level_id, v_current_quantity
  from public.stock_levels
  where stock_item_id = p_stock_item_id
    and location_id = p_location_id
  for update;

  if v_level_id is null then
    if p_quantity < 0 then
      raise exception 'Insufficient stock at the selected location.';
    end if;

    insert into public.stock_levels (
      stock_item_id,
      location_id,
      quantity_on_hand,
      last_movement_at
    )
    values (
      p_stock_item_id,
      p_location_id,
      p_quantity,
      coalesce(p_movement_at, now())
    )
    returning id, quantity_on_hand
    into v_level_id, v_next_quantity;
  else
    v_next_quantity := v_current_quantity + p_quantity;

    if v_next_quantity < 0 then
      raise exception 'Insufficient stock at the selected location.';
    end if;

    update public.stock_levels
    set
      quantity_on_hand = v_next_quantity,
      last_movement_at = coalesce(p_movement_at, now())
    where id = v_level_id
    returning quantity_on_hand
    into v_next_quantity;
  end if;

  insert into public.stock_movements (
    stock_item_id,
    location_id,
    movement_type,
    quantity,
    unit_cost,
    source_table,
    source_id,
    movement_at,
    created_by,
    notes
  )
  values (
    p_stock_item_id,
    p_location_id,
    p_movement_type,
    p_quantity,
    greatest(coalesce(p_unit_cost, 0), 0),
    p_source_table,
    coalesce(p_source_id, v_level_id),
    coalesce(p_movement_at, now()),
    p_created_by,
    coalesce(p_notes, '')
  )
  returning id
  into movement_id;

  stock_level_id := v_level_id;
  quantity_on_hand := v_next_quantity;
  return next;
end;
$$;

create or replace function public.ops_transfer_stock(
  p_stock_item_id uuid,
  p_from_location_id uuid,
  p_to_location_id uuid,
  p_quantity numeric,
  p_unit_cost numeric,
  p_movement_at timestamptz,
  p_created_by uuid,
  p_notes text
)
returns table (
  from_stock_level_id uuid,
  to_stock_level_id uuid,
  issue_movement_id uuid,
  receipt_movement_id uuid,
  from_quantity_on_hand numeric,
  to_quantity_on_hand numeric
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_out record;
  v_in record;
begin
  if p_quantity <= 0 then
    raise exception 'Transfer quantity must be greater than zero.';
  end if;

  if p_from_location_id = p_to_location_id then
    raise exception 'Transfer destination must be different from the source location.';
  end if;

  select *
  into v_out
  from public.ops_post_stock_movement(
    p_stock_item_id,
    p_from_location_id,
    'transfer',
    p_quantity * -1,
    p_unit_cost,
    'stock_levels',
    null,
    p_movement_at,
    p_created_by,
    p_notes
  );

  select *
  into v_in
  from public.ops_post_stock_movement(
    p_stock_item_id,
    p_to_location_id,
    'transfer',
    p_quantity,
    p_unit_cost,
    'stock_levels',
    v_out.stock_level_id,
    p_movement_at,
    p_created_by,
    p_notes
  );

  from_stock_level_id := v_out.stock_level_id;
  to_stock_level_id := v_in.stock_level_id;
  issue_movement_id := v_out.movement_id;
  receipt_movement_id := v_in.movement_id;
  from_quantity_on_hand := v_out.quantity_on_hand;
  to_quantity_on_hand := v_in.quantity_on_hand;
  return next;
end;
$$;

revoke all on function public.ops_post_stock_movement(
  uuid,
  uuid,
  public.ops_stock_movement_type,
  numeric,
  numeric,
  text,
  uuid,
  timestamptz,
  uuid,
  text
) from public, anon, authenticated;

revoke all on function public.ops_transfer_stock(
  uuid,
  uuid,
  uuid,
  numeric,
  numeric,
  timestamptz,
  uuid,
  text
) from public, anon, authenticated;

grant execute on function public.ops_post_stock_movement(
  uuid,
  uuid,
  public.ops_stock_movement_type,
  numeric,
  numeric,
  text,
  uuid,
  timestamptz,
  uuid,
  text
) to service_role;

grant execute on function public.ops_transfer_stock(
  uuid,
  uuid,
  uuid,
  numeric,
  numeric,
  timestamptz,
  uuid,
  text
) to service_role;
