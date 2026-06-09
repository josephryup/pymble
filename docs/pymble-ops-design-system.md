# Pymble Operations Design System

Last updated: 2026-06-08

This document defines the design and UX standards for the Pymble Operations system. Update it whenever shell layout, navigation, forms, tables, cards, status colors, copy rules, or shared components change.

The operations UI is an internal ERP workspace. It should feel practical, fast, dense, and trustworthy. It should not feel like a marketing site.

## Design Principles

- Build the actual work surface first. Avoid landing-page patterns inside `/ops`.
- Keep layouts calm, dense, and scannable.
- Optimize for repeated daily use by site staff, managers, finance, procurement, and executives.
- Mobile-first for field/site workflows.
- Desktop-efficient for finance, procurement, commercial, HR, and management workflows.
- Keep actions clear and visible.
- Use one consistent shell, navigation, form, table, and card language.
- Do not expose implementation details such as Supabase, R2, database internals, API keys, or developer notes in user-facing UI.
- Use operational wording: direct, short, and specific.

## Current Visual Language

### Component System

Pymble Ops now uses shadcn/ui as the canonical component source for internal workspace UI. New Ops surfaces should reach for the local shadcn components in `src/components/ui` before adding one-off Tailwind blocks.

Required defaults:

- Use shadcn `Card`, `Badge`, `Button`, `Input`, `Label`, `Textarea`, `Alert`, `Skeleton`, `Command`, `Dialog`, `Sheet`, `Tooltip`, `Table`, and `Chart` wrappers for reusable surfaces.
- Keep native form controls only when server-action form submission depends on browser-native behavior; style them through `OPS_INPUT_CLASS` so they still match shadcn tokens.
- Use shadcn design tokens (`bg-card`, `border-border`, `text-foreground`, `text-muted-foreground`, `bg-primary`, `ring-ring`) instead of new hard-coded utility palettes.
- Do not introduce another button, card, modal, table, tooltip, or command-palette implementation unless there is a documented reason.
- On Windows, import the canonical button file as `@/components/ui/Button` to avoid casing conflicts with the existing public-site path.

Brand colors:

- Primary dark: `#131739`
- Primary blue: `#2235DD`
- Accent orange: `#FFA500`
- Soft grey: `#E4E7FD`
- Page background: `#f6f7fb`
- White: `#FFFFFF`

Typography:

- Sans: Inter fallback stack
- Heading: Manrope fallback stack
- Do not scale font size with viewport width.
- Do not use negative letter spacing.
- Use uppercase labels sparingly for section eyebrows and table headings.

Shape:

- Use `rounded-md` for controls.
- Use `rounded-lg` for page panels and repeated cards.
- Avoid nested card-in-card layouts.
- Use cards only for individual records, repeated items, tools, and modal/dialog surfaces.
- Prefer the generated shadcn component radius and spacing defaults unless an Ops-specific density pattern already exists.

Brand mark:

- Use `/ops-logo.svg` for Pymble Operations shell branding, login, and loading states.
- Keep the ops SVG mark square to avoid distortion.
- Do not replace the public website logo globally when changing internal ops branding.
- Use `OpsBrandMark` instead of direct image tags inside `/ops` UI.

## Layout System

### ERP Workspace Layout Direction

The target desktop experience should move toward a refined ERP workspace similar to the approved reference layout:

- fixed left sidebar with grouped business/workspace navigation, subtle active states, and the signed-in profile anchored at the bottom
- top utility bar inside the content area with breadcrumb, global search, quick task/action affordance, theme control, and notification access
- page title row below the utility bar with a compact primary action group on the right
- white or near-white working canvas with thin borders, soft shadows, and restrained spacing
- dense dashboard panels that show charts, KPIs, filters, and short action links without marketing-style hero composition
- compact repeated cards for module summaries, report shortcuts, master-data links, and operational counters
- chart panels with clear legends, date filters, and source-record links where the data can be investigated
- module pages that feel like working dashboards first, then forms/lists, rather than long form stacks as the first visual impression

For Pymble specifically:

- Use Pymble Construction branding, not generic ERP Software labels.
- Keep the sidebar static on desktop and avoid scroll traps inside normal navigation.
- Keep Operations, Commercial, and Records as the daily nav groups unless the role/module model changes.
- Do not add dead sidebar links for planned modules; planned modules remain in the role-aware module registry.
- Use the reference as layout direction only; do not copy unrelated module names such as CRM, Selling, Manufacturing, or generic account labels unless those Pymble modules are actually implemented.

Desktop page composition should generally follow:

1. Sidebar
2. Top utility/breadcrumb/search bar
3. Page title and action toolbar
4. Primary analytics or record overview panel
5. KPI or shortcut card row
6. Main records/reports/master-data grid
7. Secondary detail panels where needed

Mobile adaptation:

- Replace the fixed sidebar with the existing drawer pattern.
- Keep the top bar compact with page title, menu, and high-priority notification/profile access.
- Stack analytics, KPI cards, reports, and forms into a single column.
- Keep chart panels horizontally readable through responsive simplification, not tiny squeezed labels.

### Production Layout Acceptance

Before production launch or a major module release, verify:

- The desktop sidebar is fixed, does not create a navigation scroll trap, and keeps the profile panel anchored at the bottom.
- The mobile drawer closes by backdrop, close button, Escape, and selecting a navigation item.
- `/ops/modules` remains a role-aware registry and does not appear as a daily sidebar module.
- No setup requirements, public signup, or generic ERP onboarding copy appears in the ops workspace.
- Loading states use the Pymble Operations mark.
- Page content follows the ERP order: title/action toolbar, KPI or summary surface, primary records, then collapsed forms or secondary panels.
- Buttons, cards, table cells, badges, and form controls do not overlap or truncate critical text at mobile and desktop widths.
- Keyboard focus is visible on navigation, filters, forms, action buttons, and download links.
- Tables use either mobile cards or controlled horizontal scrolling; they should not force the entire page wider than the viewport.

### App Shell

The ops shell must include:

- desktop fixed sidebar
- mobile top bar
- Pymble Operations SVG mark in desktop and mobile brand surfaces
- mobile drawer navigation
- grouped nav sections
- active nav state
- user profile panel
- skip link to main content
- dynamic current-page title

Desktop:

- Sidebar fixed at `280px`.
- Content uses left padding matching sidebar width.
- Header stays within content area.

Mobile:

- Use compact top bar with logo/page title and menu button.
- Navigation opens in an overlay drawer.
- Drawer must close by backdrop, close button, Escape key, or clicking a nav link.
- Drawer must not push page content down.

### Page Structure

Every ops page should follow this structure:

1. Page header panel
2. Notice/toast if needed
3. Primary action form or action toolbar
4. Main data surface
5. Secondary panels only when needed

Page header should include:

- module eyebrow
- page title
- concise description
- up to three key metrics where useful

Avoid putting too many stats in the header. If more than three metrics are needed, move them to a dashboard grid.

### Role-Specific Dashboards

The overview route should feel like the user's daily control room, not a generic company homepage. Dashboard composition must be selected by role group:

- Executive: business health, cash exposure, approvals, project pressure, safety pressure.
- Site Delivery: today's site activity, attendance review, material request flow, daily reporting, instructions, and map context.
- Procurement: request-to-RFQ-to-PO flow, delivery exceptions, supplier performance, and urgent sourcing.
- Commercial / QS: BOQs, budget variance, invoice ageing, IPCs, variations, claims, and project cost position.
- Finance: payment request queue, payroll exposure, receivables, failed payouts, cash advances, and payable ageing.
- HSE: pressure index, open incidents, corrective actions, inspections, PPE, toolbox talks, and training renewal.
- People / HR: employee status, leave, onboarding, recruitment, appraisal, and document compliance.

