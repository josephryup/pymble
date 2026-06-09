# Pymble Operations ERP Roadmap

Last updated: 2026-06-08

This document is the source of truth for the Pymble Operations ERP roadmap. Whenever a module, database table, workflow, permission rule, or UI convention changes, update this file in the same work session.

Pymble Operations is a true single-company ERP. It must not behave like a multi-tenant SaaS product, must not share SitePilot infrastructure, and must keep Pymble data, APIs, storage, roles, and dashboards independent.

## Maintenance Rules

- Update this roadmap whenever a module is added, changed, renamed, or removed.
- Update the database section whenever a migration adds or changes tables, enums, functions, indexes, RLS policies, or storage assumptions.
- Update the workflow section whenever approval steps, thresholds, or department handoffs change.
- Update the permissions section whenever role behavior changes.
- Update the status tracker before and after each implementation phase.
- Keep implementation notes user-facing and operational. Do not include private secrets in this document.

## Current Implemented Foundation

The current system already includes:

- Overview dashboard
- Staff access register and invitation flow
- Project site register
- Worker register
- Attendance records and approval
- Payroll runs and cash advances
- BOQ documents and line items
- Invoice register
- Site photo log
- Organization settings
- Single-company Supabase database
- Private R2 storage for operational files
- Ops subdomain support through host rewrite
- Shared ERP foundation migration for approvals, approval steps, approval comments, documents, document versions, document links, record comments, notifications, and enriched audit event fields
- Server helper layer for shared approval lists, document links, record comments, notification records, and audit writes
- First-pass approval inbox at `/ops/approvals`
- Approval detail and decision route at `/ops/approvals/[approvalId]`
- First-pass document library at `/ops/documents`
- Authenticated document download route through `/api/ops/documents/[versionId]/download`
- Document approval request workflow from `/ops/documents`
- Document library current-version loading optimization
- Document version replacement and archive controls at `/ops/documents`
- Record-specific attachment and comment surfaces for sites, BOQs, invoices, material requests, suppliers, and RFQs
- Sidebar notification count and reusable comment timeline component
- Dedicated notification workspace at `/ops/notifications` with unread, read, and archived filters
- Role-aware module registry at `/ops/modules` with grouped live workspace modules and planned ERP modules
- Focused Node test harness covering module visibility, approval decision guards, document mutation/download guards, record activity validation, supplier guards, RFQ/PO guards, notification acknowledgement helpers, safe notification return paths, listing helpers, and upload validation
- Server-side search and pagination for Documents, Approvals, Sites, BOQ, and Invoices
- Shared dashboard snapshot fallback helper used by the Overview dashboard
- Material request migration, route, draft line-item workflow, record activity support, and approval submission into the shared approval engine
- Supplier register migration, route, contacts, status controls, record activity support, and supplier guard tests
- RFQ and purchase order migration, route, RFQ items, supplier quote tracking, quote award action, draft PO creation, record activity support, and RFQ/PO guard tests
- Purchase order approval settings migration, Settings threshold control, approval submission, approval decision sync back to POs, issue action for approved POs, and focused PO approval guard tests
- Stores and inventory migration, route, stock locations, stock items, GRN posting from issued POs, stock levels, stock movements, record activity support, and stores guard tests
- Stock control functions migration, stock issue action, stock transfer action, stock count adjustment action, movement permission guards, and stores UI controls
- Daily site reports migration, route, report headers, structured entries, status actions, record activity support, module registry route, and guard tests
- ERP workspace layout direction captured in the design system for sidebar, top utility bar, dashboard analytics, KPI cards, charts, reports, and master-data grids
- First ERP workspace convergence pass: light fixed sidebar, icon navigation, content top utility bar, reusable dashboard/KPI/chart/report shortcut primitives, and refreshed Overview dashboard
- Dedicated Pymble Operations SVG mark in the ops shell, login, route loading states, and map fallback
- Timeout-guarded ops session refresh in the proxy so external auth refresh failures do not stall every ops page request
- Invoice register ERP convergence pass: finance/commercial title actions, status KPI counts, visible-value summary, collapsed invoice creation, confirmed status actions, and retained record activity
- RFQ/PO ERP convergence pass: procurement title actions, upstream material-request/supplier links, RFQ/PO KPI cards, visible procurement values, flow summary, collapsed RFQ creation, and retained RFQ/quote/PO actions
- Stores and Inventory ERP convergence pass: procurement/stores title actions, KPI cards, inventory-flow summary, live stock state panels, collapsed GRN receiving, collapsed master-data and stock-control panels, and retained GRN register/activity
- Approval inbox ERP convergence pass: shared workflow title actions, KPI cards, approval-flow summary, approval register, notification side panel, and removal of placeholder workflow notes
- Material Requests ERP convergence pass: engineering/procurement title actions, KPI cards, visible request values, material-flow summary, collapsed creation panel, and retained approval submission plus record activity
- BOQ ERP convergence pass: commercial title actions, KPI cards, visible commercial values, BOQ-to-invoice flow summary, collapsed BOQ creation, collapsed line-item intake, and retained mobile/table line-item views plus record activity
- BOQ read helper moved to the server service client after route-level permission checks to avoid session-scoped read stalls on the commercial register
- Commercial maturity pass: contract register, line-level valuation intake, commercial risk register, contract/valuation/risk status actions, IPC contract/valuation links, and certified IPC-to-draft-invoice handoff
- Commercial forecasting pass: retention release register, cashflow forecast periods, enriched contract milestones, retention/cashflow/milestone lifecycle actions, commercial forecast watch panel, record activity support, migration, and guard/reporting tests
- Engineering controls pass: site instruction register, QA inspections with checklist items, material tests, snag list, drawing register, programme milestones, lifecycle actions, record activity support, module registry route, migration, and guard tests
- HR onboarding pass: employee onboarding checklist table, create/start/complete/waive/cancel lifecycle, employee-register checklist controls, HSE safety-training renewal watch, record activity support, migration, and guard tests
- HR document self-service pass: private employee document assignment table, required-document coverage dashboard, HR upload/review/archive controls, profile self-service upload/downloads, guarded download bridge, migration, and guard/reporting tests
- HSE risk and audit pass: risk assessment register, compliance audit register, lifecycle actions, review/action KPI signals, record activity support, migration, and guard tests
- Executive dashboard first pass: `/ops/executive`, leadership-only route visibility, cross-module pressure KPIs, cashflow/liability summary, commercial forecast watch, project profitability/budget pressure cards, procurement/fleet/HR/HSE/engineering panels, source-health fallback handling, module registry route, and guard/rollup tests
- HSE email observability pass: critical HSE email attempt logging, sent/failed/skipped delivery status tracking, 7-day HSE email health panel, executive delivery warning signal, migration, and focused report tests
- Production launch hardening pass: final role permission policy, role matrix documentation, UAT plan, production launch checklist, protected readiness health mode, ops security headers, and local readiness command
- Dashboard improvement first pass: `/ops` now renders role-specific dashboards for Executive, Site Delivery, Procurement, Commercial/QS, Finance, HSE, and People/HR using live module metrics, role-specific CTAs, time-aware action queues, role shortcuts, and source-linked panels.
- Navigation improvement first pass: global command palette with Cmd/Ctrl+K, role-visible module search, role-relevant actions, and browser-local recent route recall.
- Notification quick win: unread notification batch "Mark all read" action scoped to the signed-in recipient.
- Mobile/PWA quick win: ops-specific manifest and install metadata scoped to `/ops`.
- shadcn foundation pass: `components.json`, shadcn theme tokens, Tooltip provider, and core local primitives are installed; shared Ops dashboard, form, command, loading, record activity, mobile record, comment, and map components now compose from shadcn where practical.

These existing modules should become the foundation of the ERP instead of being replaced.

## ERP Target Domains

The ERP expansion is organized into eight operational domains:

| Domain | Purpose | Existing Foundation | Status |
| --- | --- | --- | --- |
| Engineering | Site execution, progress, QA/QC, instructions, reporting | Sites, photos, attendance, BOQ, material requests, daily reports, engineering controls | Live first pass |
| Procurement and Stores | Material requests, suppliers, RFQs, POs, deliveries, inventory | Sites, BOQ, approval engine, supplier register, RFQ/PO foundation, stores/GRN foundation | In progress |
| Finance and Accounts | Budgets, payment approvals, supplier ageing, cashflow, project profitability | Payroll, invoices, cash advances, project budgets, payment requests | In progress |
| Operations and Fleet | Equipment, fuel, transport, accommodation, labour allocation | Sites, workers, attendance, equipment, fuel, maintenance | In progress |
| HSE | Incidents, PPE, toolbox talks, inspections, audits, corrective actions | Photos, users, documents, incident/action foundation, compliance controls | Live maturity pass |
| Admin and HR | Employees, recruitment, contracts, leave, appraisals, HR documents | Staff, workers, attendance, payroll, employee/leave foundation, HR maturity controls, employee document self-service | Live maturity pass |
| QS and Commercial | BOQs, IPCs, valuations, variations, claims, contracts, margins | BOQ, invoices, commercial controls, retention, cashflow, milestones | Live forecasting pass |
| Executive | MD/GM dashboards, approvals, KPIs, exceptions, profitability | Overview, finance, commercial, HSE, HR, fleet, engineering, procurement | Live first pass |

## Architecture Principle

Do not build isolated department apps. Build one connected ERP around shared records:

- projects/sites
- people
- requests
- approvals
- documents
- comments
- audit events
- costs
- notifications
- dashboards

Each module should feed the shared records so Finance, Operations, Procurement, Engineering, QS, HSE, HR, and Management all see the same operational truth.

## UI Direction Roadmap

The approved visual direction is a dense internal ERP workspace with a fixed sidebar, content-level top utility bar, dashboard analytics panels, KPI cards, chart controls, and report/master-data shortcut grids. This is now part of the design system and should shape all future module work.

Layout priorities before the next major feature wave:

1. Refine the ops shell toward the ERP workspace reference: compact fixed sidebar, profile anchored at the bottom, content top bar, breadcrumb, global search placeholder, quick action slot, theme control, and notification access.
2. Redesign the Overview route as the first canonical dashboard pattern with analytics panels, KPI cards, source-linked summaries, and operational shortcut/report sections.
3. Establish reusable dashboard primitives so Finance, Procurement, Stores, Executive, and Commercial pages share the same panel, chart, KPI, filter, and report-card language.
4. Convert high-traffic module pages away from long form-first layouts where needed; page order should become title/action toolbar, analytics/summary, list/report surface, then collapsed create/edit forms.
5. Keep mobile field workflows simple: drawer navigation, stacked cards, accessible filters, and no squeezed desktop charts.

This layout work is not a cosmetic afterthought. It improves speed, scanability, role clarity, and long-term consistency as the ERP grows.

Current delivery priority: finish first-pass module coverage before returning to deeper layout polish. Existing live modules should remain usable and consistent, but the next implementation wave should turn planned modules into working foundations so the ERP has real operational breadth.

## Dashboard and Experience Improvement Roadmap

The improvement documents `D:\dashboard_improvement_suggestions.md` and `D:\additional_improvements.md` are accepted into this roadmap. Nothing from those documents should be treated as disposable notes; each item below must either be implemented, deferred with a clear reason, or split into smaller implementation tasks when it needs migrations or external services.

### Role-Specific Overview Dashboards

The `/ops` overview must no longer behave as one generic dashboard for every role. It should route the logged-in user into one of seven role-group compositions:

| Dashboard group | Roles | Purpose | Status |
| --- | --- | --- | --- |
| Executive | Developer, Managing Director, General Manager, owner/manager aliases | Business health, approvals, cash exposure, project pressure, safety pressure | Live first pass |
| Site Delivery | Operations Manager, Projects Manager, Engineer, supervisor alias | Site attendance, materials, daily reports, instructions, site map | Live first pass |
| Procurement | Procurement Manager, Procurement, Procurement Assistant | Demand, RFQ/PO pipeline, supplier pressure, delivery exceptions | Live first pass |
| Commercial / QS | Quantity Surveyor | BOQ value, budget variance, invoices, IPC/variation flow | Live first pass |
| Finance | Finance Manager, Accountant | Payment queue, payroll exposure, receivables, failed payouts | Live first pass |
| HSE | HSE Officer, HSE Assistant Officer | Safety pressure, incidents, corrective actions, inspections, training renewal | Live first pass |
| People / HR | Human Resource, Admin / Receptionist, HR alias | Employees, leave, onboarding, recruitment, document compliance | Live first pass |

Cross-cutting dashboard requirements:

- Use a personalized greeting with time of day and role-specific operational context.
- Replace generic CTAs with role-specific primary and secondary actions.
- Replace generic action queues with role-aware, time-aware actions using overdue/today/upcoming language.
- Prefer "my recent activity" or role-relevant signals over global raw audit streams.
- Use role-specific dashboard panels instead of the same chart/map/activity layout for all roles.
- Keep dashboard source links traceable to modules and records.
- Use existing snapshot data for the first pass where possible, then split into dedicated fetchers/RPC snapshots as volume grows.

Implementation status: the first role-dashboard wave is live on `/ops`. It uses the shared overview snapshot plus bounded role metric queries. The next dashboard-performance step is to move heavier role-specific counts into SQL/RPC snapshots if production volume makes the page slow.

UI polish status: the first Untitled UI/shadcn-inspired visual pass is live across shared ops dashboard components. KPI cards now use softer metric hierarchy and sparklines, shared chart panels now use shadcn `ChartContainer` plus Recharts-backed metric cards instead of combined progress/bar visuals, action queues and activity timelines use featured icons/status badges, list controls use shadcn input/label/button patterns, the command palette uses shadcn `CommandDialog`, and record activity uploads use a clearer evidence upload zone.

### Accepted Improvement Backlog

