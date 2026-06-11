-- Pymble Operations — Supplier kind (vendor / subcontractor / both)
-- The Odoo ERP requirement treats subcontractors as a separate cost/relationship
-- category from material vendors. This adds a `kind` column on suppliers so the
-- workspace can show them separately without breaking existing FK references
-- (subcontractor cost categories, RFQ flows, etc. all stay supplier-linked).

do $$
begin
  if not exists (select 1 from pg_type where typname = 'ops_supplier_kind') then
    create type public.ops_supplier_kind as enum (
      'vendor',
      'subcontractor',
      'both'
    );
  end if;
end $$;

alter table public.suppliers
  add column if not exists kind public.ops_supplier_kind not null default 'vendor';

-- Backfill: treat existing suppliers whose category clearly implies a sub as
-- 'subcontractor'; leave the rest as the default 'vendor'.
update public.suppliers
set kind = 'subcontractor'
where kind = 'vendor'
  and (
    category ilike '%subcontract%'
    or category ilike '%sub_contract%'
    or category ilike '%labour%'
    or category ilike '%services%'
  );

create index if not exists suppliers_kind_idx on public.suppliers(kind, status);

comment on column public.suppliers.kind is
  'vendor = supplies materials/equipment; subcontractor = supplies labour/services; both = applies to either flow.';