Dashboard standards:

- Use a personalized greeting and one-line operational context.
- Use role-specific primary and secondary CTA buttons.
- Use four role-relevant KPI cards at the top.
- Show time-aware actions with overdue, today, and upcoming labels where possible.
- Link every dashboard signal to the source module or record list.
- Avoid showing implementation wording or fake metrics when a schema does not yet exist.
- Prefer compact panels and tables over decorative cards.

Current implementation: `/ops` uses `OpsRoleOverviewDashboard` to select one of the seven role compositions from the signed-in role. It must continue to use shared permission helpers for links, shared dashboard primitives for panels/KPIs/charts, and bounded live queries or snapshot helpers for metrics.

Accent colors are subtle identifiers only:

- Executive: navy/gold
- Site Delivery: primary blue
- Procurement: teal
- Commercial / QS: indigo
- Finance: emerald
- HSE: amber/orange
- People / HR: violet

Do not allow accent colors to become separate full themes. Keep the shared ops UI quiet and consistent.

### Navigation and Command Palette

The top utility bar should support fast navigation for power users:

- Use Cmd/Ctrl+K for a global command palette.
- Search navigation entries and role-relevant actions first.
- Add record search results only when an API exists for that record family.
- Group results by navigation, action, and recent items.
- Use keyboard navigation, Escape to close, Enter to follow the highlighted result, and visible focus.
- Keep recent items in localStorage until a server-backed user preference table is added.

### Breakpoints

Important project detail: the Tailwind `sm` breakpoint is configured as `320px`, so do not use `sm:` for normal two-column layouts.

Use:

- base: single column phones
- `min-[520px]`: two-column forms or compact media cards
- `md`: tablets and comfortable two-column layouts
- `lg`: desktop shell/content splits
- `xl`: wide dashboard expansion only

Avoid:

- `sm:grid-cols-*` for phones
- `sm:flex-row` where text/buttons may become cramped
- fixed heights on mobile unless they are intentionally small

## Navigation Standards

Navigation groups:

- Operations: Overview, Sites, Workers, Attendance, Approvals, Notifications, Payroll, Material Requests, Site Instructions and QA/QC, RFQs and Purchase Orders, Stores and Inventory
- Commercial: BOQ, Invoices, future IPCs, Variations, Claims, Contracts
- Records: Photos, Documents, Suppliers, Staff, Settings
- Future department modules may exist in the registry, but sidebar navigation remains grouped by role-relevant live modules rather than dead planned links.

Active nav:

- Use `aria-current="page"` on active links.
- Active state should be visually distinct.
- Mobile and desktop nav must use the same module registry.
- Sidebar navigation should show only live modules with real routes and role-relevant `navigationRoles`.
- Planned modules should appear in `/ops/modules`, not as dead sidebar links.
- `/ops/modules` must not appear in the sidebar; it is a planning/system registry page.

Header title:

- The shell header should show the current module/page name.
- Individual pages still keep their own H1 for content context.

## Forms

Use shared input classes from `src/lib/ops/ui.ts`.

Form standards:

- Inputs and buttons must be at least 44px high.
- Labels must be explicit.
- Required fields should use native `required` first.
- Server actions must validate payloads server-side.
- Server errors should return operational messages.
- Submit buttons should be the visual endpoint of the form.
- Long forms should use responsive two-column layout from `min-[520px]`.
- Avoid cramped six-column layouts on tablets.

Recommended form layout:

```txt
base: 1 column
min-[520px]: 2 columns
lg: 6 columns for dense admin pages
```

Button placement:

- Mobile: full width where it helps completion.
- Desktop: full width or auto width depending on the density of the page.
- Submit action should not appear visually lost among inputs.

Validation:

- Native validation is acceptable for first version.
- For high-volume workflows, add inline field errors.
- For forms below the fold, notices should eventually become toast notifications or scroll into view after submit.

## Tables and Mobile Records

Desktop:

- Use semantic tables with captions.
- Wrap wide tables in a named, keyboard-focusable scroll region.
- Keep table headers concise.
- Use stable identifiers in the first column.

Mobile:

- Prefer stacked record cards instead of horizontal table scrolling.
- Each card should show:
  - primary name/title
  - status pill
  - 3 to 5 important labeled fields
  - action area if required

Use existing mobile record pattern:

- `OpsMobileRecordList`
- `OpsMobileRecordCard`
- `OpsMobileRecordRow`

Do not show the desktop table on mobile if the same data is available in cards.

Future enhancements:

- date filters for attendance and payroll
- row detail pages
- edit/archive actions

## Status and Color Semantics

Use consistent status colors:

| Meaning | Recommended Style |
| --- | --- |
| Approved, complete, active, paid | Emerald |
| Draft, pending, mobilizing, in progress | Orange or sky depending on urgency |
| Sent, issued, scheduled | Sky |
| Error, rejected, failed, incident, deactivated action | Red |
| Neutral, archived, inactive | Primary dark low opacity |
| Executive/action highlight | Primary blue |

Do not create a new color family for every module. Reuse status meanings across the ERP.

## Buttons and Actions

Shared button classes:

- `OPS_PRIMARY_BUTTON_CLASS`
- `OPS_SECONDARY_BUTTON_CLASS`
- `OPS_DANGER_BUTTON_CLASS`

Rules:

- Use primary buttons for create/submit/confirm.
- Use secondary buttons for navigation and low-risk actions.
- Use danger buttons for destructive or deactivation actions.
- Buttons must be keyboard focusable.
- Buttons must have accessible names.
- Icon-only buttons need `aria-label`.

Confirmation:

- Destructive or irreversible actions require confirmation.
- Current pattern: `OpsConfirmSubmitButton`.
- Use confirmation for:
  - deactivate staff
  - mark paid
  - send invoice
  - approve payroll
  - any future delete/archive action

For low-risk approvals, confirmation is still recommended on mobile-heavy workflows.

## Notices and Toasts

Current state:

- Notices are rendered near the top of the page from URL params.

Future standard:

- Add shared toast component for success/error feedback.
- Toasts should be fixed and visible after form submit.
- Toasts should include status semantics and accessible live regions.
- Do not rely only on top-of-page notices for long forms.

Notice language:

- Keep it short.
- Avoid implementation language.
- Use direct outcomes:
  - "Site created successfully."
  - "Payroll run approved."
  - "The email invitation could not be sent. Check the email address and try again."

## Page Header Pattern

Recommended page header:

```tsx
<section className="rounded-lg border border-primary-dark/10 bg-white p-5 md:p-7">
  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-blue">
    Module Name
  </p>
  <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
    <div>
      <h1 className="font-heading text-3xl font-bold text-primary-dark">
        Page Title
      </h1>
      <p className="mt-3 max-w-3xl text-base leading-7 text-primary-dark/68">
        Short operational description.
      </p>
    </div>
    Optional metric grid
  </div>
</section>
```

Rules:

- Page title should be specific, not generic.
- Description should explain the operational purpose.
- Keep page header metrics to the most important items.

## Empty States

Empty states should:

- say what is missing
- tell the user what action creates records
- avoid repeating "Pymble" unnecessarily
- avoid developer/infrastructure language

Good examples:

- "No sites registered yet"
- "Create your first site above. Site coordinates will appear on the overview map and enable worker assignment."
- "No payroll runs yet"
- "Payroll runs will appear here after approved attendance is processed."

Avoid:

- "Database is empty"
- "Setup requirements missing"
- "R2 not configured"
- "Supabase project not connected"

## Copy Standards

Use:

- "Operations Workspace"
- "Sign in with your Pymble staff credentials. Access is by invitation only."
- "Secure archive"
- "Staff account"
- "Email invitation"
- "Read-only access"
- "Contact your manager to request access"

