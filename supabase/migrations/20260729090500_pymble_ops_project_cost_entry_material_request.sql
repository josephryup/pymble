-- Pymble Operations — Project cost ledger: Material Request source
--
-- project_cost_entries already has a generic source_table/source_id pointer,
-- but payment_request_id already gets first-class-column treatment (see
-- 20260604152000_pymble_ops_finance_bridge.sql) rather than relying solely on
-- the generic pointer. This adds the same treatment for material_request_id,
-- for consistency and so the ledger can be queried directly by request.
--
-- A single material request can produce TWO cost entries — goods and
-- transport — both keyed by the same material_request_id, which a single
-- unique-per-request index can't express. Two partial unique indexes, split
-- on cost_type, cover both rows while still preventing duplicates within
-- each. This is the one deliberate deviation from the payment-request
-- precedent (which only ever produces one entry per payment request).

alter table public.project_cost_entries
  add column if not exists material_request_id uuid references public.material_requests(id) on delete set null;

create unique index if not exists project_cost_entries_material_request_goods_unique
  on public.project_cost_entries(material_request_id)
  where material_request_id is not null and cost_type <> 'transport';

create unique index if not exists project_cost_entries_material_request_transport_unique
  on public.project_cost_entries(material_request_id)
  where material_request_id is not null and cost_type = 'transport';

comment on column public.project_cost_entries.material_request_id is
  'Material request that produced this ledger entry. A request yields up to two entries: cost_type=materials (goods) and cost_type=transport, each upserted idempotently via upsertMaterialRequestCostEntries.';
