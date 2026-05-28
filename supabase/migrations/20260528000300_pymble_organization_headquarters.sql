alter table public.organization_profile
  add column if not exists headquarters_latitude numeric(10, 7),
  add column if not exists headquarters_longitude numeric(10, 7);

update public.organization_profile
set
  headquarters_latitude = coalesce(headquarters_latitude, -15.4029868),
  headquarters_longitude = coalesce(headquarters_longitude, 28.2877427)
where id = 1;
