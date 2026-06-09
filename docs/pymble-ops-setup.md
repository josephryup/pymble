# Pymble Operations Setup

Pymble Operations is a true single-company system. It uses the SitePilot product idea as a reference, but it must not share SitePilot infrastructure.

For the ERP expansion plan, use `docs/pymble-ops-erp-roadmap.md`.
For UI consistency and accessibility standards, use `docs/pymble-ops-design-system.md`.

## Required Accounts

1. Supabase
   - Create a new Supabase project for Pymble only.
   - Do not connect to, clone, or reuse the SitePilot project.
   - Keep these values ready:
     - `NEXT_PUBLIC_SUPABASE_URL`
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
     - `SUPABASE_SERVICE_ROLE_KEY`
     - `CRON_SECRET`
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

9. Run the shared ERP foundation migration:

```txt
supabase/migrations/20260603075131_pymble_ops_erp_foundation.sql
```

10. Run the material requests migration:

```txt
supabase/migrations/20260603133557_pymble_ops_material_requests.sql
```

11. Run the supplier register migration:

```txt
supabase/migrations/20260603193343_pymble_ops_suppliers.sql
```

12. Run the RFQ and purchase order migration:

```txt
supabase/migrations/20260603201226_pymble_ops_rfq_po.sql
```

13. Run the purchase order approval settings migration:

```txt
supabase/migrations/20260603210512_pymble_ops_po_approval_settings.sql
```

14. Run the stores and inventory migration:

```txt
supabase/migrations/20260603214518_pymble_ops_stores_inventory.sql
```

15. Run the stock control functions migration:

```txt
supabase/migrations/20260604091500_pymble_ops_stock_controls.sql
```

16. Run the supplier performance events migration:

```txt
supabase/migrations/20260604103000_pymble_ops_supplier_performance.sql
```

17. Run the daily site reports migration:

```txt
supabase/migrations/20260604124500_pymble_ops_daily_site_reports.sql
```

18. Run the delivery exceptions migration:

```txt
supabase/migrations/20260604141000_pymble_ops_delivery_exceptions.sql
```

19. Run the finance bridge migration:

```txt
supabase/migrations/20260604152000_pymble_ops_finance_bridge.sql
```

20. Run the equipment and fleet migration:

```txt
supabase/migrations/20260604163500_pymble_ops_equipment_fleet.sql
```

21. Run the fuel and maintenance migration:

```txt
supabase/migrations/20260604171000_pymble_ops_fuel_maintenance.sql
```

22. Run the HSE and HR foundation migration:

```txt
supabase/migrations/20260604183000_pymble_ops_hse_hr_foundation.sql
```

23. Run the fleet logistics migration:

```txt
supabase/migrations/20260604190000_pymble_ops_fleet_logistics.sql
```

24. Run the fleet dispatch controls migration:

```txt
supabase/migrations/20260606103000_pymble_ops_fleet_dispatch_controls.sql
```

25. Run the commercial controls migration:

```txt
supabase/migrations/20260604194000_pymble_ops_commercial_controls.sql
```

26. Run the HSE compliance migration:

```txt
supabase/migrations/20260604203000_pymble_ops_hse_compliance.sql
```

27. Run the HR maturity migration:

```txt
supabase/migrations/20260604214500_pymble_ops_hr_maturity.sql
```

28. Run the commercial maturity migration:

```txt
supabase/migrations/20260604223000_pymble_ops_commercial_maturity.sql
```

29. Run the commercial forecasting migration:

```txt
supabase/migrations/20260607103000_pymble_ops_commercial_forecasting.sql
```

30. Run the engineering controls migration:

```txt
supabase/migrations/20260605090000_pymble_ops_engineering_controls.sql
```

31. Run the engineering maturity migration:

```txt
supabase/migrations/20260606114500_pymble_ops_engineering_maturity.sql
```

32. Run the HR document self-service migration:

```txt
supabase/migrations/20260606131500_pymble_ops_hr_documents_self_service.sql
```

33. Run the HSE compliance maturity migration:

```txt
supabase/migrations/20260605103000_pymble_ops_hse_compliance_maturity.sql
```

34. Run the HR onboarding migration:

```txt
supabase/migrations/20260605111500_pymble_ops_hr_onboarding.sql
```

