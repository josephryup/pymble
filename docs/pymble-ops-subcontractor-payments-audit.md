# Pymble Ops Subcontractor Payments Audit & Plan

Last updated: 2026-07-08

Triggered by: an Operations Manager requested a subcontractor payment and it was not
visible to Finance/MD. A first pass (2026-07-08, see "Fix plan" below) added
notifications and a Finance queue on the subcontractors page. A follow-up complaint
the same day — Finance still has to navigate into Subcontractors to see it, and the
Finance/Executive/role overview dashboards don't count it as a pending payment at all —
triggered the deeper audit in "Round 2" below. Round 3 widens the lens to the whole
Finance dashboard/queue system (prompted by: "even material requests reaching the
Finance stage don't show on the Finance dashboard — how do they approve?") and answers
a role-design question (should `finance_manager` and `accountant` merge into one role).
**This document is audit only; no code changes are included in Round 2 or Round 3.**

Related docs: `pymble-ops-ui-consistency-audit.md`, `pymble-ops-dashboard-analytics-audit.md`.

## Root cause

**There are two separate, disconnected "subcontractor payment" systems in the app.**
The OM used the correctly-labelled one — but that one is a dead end with no downstream
visibility, notifications, or ledger integration.

| | Finance → Payment Requests (`/ops/payment-requests`) | Subcontractors module (`/ops/subcontractors/[id]`) |
|---|---|---|
| Table | `payment_requests` | `subcontractor_payments` |
| How you reference the payee | Pick a **supplier** from the generic `suppliers` table (`supplier_id`) | Pick an **assignment** on a specific subcontractor's own page |
| Status flow | `draft → submitted → finance_review → approved → paid` (or rejected/cancelled) | `pending → approved / paid / rejected` |
| `payment_type` field | Has a `"subcontractor"` option — a *tag*, not a link to the subcontractor register | N/A — this table *is* the subcontractor register's payment log |
| Feeds the budget/GL ledger | Yes | **No** |
| Visible in Approvals module | Yes | **No** |
| Triggers a notification | Yes (submit / approve / reject) | **No** |
| Where it's visible | Its own register page, all statuses, to everyone with finance-view roles | **Only** on that one subcontractor's detail page, nested inside the specific assignment card |

### Code references

- Table + status types: `src/lib/ops/subcontractors.ts:20` (`OpsSubcontractorPaymentType`),
  `:26` (`OpsSubcontractorPaymentStatus`), `:72` (`OpsSubcontractorPayment`).
- Request action: `src/lib/ops/subcontractor-actions.ts:287`
  (`requestSubcontractorPaymentAction`) — inserts into `subcontractor_payments` with
  `status: "pending"`. No `queueOpsNotification` / `fanoutToOpsRoles` call anywhere in
  this function.
- Decision action: `src/lib/ops/subcontractor-actions.ts:345`
  (`decideSubcontractorPaymentAction`) — same gap, no notification on approve/reject/paid.
- Financial rollup is purely client-side aggregation, never posted to the ledger:
  `computeOpsSubcontractorFinancials` at `src/lib/ops/subcontractors.ts:214` only sums
  `payments` in memory — it never writes to `project_cost_entries` the way
  `upsertMaterialRequestCostEntries` does for material requests.
- Confirmed zero references to `subcontractor_payments` outside the two subcontractor
  pages: not in `lib/ops/approvals.ts`, `approvals-insight.ts`, `approvals-departments.ts`,
  `escalations.ts`, `notification-fanout.ts`, `dashboard-snapshots.ts`, or any KPI/exec
  report.

### Permissions (not the blocker)

`operations_manager` is in `ALLOCATION_ROLES` (`src/lib/ops/subcontractor-permissions.ts:18`),
which grants `canAllocateSubcontractor` → `canRequestSubcontractorPayment` (`:56`). So the
OM's submission almost certainly succeeded and is sitting as a `pending` row — it just has
no way to surface to anyone who isn't already looking at that specific subcontractor's page.

## What almost certainly happened

1. OM opened `/ops/subcontractors/[id]`, found the assignment, used "Request payment".
2. The row was created successfully (`status: "pending"`).
3. Nothing notified Finance or MD. No Approvals queue entry. No KPI or badge anywhere else
   in the workspace references pending subcontractor payments.
4. Finance/MD never thought to check that one subcontractor's page, so from their
   perspective the request "doesn't exist."

This is a missing-integration gap, not a data-loss bug.

## Design intent vs. what shipped

Per the original migration comment (`supabase/migrations/20260703090000_pymble_ops_subcontractors.sql:1`):
> "Operations Manager owns the subcontractor register; Finance owns payments."

The request/approve actions shipped without the notification fanout and cross-module
visibility every other approval-style flow in the app has (material requests, payment
requests, invoices all notify and often appear in the Approvals module).

## Secondary gap: two unlinked "subcontractor" concepts

`suppliers.kind` has a `'subcontractor'` enum value (`supabase/migrations/20260610150000_pymble_ops_supplier_kind.sql`),
added so Finance's generic Payment Requests / RFQ / PO flows can treat subcontractors as
a cost category. But there is no FK or sync between a `suppliers` row and a
`subcontractors` row — they are two independent lists of what should conceptually be the
same companies. A subcontractor in the dedicated register is not automatically pickable
from the Finance payment-request supplier dropdown, and vice versa.

## Fix plan

- [x] **(2026-07-08) Notify Finance + leadership on request, and the requester on
      decision.** `requestSubcontractorPaymentAction` now fans out to Finance
      (`finance_manager`, `accountant` — action-needed) and oversight (`managing_director`,
      `general_manager`, `owner`) via `fanoutToOpsAudiences`, with a rich body (requester,
      payment type, amount, company, site) and a deep link to `#payment-<id>`.
      `decideSubcontractorPaymentAction` notifies the original requester of the outcome
      (approved / paid / rejected, with any note). Both use idempotency keys.
- [x] **(2026-07-08) Finance queue on the subcontractors list page.**
      `fetchOpsPendingSubcontractorPayments` (gated to `canApproveSubcontractorPayment`)
      returns every pending payment across the register with company, trade, site,
      requester, and amount. A "Payments awaiting Finance" panel at the top of
      `/ops/subcontractors` shows the count + total and lets Finance approve / mark paid /
      reject each one inline — no need to open individual subcontractors.
      Verified against live data: surfaced 2 previously-invisible pending payments
      (HENRY PAVERS AND KERBSTONES, interim ZMW 6,000 + 14,100, site 0004).
- [ ] Decide (separate conversation — architectural call, not a quick fix) whether
      subcontractor payments should post to `project_cost_entries` on approval/paid the
      way material requests and payment requests do, so subcontractor spend shows up in
      budget variance and the GL. **Still open.**
- [ ] Decide whether the `suppliers.kind = 'subcontractor'` list and the dedicated
      `subcontractors` register should be reconciled/linked, or whether the split is
      intentional and just needs documenting for users. **Still open.**

## Round 2 (2026-07-08) — the queue helps, but the dashboards are still blind

**The user's complaint is correct on both counts.** The Round 1 fix (notifications +
a queue panel) closed the "nobody was ever told" gap, but it didn't touch any of the
places Finance/MD/OM actually live day-to-day. Every number they look at first is
still computed from `payment_requests` only.

