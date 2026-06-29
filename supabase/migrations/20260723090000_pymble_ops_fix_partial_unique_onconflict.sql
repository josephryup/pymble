-- BUGFIX: notifications (and other upserts) were silently dropped.
--
-- These unique indexes were defined as PARTIAL with `WHERE <col> IS NOT NULL`.
-- A partial index cannot serve as an `ON CONFLICT (<col>)` arbiter unless the
-- statement repeats the predicate — which supabase-js's `.upsert({ onConflict })`
-- does not do. So every such upsert raised:
--   42P10: there is no unique or exclusion constraint matching the ON CONFLICT specification
-- and because the callers wrap the call in `.catch(() => null)`, the error was
-- swallowed. The most visible symptom: users were never notified when something
-- needed their approval (every approval notification carries an idempotency_key).
--
-- A PLAIN unique index on a nullable column is semantically identical here:
-- NULLS DISTINCT is the default, so multiple NULLs are still allowed and only
-- non-NULL values are deduplicated — but it CAN be used as an ON CONFLICT
-- arbiter. We only convert the indexes whose predicate is purely NULL-exclusion;
-- indexes with real predicates (e.g. WHERE is_active = true) are left untouched.

drop index if exists public.notifications_idempotency_unique;
create unique index notifications_idempotency_unique
  on public.notifications (idempotency_key);

drop index if exists public.approval_requests_idempotency_unique;
create unique index approval_requests_idempotency_unique
  on public.approval_requests (idempotency_key);

drop index if exists public.ops_email_delivery_events_idempotency_unique;
create unique index ops_email_delivery_events_idempotency_unique
  on public.ops_email_delivery_events (idempotency_key);

drop index if exists public.attendance_records_client_id_unique;
create unique index attendance_records_client_id_unique
  on public.attendance_records (client_id);

drop index if exists public.daily_site_reports_client_id_unique;
create unique index daily_site_reports_client_id_unique
  on public.daily_site_reports (client_id);

drop index if exists public.hse_incidents_client_id_unique;
create unique index hse_incidents_client_id_unique
  on public.hse_incidents (client_id);

drop index if exists public.material_requests_client_id_unique;
create unique index material_requests_client_id_unique
  on public.material_requests (client_id);

drop index if exists public.project_cost_entries_payment_request_unique;
create unique index project_cost_entries_payment_request_unique
  on public.project_cost_entries (payment_request_id);