| ID | Improvement | Priority | Implementation note |
| --- | --- | --- | --- |
| AUTO-01 | Automated escalation chains | Live first pass | Daily `/api/ops/cron/escalations` is live with SLA config, dashboard stale signals, and idempotent notifications across approvals, material requests, payment requests, and delivery exceptions. |
| AUTO-02 | Workflow status transitions with guards | Do next | Centralize valid transitions in a workflow engine and migrate module actions gradually. |
| AUTO-03 | Scheduled daily digest emails | Do next | Add profile preference and `/api/ops/cron/daily-digest`; email should summarize assigned actions and outcomes. |
| AUTO-04 | Template system for recurring records | Backlog | Start with material requests and HSE inspection checklists. |
| MOB-01 | PWA and mobile field routes | Do first | Ops manifest/start URL is live; mobile field route refinements for attendance/photos/incidents/DSR remain. |
| MOB-02 | Offline form drafts | Do next | Use localStorage/IndexedDB autosave for DSR and HSE incident forms first. |
| MOB-03 | GPS-enriched field actions | Backlog | Add GPS capture to site photos, incidents, and inspections after privacy copy is finalized. |
| COMM-01 | @mentions in comments | Do next | Add staff autocomplete and notification fan-out from comments. |
| COMM-02 | Realtime notification badge updates | Do next | Subscribe to recipient notifications with Supabase Realtime and animate badge updates. |
| COMM-03 | WhatsApp/SMS critical alerts | Backlog | Requires provider selection, sender approval, user consent, and profile phone/WhatsApp preferences. |
| RPT-01 | PDF report generation | Do first | Invoices, BOQ summaries, HSE incidents, DSRs, and IPCs need printable templates and download routes. |
| RPT-02 | CSV/Excel exports on list pages | Do next | Export current filters up to a bounded row limit, starting with finance/procurement lists. |
| RPT-03 | Scheduled reports | Do next | MD/GM scheduled summaries with PDF/email delivery and settings UI. |
| RPT-04 | Custom dashboard widgets / saved filters | Backlog | Save named views per user or role after list filters settle. |
| NAV-01 | Global command palette | Do first | First pass live: Cmd/Ctrl+K searches role-visible navigation, role-relevant actions, and local recent routes; record API results remain future work. |
| NAV-02 | Recent items / favorites | Do next | Track local recent route visits first; add record-level favorites later. |
| NAV-03 | Keyboard shortcuts | Backlog | Add route shortcuts and help overlay once command palette is stable. |
| VIZ-01 | Trend charts over time | Do next | Requires dashboard metric snapshots table and cron refresh. |
| VIZ-02 | Interactive site map layers | Do next | Add toggles for sites, attendance, HSE incidents, transport, deliveries, and health. |
| VIZ-03 | Gantt-style project timeline | Backlog | Add to Engineering Controls once milestone dependencies mature. |
| UX-01 | Inline record detail slide-over | Do first | Add URL-addressable slide-over pattern for high-traffic list pages. |
| UX-02 | Bulk actions on list pages | Do next | Start with attendance approvals, notification archive, and PO controls. |
| UX-03 | Form auto-save and draft state | Do next | Use client-side drafts on complex forms; clear on success. |
| UX-04 | New-user onboarding walkthrough | Backlog | Requires user onboarding flag and role-specific steps. |
| PERF-01 | Dashboard caching with stale-while-revalidate | Do next | Expand existing dashboard snapshot pattern and show snapshot age. |
| PERF-02 | Cursor pagination | Do next | Apply to audit events, attendance, and notifications before high-volume launch. |
| PERF-03 | Lazy-load heavy dashboard panels | Backlog | Split dashboard APIs/panels once first role dashboards stabilize. |
| AI-01 | Smart anomaly detection | Backlog | Implement threshold-based checks, not ML, after snapshots exist. |
| AI-02 | Predictive budget alerts | Backlog | Requires stable budget burn snapshots and notification thresholds. |
| INT-01 | Accounting software export | Do next | Start with invoice/payment CSV formats for Sage/Xero/QuickBooks. |
| INT-02 | Webhook system | Do next | Admin-only webhook config, signed payloads, retries, and audit. |
| INT-03 | Calendar integration | Backlog | Tokenized personal iCal feeds for leave, inspections, and milestones. |

### Quick Wins Accepted

- Personalized greeting on `/ops`. Status: live first pass.
- Mark all read on notifications. Status: live first pass.
- Record count in page titles where list metadata exists.
- Last login/last seen display in staff register once login telemetry is recorded.
- Empty state CTAs on pages with no records.
- Breadcrumb record IDs on detail routes and slide-overs.
- Help text with `aria-describedby` for non-obvious fields such as TPIN and coordinates.
- Favicon or tab-title notification indicator.

## Robustness Requirements

Robustness is a product requirement, not a final cleanup task. Every module must be designed so the system remains reliable as Pymble adds more users, sites, approvals, documents, financial records, and operational history.

### Data Integrity

- Use database constraints for required relationships and valid statuses.
- Use foreign keys for cross-module records.
- Use enums or check constraints for workflow states.
- Avoid hard deletes for operational records. Prefer archive/deactivate states.
- Keep financial records append-only where possible.
- Store approval history as immutable steps, not a single overwritten status note.
- Use transaction-safe server actions for multi-table writes.
- Validate all server action inputs before writing to the database.
- Use unique constraints where duplicates would create operational risk, such as invoice numbers, PO numbers, equipment codes, material codes, employee numbers, and project codes.
- Record `created_by`, `updated_by`, `created_at`, and `updated_at` where operational ownership matters.

### Security and Permissions

- Keep RLS enabled on all exposed Supabase tables.
- Keep service-role access server-only.
- Never trust client-side role checks alone.
- Re-check permissions inside every server action and API route.
- Do not use user-editable metadata for authorization decisions.
- Hide Developer from normal operational registers.
- Protect sensitive finance, payroll, HR, and HSE records with explicit role checks.
- Separate view, create, approve, edit, archive, and export permissions.
- Log all sensitive actions in `audit_events`.

### Approval Safety

- Use the shared approval engine for all high-risk workflows.
- Store approval thresholds in configuration, not hard-coded page logic.
- Prevent users from approving their own high-risk requests unless explicitly allowed.
- Keep a complete approval timeline with actor, role, comment, timestamp, and decision.
- Use two-step confirmation for irreversible actions.
- Support rejection reasons and resubmission where workflows require it.
- Make approval state transitions explicit and validated server-side.

### Auditability

- Every meaningful business event should write an audit event.
- Audit events should include actor, module, source record, action, summary, and timestamp.
- Financial, HSE, HR, and approval records should keep stronger audit details.
- Dashboards should be traceable back to source records.
- Avoid silent background changes unless they are also logged.

### Reliability and Error Handling

- User-facing errors should be operational and non-technical.
- Server logs may include technical details, but UI should not expose internals.
- Writes that depend on external services, such as R2 uploads or email invitations, should handle partial failure safely.
- Multi-step operations should either complete fully or leave a clear recoverable state.
- Use idempotency keys for workflows where double-submit risk exists, especially payments, POs, approvals, and invitations.
- Keep retry behavior deliberate. Do not blindly retry financial or stock-changing operations.

### Performance and Scale

- Use indexes for common filters: `site_id`, `status`, `created_at`, `requested_by`, `assigned_to`, `supplier_id`, `employee_id`, and approval state.
- Use pagination for growing tables.
- Use server-side filters for attendance, procurement, finance, HSE, documents, and audit logs.
- Use dashboard RPC snapshots or SQL views for heavy executive dashboards.
- Avoid fetching full record histories into list pages.
- Keep mobile record cards focused on the most important fields.
- Add search and date filters before tables become operationally large.

### Document and File Robustness

- Store files privately in R2.
- Store file metadata in Supabase.
- Link documents to source records through `document_links`.
- Support versioning for drawings, contracts, policies, and other controlled documents.
- Keep signed URLs short-lived.
- Validate file type and file size before upload.
- Keep document categories consistent across modules.

### Notifications and Escalations

- Notifications should be generated from workflow events, not ad hoc page logic.
- Escalations should be based on due dates, overdue approvals, failed deliveries, high-risk HSE incidents, and budget exceptions.
- Important notifications should be stored in the database so they can be audited.
- Email should supplement in-app notifications, not replace database workflow state.

### Backup and Recovery

- Supabase production backups must be enabled and periodically checked.
- Before major migrations, confirm a recent backup exists.
- Migration files must be committed and documented.
- High-risk migrations should include rollback notes or compensating scripts.
- R2 bucket policies and access keys should be documented in setup notes without exposing secrets.
- Recovery expectations should be defined for database, files, and deployment rollback.

### Observability

- Track build and deployment health through the Git/Vercel pipeline.
- Add application error monitoring for production.
- Log server-side failures in a way that can be traced to route/action/module.
- Add health checks for auth/database/storage readiness where useful.
- Track slow dashboard queries and optimize them with views, indexes, or RPC snapshots.
- Monitor failed email invitations, failed file uploads, and failed external calls.

### Testing and Verification

- Every module should have at least focused tests for high-risk server actions.
- Permission checks should be tested for allowed and denied roles.
- Approval state transitions should be tested.
- Financial calculations should have deterministic tests.
- Build and lint must pass before deployment.
- Frontend module changes should be checked on mobile and desktop.
- Migration changes should be verified against a Supabase project before production deployment.

## Core Shared Concepts

### Projects and Sites

Decision: keep the current `sites` table as the project/site master for this ERP phase.

Reasoning: Pymble's requirement document treats project execution, site reporting, procurement, finance, fleet, HSE, HR, and commercial controls as site/project-linked work. The current system already uses `site_id` across the operating modules, so introducing a separate `projects` table now would add duplication without solving a current workflow problem.

Use `sites` as the operational project anchor for now. Add a separate `projects` table only if Pymble later needs one contract/project to contain multiple physical sites, phases, or work packages that must be reported independently under the same parent.

Every major record should be linkable to a site/project:

