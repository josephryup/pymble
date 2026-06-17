alter table public.record_comments
  add column if not exists mentioned_user_ids uuid[] not null default array[]::uuid[];

create index if not exists record_comments_mentioned_user_ids_idx
  on public.record_comments using gin (mentioned_user_ids);
