-- Phase J2 backlog: archive (and where missing, cancel) columns on
-- workers, attendance, equipment, equipment_requests, GRN, site_instructions
-- so the same edit/cancel/archive pattern used by phases I + J extends here.

alter table public.workers
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.users(id);

alter table public.attendance_records
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references public.users(id),
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.users(id);

alter table public.equipment
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.users(id);

alter table public.equipment_requests
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.users(id);

alter table public.goods_received_notes
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.users(id);

alter table public.site_instructions
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.users(id);
