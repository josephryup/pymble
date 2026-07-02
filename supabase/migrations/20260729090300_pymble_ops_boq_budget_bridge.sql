-- Pymble Operations — BOQ ↔ project budget bridge
--
-- Records which project budget was generated/synced from a given BOQ issue.
-- Set once, at issue time, by issueBoqAction. A site could in principle have
-- multiple issued BOQ versions over time; this FK models "the budget this
-- particular BOQ version drove," not a hard uniqueness constraint — budgets
-- are already versioned separately via project_budgets.status.

alter table public.boq_documents
  add column if not exists budget_id uuid references public.project_budgets(id) on delete set null;

create index if not exists boq_documents_budget_id_idx
  on public.boq_documents(budget_id)
  where budget_id is not null;

comment on column public.boq_documents.budget_id is
  'The project budget generated/synced from this schedule when it was issued. Set by issueBoqAction; see syncProjectBudgetFromBoq.';
