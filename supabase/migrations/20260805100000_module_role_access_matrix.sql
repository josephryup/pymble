-- Role → module access matrix, editable from the workspace.
--
-- Until now, which roles can reach which module lived only in `OPS_MODULES`
-- (src/lib/ops/constants.ts) as a hardcoded `roles: [...]` array per module.
-- Changing who sees what meant a code change and a deploy, which is why the
-- request was to move it into the UI.
--
-- DESIGN: this table stores OVERRIDES ONLY, never the whole matrix. A row means
-- "this pair differs from what the code says". No row means "use the code
-- default". Two reasons:
--
--   1. A module added in code works immediately, with its intended roles, and
--      does not need a seeding step that someone will forget.
--   2. The code registry stays the readable source of intent. The table is a
--      short, reviewable diff against it rather than a 73 × 26 grid that
--      silently becomes the real policy.
--
-- Deleting a row therefore RESTORES the code default — which is also the
-- "reset" affordance in the UI.

create table if not exists public.ops_module_role_access (
  module_key text not null,
  role public.ops_user_role not null,
  -- true  = grant a role access the code does not give it
  -- false = remove access the code does give it
  can_access boolean not null,
  reason text not null default '',
  updated_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (module_key, role)
);

comment on table public.ops_module_role_access is
  'Overrides to the OPS_MODULES role lists. A row means this module/role pair differs from the code default; no row means use the code default.';

-- The whole table is read on every request that resolves module access, so it
-- is deliberately tiny and fully indexed by its primary key. No extra indexes.

alter table public.ops_module_role_access enable row level security;

-- Read: any signed-in user. The matrix decides what THEY can see, so the
-- workspace shell has to resolve it on every request. It contains no business
-- data — only module keys and role names, both of which are already visible in
-- the navigation.
create policy ops_module_role_access_select
  on public.ops_module_role_access
  for select to authenticated
  using (private.is_active_ops_user());

-- Write: service role only. Every mutation goes through a server action that
-- enforces the segregation-of-duties rule in canEditOpsModuleAccess — IT may
-- administer the system but may not widen its own reach into finance, payroll
-- or HR. Leaving writes to the service role keeps that rule in one place
-- rather than duplicating it as SQL that could drift from the TypeScript.
create policy ops_module_role_access_no_direct_write
  on public.ops_module_role_access
  for all to authenticated, anon
  using (false)
  with check (false);

create trigger set_ops_module_role_access_updated_at
  before update on public.ops_module_role_access
  for each row execute function private.set_updated_at();
