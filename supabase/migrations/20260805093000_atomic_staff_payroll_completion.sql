-- R1 — make staff payroll completion atomic.
--
-- Independent audit 2026-08-04, finding R1: there are no database transactions
-- anywhere, and `completeStaffPayrollRunAction` was the worst case. It did:
--
--   1. update the run to `completed`
--   2. update every payroll item to payout_status = 'sent'
--   3. write an audit event
--   4. send payslip emails
--   5. write a second audit event
--
-- If step 2 failed, the run was marked paid while its items were not. If the
-- function timed out between 1 and 2 — plausible, since step 4 renders PDFs —
-- payroll was half-committed with no record of which half.
--
-- A SECOND, WORSE BUG surfaced while implementing this. Step 1 was:
--
--   .update({...}).eq("id", run_id).eq("status", "approved")
--
-- PostgREST does not error when an UPDATE matches zero rows, and the call did
-- not request a representation, so `error` was null whether or not the run was
-- actually approved. The code then marked every line item 'sent' regardless.
-- Completing a draft, an already-completed, or a non-existent run therefore
-- silently marked its people paid. The status guard read like a guard but
-- enforced nothing.
--
-- Both are fixed here. The function body is a single transaction, the run row
-- is locked before it is read, and the status is checked in SQL where a
-- mismatch is a real branch rather than an ignored row count.
--
-- Email dispatch is deliberately NOT in here. A transaction cannot roll back a
-- sent email, so pulling delivery inside would buy the appearance of atomicity
-- and none of the substance. Emails stay in TypeScript, after this returns and
-- commits, where they are already idempotent and already record who was missed.

create or replace function public.ops_complete_staff_payroll_run(
  p_run_id uuid,
  p_actor_id uuid
)
returns table (
  status text,
  items_marked integer
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_current_status text;
  v_items_marked integer := 0;
begin
  -- Lock the run first. Two people pressing "mark paid" at the same moment
  -- would otherwise both read 'approved' and both proceed.
  select r.status into v_current_status
  from public.staff_payroll_runs r
  where r.id = p_run_id
  for update;

  if v_current_status is null then
    return query select 'not_found'::text, 0;
    return;
  end if;

  -- Already completed is not an error: the caller may be retrying after a
  -- timeout, and the honest answer is "this is already done", not a failure
  -- that invites them to try again.
  if v_current_status = 'completed' then
    return query select 'already_completed'::text, 0;
    return;
  end if;

  if v_current_status <> 'approved' then
    return query select 'not_approved'::text, 0;
    return;
  end if;

  update public.staff_payroll_runs
     set status = 'completed',
         disbursed_at = now(),
         disbursed_by = p_actor_id
   where id = p_run_id;

  update public.staff_payroll_items
     set payout_status = 'sent'
   where staff_payroll_run_id = p_run_id;

  get diagnostics v_items_marked = row_count;

  -- Same transaction as the state change, so the trail cannot disagree with
  -- the thing it is describing.
  insert into public.audit_events (
    action, actor_user_id, entity_id, entity_type,
    metadata, module_key, source_id, source_table, summary
  ) values (
    'staff_payroll_run.completed',
    p_actor_id,
    p_run_id,
    'staff_payroll_run',
    jsonb_build_object('items_marked', v_items_marked),
    'staff_payroll',
    p_run_id,
    'staff_payroll_runs',
    'Marked staff payroll run paid'
  );

  return query select 'completed'::text, v_items_marked;
end;
$$;

-- The server calls this as the service role. Nothing reaches it from the
-- browser, and a SECURITY DEFINER function that moves payroll must not be
-- callable over /rest/v1/rpc/ (cf. finding S5, ops_next_invoice_number).
revoke all on function public.ops_complete_staff_payroll_run(uuid, uuid) from public, anon, authenticated;