- daily reports
- material requests
- equipment requests
- purchase orders
- deliveries
- attendance
- payroll cost
- BOQ lines
- invoices
- HSE incidents
- documents
- costs

### People

The system currently has:

- `users`: authenticated staff profiles and roles
- `workers`: crew/payroll-ready site labour

Future HR expansion should add employee-grade records without breaking the current staff login model. Recommended approach:

- keep `users` for system access
- keep `workers` for site labour/payroll crew
- add `employees` for HR employment records
- optionally link `users.employee_id` once employee records exist
- optionally link `workers.employee_id` for permanent workers

### Requests

Use request records for cross-department workflows. A request is not always financial; it can be material, equipment, fuel, accommodation, leave, payment, or HSE corrective action.

Recommended shared request fields:

- `id`
- `request_type`
- `site_id`
- `requested_by`
- `department`
- `status`
- `priority`
- `needed_by`
- `amount_estimate`
- `description`
- `current_owner_id`
- `created_at`
- `updated_at`

Implemented first-pass request tables:

- `material_requests`
- `material_request_items`

Implemented in migration:

- `supabase/migrations/20260603133557_pymble_ops_material_requests.sql`

Current material request behavior:

- Requests are created as drafts with at least one line item.
- Extra line items can be added while the request is draft or rejected.
- Submitting creates one shared `approval_requests` record and approval steps.
- Approval decisions sync the source `material_requests.status`.
- Attachments and comments use the shared record activity surface.

### Approvals

Use one reusable approval engine instead of custom approval tables per module.

Recommended approval tables:

- `approval_requests`
- `approval_steps`
- `approval_comments`

Implemented in migration:

- `supabase/migrations/20260603075131_pymble_ops_erp_foundation.sql`

Current first-pass material request approval chain:

1. Projects Manager review
2. Procurement Manager review

Financial or urgent escalation to Managing Director is intentionally not hard-coded yet. Add approval threshold settings before activating amount-based MD escalation.

Every approval should know:

- source table
- source record id
- amount if financial
- requested by
- current step
- required role or user
- status
- approved/rejected timestamps
- comments
- attachments

Approval statuses:

- `draft`
- `submitted`
- `in_review`
- `approved`
- `rejected`
- `cancelled`
- `closed`

### Documents and Attachments

Create one document layer for all modules.

Recommended tables:

- `documents`
- `document_links`
- `document_versions`

Implemented in migration:

- `supabase/migrations/20260603075131_pymble_ops_erp_foundation.sql`

Documents should support:

- drawings
- site photos
- delivery notes
- invoices
- contracts
- PPE records
- incident photos
- test reports
- CVs
- offer letters
- signed approvals

R2 should remain private. Database rows should store object keys and metadata, not public URLs.

### Audit Trail

The existing `audit_events` table should become the full ERP audit trail.

Current migration status:

- `audit_events` now has optional `module_key`, `source_table`, `source_id`, and `summary` fields.
- `src/lib/ops/audit.ts` provides the shared server helper for future module writes.

Every create/update/approve/reject/submit/delete/archive action should write:

- actor
- action
- module
- source table
- source id
- site/project
- summary
- before/after where useful
- timestamp

### Cost Entries

Finance and Commercial need one cost bridge across modules.

Implemented table:

- `project_cost_entries`

Decision: cost entries are not a standalone planned module. They are an internal finance/commercial bridge surfaced through Project Budgets, Payment Requests, equipment costing, logistics costing, and future profitability dashboards.

Cost entries should be generated from:

- attendance/payroll
- cash advances
- material requests
- purchase orders
- goods received notes
- equipment allocation
- fuel logs
- subcontractor bills
- expenses
- BOQ actuals

Basic fields:

- `id`
- `site_id`
- `source_table`
- `source_id`
- `cost_type`
- `amount`
- `currency_code`
- `cost_date`
- `supplier_id`
- `worker_id`
- `equipment_id`
- `status`
- `created_at`

## Module Plan

### 1. Engineering

Purpose:

- control project execution
- capture daily progress
- connect site needs to Procurement and Operations
- create QA/QC and site instruction records

Features:

- daily site reports - first pass implemented with report headers, structured entries, status actions, route, record activity, migration, and tests
- site instructions - first pass implemented with draft/issued/acknowledged/closed/cancelled lifecycle
- QA/QC inspections - first pass implemented with checklist items, completion, action-required, close, and cancel controls
- material tests - first pass implemented with scheduled/submitted/passed/failed/cancelled lifecycle
- snag lists - first pass implemented with open/in-progress/resolved/verified/cancelled lifecycle
- drawing register - first pass implemented with current/superseded/archived controls
- programme milestones - first pass implemented with planned/on-track/delayed/completed/cancelled controls
- daily progress percentages
- labour productivity capture
- concrete quantities
- material consumption
- equipment utilization
- delay reporting
- site photos
- material requests
- equipment requests

Recommended tables:

- `daily_site_reports`
- `site_report_labour`
- `site_report_equipment`
- `site_report_materials`
- `site_instructions`
- `qa_inspections`
- `qa_inspection_items`
- `material_tests`
- `snag_items`
- `drawing_register`
- `programme_milestones`
- `material_requests`
- `equipment_requests`

Key workflow:

```txt
Site Engineer creates daily report
-> Project Manager reviews
-> issues become material/equipment/HSE/commercial actions
-> dashboard updates project progress, delays, productivity, and defects
```

Material request workflow:

```txt
Site Engineer raises material request
-> Project Manager reviews
-> Procurement receives request
-> Finance sees budget impact
-> Operations confirms logistics
-> approval workflow runs if needed
-> procurement continues RFQ/PO flow
```

KPIs:

- project completion percent
- delays vs baseline
- rework percent
- material wastage percent
- productivity rates
- site reporting compliance
- defects count

### 2. Procurement and Stores

Purpose:

- turn approved requests into supplier engagement, purchase orders, delivery tracking, and stock movement

Features:

- supplier database
- supplier contacts
- supplier performance
- material request inbox
- RFQs
- supplier quotes
- comparative analysis
- purchase orders
- delivery tracking
- goods received notes
- site stores
- central warehouse
- stock levels
- material coding
- barcode-ready inventory

Recommended tables:

- `suppliers`
- `supplier_contacts`
- `supplier_price_lists`
- `supplier_performance_events`
- `rfqs`
- `rfq_items`
- `supplier_quotes`
- `supplier_quote_items`
- `quote_comparisons`
- `purchase_orders`
- `purchase_order_items`
- `goods_received_notes`
- `goods_received_items`
- `inventory_locations`
- `stock_items`
- `stock_levels`
- `stock_movements`

Procurement workflow:

```txt
Site raises material request
-> Procurement receives request
-> RFQ generated
-> supplier quotes captured
-> comparative analysis done
-> approval workflow triggered
-> PO issued
-> delivery tracked
-> GRN recorded
-> stock movement and project cost entry created
```

KPIs:

- procurement lead time
- supplier delivery performance
- stock accuracy
- material shortages
- purchase savings
- procurement cycle time

### 3. Finance and Accounts

Purpose:

- control budgets, supplier payments, cashflow, project profitability, tax, payroll, and financial approvals

Features:

- project budgets
- budget lines
- budget variance alerts
- supplier payment requests
- supplier ageing
- IPC tracking
- cashflow forecasting
- expenses
- payroll integration
- loan tracking
- tax/VAT records
- project profitability
- monthly closing checklist

Recommended tables:

- `project_budgets`
- `budget_lines`
- `budget_revisions`
- `payment_requests`
- `payment_request_items`
- `supplier_bills`
- `supplier_bill_items`
- `supplier_ageing_snapshots`
- `cashflow_forecasts`
- `cashflow_forecast_lines`
- `expenses`
- `expense_items`
- `loans`
- `loan_payments`
- `tax_records`
- `financial_periods`
- `month_end_tasks`

Budget check workflow:

```txt
PO or payment request reaches Finance
-> Finance checks project budget
-> variance warning appears if over budget
-> payment approval starts
-> MD approves only above configured thresholds
-> approved payment updates cashflow and supplier ageing
```