### Finding 1: the queue is still bolted onto the wrong page

The "Payments awaiting Finance" panel lives on `/ops/subcontractors` — a register page
Finance has no routine reason to open (it's the OM/Projects Manager's register, per the
original migration comment). Finance's actual daily surface is `/ops/payment-requests`
and the landing dashboard (`/ops`, i.e. `OpsRoleOverviewDashboard`). Putting the queue
only on the subcontractor register repeats the shape of the original bug at a smaller
scale: right data, wrong home.

### Finding 2: zero dashboard/KPI coverage, confirmed by grep across every layer

`subcontractor_payments` / `subcontractor` does not appear **anywhere** in:

| Layer | File | What it computes | Confirmed absent |
|---|---|---|---|
| Finance dashboard KPIs | `src/lib/ops/finance.ts:834` `fetchOpsPaymentRequestStats` | draft/submitted/approved/paid counts + unpaid amount — `payment_requests` only | ✓ no subcontractor query |
| Finance ageing/cashflow | `src/lib/ops/finance.ts:883` `fetchOpsFinanceAgeingDashboard`, `:985` `fetchOpsFinanceCashflowDashboard` | who's owed what and when, bucketed by due date — `payment_requests` only, uses `due_date` | ✓ no subcontractor query (subcontractor payments have `scheduled_for`, the equivalent field, but it's never read here) |
| Landing dashboard (all roles) | `src/lib/ops/overview-role-metrics.ts:107` `paymentRequestsPending` | the single number that drives every "Payment queue" KPI card, action-item banner, and tone (warn/good) across `OpsRoleOverviewDashboard.tsx` (13 usage sites: lines 392, 426, 475–477, 650–651, 775, 811, 863–866, 1679–1680) | ✓ counts `payment_requests` in `["submitted","finance_review","approved"]` only |
| Executive report | `src/lib/ops/executive.ts` | portfolio-wide payables/exposure rollup | ✓ zero references |
| Escalations / SLA | `src/lib/ops/escalations.ts:409,424` | overdue-item alerts, keyed by `source_table` — explicitly lists `material_requests` and `payment_requests` | ✓ `subcontractor_payments` never named |
| Approvals module | `lib/ops/approvals.ts`, `approvals-insight.ts`, `approvals-departments.ts` | the cross-cutting approvals queue | ✓ zero references |

