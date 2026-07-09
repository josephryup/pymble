# Pymble Ops System-Wide Audit — Mobile, Notifications, Dashboards

Last updated: 2026-07-08

Triggered by: a mobile screenshot showing the Material Request "Workflow progress"
chain tracker rendering as an unreadable horizontal overlap on a phone, plus a request
for a full-codebase pass on missing workflow plans, notification completeness, and
dashboard/UI consistency. **Status: the remediation plan was implemented on
2026-07-08** (see the checklist at the bottom — every item is marked with what
shipped; one item, the escalation-engine extension, is deliberately deferred with
rationale). Sections 1–6 are preserved as the audit record.
It builds on and cross-references `pymble-ops-subcontractor-payments-audit.md` (which
found and fixed the same "silent workflow" pattern for material requests and
subcontractor payments) and `pymble-ops-ui-consistency-audit.md` /
`pymble-ops-dashboard-analytics-audit.md` (styling/chart consistency, already largely
shipped). Section 6 (added same day) covers two follow-up requests: a new Projects
Manager review stage for site-scoped material requests, and read/unread notification
styling.

## 1. The mobile chain-tracker overlap — root cause found, high confidence

**Root cause: `src/app/ops/layout.tsx` exports a custom `viewport` object that omits
`width` and `initialScale`, which silently deletes Next.js's default
`width=device-width, initial-scale=1` meta tag for every `/ops/*` route.**

```ts
// src/app/ops/layout.tsx — as it stands today
export const viewport: Viewport = {
  themeColor: "#2235DD",
  viewportFit: "cover",
};
```

In the Next.js App Router (confirmed on the installed version, `next@^16.2.6`), the
`viewport` export is authoritative once present — it does **not** get merged with
Next's defaults. If a route tree has no `viewport` export at all, Next injects
`width=device-width, initial-scale=1` automatically. The moment `src/app/ops/layout.tsx`
added its own `viewport` (to get `viewportFit: "cover"` for PWA safe-area insets —
a real, deliberate need, see the comment already in that file), it **silently dropped**
the width/scale fields nobody remembered to also carry forward.

### Why this produces exactly the screenshot

Without `width=device-width`, a mobile browser falls back to its default "desktop-ish"
layout viewport (historically ~980px on Android Chrome, similar on iOS Safari), then
zooms the whole rendered page out to fit the physical screen. Tailwind's `sm:` (640px)
breakpoint is evaluated against that virtual ~980px width, not the phone's real ~390px
width — so `sm:` (and possibly `md:`) styles fire on a phone. That's precisely what
`OpsChainTracker` (`src/components/ops/OpsChainTracker.tsx:53`) does:

```tsx
<ol className="mt-3 grid gap-3 sm:grid-flow-col sm:auto-cols-fr">
```

Below `sm`, each step is a single vertical row (`flex items-start gap-2.5` per step) —
correctly designed for mobile. At/above `sm`, it switches to a 7-column horizontal grid
with labels centered under each dot. **The screenshot is the desktop 7-column layout
rendering on a phone**, because the browser's CSS engine legitimately believes the
viewport is wide enough to qualify for `sm:`. This isn't a bug in `OpsChainTracker`
itself — the component's responsive design is fine; it's being fed the wrong viewport
width by its ancestor layout.

### Why "marketing page UI leaking" is very likely this same bug, not a literal chrome leak

Checked directly and ruled out as a separate issue:

- `AppChrome` (`src/components/layout/AppChrome.tsx:10-23`) explicitly excludes
  `/ops` and `/login` from the marketing `Header`/`Footer`/`SchemaOrg` wrapper via an
  `isAppRoute()` prefix check. Confirmed correct — no literal marketing header/footer
  renders on ops routes.
- The marketing site's typographic overrides in `globals.css` are correctly scoped under
  `.public-site h1/h2/h3/h4` (`src/app/globals.css:100-141`) and cannot bleed into ops
  markup, which never carries that class.

