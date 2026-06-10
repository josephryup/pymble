-- Pymble Operations — BOQ line item supplier selection
-- Adds an optional nominated/preferred supplier to each BOQ measured line so the
-- choice can feed RFQ creation and purchase orders downstream.

alter table public.boq_line_items
  add column if not exists supplier_id uuid references public.suppliers(id) on delete set null;

create index if not exists boq_line_items_supplier_id_idx
  on public.boq_line_items (supplier_id);

comment on column public.boq_line_items.supplier_id is
  'Optional nominated supplier for this measured line; pre-fills RFQ/PO when the line is sourced.';