KPIs:

- cashflow forecast accuracy
- supplier ageing
- project gross margin
- payment turnaround
- budget variance
- outstanding receivables
- monthly financial closing speed

### 4. Operations and Fleet

Purpose:

- coordinate equipment, fleet, fuel, transport, labour deployment, accommodation, and site logistics

Features:

- equipment register
- equipment requests
- equipment allocation calendar
- fuel requests
- fuel consumption logs
- fleet maintenance
- labour allocation
- transport requests
- accommodation logistics
- mobilization planning

Recommended tables:

- `equipment`
- `equipment_categories`
- `equipment_requests`
- `equipment_allocations`
- `fuel_requests`
- `fuel_logs`
- `maintenance_jobs`
- `maintenance_job_items`
- `transport_requests`
- `vehicle_trips`
- `accommodation_bookings`
- `labour_allocations`

Equipment workflow:

```txt
Engineering requests equipment
-> Operations schedules equipment
-> Fleet tracks fuel and maintenance
-> allocation creates project equipment cost entries
-> Finance sees equipment costs automatically
```

Fleet logistics workflow:

```txt
Site team requests transport, accommodation, or labour allocation
-> Operations/HR confirms the schedule
-> active logistics records expose committed project cost
-> completion posts actual transport, accommodation, or labour cost
```

KPIs:

- equipment uptime
- fuel consumption
- fleet maintenance compliance
- labour utilization
- mobilization efficiency

### 5. HSE

Purpose:

- manage health, safety, environment, incident traceability, PPE, inspections, training, and compliance documentation

Features:

- incident reports
- near misses
- incident photos
- investigations
- corrective actions
- PPE tracking
- toolbox talks
- site inspections
- compliance audits
- risk assessments
- safety training records

Recommended tables:

- `hse_incidents`
- `incident_investigations`
- `incident_actions`
- `ppe_items`
- `ppe_issues`
- `toolbox_talks`
- `toolbox_talk_attendees`
- `hse_inspections`
- `hse_inspection_findings`
- `risk_assessments`
- `risk_assessment_controls`
- `compliance_audits`
- `safety_training_records`

Incident workflow:

```txt
Incident occurs
-> logged immediately with photos
-> investigation assigned
-> corrective actions created
-> actions tracked to closure
-> audit trail retained for client compliance
```

KPIs:

- LTIFR
- near misses
- PPE compliance
- safety training completion
- audit scores
- overdue corrective actions

### 6. Admin and HR

Purpose:

- manage recruitment, employee records, contracts, leave, attendance compliance, appraisals, HR documents, and accommodation coordination

Features:

- employee records
- recruitment requisitions
- applications/CVs
- interview scoring
- offer letters
- contracts
- leave requests
- staff attendance compliance
- performance appraisals
- HR document storage
- accommodation complaints/coordination

Recommended tables:

- `employees`
- `employee_contracts`
- `recruitment_requisitions`
- `leave_requests`
- `leave_balances`
- `performance_appraisals`
- `hr_document_categories`
- `job_applications`
- `interview_scores`
- `offer_letters`
- `hr_documents`
- `staff_accommodation_requests`

Recruitment workflow:

```txt
Vacancy raised
-> HR approves requisition
-> CVs uploaded
-> interview scoring tracked
-> offer letter generated
-> employee record created
-> optional user account created if system access is required
```

KPIs:

- staff turnover
- recruitment turnaround
- attendance compliance
- performance appraisal completion
- staff productivity

### 7. QS and Commercial

Purpose:

- control BOQs, project costing, IPCs, valuations, variations, claims, contracts, margin, and cashflow impact

Features:

- BOQ management
- cost planning
- IPC applications
- valuations
- variations
- claims
- contract register
- contract milestones
- budget accuracy
- project margin tracking

Existing foundation:

- `boq_documents`
- `boq_line_items`
- `invoices`
- `commercial_ipcs`
- `commercial_variations`
- `commercial_claims`

Recommended tables:

- `contracts`
- `contract_milestones`
- `ipc_lines`
- `valuations`
- `valuation_lines`
- `variation_items`
- `claim_items`
- `commercial_risk_register`

Commercial workflow:

```txt
QS creates valuation or IPC
-> Project Manager verifies work progress
-> Finance reviews receivable/cashflow impact
-> MD approves if above threshold
-> invoice generated or linked
-> dashboard updates receivables and margin
```

KPIs:

- gross profit percent
- variation recovery percent
- cost variance
- IPC turnaround
- budget accuracy
- claims recovery

### 8. Executive

Purpose:

- give MD/GM summary visibility without daily operational calls

Features:

- MD dashboard
- GM dashboard
- approval inbox
- delayed projects
- cashflow summary
- outstanding receivables
- supplier liabilities
- equipment utilization
- profitability by project
- staff productivity
- HSE risk summary
- procurement bottlenecks

Recommended database approach:

- SQL views or RPC snapshots for dashboards
- avoid loading raw tables directly for executive dashboard
- include date-range filters and department filters

Executive dashboard data sources:

- sites/projects
- daily reports
- approval requests
- cashflow forecasts
- payment requests
- invoices/IPCs
- purchase orders
- equipment allocations
- HSE incidents
- attendance/payroll

## Permission Model

Permissions should be formalized after module foundation, but all design should assume role-based boundaries.

Current roles:

- Developer
- Managing Director
- General Manager
- Human Resource
- Operations Manager
- Projects Manager
- Procurement Manager
- Quantity Surveyor
- Procurement
- Procurement Assistant
- Finance Manager
- Accountant
- Engineer
- HSE Officer
- HSE Assistant Officer
- Admin / Receptionist

Recommended permission layers:

| Layer | Roles | Access Pattern |
| --- | --- | --- |
| System | Developer | System maintenance, hidden from normal staff registers |
| Executive | Managing Director, General Manager | All dashboards, high-level approvals, cross-department visibility |
| Department Manager | Finance Manager, Procurement Manager, Operations Manager, Projects Manager, Human Resource | Manage own domain and approve own department workflows |
| Department Staff | Accountant, Procurement, Procurement Assistant, Engineer, Quantity Surveyor, HSE roles, Admin | Create and update own department records |
| Read-only/limited | Future viewer roles if needed | Reports and assigned records only |

Best practice:

- keep permission checks server-side
- keep RLS enabled
- use app-level checks for workflows and UI visibility
- never authorize sensitive actions from client-only logic
- never base authorization on user-editable metadata

### Module Visibility Strategy

Module visibility is not the same thing as final permission control. It has four layers:

| Layer | Purpose | Current Source |
| --- | --- | --- |
| Route access | Determines whether a role may open an implemented route | `roles` on `OPS_MODULES` |
| Sidebar visibility | Determines which live work modules appear in daily navigation | `navigationRoles` and `showInNavigation` on ready modules |
| Roadmap visibility | Determines which planned modules appear on `/ops/modules` for a role | `roles` on planned modules |
| Action permissions | Determines create/edit/approve/archive/export/admin powers | Future permission matrix |

Sidebar behavior:

- The sidebar should show only live modules relevant to the logged-in role.
- The sidebar should group those modules under Operations, Commercial, and Records.
- The sidebar should not include `/ops/modules`; the module registry is a system/planning surface, not a daily work module.
- Planned modules must not appear as sidebar links.
- Developer has an explicit system override and should see every live module route plus every planned module in the registry.
- Managing Director and General Manager should see broad management visibility according to their role privileges, but they are not the technical override account.
- Department roles should see their own live work area plus shared modules such as Approvals, Notifications, Documents, Sites, or Photos where those modules are operationally relevant.

`/ops/modules` behavior:

- Show `Your workspace` first, grouped by Operations, Commercial, and Records.
- Show a role-specific `Role roadmap` for planned modules relevant to the logged-in role.
- Developer should see the full company roadmap regardless of department role mappings.
- Managing Director and General Manager should see the company roadmap needed for executive oversight.
- Department users should not see every future module unless their role needs it.
- This page can be linked from system/admin surfaces, but should not be treated as ordinary navigation.

