-- Per-item supplier model: each line on a BOQ, Material Request, or Purchase
-- Order can nominate its own supplier. Either by reference (suppliers.id) or
-- by typed free text (when the supplier isn't on the master list yet).
--
-- This is the data side of the workflow change requested: BOQ / RFQ / PO no
-- longer "invite" a supplier — they just record which supplier each line is
-- going to. See docs/pymble-ops-workflow-design.md for the workflow.

alter table public.material_request_items
  add column if not exists supplier_id uuid references public.suppliers(id),
  add column if not exists supplier_name_freeform text;

alter table public.boq_line_items
  add column if not exists supplier_name_freeform text;

alter table public.purchase_order_items
  add column if not exists supplier_id uuid references public.suppliers(id),
  add column if not exists supplier_name_freeform text;

create index if not exists material_request_items_supplier_idx
  on public.material_request_items (supplier_id);

create index if not exists purchase_order_items_supplier_idx
  on public.purchase_order_items (supplier_id);