Avoid user-facing:

- Supabase
- R2 bucket
- service role
- database
- tenant
- multi-tenant
- setup requirements
- finalized later
- temporary setup access
- developer notes

Developer/infrastructure details belong in setup docs, not app UI.

## Accessibility Standards

Every ops UI change should check:

- one main landmark per page content area
- skip link remains available
- nav has accessible label
- active nav uses `aria-current`
- form controls have labels
- icon-only buttons have accessible names
- status messages use `role="status"` or `role="alert"` when appropriate
- tables have captions
- scrollable regions have accessible labels
- touch targets are at least 44px high
- focus states are visible
- text does not overlap or overflow controls
- color is not the only status indicator

## Robust UX Standards

The UI should protect users from mistakes, slow states, duplicate submissions, and unclear outcomes.

### Action Safety

- High-risk actions must use confirmation.
- Disable or show pending state after submit where duplicate clicks could create duplicate records.
- Avoid placing destructive actions beside primary actions without clear visual separation.
- Destructive actions should use danger styling and specific labels.
- Approval actions should show the resulting state clearly after completion.
- Financial, payroll, PO, invoice, HSE, and staff deactivation actions should never feel casual.

### Loading and Pending States

- Long-running actions should show a pending state.
- Forms that upload files should communicate upload progress or at least pending status.
- Dashboard cards should avoid layout shift while data loads.
- Route loading should use `OpsRouteLoader` with the Pymble Operations SVG mark and `role="status"`.
- Map loading should show a meaningful branded loading state.
- Slow pages should show useful content progressively where possible.

### Error and Recovery States

- Error text should tell the user what happened and what to do next.
- Do not show raw exception objects in production UI.
- Keep retry buttons available where retry is safe.
- For partial failures, show the recoverable state rather than pretending the action succeeded.
- For permission failures, explain access clearly without exposing internal role logic.

### Duplicate and Race Protection

- Use server-side validation to prevent duplicate invoice numbers, PO numbers, employee numbers, equipment codes, material codes, and project/site codes.
- Use idempotency or duplicate guards for invitations, approvals, payments, POs, and uploads.
- UI confirmation is helpful, but server-side protection is required.
- If two users act on the same request, the second action should fail clearly or refresh to the latest state.

### Mobile Robustness

- Mobile pages must avoid horizontal overflow.
- Long tables must use mobile cards or progressive disclosure.
- Critical actions must have 44px touch targets.
- Fixed overlays must not trap users without an obvious close action.
- Mobile drawer should close with backdrop, close button, Escape, and nav click.

### Data Freshness

- Data-heavy modules should eventually include last-updated context or refresh actions.
- Approval inboxes and dashboards should be designed for stale-state protection.
- After a write, revalidate affected routes and return the user to an updated view.

## Map Standards

Map UI should:

- be responsive in height
- not capture scroll wheel by default on touch/mobile-heavy pages
- include a non-map site selector
- include a text fallback or nearby site detail panel
- hide overlays on small screens if they cover the map
- keep site details accessible outside the map pins

Current pattern:

- `OpsOverviewMapPanel`
- `OpsSiteMapClient`
- map height: `h-64 md:h-80 lg:h-[26rem]`
- site selector above map

## Dashboard Standards

Dashboards should:

- show action items before passive metrics
- keep mobile pages shorter
- avoid duplicate navigation cards on desktop
- use SQL/RPC snapshots for heavy data
- use date filters once reporting grows
- show exceptions and bottlenecks before general summaries

Executive dashboards should not expose raw operational noise. They should summarize:

- cashflow
- project completion
- delayed projects
- receivables
- supplier liabilities
- equipment utilization
- profitability
- staff productivity
- HSE risk
- approval backlog

Overview-level executive panels may surface cross-module pressure signals such as HSE safety pressure, but they should link back to the owning module instead of duplicating the full register.

Current Executive pattern:

- `/ops/executive` is a leadership-only dashboard for Developer, Managing Director, and General Manager roles.
- Keep the page read-only in the first pass; it summarizes source modules instead of creating executive-only records.
- Use KPI cards first, then a leadership action queue, pressure index, finance/commercial panels, project pressure cards, and department pressure panels.
- Link every executive signal back to the owning module route so source records remain auditable.
- Show non-technical source-health messaging only when a recoverable source is unavailable.
- Prefer SQL/RPC snapshots later if source volume makes live aggregation slow.

## Shared ERP Surfaces

Approvals, documents, comments, audit timelines, and notifications should use reusable patterns across modules.

Approvals:

- Use the ERP module pattern: title/action row, KPI cards, approval-flow summary, approval register, and notification side panel.
- Show submitted count, in-review count, urgent visible count, unread alerts, visible value, and latest visible request before the register where useful.
- Show requester, current step, status, due date, amount, and source record.
- Use a timeline for step history.
- Keep approve/reject actions visually separate.
- Rejections require a reason.
- Do not hide pending approver context inside hover-only UI.
- Avoid placeholder/future workflow copy; describe current shared approval records from live modules.

Documents:

- Show title, category, current version, file name, file size, uploaded date, and visibility.
- Use clear version labels such as `v1`, `v2`, and `current`.
- Never expose raw R2 object keys in normal UI.
- Downloads should use link text such as `Download document`, not a visible signed URL.
- Keep list pages focused on the current version; load full version history only in detail views or targeted workflows.
- Treat approval status as approval for the current document version, not permanent approval for every future replacement.
- New version uploads and archive actions must require confirmation and server-side permission checks.
- Do not allow a replacement or archive while a document approval is still open.
- Record-specific attachment surfaces should lazy-load linked documents and comments when opened instead of querying every row during page render.
- Attachment upload forms should stay inside a collapsed record activity section on dense list pages.

Comments:

- Use chronological timeline order.
- Show author, role, timestamp, and body.
- Deleted comments should be hidden from normal operational views.
- Comment boxes must have explicit labels.
- Record-specific comments should use the shared record activity surface before creating module-specific comment UIs.
- Comments on dense list pages should be collapsed by default with attachments to reduce page noise.

Notifications:

- Show concise action text and the related module.
- Links should use readable labels, not raw URLs.
- Mark-read actions must not shift layout.
- Critical notifications should remain visible until acknowledged or resolved.
- Use `/ops/notifications` as the full notification workspace.
- Support unread, read, and archived filters.
- Archive notifications without deleting their operational history.

Material requests:

- Keep request creation fast: site, title, priority, needed-by date, and first line item.
- Keep additional line items collapsed inside each draft/rejected request.
- Use the ERP module pattern: title/action row, KPI cards, visible request values, material-flow summary, collapsed creation panel, then the request register.
- Keep request creation collapsed by default so engineering and procurement users land on request status, approval pressure, visible values, and matching records before opening the intake form.
- Show request number, site, priority, status, item count, estimate, requester, and created date before comments or attachments.
- Show draft, submitted, in-review, urgent, visible estimate, line item, site, and earliest-needed indicators where useful.
- Submit into the shared approval engine rather than a separate procurement inbox.
- Show approval links as readable actions such as `View approval`.
- Source status should sync from approval decisions so the request register remains truthful.
- Use the shared record activity surface for attachments and internal comments.
- Avoid hard-coding financial escalation thresholds in page UI; put threshold settings in module settings before MD/Finance escalation goes live.

Daily site reports:

