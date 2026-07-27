# Pymble Ops — material schedule (BOQ) audit & rework

**Audit date:** 2026-07-26
**Scope:** the BOQ module (`/ops/boq`), its budget bridge, and what it needs to
become a smart material schedule connected to the project budget.

---

## Where it already is

Worth stating plainly: this is further along than "a BOQ table". There is a real
pricing-split lifecycle (`draft → pricing_pending → priced → issued`) where the
QS measures and Procurement prices; lines link to project tasks; a lead-time
trigger engine flags materials due for ordering
([boq.ts](../src/lib/ops/boq.ts)); and issuing auto-generates a project budget
([boq-budget-sync.ts](../src/lib/ops/boq-budget-sync.ts)). The gaps are almost
all in what happens **after** a schedule is issued.

## Live data at audit time

| | |
| --- | --- |
| Schedules | 8 (7 draft, 1 issued) |
| Schedules linked to a budget | **0** |
| Schedule lines | 3 |
| Budgets / budget lines | 6 / 19 |
| Request items linked to a schedule line | **0** |

The one issued schedule ("Shantumbu") has `issued_at = null` — it predates the
pricing-flow migration, so it never ran the budget sync. The feature has
therefore never executed against real data, which is worth knowing before
trusting it.

## The rename

The codebase already half-agrees: three pages and several comments say "material
schedule" while the module title says "Bill of Quantities"
([constants.ts:446](../src/lib/ops/constants.ts:446)). Users agree too — the most
recent schedule is literally titled "Material Schedule".

But `boq` appears **964 times across 37 files**, plus tables, the `/ops/boq`
route, and `module_key: "boq"` written into `audit_events` and `notifications`
rows — renaming the identifier orphans that history unless mapped.

**Done — UI only.** The module is now **Material Schedule** at
`/ops/material-schedule`; `/ops/boq` is a permanent redirect that preserves query
strings, so bookmarks and the `actionHref` already written into historical
notification rows keep working. User-facing copy across the schedule, invoices,
overview, import templates, inbox and invoice PDF now says "material schedule".

Table names, the `boq` module id, and `module_key` on audit and notification rows
are deliberately unchanged, so no history is orphaned. The glossary still defines
"BOQ" as the industry term, which is correct.

---

## Findings

### B4 — One duplicate category permanently broke budget sync ✅ FIXED
`syncProjectBudgetFromBoq` looked its target line up by `(budget_id, category)`
with `.maybeSingle()`. Nothing enforced uniqueness on that pair — Finance types
the category as free text — so a duplicate made the lookup error, the sync throw,
and the best-effort catch in `issueBoqAction` bury it in an audit row nobody
reads. Every later issue for that site then silently failed.

**This was already armed in production:** budget `a05371fc…` has two
`phase_1_3no_culverts` lines.

**Fixed** by giving generated lines an owner rather than constraining Finance.
New `project_budget_lines.source` (`'manual' | 'boq'`): the sync only reads and
writes `source = 'boq'`, and a partial unique index on `(budget_id, category)
where source = 'boq'` makes the lookup provably single-row. Finance's manual
lines are now invisible to the sync — which also fixes **B3** (re-issue used to
overwrite manual budget figures). Migration applied and verified: the 6
auto-generated placeholder lines reclassified to `boq` (all K0), the 13 manual
lines untouched (K6,532,768.28), and the failing lookup went from 2 rows matched
to 0. The sync failure is now also reported to Sentry, not just audit-logged.

> **Needs your decision:** those two duplicate lines are identical in category,
> description **and amount — K2,814,048.14 each**. That looks like an accidental
> double-submit inflating "PLANNED BUDGET" by K2.8m. I have not touched them;
> deleting production financial records is your call.

### A2 — Real actuals now surface on schedule lines ✅ FIXED
`material_request_items.boq_line_item_id` already linked requested items back to
schedule lines, and nothing used it. New
[boq-actuals.ts](../src/lib/ops/boq-actuals.ts) aggregates per line: requested
quantity, requested value, delivered quantity, and the contributing requests.
The schedule table and mobile cards gained a **Requested** column showing
consumption, percent of plan, and an over-plan/over-budget flag; the document
header gained a **Requested** roll-up that turns red past budget.

Deliberate constraint: aggregated from request *items*, not `project_cost_entries`.
Cost entries are written per *request*, so splitting one across the several
schedule lines a request may cover would mean apportioning money by guesswork.
Item quantities and priced totals are exact. Request-level committed/posted spend
stays on the budget screens where it is accurate.

Rules covered by [tests](../tests/boq-actuals.test.ts): priced total beats
engineer estimate; rejected and cancelled requests don't count; `delivered` and
`closed` count as delivered; zero-quantity lines don't divide by zero.

### B1 + A7 — Revisions ✅ FIXED
Issued schedules were immutable with no supersede action, so any scope change
left the budget drifting.

**Fixed:** a revision is a **new** document at `version + 1` pointing back via
`supersedes_id`; the issued schedule and its budget are untouched until the
revision is itself priced and issued, at which point the predecessor is stamped
`superseded_*` and leaves the working list. Nothing is ever edited in place, so
every issued version stays auditable. A partial unique index on `supersedes_id`
stops two people branching the same version and racing to issue.

Issuing a revision diffs it against its predecessor
([boq-revisions.ts](../src/lib/ops/boq-revisions.ts)) — added, removed, changed,
and per-category movement — and writes that delta into the audit record. Lines
are paired by description + unit, so a re-described line honestly reads as a
removal plus an addition.

