# Finance report metrics — audit and proposal

**Date:** 2026-08-11
**Scope:** metrics suggested into department reports (`fetchOpsDepartmentMetricPrefill`), and
the finance figures that feed them.
**Status:** audit + proposal. Nothing in here is implemented yet.

---

## 1. What exists today

The finance department report suggests four numbers, all counted off `created_at` /
`issued_at` with no regard to state:

| Metric | Source | What it actually measures |
| --- | --- | --- |
| `payment_requests_received` | `payment_requests` by `created_at` | keying activity |
| `payment_request_value_zmw` | ditto, `requested_amount` | what people *asked* for |
| `invoices_issued` | `invoices` by `issued_at` | billing activity |
| `invoice_value_zmw` | ditto, `total_amount` | what was billed |
| `cash_position_zmw` | typed by hand | — |

Every one is a **demand** figure. Not one of them says what Finance approved, what was
committed, or what left the bank. That is the gap this proposal closes.

The machinery to close it already exists and is good:

- **`project_cost_entries`** with a six-station `lifecycle_state`
  (`reserved → committed → accrued → actual → paid → released`), and the invariant that
  advancing a station relieves the previous one, so stations never double-count
  (`releaseSupersededCostStations`).
- **`budget-availability.ts`** — pure, tested arithmetic for budgeted/consumed/available.
- **`finance-kpis.ts`** — ageing buckets, cashflow, commercial KPIs. Already computed,
  never surfaced in a report.
- **Two payroll engines** with `disbursed_at`, full statutory splits, and advance recovery.

So this is mostly a wiring and definition job, not a modelling job. With three exceptions,
called out next.

---

## 2. Three findings that must be settled first

These are not reporting problems. They are the reason the reports would lie.

### 2.1 Nothing has ever been marked paid — and the `paid` station is never written

Live data, all time:

```
payment_requests:  submitted 14 (K159,890) · approved 1 (K13,500) · paid 0
project_cost_entries by station:  reserved 9 · actual 8 · released 1 · committed 0 · accrued 0 · paid 0
journal_entries: 1 row, total
```

"How much did Finance actually release" currently has **no data at all**.

Worse, it would still be wrong after someone marks a payment paid.
`upsertPaymentCostEntry` ([finance-actions.ts:404](../src/lib/ops/finance-actions.ts)) passes
only `status`, never `lifecycleState`. `upsertProjectCostEntry` then derives `actual` from
`status: "posted"`. So a paid payable lands on the **`actual`** station, indistinguishable
from an accrued-but-unpaid one.

`LIVE_LIFECYCLE_STATES` includes `paid`, `computeBudgetAvailability` sums it, and
`decideBudgetControl` reads it — the station is fully plumbed everywhere except at the one
place that should write it.

**Fix (one line, prerequisite for every cash metric below):** pass
`lifecycleState: "paid"` from `markPaymentRequestPaidAction`, and `"accrued"` from
`approvePaymentRequestAction` — the GL already posts `accrued` at approval and `paid` at
settlement ([gl-posting.ts](../src/lib/ops/gl-posting.ts)), so the cost ledger is simply
out of step with the GL it is supposed to mirror.

### 2.2 No material request has ever reached the procured stage

```
material_requests: 40 rows · ordered_at IS NOT NULL on 0 of them
statuses: approved 16 · closed 7 · pricing_pending 8 · priced 3 · cancelled 8 · submitted 2 · md_review 1 · rejected 2
                       (ordered / partially_ordered / delivered: zero)
purchase_orders: issued 2 (K3,500) · approved 1 (K510) · approval_pending 5 (K25,745)
approved-or-closed MR value: ~K319,103  ·  of which reached a PO: K0
```

The requested rule — *"only once it passes procured does Finance record it as purchased"* —
is exactly right, and today it would report **zero every period**. Approved requests are
being closed straight to `closed` (which writes the `actual` station) without ever passing
through `ordered`, so the `committed` station has never been written by anything.

This does not invalidate the metric. It makes the *pair* the most valuable thing Finance
could report:

> approved K319,103 · procured K0 · **approved but never procured K319,103**

That third number is the control. Report it from day one — it is the number that will get
the workflow used.

### 2.3 Payroll is invisible to the cost spine and to the GL

```
project_cost_entries.source_table ∈ {payment_requests, material_requests, transport_requests}
staff_payroll_runs: completed 1 (gross K149,486) · draft 16 (gross K1,732,838)
payroll_runs (casual): completed 1 (gross K30) · draft 1
```

