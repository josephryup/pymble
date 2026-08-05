-- App-level login rate limiting (audit 2026-06 open finding).
-- Serverless instances share no memory, so the counter lives in Postgres:
-- a fixed-window bucket per key (email / client IP). The table sits in the
-- private schema so PostgREST never exposes it; the RPCs are executable by
-- service_role only — the login route calls them with the service client.

create table if not exists private.ops_rate_limit_buckets (
  key text primary key,
  window_started_at timestamptz not null default now(),
  hits integer not null default 0
);

create or replace function public.ops_rate_limit_hit(
  p_key text,
  p_max_hits integer,
  p_window_seconds integer
)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_bucket private.ops_rate_limit_buckets;
begin
  -- Opportunistic cleanup keeps the table tiny without a scheduled job.
  delete from private.ops_rate_limit_buckets
  where key in (
    select b.key from private.ops_rate_limit_buckets b
    where b.window_started_at < v_now - interval '1 day'
    limit 50
  );

  -- Atomic increment-or-reset: the upsert takes a row lock, so concurrent
  -- logins for the same key serialise instead of double-counting.
  insert into private.ops_rate_limit_buckets as buckets (key, window_started_at, hits)
  values (p_key, v_now, 1)
  on conflict (key) do update
    set window_started_at = case
          when buckets.window_started_at <= v_now - make_interval(secs => p_window_seconds)
            then v_now
          else buckets.window_started_at
        end,
        hits = case
          when buckets.window_started_at <= v_now - make_interval(secs => p_window_seconds)
            then 1
          else buckets.hits + 1
        end
  returning * into v_bucket;

  return query select
    v_bucket.hits <= p_max_hits,
    greatest(
      0,
      ceil(extract(epoch from (
        v_bucket.window_started_at + make_interval(secs => p_window_seconds) - v_now
      )))::integer
    );
end;
$$;

-- Clears a bucket after a successful login so a user who mistyped a couple
-- of times is not still carrying those hits into the next window.
create or replace function public.ops_rate_limit_reset(p_key text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from private.ops_rate_limit_buckets where key = p_key;
$$;

revoke execute on function public.ops_rate_limit_hit(text, integer, integer) from public;
revoke execute on function public.ops_rate_limit_hit(text, integer, integer) from anon;
revoke execute on function public.ops_rate_limit_hit(text, integer, integer) from authenticated;
revoke execute on function public.ops_rate_limit_reset(text) from public;
revoke execute on function public.ops_rate_limit_reset(text) from anon;
revoke execute on function public.ops_rate_limit_reset(text) from authenticated;
