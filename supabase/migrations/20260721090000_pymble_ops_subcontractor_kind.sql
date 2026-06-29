-- Subcontractor kind: company (registered firm) vs general (an individual /
-- sole-trader subcontractor). Existing rows are all companies, so default to
-- 'company'. For a 'general' subcontractor the company_name column holds the
-- individual's full name.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'ops_subcontractor_kind') then
    create type public.ops_subcontractor_kind as enum ('company', 'general');
  end if;
end$$;

alter table public.subcontractors
  add column if not exists kind public.ops_subcontractor_kind not null default 'company';

comment on column public.subcontractors.kind is
  'company = registered firm; general = an individual / sole-trader subcontractor (company_name holds the person''s name).';
