-- Pymble Operations — BOQ pricing workflow (part 2: columns)
--
-- Adds:
--   • submitted_at / priced_at / priced_by / issued_at / issued_by on
--     boq_documents — audit timestamps for the new pricing-split lifecycle,
--     mirroring material_requests.priced_at/priced_by.
--   • category / needed_by / estimated_transport_cost / lead_time_days_override
--     on boq_line_items — the material schedule's classification, planning
--     date, and Procurement-entered transport estimate.
--
-- budgeted_total stays quantity * unit_rate (unchanged, generated column).
-- estimated_transport_cost is deliberately excluded from it, matching the
-- material_requests.transport_cost convention: transport is never part of
-- the goods total.

alter table public.boq_documents
  add column if not exists submitted_at timestamptz,
  add column if not exists priced_at timestamptz,
  add column if not exists priced_by uuid references public.users(id) on delete set null,
  add column if not exists issued_at timestamptz,
  add column if not exists issued_by uuid references public.users(id) on delete set null;

alter table public.boq_line_items
  add column if not exists category text not null default 'general'
    check (category ~ '^[a-z][a-z0-9_]*$'),
  add column if not exists needed_by date,
  add column if not exists estimated_transport_cost numeric(14, 2) not null default 0
    check (estimated_transport_cost >= 0),
  add column if not exists lead_time_days_override integer
    check (lead_time_days_override is null or lead_time_days_override >= 0);

create index if not exists boq_line_items_category_idx on public.boq_line_items(category);

comment on column public.boq_documents.submitted_at is
  'Timestamp the Quantity Surveyor submitted the schedule for Procurement pricing (draft → pricing_pending).';
comment on column public.boq_documents.priced_at is
  'Timestamp Procurement finished pricing every line (pricing_pending → priced).';
comment on column public.boq_documents.priced_by is
  'User who priced the schedule (Procurement role).';
comment on column public.boq_documents.issued_at is
  'Timestamp the schedule was issued (priced → issued). Issuing generates/syncs the project budget.';
comment on column public.boq_documents.issued_by is
  'User who issued the schedule.';
comment on column public.boq_line_items.category is
  'Classification of this line (foundation, excavation, structure, roofing, finishes, mep, transport, general, ...). Free text, same shape as project_budget_lines.category, so it stays as extensible as the budget side. Drives which project_budget_lines row this line rolls up into on issue.';
comment on column public.boq_line_items.needed_by is
  'Quantity Surveyor-entered date this material is required on site. Authoritative when the line has no linked project_task; otherwise a manual override of the task-derived date (see project_task_id).';
comment on column public.boq_line_items.estimated_transport_cost is
  'Procurement-entered planning estimate of transport/freight cost for this line. Never part of budgeted_total — rolls into the project budget''s dedicated transport line on issue, same non-goods-total convention as material_requests.transport_cost.';
comment on column public.boq_line_items.lead_time_days_override is
  'Manual fallback lead time (days) used to compute the "trigger a material request by" date, until BOQ lines are formally coded against stock_items.';