- Treat daily site reports as the operational bridge between field execution, procurement, HSE, commercial, finance, and executive dashboards.
- Capture progress summary, labour, equipment, materials, delays, HSE observations, commercial notes, and incident counts in the report header.
- Use structured entries for progress, labour, equipment, material, delay, HSE, and commercial details instead of creating separate note-only blobs for every category.
- Keep report creation collapsed by default so users can see report status and field totals first.
- Keep entry creation collapsed inside each report so long report registers remain scan-friendly.
- Use status transitions `draft -> submitted -> reviewed -> closed`; only permitted roles can submit, review, or close.
- Use the shared record activity surface for daily report attachments, photos, proof, and internal comments.
- Daily reports should feed later equipment requests, HSE actions, material requests, IPC/variation evidence, and executive dashboards.

Site instructions and QA/QC:

- Treat Engineering Controls as the controlled execution record for site instructions, QA inspections, material testing, snags, drawing control, and programme milestones.
- Use the ERP module pattern: title/action row, KPI cards, QA category pressure, programme pressure, instruction follow-up task handoff, collapsed instruction/inspection/test/snag/drawing/milestone creation panels, filtered instruction register, QA checklist panel, test and snag panels, drawing register, programme panel, lifecycle controls, and record activity.
- Keep creation panels collapsed by default so engineers and project managers land on live execution pressure before opening intake forms.
- Preserve instruction number, site, type, priority, title, required-by date, assignee, issue/acknowledgement/close state, and response notes before comments or attachments.
- Preserve instruction follow-up task type, status, owner, due date, description, and close/cancel state as child work from the original site instruction.
- Preserve inspection number, site, type, inspector, date, score, findings, action count, checklist finding category, checklist results, action-required text, and close/cancel state before comments or attachments.
- Preserve material test number, site, linked inspection, sample/lab references, location, standard, tested-by, dates, status, result value, and summary before comments or attachments.
- Preserve snag number, site, linked inspection, priority, location, assignee, due date, status, resolution notes, and verification state before comments or attachments.
- Preserve drawing number, revision, title, discipline, received/issued dates, linked document version state, status, and notes before comments or attachments.
- Preserve programme milestone number, site, owner, baseline/forecast/actual dates, progress, status, delay reason, and notes before comments or attachments.
- Use `draft -> issued -> acknowledged -> closed` as the normal site-instruction lifecycle; cancellation is a confirmed exception.
- Use `open -> in_progress -> closed` as the normal instruction follow-up lifecycle; cancellation is a confirmed exception.
- Use `planned -> completed -> closed` as the normal QA inspection lifecycle, with `action_required` available when follow-up is needed.
- Use `scheduled -> submitted -> passed/failed` as the normal material-test lifecycle; cancellation is a confirmed exception.
- Use `open -> in_progress -> resolved -> verified` as the normal snag lifecycle; cancellation is a confirmed exception.
- Use `current -> superseded` for drawing revision changes and `archived` only for records that should leave the active register.
- Use `planned -> on_track/delayed -> completed` as the normal programme lifecycle; delays should stay visually prominent until recovered or completed.
- Programme dashboards should group milestones by site and surface delayed, overdue, due-this-week, and forecast-slip pressure before the register.
- Use the shared record activity surface for site instruction evidence, inspection checklists, test reports, snag photos, drawing files, programme correspondence, and internal engineering notes.
- Keep Engineering route visibility to delivery, QS, HSE, and leadership roles; Developer sees all modules.

Supplier register:

- Treat suppliers as procurement master data, not one-off text fields inside RFQs or POs.
- Show supplier code, legal name, trading name, status, category, TPIN, main contact details, rating, and contact count before attachments or comments.
- Keep supplier creation available to procurement and leadership roles; keep archive/status actions behind stronger server-side permission checks.
- Archive suppliers instead of deleting them from the app so historical RFQ, PO, GRN, and payment references remain intact.
- Place the live supplier route under Records navigation as master data while planned procurement workflows stay in the module registry.
- Use active suppliers as the selectable source for future RFQ, quote comparison, purchase order, delivery, and payment workflows.
- Treat supplier performance events as dated operational evidence; show recent event ratings separately from the supplier master rating.
- Let leadership, procurement, operations/projects, QS, and finance roles log supplier performance events; keep HR and crew roles out of supplier-performance mutation.
- Keep supplier performance event forms compact and collapsed by default so the register remains scan-friendly.
- Supplier register pages should use the ERP module pattern: title/action row, KPI cards, collapsed creation panel, then the register/list surface.
- Keep supplier creation collapsed by default; procurement users should not land on a long create form before seeing register status and records.
- Use the shared record activity surface for supplier certificates, compliance files, quote evidence, notes, and internal comments.

RFQs and purchase orders:

- Treat RFQs as procurement packages with line items and invited supplier quote records.
- Show RFQ number, site, linked material request, status, due date, item count, estimate, supplier count, best received quote, and draft POs before comments or attachments.
- RFQ/PO pages should use the ERP module pattern: title/action row, KPI cards, visible procurement values, flow summary, collapsed creation panel, then the register/list surface.
- Keep Material Requests and Suppliers as visible action links on the RFQ/PO page because they are the main upstream records for RFQ creation and supplier invitations.
- Keep RFQ creation collapsed by default so procurement users land on package status, comparison counts, and matching records before opening the intake form.
- Keep RFQ creation fast: site, optional approved material request, title, due date, description, and first line item.
- Supplier invitations must use active supplier records from the supplier register.
- Quote comparison should begin with received quote totals and lowest quote summary; detailed quote item comparison can be added when procurement volume requires it.
- Label amount summaries derived from the current filtered page as visible or current selection values.
- Awarding a quote should create a draft purchase order only; approval and issue happen through separate confirmed actions.
- Purchase orders created from first-pass RFQs should preserve the awarded quote total, supplier, site, RFQ, and material request link.
- Draft or rejected purchase orders should move through the shared approval engine before issue.
- Purchase order approvals use Settings-controlled MD threshold logic with Procurement Manager review, Finance Manager budget check, and Managing Director review at or above the threshold.
- Approved purchase orders can be issued from the RFQ/PO register; issuing updates the PO state and linked material request status where applicable.
- Use the shared record activity surface for RFQ attachments, quote files, and internal comments.
- Keep destructive actions such as RFQ cancellation behind confirmation and server-side permission checks.

BOQ:

- Treat BOQs as commercial source records for measured scope, invoice links, future IPCs, valuations, variations, and claims.
- Use the ERP module pattern: title/action row, KPI cards, visible commercial values, BOQ-to-invoice flow summary, collapsed BOQ creation, then the document/register surface.
- Keep BOQ creation collapsed by default so commercial users land on document status, visible values, and matching records before opening the intake form.
- Show BOQ title, site, version, status, line count, budgeted value, and actual value before comments or attachments.
- Keep line-item creation collapsed inside each BOQ document so the register remains scan-friendly.
- Keep mobile BOQ line items as stacked records and desktop BOQ line items as a semantic table with a caption and keyboard-focusable horizontal scroll region.
- Label amount totals derived from the current filtered page as visible or current selection values.
- Use the shared record activity surface for BOQ attachments, measurement evidence, and internal comments.

Invoices:

- Treat invoices as finance/commercial receivable records, not as a form-first admin page.
- Show the title/action row, status KPI cards, visible-value summary, collapsed invoice creation panel, then the invoice register.
- Keep invoice creation available only to roles that pass server-side invoice management checks.
- Keep the create form collapsed by default so finance users land on receivable status and matching records first.
- Use global invoice status counts for KPI cards; label any amount totals derived from the current filtered page as visible or current selection values.
- Keep draft-to-sent and sent-to-paid transitions confirmed through `OpsConfirmSubmitButton`.
- Preserve BOQ, site, client TPIN, subtotal, VAT, total, status, and issue date as the first visible invoice fields.
- Use the shared record activity surface for invoice attachments, client evidence, and internal comments.

Finance bridge:

