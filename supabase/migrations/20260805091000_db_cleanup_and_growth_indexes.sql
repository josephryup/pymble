-- Database cleanup and forward-looking indexes.
-- Independent audit 2026-08-04, findings S5, S6 and P1.

-- ---------------------------------------------------------------------------
-- S5 — ops_next_invoice_number is SECURITY DEFINER and reachable by any
-- signed-in user via /rest/v1/rpc/. The practical impact is limited to burning
-- invoice sequence numbers, but a SECURITY DEFINER function callable by
-- `authenticated` is a pattern worth closing before it gets copied. The server
-- calls this as the service role, which is unaffected by the revoke.
-- ---------------------------------------------------------------------------
revoke execute on function public.ops_next_invoice_number(text) from anon, authenticated;

-- ---------------------------------------------------------------------------
-- S6 — otp_challenges: RLS enabled, no policy, zero rows, and no code in the
-- repository references it. Almost certainly the remains of a custom 2FA
-- attempt abandoned in favour of Supabase MFA. A table with RLS and no policy
-- is permanently inaccessible, so this is not a live risk — but it is a
-- permanent advisor warning, and permanent warnings train people to stop
-- reading warnings.
-- ---------------------------------------------------------------------------
drop table if exists public.otp_challenges;

-- ---------------------------------------------------------------------------
-- P1 — Unindexed foreign keys. There are 374 across the schema; indexing all
-- of them would be wrong, because 153 existing indexes are already unused and
-- every index costs write throughput. These are the FKs on the tables that
-- actually accumulate rows: procurement, cost, attendance and audit. At
-- today's volumes every one of these is a fast sequential scan — the point is
-- that this is a cliff rather than a slope, and `payment_requests` alone
-- carries 11 unindexed FKs.
--
-- CONCURRENTLY is deliberately NOT used: these tables are small today, the
-- locks are momentary, and CREATE INDEX CONCURRENTLY cannot run inside the
-- transaction that wraps a migration.
-- ---------------------------------------------------------------------------

-- payment_requests — the worst offender, and the table most likely to grow.
create index if not exists payment_requests_approval_request_id_idx on public.payment_requests (approval_request_id);
create index if not exists payment_requests_approved_by_idx        on public.payment_requests (approved_by);
create index if not exists payment_requests_archived_by_idx        on public.payment_requests (archived_by);
create index if not exists payment_requests_budget_id_idx          on public.payment_requests (budget_id);
create index if not exists payment_requests_budget_line_id_idx     on public.payment_requests (budget_line_id);
create index if not exists payment_requests_cancelled_by_idx       on public.payment_requests (cancelled_by);
create index if not exists payment_requests_created_by_idx         on public.payment_requests (created_by);
create index if not exists payment_requests_paid_by_idx            on public.payment_requests (paid_by);
create index if not exists payment_requests_rejected_by_idx        on public.payment_requests (rejected_by);
create index if not exists payment_requests_requested_by_idx       on public.payment_requests (requested_by);
create index if not exists payment_requests_reviewed_by_idx        on public.payment_requests (reviewed_by);
create index if not exists payment_request_items_budget_line_id_idx on public.payment_request_items (budget_line_id);

-- project_cost_entries — the cost ledger; grows with every committed cost.
create index if not exists project_cost_entries_budget_id_idx         on public.project_cost_entries (budget_id);
create index if not exists project_cost_entries_created_by_idx        on public.project_cost_entries (created_by);
create index if not exists project_cost_entries_purchase_order_id_idx on public.project_cost_entries (purchase_order_id);
create index if not exists project_cost_entries_supplier_id_idx       on public.project_cost_entries (supplier_id);

-- purchase_orders
create index if not exists purchase_orders_approved_by_idx                 on public.purchase_orders (approved_by);
create index if not exists purchase_orders_created_by_idx                  on public.purchase_orders (created_by);
create index if not exists purchase_orders_inherited_from_approval_id_idx  on public.purchase_orders (inherited_from_approval_id);
create index if not exists purchase_orders_issued_by_idx                   on public.purchase_orders (issued_by);
create index if not exists purchase_orders_material_request_id_idx         on public.purchase_orders (material_request_id);
create index if not exists purchase_orders_procured_by_idx                 on public.purchase_orders (procured_by);

-- material_requests / items — one of the three modules carrying real traffic.
create index if not exists material_requests_archived_by_idx     on public.material_requests (archived_by);
create index if not exists material_requests_cancelled_by_idx    on public.material_requests (cancelled_by);
create index if not exists material_requests_delivered_by_idx    on public.material_requests (delivered_by);
create index if not exists material_requests_priced_by_idx       on public.material_requests (priced_by);
create index if not exists material_request_items_decided_by_idx on public.material_request_items (decided_by);

-- attendance_records — written every working day, per worker.
create index if not exists attendance_records_approved_by_idx    on public.attendance_records (approved_by);
create index if not exists attendance_records_archived_by_idx    on public.attendance_records (archived_by);
create index if not exists attendance_records_cancelled_by_idx   on public.attendance_records (cancelled_by);
create index if not exists attendance_records_created_by_idx     on public.attendance_records (created_by);
create index if not exists attendance_records_payroll_run_id_idx on public.attendance_records (payroll_run_id);

-- audit_events — already the largest table in the system.
create index if not exists audit_events_actor_user_id_idx on public.audit_events (actor_user_id);
