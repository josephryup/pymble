-- FEATURE: direct a document at named people.
--
-- Until now the document library only had the five visibility TIERS (public,
-- management, finance, md_restricted, private). There was no way to upload a
-- document and address it to specific colleagues, and nothing notified anyone
-- that a document had landed — so "send this to X" was not expressible and
-- uploads reached people only if they happened to browse the library.
--
-- document_recipients is that missing edge: an explicit grant from a document
-- to a user. A recipient can view and download the document REGARDLESS of its
-- tier — including `private`, which is the point: private now means "only me
-- and the people I sent it to" rather than "only me". The tier still governs
-- everyone who is NOT an explicit recipient, so this only ever widens access
-- deliberately, one named person at a time, and every grant is attributable
-- via shared_by.

create table if not exists public.document_recipients (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  shared_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- One grant per person per document; re-sharing is an upsert, not a duplicate.
create unique index if not exists document_recipients_document_user_unique
  on public.document_recipients (document_id, user_id);

-- "What was sent to me?" — the read path on every library query.
create index if not exists document_recipients_user_idx
  on public.document_recipients (user_id);

alter table public.document_recipients enable row level security;

-- Matches the sibling document_* tables: readable when the document itself is
-- readable. The app reads through the service client, so this is defence in
-- depth rather than the primary gate.
drop policy if exists document_recipients_select_visible on public.document_recipients;
create policy document_recipients_select_visible
  on public.document_recipients
  for select
  using (private.can_access_document(document_id));

-- Teach the RLS helper about recipients, so a direct-shared document is
-- reachable under RLS and not only through the service client.
--
-- This also repairs the helper, which was broken outright: it compared
-- `document.visibility = 'company'`, and 'company' is not a member of the
-- ops_document_visibility enum (public | management | finance | md_restricted |
-- private). Postgres raises 22P02 on that comparison, so EVERY RLS-evaluated
-- read of documents / document_versions / document_links errored for any
-- non-service-client caller. It went unnoticed because the app reads documents
-- exclusively through the service client, which bypasses RLS. 'public' is the
-- tier that clause was reaching for — the one every signed-in staff member can
-- see — so that is what it becomes.
create or replace function private.can_access_document(document_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1
    from public.documents as document
    where document.id = document_id
      and (
        private.is_ops_admin()
        or document.visibility = 'public'
        or document.uploaded_by = auth.uid()
        or exists (
          select 1
          from public.document_recipients as recipient
          where recipient.document_id = document.id
            and recipient.user_id = auth.uid()
        )
      )
  )
$function$;