So today: a Finance user can open the Finance dashboard, see "Payment queue: 0," and be
correct by the dashboard's own (incomplete) definition — while two real pending
subcontractor payments worth ZMW 20,100 sit unseen. This is exactly the "not smart"
feeling described — it's not one broken page, it's that "pending payment" was defined
in one place (`payment_requests`) and subcontractor payments were never folded into
that definition anywhere downstream.

### Finding 3 (the "smart" fix): a GL/budget design that closes all three gaps at once

The good news: the ledger this needs already exists and is already generic enough.
`project_cost_entries` (checked directly against the live schema) has:

- `source_table` / `source_id` (text/uuid) — the generic linkage `payment_requests` and
  `material_requests` already use. A row with `source_table = 'subcontractor_payments'`
  needs **no new column** to exist validly.
- `budget_id` / `budget_line_id` — both **nullable**. Subcontractor spend can post at the
  site level (via `subcontractor_assignments.site_id`, which is `NOT NULL`) even before
  anyone links it to a specific budget line.
- `status` (`committed | posted | cancelled`) — the same three-state model
  `upsertMaterialRequestCostEntries` (`src/lib/ops/project-cost-entries.ts:119`) already
  writes through `upsertProjectCostEntry` (`:16`), which is source-agnostic by design
  ("Both Payment Requests and Material Requests write through this single code path" —
  its own doc comment invites a third caller).

**Concretely, this would mean:**

1. On `decideSubcontractorPaymentAction`'s `"approved"` transition, call
   `upsertProjectCostEntry` with `status: "committed"`, `cost_type: "subcontractor"`,
   `source_table: "subcontractor_payments"`, `site_id` from the assignment, amount from
   the payment — mirroring exactly what `decideMaterialRequestCostAction` does today.
   On `"paid"`, flip the same entry to `status: "posted"`. On `"rejected"`, no entry (or
   cancel an existing one if it was already committed).
2. Once entries exist, **all three findings above resolve for free**, because
   `fetchOpsBudgetVarianceDashboard`, the ageing/cashflow dashboards, and
   `paymentRequestsPending`-style counts are exactly the kind of aggregate queries that
   should read `project_cost_entries` (or be extended with one more `.from()` call
   alongside `payment_requests`) rather than each request type inventing its own
   parallel total.
3. `subcontractor_assignments` has no `budget_line_id` today — that's a real schema gap
   if line-level budget tracking is wanted, but it is **not** a blocker for site-level
   visibility (ageing, cashflow, "pending payment" counts) since those only need
   `site_id` + amount + a due-ish date (`scheduled_for`), all of which already exist.
4. This also naturally answers the "where does the count show up" complaint: once
   subcontractor spend is in `project_cost_entries`, a single additional read in
   `fetchOpsOverviewRoleMetrics` (or a parallel `pendingSubcontractorPayments` field
   folded into the existing `finance.paymentRequestsPending` number) makes it appear on
   the landing dashboard, the Finance page, and the executive report simultaneously —
   instead of needing three separate bespoke wiring passes.

### Updated fix plan

- [ ] Post subcontractor payment decisions through `upsertProjectCostEntry` (committed on
      approval, posted on paid), giving subcontractor spend a real ledger presence.
