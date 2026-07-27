-- =============================================================================
-- Pymble Operations — Reset test data
-- =============================================================================
-- Wipes ALL test/transactional data and resets company configuration to clean
-- defaults, while KEEPING the staff accounts you list below.
--
-- HOW TO RUN
--   1. TAKE A BACKUP FIRST. Supabase dashboard -> Database -> Backups (or pg_dump).
--      This cannot be undone.
--   2. Edit the keep-list in step 0 (your own login MUST be in it or you lock
--      yourself out).
--   3. Run the whole script in the Supabase SQL Editor (or psql) as the
--      postgres/service role. It runs in one transaction — all or nothing.
--
-- WHAT IT KEEPS
--   - The accounts whose emails are in the keep-list (public.users rows).
--   - organization_profile and approval_workflow_settings, reset to defaults.
-- WHAT IT REMOVES
--   - Every other row in every other public table (sites, workers, attendance,
--     requests, POs, invoices, incidents, audit history, notifications, etc.).
--   - All other staff accounts (and, optionally, their auth logins in step 4).
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- STEP 0 — EDIT THIS: emails of the accounts to KEEP (lower-case).
-- Include YOUR OWN login. Add any demo accounts you want to survive the wipe.
-- -----------------------------------------------------------------------------
create temporary table _ops_keep_emails (email text primary key) on commit drop;
insert into _ops_keep_emails (email) values
  ('your-developer-login@pymbleconstruction.com')   -- <-- CHANGE / ADD HERE
  -- , ('md@pymbleconstruction.com')
  -- , ('gm@pymbleconstruction.com')
;

-- Safety guard: refuse to run if the keep-list still has the placeholder only,
-- or if it would match no real account.
do $$
declare
  matched int;
begin
  select count(*) into matched
  from public.users u
  where lower(u.email) in (select email from _ops_keep_emails);

  if matched = 0 then
    raise exception
      'Aborting: none of the keep-list emails match an existing public.users row. Edit STEP 0 first.';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- STEP 1 — Truncate every public table EXCEPT users.
-- CASCADE handles foreign-key order; RESTART IDENTITY resets owned sequences.
-- -----------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select tablename
    from pg_tables
    where schemaname = 'public'
      and tablename <> 'users'           -- keep the accounts table
  loop
    execute format('truncate table public.%I restart identity cascade', r.tablename);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- STEP 2 — Restore organization_profile to clean defaults (id = 1).
-- The app reads this as a required singleton, so it must exist.
-- -----------------------------------------------------------------------------
insert into public.organization_profile (
  id, legal_name, trading_name, email, phone_primary, phone_secondary,
  address_line, city, country, headquarters_latitude, headquarters_longitude,
  invoice_prefix, currency_code, vat_rate
) values (
  1,
  'Pymble Construction Limited',
  'Pymble Construction',
  'info@pymbleconstruction.com',
  '+260 979 521 035',
  '+260 974 998 463',
  '31 Harry Mwangakumbula Rd, Woodlands',
  'Lusaka',
  'Zambia',
  -15.4029868,
  28.2877427,
  'PCL',
  'ZMW',
  0.1600
);

-- -----------------------------------------------------------------------------
-- STEP 3 — Restore the default purchase-order approval workflow.
-- (PO approvals depend on this row existing.)
-- -----------------------------------------------------------------------------
insert into public.approval_workflow_settings (
  workflow_key, module_key, title, description, currency_code,
  threshold_amount, threshold_enabled,
  first_step_role, second_step_role, threshold_step_role, is_active
) values (
  'purchase_order',
  'rfq_po',
  'Purchase order approval',
  'Controls the approval chain before purchase orders can be issued.',
  'ZMW',
  50000,
  true,
  'procurement_manager',
  'finance_manager',
  'managing_director',
  true
);

-- -----------------------------------------------------------------------------
-- STEP 4 — Remove staff accounts that are NOT in the keep-list.
-- -----------------------------------------------------------------------------
delete from public.users u
where lower(u.email) not in (select email from _ops_keep_emails);

-- Sanity check: show what survived before you commit.
select email, role, is_active from public.users order by email;

commit;

-- =============================================================================
-- OPTIONAL — also delete the Supabase Auth logins for removed staff.
-- Run this SEPARATELY, AFTER reviewing the result above. Deleting an auth user
-- cascades to public.users. Leave it commented out if you prefer to manage auth
-- users from the dashboard (Authentication -> Users).
-- =============================================================================
-- delete from auth.users a
-- where lower(a.email) not in (
--   'your-developer-login@pymbleconstruction.com'
--   -- , 'md@pymbleconstruction.com'
-- );