- Treat project budgets, payment requests, cost entries, payables ageing, cashflow, and variance as one finance control surface.
- Show finance risk panels before dense registers: payables ageing before payment requests, and active budget variance before project budget records.
- Use consistent ageing buckets: Current, Due soon, 1-30 days, 31-60 days, and 61+ days.
- Keep budget variance based on total budget exposure, including posted costs, committed costs, contingency, and budget-level cost entries that do not have a line id.
- Keep cashflow summaries explicit about source data: open receivables come from invoices, payables come from submitted/review/approved payment requests, and month movement comes from paid timestamps.
- Keep Finance dashboards bounded and server-side so register pages stay responsive while data grows.
- Use status-filter links for drilldown instead of duplicating the full register inside dashboard panels.
- Add persisted monthly snapshots only when Pymble needs audited period reporting; first-pass operational dashboards can derive from live records.

Commercial controls:

- Treat contracts, line-level valuations, IPCs, variations, claims, commercial risks, retention releases, cashflow forecasts, and contract milestones as the QS/commercial control surface that connects BOQs, site progress, receivables, retention, and margin exposure.
- Use the ERP module pattern: title/action row, KPI cards, project margin watch, retention/cashflow/milestone watch, collapsed contract/valuation/retention/cashflow/milestone/IPC/variation/claim/risk creation panels, contract/valuation/risk panels, retention/cashflow/milestone panels, paginated IPC register, variation panel, claims panel, and record activity.
- Show margin reporting before dense registers. Forecast revenue should come from active contracts, approved variations, and agreed claims; cost exposure should come from committed and posted project cost entries; certified revenue should come from certified valuation lines.
- Keep contract, valuation, retention, cashflow, milestone, IPC, variation, claim, and risk creation available to commercial, project, finance, site delivery, and leadership roles that pass server-side guards.
- Preserve record number, site, contract, BOQ, valuation, variation, invoice links, status, amounts, dates, references, creator/submitter, rejection reason, and notes before comments or attachments.
- Use `draft -> active -> completed` as the normal contract lifecycle; cancellation must remain a confirmed server action.
- Use `draft -> submitted -> certified` as the normal valuation lifecycle; line items must preserve claimed quantity, certified quantity, unit, unit rate, claimed amount, certified amount, and line notes.
- Keep valuation line add/update/delete controls inside editable draft/rejected valuations only. Do not allow the final valuation line to be deleted, and require at least one line before submission.
- Use `draft -> submitted -> certified -> invoiced -> paid` as the normal IPC lifecycle; rejection returns an IPC to editable state and cancellation is only for uncompleted work.
- Use `draft -> submitted -> priced -> approved -> closed` as the normal variation lifecycle; rejection and cancellation must remain confirmed server actions.
- Use `draft -> submitted -> under_review -> agreed -> closed` as the normal claim lifecycle; rejection and cancellation must remain confirmed server actions.
- Use `open -> mitigating -> closed` as the normal commercial risk lifecycle; high and critical risks should remain visually prominent until closed.
- Use `draft -> submitted -> approved -> released` as the normal retention release lifecycle; approval cannot exceed the claimed amount, release cannot exceed the approved amount, and rejection/cancellation must remain confirmed server actions.
- Use `draft -> approved -> locked -> archived` as the normal cashflow forecast lifecycle; negative net cash should be visually prominent and source records should remain linked to site and contract where available.
- Use `planned -> due -> achieved -> certified` as the normal contract milestone lifecycle; delayed milestones should remain visually prominent, and milestone panels should show billing and retention triggers when they exist.
- Certified IPC-to-invoice generation must be deliberate: a permitted user creates a draft invoice from a certified IPC, the IPC is linked to that invoice, and Finance still controls invoice send/paid transitions.
- Use the shared record activity surface for contracts, retention evidence, cashflow assumptions, milestone backup, valuation backup, measurement evidence, client correspondence, claim proof, risk evidence, and internal commercial notes.

Stores and inventory:

- Treat stock locations and stock items as controlled master data, not free-text fields on GRNs.
- Post GRNs only from issued or partially received purchase order lines.
- Use the ERP module pattern: title/action row, KPI cards, inventory-flow summary, live stock state, collapsed receiving panel, GRN register, then collapsed stock/master-data controls.
- Keep GRN receiving, stock location creation, stock item creation, and stock control panels collapsed by default, with URL-backed open states for action links.
- Show receivable PO count, posted GRNs, active locations, stock items, visible GRN value, stock balances, and latest movement before the register where useful.
- Show GRN number, PO number, supplier, site, location, status, received date, line count, and received value before comments or attachments.
- Show a `Raise exception` action on posted GRNs for roles that can create delivery exceptions.
- Keep stock balances derived from stock movements; do not edit balances directly from page UI outside controlled movement actions.
- Use positive receipt movements for GRNs, negative issue movements for stock leaving a location, paired transfer movements, and signed adjustment deltas from stock counts.
- Stock issue, transfer, and adjustment actions must validate available stock server-side and write audit events.
- Count adjustments should be available only to stronger stores/management roles, not every role that can view stock.
- Cancelled GRNs should not accept new attachments/comments from the app.
- Use the shared record activity surface for delivery notes, proof of delivery, inspection evidence, and internal receiving comments.

Delivery exceptions:

- Treat delivery exceptions as a controlled operational register, not as ad hoc GRN notes.
- Use the ERP module pattern: title/action row, status KPI cards, collapsed exception creation, filtered exception register, status actions, resolution form, and record activity.
- Link exceptions to supplier, site, and optionally GRN/PO so procurement, stores, and finance can trace the issue back to the delivery source.
- When launched from a posted GRN, prefill the linked GRN, supplier, site, and delivery reference, and show compact receipt context above the creation fields.
- Keep a short posted-GRN shortcut strip on the Delivery Exceptions page so stores/procurement can raise common delivery issues without leaving the exception workspace.
- Show delivery exception ageing before the register using the standard buckets: Overdue, Due today, Due soon, No due date, and On track.
- Treat no-due-date records as stale after 7 days so unplanned supplier follow-ups do not disappear from the dashboard.
- Show supplier follow-up ranking from open and investigating exceptions, prioritizing overdue, high/critical severity, due-soon, stale, and oldest records.
- Keep follow-up dashboards bounded and server-side; use the register for full history and detailed filtering.
- Preserve exception number, supplier, site, status, severity, type, reported date, due date, GRN, PO, and resolution state before comments or attachments.
- Keep creation available to field, stores, procurement, and delivery roles; keep investigation, resolution, cancellation, and closure with management/procurement oversight roles.
- Use open -> investigating -> resolved -> closed as the normal lifecycle; cancellation is only for open or investigating records.
- On resolution, optional supplier rating should write a supplier performance event linked back to the exception.
- Use the shared record activity surface for photos, damaged item evidence, delivery notes, supplier correspondence, and internal follow-up comments.

Project budgets:

- Treat project budgets as the finance control surface for site cost exposure, not as a static spreadsheet replacement.
- Use the ERP module pattern: title/action row, KPI cards, cost movement panel, collapsed budget creation, filtered budget register, budget line entry, status actions, and record activity.
- Keep budget creation available to finance, leadership, QS, and project management roles; keep activation, locking, and archiving with finance leadership roles.
- Preserve budget number, site, status, effective date, total budgeted amount, contingency, committed amount, posted amount, and remaining amount before comments or attachments.
- Use `draft -> active -> locked` as the normal lifecycle; archive is a confirmed administrative state, not a delete.
- Budget lines should have cost code, category, description, and budgeted amount so future payment, payroll, equipment, and commercial costs can link to consistent cost buckets.
- Use the shared record activity surface for budget approvals, BOQ backups, valuation evidence, and internal finance notes.

Payment requests:

