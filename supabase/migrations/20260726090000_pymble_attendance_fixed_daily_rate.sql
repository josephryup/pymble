-- Attendance: fixed daily rate + explicit overtime, GPS capture retired.
--
-- Pay model change: attending a work day earns the worker their full daily
-- rate (K60 by default) no matter how many hours are logged. Overtime is now
-- captured as its own hours figure on the record and paid on top at the
-- organization overtime multiplier. hours_worked is retained as an
-- operational record, not a pay input.
--
-- The GPS coordinate columns are no longer written or read by the app. They
-- are left in place (rather than dropped) so existing rows keep their history;
-- drop them in a later migration once that history is no longer wanted.

alter table public.workers
  alter column daily_rate set default 60;

comment on column public.workers.daily_rate
  is 'Fixed rate paid for a day''s attendance, regardless of hours worked. Also the basis for the hourly overtime rate (daily_rate / organization_profile.standard_daily_hours).';

comment on column public.attendance_records.hours_worked
  is 'Hours logged for the day. Operational record only - it does not scale the fixed daily rate.';

comment on column public.attendance_records.overtime_hours
  is 'Overtime hours as captured on the record. Defaults to hours above organization_profile.standard_daily_hours when not entered explicitly.';

comment on column public.attendance_records.amount_earned
  is 'Fixed daily rate (0 when absent) plus overtime_amount.';

comment on column public.attendance_records.gps_label
  is 'Free-text site note. Legacy column name - no longer holds GPS data.';

comment on column public.attendance_records.gps_latitude
  is 'Deprecated: GPS capture was removed from attendance. Retained for historical rows only.';

comment on column public.attendance_records.gps_longitude
  is 'Deprecated: GPS capture was removed from attendance. Retained for historical rows only.';