- [ ] Fold subcontractor pending-count and amount into `paymentRequestsPending` /
      `fetchOpsPaymentRequestStats` (or add sibling fields) so the landing dashboard,
      Finance page, and executive report all update from one source of truth.
- [ ] Extend `fetchOpsFinanceAgeingDashboard` / cashflow to include subcontractor
      payments keyed off `scheduled_for`, so Finance's "who's owed and when" view is
      complete.
- [ ] Add `subcontractor_payments` to the escalation module's tracked source tables so
      an ignored pending payment ages into an overdue alert like every other request type.
- [ ] Reconsider where the "Payments awaiting Finance" panel lives — likely duplicate it
      (or move it) onto `/ops/payment-requests` and/or the landing dashboard, not leave it
      solely on the OM's subcontractor register.
- [ ] (Unchanged from Round 1, still open) Decide on `budget_line_id` for
      `subcontractor_assignments` if line-level budget commitment is wanted, and whether
      `suppliers.kind='subcontractor'` should reconcile with the dedicated register.

## Round 3 (2026-07-08) — the whole "Finance stage" is dashboard-invisible, and merging roles won't fix it

Two questions this round: (1) when a material request reaches the Finance cost-approval
stage, how does Finance actually know to act? (2) would merging `finance_manager` and
`accountant` into one role produce "a full solid workflow"?

### Question 1: how does Finance currently learn a material request needs them?

**One channel only: a one-time notification.** `attachMaterialRequestPricingAction`
(`src/lib/ops/material-request-actions.ts:948`) does correctly call
`fanoutToOpsRoles(["finance_manager", "accountant"])` and `queueOpsNotification` the
moment Procurement prices a request — so this is *better* than the subcontractor flow
was before Round 1. But after that one notification:

- **Finance dashboard** (`/ops/finance`) has zero KPI cards or links pointing at
  `/ops/material-requests` — confirmed by reading every `<OpsKpiCard href=...>` on the
  page (`src/app/ops/(workspace)/finance/page.tsx:133-194`): all hrefs go to
  `/ops/payment-requests`, `/ops/invoices`, or `/ops/project-budgets`. A request sitting
  in `priced` status is invisible here.
- **"My Queue" widget** (`OpsMyQueue`, rendered on the `/ops` landing page for every
  role) is the one piece of UI explicitly designed to answer "what needs my decision
  today" — and it still misses this. `fetchOpsMyQueue` (`src/lib/ops/overview-queue.ts:139-152`)
  gives Finance exactly one task: a count of `payment_requests` in
  `["submitted", "finance_review"]`. It never queries `material_requests` for
  `status = "priced"`, and (confirmed separately) never queries `subcontractor_payments`
  either.
- The **generic Approvals module** count in the same file
  (`countActionableApprovals`, `:55-91`) only reads the `approval_steps` table — the
  multi-step chain used for e.g. the Operations-manager review step. Material requests'
  Finance decision is a **bespoke status-column transition**
  (`priced → approved/rejected` via `decideMaterialRequestCostAction`), not a row in
  `approval_steps`, so it was never going to show up here regardless.
- The brand-new **MD review stage** for IT-scoped requests (`md_review`, shipped earlier
  today) has exactly the same gap: no queue entry, no dashboard KPI. It only exists as a
  notification to the MD.

**So the honest answer to "how do they approve" is: they see the email/in-app
notification once, and if they miss it, archive it, or aren't the specific person who
happened to be online when it fired, there is no second signal anywhere in the app.**
This is the same shape of problem as the subcontractor payments gap in Round 1/2 — a
real, working notification with no persistent, glanceable backstop.

### Question 2: should `finance_manager` and `accountant` merge?

**No — and the reason is worth stating precisely: merging them would not fix the
problem described, because both roles already have identical decision authority on
every workflow this audit has covered.**

Confirmed directly in code:

- `MATERIAL_REQUEST_FINANCE_APPROVAL_ROLES` (`src/lib/ops/material-request-permissions.ts:96-101`)
  — `finance_manager` and `accountant` are both present. Either role can already approve
  a priced material request today.
- `FINANCE_PAYMENT_ROLES` (`src/lib/ops/subcontractor-permissions.ts:30-36`) — same
  thing for subcontractor payment decisions.