Casual payroll posts a GL journal (`postPayrollRunJournalSafe`, called from
[payroll-actions.ts:472](../src/lib/ops/payroll-actions.ts)). **Staff payroll posts
nothing** — no journal, no cost entry. Neither engine writes to `project_cost_entries` at
all, so no wage cost ever reaches a site, a budget, or a cost code.

Payroll metrics can still be read straight off the payroll tables (that is what §4.E does,
and it needs no new plumbing). But be clear about the consequence: **labour is missing from
every project cost figure in the system.** For a contractor that is usually the largest
single cost line. Any "project spend" number reported today is materially understated, and
the report should say so rather than imply completeness.

---

## 3. How to implement

**Shape.** Everything proposed fits the existing mechanism unchanged: report metrics are
flat numbers keyed by string, prefilled per `(department, period_start, period_end)` and
overtypable by the head. Add keys to `OPS_DEPARTMENT_REPORT_TEMPLATES.finance` and cases to
`financeMetrics()`. `compareReportMetrics` then gives period-on-period deltas for free.

**Where the code goes.** A new `src/lib/ops/finance-period-metrics.ts`, following the
house pattern of `budget-availability.ts` / `boq-actuals.ts` / `finance-leaks.ts`: pure
aggregation functions taking rows in and returning totals, plus thin fetchers. That keeps
every definition unit-testable without a database — which matters here, because most of
these numbers are zero in live data and only fixtures can prove the arithmetic.

**One piece of genuinely new work.** `fetchOpsCostCodePosition` computes a *lifetime*
position — it has no date filter. Period consumption needs a sibling that filters
`cost_date` between the bounds:

```ts
fetchOpsBudgetPositionForPeriod({ budgetId, from, to }): BudgetPositionInput
```

**A definition trap to state out loud in the report.** "Consumed in this period" and
"remaining on this budget" are on different time bases — the first is a flow within the
window, the second a lifetime stock at the window's end. They do not add up and should
never be put in one row without labels that say so. Mixing them is the standard way budget
reports mislead.

**Suggested order:**

1. **Phase 0 — DONE 2026-08-11.** Write the `paid` and `accrued` stations from the payment
   actions (§2.1). Migration `20260815090000` realigned the rows already written.
2. **Phase 1 — DONE 2026-08-11.** §4.A, the procurement funnel, plus the direct-purchase
   path that makes it reachable (D1) and the Finance-queue metrics (D6). Two schema
   changes were needed after all — see §9.
3. **Phase 2:** §4.B cash release — now unblocked by Phase 0.
4. **Phase 3:** §4.C period-scoped budget consumption (new fetcher + a per-budget table;
   see §5 on why this cannot be a single number).
5. **Phase 4:** §4.D unplanned spend and §4.E payroll.
6. **Phase 5:** the §6 additions worth having.

---

## 9. Phase 1 note — `approved_at` meant two things

Found while checking the funnel against live data: measured over August it reported
K749,994 "approved by Finance", when the last cost approval was 21 July.

`approved_at` was written by two events into one column — by `approval-actions.ts` when the
Operations/PM chain completes and the request goes for pricing, and again by
`material-request-actions.ts` at the Finance cost approval. The second overwrites the
first, so the column means "operations approved" until Finance decides and "Finance
approved" afterwards. A comment in `approval-actions.ts` already described these as two
different timestamps; they simply shared a column.

Fixed with `material_requests.cost_approved_at` / `cost_approved_by`
(migration `20260815090200`), backfilled from the 24 `material_request.cost_approved` audit
events spanning 2026-06-29 to 2026-07-21. That is recovered fact rather than invention, so
it stays inside D3. Backfill verified exact: 24 requests carry a cost approval, and nothing
still in pricing does.

Corrected July figures: **approved K313,883 · procured K0 · 0% coverage · K331,879
authorised and unbought at month end.** As of 2026-08-11 the Finance queue holds
**K778,592, the oldest waiting 41 days**.

---

## 4. Proposed metrics

### A. Material requests — approval → procurement chain

| Key | Definition |
| --- | --- |
| `mr_approved_value_zmw` | MR item value where `approved_at` in period (station `reserved`) |
| `mr_procured_value_zmw` | MR value on an issued PO, `ordered_at` in period (station `committed`) |
| `mr_approved_not_procured_zmw` | approved with no PO at period end — **the control number** |
| `mr_procurement_days_avg` | mean `approved_at → ordered_at`, for requests that got there |
| `mr_delivered_value_zmw` | `delivered_at` in period (station `actual`) — goods actually on site |

