# Pymble Operations — Production deployment checklist

Last updated: 2026-06-17 (end of Sprint 5)

## Pre-deploy verification (already green)

- [x] TypeScript: `npx tsc --noEmit` — clean
- [x] ESLint: `npx eslint .` — clean
- [x] Unit + integration tests: `node --import tsx --test tests/*.test.ts` — **168 / 168 passing**
- [x] Production build: `npx next build` — succeeds, 73 routes emitted including every `/ops/*` route added in Sprints H–S5

## Supabase migrations to confirm in production

All applied to dev (`zuezxgyhhrhklrhqsvvs`) via Supabase MCP and mirrored in `supabase/migrations/`. Verify each is present in your production project before cutting over:

| Migration | Purpose |
|-|-|
| `20260616120000_pymble_ops_material_request_pricing_flow` | `pricing_pending` and `priced` enum values |
| `20260616120100_pymble_ops_material_request_pricing_tables` | Per-line actual unit cost + auto-computed totals |
| `20260617090000_pymble_ops_archive_columns` | `archived_at` / `archived_by` on BOQ + Material Requests |
| `20260618090000_pymble_ops_archive_columns_phase_j` | Archive columns on invoices, payment_requests, daily_site_reports, payroll_runs |
| `20260619090000_pymble_ops_hse_weekly_reports` | `hse_weekly_reports` table + status enum + RLS |
| `20260620090000_pymble_ops_record_comment_mentions` | `mentioned_user_ids uuid[]` + GIN index on `record_comments` |
| `20260621090000_pymble_ops_realtime_publications` | Publish key tables to `supabase_realtime` |
| `20260622090000_pymble_ops_archive_columns_j2_backlog` | Archive columns on workers, attendance, equipment, equipment_requests, GRN, site_instructions |
| `20260623090000_pymble_ops_per_item_supplier` | Per-line `supplier_id` + `supplier_name_freeform` on MR items, BOQ lines, PO items |
| `20260624090000_pymble_ops_rfq_item_supplier` | Same per-item supplier columns on rfq_items |

To apply all at once in production (after backing up): `npx supabase db push` against the production project, or apply each `supabase/migrations/*.sql` file in order via your standard migration runner.

## Required environment variables

Confirm all present in the production runtime:

- `NEXT_PUBLIC_SUPABASE_URL` — production Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — anon key (browser, RLS-enforced)
- `SUPABASE_SERVICE_ROLE_KEY` — service role key (server only, bypasses RLS)
- All R2 / S3 storage env vars used by `src/lib/ops/r2.ts`
- Resend / email env vars for notification fan-out

## Supabase Realtime smoke check

After deploy, in the Supabase dashboard:
1. Open **Database → Publications** and confirm `supabase_realtime` includes: `notifications`, `approval_requests`, `record_comments`, `boq_documents`, `material_requests`, `invoices`, `payment_requests`, `daily_site_reports`, `hse_incidents`, `hse_weekly_reports`.
2. Open two browser tabs as the same user. In tab A, mention yourself in a comment. Tab B should auto-refresh within ~500ms and surface the mention badge on **My Conversations**.
3. From a procurement role, submit a Material Request. A leadership tab should auto-refresh and show the new approval on `/ops/approvals` without manual reload.

## Functional smoke checks (run as Managing Director or Developer)

These cover the surfaces that changed most in Sprints H–S5:

1. **Login** — visit `/login`, confirm password reveal eye button works, sign in
2. **Sidebar badges** — confirm unread Notifications and **My Conversations** counts appear when there are unread items
3. **Material Request → per-item supplier** — create a Material Request with two lines: one supplier from the master list, one typed free-text name. Submit it. Confirm both supplier values appear on the row pills.
4. **Bill of Quantities file import** — try uploading a `.xlsx` form-style sheet (Item No, Quantity, Unit of Measure, Description, Unit Price, Total, Supplier Name). Verify all lines import; supplier matches against master list with fallback to free-text.
5. **Bill of Quantities CSV** — repeat with `.csv`. Confirm column aliasing accepts "Unit Price (K)", "Supplier Name", etc.
6. **RFQ → Convert to Purchase Orders** — create an RFQ with lines from two different suppliers. Click "Convert to Purchase Orders". Verify one draft PO per supplier; verify the action errors clearly if a line has only a free-text supplier (must be added to master list).
7. **Idempotent submissions** — rapidly double-click a submit button. The form should fire once. Confirm via Supabase logs.
8. **Approval tab counts** — confirm per-department open-count badges show on `/ops/approvals` tabs.
9. **Glossary** — visit `/ops/glossary`; confirm 16 terms grouped into 6 categories.
10. **Realtime auto-refresh** — leave a Material Requests page open in one tab; in another tab create a new MR; the first tab should auto-refresh within ~500ms.

## Workflow notes for the team

- The system **no longer sends supplier invitations** for an RFQ. Suppliers are nominated per item internally, and Convert to Purchase Orders bundles them.
- Per the per-item supplier model, a single Material Request can have lines from multiple suppliers — pick from the master list or type a new name. Free-text names are saved as `supplier_name_freeform`. Before converting an RFQ to PO, free-text suppliers must be added to the supplier master list (the system reports which ones).
- The glossary page (`/ops/glossary`) explains every abbreviation. The UI itself now uses full forms (Bill of Quantities, Request for Quotation, Personal Protective Equipment, etc.) — abbreviations remain only inside the Glossary entry headings as identifiers.
- Workspace timeline (overview activity feed) is now role-scoped. Each role sees a different subset of `module_key`-tagged events.
- Notifications use a multi-audience fan-out with a fallback chain. Even with the Projects Manager / Finance Manager / GM seats unfilled, every notification eventually reaches the Managing Director + Developer.

## Build warnings (not blocking)

- `next/font: Failed to fetch Geist from Google Fonts` — intermittent on sandboxed CI. The build still completes and routes are emitted. In production CI/CD, this resolves once outbound fetch to `fonts.googleapis.com` is unblocked.

## Residuals (post-deploy improvements — not blocking)

- `OpsPageHeader` rollout still pending on: sites, payroll, fleet-logistics, project-budgets, delivery-exceptions, recruitment, executive, employees, workers, attendance, photos, documents, settings, staff, stores-inventory, profile, notifications, engineering-controls, commercial, modules. Pattern is set on the high-traffic 6 pages — sweep mechanically when next touching each page.
- `OpsEmptyState` rollout still pending on: HSE incidents, HSE compliance, suppliers, payroll, recruitment, employees, projects/sites, stores-inventory, equipment, fleet-logistics, executive. Same pattern; sweep opportunistically.
- Per-row Edit/Archive UI buttons still pending on: workers, attendance, site_instructions, equipment_requests, GRN. The server actions all exist; only the per-row form buttons remain.
- Phase L (site scoping at RLS level) — deferred until org seats are filled (Projects Manager, Finance Manager, GM, QS, Accountant).

None of these block production usage — they are visual / UX polish on top of fully functional flows.
