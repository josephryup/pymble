-- IT material requests (confidential scope + MD final approval).
--
-- The IT department raises purchases through the same material-request flow,
-- but the requests are confidential: only the requester, leadership
-- (MD/GM/Operations/Projects), Procurement, and Finance may see them.
-- Flow: submission -> Operations manager -> Procurement pricing -> Finance ->
-- Managing Director. The extra MD gate is a new `md_review` status between
-- `priced`/finance approval and `approved`.

-- 1) Third scope value: 'it'. Behaves like 'general' (no site).
alter table public.rfqs drop constraint if exists rfqs_scope_check;
alter table public.rfqs add constraint rfqs_scope_check
  check (scope in ('site', 'general', 'it'));

alter table public.material_requests drop constraint if exists material_requests_scope_check;
alter table public.material_requests add constraint material_requests_scope_check
  check (scope in ('site', 'general', 'it'));

alter table public.purchase_orders drop constraint if exists purchase_orders_scope_check;
alter table public.purchase_orders add constraint purchase_orders_scope_check
  check (scope in ('site', 'general', 'it'));

alter table public.rfqs drop constraint if exists rfqs_scope_site_chk;
alter table public.rfqs add constraint rfqs_scope_site_chk
  check ((scope = 'site' and site_id is not null) or (scope in ('general', 'it') and site_id is null));

alter table public.material_requests drop constraint if exists material_requests_scope_site_chk;
alter table public.material_requests add constraint material_requests_scope_site_chk
  check ((scope = 'site' and site_id is not null) or (scope in ('general', 'it') and site_id is null));

alter table public.purchase_orders drop constraint if exists purchase_orders_scope_site_chk;
alter table public.purchase_orders add constraint purchase_orders_scope_site_chk
  check ((scope = 'site' and site_id is not null) or (scope in ('general', 'it') and site_id is null));

-- 2) MD approval stage for IT-scoped requests.
alter type public.ops_material_request_status add value if not exists 'md_review' before 'approved';