Read the first three as a funnel. The gap is the finding, not a failure of the metric.

### B. Cash actually released

*(depends on Phase 0)*

| Key | Definition |
| --- | --- |
| `payments_approved_zmw` | `payment_requests.approved_at` in period — Finance said yes |
| `payments_released_zmw` | `paid_at` in period — money left the bank |
| `payments_awaiting_release_zmw` | approved and unpaid at period end (today: K13,500) |
| `payment_release_days_avg` | mean `approved_at → paid_at` — how long suppliers wait |
| `payments_released_by_type` | split by `payment_type` — supplier / subcontractor / payroll / tax |

`payments_approved_zmw` vs `payments_released_zmw` is the approval-versus-cash distinction
asked for, in its most direct form.

### C. Active project budgets — used vs remaining

Per active budget, for the period:

| Key | Definition |
| --- | --- |
| `active_budget_total_zmw` | sum of budgeted amounts on `status='active'` budgets |
| `budget_consumed_period_zmw` | non-released cost entries with `cost_date` in period |
| `budget_remaining_zmw` | lifetime budgeted − lifetime consumed, **at period end** |
| `budget_used_pct` | lifetime consumed ÷ budgeted |
| `budgets_over_threshold` | count past the `warn` band (`decideBudgetControl`) |

The headline numbers go in the report; the per-budget and per-cost-code breakdown belongs
in a table (§5) because that is where "where the money was allocated" actually becomes
visible.

### D. Unplanned and off-budget spend

| Key | Definition |
| --- | --- |
| `unplanned_spend_zmw` | cost entries on contingency cost codes (`isOpsContingencyCostCode`) |
| `unbudgeted_spend_zmw` | cost entries with `budget_line_id IS NULL` — spend no budget answers for |
| `uncoded_spend_zmw` | MR item value with `cost_code_id IS NULL` — **today 93 of 451 items (21%)** |
| `general_mr_value_zmw` | `scope='general'` — office/overhead purchases |
| `it_mr_value_zmw` | `scope='it'` — confidential IT purchases (respect the existing visibility circle) |
| `overhead_spend_zmw` | payables with `charge_target='overhead'`, by cost centre |
| `escalated_approvals_zmw` | approvals that hit the `escalate` band — unfunded spend that reached the MD |

`escalated_approvals_zmw` is the governance number. The escalation bands already fire;
nobody totals them.

### E. Payroll and labour

Read directly off the payroll tables — no spine dependency, so these work today.

| Key | Definition |
| --- | --- |
| `payroll_casual_paid_zmw` | `payroll_runs.total_net` where `disbursed_at` in period |
| `payroll_staff_paid_zmw` | `staff_payroll_runs.total_net` where `disbursed_at` in period |
| `payroll_employer_cost_zmw` | gross + employer NAPSA + WCF — true cost to company, not net |
| `payroll_statutory_due_zmw` | PAYE + NAPSA (both sides) + NHIMA + WCF — the ZRA/NAPSA remittance |
| `advances_outstanding_zmw` | `cash_advances` + `staff_advances` with `deducted_in_run_id IS NULL` |
| `headcount_paid` | distinct `payroll_run_items` + `staff_payroll_items` in period |

Report **employer cost**, not net pay, as the headline. Net pay understates labour by the
whole statutory employer burden, and that burden is a real cash obligation with a filing
deadline attached.

---

## 5. Two things that must not be metrics

**Budget allocation** ("where the money went") is a table, not a number. One row per active
budget: budgeted · consumed this period · consumed lifetime · remaining · % used · band.
Put it on `/ops/finance` and in the report appendix section, which already exists in the
finance section pool.

**Ageing** is already computed by `fetchOpsSupplierAgeing` / `fetchOpsReceivablesAgeing`
and renders on the payment-requests page. Don't recompute it into scalars — reference the
bucket totals.

---

## 6. Metrics not asked for, worth having

Ordered by how much they would change a decision.

1. **Net cash movement and weeks of cover** — `(receipts − payments) in period`, and cash ÷
   average weekly outflow. The template has a hand-typed `cash_position_zmw`; a level with
   no flow beside it can't be read. For a contractor this is the survival number.
2. **Spend without a purchase order ("maverick spend")** — payables with
   `purchase_order_id IS NULL`. Today that is **15 of 15**. Standard procurement control,
   data already present, and it corroborates §2.2 from the other end.
3. **Working-capital gap** — unpaid receivables − unpaid payables, by ageing bucket. Both
   sides already computed; nothing joins them.
