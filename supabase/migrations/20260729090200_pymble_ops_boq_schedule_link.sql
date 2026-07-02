-- Pymble Operations — Material schedule ↔ project schedule link
--
-- Optional direct FK from a BOQ line item to the project task it supplies
-- (e.g. "Foundation works" can have many lines: concrete, rebar, formwork).
-- Deliberately a direct FK rather than a shared phase-taxonomy join, so it
-- survives task renames and stays queryable — same pattern already used for
-- boq_line_items.supplier_id.
--
-- Dates are NEVER copied/synced onto the BOQ line. The effective "needed by"
-- and "trigger a material request by" dates are computed at read time from
-- the live project_task (planned_start_date − lead time), so when a task's
-- schedule shifts, the material plan reflects it automatically with zero
-- drift risk and no sync code. boq_line_items.needed_by remains the QS's
-- manual value for unlinked lines, or an override once linked.

alter table public.boq_line_items
  add column if not exists project_task_id uuid references public.project_tasks(id) on delete set null;

create index if not exists boq_line_items_project_task_id_idx
  on public.boq_line_items(project_task_id)
  where project_task_id is not null;

comment on column public.boq_line_items.project_task_id is
  'Optional link to the project schedule task this material supplies. When set, the effective trigger-by date is derived at read time from the task''s planned_start_date, not stored here.';
