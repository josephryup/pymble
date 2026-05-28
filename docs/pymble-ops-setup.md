# Pymble Operations Setup

Pymble Operations is a true single-company system. It uses the SitePilot product idea as a reference, but it must not share SitePilot infrastructure.

## Required Accounts

1. Supabase
   - Create a new Supabase project for Pymble only.
   - Do not connect to, clone, or reuse the SitePilot project.
   - Keep these values ready:
     - `NEXT_PUBLIC_SUPABASE_URL`
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
     - `SUPABASE_SERVICE_ROLE_KEY`
   - The Supabase project ID is only needed for CLI/MCP operations. The app runtime uses the URL and keys above.

2. Cloudflare R2
   - Create a new bucket, recommended name: `pymble-construction-ops`.
   - Create R2 API credentials scoped to this bucket.
   - Keep these values ready:
     - `CF_ACCOUNT_ID`
     - `R2_ACCESS_KEY_ID`
     - `R2_SECRET_ACCESS_KEY`
     - `R2_BUCKET_NAME`

3. Subdomain
   - Recommended host: `ops.pymbleconstruction.com`.
   - Point it at the same deployment as the website, or a dedicated deployment if we split the app later.
   - The app proxy rewrites this host to `/ops`.

## Supabase Database

Open the new Pymble Supabase project, then:

1. Go to **SQL Editor**.
2. Create a new query.
3. Paste the full migration from:

```txt
supabase/migrations/20260528000100_pymble_ops_single_company.sql
```

4. Run the query.
5. Run the additive headquarters migration:

```txt
supabase/migrations/20260528000300_pymble_organization_headquarters.sql
```

6. Run the overview performance migration:

```txt
supabase/migrations/20260528000400_pymble_ops_overview_snapshot.sql
```

7. Run the HR role permissions migration:

```txt
supabase/migrations/20260528063359_pymble_hr_profile_permissions.sql
```

8. Run the developer role migrations:

```txt
supabase/migrations/20260528101626_pymble_developer_role_enum.sql
supabase/migrations/20260528101627_pymble_developer_role_access.sql
supabase/migrations/20260528104729_pymble_developer_display_name.sql
supabase/migrations/20260528110738_pymble_staff_role_titles.sql
```

9. Confirm the `organization_profile` table contains the seeded Pymble row and headquarters coordinates.

The migration intentionally has no tenant model:

- no `companies` tenant table
- no `company_id` on operational tables
- no company registration flow
- no tenant-scoped policies

The overview page uses the `public.ops_overview_snapshot()` RPC once this migration is run. Until then, the app falls back to individual table queries so local development still works, but the dashboard will be slower.

It creates:

- `organization_profile`
- `users`
- `sites`
- `workers`
- `attendance_records`
- `cash_advances`
- `payroll_runs`
- `payroll_run_items`
- `boq_documents`
- `boq_line_items`
- `invoices`
- `site_photos`
- `otp_challenges`
- `audit_events`

## First Developer

After the Supabase project exists:

1. Go to **Authentication > Users** in Supabase.
2. Add the first developer user manually.
3. Use the technical admin email address.
4. Set a temporary password.
5. Copy that user's Auth UUID.
6. Go back to **SQL Editor**.
7. Insert a matching row into `public.users` with role `developer`.

Example:

```sql
insert into public.users (id, full_name, role, email, phone)
values (
  'AUTH_USER_UUID_HERE',
  'Developer',
  'developer',
  'developer@pymbleconstruction.com',
  '+260979521035'
);
```

For the current first Auth user, the ready-to-run seed is:

```txt
supabase/seeds/20260528000200_pymble_first_owner.sql
```

After that, the developer can invite the Managing Director through `/ops/staff` with role `Managing Director`.
The developer role is hidden from the access register and cannot be deactivated from the app.
The Developer, Managing Director, General Manager, and Human Resource roles can invite operational staff. Public signup remains unused.

## API Keys

In Supabase, go to **Project Settings > API** and copy:

- Project URL → `NEXT_PUBLIC_SUPABASE_URL`
- Anon/public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Service role key → `SUPABASE_SERVICE_ROLE_KEY`

The service role key is server-only. Do not put it in browser code, screenshots, GitHub issues, or public chat.

## Auth Settings

For the first setup pass:

1. Keep email/password sign-in enabled.
2. Disable public signups if you do not want staff self-registration.
3. Use manual user creation or Developer, Managing Director, General Manager, or Human Resource-created users.
4. Add the ops URL to allowed redirect URLs later:
   - `https://ops.pymbleconstruction.com/ops/auth/callback`
   - `https://ops.pymbleconstruction.com/auth/callback`
   - `http://localhost:3000/ops/auth/callback`
   - `http://localhost:3000/auth/callback`

## Local Environment

Copy `.env.example` to your local env file and fill:

```txt
NEXT_PUBLIC_OPS_HOST=ops.pymbleconstruction.com
NEXT_PUBLIC_OSM_TILE_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
CF_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=pymble-construction-ops
```

Local verification endpoints:

```txt
/api/ops/health
/api/ops/profile
```

`/api/ops/health` should return `200` once the app is running and exposes only a minimal service heartbeat. `/api/ops/profile` requires an authenticated ops session and returns `401` when called while signed out.

`NEXT_PUBLIC_OSM_TILE_URL` is optional. Leave it blank to use the public OpenStreetMap tile URL, or set it to a dedicated tile endpoint if Pymble later uses a paid/provider-specific map tile service.

## Implemented Ops Modules

- Overview: live SitePilot-style operating dashboard with metrics, action items, headquarters marker, site map, focused site details, commercial thread, and audit activity from the Pymble database.
- Staff: invite the Managing Director, General Manager, Human Resource, Operations Manager, Projects Manager, Procurement Manager, Quantity Surveyor, Procurement, Procurement Assistant, Finance Manager, Accountant, Engineer, HSE Officer, HSE Assistant Officer, and Admin / Receptionist roles through Supabase Auth email.
- Sites: create and list active project sites with optional latitude and longitude for the overview map.
- Workers: create and list active workers with site assignment.
- Attendance: create daily timesheet records, optional GPS pings, and approve them for payroll.
- Payroll: record cash advances, create payroll runs from approved attendance, approve runs, and mark payout status.
- BOQ: create documents and line items with budgeted and actual totals.
- Invoices: create VAT invoices, link BOQs, and track draft, sent, and paid status.
- Photos: upload private site photos to the Pymble R2 bucket and store metadata in Supabase.
- Settings: update the single Pymble organization profile, headquarters address, headquarters map coordinates, invoice prefix, currency, and VAT defaults.

## Notes

- Service role keys must never be exposed to the browser.
- Supabase tables in exposed schemas require explicit grants for Data API access on new projects.
- RLS remains enabled even though this is single-company, because staff roles still need boundaries.
- R2 stores private operational files. The public website image assets remain in `public/`.
