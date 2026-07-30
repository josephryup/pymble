-- Pymble Operations — one active budget per site (audit D7)
--
-- "The site's budget" is resolved in two code paths (findOrCreateSiteBudget,
-- resolveMaterialRequestBudgetLine) that both took the most recent draft/active
-- budget. Nothing stopped a site holding two active budgets, and nothing made
-- the choice deterministic — two requests submitted either side of a new
-- budget draft could charge different budgets for the same work.
--
-- This index guarantees the database-side half: at most one *active* budget
-- per site. Drafts stay unconstrained — Finance legitimately drafts a
-- replacement alongside the live budget (site 0004 already holds two drafts),
-- and the code-side half now prefers active over draft so an open draft can
-- never steal resolution from the activated budget.

create unique index if not exists project_budgets_one_active_per_site
  on public.project_budgets (site_id)
  where status = 'active';

comment on index public.project_budgets_one_active_per_site is
  'A site has at most one active budget. Drafts are unconstrained; activation must supersede the previous active budget first (audit D7).';
