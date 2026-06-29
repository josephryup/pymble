-- Performance: stop RLS policies re-evaluating auth.uid() once per row.
--
-- Wrapping `auth.uid()` in a scalar subquery `(select auth.uid())` lets Postgres
-- evaluate it a single time (an InitPlan) instead of per-row. The boolean logic
-- is identical, so access decisions are unchanged. Addresses the
-- `auth_rls_initplan` database linter warnings on the 8 affected policies.

alter policy approval_comments_insert_visible on public.approval_comments
  with check (((author_id = (select auth.uid())) and private.can_access_approval_request(approval_request_id)));

alter policy leave_requests_select_ops on public.leave_requests
  using ((private.can_access_hr_foundation() or (exists ( select 1
     from employees employee
    where ((employee.id = leave_requests.employee_id) and (employee.user_id = (select auth.uid())))))));

alter policy notifications_select_recipient_or_admin on public.notifications
  using (((recipient_id = (select auth.uid())) or private.is_ops_admin()));

alter policy notifications_update_recipient_or_admin on public.notifications
  using (((recipient_id = (select auth.uid())) or private.is_ops_admin()))
  with check (((recipient_id = (select auth.uid())) or private.is_ops_admin()));

alter policy record_comments_insert_ops on public.record_comments
  with check (((author_id = (select auth.uid())) and private.is_active_ops_user()));

alter policy record_comments_update_author_or_admin on public.record_comments
  using (((author_id = (select auth.uid())) or private.is_ops_admin()))
  with check (((author_id = (select auth.uid())) or private.is_ops_admin()));

alter policy users_select_self_or_admin on public.users
  using (((id = (select auth.uid())) or ((private.current_user_role())::text = 'developer'::text) or (((private.current_user_role())::text = any (array['managing_director'::text, 'general_manager'::text, 'human_resource'::text, 'owner'::text, 'hr'::text, 'manager'::text])) and ((role)::text <> 'developer'::text))));

alter policy users_update_self on public.users
  using ((id = (select auth.uid())))
  with check ((id = (select auth.uid())));