35. Run the HSE risk and audit migration:

```txt
supabase/migrations/20260605123000_pymble_ops_hse_risk_audit.sql
```

36. Run the fleet driver document and profitability support migration:

```txt
supabase/migrations/20260607143000_pymble_ops_fleet_driver_profitability.sql
```

37. Confirm the `organization_profile` table contains the seeded Pymble row and headquarters coordinates.

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
- `approval_requests`
- `approval_steps`
- `approval_comments`
- `documents`
- `document_versions`
- `document_links`
- `record_comments`
- `notifications`
- `material_requests`
- `material_request_items`
- `suppliers`
- `supplier_contacts`
- `supplier_performance_events`
- `rfqs`
- `rfq_items`
- `supplier_quotes`
- `supplier_quote_items`
- `purchase_orders`
- `purchase_order_items`
- `approval_workflow_settings`
- `inventory_locations`
- `stock_items`
- `goods_received_notes`
- `goods_received_items`
- `stock_levels`
- `stock_movements`
- `daily_site_reports`
- `daily_site_report_entries`
- `site_instructions`
- `qa_inspections`
- `qa_inspection_items`
- `material_tests`
- `snag_items`
- `drawing_register`
- `programme_milestones`
- `delivery_exceptions`
- `project_budgets`
- `project_budget_lines`
- `payment_requests`
- `payment_request_items`
- `project_cost_entries`
- `equipment_categories`
- `equipment`
- `equipment_requests`
- `equipment_allocations`
- `fuel_logs`
- `maintenance_jobs`
- `maintenance_job_items`
- `transport_requests`
- `accommodation_bookings`
- `labour_allocations`
- `fleet_operator_documents`
- `commercial_ipcs`
- `commercial_variations`
- `commercial_claims`
- `commercial_contracts`
- `commercial_contract_milestones`
- `commercial_retention_releases`
- `commercial_cashflow_forecasts`
- `commercial_valuations`
- `commercial_valuation_lines`
- `commercial_risks`
- `hse_incidents`
- `corrective_actions`
- `ppe_items`
- `ppe_issues`
- `toolbox_talk_attendees`
- `toolbox_talks`
- `hse_inspections`
- `hse_inspection_findings`
- `safety_training_records`
- `hse_risk_assessments`
- `hse_compliance_audits`
- `employees`
- `employee_onboarding_items`
- `leave_requests`
- `recruitment_requisitions`
- `employee_contracts`
- `performance_appraisals`
- `leave_balances`
- `employee_documents`
- `hr_document_categories`

The shared ERP foundation migration also adds optional `module_key`, `source_table`, `source_id`, and `summary` fields to `audit_events`.
The new shared tables are intentionally single-company and have no tenant/company columns.
Use server helpers for sensitive approval, document, comment, notification, and audit workflows until the final role-by-module permission matrix is implemented.

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
Create a long random `CRON_SECRET` for scheduled jobs and set it as a server-only Vercel production environment variable.

## Ops Scheduled Jobs

Production scheduled jobs are configured in `vercel.json` and must be protected by `CRON_SECRET`.

- `/api/ops/cron/escalations` runs the cross-module escalation sweep daily. It checks stale or overdue approvals, material requests, payment requests, and delivery exceptions, then queues idempotent in-app notifications for the relevant role owners and assigned/requesting users.
- `/api/ops/cron/hse-escalations` runs the HSE-specific safety/compliance escalation sweep daily and can also trigger critical HSE email where configured.

Do not expose either route publicly without the bearer token. A request without `Authorization: Bearer <CRON_SECRET>` must return `401`.

## Ops Email Alerts

Critical HSE email alerts are sent through Resend and supplement in-app notifications. They do not replace the database notification and audit trail.

Required production variables:

- `RESEND_API_KEY`
- `OPS_EMAIL_FROM`, recommended value: `Pymble Operations <noreply@pymbleconstruction.com>`
- `OPS_EMAIL_REPLY_TO`, recommended value: `info@pymbleconstruction.com`

`OPS_EMAIL_FROM` can fall back to `RESEND_FROM_EMAIL` when it is not set. Leave these blank locally if you do not want local HSE actions or cron sweeps to send email.