This strategy keeps the interface focused while preserving the full architecture roadmap for leadership and system planning.

## Cross-Module Workflows

### Material Request to Payment

```txt
Engineer creates material request
-> Project Manager reviews
-> Procurement creates RFQ
-> suppliers quote
-> Procurement compares quotes
-> Finance checks budget
-> approval engine decides approvers
-> PO issued
-> delivery tracked
-> GRN recorded
-> supplier bill/payment request created
-> cost entry hits project cost
-> dashboard updates procurement, finance, and project KPIs
```

### Equipment Request to Cost

```txt
Engineer creates equipment request
-> Operations schedules equipment
-> allocation calendar updates
-> fuel logs and maintenance linked
-> cost entries generated
-> project margin reflects equipment cost
```

### Incident to Corrective Action

```txt
HSE logs incident
-> photos/documents attached
-> investigation assigned
-> corrective actions created
-> responsible users update actions
-> HSE manager closes action
-> executive dashboard tracks overdue/high-risk items
```

### IPC to Invoice

```txt
QS prepares IPC
-> Project Manager validates progress
-> Finance reviews receivable and cashflow
-> MD/GM approval if threshold requires it
-> invoice generated or linked
-> receivables dashboard updates
```

## Database Best Practices

- Use UUID primary keys.
- Use `created_at`, `updated_at`, and soft archive fields where records should not be deleted.
- Use enum/check constraints for statuses.
- Add indexes for `site_id`, `status`, `created_at`, `requested_by`, and approval lookup fields.
- Use foreign keys for cross-module links.
- Keep RLS enabled on all exposed tables.
- Prefer append-only history for approvals and audit events.
- Use RPC/dashboard snapshots for heavy executive screens.
- Store files in R2 and metadata in Supabase.
- Keep service-role use server-only.
- Avoid company/tenant columns unless a future requirement explicitly changes the single-company architecture.

## API and Server Action Best Practices

- Keep module writes in server actions or API routes only.
- Validate every payload with schemas before database writes.
- Re-check permissions in server actions.
- Write audit events after successful state changes.
- Keep user-facing error text operational and non-technical.
- Revalidate affected routes after writes.
- Avoid exposing service-role clients to browser bundles.

## Reporting and KPI Strategy

Each module should define:

- operational table data
- dashboard summary view/RPC
- KPI definitions
- filters
- date range behavior
- role visibility

Priority KPI snapshots:

- `ops_overview_snapshot`
- `engineering_dashboard_snapshot`
- `procurement_dashboard_snapshot`
- `finance_dashboard_snapshot`
- `operations_dashboard_snapshot`
- `hse_dashboard_snapshot`
- `hr_dashboard_snapshot`
- `commercial_dashboard_snapshot`
- `executive_dashboard_snapshot`

## Implementation Roadmap

### Phase 0: Production Robustness Baseline

Status: Live baseline, pending external production sign-off

Deliverables:

- production env variable checklist - implemented in `docs/pymble-ops-production-launch-checklist.md` and `npm run ops:readiness`
- deployment rollback checklist - documented in `docs/pymble-ops-production-launch-checklist.md`
- Supabase backup confirmation checklist - documented; dashboard confirmation still required before launch
- R2 access and bucket policy checklist - documented; dashboard confirmation still required before launch
- error monitoring setup - Sentry env requirements documented and checked
- health checks for database/storage/auth readiness - protected readiness mode implemented at `/api/ops/health?mode=readiness`
- final role permission matrix - implemented in `src/lib/ops/role-policy.ts`, `docs/pymble-ops-role-permission-matrix.md`, and regression tests
- real workflow UAT plan - implemented in `docs/pymble-ops-uat-plan.md`
- shared audit helper
- shared permission helper coverage
- server action validation standard
- migration verification standard
- basic test harness for high-risk server actions - expanded shared workflow coverage implemented

Why before/alongside Phase 1:

- ERP workflows will quickly become business-critical
- approvals, finance, payroll, procurement, and HSE need traceability from the start
- production confidence depends on backups, observability, and recoverable failures

### Phase 1: Shared ERP Foundation

Status: In progress

Deliverables:

- shared approval engine - database foundation implemented
- shared documents/attachments - database foundation implemented
- shared comments - database foundation implemented
- stronger audit event helper - helper implemented
- shared notification records - database foundation implemented
- approval inbox UI - first pass implemented
- document library upload/download UI - first pass implemented
- document approval request and decision workflow - first pass implemented
- document current-version loading optimization - first pass implemented
- document version replacement and archive controls - first pass implemented
- record-specific attachment and comment surfaces for sites, BOQs, invoices, material requests, and suppliers - first pass implemented
- notification sidebar count - first pass implemented
- notification panel with read/archive filtering - first pass implemented
- reusable comment timeline - first pass implemented
- role-aware module registry with groups and status - first pass implemented
- focused tests for module visibility, approval decision guards, document mutation/download guards, record activity validation, notification acknowledgement helpers, notification return paths, listing helpers, and upload validation - expanded coverage implemented
- server-side search and pagination for Documents, Approvals, Sites, BOQ, and Invoices - first pass implemented
- dashboard snapshot pattern - shared helper implemented and applied to Overview
- design system documentation

Why first:

- every later module needs approvals, documents, audit trail, and notifications
- this prevents repeated custom workflow logic

### Phase 2: Engineering and Procurement

Status: Live first pass

Deliverables:

- daily site reports
- site instructions and QA/QC controls - first pass implemented with instructions, QA inspections, checklist items, material tests, snag lists, drawing register, programme milestones, lifecycle controls, attachments/comments, migration, and tests
- material requests - first pass implemented with draft line items, approval submission, status sync, notifications, and record activity
- equipment requests
- supplier database - first pass implemented with supplier/contact tables, performance events, role-aware route, status controls, attachments/comments, migration, and tests
- RFQs - first pass implemented with RFQ package register, item lines, active supplier invitations, quote totals, attachments/comments, migration, and tests
- quote comparisons - first pass implemented with received quote totals and lowest-quote summary per RFQ
- purchase orders - first pass implemented by awarding a received quote into a draft purchase order, submitting draft/rejected POs for threshold-backed approval, and issuing approved POs
- delivery tracking - first pass implemented through GRN records against issued POs
- GRNs - first pass implemented with stock receipt movement and PO receipt status sync
- stores inventory - first pass implemented with stock locations, stock items, stock levels, and movement history

Why second:

- this solves the most urgent site-to-procurement bottleneck
- it creates data for Finance and Operations

### Phase 3: Finance Bridge

Status: In progress

Deliverables:

- project budgets
- budget lines
- budget checks
- payment requests
- supplier ageing dashboards (live first pass)
- cashflow forecast dashboard (live first pass)
- budget variance dashboard (live first pass)
- project cost entries
- project profitability dashboard

Why third:

- finance needs procurement and site data to calculate real project cost

### Phase 4: Operations and Fleet

Status: In progress

Deliverables:

- equipment register
- equipment allocation
- fuel logs
- maintenance jobs
- transport requests
- dispatch calendar and vehicle/operator assignment
- transport usage variance
- accommodation logistics
- labour allocation

Why fourth:

- it connects engineering needs with equipment/fuel/labour cost

### Phase 5: HSE and HR

Status: In progress

Deliverables:

- incident reporting (live first pass)
- corrective actions (live first pass)
- PPE records (live maturity pass with stock master and issue lifecycle)
- toolbox talks (live maturity pass with attendee capture)
- inspections (live maturity pass with findings and verification lifecycle)
- safety training records (live maturity pass)
- risk assessments (live maturity pass)
- compliance audits (live maturity pass)
- critical HSE email delivery observability (live maturity pass)
- employee records (live first pass)
- recruitment (live first pass)
- leave requests (live first pass)
- contracts (live first pass)
- appraisals (live first pass)
- leave balances (live first pass)
- HR document categories and employee document self-service (live maturity pass)
- employee onboarding checklist (live maturity pass)
- HSE-to-HR training renewal watch (live maturity pass)