So there is no code path that would literally inject marketing components into ops
pages. What the user is describing as "leaking marketing UI" is almost certainly the
**visual effect** of desktop-style, wide-viewport layouts (the kind a marketing site
is built for) rendering unexpectedly cramped onto a phone screen — which is exactly
what the viewport bug produces, not a separate bug.

### Blast radius

`grep -rc "sm:\|md:\|lg:\|xl:"` across `app/ops` + `components/ops` returns **1,011**
responsive-breakpoint usages. Every one of them is currently being evaluated against
the wrong virtual viewport on a real phone. This is very likely not limited to the one
screenshot — any ops page whose mobile layout depends on a breakpoint boundary (not just
full-width single-column stacks, which happen to look fine at any viewport width) is at
risk of the same class of bug. The root layout (`src/app/layout.tsx`) has **no**
`viewport` export at all, so it correctly gets Next's default and marketing pages are
unaffected — this confirms the bug is `/ops`-scoped, matching the user's report.

**Why this was never caught visually in this project:** per project memory, the local
dev server is too slow on this machine for live preview, so UI changes have been
verified via `npm run verify` (tsc/eslint/tests) rather than a browser. Browser-based
responsive testing tools that resize an actual desktop browser window (rather than
loading the page fresh on a real/emulated mobile viewport) would not surface this bug
either, since resizing an already-loaded desktop tab doesn't re-evaluate the page's meta
viewport tag the way a fresh mobile page-load does. That is a plausible, unforced reason
this slipped through every prior UI pass.

### Fix shape (not applied)

Add the missing fields back to the existing `viewport` export — this is additive, not a
rewrite:

```ts
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#2235DD",
  viewportFit: "cover",
};
```

One line. Every one of the 1,011 responsive breakpoints downstream should self-correct
once the real viewport width reaches the browser.

## 2. System-wide notification audit — the subcontractor-payments pattern repeats everywhere

The earlier audit (`pymble-ops-subcontractor-payments-audit.md`) found and fixed one
instance of a recurring shape: **a real multi-stage workflow (submit → someone else
decides) where the "someone else" is never told.** A full sweep of every
`lib/ops/*-actions.ts` file (45 files) for `queueOpsNotification` /
`fanoutToOpsRoles` / `fanoutToOpsAudiences` usage against the number of exported server
actions in each file found this is **not an isolated case** — it's close to the norm.

### Confirmed: none of these ride the generic approval chain either

For every module below, `grep -c "approval_steps\|approval_requests"` returned **0** —
these are bespoke status-column workflows exactly like material requests' Finance
decision was before Round 3, so they are invisible to the generic Approvals module and
to "My Queue" (`fetchOpsMyQueue`) in addition to having no notifications. (Payment
requests also carry an unused `approval_request_id` FK column with no trigger or code
path that ever populates it — vestigial, not a real integration.)

### Ranked findings (by number of silent actions in the module — a proxy for blast radius)

