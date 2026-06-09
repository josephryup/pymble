do $$
begin
  if not exists (select 1 from pg_type where typname = 'ops_hse_inspection_finding_status') then
    create type public.ops_hse_inspection_finding_status as enum (
      'open',
      'in_progress',
      'corrected',
      'verified',
      'cancelled'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'ops_safety_training_status') then
    create type public.ops_safety_training_status as enum (
      'planned',
      'completed',
      'expired',
      'cancelled'
    );
  end if;
end $$;

create table if not exists public.ppe_items (
  id uuid primary key default gen_random_uuid(),
  item_code text not null default (
    'PPE-ITEM-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  ),
  ppe_type public.ops_ppe_item_type not null default 'other',
  item_name text not null check (length(btrim(item_name)) > 0),
  description text not null default '',
  storage_location text not null default '',
  unit text not null default 'each',
  stock_on_hand integer not null default 0 check (stock_on_hand >= 0),
  reorder_level integer not null default 0 check (reorder_level >= 0),
  is_active boolean not null default true,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ppe_issues
  add column if not exists ppe_item_id uuid references public.ppe_items(id) on delete set null;

create table if not exists public.toolbox_talk_attendees (
  id uuid primary key default gen_random_uuid(),
  talk_id uuid not null references public.toolbox_talks(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete set null,
  attendee_name text not null check (length(btrim(attendee_name)) > 0),
  role_title text not null default '',
  company text not null default 'Pymble Construction Limited',
  attended boolean not null default true,
  notes text not null default '',
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hse_inspection_findings (
  id uuid primary key default gen_random_uuid(),
  finding_number text not null default (
    'FIND-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  ),
  inspection_id uuid not null references public.hse_inspections(id) on delete cascade,
  site_id uuid references public.sites(id) on delete set null,
  finding_type text not null default 'observation' check (finding_type ~ '^[a-z][a-z0-9_]*$'),
  severity public.ops_hse_incident_severity not null default 'low',
  status public.ops_hse_inspection_finding_status not null default 'open',
  title text not null check (length(btrim(title)) > 0),
  description text not null default '',
  responsible_user_id uuid references public.users(id) on delete set null,
  due_date date,
  corrective_action_id uuid references public.corrective_actions(id) on delete set null,
  completion_notes text not null default '',
  completed_at timestamptz,
  verified_at timestamptz,
  verified_by uuid references public.users(id) on delete set null,
  cancelled_at timestamptz,
  cancelled_by uuid references public.users(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.safety_training_records (
  id uuid primary key default gen_random_uuid(),
  training_number text not null default (
    'TRN-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  ),
  site_id uuid references public.sites(id) on delete set null,
  employee_id uuid references public.employees(id) on delete set null,
  trainee_name text not null check (length(btrim(trainee_name)) > 0),
  training_title text not null check (length(btrim(training_title)) > 0),
  training_type text not null default 'general' check (training_type ~ '^[a-z][a-z0-9_]*$'),
  provider text not null default '',
  status public.ops_safety_training_status not null default 'planned',
  planned_date date not null default current_date,
  completed_date date,
  expiry_date date,
  certificate_document_id uuid references public.documents(id) on delete set null,
  score numeric(5, 2) not null default 0 check (score >= 0 and score <= 100),
  notes text not null default '',
  completed_by uuid references public.users(id) on delete set null,
  cancelled_at timestamptz,
  cancelled_by uuid references public.users(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (completed_date is null or completed_date >= planned_date),
  check (expiry_date is null or completed_date is null or expiry_date >= completed_date)
);

create unique index if not exists ppe_items_code_unique
  on public.ppe_items(item_code);
create index if not exists ppe_items_type_active_idx
  on public.ppe_items(ppe_type, is_active, item_name);
create index if not exists ppe_items_low_stock_idx
  on public.ppe_items(is_active, stock_on_hand, reorder_level)
  where is_active = true;
create index if not exists ppe_issues_item_idx
  on public.ppe_issues(ppe_item_id, status, issue_date desc)
  where ppe_item_id is not null;

create index if not exists toolbox_talk_attendees_talk_idx
  on public.toolbox_talk_attendees(talk_id, attendee_name);
create index if not exists toolbox_talk_attendees_employee_idx
  on public.toolbox_talk_attendees(employee_id, created_at desc)
  where employee_id is not null;

create unique index if not exists hse_inspection_findings_number_unique
  on public.hse_inspection_findings(finding_number);
create index if not exists hse_inspection_findings_inspection_status_idx
  on public.hse_inspection_findings(inspection_id, status, due_date, created_at desc);
create index if not exists hse_inspection_findings_site_status_idx
  on public.hse_inspection_findings(site_id, status, due_date)
  where site_id is not null;

create unique index if not exists safety_training_records_number_unique
  on public.safety_training_records(training_number);
create index if not exists safety_training_records_employee_status_idx
  on public.safety_training_records(employee_id, status, expiry_date)
  where employee_id is not null;
create index if not exists safety_training_records_status_expiry_idx
  on public.safety_training_records(status, expiry_date, planned_date desc);
create index if not exists safety_training_records_site_status_idx
  on public.safety_training_records(site_id, status, planned_date desc)
  where site_id is not null;

create or replace function public.ops_adjust_ppe_item_stock(
  p_ppe_item_id uuid,
  p_quantity_delta integer
)
returns table (
  ppe_item_id uuid,
  stock_on_hand integer
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_next_quantity integer;
begin
  if p_quantity_delta = 0 then
    raise exception 'PPE stock adjustment cannot be zero.';
  end if;

  update public.ppe_items
  set stock_on_hand = public.ppe_items.stock_on_hand + p_quantity_delta
  where id = p_ppe_item_id
    and (is_active = true or p_quantity_delta > 0)
    and public.ppe_items.stock_on_hand + p_quantity_delta >= 0
  returning public.ppe_items.stock_on_hand
  into v_next_quantity;

  if v_next_quantity is null then
    raise exception 'Active PPE item was not found or has insufficient stock.';
  end if;

  ppe_item_id := p_ppe_item_id;
  stock_on_hand := v_next_quantity;
  return next;
end;
$$;

revoke execute on function public.ops_adjust_ppe_item_stock(uuid, integer) from public;
revoke execute on function public.ops_adjust_ppe_item_stock(uuid, integer) from anon;
revoke execute on function public.ops_adjust_ppe_item_stock(uuid, integer) from authenticated;
grant execute on function public.ops_adjust_ppe_item_stock(uuid, integer) to service_role;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'ppe_items',
    'toolbox_talk_attendees',
    'hse_inspection_findings',
    'safety_training_records'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', table_name);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function private.set_updated_at()',
      table_name
    );
  end loop;
end $$;

alter table public.ppe_items enable row level security;
alter table public.toolbox_talk_attendees enable row level security;
alter table public.hse_inspection_findings enable row level security;
alter table public.safety_training_records enable row level security;

grant select on public.ppe_items to authenticated;
grant select on public.toolbox_talk_attendees to authenticated;
grant select on public.hse_inspection_findings to authenticated;
grant select on public.safety_training_records to authenticated;

grant all on public.ppe_items to service_role;
grant all on public.toolbox_talk_attendees to service_role;
grant all on public.hse_inspection_findings to service_role;
grant all on public.safety_training_records to service_role;

drop policy if exists ppe_items_select_ops on public.ppe_items;
create policy ppe_items_select_ops
on public.ppe_items
for select
to authenticated
using (private.can_access_hse_compliance());

drop policy if exists toolbox_talk_attendees_select_ops on public.toolbox_talk_attendees;
create policy toolbox_talk_attendees_select_ops
on public.toolbox_talk_attendees
for select
to authenticated
using (private.can_access_hse_compliance());

drop policy if exists hse_inspection_findings_select_ops on public.hse_inspection_findings;
create policy hse_inspection_findings_select_ops
on public.hse_inspection_findings
for select
to authenticated
using (private.can_access_hse_compliance());

drop policy if exists safety_training_records_select_ops on public.safety_training_records;
create policy safety_training_records_select_ops
on public.safety_training_records
for select
to authenticated
using (private.can_access_hse_compliance());
