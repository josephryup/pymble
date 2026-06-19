-- Sprint 9: monotonic, gap-free invoice numbers per year per prefix.
--
-- Zambia Revenue Authority requires tax invoice numbers to be sequential and
-- without gaps. The previous approach counted rows in the invoices table,
-- which would (a) skip a number for any cancelled / archived / deleted row
-- and (b) race under concurrent INSERTs.
--
-- Now we keep an explicit counter per (year, prefix) and increment it via a
-- function with UPSERT atomicity. Numbers are consumed even if a later step
-- fails — the audit trail then shows the void/cancelled state for that
-- number, which is what ZRA inspectors expect.

create table if not exists public.invoice_number_counters (
  prefix text not null,
  year integer not null,
  next_value integer not null,
  updated_at timestamptz not null default now(),
  primary key (prefix, year)
);

alter table public.invoice_number_counters enable row level security;

create policy "invoice_number_counters_no_anon"
  on public.invoice_number_counters
  for all
  to anon, authenticated
  using (false)
  with check (false);

create or replace function public.ops_next_invoice_number(p_prefix text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year integer := extract(year from (now() at time zone 'Africa/Lusaka'))::int;
  v_next integer;
  v_padded text;
begin
  insert into public.invoice_number_counters as c (prefix, year, next_value)
  values (p_prefix, v_year, 2)
  on conflict (prefix, year)
    do update set next_value = c.next_value + 1, updated_at = now()
  returning case when xmax = 0 then 1 else next_value - 1 end into v_next;

  v_padded := lpad(v_next::text, 4, '0');
  return p_prefix || '-' || v_year::text || '-' || v_padded;
end;
$$;

grant execute on function public.ops_next_invoice_number(text) to authenticated, service_role;

-- Seed counters from existing invoices so production keeps counting from
-- whatever number it has already used.
insert into public.invoice_number_counters (prefix, year, next_value)
select
  split_part(invoice_number, '-', 1) as prefix,
  extract(year from issued_at)::int as year,
  max(
    coalesce(
      nullif(regexp_replace(invoice_number, '^.*-(\d+)$', '\1'), '')::int,
      0
    )
  ) + 1 as next_value
from public.invoices
where invoice_number is not null
  and issued_at is not null
group by 1, 2
on conflict (prefix, year) do nothing;
