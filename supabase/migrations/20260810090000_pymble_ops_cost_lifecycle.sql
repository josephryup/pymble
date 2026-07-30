-- Pymble Operations — the six-station cost lifecycle
--
-- Phase 2 of docs/pymble-ops-project-finance-spine-audit.md.
--
-- Today the cost ledger recognises money at one and a half stations: it goes
-- `committed` at material-request final approval and `posted` at close. That
-- cannot express the things the business actually needs:
--
--   • the funds an approved-but-not-yet-ordered request is holding;
--   • a PARTIAL procurement, where only some of an approved request is bought
--     and the rest must be released (business decision §7.1 / §8.4);
--   • goods received but not yet invoiced;
--   • an approver seeing what is left before they approve (§7.2).
--
-- So `status` gains a companion, `lifecycle_state`, naming which station an
-- entry represents:
--
--   reserved   — approved, funds held, nothing ordered yet (soft)
--   committed  — a purchase order exists (firm)
--   accrued    — goods received, not yet invoiced
--   actual     — supplier invoice matched
--   paid       — cash out
--   released   — the reservation/commitment was given back (cancelled,
--                declined, or relieved by the next station)
--
-- The critical rule, and the one that keeps this from double-counting: when a
-- station advances, the PRIOR state is relieved, never left standing. Exposure
-- is therefore the sum of live states, and `released` rows are inert history.
--
-- `status` is deliberately kept. It stays the coarse committed/posted/cancelled
-- signal every existing screen, report and P&L query already reads, so nothing
-- downstream breaks while the lifecycle fills in underneath. `lifecycle_state`
-- is the fine-grained truth; `status` is the summary. The mapping is fixed:
--
--   reserved/committed/accrued → status 'committed'
--   actual/paid                → status 'posted'
--   released                   → status 'cancelled'

do $$
begin
  if not exists (select 1 from pg_type where typname = 'ops_cost_lifecycle_state') then
    create type public.ops_cost_lifecycle_state as enum (
      'reserved',
      'committed',
      'accrued',
      'actual',
      'paid',
      'released'
    );
  end if;
end $$;

alter table public.project_cost_entries
  add column if not exists lifecycle_state public.ops_cost_lifecycle_state;

-- Backfill from the existing coarse status. Everything currently 'committed'
-- became so at material-request approval, which under the new model is a firm
-- commitment only once a PO exists — but no PO links to any of these entries,
-- so they are genuinely reservations. Marking them 'committed' would overstate
-- how firm they are; marking them 'reserved' is the truthful reading and is
-- what lets the funds-available figure be correct from day one.
update public.project_cost_entries
set lifecycle_state = case
  when status = 'cancelled' then 'released'::public.ops_cost_lifecycle_state
  when status = 'posted' then 'actual'::public.ops_cost_lifecycle_state
  when purchase_order_id is not null then 'committed'::public.ops_cost_lifecycle_state
  else 'reserved'::public.ops_cost_lifecycle_state
end
where lifecycle_state is null;

alter table public.project_cost_entries
  alter column lifecycle_state set not null,
  alter column lifecycle_state set default 'reserved';

-- Keep the coarse status and the fine state from ever contradicting each
-- other. Enforced in the database because the whole point of the ledger is
-- that no code path can quietly write an inconsistent row.
alter table public.project_cost_entries
  drop constraint if exists project_cost_entries_lifecycle_status_agree;
alter table public.project_cost_entries
  add constraint project_cost_entries_lifecycle_status_agree check (
    (lifecycle_state in ('reserved', 'committed', 'accrued') and status = 'committed')
    or (lifecycle_state in ('actual', 'paid') and status = 'posted')
    or (lifecycle_state = 'released' and status = 'cancelled')
  );

create index if not exists project_cost_entries_lifecycle_state_idx
  on public.project_cost_entries (lifecycle_state, site_id);
create index if not exists project_cost_entries_live_cost_code_idx
  on public.project_cost_entries (cost_code_id, lifecycle_state)
  where lifecycle_state <> 'released';

comment on column public.project_cost_entries.lifecycle_state is
  'Which station of the cost lifecycle this entry represents: reserved → committed → accrued → actual → paid, or released when given back. Advancing a station relieves the prior one, so the sum of non-released entries is true exposure and never double-counts. `status` remains the coarse summary every existing report reads; the check constraint project_cost_entries_lifecycle_status_agree keeps the two consistent.';

-- ---------------------------------------------------------------------------
-- The existing partial unique indexes key a material request's entries on
-- (material_request_id, cost_type). With a lifecycle, one request legitimately
-- has a reservation AND a commitment AND an accrual for the same cost type at
-- different moments, so those indexes must widen to include the state —
-- otherwise advancing a station would overwrite the record of the previous
-- one instead of relieving it.
-- ---------------------------------------------------------------------------
drop index if exists public.project_cost_entries_material_request_goods_unique;
drop index if exists public.project_cost_entries_material_request_transport_unique;

create unique index if not exists project_cost_entries_material_request_goods_unique
  on public.project_cost_entries (material_request_id, lifecycle_state)
  where material_request_id is not null and cost_type <> 'transport';

create unique index if not exists project_cost_entries_material_request_transport_unique
  on public.project_cost_entries (material_request_id, lifecycle_state)
  where material_request_id is not null and cost_type = 'transport';

-- ---------------------------------------------------------------------------
-- Availability control policy thresholds (business decision §7.2: warn and
-- escalate, never block). Kept as a single-row settings table beside the
-- existing PO approval threshold rather than hard-coded, because these are
-- management numbers.
-- ---------------------------------------------------------------------------
create table if not exists public.budget_control_settings (
  id boolean primary key default true,
  -- Percent of a cost code's budget used at which each band begins.
  warn_percent numeric(6, 2) not null default 90,
  reason_percent numeric(6, 2) not null default 100,
  escalate_percent numeric(6, 2) not null default 110,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint budget_control_settings_single_row check (id),
  constraint budget_control_settings_bands_ordered check (
    warn_percent > 0
    and warn_percent <= reason_percent
    and reason_percent <= escalate_percent
  )
);

insert into public.budget_control_settings (id) values (true)
on conflict (id) do nothing;

drop trigger if exists set_updated_at on public.budget_control_settings;
create trigger set_updated_at before update on public.budget_control_settings
  for each row execute function private.set_updated_at();

alter table public.budget_control_settings enable row level security;
grant select on public.budget_control_settings to authenticated;
grant all on public.budget_control_settings to service_role;

drop policy if exists budget_control_settings_select_ops on public.budget_control_settings;
create policy budget_control_settings_select_ops
on public.budget_control_settings
for select
to authenticated
using (private.is_active_ops_user());

comment on table public.budget_control_settings is
  'Thresholds for budget availability control. Spend is never blocked (business decision §7.2): below warn_percent passes silently, then warn, then require a written reason, then escalate to the MD/GM above escalate_percent.';
