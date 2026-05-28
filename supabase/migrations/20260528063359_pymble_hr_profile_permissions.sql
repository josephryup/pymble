alter type public.ops_user_role add value if not exists 'hr' after 'owner';

revoke insert on public.users from authenticated;
revoke update on public.users from authenticated;
grant select on public.users to authenticated;
grant update (full_name, phone) on public.users to authenticated;

drop policy if exists organization_profile_select_ops on public.organization_profile;
create policy organization_profile_select_ops
on public.organization_profile
for select
to authenticated
using (private.current_user_role()::text in ('developer', 'managing_director', 'general_manager', 'human_resource', 'operations_manager', 'projects_manager', 'procurement_manager', 'quantity_surveyor', 'procurement', 'procurement_assistant', 'finance_manager', 'accountant', 'engineer', 'hse_officer', 'hse_assistant_officer', 'admin_receptionist', 'owner', 'hr', 'manager', 'supervisor'));

drop policy if exists users_select_self_or_admin on public.users;
create policy users_select_self_or_admin
on public.users
for select
to authenticated
using (
  id = auth.uid()
  or private.current_user_role()::text = 'developer'
  or (
    private.current_user_role()::text in ('managing_director', 'general_manager', 'human_resource', 'owner', 'hr', 'manager')
    and role::text <> 'developer'
  )
);

drop policy if exists users_insert_owner on public.users;
drop policy if exists users_insert_owner_hr on public.users;

drop policy if exists users_update_self_or_owner on public.users;
drop policy if exists users_update_self_or_owner_hr on public.users;
drop policy if exists users_update_self on public.users;
create policy users_update_self
on public.users
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists audit_events_select_admin on public.audit_events;
create policy audit_events_select_admin
on public.audit_events
for select
to authenticated
using (private.current_user_role()::text in ('developer', 'managing_director', 'general_manager', 'human_resource', 'owner', 'hr', 'manager'));
