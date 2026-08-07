-- BUGFIX: every site photo upload failed with 42P10.
--
-- `20260723090000_pymble_ops_fix_partial_unique_onconflict.sql` converted the
-- partial `WHERE <col> IS NOT NULL` unique indexes to plain unique indexes so
-- they could serve as `ON CONFLICT (<col>)` arbiters — but it missed the two
-- tables below.
--
-- site_photos is the visible failure: OpsOfflineForm ALWAYS injects a hidden
-- client_id (that is how the offline outbox dedupes a replayed upload), so the
-- online path in uploadSitePhotoCore takes the `.upsert({ onConflict:
-- "client_id" })` branch on every single submit. With a partial index Postgres
-- cannot match the arbiter and raises:
--   42P10: there is no unique or exclusion constraint matching the ON CONFLICT
--          specification
-- Unlike the notification upserts, this error is NOT swallowed — it is surfaced
-- to the user, so photo upload was broken outright rather than silently
-- degraded.
--
-- qa_inspections currently guards its client_id with a select-then-insert, so
-- it is not broken today, but it carries the identical latent trap. Converting
-- it now keeps the rule from the July migration applied uniformly.
--
-- A PLAIN unique index on a nullable column is semantically identical here:
-- NULLS DISTINCT is the default, so multiple NULLs are still allowed and only
-- non-NULL values are deduplicated — but it CAN be used as an ON CONFLICT
-- arbiter.

drop index if exists public.site_photos_client_id_unique;
create unique index site_photos_client_id_unique
  on public.site_photos (client_id);

drop index if exists public.qa_inspections_client_id_unique;
create unique index qa_inspections_client_id_unique
  on public.qa_inspections (client_id);
