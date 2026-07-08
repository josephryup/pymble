# Pymble Ops Subcontractor Payments Audit & Plan

Last updated: 2026-07-08

Triggered by: an Operations Manager requested a subcontractor payment and it was not
visible to Finance/MD. This document is an audit only — no code changes are included.
A fix plan is tracked at the bottom for a later session.

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