4. **DSO / DPO** — days sales outstanding, days payables outstanding. Previously deferred
   for want of data; the invoice and payment tables now carry enough for a first read.
5. **Retention held** — `commercial_cashflow_forecasts.forecast_retention_release` exists.
   Retention is money earned and unbankable, and on a construction P&L it is usually the
   difference between paper profit and cash.
6. **Supplier concentration** — share of period spend with the top three suppliers. A
   single-supplier dependency is a risk nobody sees until the supplier fails.
7. **Top five budget overspends by cost code** — a total tells you there is a problem, a
   ranked list tells you where. `fetchOpsCostCodePosition` already returns per-code
   positions.
8. **Accrued but unpaid at period end** — the month-end accrual. Falls out of the `accrued`
   station for free once Phase 0 lands.
9. **Invoiced vs collected in period** — billing is not revenue until it clears.
10. **Cost of rework / delivery exceptions** — `delivery_exceptions` carries short, damaged
    and rejected deliveries. Pricing them turns a quality log into a money number.

---

## 6a. Correction to §2.2 — two things the audit trail changes

Added 2026-08-11 after reading `audit_events`. Both matter for the decisions in §8.

**Finance does approve material requests.** §2.2 said the approval chain has no Finance
step, which is true of `approval_steps` but wrong about the system. Finance approval is not
a step — it is the explicit `priced → approved` transition
(`approveMaterialRequestCostAction`, gated by `canApproveMaterialRequestCost`). The trail
shows **24 cost approvals**: 16 by the Managing Director, 8 by the Finance Manager, plus 7
cost rejections. So `approved_at` genuinely is the moment Finance said yes, and
`mr_approved_value_zmw` measures exactly what was asked for. The premise holds.

**The pipeline is stalled in two different places, for two different reasons.**

| Stage | Last activity | Reading |
| --- | --- | --- |
| Pricing (`prices_saved`, `priced`) | **2026-08-10** | Procurement is working normally |
| Finance cost approval (`cost_approved`) | **2026-07-21** | stopped 3 weeks ago |
| Procurement (`procure` / `ordered_at`) | **never** | never used once |

Priced requests are still arriving daily and nothing has been cost-approved since 21 July.
That is a queue backing up at the Finance gate, and it is invisible today — which is itself
an argument for `mr_awaiting_finance_days` as a metric.

The procure step is a different problem: it is not being skipped, it has never been
reached. It is also not blocked by segregation of duties (approvals came from
Operations/PM/MD/Finance; three procurement-capable users exist who could procure), and
every material request item still sits at `procurement_decision = 'pending'`.

---

## 8. Decision register

Nine decisions. **Decided 2026-08-11** — outcomes recorded on each. Where the decision
differs from the recommendation, both are kept: the recommendation is the reasoning at the
time, not a standing objection.

| # | Decision | Outcome |
| --- | --- | --- |
| D1 | What counts as procured | **PO *or* recorded direct purchase** |
| D2 | Payroll into the cost spine | **Two-step; budget-free first** |
| D3 | Backfill history | **Start clean, invent nothing** |
| D4 | PO approval threshold | **Left at K8,000,000** (recommendation declined) |
| D5 | Write `paid` / `accrued` stations | Yes — Phase 0 |
| D6 | Surface the Finance approval queue | Yes |
| D7 | IT request values in reports | Aggregate only, MD/GM in the digest |
| D8 | Uncoded spend | Report, don't block |
| D9 | Where metrics live | One implementation, two surfaces |

### D1 — What counts as "procured"? **BLOCKING**

Today it means "on an issued purchase order", produced by `procureMaterialRequestAction`.
That path has never been used, in six weeks, across 24 cost-approved requests.

**Recommendation: widen the definition to "a purchase record exists", of two kinds.**
Keep the PO path exactly as-is for sourced buying, and add a lightweight **Record direct
purchase** action for cash and walk-in buys — supplier, amount, date, receipt reference —
which writes `ordered_at` and the `committed` station through the same code path, marking
the resulting purchase record as direct.

Why: a great deal of site material in this trade is bought over the counter, and an RFQ→PO
cycle for a bag of cement will never be used no matter how the metric is defined. The
evidence is a path with sophisticated machinery — partial fulfilment, approval inheritance,
segregation of duties, idempotency — and zero uses. A metric that can only read zero is not
a control; it is a number people learn to ignore. Widening the definition makes "procured"
describe what the company actually does, and the K319k gap then becomes a real measurement
instead of an artefact.

