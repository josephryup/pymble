-- Phase 13b: General Ledger spine — journal_entries + journal_lines.
--
-- The double-entry ledger the Chart of Accounts posts against. Entries are
-- created via the atomic public.post_journal_entry(jsonb) RPC, which validates
-- balance and account postability inside one transaction. Once posted, entries
-- and their lines are immutable (corrections come later via reversal). Posted
-- entries must balance (debit = credit) — enforced by deferred constraint
-- triggers so even raw SQL cannot leave the ledger unbalanced.
--
-- Read access mirrors the finance bridge; all writes go through the service
-- role via the RPC.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'ops_journal_status') then
    create type public.ops_journal_status as enum ('draft', 'posted');
  end if;
end $$;

create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  entry_number text not null default (
    'JE-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  ),
  entry_date date not null default current_date,
  memo text not null default '',
  status public.ops_journal_status not null default 'draft',
  currency_code text not null default 'ZMW' check (currency_code ~ '^[A-Z]{3}$'),
  source_table text check (source_table is null or source_table ~ '^[a-z][a-z0-9_]*$'),
  source_id uuid,
  source_event text check (source_event is null or source_event ~ '^[a-z][a-z0-9_]*$'),
  is_system boolean not null default false,
  posted_at timestamptz,
  posted_by uuid references public.users(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.journal_lines (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.journal_entries(id) on delete cascade,
  line_number integer not null check (line_number > 0),
  account_id uuid not null references public.chart_of_accounts(id) on delete restrict,
  debit numeric(16, 2) not null default 0 check (debit >= 0),
  credit numeric(16, 2) not null default 0 check (credit >= 0),
  description text not null default '',
  site_id uuid references public.sites(id) on delete set null,
  cost_code text not null default '',
  created_at timestamptz not null default now(),
  unique (entry_id, line_number),
  check ((debit > 0) <> (credit > 0))
);

create unique index if not exists journal_entries_number_unique
  on public.journal_entries(entry_number);
create index if not exists journal_entries_date_idx
  on public.journal_entries(entry_date desc, created_at desc);
create index if not exists journal_entries_source_idx
  on public.journal_entries(source_table, source_id);
create unique index if not exists journal_entries_source_event_unique
  on public.journal_entries(source_table, source_id, source_event)
  where source_event is not null;

create index if not exists journal_lines_entry_idx
  on public.journal_lines(entry_id, line_number);
create index if not exists journal_lines_account_idx
  on public.journal_lines(account_id);
create index if not exists journal_lines_site_idx
  on public.journal_lines(site_id)
  where site_id is not null;

drop trigger if exists set_updated_at on public.journal_entries;
create trigger set_updated_at before update on public.journal_entries
  for each row execute function private.set_updated_at();

-- Immutability: once an entry is posted, neither it nor its lines may change.
create or replace function private.protect_posted_journal_entries()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'posted' then
      raise exception 'Posted journal entry % cannot be deleted', old.id;
    end if;
    return old;
  end if;

  if old.status = 'posted' then
    raise exception 'Posted journal entry % is immutable', old.id;
  end if;

  return new;
end;
$$;

drop trigger if exists journal_entries_immutable on public.journal_entries;
create trigger journal_entries_immutable
before update or delete on public.journal_entries
for each row execute function private.protect_posted_journal_entries();

create or replace function private.protect_posted_journal_lines()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.ops_journal_status;
begin
  if tg_op = 'DELETE' then
    select status into v_status from public.journal_entries where id = old.entry_id;
    if v_status = 'posted' then
      raise exception 'Lines of posted journal entry % are immutable', old.entry_id;
    end if;
    return old;
  end if;

  select status into v_status from public.journal_entries where id = new.entry_id;
  if v_status = 'posted' then
    raise exception 'Lines of posted journal entry % are immutable', new.entry_id;
  end if;
  return new;
end;
$$;

drop trigger if exists journal_lines_immutable on public.journal_lines;
create trigger journal_lines_immutable
before insert or update or delete on public.journal_lines
for each row execute function private.protect_posted_journal_lines();

-- Balance: a posted entry must have >= 2 lines and debit total = credit total.
-- Deferred so the RPC can insert the entry, add lines, then mark it posted
-- inside one transaction and have the check run at commit.
create or replace function private.assert_journal_balanced()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry uuid;
  v_status public.ops_journal_status;
  v_debit numeric;
  v_credit numeric;
  v_count integer;
begin
  if tg_table_name = 'journal_lines' then
    v_entry := coalesce(new.entry_id, old.entry_id);
  else
    v_entry := coalesce(new.id, old.id);
  end if;

  select status into v_status from public.journal_entries where id = v_entry;
  if v_status is distinct from 'posted' then
    return null;
  end if;

  select coalesce(sum(debit), 0), coalesce(sum(credit), 0), count(*)
    into v_debit, v_credit, v_count
    from public.journal_lines where entry_id = v_entry;

  if v_count < 2 then
    raise exception 'Posted journal entry % must have at least two lines', v_entry;
  end if;
  if v_debit <> v_credit then
    raise exception 'Posted journal entry % is unbalanced (debit %, credit %)', v_entry, v_debit, v_credit;
  end if;

  return null;
end;
$$;

drop trigger if exists journal_lines_balanced on public.journal_lines;
create constraint trigger journal_lines_balanced
after insert or update or delete on public.journal_lines
deferrable initially deferred
for each row execute function private.assert_journal_balanced();

drop trigger if exists journal_entries_balanced on public.journal_entries;
create constraint trigger journal_entries_balanced
after insert or update on public.journal_entries
deferrable initially deferred
for each row execute function private.assert_journal_balanced();

alter table public.journal_entries enable row level security;
alter table public.journal_lines enable row level security;

grant select on public.journal_entries to authenticated;
grant select on public.journal_lines to authenticated;
grant all on public.journal_entries to service_role;
grant all on public.journal_lines to service_role;

drop policy if exists journal_entries_select_ops on public.journal_entries;
create policy journal_entries_select_ops
on public.journal_entries
for select
to authenticated
using (private.can_access_finance_bridge());

drop policy if exists journal_lines_select_ops on public.journal_lines;
create policy journal_lines_select_ops
on public.journal_lines
for select
to authenticated
using (
  exists (
    select 1
    from public.journal_entries as entry
    where entry.id = journal_lines.entry_id
      and private.can_access_finance_bridge()
  )
);

-- Atomic posting RPC. Validates exactly-one-of debit/credit per line, account
-- postability, >= 2 lines, and balance — all inside one transaction so a bad
-- payload rolls back cleanly. Re-posting the same (source_table, source_id,
-- source_event) raises a unique violation, which the caller treats as a no-op.
create or replace function public.post_journal_entry(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_entry_id uuid;
  v_line jsonb;
  v_idx integer := 0;
  v_account_id uuid;
  v_is_postable boolean;
  v_is_active boolean;
  v_debit numeric;
  v_credit numeric;
  v_sum_debit numeric := 0;
  v_sum_credit numeric := 0;
begin
  if payload->'lines' is null or jsonb_typeof(payload->'lines') <> 'array' then
    raise exception 'post_journal_entry: lines array is required';
  end if;

  insert into public.journal_entries
    (entry_date, memo, status, currency_code, source_table, source_id, source_event, is_system, created_by)
  values (
    coalesce((nullif(payload->>'entry_date', ''))::date, current_date),
    coalesce(payload->>'memo', ''),
    'draft',
    coalesce(nullif(payload->>'currency_code', ''), 'ZMW'),
    nullif(payload->>'source_table', ''),
    (nullif(payload->>'source_id', ''))::uuid,
    nullif(payload->>'source_event', ''),
    coalesce((nullif(payload->>'is_system', ''))::boolean, true),
    (nullif(payload->>'created_by', ''))::uuid
  )
  returning id into v_entry_id;

  for v_line in select * from jsonb_array_elements(payload->'lines')
  loop
    v_idx := v_idx + 1;
    v_debit := round(coalesce((nullif(v_line->>'debit', ''))::numeric, 0), 2);
    v_credit := round(coalesce((nullif(v_line->>'credit', ''))::numeric, 0), 2);

    if (v_debit > 0) = (v_credit > 0) then
      raise exception 'post_journal_entry: line % must have exactly one of debit/credit', v_idx;
    end if;

    select id, is_postable, is_active
      into v_account_id, v_is_postable, v_is_active
      from public.chart_of_accounts
      where code = (v_line->>'account_code');

    if v_account_id is null then
      raise exception 'post_journal_entry: unknown account code %', v_line->>'account_code';
    end if;
    if not v_is_postable then
      raise exception 'post_journal_entry: account % is not postable', v_line->>'account_code';
    end if;
    if not v_is_active then
      raise exception 'post_journal_entry: account % is inactive', v_line->>'account_code';
    end if;

    insert into public.journal_lines
      (entry_id, line_number, account_id, debit, credit, description, site_id, cost_code)
    values (
      v_entry_id, v_idx, v_account_id, v_debit, v_credit,
      coalesce(v_line->>'description', ''),
      (nullif(v_line->>'site_id', ''))::uuid,
      coalesce(v_line->>'cost_code', '')
    );

    v_sum_debit := v_sum_debit + v_debit;
    v_sum_credit := v_sum_credit + v_credit;
  end loop;

  if v_idx < 2 then
    raise exception 'post_journal_entry: at least two lines required';
  end if;
  if v_sum_debit <> v_sum_credit then
    raise exception 'post_journal_entry: unbalanced (debit %, credit %)', v_sum_debit, v_sum_credit;
  end if;

  update public.journal_entries
    set status = 'posted',
        posted_at = now(),
        posted_by = (nullif(payload->>'created_by', ''))::uuid
    where id = v_entry_id;

  return v_entry_id;
end;
$$;

revoke execute on function public.post_journal_entry(jsonb) from public, anon, authenticated;
grant execute on function public.post_journal_entry(jsonb) to service_role;

-- Trial balance: one row per postable account with its posted debit/credit
-- totals. Queried server-side via the service role; not exposed to browsers.
create or replace view public.ops_trial_balance as
select
  a.id as account_id,
  a.code,
  a.name,
  a.account_type,
  a.normal_balance,
  coalesce(s.debit, 0) as debit,
  coalesce(s.credit, 0) as credit
from public.chart_of_accounts a
left join (
  select l.account_id, sum(l.debit) as debit, sum(l.credit) as credit
  from public.journal_lines l
  join public.journal_entries e on e.id = l.entry_id
  where e.status = 'posted'
  group by l.account_id
) s on s.account_id = a.id
where a.is_postable;

grant select on public.ops_trial_balance to service_role;
