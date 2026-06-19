-- Sprint 8: align the access model with the Pymble organogram.
--
-- engineering_manager — oversees the Engineering Department, receives reports
--   from Engineers, can escalate to Managing Director / General Manager.
--   Separate seat from Projects Manager per the organogram.
-- care_taker — facility / janitorial maintenance staff. Login + glossary only.

alter type public.ops_user_role add value if not exists 'engineering_manager' after 'engineer';
alter type public.ops_user_role add value if not exists 'care_taker' after 'admin_receptionist';