### D2 — Does payroll enter the cost spine, and does labour consume site budgets? **BLOCKING**

`attendance_records` carries `site_id`, `amount_earned` and `payroll_run_id`, so casual
labour is accurately site-attributable. Salaried staff generally is not. Active budgets
already carry `labour_cost` (K150,702) and `human_resource` (K997,000) lines, so there is
somewhere for it to land.

**Recommendation: yes, in two different ways, and in two steps.**

- **Casual payroll → sites**, one cost entry per site per run, derived from attendance at
  disbursement, `cost_type: "labour"`.
- **Staff payroll → an overhead cost centre**, not sites. Don't invent a site split for
  salaries; a fabricated allocation is worse than an honest overhead.
- **Step 1: write the entries with `budget_line_id` null.** They appear in reporting as
  unbudgeted labour and consume nothing.
- **Step 2: attach them to labour budget lines**, once you've confirmed the budget lines
  cover the wage bill.

The two-step matters. Attach labour to budgets in one go and every active budget's consumed
figure jumps overnight; anything crossing 110% escalates to the MD, and the first thing the
new metrics would do is flood the MD's queue with alarms about a change in accounting, not a
change in spending. Volumes are currently tiny (17 attendance records, K269) so step 1 is
nearly free — the real exposure is the K149k disbursed staff run and K1.7M sitting in draft.

Separately and regardless: **staff payroll posts no GL journal at all**. Casual payroll does
(`postPayrollRunJournalSafe`). That is a plain bug and I'd fix it in the same phase.

### D3 — Backfill history, or start clean? **BLOCKING**

**Recommendation: start clean. Do not invent `ordered_at` or purchase records for the 40
existing requests.** Report a stated opening position instead — "K319,103 approved before
purchase recording began" — and let the 16 live approved requests flow through the new path
naturally. Backfilled procurement dates would corrupt every lead-time metric in §4.A
permanently, and the true history is not recoverable.

### D4 — The purchase-order approval threshold is K8,000,000

`approval_workflow_settings.purchase_order.threshold_amount = 8,000,000`. The largest
purchase order in the system is K25,745. The MD gate on purchase orders is therefore
unreachable — effectively disabled. The code fallback is K50,000, so this looked like a
digit slip during configuration.

Recommendation was K50,000. **Decided: leave it at K8,000,000 — deliberate.** Purchase
orders are approved by Procurement then Finance; the MD gate is not wanted at current order
sizes. Recorded so nobody re-raises it as a bug. The figure is editable at
`/ops/approvals/rules` if that changes.

### D5 — Write the `paid` and `accrued` stations (Phase 0)

**Recommendation: yes, no reservations.** The GL already posts `accrued` at approval and
`paid` at settlement; the cost ledger just doesn't follow. `upsertPaymentCostEntry` matches
on `payment_request_id` alone, so there is exactly one row per payable and changing its
station updates in place — consumed totals do not move and nothing double-counts. One line
in each of two actions.

### D6 — Surface the Finance approval queue

**Recommendation: add `mr_awaiting_finance_days` and `mr_awaiting_finance_value_zmw`.**
Three weeks of silence at the cost-approval gate while pricing continued daily should not
require someone to notice it by hand.

### D7 — IT material request values in reports

Scope `it` has a restricted visibility circle (leadership + procurement + finance).
**Recommendation: include `it_mr_value_zmw` in the finance report as an aggregate only,
and exclude it from the executive digest for anyone below MD/GM.** Finance is inside the
circle; a total leaks nothing a line item would.

### D8 — Uncoded spend: report it or block it?

93 of 451 request items (21%) carry no `cost_code_id`.

**Recommendation: report, don't block — for now.** A hard gate today would stop a queue
that is already stalled. Measure for a period, then gate once the figure is small.

### D9 — Where the metrics live

**Recommendation: one implementation, two surfaces.** Definitions in
`finance-period-metrics.ts`; the finance report template consumes it for the period, and the
`/ops/finance` page renders the same functions live. Never a second copy of the arithmetic.

---

## 7. Data-quality caveat to ship alongside

Most of §4.A and all of §4.B read zero on current data, because the workflow states they
measure have never been reached — not because the queries are wrong. If those land as bare
zeros in a board report they will be read as "no activity" and the metric will be
distrusted and dropped.

Show coverage next to each: *"K0 procured of K319,103 approved — 0% of approved value has
reached a purchase order"*. Same number, and it points at the process rather than at the
report.
