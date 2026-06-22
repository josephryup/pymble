-- The overview activity feed must name the person behind each action. The
-- snapshot RPC previously selected audit events without the actor, so the
-- workspace timeline always showed a generic label. Include actor_user_id so
-- the application can resolve the actor's name and role.
--
-- Only the 'activity' block changes; the rest of the function is unchanged.

create or replace function public.ops_overview_snapshot()
 returns jsonb
 language plpgsql
 stable
 set search_path to ''
as $function$
declare
  active_date date := (pg_catalog.timezone('Africa/Lusaka', pg_catalog.now()))::date;
  day_start timestamptz;
  day_end timestamptz;
  ops_role text := private.current_user_role()::text;
begin
  day_start := active_date::timestamp at time zone 'Africa/Lusaka';
  day_end := day_start + interval '1 day';

  if coalesce(ops_role, '') not in ('developer', 'managing_director', 'general_manager', 'human_resource', 'operations_manager', 'projects_manager', 'procurement_manager', 'quantity_surveyor', 'procurement', 'procurement_assistant', 'finance_manager', 'accountant', 'engineer', 'hse_officer', 'hse_assistant_officer', 'admin_receptionist', 'owner', 'hr', 'manager', 'supervisor') then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  return pg_catalog.jsonb_build_object(
    'activeDate',
    pg_catalog.to_char(active_date, 'YYYY-MM-DD'),
    'profile',
    (
      select pg_catalog.to_jsonb(profile_row)
      from public.organization_profile as profile_row
      where profile_row.id = 1
    ),
    'sites',
    coalesce(
      (
        select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(site_row) order by site_row.created_at desc)
        from (
          select
            site.id,
            site.code,
            site.name,
            site.location,
            site.supervisor_name,
            site.client_name,
            site.budget_zmw,
            site.latitude,
            site.longitude,
            site.status,
            site.created_at
          from public.sites as site
          where site.is_active = true
        ) as site_row
      ),
      '[]'::jsonb
    ),
    'workers',
    coalesce(
      (
        select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(worker_row) order by worker_row.full_name asc)
        from (
          select
            worker.id,
            worker.worker_code,
            worker.full_name,
            worker.trade,
            worker.site_id
          from public.workers as worker
          where worker.is_active = true
        ) as worker_row
      ),
      '[]'::jsonb
    ),
    'attendancePings',
    coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.to_jsonb(attendance_row) order by attendance_row.clock_in_at desc
        )
        from (
          select
            attendance.id,
            attendance.site_id,
            attendance.worker_id,
            attendance.clock_in_at,
            attendance.presence,
            attendance.gps_label,
            attendance.gps_latitude,
            attendance.gps_longitude,
            attendance.approved_at
          from public.attendance_records as attendance
          where attendance.is_active = true
            and attendance.clock_in_at >= day_start
            and attendance.clock_in_at < day_end
          order by attendance.clock_in_at desc
          limit 200
        ) as attendance_row
      ),
      '[]'::jsonb
    ),
    'draftPayroll',
    (
      select pg_catalog.to_jsonb(payroll_row)
      from (
        select
          payroll.id,
          payroll.period_label,
          payroll.status,
          payroll.total_net,
          payroll.created_at
        from public.payroll_runs as payroll
        where payroll.status = 'draft'::public.ops_payroll_status
        order by payroll.created_at desc
        limit 1
      ) as payroll_row
    ),
    'failedPayouts',
    (
      select pg_catalog.count(*)
      from public.payroll_run_items as payroll_item
      where payroll_item.payout_status = 'failed'::public.ops_payout_status
    ),
    'draftInvoices',
    (
      select pg_catalog.count(*)
      from public.invoices as invoice
      where invoice.status = 'draft'::public.ops_invoice_status
        and invoice.deleted_at is null
    ),
    'openApprovals',
    (
      select pg_catalog.count(*)
      from public.attendance_records as attendance
      where attendance.is_active = true
        and attendance.approved_at is null
        and attendance.clock_in_at >= day_start
        and attendance.clock_in_at < day_end
    ),
    'openCashAdvances',
    (
      select pg_catalog.count(*)
      from public.cash_advances as cash_advance
      where cash_advance.deducted_in_run_id is null
    ),
    'latestBoq',
    (
      with latest_boq as (
        select
          boq.id,
          boq.site_id,
          boq.title,
          boq.status,
          boq.updated_at,
          case
            when site.id is null then null
            else pg_catalog.jsonb_build_object(
              'id', site.id,
              'code', site.code,
              'name', site.name
            )
          end as site
        from public.boq_documents as boq
        left join public.sites as site on site.id = boq.site_id
        where boq.deleted_at is null
        order by boq.updated_at desc
        limit 1
      )
      select pg_catalog.to_jsonb(latest_boq)
        || pg_catalog.jsonb_build_object(
          'budgeted_total',
          coalesce(
            (
              select pg_catalog.sum(item.budgeted_total)
              from public.boq_line_items as item
              where item.boq_id = latest_boq.id
            ),
            0
          ),
          'actual_total',
          coalesce(
            (
              select pg_catalog.sum(item.actual_quantity * item.unit_rate)
              from public.boq_line_items as item
              where item.boq_id = latest_boq.id
            ),
            0
          )
        )
      from latest_boq
    ),
    'latestInvoice',
    (
      select pg_catalog.to_jsonb(invoice_row)
      from (
        select
          invoice.id,
          invoice.invoice_number,
          invoice.client_name,
          invoice.status,
          invoice.total_amount,
          invoice.issued_at
        from public.invoices as invoice
        where invoice.deleted_at is null
        order by invoice.issued_at desc, invoice.created_at desc
        limit 1
      ) as invoice_row
    ),
    'sitePhotos',
    coalesce(
      (
        select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(photo_row) order by photo_row.taken_at desc)
        from (
          select
            photo.id,
            photo.site_id,
            photo.taken_at
          from public.site_photos as photo
          order by photo.taken_at desc, photo.created_at desc
          limit 500
        ) as photo_row
      ),
      '[]'::jsonb
    ),
    'activity',
    coalesce(
      (
        select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(activity_row) order by activity_row.created_at desc)
        from (
          select
            activity.id,
            activity.action,
            activity.entity_type,
            activity.actor_user_id,
            activity.created_at
          from public.audit_events as activity
          order by activity.created_at desc
          limit 6
        ) as activity_row
      ),
      '[]'::jsonb
    )
  );
end;
$function$;
