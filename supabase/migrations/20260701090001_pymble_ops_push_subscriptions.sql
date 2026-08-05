-- Web Push subscriptions for the installed ops PWA.
--
-- Notifications today only reach a user while their tab is open (Supabase
-- Realtime -> OpsNotificationToaster). This table lets a signed-in user
-- register one or more browser/device push endpoints so
-- queueOpsNotification() can also fire an OS-level notification when the app
-- is closed or backgrounded. One row per device (a user may have several —
-- phone + desktop); the endpoint URL is unique per browser installation.

create table if not exists public.ops_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null check (length(p256dh) > 0),
  auth_key text not null check (length(auth_key) > 0),
  user_agent text not null default '',
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create unique index if not exists ops_push_subscriptions_endpoint_unique
  on public.ops_push_subscriptions(endpoint);
create index if not exists ops_push_subscriptions_user_idx
  on public.ops_push_subscriptions(user_id);

alter table public.ops_push_subscriptions enable row level security;

grant select, insert, delete on public.ops_push_subscriptions to authenticated;
grant all on public.ops_push_subscriptions to service_role;

-- A user manages only their own device subscriptions. Deletes happen both
-- from the client (explicit "turn off notifications") and from the server
-- sender when a push service reports the endpoint is gone (404/410).
drop policy if exists ops_push_subscriptions_select_own on public.ops_push_subscriptions;
create policy ops_push_subscriptions_select_own
on public.ops_push_subscriptions
for select
to authenticated
using (user_id = (select auth.uid()) or private.is_ops_admin());

drop policy if exists ops_push_subscriptions_insert_own on public.ops_push_subscriptions;
create policy ops_push_subscriptions_insert_own
on public.ops_push_subscriptions
for insert
to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists ops_push_subscriptions_delete_own on public.ops_push_subscriptions;
create policy ops_push_subscriptions_delete_own
on public.ops_push_subscriptions
for delete
to authenticated
using (user_id = (select auth.uid()) or private.is_ops_admin());

comment on table public.ops_push_subscriptions is
  'Browser Web Push subscriptions (one row per device) used to deliver OS-level notifications for the installed ops PWA. Populated by the client after Notification permission is granted; consumed server-side by the push sender in queueOpsNotification.';
