alter table public.transport_requests
  add column if not exists assigned_equipment_id uuid references public.equipment(id) on delete set null,
  add column if not exists assigned_operator_employee_id uuid references public.employees(id) on delete set null,
  add column if not exists assigned_operator_worker_id uuid references public.workers(id) on delete set null,
  add column if not exists dispatch_reference text not null default '',
  add column if not exists dispatch_notes text not null default '';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'transport_requests_single_operator_check'
      and conrelid = 'public.transport_requests'::regclass
  ) then
    alter table public.transport_requests
      add constraint transport_requests_single_operator_check
      check (
        assigned_operator_employee_id is null
        or assigned_operator_worker_id is null
      );
  end if;
end $$;

create index if not exists transport_requests_assigned_equipment_idx
  on public.transport_requests(assigned_equipment_id, status, scheduled_at desc)
  where assigned_equipment_id is not null;

create index if not exists transport_requests_operator_employee_idx
  on public.transport_requests(assigned_operator_employee_id, status, scheduled_at desc)
  where assigned_operator_employee_id is not null;

create index if not exists transport_requests_operator_worker_idx
  on public.transport_requests(assigned_operator_worker_id, status, scheduled_at desc)
  where assigned_operator_worker_id is not null;
