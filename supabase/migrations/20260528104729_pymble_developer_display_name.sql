update public.users
set
  full_name = 'Developer',
  updated_at = now()
where id = '9e0fc3b0-547f-42c5-a491-3363c3060b98'::uuid
  and role::text = 'developer'
  and full_name ~* '^pymble (owner|developer)$';
