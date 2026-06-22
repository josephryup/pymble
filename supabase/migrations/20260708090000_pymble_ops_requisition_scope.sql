-- General (office) vs site requisitions and material requests.
--
-- Some purchasing is for a project site and some is general/office overhead.
-- Add a `scope` discriminator and allow `site_id` to be null when scope is
-- 'general'. Purchase orders carry the scope/site through from the requisition
-- they are converted from.

alter table public.rfqs
  add column if not exists scope text not null default 'site'
    check (scope in ('site', 'general'));

alter table public.material_requests
  add column if not exists scope text not null default 'site'
    check (scope in ('site', 'general'));

alter table public.purchase_orders
  add column if not exists scope text not null default 'site'
    check (scope in ('site', 'general'));

alter table public.rfqs alter column site_id drop not null;
alter table public.material_requests alter column site_id drop not null;
alter table public.purchase_orders alter column site_id drop not null;

-- Guard: a site-scoped record must have a site; a general one must not.
alter table public.rfqs drop constraint if exists rfqs_scope_site_chk;
alter table public.rfqs add constraint rfqs_scope_site_chk
  check ((scope = 'site' and site_id is not null) or (scope = 'general' and site_id is null));

alter table public.material_requests drop constraint if exists material_requests_scope_site_chk;
alter table public.material_requests add constraint material_requests_scope_site_chk
  check ((scope = 'site' and site_id is not null) or (scope = 'general' and site_id is null));

alter table public.purchase_orders drop constraint if exists purchase_orders_scope_site_chk;
alter table public.purchase_orders add constraint purchase_orders_scope_site_chk
  check ((scope = 'site' and site_id is not null) or (scope = 'general' and site_id is null));
