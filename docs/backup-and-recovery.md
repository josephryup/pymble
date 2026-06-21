# Backup, recovery, and migration rollback

This is the runbook the Pymble on-call team should follow when something goes wrong with the database, the storage bucket, or a release.

## 1. Supabase Postgres backups

### What's running by default

- **Daily backups** are taken automatically by Supabase on every project tier.
- **Point-in-Time Recovery (PITR)** is enabled on the Pro plan and above. It lets us roll forward to any second within the last 7 days.

### How to verify PITR is on

1. Open the Supabase dashboard → project `zuezxgyhhrhklrhqsvvs`
2. Settings → Database → Backups
3. The "Point in Time Recovery" panel should show "Enabled" and a retention window (usually 7 days)

If PITR is off, upgrade to Pro and toggle it on. Without PITR a corruption discovered hours later means up to 24h of lost data.

### How to restore

For full project restore:
1. Supabase dashboard → Backups
2. Pick the most recent backup before the incident
3. Click "Restore" — this creates a new project, doesn't overwrite the live one
4. Update env vars (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) in Vercel to point at the restored project
5. Redeploy

For partial table restore (e.g. one accidentally truncated table):
1. Use PITR to clone the project to a temporary URL
2. `pg_dump` the affected table from the clone
3. `psql` it back into the live project
4. Verify row counts match and drop the clone

Document every restore in the incident log with: who triggered it, the PITR target time, which tables were affected, who signed off.

## 2. Cloudflare R2 (file storage) backups

Site photos, BOQ attachments, and any user-uploaded documents live in R2 and **are not covered by Supabase backups**.

### Recommended setup

- Enable versioning on the primary R2 bucket (Cloudflare dashboard → R2 → bucket → Settings → Versioning)
- Set a lifecycle rule that mirrors objects nightly to a secondary cold-storage bucket (or AWS S3 Glacier)
- Retain at least 90 days of versions

### How to restore a single object

1. Cloudflare dashboard → R2 → bucket → Objects
2. Find the key (e.g. `site-photos/abc123.jpg`)
3. "Versions" → pick the version from before the incident → "Restore"

### How to restore the whole bucket

If the live bucket is gone, point R2 traffic at the secondary bucket by changing `R2_BUCKET` in Vercel env. Then run a one-time replication back into a freshly created primary bucket.

## 3. Audit and notification retention

These tables grow forever otherwise. Sprint 11 added:

- `public.audit_events_archive` and `public.notifications_archive` tables
- `public.ops_archive_audit_events(p_older_than_days int)` Postgres function (default 365)
- `public.ops_archive_notifications(p_older_than_days int)` Postgres function (default 180)
- Vercel cron `GET /api/ops/cron/archive` runs monthly on the 1st at 02:00 UTC

### Restoring an archived event

`select * from public.audit_events_archive where id = '<uuid>';`

To bring it back to the hot table, `insert ... select` from the archive — only do this if the hot table truncates were a mistake. Otherwise leave it where it is.

### Pruning the archive

The archive table is not auto-pruned. After 5+ years, consider exporting to cold storage (R2 / S3) as JSONL and dropping older rows.

## 4. Migration rollback

We don't auto-rollback migrations; every change is forward-only by default. To roll back:

1. **Stop deploys** — pause CI so a new build doesn't re-apply the migration mid-rollback
2. **Pick the strategy**:
   - **Backwards-compatible change** (e.g. dropped a column): write a NEW migration that re-adds the column with the same name + type. Deploy.
   - **Destructive change** (e.g. truncated a table): use PITR (above) to restore to a time before the migration ran
   - **Enum value addition**: leave the value in the DB; Postgres can't drop enum values without rebuilding the type. Remove it from `OPS_STAFF_ROLE_VALUES` in code instead. See migration `20260625100000_pymble_ops_role_caretaker_deprecated.sql` for the precedent.
3. **Document** the rollback in the migration's `-- DOWN:` comment block so future engineers know
4. **Re-deploy** the previous app version once the schema is back

### Rollback runbook for the active migrations

| Migration | Strategy |
|-|-|
| `20260623090000_pymble_ops_per_item_supplier` | Drop the three new columns: `alter table ... drop column supplier_id; drop column supplier_name_freeform` on `material_request_items`, `purchase_order_items`, plus `supplier_name_freeform` on `boq_line_items`. Drop the GIN indexes too. |
| `20260624090000_pymble_ops_rfq_item_supplier` | Same pattern on `rfq_items` |
| `20260625090000_pymble_ops_role_engineering_manager_caretaker` | Enum values can't be dropped cleanly. Application-layer removal is sufficient — see `20260625100000_pymble_ops_role_caretaker_deprecated.sql`. |
| `20260626090000_pymble_ops_invoice_sequence` | Drop `public.ops_next_invoice_number(text)` and `public.invoice_number_counters` table. Revert `nextInvoiceNumber` in code to row-count strategy. |
| `20260627090000_pymble_ops_client_id_idempotency` | Drop the four `client_id` columns and their unique partial indexes. |
| `20260628090000_pymble_ops_audit_archive` | Drop the two archive tables and both functions. |

## 5. Pre-deploy schema sanity

Before every production deploy:

```bash
SUPABASE_DB_URL='postgres://...prod...' npm run check-schema
```

This connects to the target database and refuses to exit cleanly if:
- A column the app reads is missing
- A table the app inserts into is missing
- A required Postgres function is missing
- A realtime publication the app subscribes to is missing

CI should pipe a non-zero exit code into a deploy block. The manifest of required schema lives in `scripts/check-schema.mjs` and is updated as part of each migration PR.

## 6. Disaster recovery checklist

When the whole thing is down:

1. **Confirm scope** — Postgres? R2? Vercel? All three?
2. **Postgres** — Supabase status page first, then PITR restore if needed
3. **R2** — Cloudflare status page first, then secondary-bucket failover
4. **Vercel** — status page; if the prod build is broken, redeploy the last known-good commit
5. **Communicate** — post to the team Slack with what's down, ETA, and a workaround if any
6. **Post-mortem** — within 48h: timeline, root cause, blameless write-up, action items