After applying the HSE email observability migration, every critical HSE email attempt is logged in `ops_email_delivery_events` as `sent`, `failed`, or `skipped`. The HSE workspace shows the 7-day delivery health at `/ops/hse#email-delivery-health`, and the Executive dashboard surfaces failed delivery pressure without exposing raw provider diagnostics in the UI.

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

   The password-reset flow appends a `next` query parameter to the callback URL
   (`/ops/auth/callback?next=/ops/profile%23password`). Plain allow-list entries above match
   regardless of query string, so no wildcard entry is required.

### Invite and password-reset email (custom SMTP — required for production)

Staff invitations (`inviteUserByEmail`) and "Forgot password" (`resetPasswordForEmail`) emails are
sent by **Supabase Auth**, not by the app's Resend integration (`RESEND_API_KEY` / `OPS_EMAIL_FROM`
only drive HSE alert email). Supabase's built-in email sender is rate-limited to a few messages per
hour and is not supported for production, so invites and resets will silently throttle until custom
SMTP is configured.

Configure SMTP under **Authentication → Emails → SMTP Settings** in the Supabase dashboard (Resend
exposes SMTP credentials at `smtp.resend.com:465`, username `resend`, password = your Resend API
key). Set the sender to a verified domain address such as `noreply@pymbleconstruction.com`. The
default invite and recovery email templates use `{{ .ConfirmationURL }}`, which works with the
`/ops/auth/callback` handler — no template changes are needed.

> Note: `npm run ops:readiness` reports email as configured based on `RESEND_API_KEY`. That check
> covers HSE alert email only; it does **not** verify that Supabase Auth SMTP is set up for
> invite/reset delivery. Confirm SMTP separately by sending a real invite and reset.

## Local Environment

Copy `.env.example` to your local env file and fill:

```txt
NEXT_PUBLIC_OPS_HOST=ops.pymbleconstruction.com
NEXT_PUBLIC_OSM_TILE_URL=
RESEND_API_KEY=
RESEND_FROM_EMAIL=
OPS_EMAIL_FROM=
OPS_EMAIL_REPLY_TO=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
CRON_SECRET=
CF_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=pymble-construction-ops
```

Local verification endpoints:

```txt
/api/ops/health
/api/ops/health?mode=readiness
/api/ops/profile
```

`/api/ops/health` should return `200` once the app is running and exposes only a minimal service heartbeat. `/api/ops/health?mode=readiness` requires `Authorization: Bearer <CRON_SECRET>` and returns production readiness booleans for Supabase, R2, cron, email, and monitoring without exposing secret values. `/api/ops/profile` requires an authenticated ops session and returns `401` when called while signed out.

Local quality checks before deployment:

```txt
npm run ops:readiness
npm run test
npm run lint
npm run build
```

For final production environment verification in a trusted local shell, run:

```txt
npm run ops:readiness -- --strict-env
```

Production launch, role permissions, and UAT references:

```txt
docs/pymble-ops-production-launch-checklist.md
docs/pymble-ops-role-permission-matrix.md
docs/pymble-ops-uat-plan.md
```

`NEXT_PUBLIC_OSM_TILE_URL` is optional. Leave it blank to use the public OpenStreetMap tile URL, or set it to a dedicated tile endpoint if Pymble later uses a paid/provider-specific map tile service.

## Implemented Ops Modules