- Treat payment requests as the accounts payable workflow bridge from procurement/operations to finance posting.
- Use the ERP module pattern: title/action row, status KPI cards, collapsed creation panel, filtered payment register, status actions, paid form, line table, and record activity.
- Link requests to site, supplier, optional PO, optional budget line, and invoice/payment references.
- Preserve request number, site, supplier, status, type, amount, due date, invoice reference, PO, budget, requester, approval date, payment date, and project cost status before comments or attachments.
- Use `draft -> submitted -> finance_review -> approved -> paid` as the normal lifecycle; rejection can return a request to editable state, and cancellation is only for unpaid work.
- Approval should create or update a committed project cost entry; marking paid should post the cost entry.
- Payment, rejection, and cancellation actions must be confirmed and server-authorized because they affect project financial exposure.
- Use the shared record activity surface for supplier invoices, receipts, payment proof, and internal finance comments.

Equipment and fleet:

- Treat equipment as operations/fleet master data plus request/allocation workflow, not as a generic asset list.
- Use the ERP module pattern: title/action row, KPI cards, fleet-flow summary, equipment register, fuel/maintenance panels, collapsed request/fuel/maintenance creation, request register, allocation controls, and collapsed master-data panels.
- Keep equipment category and equipment record creation collapsed by default so users land on fleet status and requests first.
- Preserve equipment code, equipment name, category, ownership, status, current site/base location, daily rate, and fuel-tracking flag before comments or attachments.
- Preserve request number, site, priority, status, needed dates, preferred equipment, requester, allocation status, and cost handoff before comments or attachments.
- Use `draft -> submitted -> approved -> allocated -> closed` as the normal equipment request lifecycle; rejection can return a request to editable state, and cancellation is only for unclosed work.
- Use `scheduled -> active -> completed` as the normal allocation lifecycle; cancellation is only for scheduled or active allocations.
- Allocation should create or update a committed project cost entry; completion should post the cost entry.
- Equipment allocation and completion actions must be confirmed and server-authorized because they affect equipment availability and project cost exposure.
- Use the shared record activity surface for equipment requests, fuel receipts, maintenance evidence, delivery proof, allocation notes, operator documents, and internal fleet comments.
- Maintenance jobs should use `scheduled -> in_progress -> completed` as the normal lifecycle; cancellation is only for scheduled or in-progress work.
- Maintenance completion can post a project cost entry when the job has a site and actual cost.
- Surface equipment utilization before the register: active/scheduled allocation count, active equipment percentage, availability percentage, recent allocation rows, 30-day fuel litres/cost, open maintenance cost, and downtime pressure.
- Keep utilization and maintenance dashboards derived from bounded server-side queries. They should tolerate missing optional fleet tables during environment rollout and never block request creation.

Fleet logistics:

- Treat fleet logistics as site movement, accommodation, and people allocation control, not as generic notes under equipment.
- Use the ERP module pattern: title/action row, KPI cards, collapsed transport/accommodation/labour creation, paginated transport register, accommodation panel, labour panel, lifecycle controls, and record activity.
- Preserve transport request number, site, type, priority, route, requested date, passenger/material requirement, estimated/actual cost, requester, and status before comments or attachments.
- Use `draft -> submitted -> approved -> scheduled -> completed` as the normal transport lifecycle; rejection can return a request to editable state, and cancellation is only for uncompleted work.
- Preserve accommodation booking number, site, employee or worker link, location/provider, check-in/out dates, occupant count, estimated/actual cost, and status before comments or attachments.
- Use `requested -> confirmed -> checked_in -> completed` as the normal accommodation lifecycle; cancellation is only for requested, confirmed, or checked-in bookings.
- Preserve labour allocation number, site, employee or worker link, role/trade, start/end dates, planned/actual days, daily rate, estimated/actual cost, and status before comments or attachments.
- Use `planned -> active -> completed` as the normal labour allocation lifecycle; cancellation is only for planned or active allocations.
- Approved or active logistics records should create committed project cost entries where an estimate exists; completion should post actual cost.
- Use the shared record activity surface for transport proof, accommodation correspondence, labour allocation notes, cost evidence, and internal logistics comments.
- Surface dispatch calendar and usage variance before the transport register so Operations can plan the next 14 days before opening individual records.
- Surface trip planning before the registers: overdue trips, due-this-week trips, scheduled trips, route, priority, passenger count, and estimated cost.
- Approved transport scheduling must capture scheduled time, vehicle/equipment assignment, one operator source, dispatch reference, and dispatch notes in the same controlled action.
- Usage variance should compare completed transport estimated cost against actual cost, highlight overruns, and stay derived from bounded server-side queries.
- Group mobilization planning by site so operations can see open transports, scheduled transports, accommodation occupants, labour days, next movement date, and estimated exposure in one scan.
- Driver/operator document compliance belongs inside Fleet logistics, not Staff settings. Show expired and due-soon documents before the transport register so operators are checked before scheduling.
- Operator document records should preserve employee or worker link, document type, title, reference, issued date, expiry date, reminder window, and status before attachments/comments. Only one operator source should be selected per document.
- Fleet profitability should be a derived snapshot from completed transport/equipment recovery and posted fuel/maintenance costs. Do not create a manual profitability entry table unless Finance later needs formal adjustments.
- Keep profitability bounded by date window and grouped by site/equipment so it remains fast and operational, with Finance retaining budget and cost-entry truth.
- Keep transport attention buckets date-only and timezone-stable, using Pymble's operating timezone instead of browser-local calculations.

HSE incidents and actions:

- Treat HSE as a controlled safety register, not as scattered daily-report notes.
- Use the ERP module pattern: title/action row, KPI cards, executive safety rollup, collapsed incident reporting, collapsed corrective-action intake, filtered incident register, status actions, action controls, and record activity.
- Preserve incident number, site, status, severity, incident type, occurred date/time, location, reported by, people involved, immediate action, investigation summary, root cause, and closure state before comments or attachments.
- Use `reported -> investigating -> action_required -> closed` as the normal incident lifecycle; cancellation is only for reported or investigating records.
- Queue inbox notifications for reported incidents. High/critical incidents should alert leadership, delivery management, and HSE ownership; lower severity incidents should alert HSE review ownership.
- Critical HSE email should be sent only for escalation paths and must remain supplementary to in-app notification records. Email sends should be idempotent, fail-soft, and use hidden link text such as "Open HSE alert" instead of visible raw URLs.
- Record every critical HSE email attempt in the delivery event log as sent, failed, or skipped. Show HSE email health as a compact operational panel with masked recipient fallback labels and sanitized provider errors, not as raw email/debug output.
- Corrective actions should preserve action number, linked incident, site, owner, priority, due date, status, completion notes, and verification notes.
- Use `open -> in_progress -> completed -> verified` as the normal corrective-action lifecycle; cancellation is only for open or in-progress actions.
- Queue inbox notifications when corrective actions are assigned and when high/urgent corrective actions need leadership escalation.
- The executive safety rollup should derive from live incidents, corrective actions, risk assessments, audits, inspections, training, and PPE stock without creating a separate dashboard table.
- Executive HSE trend snapshots should reuse the same rollup and summarize incident backlog, corrective actions, compliance watch, training readiness, and field controls.
- Scheduled escalation sweeps must use idempotent notification keys and a protected cron route guarded by `CRON_SECRET`.
- HSE closure, cancellation, completion, and verification actions must be server-authorized because they affect safety compliance records.
- Use the shared record activity surface for photos, medical notes, witness notes, inspection evidence, corrective-action proof, and internal follow-up comments.

Cross-module escalations:

