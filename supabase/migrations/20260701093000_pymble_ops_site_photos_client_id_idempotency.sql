-- Extends Sprint 10's offline idempotency pattern to site_photos so photo
-- uploads queued while a field worker has no signal can be safely retried
-- without creating duplicate rows (and, since each upload also writes a real
-- object to R2, without leaving orphaned duplicate objects behind either).

alter table public.site_photos
  add column if not exists client_id uuid;

create unique index if not exists site_photos_client_id_unique
  on public.site_photos (client_id)
  where client_id is not null;