| Module | Actions | Notif. calls | Real workflow gaps (submit/approve pairs confirmed silent) |
|---|---|---|---|
| `commercial-actions.ts` | 55 | **0** | IPC submit→certify→reject, variation submit→price→approve→reject, claim submit→review→agree→reject, valuation submit→certify→reject, retention-release submit→approve→release→reject, cashflow-forecast create→approve→lock, milestone create→achieve→certify→delay. This is the single largest gap in the app — QS/Finance/PM decision roles (`COMMERCIAL_DECISION_ROLES`, see the subcontractor-payments audit's role table) get zero signal that money-moving commercial records need their decision. |
| `hse-compliance-actions.ts` | 34 | **0** | Risk assessment submit→approve, compliance-audit create→"requires action"→close, PPE issue/return/damage/loss. Silence here is a genuine safety-process risk, not just UX friction — a submitted risk assessment awaiting approval has no signal to the approver. |
| `engineering-controls-actions.ts` | 31 | **0** | Site instruction issue→acknowledge→close, QA inspection create→complete→"requires action"→close, snag item create→resolve→verify. |
| `hr-actions.ts` | 27 | **0** | `submitLeaveRequestAction` → `approveLeaveRequestAction`/`rejectLeaveRequestAction` — neither the approver nor (on decision) the employee is notified. Partially softened: `overview-queue.ts`'s `HR` branch does count `leave_requests(status=submitted)` in the My Queue widget, so there's a persistent count even without a push notification — same "partial coverage" shape as material requests before Round 3. Employee document accept/reject is also silent. |
| `equipment-actions.ts` | 19 | **0** | `submitEquipmentRequestAction` → `approveEquipmentRequestAction`/`rejectEquipmentRequestAction` fully silent. |
| `fleet-logistics-actions.ts` | 17 | **0** | `submitTransportRequestAction` → `approveTransportRequestAction`/`rejectTransportRequestAction` fully silent. |
| `payroll-actions.ts` | 10 | **0** | `createPayrollRunAction` → `approvePayrollRunAction` — a payroll run awaiting approval has zero signal to whoever approves it. Affects real people's pay; worth prioritizing alongside commercial. |
| `invoice-actions.ts` | 7 | **0** | `sendInvoiceAction`/`markInvoicePaidAction` — lower priority (outbound-facing / already surfaced via the Finance ageing dashboard), but a paid invoice or a void currently notifies nobody internally either. |
| `recruitment-actions.ts` | 6 | **0** | `updateJobApplicationStatusAction` silent, though (like leave requests) `overview-queue.ts`'s `HR` branch already counts `job_applications(status=new)`. |
| `supplier-actions.ts` | 6 | **0** | `updateSupplierStatusAction` (e.g. suspending/blacklisting a supplier) never tells Procurement — a live order could go out to a supplier that was just blacklisted. |
| `delivery-exception-actions.ts` | 5 | **0** | Investigation start/resolve/close silent. |
| `staff-payroll-actions.ts` | 5 | **0** | Same shape as `payroll-actions.ts`. |

For comparison, the modules that **do** wire notifications correctly and can serve as
the template for fixing the above: `material-request-actions.ts` (15 notif. calls / 14
actions — the richest in the app, includes the Round 2/3 subcontractor-payments-style
fanout), `boq-actions.ts` (8/12), `rfq-po-actions.ts` (7/12), `subcontractor-actions.ts`
(5/6, fixed this session), `department-report-actions.ts` (5/5),
`approval-actions.ts` (5/2 — the generic chain itself).

### What this means in aggregate

Roughly **210 server actions across 12 modules** implement a submit/decide workflow
with no notification of any kind to the deciding party or (on decision) the submitter.
Every one of these is a candidate for the exact fix already proven twice this session
(material requests' MD stage, subcontractor payments): a `fanoutToOpsAudiences` or
`fanoutToOpsRoles` call at the submit transition, and a `queueOpsNotification` back to
the submitter at the decision transition.

## 3. System-wide dashboard/queue audit — same blind spot, same modules

Because none of the modules above populate `approval_steps`, and none of them are
referenced in `fetchOpsMyQueue` (`src/lib/ops/overview-queue.ts`) outside the two
exceptions already noted (`leave_requests`, `job_applications` — counted, but without a
push notification), **every one of these workflows is also invisible on every
dashboard**: the role landing page ("My Queue"), the Finance dashboard, the executive
report, and the escalation/SLA module (`src/lib/ops/escalations.ts`, which only tracks
`material_requests` and `payment_requests` by name).

This mirrors exactly the Round 3 finding for material requests' Finance stage: a
one-time notification (where one exists at all) is the *only* signal, with no
persistent, glanceable backstop anywhere a manager's eyes naturally land.

## 4. "Missing plans" — checked for unfinished/stub features

Searched for `TODO`, `FIXME`, "not yet implemented", "coming soon" across
`app/ops` and `lib/ops` — **zero matches**. Checked the module registry
(`src/lib/ops/constants.ts`, `OPS_MODULES`) — all 69 registered modules are marked
`status: "ready"`, none flagged as a placeholder or future phase stub. **There is no
evidence of half-built pages or dead-end stub features.** The "something is missing"
feeling is almost certainly the notification/dashboard completeness gap in sections 2–3
above, not literal unbuilt screens — the pages exist and work; the cross-cutting
signal that tells the right person "this needs you" is what's absent.

## 5. UI/UX consistency — status check against prior audits

`pymble-ops-ui-consistency-audit.md` and `pymble-ops-dashboard-analytics-audit.md`
already cover and largely shipped: shared notice-banner/status-badge/formatting
constants, Recharts adoption on dashboards, KPI card trend-arrow honesty, and most of
the legacy-color-token migration. Nothing new found here beyond what's already tracked
in those documents — the mobile viewport bug in section 1 is the one genuinely new
UI-layer finding from this pass, and it's a more severe, more foundational issue than
anything in the prior styling audits (it affects layout correctness, not just visual
polish).

## 6. Follow-up requests (2026-07-08) — new PM review stage, and notification read/unread styling

### 6a. Add a Projects Manager review stage before Operations — site-scoped requests only

Requested flow: for material requests where the scope is a project **site** (explicitly
not IT-scoped, which keeps its existing confidential MD-gated chain from the
subcontractor-payments audit; and not general/office-scoped, which keeps today's single
Operations step), insert a Projects Manager quality-check/audit step **before** the
existing Operations Manager step, so the PM can confirm the request and its listed
materials are accurate before Operations sees it. If no PM is available, the Managing
Director should be the fallback decision-maker for that stage specifically — not
Operations Manager, not General Manager.

Good news: the multi-step approval engine already exists and is fully generic, so this
is a much smaller change than it first looks. Traced the exact mechanics:

- `submitMaterialRequestForApprovalAction` (`src/lib/ops/material-request-actions.ts:651`)
  builds its approval chain by calling `materialRequestApprovalSteps(priority,
  estimatedTotal)` (`src/lib/ops/material-request-permissions.ts:113-131`), which
  currently ignores both arguments and always returns exactly one step:
  `approverRole: "operations_manager"`, `stepNumber: 1`. It doesn't even receive `scope`
  today.
- `decideOpsApprovalAction` (`src/lib/ops/approval-actions.ts:199-425`) is already
  step-count-agnostic: it always decides "the lowest-numbered still-pending step," then
  checks whether another pending step exists. If yes, the parent
  `approval_requests.status` becomes `"in_review"` and the next step's approver is
  notified (with role-fallback); if no, it becomes `"approved"`. Nothing here assumes
  exactly one step.
- `syncMaterialRequestApprovalStatus` (`src/lib/ops/approval-actions.ts:101-153`) maps
  the parent approval status straight onto `material_requests.status` (`in_review` →
  `in_review`, `approved` → `pricing_pending`, `rejected` → `rejected`) purely by
  reacting to the approval request's overall state — independent of how many steps
  produced that state. `in_review` already exists as a status precisely for "some but
  not all steps are done."

Net effect: adding a PM step for site scope is primarily a one-function change — give
`materialRequestApprovalSteps` a `scope` parameter and, for `scope === "site"`, return
two steps (`projects_manager` at `stepNumber: 1`, `operations_manager` at `stepNumber:
2`) instead of one. The advancement, in-review status, and final `pricing_pending`
transition all fall out of the existing engine for free.

Three things to get right, not just "add a step" — flagged so they aren't missed:

1. `materialRequestApprovalRecipientRoles(steps)`
   (`material-request-permissions.ts:213-222`) currently flattens every step's role into
   the initial submission-time notification fanout (`steps.map((step) =>
   step.approverRole)`). With one step today this is harmless. With a second
   (`operations_manager`) step, this would prematurely notify Operations at submission
   time, before the PM has done anything. This needs to change to only surface the
   first pending step's role at submission — later steps are already notified correctly
   when the chain reaches them.
2. The "fallback should be MD, not OM/GM" requirement needs a deliberate design choice —
   it does not fall out of existing generic machinery. Two separate fallback mechanisms
   exist and neither does what's being asked by default:
   - `OPS_ROLE_FALLBACK_CHAIN["projects_manager"]`
     (`src/lib/ops/notification-fanout.ts:24`) is `["operations_manager",
     "general_manager", "managing_director"]` — governs who gets *notified* when no PM
     exists, tries Operations first, and has no bearing on who is *authorized* to
     decide the step.
   - `canDecideOpsApprovalStep` (`src/lib/ops/approval-permissions.ts:10-31`) only
     auto-grants decision rights to the Managing Director when a step's `approver_role`
     is literally `"managing_director"` (the Developer override,
     `canOverrideApprovalDecision`, is Developer-only, not MD). A step whose
     `approver_role` is `"projects_manager"` cannot be decided by an MD today no matter
     how the notification fallback resolves.
   - Cleanest fix, reusing what already works: resolve "is there an active PM" once, at
     chain-construction time in `submitMaterialRequestForApprovalAction` (query `users`
     for an active `projects_manager`), and if none exists, insert that step with
     `approver_role: "managing_director"` directly rather than `"projects_manager"`.
     Because `canDecideOpsApprovalStep` already special-cases a literal
     `"managing_director"` role, this needs no change to the permission function itself
     — it becomes correct by construction, and the fallback goes straight to MD
     (skipping OM/GM) exactly as requested.
3. The chain tracker UI needs a matching step. `buildMaterialRequestChainSteps`
   (`src/lib/ops/material-requests.ts`) already conditionally inserts an extra
   `md_approved` step for IT-scoped requests. Site-scoped requests would need an
   analogous extra step (e.g. `pm_reviewed`) inserted before `operations_approved`,
   gated on `request.scope === "site"`, so the visual chain matches the real approval
   chain instead of silently skipping a stage the record actually went through.

Scope discipline, restated precisely: IT-scoped requests are unaffected (they never
call `materialRequestApprovalSteps` with `scope: "site"`, so they keep their single
Operations step, then their separate Finance → MD cost-approval chain, untouched).
General/office-scoped requests are also unaffected — the PM check is requested for
project-site material only.

### 6b. Notification read/unread visual distinction — the dock already does this; the full inbox page does not

Compared the two places notifications render:

- The floating dock (`src/components/ops/OpsNotificationDockClient.tsx:81-126`) already
  differentiates unread from read reasonably well: unread rows get a light blue
  background tint, a filled blue dot vs. a transparent one, and bold vs.
  semibold/lower-opacity title text. Read and unread items sit together in one
  scrollable list, split only into "Action needed" vs "Recent" sections — both states
  are visible at a glance without switching views.
- The full inbox page (`src/app/ops/(workspace)/notifications/page.tsx:212-294`) is
  markedly weaker. Every notification card uses identical styling regardless of
  read/unread state — same blue icon square, same bold heading weight, same body/meta
  text color. The only difference is a small text badge reading "unread" or "read" next
  to the title, plus whether a "Mark read" button is present. There is no background
  tint, dimming, or left-accent to let someone scan the list and immediately tell which
  items still need attention — exactly the gap being reported. Architecturally, the
  page also presents unread/read/archived as three mutually exclusive tabs rather than
  one merged, visually distinguished feed the way the dock does — you must switch tabs
  to see anything already read, with no single "Inbox" view where unread items simply
  stand out more (the more familiar, Gmail-style pattern).

Fix shape (not applied): reuse the dock's already-proven visual language directly on the
inbox cards (background tint / left-border accent + bold weight for unread, muted/
dimmed styling for read), and consider adding an "All" tab that merges unread + read
into one chronological feed with that same styling doing the differentiation — closing
both the cosmetic gap and the forced-tab-switching flow gap in one pass.

## Remediation plan (tracked, not started)

Ordered by blast-radius-to-effort ratio:

- [x] **(2026-07-08)** Added `width: "device-width"` and `initialScale: 1` to the
      `viewport` export in `src/app/ops/layout.tsx`, with a comment explaining why they
      must never be removed (custom viewport exports replace Next's defaults).
- [ ] After deploying, do a real mobile-viewport pass (physical device or DevTools'
      device-emulation, not a resized desktop window) across the highest-traffic ops
      pages — cannot be done in this environment (no runnable dev server); the fix
      itself is deterministic. **Owner action.**
- [x] **(2026-07-08)** Notification fanout for `commercial-actions.ts` — 12 wires:
      IPC submit→deciders/certify/reject, variation submit/priced→deciders +
      approve/reject→requester, claim submit→deciders + agree/reject→requester,
      valuation submit/certify/reject (status-helper conditional), retention release
      submit→Finance/QS + approve/release/reject→requester. All via the new shared
      `notifyOpsWorkflowEvent` helper (`src/lib/ops/workflow-notifications.ts`).
- [x] **(2026-07-08)** Payroll + staff payroll: run created→MD/GM approval needed,
      approved→Finance to complete/disburse, completed→Finance + MD oversight.
- [x] **(2026-07-08)** HSE compliance — **audit correction**: this module already had
      notifications via its own `queueOpsHseRoleNotifications` helper (risk-assessment
      submitted, high-residual approvals, audit non-conformances, audit action-required)
      which the original grep pattern missed; it was a false positive in the "zero
      notifications" table. Remaining real gap closed: risk-assessment approval now also
      notifies the assessment's creator/responsible person.
- [x] **(2026-07-08)** Remaining modules wired: engineering controls (instruction
      issued→assignee, snag resolved→engineering manager to verify, verified→assignee),
      HR leave (submit→HR, approve/reject→employee+creator with reason), equipment
      (submit→OM/PM, approve/reject→requester), fleet transport (submit→OM,
      approve/reject→requester), delivery exceptions (created→Procurement,
      resolved→reporter), suppliers (status change→Procurement with check-open-orders
      prompt), invoices (sent/paid/voided→Finance info), recruitment (application status
      →HR info). Employee-document accept/reject skipped — the mutation target carries
      no uploader id to notify; needs a schema/fetch change first.
- [x] **(2026-07-08)** `fetchOpsMyQueue` extended with four new role-scoped buckets:
      equipment + transport requests to approve (OM/PM/leadership), commercial records
      awaiting decision (aggregated across IPCs/variations/claims/valuations/retention,
      QS/PM/Finance/leadership), and payroll runs awaiting approval (draft workers +
      staff runs, leadership).
- [ ] Add the newly-notification-worthy source tables (equipment_requests,
      transport_requests, subcontractor_payments, leave_requests) to
      `src/lib/ops/escalations.ts`. **Deliberately deferred (2026-07-08):** each table
      touches the SLA config, the `OpsEscalationSnapshot` type (consumed by
      executive/overview KPIs), and the sweep's notification loop — a focused change
      with its own tests, not something to batch with 30+ notification wires. The My
      Queue counts above provide the persistent backstop in the meantime.
- [x] **(2026-07-08)** `materialRequestApprovalSteps` takes `scope`; site returns
      PM (step 1) then OM (step 2); general/IT unchanged. Unit-tested.
- [x] **(2026-07-08)** `materialRequestApprovalRecipientRoles` now only surfaces the
      lowest step number's role(s) at submission. Unit-tested (OM not summoned early).
- [x] **(2026-07-08)** PM→MD fallback resolved at chain construction in
      `submitMaterialRequestForApprovalAction`: if no active `projects_manager` user
      exists, the step is inserted with `approver_role: "managing_director"` and label
      "Projects Manager review (MD covering)"; recorded in the audit metadata
      (`pm_fallback_to_md`).
- [x] **(2026-07-08)** `pm_reviewed` chain step added for site scope (`submitted` =
      awaiting PM, `in_review` = PM done/awaiting Operations); Operations step's
      "current" window adjusted to match. Unit-tested for both scopes.
- [x] **(2026-07-08)** Inbox cards now use the dock's visual language: unread = blue
      left-border accent + `bg-sky-50/50` tint + solid blue icon square + bold title;
      read = transparent accent, muted icon, dimmed semi-bold title.
- [x] **(2026-07-08)** "All" tab added and made the default: unread + read merged into
      one chronological feed (archived stays separate); "Mark all read" available from
      it; count pill shows unread+read total.
