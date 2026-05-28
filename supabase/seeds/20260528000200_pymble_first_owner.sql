insert into public.users (
  id,
  full_name,
  role,
  email,
  phone,
  is_active
)
select
  auth_user.id,
  coalesce(auth_user.raw_user_meta_data->>'full_name', 'Developer'),
  'developer'::public.ops_user_role,
  auth_user.email,
  '+260 979 521 035',
  true
from auth.users auth_user
where auth_user.id = '9e0fc3b0-547f-42c5-a491-3363c3060b98'::uuid
on conflict (id) do update
set
  role = 'developer'::public.ops_user_role,
  email = excluded.email,
  phone = excluded.phone,
  is_active = true,
  updated_at = now();