Why fifth:

- compliance and HR workflows benefit from shared documents, approvals, and audit trail

### Phase 6: QS and Commercial Maturity

Status: Live forecasting pass

Deliverables:

- IPC applications (live first pass)
- valuations (live first pass)
- variations (live first pass)
- claims (live first pass)
- contracts (live first pass)
- commercial risk register (live first pass)
- certified IPC-to-draft-invoice handoff (live first pass)
- project margin watch from contracts, approved variations, agreed claims, valuation lines, and cost entries (live first pass)
- retention release register and lifecycle (live forecasting pass)
- cashflow forecast periods and status controls (live forecasting pass)
- contract milestone forecasting with billing/retention triggers (live forecasting pass)
- deeper budget variance reporting remains connected to the finance bridge

Why sixth:

- this depends on project cost, BOQ, procurement, invoice, and progress data

### Phase 7: Executive Dashboard

Status: Live first pass

Deliverables:

- MD/GM dashboard at `/ops/executive` - live first pass
- leadership-only route/module visibility for Developer, Managing Director, and General Manager aliases - live first pass
- approval backlog and high-priority approval pressure - live first pass
- cashflow dashboard with receivables, payables, next-30 net, and budget exposure - live first pass
- receivables and supplier liability summary through finance/payment request signals - live first pass
- profitability by project through commercial margin and budget variance snapshots - live first pass
- equipment utilization and maintenance pressure summary - live first pass
- staff productivity/readiness proxy through HR onboarding, leave, employee, and training signals - live first pass
- HSE risk summary on Overview and Executive - live first pass
- procurement, delivery, fleet, engineering, and people bottleneck panels - live first pass
- source-health fallback handling for recoverable schema/source availability issues - live first pass
- future SQL/RPC snapshot optimization once executive traffic and source volume justify it

Why seventh:

- executive dashboard should summarize mature module data rather than invent its own records

## Module Status Tracker

| Module | Status | Current Notes | Next Step |
| --- | --- | --- | --- |
| Overview | Live role-dashboard pass | Role-specific dashboard compositions for Executive, Site Delivery, Procurement, Commercial/QS, Finance, HSE, and People/HR with personalized greeting, live KPI cards, role CTAs, action queues, source-linked panels, map where relevant, and role shortcuts | Move heavier role metrics into SQL/RPC snapshots if production volume makes `/ops` slow; add saved widgets only after usage patterns settle |
| Staff | Live foundation | Needs final permission model | Continue linking staff users to employee records during HR maturity |
| Sites | Live foundation | Confirmed as the project/site master anchor for this ERP phase; every department should link records through `site_id` where project/site context exists | Add richer project metadata and code-standard polish before considering a parent `projects` table |
| Workers | Live foundation | Crew/payroll focused | Link to employees later |
| Attendance | Live foundation | Feeds payroll | Add filters, mobile refinements, reporting |
| Payroll | Live foundation | Basic payroll loop | Add finance integration and reports |
| BOQ | Live foundation | BOQ register with ERP module layout, KPI cards, visible commercial values, BOQ-to-invoice flow summary, collapsed BOQ creation, collapsed line-item intake, mobile/table line-item views, service-client server reads after route permission guard, and record activity | Add commercial contracts/IPCs/variations |
| Invoices | Live foundation | Invoice register with ERP module layout, status KPI counts, visible-value summary, collapsed creation panel, confirmed draft/sent/paid transitions, BOQ/site/TPIN fields, attachments/comments, and server-side pagination/search | Link to IPCs, receivables, and future payment/cashflow workflows |
| Photos | Live foundation | R2 metadata records | Fold into shared documents layer |
| Settings | Live foundation | Organization profile, headquarters, invoice defaults, and PO approval threshold control | Add more module settings as workflows mature |
| Shared ERP Foundation | In progress | Approval, document, comment, notification, audit schema/helpers, approval inbox/detail, document approval workflow, PO approval threshold settings, optimized document current-version loading, document version replacement and archive controls, record-specific attachments/comments for sites/BOQs/invoices/material requests/suppliers/RFQs/GRNs/daily site reports/delivery exceptions, sidebar notification count, notification panel, role-aware module registry, comment timeline, expanded focused workflow guard tests, server-side pagination/search, shared dashboard snapshot helper, timeout-guarded proxy session refresh, ERP workspace layout direction, light shell, top utility bar, dashboard primitives, branded ops SVG mark/loading states, supplier layout pass, invoice layout pass, RFQ/PO layout pass, Stores layout pass, approval inbox layout pass, material request layout pass, and BOQ layout/performance pass added | Apply the new layout language to remaining high-traffic module pages as each workflow matures |
| Material Requests | Live first pass | Draft request + line items, role-aware route, shared approval submission, status sync, notifications, attachments/comments, ERP module layout with KPI cards, visible request values, material-flow summary, collapsed creation panel, migration and tests added | Add edit/cancel/resubmit detail workflow and connect Procurement RFQ/PO |
| Daily Site Reports | Live first pass | Report headers, structured entries, draft/submitted/reviewed/closed status actions, record activity, module registry route, migration, guard tests, and local authenticated route verification added | Link reports to equipment/HSE/commercial follow-up actions |
| Suppliers | Live first pass | Supplier/contact register, role-aware route, active/on-hold/archive controls, recent performance events, ERP module layout with KPI cards and collapsed creation panel, attachments/comments, migrations and tests added | Connect performance events to GRN exceptions and payment workflows |
| RFQs and Purchase Orders | Live first pass | RFQ package register with ERP module layout, upstream material-request/supplier action links, KPI cards, visible procurement values, flow summary, collapsed RFQ creation, line items, active supplier invitations, quote totals, lowest quote summary, quote award action, draft PO creation, threshold-backed PO approval submission, approval sync, PO issue action, attachments/comments, migration and tests added | Add quote item detail and supplier-side communication controls |
| Stores and Inventory | Live first pass | ERP module layout with title actions, KPI cards, inventory-flow summary, live stock state panels, collapsed GRN receiving, collapsed master-data controls, stock issue/transfer/adjustment controls, GRN register, GRN-to-exception shortcuts, attachments/comments, migrations and tests added | Add barcode-ready item codes |
| Delivery Exceptions | Live follow-up pass | Exception register, status lifecycle, severity/type filters, GRN/PO/supplier/site links, posted-GRN shortcut strip, GRN-prefilled creation, exception ageing alerts, supplier follow-up dashboard, supplier performance handoff on resolution, record activity support, module registry route, migration, guard/reporting tests, and local route verification added | Add supplier communication tasking and configurable delivery SLA thresholds |
| Engineering | Live maturity pass | Material requests, daily site reports, site instruction register, instruction follow-up task handoff, QA inspections with categorized checklist findings, material tests, snag list, drawing register with exact document-version links, programme milestones, programme pressure dashboard, equipment request links, project/site anchoring, record activity, migrations, and guard/reporting tests added | Add drawing transmittals, instruction-to-procurement/equipment shortcuts, and richer programme dependencies |
| Procurement | In progress | Receives material requests through shared approvals, has supplier master data, supplier performance events, RFQ/PO first pass, PO approval/issue controls, stores/GRN first pass, stock controls, delivery exception controls, and payment request handoff | Add deeper supplier ageing and PO-to-payment dashboards |
| Finance | Live reporting pass | Project budget register, budget lines, draft/active/locked/archive lifecycle, payment request register, submit/review/approve/reject/pay/cancel lifecycle, committed/posted project cost entries as an internal bridge, payables ageing dashboard, cashflow signal, active budget variance dashboard, record activity support, module registry routes, migration, and guard/reporting tests added | Add supplier follow-up from aged payables and deeper project profitability snapshots |
| Operations/Fleet | Live maturity pass | Equipment categories, equipment register, equipment requests, allocation lifecycle, fuel logs, maintenance jobs, maintenance cost-entry handoff, equipment utilization dashboard, maintenance pressure dashboard, transport request lifecycle, dispatch calendar, vehicle/operator assignment detail, trip planning attention, transport usage variance reports, accommodation bookings, labour allocations, site mobilization planning, driver/operator document expiry watch, fleet profitability snapshot, project cost handoff, record activity support, module registry routes, migrations, and guard/reporting tests added | Add deeper route optimization and route performance benchmarking once transport volume builds |
| HSE | Live maturity pass | Incident register, severity/status filters, investigation/action-required/close/cancel controls, corrective action creation and verification, PPE stock master, PPE issue register with stock linkage, toolbox talks with attendee capture, HSE inspections with findings and verification lifecycle, safety training records with completion/expiry tracking, risk assessments, compliance audits, incident ageing alerts, executive safety rollup, protected scheduled escalation sweep, risk heatmap, audit escalation watch, automated HSE inbox alerts for incidents, corrective actions, risk review, high residual risk, assigned audits, audit non-conformances, audit actions, training renewal escalation notifications, critical HSE email delivery, delivery-attempt observability, 7-day email health trend, executive trend snapshots, HR renewal handoff, record activity support, module registry routes, cron config, migrations, and guard/reporting/notification tests added | Add deeper executive trend charts once incident and alert volume matures |
| HR | Live maturity pass | Employee register, staff-user link, status control, leave request intake, submit/approve/reject/cancel/complete lifecycle, recruitment requisitions, employee contracts, performance appraisals, leave balances, HR document categories, private employee document uploads, document review/archive controls, required-document coverage dashboard, onboarding checklist lifecycle, HR action queue, workforce signal panel, HSE training renewal watch with guarded HSE handoff links, profile-based employee self-service, own leave request submission, own HR document upload/download access, record activity support, module registry route, migrations, and guard/reporting tests added | Add HR absence calendar, deeper department dashboards, and employee document renewal notifications |
| Commercial | Live forecasting pass | IPC register, variation register, claims register, commercial contracts, editable line-level valuations, commercial risk register, project margin watch from commercial revenue and project cost entries, retention releases, cashflow forecasts, enriched contract milestone forecasting, certified IPC-to-draft-invoice handoff, lifecycle controls, record activity support, module registry route, migrations, and guard/reporting tests added | Start Executive dashboards once commercial and finance snapshots settle |
| Executive | Live first pass | Dedicated `/ops/executive` route now summarizes approvals, cashflow, budget exposure, commercial margin/forecast, project profitability, HSE pressure, procurement/delivery bottlenecks, fleet mobilization, equipment utilization, HR readiness, engineering pressure, source health, and executive shortcuts for Developer/MD/GM roles without adding a new table | Move heavy executive reads to SQL/RPC snapshots once production source volume or page timing requires it |

