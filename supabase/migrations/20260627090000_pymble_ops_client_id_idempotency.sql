-- Sprint 10: offline-first idempotency keys.
--
-- When a field user is offline, the workspace queues actions in IndexedDB
-- and replays them on reconnect. If the network blips mid-replay the same
-- action can fire twice, so we identify each intent with a client-side UUID.
-- Server actions upsert on this column so retries are safe.

alter table public.daily_site_reports
  add column if not exists client_id uuid;

alter table public.attendance_records
  add column if not exists client_id uuid;

alter table public.material_requests
  add column if not exists client_id uuid;

alter table public.hse_incidents
  add column if not exists client_id uuid;

create unique index if not exists daily_site_reports_client_id_unique
  on public.daily_site_reports (client_id)
  where client_id is not null;

create unique index if not exists attendance_records_client_id_unique
  on public.attendance_records (client_id)
  where client_id is not null;

create unique index if not exists material_requests_client_id_unique
  on public.material_requests (client_id)
  where client_id is not null;

create unique index if not exists hse_incidents_client_id_unique
  on public.hse_incidents (client_id)
  where client_id is not null;
