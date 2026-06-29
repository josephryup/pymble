-- General (individual) subcontractors commonly share the same personal name, so
-- the global unique on company_name is wrong for them. Drop it and keep a
-- lighter guard: registered company names stay unique among active rows, while
-- individuals may duplicate freely.

alter table public.subcontractors
  drop constraint if exists subcontractors_company_name_key;

create unique index if not exists subcontractors_company_name_company_unique
  on public.subcontractors (company_name)
  where kind = 'company' and archived_at is null;