## Strategic Decisions

1. `sites` remains the project/site master table for this ERP phase. Every operational, commercial, finance, HSE, HR, fleet, and procurement record should link to `site_id` when the work belongs to a project/site. Add a parent `projects` table only if Pymble later needs one contract to contain multiple separately managed sites/phases.
2. MD approval should be threshold-based, not required on every operational request. Keep the current configurable PO threshold as the first control, defaulting to ZMW 50,000 with Managing Director review at or above the threshold. Extend the same threshold setting pattern to payment requests, variations, claims, and high-value budget movements as those workflows mature.
3. Material requests should stay operational first: Site/Engineering creates, Projects/Operations reviews, Procurement converts to RFQ/PO. Finance checks budget at PO/payment stage. QS joins when the request affects BOQ scope, valuation, variation, or commercial recovery. GM/MD escalation should happen by configured threshold or exceptional category, not by default for every request.
4. Procurement remains internal-only for now. Supplier portal access should wait until internal RFQ, PO, delivery, exception, payment, and supplier performance workflows are stable. Until then, supplier communication should be handled through internal tasks, email evidence, and document uploads.
5. HR should create an `employees` record for every staff user once HR onboarding rules are active. Keep `users` as login/access records, `employees` as HR employment records, and `workers` as site labour records. Link user-to-employee and worker-to-employee where applicable instead of merging the models.
6. Version-controlled documents should include drawings, contracts, BOQs, IPCs, valuations, variations, claims, HSE compliance records, employee contracts, HR policies, and major commercial/finance approvals. Photos, receipts, delivery proof, and one-off evidence should usually be attachments with audit trail rather than formal controlled-document versions.
7. Use a formal code standard. Recommended defaults: sites/projects `PCL-PRJ-YYYY-###`, materials `MAT-CATEGORY-###`, equipment `EQ-CATEGORY-###`, suppliers `SUP-YYYY-###`, RFQs `RFQ-YYYYMMDD-###`, POs `PO-YYYYMMDD-###`, payment requests `PAY-YYYYMMDD-###`, and incidents `HSE-YYYYMMDD-###`. Existing generated codes can remain, but new migrations/UI should move toward readable, sortable codes.

## Next Implementation Recommendation

Continue module coverage before deeper polish:

1. Add deeper Fleet route optimization and route performance benchmarking once transport volume builds.
2. Add Engineering drawing transmittals, instruction-to-procurement/equipment shortcuts, and richer programme dependencies.
3. Add HR absence calendar, department dashboards, and employee document renewal notifications.
4. Add deeper HSE executive trend charts once incident and alert volume matures.
5. Move heavy Executive reads to SQL/RPC snapshots if live source volume makes `/ops/executive` slow.
6. Return to layout polish for Sites, Documents, Workers, Attendance, Payroll, Photos, Engineering Controls, and any first-pass module that still feels form-first.

The Engineering -> Procurement -> Finance -> Fleet -> HSE -> HR -> Commercial -> Executive workflow now has material requests, daily site reports, site instructions, instruction follow-up tasks, categorized QA checklist findings, material tests, snag lists, drawing register records with exact document-version links, programme milestones, programme pressure dashboards, supplier master data, supplier performance events, RFQs, quote totals, draft POs, PO approval submission, PO issue controls, GRN receipt, GRN-to-exception shortcuts, stock balances, movement history, first-pass stock control, delivery exception lifecycle, exception ageing alerts, supplier follow-up dashboard, project budgets, payment requests, committed/posted cost entries, payables ageing, cashflow signal, active budget variance reporting, equipment requests, equipment allocations, equipment utilization, maintenance pressure, fuel logs, maintenance jobs, maintenance cost posting, transport requests, dispatch calendar, vehicle/operator assignment, trip planning attention, transport usage variance, accommodation bookings, labour allocations, site mobilization planning, driver/operator document expiry watch, fleet profitability snapshots, HSE incident/action lifecycle, PPE stock master, PPE issues with stock linkage, toolbox talks with attendees, inspections with findings, safety training records, risk assessments, compliance audits, incident ageing alerts, executive safety rollup, Overview HSE safety pressure and trend snapshots, protected scheduled cross-module escalation sweep, protected scheduled HSE escalation sweep, dashboard stale-work signals, critical HSE email delivery with delivery-attempt health tracking, risk heatmap, audit escalation watch, HSE inbox alerts, training renewal escalation notifications, employee records, profile employee self-service, own leave request submission, own HR document upload/download access, onboarding checklist lifecycle, HR action queue, workforce signal panel, HR document coverage dashboard, HR document review/archive controls, HSE training renewal watch, guarded HSE training handoff links, leave request lifecycle, recruitment requisitions, employee contracts, performance appraisals, leave balances, HR document categories, private employee document assignments, commercial contracts, editable line-level valuations, commercial margin watch, IPCs, variations, claims, commercial risk register, retention releases, cashflow forecasts, contract milestone forecasting, certified IPC-to-draft-invoice handoff, executive approval/cashflow/project/HSE/procurement/fleet/HR/engineering summaries, supplier layout convergence, invoice layout convergence, RFQ/PO layout convergence, Stores layout convergence, approval inbox layout convergence, material request layout convergence, and BOQ layout convergence. The next practical step is to deepen Fleet route intelligence, Engineering, HR, and executive performance/reporting once live records build up.