- `PAYMENT_APPROVE_ROLES` in `src/lib/ops/finance-permissions.ts:68-75` is the **one**
  place these two roles genuinely diverge in the Payment Requests flow: `accountant` is
  *not* in it (only `finance_manager` + leadership can approve a `payment_requests` row
  after `finance_review`), while `PAYMENT_REVIEW_ROLES` (`:58-66`) — who can move it
  into `finance_review` in the first place — includes both. That's a deliberate two-step
  maker/checker split (accountant reviews, finance_manager or above approves), the same
  pattern repeated everywhere else in the codebase:

| Module | Accountant can... | Only Finance Manager (or above) can... |
|---|---|---|
| Chart of accounts (`chart-of-accounts-permissions.ts:8-23`) | View | Add/rename/deactivate accounts |
| Commercial certifications (`commercial-permissions.ts:73-104`, ~30 gate functions) | View | Certify IPCs, approve variations/claims/contracts/valuations, release retention, approve forecasts, verify milestones |
| Invoices (`invoice-permissions.ts:8-34`) | Create/manage | Void an invoice |
| Equipment (`equipment-permissions.ts:27-46`) | Broad view | Approval-tier actions |
| Payment requests (`finance-permissions.ts:58-75`) | Move to finance_review | Final approve |
| PO / escalation ownership (`escalations.ts:67-76`) | Get flagged on finance escalations | Own purchase-order escalations |

This is a textbook **preparer/approver (maker-checker) separation of duties** — a
standard finance internal control, not accidental role sprawl. It shows up consistently
across at least 8 files, always in the same direction (accountant = operate/prepare,
finance_manager = approve/restructure/void), which is strong evidence it was designed
this way deliberately rather than drifted into.

**Merging the roles would remove that control and would not touch the actual bug.**
The workflows the user is running into trouble with (material request cost approval,
subcontractor payment decisions) are exactly the ones where the two roles are *already*
equal. The real fix is dashboard/queue wiring, and it benefits `finance_manager` and
`accountant` identically without touching the role model at all.

### Round 3 fix plan (extends, does not replace, the Round 2 plan) — SHIPPED 2026-07-08

- [x] Added a `material_requests` count (`status = "priced"`) to `fetchOpsMyQueue`'s
      `FINANCE` branch (`src/lib/ops/overview-queue.ts`) — same shape as the existing
      `payments` task, href `/ops/material-requests?status=priced`.
- [x] Added a `subcontractor_payments` pending count to the same `FINANCE` branch,
      surfacing the Round 1 data through the mechanism Finance already looks at (in
      addition to, not instead of, the `/ops/subcontractors` panel).
- [x] Added an MD-scoped queue task (`MD_REVIEWERS` = developer/owner/managing_director,
      mirroring `canApproveMaterialRequestMdReview`) for `material_requests` in
      `md_review` status, href `/ops/material-requests?status=md_review`.
- [x] Added a "Material requests — cost approval needed" + "Subcontractor payments to
      review" KPI row to the Finance dashboard (`src/app/ops/(workspace)/finance/page.tsx`),
      same visual pattern as the Payment Requests page KPI cards — count + href +
      `tone="warn"` when count > 0, always visible (matches house convention of showing
      zero-state rather than hiding the section).
- [x] New lightweight count fetchers: `fetchOpsMaterialRequestsPricedCount`
      (`src/lib/ops/material-requests.ts`, gated to `canApproveMaterialRequestCost`) and
      `fetchOpsPendingSubcontractorPaymentsCount` (`src/lib/ops/subcontractors.ts`, gated
      to `canApproveSubcontractorPayment`).
      Verified against live data before/after: **4 material requests were sitting in
      `priced`** and 2 subcontractor payments were pending — all previously invisible
      outside a one-time notification or a direct visit to `/ops/subcontractors`. All now
      surfaced on the Finance dashboard and in "My Queue".
      `npm run verify` (tsc + eslint + tests): clean, 307/307 passing.
- [ ] Once the Round 2 GL/ledger integration lands (subcontractor payments posting
      through `project_cost_entries`), the same Finance-dashboard KPI card pattern can
      pick up subcontractor pending *amounts* (not just counts) for free, per the
      Round 2 design note. **Still open.**
- [ ] Do **not** merge `finance_manager` and `accountant` — document the maker/checker
      pattern above as intentional if it ever comes up again, so it isn't accidentally
      "simplified" away in a future refactor. **Decision recorded, no code needed.**
