-- Actual project budget on sites. The planned budget (budget_zmw) is visible to
-- leadership, the operations manager, and finance; the actual budget is even
-- more sensitive and is leadership-only. Visibility is enforced in the
-- application layer (canViewSiteBudget / canViewSiteActualBudget) — this column
-- just stores the figure.

alter table public.sites
  add column if not exists actual_budget_zmw numeric(14, 2) not null default 0
    check (actual_budget_zmw >= 0);