- Use existing status, due-date, and submitted/created timestamps before adding new escalation tables.
- Cross-module sweeps should run through `/api/ops/cron/escalations`, remain protected by `CRON_SECRET`, and queue idempotent in-app notifications.
- First-pass SLA coverage includes approvals, material requests, payment requests, and delivery exceptions. Expand the sweep only when a module has stable statuses and clear role owners.
- Dashboard stale-work signals should be role-aware: leadership sees the combined count, procurement sees material and delivery pressure, finance sees payment pressure, and delivery roles see approvals/material blockers.
- Escalation notifications must include a hidden app link, source table/id, module key, daily idempotency key, and concise operational next action.

Shared ops UI components:

- Shared Ops surfaces must compose from the local shadcn primitives first. Current shared primitives using shadcn include `OpsDashboardPanel`, `OpsKpiCard`, `OpsChartPanel`, `OpsListControls`, `OpsRecordActivityPanel`, `OpsReportShortcutGrid`, `OpsRouteLoader`, `OpsCommandPalette`, `OpsCommentTimeline`, `OpsMobileRecord`, `OpsLocalRolePreviewPanel`, and `OpsOverviewMapPanel`.
- Page-specific markup may keep existing server-action form behavior, but buttons, labels, alerts, loading states, cards, badges, command/search surfaces, and charts should be moved to shadcn primitives whenever that page is touched.
- KPI cards should use a modern metric hierarchy: medium-weight label, prominent value, featured icon, concise trend badge, and compact sparkline where the component can generate one safely.
- Dashboard signal panels should avoid plain full-width progress bars and one-off custom CSS chart blocks. Prefer shadcn-style metric cards backed by Recharts sparklines, concise share/watch labels, and compact action links.
- Activity panels should render audit events as a timeline with humanized event names, status badges, timestamps, and featured icons. Avoid exposing raw action keys such as `approval_requested` in user-facing panels.
- Empty states should include a featured icon, short title, helpful body copy, and a clear next place to go when a direct CTA is available.
- List controls should use tactile search inputs with leading icons, soft borders, shadow-sm depth, and focus rings consistent with the rest of the ops system.
- Record activity upload controls should read as evidence upload zones rather than bare browser file inputs.

HSE compliance:

- Treat risk assessments, compliance audits, PPE stock, PPE issues, toolbox talks, inspections, findings, and safety training as controlled compliance registers, not loose HSE notes.
- Use the ERP module pattern: title/action row, KPI cards, incident-ageing panel, risk heatmap, audit escalation watch, collapsed PPE stock/PPE issue/toolbox/inspection/risk/audit/training creation panels, risk assessment panel, compliance audit panel, PPE stock master, paginated PPE issue register, toolbox panel, inspection panel, safety training panel, lifecycle controls, and record activity.
- Preserve risk assessment number, site, title, activity, area/location, hazard category, initial risk, residual risk, control measures, responsible user, assessment/review dates, and approval state before comments or attachments.
- Use `draft -> submitted -> approved` as the normal risk assessment lifecycle; archived and cancelled are terminal exception states.
- Render risk heatmaps as a 4-by-4 initial-risk/residual-risk matrix. Count active draft, submitted, and approved assessments; exclude archived and cancelled assessments from the heatmap.
- Queue inbox notifications when risk assessments are submitted for HSE review, assigned to a responsible user, approved for the responsible user, or approved with high/critical residual risk for leadership escalation.
- Preserve compliance audit number, site, audit type, title, auditor, scheduled/completed dates, score, findings count, non-conformance count, action requirement, next audit date, and closure state before comments or attachments.
- Use `planned -> completed -> closed` as the normal compliance audit lifecycle, with `action_required` available when non-conformances need corrective follow-up.
- Bucket audit escalation reporting into action required, overdue planned audits, due-soon planned audits, and completed audits with non-conformances.
- Queue inbox notifications when compliance audits are assigned, completed with non-conformances, or moved into action-required status.
- Preserve PPE stock item code, PPE type, item name, storage location, unit, stock on hand, reorder level, and active state before comments or attachments.
- Preserve PPE issue number, PPE stock item link, site, linked employee, issued-to name, PPE type, item description, quantity, issue/return dates, return condition, replacement cost, and status before comments or attachments.
- Use `issued -> returned` as the normal PPE lifecycle; `damaged`, `lost`, and `cancelled` are confirmed exception states.
- Preserve toolbox talk number, site, topic, category, date, facilitator, attendee count, attendee names/roles/company, duration, summary, actions required, and status before comments or attachments.
- Use `planned -> completed` as the normal toolbox lifecycle; cancellation is only for planned talks.
- Preserve inspection number, site, inspection type, title, scheduled date, inspector, score, findings count, action count, summary, action requirement, and status before comments or attachments.
- Preserve inspection finding number, linked inspection, site, finding type, severity, responsible user, due date, status, completion notes, and verification state before comments or attachments.
- Use `planned -> completed -> closed` as the normal inspection lifecycle, with `action_required` available when corrective follow-up is needed.
- Use `open -> in_progress -> corrected -> verified` as the normal inspection finding lifecycle; cancellation is only for open or in-progress findings.
- Preserve safety training number, site, employee/trainee, title, type, provider, planned/completed/expiry dates, score, completion state, and notes before comments or attachments.
- Use `planned -> completed` as the normal safety training lifecycle; expired records should remain auditable and cancellation is only for planned records.
- Use the shared record activity surface for PPE forms, attendance evidence, inspection photos, checklists, corrective proof, training certificates, and internal HSE notes.

Employees and leave:

- Treat HR as an employee record and leave-control workspace, separate from staff login management.
- Use the ERP module pattern: title/action row, KPI cards, HR action queue, workforce signal panel, HR document coverage panel, collapsed employee creation, collapsed leave creation, collapsed recruitment/contract/appraisal/leave-balance/onboarding/category/document panels, training renewal watch, filtered employee register, employee status control, leave workflow controls, onboarding lifecycle controls, employee document review controls, and record activity.
- Preserve employee number, name, job title, department, employment type, status, site, start/end dates, user link, phone, email, and emergency contacts before comments or attachments.
- Preserve recruitment requisition number, job title, site, department, employment type, priority, position count, target start, hiring manager, justification, and status before comments or attachments.
- Preserve contract number, employee, type, status, title, start/end/probation dates, pay frequency, salary amount, signed/termination state, and notes before comments or attachments.
- Preserve appraisal number, employee, reviewer, cycle, period, status, rating, strengths, improvement areas, goals, completion state, and cancellation state before comments or attachments.
- Preserve leave balance year, type, opening/accrued/used/adjustment/available values, and notes before comments or attachments.
- Preserve onboarding item number, employee, category, title, owner, due date, status, completion notes, and closed state before comments or attachments.
- Preserve employee document category, employee, document id, exact version id, review status, expiry date, review notes, uploader, reviewer, and review timestamp before generic comments or attachments.
- Surface HSE training records that are expired or due soon as an HR renewal watch. Only show direct HSE training-register actions to roles that can access HSE compliance.
- Keep employee self-service in `/ops/profile`: linked employees may see only their own employee summary, leave balances, recent leave requests, safety training records, and employee HR documents, and may submit their own leave requests and HR documents without gaining HR register access.
- Scheduled HSE training renewal notifications should alert the linked employee profile plus HR/HSE renewal owners through idempotent notification keys.
- Keep HR document categories as controlled master data for required/optional evidence classes and retention expectations.
- Store employee HR files as private controlled documents linked through `employee_documents`; HR/leadership can review them, and the linked employee can view/download their own files.
- Link staff users to employee records when available, but do not rely on auth users as the only employee source of truth.
- Use `draft -> submitted -> approved -> completed` as the normal leave lifecycle; rejected and cancelled are terminal first-pass states.
- Use `pending -> in_progress -> completed` as the normal onboarding lifecycle; waived and cancelled are terminal exception states.
- Use `submitted -> accepted` as the normal employee document lifecycle; rejected documents require resubmission, expired files remain visible as renewal risk, and archived files are hidden from active HR views.
- HR records are sensitive; keep route visibility to HR and leadership roles unless a later permission-matrix decision expands employee self-service.
- Use the shared record activity surface for contracts, leave notes, medical certificates, handover notes, onboarding evidence, appraisals, and HR correspondence.

