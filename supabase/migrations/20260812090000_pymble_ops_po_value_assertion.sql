-- Pymble Operations — enforce the inherited-approval value ceiling in the database
--
-- Phase 3 tail (docs/pymble-ops-project-finance-spine-audit.md, audit R1).
--
-- The procure action already applies the §8.5 guards before raising a purchase
-- order. That is not enough on its own, and the audit is explicit about why:
-- app-level-only guards are exactly how the 87% leak happened — the budget-line
-- resolution failures were caught, logged, and forgotten for a month. A control
-- that only exists in one code path is a control that the next code path skips.
--
-- So the ceiling is asserted here too. A purchase order claiming INHERITED
-- authority may not exceed the value its material request had approved, counting
-- every sibling PO already raised against the same request. Exceeding it is not
-- forbidden — it just cannot be done on someone else's approval. The PO must
-- carry approval_source = 'delta' and go for a variance approval, which is
-- precisely the §8.5 design.
--
-- Deliberately a trigger rather than a CHECK constraint: the rule needs
-- cross-row context (the request's items, and the other POs against it), which
-- a CHECK cannot see.

create or replace function private.assert_po_within_inherited_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  approved_value numeric;
  sibling_value numeric;
  request_number text;
begin
  -- Only inherited authority is constrained. 'direct' and 'delta' carry their
  -- own approval, so they are free to be whatever they were approved for.
  if new.approval_source is distinct from 'inherited' then
    return new;
  end if;

  if new.material_request_id is null then
    raise exception
      'Purchase order % claims inherited approval but is not linked to a material request.',
      new.po_number
      using errcode = 'check_violation';
  end if;

  -- What Finance/MD actually authorised: the priced total where priced, the
  -- engineer's estimate otherwise — the same rule the rest of the system uses.
  select
    coalesce(sum(
      case when coalesce(i.actual_total, 0) > 0
        then i.actual_total
        else coalesce(i.estimated_total, 0)
      end
    ), 0),
    max(m.request_number)
  into approved_value, request_number
  from public.material_request_items i
  join public.material_requests m on m.id = i.request_id
  where i.request_id = new.material_request_id;

  -- Every other live PO already raised against the same request.
  select coalesce(sum(po.total_amount), 0)
  into sibling_value
  from public.purchase_orders po
  where po.material_request_id = new.material_request_id
    and po.id <> new.id
    and po.status not in ('cancelled', 'rejected');

  if coalesce(new.total_amount, 0) + sibling_value > approved_value then
    raise exception
      'Purchase order % cannot inherit the approval for %: it would take the total ordered to % against an approved %. Raise it as a delta approval instead.',
      new.po_number,
      coalesce(request_number, 'the material request'),
      to_char(coalesce(new.total_amount, 0) + sibling_value, 'FM999999999990.00'),
      to_char(approved_value, 'FM999999999990.00')
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists assert_po_within_inherited_approval on public.purchase_orders;
create trigger assert_po_within_inherited_approval
  before insert or update of total_amount, approval_source, material_request_id
  on public.purchase_orders
  for each row execute function private.assert_po_within_inherited_approval();

comment on function private.assert_po_within_inherited_approval() is
  'Audit R1: a purchase order claiming inherited authority may not exceed the material request''s approved value, counting sibling POs. Enforced in the database because an app-only guard is one code path away from being skipped.';

-- ---------------------------------------------------------------------------
-- Competitive tender threshold (§8.6).
--
-- Suppliers are never invited to this system — Procurement gathers prices by
-- phone, WhatsApp, email or counter visit and records them (see §9). So an RFQ
-- costs no external round-trip and no latency: requiring one above a value
-- threshold is pure governance gain. Below it, with a known supplier,
-- Procurement prices directly, which is what already happens in practice.
-- ---------------------------------------------------------------------------
alter table public.budget_control_settings
  add column if not exists tender_threshold_zmw numeric(14, 2) not null default 50000,
  add column if not exists po_unit_price_tolerance_percent numeric(6, 2) not null default 5;

alter table public.budget_control_settings
  drop constraint if exists budget_control_settings_tender_threshold_positive;
alter table public.budget_control_settings
  add constraint budget_control_settings_tender_threshold_positive check (
    tender_threshold_zmw >= 0 and po_unit_price_tolerance_percent >= 0
  );

comment on column public.budget_control_settings.tender_threshold_zmw is
  'Request value at or above which competitive prices must be recorded (an RFQ) BEFORE the schedule/request is priced and sent for approval. Suppliers are never invited externally, so this costs no delay — see audit §8.6 and §9.';
comment on column public.budget_control_settings.po_unit_price_tolerance_percent is
  'How far a purchase order unit price may exceed the approved price before inheritance is void and a delta approval is required (audit §8.5).';