**Budget behaviour on re-issue** (decided, reversible): the `boq`-owned budget
lines are overwritten, since the schedule is rightly their source of truth and
step B4 already walled them off from Finance's manual lines. Categories a
revision drops are **zeroed, not deleted** — cost entries may already reference
them, and a zeroed line still shows the overspend. A **locked** budget is never
touched: `LockedBudgetError` records the refusal instead. If you would rather
Finance approve each delta before it lands, the diff is the input an approval
gate would use.

### B2 — Category-level budget ✅ ADDRESSED (differently than proposed)
The original recommendation was `project_budget_lines.boq_line_item_id` to
explode the budget to line level. On implementation that turned out to be the
wrong fix twice over: **A2 had already answered the question it was for**
("are we over on rebar?" is now visible per schedule line), and a 200-line budget
is worse for Finance, who want a handful of lines.

**Done instead:** a look-through. `fetchOpsScheduleComposition` maps each
generated budget line to the schedule lines that produced it, and the budget
table drills down to show each one with its planned value and requested-to-date.
Traceability without restructuring the budget, and no schema change.

### B5 — Which budget gets written is implicit 🟡
`findOrCreateSiteBudget` takes the most recent `draft`/`active` budget for the
site. Two schedules silently share one budget; a `locked` budget silently causes
a second budget to be created.

### A1 — `actual_quantity` retired ✅ FIXED
Manually re-keyed, and because editing requires `draft` status it is **frozen the
moment a schedule is issued** — on exactly the schedules that matter. The page
still renders `actual_total` from it. **Fixed:** removed from the schedule table, the mobile cards, and both line
forms, and marked deprecated in the database. The column and its historical
values are retained, and `updateBoqLineItemAction` no longer writes the field —
without that, dropping the input would have silently zeroed existing rows on the
next edit. The "Requested" column from A2 replaces it.

### A3 + A4 + A5 — Materials dictionary link ✅ FIXED
`boq_line_items.stock_item_id` optionally links a line to `stock_items`, which
already was the materials dictionary. One link, three fixes:

- **A3** — a dictionary picker on the line forms, and the material code shown on
  the schedule row.
- **A4** — lead time now resolves **override → dictionary → zero**. Previously an
  unoverridden line fell straight to zero, so it triggered on the day the
  material was already needed. `leadTimeSource` is returned alongside so the UI
  can show where the number came from.
- **A5** — `boqLinePriceBenchmark` compares the unit rate to the last price
  actually paid, rendered next to the rate on the schedule and beside the input
  where Procurement prices. Silent when there is no link, no history, or no
  price yet — it never nags about one-off materials.

The link is optional, so ad-hoc lines stay valid; they just do not get the
dictionary's help.

> **Gated on data:** `stock_items` currently has **0 active rows**. The wiring is
> live but inert until the materials dictionary is populated — worth doing, since
> A4 and A5 both pay off immediately once it is.

**Bug found while testing this:** `deriveOpsBoqLineDates` anchored its date
arithmetic at `T00:00:00+02:00`, which lands on the *previous* UTC day, so
slicing the ISO date back out returned a trigger date **one day early — even
with a zero lead time**. Every trigger alert has been firing a day early. Now
anchored at UTC midnight, since both values are plain calendar dates and no zone
belongs in the subtraction.

### A6 — No wastage factor 🟡
Construction orders measured quantity × (1 + wastage). Nowhere to express it, so
it gets baked into quantities invisibly.

### A7 — `version` exists but nothing uses it 🟠
Never incremented; no revision history or comparison. Pairs with B1.

### W1 — No export ✅ FIXED
`GET /api/ops/material-schedule/export` builds a branded workbook matching the
payroll and attendance registers — logo band, summary cards, frozen header,
autofilter, totals. Carries planned figures, the derived consumption from A2,
trigger dates from A4, and flags over-consumed lines and above-benchmark rates.
Exports one schedule by `boq_id` or all live schedules. Audit-logged.

### W2 — Size 🟡
1,327-line page, 1,165-line actions file, 4,328 lines across the module. Worth
splitting during the B1 rework, not before.

---

## Plan

1. ~~**B4** — fix the silent budget-sync break.~~ ✅ done
2. ~~**A2** — join real actuals onto schedule lines.~~ ✅ done
3. ~~**B1 + A7 + A1** — revisions, diffing, and retiring the manual actual.~~ ✅ done
4. ~~**B2** — budget-line → schedule-line traceability.~~ ✅ done (as a
   look-through, not a schema change)
5. ~~**A3 + A4 + A5** — dictionary link, lead-time fallback, price benchmark.~~ ✅ done
6. ~~**UI-only rename** and **W1 export**.~~ ✅ done

All six steps verified: `tsc` clean, ESLint clean, 376/376 tests pass, three
migrations applied and confirmed against the live database.

## Still open

- **B5** — which budget a schedule syncs into is still implicit (most recent
  draft/active for the site). A locked budget is now refused rather than
  silently forked, but choosing the target explicitly remains unbuilt.
- **W2** — module size. The page is still ~1,400 lines; worth splitting now that
  the model has settled.
- **Populate `stock_items`** — unlocks A3/A4/A5, which are currently inert.
- **The K2.8m duplicate budget pair** — still your call.