- Overview: live SitePilot-style operating dashboard with metrics, action items, headquarters marker, site map, focused site details, commercial thread, and audit activity from the Pymble database.
- Staff: invite the Managing Director, General Manager, Human Resource, Operations Manager, Projects Manager, Procurement Manager, Quantity Surveyor, Procurement, Procurement Assistant, Finance Manager, Accountant, Engineer, HSE Officer, HSE Assistant Officer, and Admin / Receptionist roles through Supabase Auth email.
- Projects and Sites: create and list active project/site master records with optional latitude and longitude for the overview map, then reuse `site_id` across engineering, procurement, finance, fleet, HSE, HR, commercial, attachments, and internal comments.
- Workers: create and list active workers with site assignment.
- Attendance: create daily timesheet records, optional GPS pings, and approve them for payroll.
- Approvals: shared workflow inbox, approval detail timeline, approve/reject actions, comments, and unread workflow notifications.
- Material Requests: create site material request drafts, add line items, submit to shared approvals, sync approval status, notify approvers, and attach documents/comments.
- Site Instructions and QA/QC: create site instructions, instruction follow-up tasks, QA inspections, categorized checklist findings, material tests, snag items, drawing records with exact document-version links, programme milestones, programme pressure dashboards, lifecycle actions, and linked attachments/comments.
- Suppliers: maintain the approved supplier register, contact records, status controls, recent performance events, and linked attachments/comments for procurement workflows.
- RFQs and Purchase Orders: create RFQ packages, add RFQ items, invite active suppliers, record supplier quote totals, award a quote into a draft purchase order, submit POs through threshold-backed approvals, issue approved POs, and attach documents/comments to RFQs.
- Stores and Inventory: create stock locations and stock items, post goods received notes against issued purchase orders, update purchase order receipt status, issue stock, transfer stock, adjust counted balances, raise delivery exceptions from posted GRNs, and track stock balances/movements with linked attachments/comments.
- Delivery Exceptions: create supplier/site/GRN-linked delivery exception records, prefill exceptions from posted GRN shortcuts, monitor exception ageing alerts, review supplier follow-up ranking, move records through investigation/resolution/closure, rate supplier recovery on resolution, and attach evidence/comments.
- Equipment and Fleet Logistics: manage equipment categories, equipment records, equipment requests, allocations, fuel logs, maintenance jobs, utilization dashboards, maintenance pressure, transport requests, dispatch calendar, vehicle/operator assignment, trip planning attention, usage variance, accommodation bookings, labour allocations, site mobilization planning, driver/operator document expiry, and fleet profitability snapshots with linked cost handoffs and attachments/comments.
- HSE: create site-linked incident and near-miss records, start investigations, move incidents to corrective action, create and verify corrective actions, queue HSE inbox alerts, run the protected HSE escalation cron sweep, track PPE stock/issues, toolbox talks, inspections/findings, safety training, risk assessments, compliance audits, incident ageing alerts, executive safety rollups, risk heatmaps, audit escalation watch, and attach evidence/comments.
- Employees and Leave: create employee records, link staff users when available, track departments/status, create leave requests, move leave through submitted, approved, rejected, cancelled, and completed states, manage recruitment requisitions, employee contracts, performance appraisals, leave balances, onboarding checklist items, HSE training renewal alerts, HR document categories, private employee document uploads, HR document review/archive controls, required-document coverage reporting, self-service document access, and linked attachments/comments.
- Notifications: personal workflow alert workspace with unread, read, and archived filters plus related-record links.
- Payroll: record cash advances, create payroll runs from approved attendance, approve runs, and mark payout status.
- BOQ: create documents and line items with budgeted and actual totals, plus linked attachments and internal comments.
- Invoices: create VAT invoices, link BOQs, track draft, sent, and paid status, plus linked attachments and internal comments.
- Finance: manage project budgets, budget lines, payment requests, committed/posted cost entries, payables ageing, cashflow signal, and active budget variance dashboards with linked attachments/comments.
- Commercial: manage contracts, line-level valuations, IPCs, variations, claims, commercial risks, retention releases, cashflow forecasts, contract milestone forecasting, and certified IPC-to-draft-invoice handoffs with linked attachments/comments.
- Executive: provide Developer, Managing Director, and General Manager roles with a read-only cross-module dashboard for approvals, cashflow, budget exposure, commercial margin/forecast, project pressure, HSE, procurement, delivery, fleet, HR, and engineering signals.
- Photos: upload private site photos to the Pymble R2 bucket and store metadata in Supabase.
- Documents: upload private controlled documents, track metadata and current versions, replace versions with audit logging, archive records without deleting files, request Managing Director approval, and download through authenticated app routes.
- Modules: view the role-aware live workspace and planned ERP registry. This route is intentionally not a daily sidebar module.
- Settings: update the single Pymble organization profile, headquarters address, headquarters map coordinates, invoice prefix, currency, VAT defaults, and purchase order approval threshold.

## Notes

- Service role keys must never be exposed to the browser.
- Supabase tables in exposed schemas require explicit grants for Data API access on new projects.
- RLS remains enabled even though this is single-company, because staff roles still need boundaries.
- R2 stores private operational files. The public website image assets remain in `public/`.
