-- Pymble Operations — Material Request ↔ project budget link
--
-- Adds:
--   • material_requests.budget_line_id — the goods (materials) budget line
--     this request draws against, resolved at submit time from the linked
--     BOQ line's category (or the site's Unplanned/Contingency line for
--     ad-hoc requests with no BOQ link — see resolveMaterialRequestBudgetLine).
--   • material_requests.transport_budget_line_id — the site's dedicated
--     transport budget line. Always resolved separately from the goods line,
--     since transport is never mixed into goods totals anywhere else in this
--     schema (see material_requests.transport_cost).
--   • material_request_items.boq_line_item_id — per-line traceability back
--     to the plan, so a request (or one of its lines) can be tied to the
--     specific schedule line it fulfils even when the header-level budget
--     line is a category-level simplification.

alter table public.material_requests
  add column if not exists budget_line_id uuid references public.project_budget_lines(id) on delete set null,
  add column if not exists transport_budget_line_id uuid references public.project_budget_lines(id) on delete set null;

alter table public.material_request_items
  add column if not exists boq_line_item_id uuid references public.boq_line_items(id) on delete set null;

create index if not exists material_requests_budget_line_id_idx
  on public.material_requests(budget_line_id)
  where budget_line_id is not null;
create index if not exists material_requests_transport_budget_line_id_idx
  on public.material_requests(transport_budget_line_id)
  where transport_budget_line_id is not null;
create index if not exists material_request_items_boq_line_item_id_idx
  on public.material_request_items(boq_line_item_id)
  where boq_line_item_id is not null;

comment on column public.material_requests.budget_line_id is
  'Goods (materials) project_budget_lines row this request draws against. Resolved at submit time; falls back to the site''s lazily-created "unplanned" category line when no BOQ line is linked.';
comment on column public.material_requests.transport_budget_line_id is
  'The site''s dedicated transport project_budget_lines row. Always resolved independently of budget_line_id, since transport_cost is never part of the goods total.';
comment on column public.material_request_items.boq_line_item_id is
  'Optional link to the material schedule line this item fulfils. Drives budget_line_id resolution and BOQ-estimate-vs-actual variance reporting.';