Module registry:

- Use `/ops/modules` to show the user's live workspace modules and role-relevant planned ERP modules.
- Keep module group and status metadata in `src/lib/ops/constants.ts`.
- Use `ready` status only for modules with implemented routes.
- Use `planned` status for roadmap modules that should be visible but not navigable yet.
- Group live workspace modules under Operations, Commercial, and Records.
- Group planned roadmap modules by their roadmap domain where useful.
- Do not add sidebar links for planned modules.
- Do not add `/ops/modules` to the sidebar.
- Show `/ops/executive` only to leadership roles; it may appear as its own Executive group because it is not a daily department work queue.
- Developer should see all live work modules and all planned modules in `/ops/modules`.
- Other roles should see only the modules assigned to their role privileges.
- Treat module visibility as separate from action permissions; create/edit/approve/archive/export rules still need server-side permission checks.

## Component Inventory

Current shared ops components:

| Component | Purpose |
| --- | --- |
| `OpsShell` | Main layout, desktop sidebar, mobile drawer, profile panel |
| `OpsBrandMark` | Pymble Operations SVG mark for sidebar, mobile header, login, and loading UI |
| `OpsRouteLoader` | Branded accessible route fallback for slow ops page loads |
| `OpsNavLink` | Active nav link |
| `OpsLoginForm` | Client login/reset form |
| `OpsLogoutButton` | Sign out action |
| `OpsConfirmSubmitButton` | Two-step submit confirmation |
| `OpsListControls` | Shared server-rendered search and select filter bar |
| `OpsPaginationControls` | Shared previous/next pagination with result count |
| `OpsMobileRecordList` | Mobile record-list wrapper |
| `OpsMobileRecordCard` | Mobile record card |
| `OpsMobileRecordRow` | Labeled mobile record row |
| `OpsCommentTimeline` | Record comments with author, role, body, and timestamp |
| `OpsRecordActivityPanel` | Collapsed linked documents and internal comments for source records |
| `OpsTopUtilityBar` | Breadcrumb, current-page search, quick request action, workspace status, notifications, and public-site access |
| `OpsDashboardPanel` | Bordered dashboard panel for analytics, action queues, and source-linked summaries |
| `OpsKpiCard` | Compact metric tile with value, trend, icon, and action link |
| `OpsChartPanel` | Lightweight chart container for live operational counts |
| `OpsReportShortcutGrid` | Report/master-data shortcut cards for module landing pages |
| `OpsRoleOverviewDashboard` | Role-specific `/ops` dashboard composition for Executive, Delivery, Procurement, Commercial/QS, Finance, HSE, and People/HR |
| `OpsCommandPalette` | Cmd/Ctrl+K command palette for role-visible navigation, actions, and browser-local recent routes |

Planned shared ops components:

| Component | Purpose |
| --- | --- |
| `OpsBreadcrumbs` | Current route hierarchy inside the top utility bar |
| `OpsApprovalTimeline` | Approval request status, step history, and decisions |
| `OpsDocumentList` | Linked document metadata and versions |
| `OpsNotificationPanel` | Profile/sidebar notification surface |
| `OpsOverviewMapPanel` | Overview map plus focused site details |
| `OpsSiteMapClient` | Leaflet map client component |

Current shared classes:

| Export | Purpose |
| --- | --- |
| `OPS_FOCUS_CLASS` | Visible focus rings |
| `OPS_INPUT_CLASS` | Standard input/select styling |
| `OPS_LABEL_CLASS` | Standard form label styling |
| `OPS_PRIMARY_BUTTON_CLASS` | Primary action button |
| `OPS_SECONDARY_BUTTON_CLASS` | Secondary action button |
| `OPS_DANGER_BUTTON_CLASS` | Destructive action button |
| `OPS_TABLE_SCROLL_CLASS` | Keyboard-focusable table scroll region |

## Future Component Backlog

Build these before large module expansion:

- `OpsPageHeader`
- `OpsBreadcrumbs`
- `OpsMetricTile`
- `OpsNotice`
- `OpsToast`
- `OpsFormSection`
- `OpsFormActions`
- `OpsStatusPill`
- `OpsDataTable`
- `OpsAttachmentUploader`
- `OpsDocumentList`
- `OpsApprovalPanel`
- `OpsApprovalTimeline`
- `OpsCommentThread`
- `OpsAuditTrail`
- `OpsDashboardSection`
- `OpsEmptyState`

These components should reduce repeated markup across Engineering, Procurement, Finance, Operations, HSE, HR, Commercial, and Executive modules.

## Module Page Standards

Every new module page should define:

- route
- visible roles
- create/update roles
- page header
- primary record table/card
- create/edit flow
- empty state
- success/error feedback
- audit event behavior
- documents/attachments behavior
- dashboard metrics
- mobile behavior

Every server action should define:

- schema validation
- permission check
- database write
- audit event
- revalidation path
- redirect/notice behavior

## Testing Standards

Current focused tests live in `tests/` and run with:

```txt
npm run test
```

Current coverage:

- role-aware module visibility and Developer override
- dashboard snapshot normalization and fallback behavior
- listing state parsing, pagination metadata, and safe PostgREST search filter generation
- approval decision guards
- document mutation guards
- document download guards
- record activity source and comment validation
- supplier register and supplier performance event guards
- RFQ and purchase order guards
- stores and inventory guards
- purchase order approval threshold and issue guards
- finance bridge budget/payment workflow guards
- finance ageing and reporting date helpers
- delivery exception ageing and follow-up date helpers
- equipment and fleet workflow guards
- notification acknowledgement form parsing and notice URL helpers
- safe notification return paths
- upload type, size, and private object filename validation

Future focused tests should be added before each workflow becomes operationally risky, especially for financial calculations, payment/PO approvals, HSE incident closure, and staff account changes.

## Design Review Checklist

Before finishing any ops UI change:

- Does it work on a 390px-wide phone?
- Does it work with keyboard tab/focus?
- Are buttons at least 44px high?
- Does the page avoid horizontal overflow?
- Is there an accessible name for every action?
- Are tables converted to mobile cards where needed?
- Are labels and empty states operational and non-technical?
- Is the visual hierarchy consistent with other ops pages?
- Does the page avoid nested cards and marketing layout patterns?
- Does the implementation reuse existing ops components/classes first?

## Implementation Review Checklist

Before finishing any ops module change:

- Run focused tests with `npm run test`.
- Run lint.
- Run production build.
- Verify at least one route visually when frontend changed.
- Check that secrets are not committed.
- Check that service-role logic is server-only.
- Check that new tables are documented in the roadmap.
- Check that permissions are documented.
- Check that migrations are listed in setup docs if production setup depends on them.
- Check duplicate-submit and race-condition risks.
- Check that high-risk actions have confirmations.
- Check that server actions validate input and permissions.
- Check that meaningful writes create audit events.
- Check that growing list pages have a pagination/filter plan.
- Check that dashboard queries have an index/view/RPC strategy.
- Check that file uploads validate type, size, and private storage behavior.
- Check that production rollback or recovery notes exist for high-risk migrations.

## Relationship to Roadmap

Use this design-system document with:

- `docs/pymble-ops-erp-roadmap.md`
- `docs/pymble-ops-setup.md`

The roadmap defines what to build and how modules connect. This document defines how the ops system should look, feel, behave, and stay consistent while those modules are built.
