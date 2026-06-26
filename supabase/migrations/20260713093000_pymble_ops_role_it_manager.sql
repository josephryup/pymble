-- Phase IT-1: add the it_manager role to the ops_user_role enum.
--
-- it_manager — runs the role-isolated Information Technology area (assets,
-- help desk, software, access, policies). Reports to the Managing Director.
-- Must exist on the DB enum so HR / leadership can create IT Manager accounts.

alter type public.ops_user_role add value if not exists 'it_manager' after 'admin_receptionist';
