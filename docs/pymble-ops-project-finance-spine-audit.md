# Pymble Ops — Project ⇄ Finance Spine Audit

**Audit date:** 2026-07-30
**Scope:** the integration spine connecting Sites, Project Schedule, Material
Schedule (BOQ), Project Budgets, Material Requests, Procurement, Stores, and
Finance/GL.
**Status:** audit only — no code or schema changed by this document.
**Related:** [material schedule audit](pymble-ops-material-schedule-audit.md) ·
[system-wide audit](pymble-ops-system-wide-audit.md) ·
[GL design](pymble-finance-gl-design.md) · [ERP roadmap](pymble-ops-erp-roadmap.md)

---

## 1. Executive summary

The complaint is that Projects, Project Schedule, Material Schedule, Project
Budget, Material Requests and Finance "are not linked". The audit finds
something more specific and more actionable than that:

> **The links exist in the database. Almost none of them carry data. The chain
> is wired but not energised — and where it is energised, it leaks.**

Every foreign key the requested behaviour needs is already there:
`boq_line_items.project_task_id`, `boq_documents.budget_id`,
`material_request_items.boq_line_item_id`, `material_requests.budget_line_id`,
`project_cost_entries.material_request_id`. The design intent recorded in the
migration comments is sound and, in places, better than what most mid-market
construction ERPs ship.

What is missing is a **spine**: one identifier that every module agrees on, one
cost lifecycle that every document advances, and one place where a number can be
trusted. Today the join between the material schedule and the budget is a
**user-typed free-text string** (`category`), the cost ledger and the General
Ledger are **two parallel unreconciled worlds**, and money is recognised at
**one point only** (material request approval) instead of at the five points a
construction cost engine needs.

### The leak, quantified

| Measure | Live value |
| --- | --- |
| Live material request value (excl. rejected/cancelled) | **K1,153,081** |
| Of that, reaching the project cost ledger | **K144,645** (8 entries) |
| **Material spend invisible to Budget & Finance** | **≈ 87%** |
| Sites with a funded project budget | **2 of 11** |
| Material schedules linked to a budget (`budget_id`) | **0 of 9** |
| Request items linked to a schedule line | **0 of 337** |
| Schedule lines linked to a programme task | **0 of 4** |
| GL journal entries (across 68 accounts) | **0** |
| Budget lines with a cost code | **8 of 21** |

Worked example — site `0004`: **23 material requests, K971,031 requested,
K904,672 budgeted, K12,725 in the cost ledger.** Finance is looking at 1.3% of
that project's committed material spend. Site `0003`: K151,531 requested against
a budget of **K0**.

### The five root causes

1. **No cost-code spine.** Schedule ↔ budget joins on a free-text `category`
   string. Two typings of the same phase are two different phases.
2. **Single-point cost recognition.** Cost exists only at MR final approval
   (`committed`) and MR close (`posted`). No PO commitment, no GRN accrual, no
   invoice actual. The `posted` transition has never fired in production.
3. **The bulk path bypasses every link.** 337 of 337 request items arrived via
   CSV/Excel/PDF import, which writes no `boq_line_item_id`. The only place the
   schedule link is offered is an optional dropdown inside a collapsed
   `<details>` on the single-item form.
4. **The GL is not fed by operations.** GL posting exists for invoices, payment
   requests and payroll only. Material requests, POs, GRNs, transport, fuel,
   equipment and subcontractor spend never post. Result: 0 journals, and every
   financial statement renders zero.
5. **Four competing project money figures.** `sites.budget_zmw`,
   `sites.actual_budget_zmw`, `sites.contract_value`, and the `project_budgets`
   module. Nothing reconciles them.

---

## 2. Current-state map

### 2.1 What actually exists

There is no `projects` table. **`sites` *is* the project entity** — code, name,
client_name, stage, progress_percent, contract_value. Every module hangs off
`site_id`; the FK graph shows **57 tables** referencing `sites`. That is a sound
choice and should be kept, but the entity needs renaming in the domain language
and needs its money columns rationalised (§4.1).

```
                        ┌──────────────────────────────┐
                        │   sites  (= the project)     │
                        │   budget_zmw · actual_budget │
                        │   _zmw · contract_value      │
                        └──────────────┬───────────────┘
                                       │ site_id
        ┌──────────────┬───────────────┼──────────────┬─────────────────┐
        │              │               │              │                 │
  project_tasks   boq_documents   project_budgets  material_requests  invoices
   (programme)    (mat. schedule)   (budget)        (requisition)     (revenue)
        │              │               │              │                 │
        │  project_    │  budget_id    │ budget_id    │ budget_line_id  │ boq_id
        │  task_id ◄───┤  (0 rows set) │              │ (14/42)         │ customer_id
        │              │               │              │                 │
        │        boq_line_items   project_budget_lines│                 │
        │              │  ▲            │  ▲           │                 │
        │              │  └────────────┼──┘           │                 │
        │              │   category    │  category    │                 │
        │              │   (FREE TEXT STRING JOIN)    │                 │
        │              │               │              │                 │
        │      material_request_items ─┘   project_cost_entries ◄────────┘
        │        boq_line_item_id            (subledger)
        │        (0 of 337 set)                    ╎
        │                                          ╎  NO LINK
        │                                          ▼
        │                                   journal_entries / journal_lines
        │                                   (0 rows — the GL)
        └── no cost link, no baseline, no WBS code
```

Legend: `─►` FK carrying data · `┄►` intended but unimplemented · *category* =
string equality, not referential integrity.

### 2.2 The intended flow versus reality

| Step | Designed | Reality |
| --- | --- | --- |
| Site created | — | ✅ 11 sites |
| Programme built | `project_tasks` per site | ❌ 2 tasks for 11 sites |
| Schedule measured (QS) | `boq_documents` + lines | ⚠️ 9 docs, **4 lines total** |
| Schedule priced (Procurement) | `pricing_pending → priced` | ⚠️ 4 requests stuck in `pricing_pending` holding K758,223 |
| Schedule issued | `issued` → auto-generate budget | ❌ 1 issued, **0 budgets generated** |
| Schedule line ↔ task | `project_task_id` | ❌ 0 |
| Request raised from schedule | pick `boq_line_item_id` | ❌ 0 of 337 items |
| Budget line resolved at submit | category match, else Unplanned | ⚠️ 14 of 42; all fell to Unplanned/Transport |
| Cost committed at approval | `project_cost_entries` | ⚠️ 8 entries, K144,645 |
| Cost posted at close | `posted` | ❌ 0 — 7 closed requests carry **no ledger entry at all** |
| GL journal posted | `journal_entries` | ❌ 0 |
| Revenue recognised | invoice → GL | ❌ 0 invoices, 0 customers |

---

## 3. Confirmed defects

These are specific, verified faults — not architecture opinions. Ordered by
money at risk.

### D1 — Bulk item import discards the schedule link *(the primary leak)*
`importMaterialRequestItemsAction` in
[material-request-actions.ts](../src/lib/ops/material-request-actions.ts) builds
its insert rows from the CSV/Excel/PDF header aliases and never sets
`boq_line_item_id`. Since import is how items are realistically entered at
volume, **the schedule↔request link can never populate**, which in turn kills
budget-line resolution, `boq-actuals` variance reporting, and the "not part of
the material schedule" flag the business is asking for.
*Impact: all 337 request items.*

### D2 — Duplicate-category crash was fixed in the sync but not in the resolver
Migration `20260801090000_pymble_ops_budget_line_source.sql` fixed
`syncProjectBudgetFromBoq` by filtering on `source = 'boq'` and adding a partial
unique index. **`resolveMaterialRequestBudgetLine`
([material-requests.ts:764](../src/lib/ops/material-requests.ts:764) and
:777) still queries `(budget_id, category)` with `.maybeSingle()` and no
`source` filter.** A duplicate manual line makes it throw; the caller's
`.catch()` swallows it into an audit row and the request silently resolves to no
budget line.
*A qualifying duplicate already exists in production:* `budget_id
a05371fc…`, category `phase_1_3no_culverts`, 2 rows, both `source='manual'`.

### D3 — Majority-category attribution misallocates cost
Same function: when a request spans several schedule categories it picks the
**single most frequent** category and books 100% of the goods value there. A
request covering concrete, rebar and formwork charges everything to whichever
appears most. Cost lands on the wrong budget line with no trace.

### D4 — Overhead and IT spend cannot enter the cost ledger
`project_cost_entries.site_id` is **NOT NULL**. `general` and `it` scope
requests have no site, so they can never produce a cost entry. 12 requests
(K48,540) are structurally invisible to Finance — by schema, not by oversight.
There is no cost-centre / overhead cost pool.

### D5 — Transport requests bypass budget control
4 `transport_requests` cost entries (K2,770) exist with
**`budget_line_id = NULL`**. They reach the project P&L (which sums by
`site_id`) but appear against **no budget line**, so budget variance
under-reports them. Same shape applies to `equipment_allocations`,
`labour_allocations`, `maintenance_jobs` and `accommodation_bookings`, which all
carry `cost_entry_id` but no budget-line discipline.

### D6 — Historical closed requests were never backfilled
7 `closed` site requests (K21,000 actual) have `budget_line_id = NULL` and no
cost entry. They predate the 2026-07-29 linkage migrations and no backfill ran.
Completed, delivered, paid-for work with zero financial trace.

### D7 — Ambiguous "the site's budget"
`findOrCreateSiteBudget` and `resolveMaterialRequestBudgetLine` both take the
**most recent** `draft`/`active` budget via `.limit(1)`. Site `0004` has **2
budgets**. Two requests submitted either side of a new budget draft charge
different budgets for the same work, and neither screen shows it. Nothing
enforces one active budget per site.

### D8 — Budget check happens after approval, not before
`overBudget` is computed at
[material-request-actions.ts:1198](../src/lib/ops/material-request-actions.ts:1198)
— *after* the approval has been written — and is used only to decorate a
notification. There is no availability check at submit or at approval. Approvers
are asked to authorise spend without being shown remaining funds.

### D9 — Cost-code field exists but is unused and unlinked
`project_budget_lines.cost_code` is free text, **empty on 13 of 21 rows**, and
has no FK to `chart_of_accounts` (68 accounts loaded). Budget cannot roll up to
the GL, and the GL cannot drill down to the budget.

### D10 — Revenue chain severed at the quotation
`quotations` has **no `site_id` and no `customer_id`** — the client is free text
(`client_name`, `client_tpin`, …). `customers` exists but holds 0 rows, and
`invoices.customer_id` therefore has nothing to point at. A won quotation cannot
become a project, a contract, or a receivable. `fetchOpsProjectPnl` reads revenue
from invoices, so **every project shows revenue = 0** and margin = −cost.

### D11 — Programme has no baseline
`project_tasks` stores `planned_start_date`/`planned_end_date` as mutable
columns with no baseline snapshot, no duration, no dependencies, no float, and
no cost link. Schedule slippage is therefore unmeasurable — the plan silently
becomes whatever it is today. This also undermines the read-time "trigger by"
derivation in `boq_schedule_link`, which is otherwise a good design.

### D12 — Stores/GRN is an island
`stock_items` = 0, `stock_movements` = 0, `goods_received_notes` = 0.
`goods_received_items` links only to `stock_items` — not to `purchase_order_items`
and not to `material_request_items`. `stock_movements` has no `site_id`. So
receipt cannot close the loop on a request, and material issued from store is not
a project cost.

### D14 — Issuing a phase-2 schedule zeroes the phase-1 budget *(critical, latent)*
Surfaced by the business decision that **a material schedule is per project
*phase*** (§7.3), which makes many issued schedules per site the normal case.

`syncProjectBudgetFromBoq`
([boq-budget-sync.ts:289-316](../src/lib/ops/boq-budget-sync.ts:289)) resolves
**one budget per site**, then — to handle a revision dropping a category — zeroes
*every* `source = 'boq'` line in that budget whose category is absent from **the
schedule currently being issued**. The stale sweep is scoped to `budget_id`, not
to `boq_id`.

So issuing the Phase 2 schedule sets **every Phase 1 budget line to zero**. Phase
1's cost entries survive and keep pointing at a line with a K0 budget, so the
project instantly reports 100% overspend on all completed phases, and the
original budget figures are **unrecoverable** — the update overwrites, with no
revision history.

This has not fired yet only because no schedule has ever successfully generated a
budget (`boq_documents.budget_id` = 0 of 9). **It will fire on the first real
two-phase project.** The fix requires `project_budget_lines` to record which
schedule owns each line (`boq_id`, complementing the existing `source` column) so
the sweep can scope to one phase.

### D13 — POs carry no commitment
`purchase_orders` has `material_request_id` but **no `budget_line_id`**. Since
commitment is recognised at MR approval and never re-checked, a PO issued for
more than the approved request increases exposure with nothing detecting it.

---

## 4. Target architecture

Referenced against how established construction/project ERPs solve exactly this:
SAP PS (WBS + network activities + AVAC budget availability control), Oracle
Primavera Unifier, Viewpoint Vista and Sage 300 CRE (job cost = job × cost code ×
cost category), Procore (budget / cost codes / commitments / change events), CMiC,
and Dynamics 365 Project Operations.

Every one of them converges on the same two primitives. Pymble has neither yet.

### 4.1 Primitive 1 — the Cost Code (WBS) spine

**This is the single highest-leverage change in this document.** One
company-level cost-code library, instantiated per project, referenced by *every*
document that touches money or quantity.

```
cost_code_library                (company master — e.g. 03.30 Cast-in-place concrete)
  └── project_cost_codes         (per site; the project WBS — code, parent, description)
        ├── project_tasks.cost_code_id            ← programme rolls up by WBS
        ├── boq_line_items.cost_code_id           ← estimate
        ├── project_budget_lines.cost_code_id     ← budget (1:1 with WBS node)
        ├── material_request_items.cost_code_id   ← requisition
        ├── purchase_order_items.cost_code_id     ← commitment
        ├── project_cost_entries.cost_code_id     ← actual/accrual
        └── cost_code_library.gl_account_id → chart_of_accounts  ← the GL bridge
```

What this replaces: string equality on `category`, majority-category guessing
(D3), the duplicate-category crash class (D2), the empty `cost_code` field (D9),
and the impossibility of GL roll-up.

What it enables immediately: one query answers "planned vs requested vs committed
vs received vs invoiced vs paid" for any level of any project — which is the
entire "smart" behaviour being asked for.

Migration path: keep `category` as the display label, derive `cost_code_id` from
it once, then make the FK authoritative. Existing free-text categories become the
first project's WBS.

### 4.2 Primitive 2 — the cost lifecycle (a real commitment ledger)

Construction ERPs recognise cost at **six** stations. Pymble recognises it at
one and a half.

| Station | Trigger document | Ledger state | Today |
| --- | --- | --- | --- |
| **Estimate** | Material schedule line (priced) | `estimated` | in BOQ only, not in the ledger |
| **Budget** | Budget line activated | `budgeted` | ✅ `project_budget_lines` |
| **Requisition** | MR submitted | `requested` (soft) | ❌ nothing until approval |
| **Commitment** | PO issued (or MR approved if no PO) | `committed` | ⚠️ fires at MR approval; PO never |
| **Accrual** | GRN / delivery confirmed | `accrued` | ❌ |
| **Actual** | Supplier invoice matched | `actual` | ❌ |
| **Cash** | Payment made | `paid` | ⚠️ payment requests only |

Two rules make this safe and prevent the double-counting that kills most
homegrown cost ledgers:

- **Relief, not addition.** When a station advances, the prior state's amount is
  *relieved*, never left standing. PO issue relieves the requisition; GRN
  relieves the commitment; invoice relieves the accrual. `project_cost_entries`
  already has an idempotent upsert keyed by source — extend the key with
  `lifecycle_state` and make relief explicit.
- **One document, one entry, one owner.** Exactly what
  `upsertProjectCostEntry`'s `match` pattern already does well. Keep it; widen
  it to POs, GRNs and supplier invoices.

Then "Exposure" — the number an approver actually needs — is a derived view:
`budgeted − (committed + accrued + actual + requested)` = **funds available**.

### 4.3 Primitive 3 — budget availability control (AVAC)

Borrowed directly from SAP PS. Before a requisition can be submitted or
approved, check funds available on the target cost code and apply a
configurable policy:

| Tolerance | Behaviour |
| --- | --- |
| ≤ 90% used | pass silently |
| 90–100% | pass, warn the approver on-screen |
| 100–110% | pass only with an explicit over-budget justification |
| > 110% | **block** — requires a budget revision or a variation first |

Thresholds belong in existing approval settings, per cost-code type. This turns
the budget from a report into a control. It also directly answers the business
ask: the approver *sees* the schedule position at the moment of decision.

### 4.4 Primitive 4 — the schedule-driven "call-off" (the smart part)

The requested behaviour — *"when making material requests it can be clicked
saying we need these materials from material schedule"* — becomes a first-class
screen rather than a dropdown:

```
Material Request → "Draw from schedule"
  ┌────────────────────────────────────────────────────────────────────────┐
  │ Site 0004 · Material Schedule MS-003 (issued)      Programme-aware ⏱   │
  ├────────────────────────────────────────────────────────────────────────┤
  │ ☑ 03.30 Concrete C25        Planned 240 m³  Requested 180  Rem  60 ⚠   │
  │     ↳ Task: Foundations (starts 12 Aug) · lead 10d · CALL OFF NOW      │
  │ ☑ 03.20 Rebar Y12          Planned  12 t   Requested   4   Rem   8     │
  │ ☐ 09.30 Wall tiles         Planned 400 m²  Requested   0   Rem 400     │
  │     ↳ Task: Finishes (starts 30 Sep) · lead 21d · not yet due          │
  ├────────────────────────────────────────────────────────────────────────┤
  │ + Add off-schedule item                            ⚠ requires reason   │
  └────────────────────────────────────────────────────────────────────────┘
```

Design rules:
- **Default in, not opt in.** Picking from the schedule is the primary path; the
  request is pre-filled with description, unit, quantity remaining, planned rate,
  supplier and cost code. Zero re-keying, so the link populates itself.
- **Off-schedule is allowed but labelled.** An item with no `boq_line_item_id`
  is stamped `off_schedule` with a mandatory reason, resolves to the
  Unplanned/Contingency cost code, and shows a persistent badge on the request,
  the budget line and the Finance queue. This is precisely the "these were not
  part of the material schedule" signal being asked for — and the raw material
  for a **scope-creep / variation** conversation with the client.
- **Over-draw is blocked at the line, not the total.** Requesting 80 m³ against
  60 m³ remaining warns; the AVAC policy decides whether it can proceed.
- **Programme drives urgency.** `boq_line_items.project_task_id` +
  `lead_time_days_override` already derive the trigger date at read time. Surface
  it as a *"materials due for ordering"* queue on the site dashboard — the
  engine already exists in [boq.ts](../src/lib/ops/boq.ts) and has nothing to
  read.
- **Import inherits the link.** The CSV/PDF importer must fuzzy-match each row
  against the site's schedule lines and propose links for confirmation, rather
  than silently importing 337 orphans (D1).

### 4.5 Primitive 5 — the GL bridge (subledger → ledger)

Stop treating `project_cost_entries` and `journal_lines` as peers. Make the
relationship explicit and one-directional:

```
project_cost_entries  =  the cost subledger (operational truth, per cost code)
        │
        │  gl_posting: cost_code → cost_code_library.gl_account_id
        ▼
journal_entries / journal_lines  =  the General Ledger (financial truth)
        │
        └── project_cost_entries.journal_entry_id   ← reconciliation FK (missing today)
```

Then extend posting coverage to the flows that actually generate spend — MR
commitment/accrual, GRN, supplier invoice, transport, fuel, equipment, labour
allocation, subcontractor payment — and add a **subledger-to-GL reconciliation
view** that surfaces any cost entry with no journal and any journal with no
source. That view is the leak detector: if it is empty, nothing is leaking.

Sequencing note: GL posting for materials should key off **accrual (GRN)** and
**actual (invoice)**, not requisition approval. Commitments are memo-only in the
GL, exactly as in every standard system.

### 4.6 Primitive 6 — one number, one owner

| Number | Single source of truth | Fix |
| --- | --- | --- |
| Contract value | `commercial_contracts` (or `sites.contract_value` until contracts are live) | pick one; derive the other |
| Original budget | `project_budgets` (status `active`) | drop `sites.budget_zmw` → view |
| Spend to date | `project_cost_entries` | drop `sites.actual_budget_zmw` → view |
| Revenue to date | valuations/IPC → invoices | wire the chain (D10) |
| Forecast final cost | committed + accrued + remaining budget | new derived view |

Enforce **one `active` budget per site** with a partial unique index (fixes D7).
Superseded budgets become `revised`, with a `project_budget_revisions` audit
trail so a budget change is a document, not an edit.

### 4.7 Primitive 7 — variations / change events

The missing pressure valve. When an off-schedule item, an over-draw, or a
programme change adds cost, the honest answer is often "this is a variation, not
an overspend." `commercial_variations` already exists and links to
`boq_documents` and `sites` — but nothing feeds it. Off-schedule request volume
per site is the natural trigger: *"K240,000 of off-schedule material on site
0004 — raise a variation?"* This is what turns leakage into recoverable revenue.

---

## 4b. Implementation log

### Phase 0 — shipped 2026-07-30
All six items, verified against live data.

| Item | Outcome |
| --- | --- |
| **D14** | `syncProjectBudgetFromBoq` now recomputes from **every live issued schedule** on the site (issued, not superseded/archived/deleted), so phases coexist. Resync also fires when an issued schedule is archived or restored. Aggregation extracted pure (`aggregateBoqBudgetTotals`) and tested. |
| **D2** | `source = 'boq'` filter added to both category lookups in `resolveMaterialRequestBudgetLine`. |
| **D7** | Partial unique index `project_budgets_one_active_per_site`; activation refuses with an instruction rather than a constraint error; both resolvers now prefer **active over draft** — which also fixed a latent bug where a newer draft could steal resolution from the live budget. |
| **D1** | New `material-schedule-match.ts`: three conservative tiers (explicit reference → exact name → single-candidate containment, unit-aware). An unresolvable explicit reference links nothing rather than guessing. Wired into the bulk importer; "Schedule Line" added to the download template. |
| **Leak detector** | New `finance-leaks.ts` + panel on `/ops/finance`. Five checks, pure classification core, tested including no-double-counting. |
| **D6** | Backfilled: 7 closed requests → posted cost entries (K33,495, estimate-basis rows labelled); 4 orphaned transport entries linked. Untracked-closed and orphaned-entry counts both **0**. |

Post-Phase-0 leak-detector reading: requests with no budget line **5**, delivered
with no cost entry **0**, cost entries with no budget line **0**, sites with two
open budgets **1** (site 0004 — left for Finance, it is their data call).

### Phase 1 — shipped 2026-07-30
The cost-code spine, live. Three migrations, all applied.

| Item | Outcome |
| --- | --- |
| **Schema** | `cost_code_library` (54 codes) + `project_cost_codes` (per-site WBS). Two levels enforced by a check constraint, not convention: a phase carries no library code, a leaf **must** carry one — which is what stops the taxonomy drifting back to free text. RLS: broad read, service-role writes. |
| **Document links** | Nullable `cost_code_id` on all seven costed documents. `restrict` on budget lines and cost entries (money must never silently detach), `set null` elsewhere. Plus `project_budget_lines.boq_id` (the D14 companion — makes phase ownership explicit) and `boq_documents.phase_cost_code_id` (phase as an FK, not a convention in `title`). |
| **Library seed** | 49 standard trade codes across 13 divisions, **every one mapped to a postable COGS account** (5010–5090). That mapping *is* the GL bridge. Seeded codes are `system_locked` — deactivatable, not deletable. |
| **Category migration** | 10 of the 15 free-text categories mapped cleanly to standard codes. The other 5 got `MIG.*` codes flagged `division = 'Migrated — needs review'` rather than being force-fitted — see below. |
| **Permissions** | `cost-code-permissions.ts`: library = Finance Manager + MD only (deliberately **excludes** GM and Operations Manager — they own delivery, not the ledger); project WBS = QS + Projects Manager; requesting a new code = anyone who spends; reading = everyone. |
| **Read layer** | `cost-codes.ts` with `rollUpCostCodeTree` — phase totals are *always* the sum of their leaves, never a separately-stored figure that can drift. Orphaned leaves surface at the root rather than being dropped. |

Coverage after backfill: budget lines **23/23**, schedule lines **4/4**, cost
entries **20/20** carry a cost code. Site 0004's 12 codes sum to exactly
K904,672, reconciling to its budget.

**Five categories deliberately not mapped**, because guessing would silently
misattribute real money:

| Category | Why it resists mapping | Money involved |
| --- | --- | --- |
| `phase_1_3no_culverts` | It is a *phase*, not a trade | **K5,628,096** |
| `external_and_internal_finishes` | Spans plastering, tiling, painting, ceilings | K150,760 |
| `genset_house` | A *structure* spanning several trades | K59,709 |
| `ancillary_works` | Undefined scope | K31,060 |
| `general` | The BOQ default — meaningless | — |

All five were resolved immediately afterwards — see Phase 1b.

### Phase 1b — flagged codes resolved 2026-07-30
The **budget-line and schedule-line descriptions** (not visible in the category
strings) resolved every one, so no guessing was needed after all and the `MIG.*`
codes are now **retired: 0 remain**.

| Category | Description revealed | Resolution |
| --- | --- | --- |
| `phase_1_3no_culverts` | "Core Materials" ×2 | Real phase node **`P1` — Phase 1: 3no Culverts** with a `32.20 Culverts and stormwater drainage` leaf. The system's first genuine phase node. |
| `external_and_internal_finishes` | **"Ceiling and Painting"** | `95.20 Finishes — composite`: spans 09.30 + 09.40, amount never split |
| `genset_house` | **"Construction"** | `95.10 Building works — composite` |
| `ancillary_works` | **"Soakaway and bollards installation"** | `95.90 Ancillary and sundry works`: spans 22.40 + external works |
| `general` (site 001) | 3× "Steel", 500 pcs | `03.20 Reinforcement steel` — unambiguous |
| `general` (site 0002) | "Test" | `95.00 Uncategorised — to be broken down` |

The three composite cases got a **real "Composite and Packaged Works" division**
(`95.00/95.10/95.20/95.90`) rather than keeping migration artefacts. The honest
problem was never that the scope was unknowable — it was that the library
lacked codes at the level the estimate was actually prepared at. Division-level
composite codes are a legitimate construct (Sage 300 CRE and Viewpoint both
carry them); these are not `system_locked` and their names say "not broken
down", so they read as a prompt to improve the estimate rather than a permanent
home.

Verified after remediation: `MIG.*` codes **0**, coverage still **23/23 · 4/4 ·
20/20**, total budgeted unchanged at **K6,532,768.28** — no money moved.

> ### ⚠ Open item for Finance: a suspected K2.8m double-count
> Site 0001 carries **two budget lines with the same description ("Core
> Materials"), the same category, and the same amount — K2,814,048.14 each**,
> K5,628,096.28 together. That is very likely one line entered twice, which
> would overstate the site's budget by **K2.8m**. Both were migrated faithfully;
> deleting a budget line on suspicion is not a migration's decision.
>
> A sixth leak-detector check, **"Suspected duplicate budget lines"**, now
> surfaces this and any future pair (same budget + category + description +
> non-zero amount). It values only the *redundant copies*, and is deliberately
> excluded from the headline leak figure: overstating a budget is the opposite
> problem to spend that never reached one, and adding them together would
> describe neither.

Two things worth knowing about the migrated state:
- Every migrated leaf sits under a single **`GEN` — General / unphased** node
  per site. Existing budget lines predate `boq_id`, so there is genuinely no
  evidence of which phase any belongs to. A truthful placeholder, not a guess;
  the QS re-parents as real phases are defined.
- `project_budget_lines.boq_id` backfilled **0 rows** — correctly. The only
  `issued` schedule in the system is archived and has zero lines, so no site
  has a live issued schedule yet. The D14 fix therefore lands *before* the
  behaviour it protects is ever exercised.

### Phase 2 — shipped 2026-07-30
The cost lifecycle and budget availability control. Two migrations applied.

| Item | Outcome |
| --- | --- |
| **Lifecycle** | `project_cost_entries.lifecycle_state` — `reserved → committed → accrued → actual → paid`, plus `released`. The coarse `status` every existing report reads is now **derived** from the station, never set independently, and a **database check constraint** (`project_cost_entries_lifecycle_status_agree`) makes an inconsistent row impossible to write. |
| **Relief** | `releaseSupersededCostStations` marks superseded stations `released`, called **in the same operation as the advance**, never as a follow-up. Approval reserves; close advances to `actual` and relieves the reservation; cancel releases everything. |
| **Availability control** | New `budget-availability.ts`: funds-available per cost code and the graduated band from §7.2 — pass / warn / require reason / escalate. `allowed` is typed as the literal `true`: **nothing is ever blocked**, and the type makes that survive future edits. |
| **Approver visibility (D8)** | The check now runs **before** the reservation is written, and the position renders on the request card: *"Only ZMW 4,200 would remain — 96% of this cost code's budget used."* Previously it was computed after the approval and only decorated a notification. |
| **Escalation** | Reason-required band notifies Finance; escalate band notifies **MD + GM** with the figures inline, via the existing role fanout. |
| **Thresholds** | `budget_control_settings` (90 / 100 / 110 by default) — management numbers, not constants. |

Two decisions worth recording:

- **The backfill marked existing `committed` entries as `reserved`, not `committed`.** Under the new model a commitment means a purchase order exists, and no PO links to any of them — so they are genuinely reservations. Calling them commitments would have overstated how firm K145,415 is.
- **The unique indexes needed a second migration to fix.** Keying on `(material_request_id, lifecycle_state)` with the goods/transport split as a partial predicate meant a request holding both a reservation *and* a commitment could not release both — relief would have failed exactly when it mattered. Corrected to `(material_request_id, cost_type, lifecycle_state)` with `released` rows excluded from uniqueness entirely.

**What the availability engine says about the live data** — and it is the whole
audit in one table:

| Cost code | Budgeted | Consumed | Band |
| --- | --- | --- | --- |
| 0001 · Transport | 0 | 140 | **escalate (unfunded)** |
| 0002 · Unplanned | 0 | 700 | **escalate (unfunded)** |
| 0003 · Unplanned | 0 | 133,850 | **escalate (unfunded)** |
| 0004 · Transport | 0 | 2,630 | **escalate (unfunded)** |
| 0004 · Unplanned | 0 | 43,590 | **escalate (unfunded)** |
| 0001 · Culverts | 5,628,096 | 0 | ok |
| 0004 · 11 trade codes | 904,672 | 0 | ok |

**Every kwacha of actual spend sits on Unplanned or Transport. Every kwacha of
budget sits on planned trades with zero spend against them.** The budget
describes work nobody has bought, and the spend is entirely work nobody
planned. That is the 87% leak restated as a control problem, and it is now
visible on a screen instead of in a document.

### Phase 3 — foundation shipped 2026-07-30 (behaviour NOT yet enabled)
The partial-procurement data model and decision logic. Two migrations applied.
**Deliberately schema + pure logic only:** auto-issuing a purchase order is an
outward-facing commitment to a supplier (audit R2), so no existing code path
changes behaviour until the §8.8 guard rails ship with it.

| Item | Outcome |
| --- | --- |
| **Per-item decision** | `material_request_items.procurement_decision` (`pending`/`ordered`/`declined`/`deferred`) + `decision_reason`, `decided_at/by`, `decline_count`. A **database check constraint requires a reason** for declined/deferred — information loss here is what makes site teams re-raise duplicate requests. |
| **The missing link** | `purchase_order_items.material_request_item_id` — the join between requisition and commitment, and deliberately the *only* place ordered quantity and value live. |
| **`partially_ordered`** | New MR status between `approved` and `ordered`, in its own migration (`ALTER TYPE ADD VALUE` cannot share a transaction — the same split the BOQ pricing flow needed). |
| **Inheritance provenance (R1)** | `purchase_orders.approval_source` (`direct`/`inherited`/`delta`), `inherited_from_approval_id`, `procured_by`, `procured_at`. A check constraint stops a PO claiming inherited authority without naming its source. |
| **Derivation** | New `procurement-fulfilment.ts`, pure: `deriveRequestFulfilment` computes ordered/outstanding quantity and value from live PO lines, plus the three amounts the business asked for — **committed, retained reservation, released**. Cancelled POs contribute nothing, which is what makes cancel-and-reissue safe with no compensating bookkeeping. |
| **Inheritance guards (§8.5)** | `decideApprovalInheritance` evaluates all four value/traceability guards, plus the supplier-change void and segregation of duties. 19 tests. |

Three design points worth recording:

- **Partial by quantity, not just by item.** 8 t ordered against 12 t requested
  is the common real case; a per-item tick box cannot express it. Because
  quantities derive from PO lines, this comes free.
- **The three amounts always reconcile.** A test asserts
  `orderedValue + releasedValue + retainedReservation = approvedValue`. That
  identity is what makes "the amount to reduce" well-defined: declined money
  returns to the budget, deferred money stays reserved for round two.
- **Segregation of duties is reported separately from the value decision.**
  It is not a question about the PO's value — it is about who may press the
  button, so the caller must *refuse* rather than downgrade to a delta
  approval. Folding it into `approvalSource` would have quietly allowed the
  approver to procure their own approval.

### Phase 3 — procure action shipped 2026-07-30
The behaviour, with its guard rails, in the same change.

| Item | Outcome |
| --- | --- |
| **Procure action** | `procure-actions.ts` — Procurement marks each line ordered / declined / deferred (reason required for the latter two, enforced in the database), and lines marked ordered are grouped **by supplier** into purchase orders. |
| **R2: draft, never issued** | The action creates POs as `draft`. Issuing — the outward-facing act that commits Pymble to a supplier — stays a separate deliberate step with its own confirmation. This one decision is what makes removing the redundant PO approval survivable. |
| **R1: segregation of duties** | The approver cannot procure their own approval. Read from `approval_steps.decision_by` (the header has no approver), and the action **refuses** rather than downgrading to a delta approval — it is a question about who may act, not about value. |
| **R1: provenance** | Every PO records `approval_source`, `inherited_from_approval_id`, `procured_by`, `procured_at`, and the audit row names the inheritance reasons when it is a delta. |
| **R2: idempotency** | Items already covered by a live PO line are skipped, so a double submit cannot commit twice. |
| **§8.4 relief** | Commitment recognised for what was actually ordered; the reservation is rewritten to the retained amount (pending + deferred) in the same operation, so **declined money returns to the budget**. |
| **Status** | `partially_ordered` as a working state: the request stays on Procurement's queue, can still receive its procured goods, and cannot be cancelled (a live supplier commitment exists). |
| **R3 / R4 controls** | `procurement-controls.ts`: unmet-need queue (declined/deferred with outstanding quantity, escalating on **age** not decline-count alone, chronic flag at 2+ declines, feeding a notification to Procurement Manager + PM) and the stale-reservation report, now a panel on `/ops/finance`. Reservations are reported, **never auto-released** — handing funds back on a timer is its own hazard. |

Still to do for Phase 3: RFQ repositioned ahead of pricing and made
threshold-conditional (§8.6), the inherited-approval weekly digest, and the
DB-level PO value assertion.

---

## 5. Recommended sequencing

Grouped so each phase is independently valuable and leaves the system in a
consistent state. No phase depends on a later one.

### Phase 0 — Stop the bleeding (small, high value, no schema redesign)
1. Fix **D14** — scope the stale-line sweep in `syncProjectBudgetFromBoq` to
   `boq_id`. **Do this before any real two-phase project issues a schedule**;
   it destroys prior-phase budgets irrecoverably.
2. Fix **D2** — add `source = 'boq'` filter to both lookups in
   `resolveMaterialRequestBudgetLine`.
3. Fix **D1** — carry `boq_line_item_id` through the bulk importer with
   fuzzy-match confirmation.
4. Fix **D7** — one active budget per site (partial unique index) + explicit
   selection where ambiguity exists.
5. Add the **reconciliation / leak-detector view**: requests with no budget line,
   cost entries with no budget line, closed requests with no cost entry, sites
   with spend and no budget. Surface on the Finance dashboard.
6. Backfill **D6** — the 7 closed requests and the 4 orphaned transport entries.

Phases below are re-ordered from the first pass: the §7.1 procurement decision
depends on the cost lifecycle, so the lifecycle moves ahead of the call-off UX.

### Phase 1 — The cost-code spine (§4.1, §7.3, §7.4)
Cost-code library owned by Finance/MD; two-level per-project WBS (**phase →
trade**); `boq_documents.phase` FK; `project_budget_lines.boq_id`; FKs on all
seven document types; backfill from existing `category` values;
`gl_account_id` mapping. `category` demoted to a display label.

### Phase 2 — Cost lifecycle (§4.2) + availability control (§4.3, §7.2)
`lifecycle_state` on cost entries with relief semantics; reservation at MR
approval; funds-available view; graduated warn → reason → **MD escalation**
policy in approval settings; approver-facing budget position at the moment of
decision.

### Phase 3 — Procurement redesign (§8, §7.1)
Per-item procurement decisions; `purchase_order_items.material_request_item_id`;
derived ordered/outstanding quantities; `partially_ordered` status; PO
auto-issue with approval inheritance and delta approval; RFQ moved ahead of
pricing and made threshold-conditional; GRN accrual; supplier-invoice actual.

### Phase 4 — Cost centres (§7.5) + GL bridge & reconciliation (§4.5)
`cost_centres` master; `project_cost_entries.site_id` nullable with an
exactly-one check against `cost_centre_id` (**D4**); `journal_entry_id` on cost
entries; posting for material/GRN/invoice/transport/fuel/equipment/labour/
subcontractor; subledger↔GL reconciliation report.

### Phase 5 — The call-off experience (§4.4) + variations (§4.7, §7.6)
"Draw from schedule" picker as the default request path; off-schedule flag with
**claimable vs absorbed** reason codes; per-line over-draw checks; "materials due
for ordering" queue driven by the existing lead-time engine; claimable
off-schedule totals surfaced to the commercial dashboard as variation
candidates.

### Phase 6 — Revenue side & programme integrity
Quotation → customer → site conversion (**D10**); contract, valuation/IPC and
certificate chain into invoices; programme baselines, dependencies and WBS
roll-up (**D11**); earned-value (PV/EV/AC → CPI/SPI) once baseline + actuals
share a cost code.

### Phase 3b — Procurement guard rails (§8.8) — *not optional*
Ships with Phase 3, not after it: approval-inheritance provenance, DB-level value
guard, segregation of duties, supplier-change void, inherited-approval digest
(**R1**); draft-then-issue with preview and idempotency (**R2**); unmet-need
queue and repeat-decline flag (**R3**); stale-reservation report and
terminal-state relief invariants (**R4**). Plus the **D15** code residue cleanup
and **D16** documentation corrections (§9), and per-price provenance on RFQ lines.

### Phase 7 — Stores loop & procurement integrity
GRN ↔ PO item ↔ request item three-way match; `site_id` on stock movements;
store issues as project cost; PO budget-line commitment (**D13**).

---

## 6. What is already good and must not be broken

Worth recording, because a "total overhaul" is where good decisions get thrown
out with the bad:

- **Read-time date derivation** (`boq_schedule_link`): the deliberate refusal to
  copy dates onto BOQ lines is correct and eliminates a whole class of drift
  bugs. Keep it; apply the same instinct elsewhere.
- **`source = 'manual' | 'boq'` ownership marking** on budget lines: a clean
  solution to the machine-vs-human edit conflict. Generalise it.
- **Idempotent `upsertProjectCostEntry` with an explicit `match` key**: exactly
  the right shape for a subledger writer. Extend, do not replace.
- **The pricing split** (QS measures, Procurement prices, then issue): genuine
  segregation of duties that many ERPs fudge.
- **Best-effort ledger writes with audit-trail fallback**: correct instinct —
  never block an operational transition on a ledger hiccup. But the audit rows
  it produces are currently write-only; they need a visible queue, or failures
  stay invisible (which is how `budget_line_resolution_failed` went unnoticed).
- **57 tables keyed on `site_id`**: the project dimension is already universal.
  The spine has a foundation to attach to.

---

## 7. Business decisions — settled 2026-07-30

These were open questions in the first pass. They are now answered and the
architecture above is constrained by them.

### 7.1 Procurement collapses into approval; RFQ becomes conditional
**Decision:** once the procured stage is approved the PO is issued and the
request goes straight to delivery. At that stage Procurement selects **what was
actually procured**; a partial procurement must show on the request and reduce
the amount committed.

This is the largest change in the document and is designed in full in §8.
Consequence worth stating up front: **partial procurement is impossible to
account for correctly under single-point cost recognition.** It forces the
two-station split (reservation at approval → commitment at PO issue, with
relief) from §4.2. The requirement validates the architecture rather than
competing with it.

### 7.2 Over-budget warns and escalates to management
**Decision:** warn, do not block; notify management.

Revises §4.3 — the graduated policy stands but the top band escalates instead of
blocking:

| Funds used | Behaviour |
| --- | --- |
| ≤ 90% | pass silently |
| 90–100% | pass; warn the approver on-screen with the remaining figure |
| 100–110% | pass; require an over-budget reason; notify Finance |
| > 110% | pass; require a reason; **escalate to MD/GM** and flag the site on the executive dashboard |

Nothing is blocked, so site delivery is never held hostage to a stale budget —
but no over-budget spend is silent, which is the actual failure today (**D8**:
the flag exists and decorates a notification nobody acts on). Escalation should
route through the existing `notifyOpsWorkflowEvent` fanout and the escalation
engine, not a bespoke path.

### 7.3 The material schedule is per project *phase*
**Decision:** one project has many material schedules, one per phase.

Consequences:
- **Directly causes D14** — the phase-2/phase-1 budget-wipe defect above. This is
  now a blocker for the budget-generation feature, not a theoretical risk.
- `project_budget_lines` needs `boq_id` so each phase's generated lines are
  owned by, and revisable against, their own schedule.
- The project WBS (§4.1) is naturally **two-level: phase → trade/cost code**.
  Phase becomes the parent node, so a phase budget, phase actuals and phase
  margin are all one roll-up query. This is a better outcome than a flat cost
  code list.
- `project_budgets` stays **one active budget per site** (fixes **D7**), with
  phase schedules contributing line groups to it. Do not create one budget per
  phase — that fragments the project's financial picture and reintroduces the
  "which budget?" ambiguity.
- Phase should be an explicit column/FK on `boq_documents`, ideally pointing at
  the programme (`project_tasks` phase node), not a convention inside `title`.

### 7.4 The cost-code library is owned by Finance and the MD
**Decision:** Finance + MD own the library; QS and Procurement consume it.

- Library CRUD gated to `finance` roles and `managing_director`; everyone else
  selects from it.
- QS may request a new code (a small approval, reusing the existing engine)
  rather than typing free text — this is what stops the taxonomy drift that
  produced 15 free-text categories and 13 empty cost codes (**D9**).
- Because Finance owns it, `cost_code_library.gl_account_id` mapping sits with
  the people who understand the chart of accounts — the GL bridge (§4.5) becomes
  a Finance data-entry task, not an engineering guess.
- The per-project WBS instance (`project_cost_codes`) is the QS's to assemble
  from library codes; the library itself is locked.

### 7.5 Overhead / IT / general spend gets cost centres
**Decision:** non-project spend is real spend and needs cost centres.

Resolves **D4** as follows:
- New `cost_centres` master (Head Office, IT, Fleet/Workshop, HR, Stores, per
  department) owned by Finance.
- `project_cost_entries.site_id` becomes **nullable**, with a check constraint
  requiring **exactly one** of `site_id` or `cost_centre_id`. One ledger, two
  dimensions — not two ledgers. Every downstream report keeps working; the P&L
  gains an overhead column instead of silently dropping K48,540.
- `general` and `it` scope requests resolve to a cost centre instead of failing
  to resolve a budget line, so the same commitment/accrual/actual lifecycle and
  the same GL posting applies to overhead. IT confidentiality (`md_review`,
  leadership+procurement+finance visibility) is unaffected — that is a
  visibility rule, not a ledger rule.
- Cost centres carry their own annual budget, so §4.3 availability control works
  for overhead too.
- Optional and worth it later: allocate overhead pools to projects on a driver
  (revenue, labour hours) for true project profitability. Not phase 1.

### 7.6 Off-schedule spend and client variations — what Q6 was asking
The question was poorly framed in the first pass. Restated plainly:

When a site requests material that was never in the material schedule, there are
only two possible explanations:

1. **We mis-estimated.** The QS missed it. That is a genuine cost overrun and it
   eats our margin.
2. **The client changed or added scope.** Someone on site was instructed to build
   something extra. That is **money we are entitled to bill the client for** — a
   variation.

**The system cannot currently tell these apart, and nobody is asked.** So case 2
gets silently absorbed as if it were case 1. On site `0004` there is K971,031 of
requested material against a K904,672 budget, none of it traceable to a schedule
line — some fraction of that overspend may well be unbilled client work that has
already been paid for out of Pymble's pocket.

The proposal (§4.7) is: when an off-schedule item is added, the requester picks a
reason from a short list — *client instruction · design change · site condition ·
schedule omission · wastage/rework · other*. The first three are
**claimable**; the last three are **absorbed**. The system then totals claimable
off-schedule spend per site and surfaces it: *"K240,000 claimable off-schedule
material on 0004 — raise a variation?"* `commercial_variations` already exists,
links to `sites` and `boq_documents`, and has nothing feeding it.

**Remaining decision:** should that prompt be a **suggestion** on the commercial
dashboard, or should crossing a threshold (say K50,000 claimable, or 5% of
contract value) **automatically open a draft variation** for the QS to complete?
Recommendation: suggestion first, so the reason-tagging discipline is proven
before it drives a client-facing document.

---

## 8. Procurement redesign — approval issues the PO

Design for §7.1. The goal: remove the redundant hop without losing the two
things the current chain provides — competitive pricing evidence and value
authorisation.

### 8.1 What is actually redundant today

```
CURRENT  MR approved → create RFQ from MR (copy items) → collect quotes
         → convert RFQ to PO(s) → submit PO for approval → PO approved
         → issue PO  ⇒ MR.status = 'ordered'
```

Five documents and **two separate approvals** for one purchase. The redundancy is
real, but it is specifically these two things:

- **The RFQ is redundant *when pricing already came from a supplier quote*.** The
  `pricing_pending → priced` stage already has Procurement attach real supplier
  prices per item (and per project convention, that price *replaces* the
  engineer's estimate). Finance/MD then approved **that** price. Re-tendering
  the same basket afterwards proves nothing new.
- **The PO approval is redundant *when the PO does not exceed what was already
  approved*.** Approval authorises value. If Finance approved K287,211 and the PO
  is for K180,000 of that, there is nothing left to authorise.

Neither is redundant unconditionally — which is what the target flow encodes.

### 8.2 Target flow

```
TARGET   MR priced → Finance/MD approve  ⇒ reservation recorded (full value)
              │
              ▼
         PROCURE ACTION  (Procurement, one screen)
              ├─ tick which items are procured, per item, with quantity
              ├─ confirm supplier + final unit price per ticked item
              └─ give a reason for each item NOT procured
              │
              ▼
         PO(s) auto-created and issued — one per supplier
              ├─ inherits the MR approval when total ≤ approved value
              └─ needs a delta approval only when it exceeds it
              │
              ▼
         MR.status = 'ordered' (all items) | 'partially_ordered' (some)
              ▼
         delivery → GRN → closed
```

RFQ moves **off the critical path** and becomes a governance tool used *before*
pricing, not after approval — see §8.6.

### 8.3 Partial procurement — the data model

The important choice is **what to store versus what to derive**. Consistent with
the codebase's existing instinct (the read-time date derivation in
`boq_schedule_link`), store only the human decision; derive every quantity and
amount.

**Store the decision** — new columns on `material_request_items`:

| Column | Purpose |
| --- | --- |
| `procurement_decision` | `pending` \| `ordered` \| `declined` \| `deferred` |
| `decision_reason` | required for `declined` / `deferred` (out of stock, price moved, no longer needed, superseded) |
| `decided_at` / `decided_by` | audit |

**Store the commitment link** — one new FK:

| Column | Purpose |
| --- | --- |
| `purchase_order_items.material_request_item_id` | the missing link between requisition and commitment |

**Derive everything else** at read time:

- `ordered_quantity` = Σ PO item quantities linked to this request item
- `ordered_value` = Σ (PO item qty × PO item rate)
- `outstanding_quantity` = `quantity − ordered_quantity`
- MR-level procurement % and value procured vs approved

Deriving these means a PO amendment, cancellation or second-round PO cannot leave
a stale mirror on the request — which is exactly the failure mode that produced
337 orphaned items in the first place. It also gives partial procurement by
**quantity**, not just by item: 8 t ordered against 12 t requested is the common
real case and a per-item tick box alone cannot express it.

### 8.4 The commitment arithmetic — "the amount to reduce"

This is the part that cannot work under today's single-point recognition, and it
is the direct answer to *"this is the amount to reduce"*:

| Moment | Ledger effect |
| --- | --- |
| MR final approval | `reserved` = full approved value (K287,211) — soft, shows in funds-available |
| Procure action, 60% ticked | `committed` = K180,000 (PO issued) · `reserved` **relieved** to K107,211 |
| Items declined | reserved for those items **released to zero** — funds return to the budget line |
| Items deferred | reservation **stays** — the request is still live, awaiting round 2 |
| Delivery / GRN | `accrued` = received value · `committed` relieved by the same |
| Supplier invoice | `actual` = invoiced value · `accrued` relieved |

Two invariants make this safe, and both belong in a test:

1. **Sum of live states never double-counts.** `reserved + committed + accrued +
   actual` for one request item never exceeds its approved value plus any
   explicitly approved delta.
2. **Relief is atomic with recognition.** A station advance writes the new state
   and reduces the prior one in the same operation, never as a follow-up job.

`upsertProjectCostEntry`'s existing `match`-key pattern extends to this cleanly:
add `lifecycle_state` to the match key. The mechanism is already there.

### 8.5 Approval inheritance — the guard rails

The PO inherits the MR's approval when **all** of these hold:

- it derives from a `material_request_id` whose status is `approved`;
- every line traces to an approved request item (`material_request_item_id` set);
- no unit price exceeds the approved unit price by more than a tolerance
  (recommend 5%, configurable beside the existing PO approval threshold);
- the PO total, plus any sibling POs already issued against the same request,
  does not exceed the approved request value.

If any fails, the PO needs a **delta approval** — a lightweight approval for the
*variance only*, showing "approved K287,211 → now K312,000, +8.6%", routed by the
same threshold rules. Not a full re-run of the chain.

This preserves the real control (nobody spends more than was authorised) while
deleting the ceremonial one (re-approving a number already approved).

### 8.6 What happens to RFQ

RFQ stays, and gets a clearer job: **it is how a price is discovered, not how a
purchase is authorised.** It runs *before* `priced`, feeding the supplier prices
that Procurement attaches. Make it **required** rather than optional when:

- the request value exceeds a competitive-tender threshold (Finance/MD set it);
- no item has a nominated supplier; or
- the nominated supplier is new / unapproved.

Below the threshold with a known supplier, Procurement attaches a price directly
and no RFQ exists — which is what already happens in practice and is fine. Above
it, the three-quote evidence is attached to the request *before* Finance
approves, which is strictly better governance than today, where the RFQ happens
*after* the money is approved.

`createRfqFromMaterialRequestAction` keeps working; it simply moves earlier in
the lifecycle.

### 8.7 Lifecycle changes required

- New MR status **`partially_ordered`** between `approved` and `ordered`
  (`enumsortorder` ~6.5). The existing enum already carries fractional sort
  orders for exactly this kind of insertion.
- `partially_ordered` is a **working state, not a terminal one**: the request
  stays on Procurement's queue with its outstanding items, and a second procure
  action issues a second PO. It becomes `ordered` when every item is `ordered`
  or `declined`, and closes on full delivery.
- The `procured` step in `materialRequestChain`
  ([material-requests.ts:297](../src/lib/ops/material-requests.ts:297)) should
  show progress ("4 of 7 items · K180,000 of K287,211") rather than a binary
  done/pending tick, and link to the issued POs rather than to `/ops/rfq-po`.
- Declined items need to be visible on the request and on the site's material
  position — a declined item is an unmet site need, and today that information
  would simply vanish.

### 8.8 Risks and their controls

Four risks, each with the specific control that makes it safe. These are not
caveats to note — they are part of the build, and the design is not complete
without them.

#### R1 — Removing the PO approval removes a second pair of eyes

The redundant approval was also, incidentally, a fraud control. Deleting it
without replacement is how a legitimate simplification becomes an exposure.
Replace the preventive control with **one stronger preventive check and one
detective control**:

| Control | Detail |
| --- | --- |
| **Record the inheritance** | `purchase_orders.approval_source` = `inherited` \| `delta` \| `direct`, plus `inherited_from_approval_id` → `approval_requests`. "Who authorised this?" must always be answerable in one hop. Never leave it implied. |
| **Enforce the §8.5 guards in the database** | A trigger/check asserting PO total ≤ approved MR value + tolerance, not app-level logic alone. App-only guards are precisely how the 87% leak happened — the resolution failures were caught, logged and forgotten (**D2**). |
| **Segregation of duties** | The user running the procure action must not be the user who approved the MR. Cheap to implement, and it is the *actual* control that PO approval was standing in for. |
| **Supplier-change voids inheritance** | Inheritance is valid only if the supplier matches the one priced and approved. Price is what Finance approved, but *who we pay* matters as much — a price-identical PO redirected to a different (possibly related-party) supplier is the classic abuse and would otherwise pass every value check. |
| **Detective: inherited-approval digest** | A weekly digest to Procurement Manager + Finance listing every PO issued under inherited approval, with value and supplier. Trading a preventive control for a detective one is appropriate when the preventive one is genuinely redundant — but only if the detective one actually gets read. Route it through the existing report/notification fanout, not a new channel. |

#### R2 — Auto-issuing a PO is an outward-facing commitment

Issuing a PO commits Pymble to a supplier for money. It must never be a side
effect of clicking "approve".

| Control | Detail |
| --- | --- |
| **Two deliberate steps, always** | Finance/MD approval sets the request to `approved` ("ready to procure"). The **procure action is a separate act by Procurement** — a preview screen showing supplier, items, quantities, rates, total, delivery address and terms, with explicit confirmation. Above a value threshold, require typed confirmation rather than a single click. |
| **Keep `draft → issued` even on the fast path** | Auto-*create* the PO as `draft`; "Issue" stays the outward action. This preserves a checkpoint at essentially zero ceremony cost, and it is what makes R2 and R1 both survivable. |
| **Nothing leaves the system automatically** | Generate the PO document and log it; a human sends it. If dispatch (email/WhatsApp) is added later it needs its own explicit send action plus a record of what was sent, to whom, when — an outward-facing action is never implicit. |
| **Reversibility** | Cancelling a PO before supplier acknowledgement must relieve the commitment and return its items to `pending` on the request, so a mis-issue is corrected rather than requiring cancel-and-reraise (which would orphan the reservation). |
| **Idempotency** | The procure action must be safe against double submission — a unique key on (request item, PO) — or a double-click commits twice. The existing `upsertProjectCostEntry` match-key pattern already solves this shape; reuse it rather than inventing a second approach. |

#### R3 — Partial procurement can hide chronic under-supply

A declined item is an **unmet site need**. Today that information would simply
vanish, and the site's only recourse is to raise the same request again — which
is plausibly part of why there are 42 requests and 337 items for 11 sites.

| Control | Detail |
| --- | --- |
| **Unmet-need queue** | A derived, aged list of `declined` / `deferred` items with outstanding quantity, visible to the site team **and** Procurement Manager. Derived from the decision columns — no new state to keep in sync. |
| **Age-based escalation, not count alone** | An outstanding item past its `needed_by` (or past the schedule-derived trigger date from `boq_line_items.project_task_id` + lead time) escalates to Procurement Manager, then the PM. Reuse the existing escalation engine. |
| **Repeat-decline flag** | Track `decline_count` per request item. Two or more declines on the same need is a supply failure, not a procurement decision, and should be flagged as such. |
| **Feed supplier scoring** | A decline reason of "supplier could not supply" writes a `supplier_performance_events` row — the table already exists. Chronic non-supply then shows up in supplier evaluation instead of being absorbed silently by site teams. |
| **Tell the requester why** | The decline reason must be visible on the request to whoever raised it. Without this they will raise a duplicate, and duplicate requests are indistinguishable from genuine demand in every downstream figure. |

#### R4 — Reservations can become permanent ghosts *(risk introduced by §8.4)*

Owning a risk the new design creates: if a request is approved and then never
procured, closed or cancelled, its **reservation sits on the budget line
forever**, understating funds available and eventually making the budget look
exhausted when it is not. This is the standard failure mode of soft-commitment
models and it is why some ERPs avoid them.

| Control | Detail |
| --- | --- |
| **Reservations age out** | A reservation older than a configurable window (recommend 60 days, or 30 days past `needed_by`) is flagged stale and reported, not silently released — releasing funds automatically is its own hazard. |
| **Stale-reservation report** | Approved-but-not-procured requests, aged, with value, on the Finance and Procurement dashboards. This doubles as the queue that stops K758,223 sitting in `pricing_pending` unnoticed, as it does today. |
| **Terminal states always relieve** | Cancel, reject, archive and close must each relieve any outstanding reservation. Make this a tested invariant: for any request in a terminal state, reserved = 0. |
| **Reconcile continuously** | Extend the Phase 0 leak-detector view (§5) with: any reservation whose request is in a terminal state, and any request item with `procurement_decision = 'ordered'` but no linked PO item. Both are impossible states; if either has rows, something is leaking. |

---

## 9. Correcting the record — suppliers are never invited

**Confirmed by the business, 2026-07-30:** Pymble's procurement team records
supplier prices **manually**. Suppliers have no account, no login, no invitation,
and never enter data into the system. There is no supplier portal and none is
planned.

The **code already reflects this.** The supplier-quote subsystem was retired in
`20260706090000_pymble_ops_drop_supplier_quotes.sql` (dropping `supplier_quotes`,
`supplier_quote_items`, `purchase_orders.supplier_quote_id`,
`rfqs.awarded_quote_id`), replaced by the per-item nomination model where each
RFQ or request line names its supplier and Procurement records the actual price
on the line. The RFQ/PO page even says so explicitly on-screen
([rfq-po/page.tsx:708](<../src/app/ops/(workspace)/rfq-po/page.tsx>:708)):
suppliers are not invited externally.

So this is not an architecture change. It is **residue cleanup** — dead artefacts
of the retired flow that still mislead users and managers.

### D15 — Retired supplier-quote flow leaves live, misleading residue

| Artefact | Location | Problem |
| --- | --- | --- |
| `receivedQuotes` KPI | [rfq-po.ts:100,388,406](../src/lib/ops/rfq-po.ts:100) → [executive.ts:589](../src/lib/ops/executive.ts:589) → executive dashboard | **Hard-coded to `0` and rendered to the MD as a metric.** A permanently-zero "quotes received" tile on the executive dashboard is worse than no tile — it reads as "we received no quotes". Remove the field and the tile. |
| `quoted` RFQ status | `ops_rfq_status` enum; filter chip at [rfq-po/page.tsx:92](<../src/app/ops/(workspace)/rfq-po/page.tsx>:92) | **Nothing in the codebase can ever set it** (verified: zero assignments). A filter that always returns zero rows. Drop the chip; retire the enum value once no rows use it. |
| `quotedRfqs` count | [rfq-po.ts:396](../src/lib/ops/rfq-po.ts:396) | A guaranteed-zero query summed into `openRfqs`. Dead work. |
| `["draft","issued","quoted"]` | [overview-role-metrics.ts:135](../src/lib/ops/overview-role-metrics.ts:135) | Harmless but carries the dead status forward into new code. |
| `quote_awarded`, `quote_recorded`, `po_exists` notices | [rfq-po/page.tsx:128-130](<../src/app/ops/(workspace)/rfq-po/page.tsx>:128) | Unreachable success messages ("Supplier quote recorded", "This quote already has a draft purchase order") from actions that no longer exist. |

### D16 — User-facing documentation still instructs staff to invite suppliers

More damaging than the code residue, because people follow it. Seven documents
still describe the retired flow, including step-by-step instructions to click
controls that do not exist:

| Document | What it says |
| --- | --- |
| [team-guide.md:248](team-guide.md) | *"**Invite suppliers**: click **Invite supplier** on each line… Once suppliers are invited, the RFQ status becomes **Issued**."* |
| [pymble-ops-walkthrough.md:180-186](pymble-ops-walkthrough.md) | *"**Invite supplier** pick one… the supplier is auto-invited to quote… Show the supplier quote slot that appeared."* |
| [pymble-ops-workflow-guide.md:80,91,175](pymble-ops-workflow-guide.md) | *"Invite suppliers to quote — one quote slot per supplier"*; a Supplier Quote row in the document-lineage table |
| [pymble-ops-setup.md:527](pymble-ops-setup.md) | *"invite active suppliers, record supplier quote totals, award a quote into a draft purchase order"* |
| [pymble-ops-design-system.md:702-708](pymble-ops-design-system.md) | *"invited supplier quote records"*; *"Supplier invitations must use active supplier records"* |
| [pymble-ops-workflow-design.md:410-411](pymble-ops-workflow-design.md) | RFQ *"auto-issued when supplier invited"*; a **Supplier Quote** entity row — though Part 16 of the same document correctly describes the replacement, so the file contradicts itself |
| [pymble-ops-erp-roadmap.md:1259,1404](pymble-ops-erp-roadmap.md) | *"active supplier invitations, quote totals, lowest quote summary, quote award action"*; and a forward-looking *"Add quote item detail and **supplier-side communication controls**"* — a roadmap item that must be struck, since it contradicts the settled decision |

[production-deployment-checklist.md:65](production-deployment-checklist.md) is the
only document that is already correct.

**Recommended cleanup**, in this order:
1. Strike the roadmap's *"supplier-side communication controls"* future item —
   it is now explicitly out of scope, and leaving it invites someone to build it.
2. Rewrite the three staff-facing guides (team-guide, walkthrough,
   workflow-guide) to the per-item nomination flow. These are the ones that
   waste people's time looking for buttons that were removed.
3. Correct the design-system and workflow-design references; resolve
   workflow-design's internal contradiction in favour of Part 16.
4. Remove the code residue in **D15**.

### Implication for the §8.6 RFQ decision

This *strengthens* the §8.6 recommendation rather than changing it. Since an RFQ
involves no external round-trip — no invitation, no waiting for a supplier to
respond — an RFQ is simply **Procurement's internal record of the prices it
gathered** (by phone, WhatsApp, email, counter visit) before a price is
attached. There is no latency cost to requiring one above a tender threshold.

Two consequences worth building in:
- **RFQ becomes the comparison worksheet.** Its job is to hold *several* prices
  per line — the three quotes obtained — so a reviewer can see what was compared
  and why the chosen supplier won. The current per-item model holds only the
  *chosen* price, which is enough to buy but not enough to evidence competitive
  sourcing. This is the one genuine capability the retired quote tables provided
  and the replacement dropped.
- **Provenance, not portals.** Because prices are typed by staff, each recorded
  price should carry how it was obtained (verbal, written quote, catalogue,
  framework rate) and optionally an attachment of the supplier's written quote.
  That is the audit evidence a supplier portal would otherwise have produced, and
  it costs one enum plus the existing document-attachment mechanism.

---

## Appendix A — Evidence

All figures queried live from Supabase project `zuezxgyhhrhklrhqsvvs` on
2026-07-30.

### Per-site position

| Site | Status | Contract value | Budgets | Budgeted | Schedules | Sched. lines | Tasks | MRs | Requested | Cost ledger |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0001 | mobilizing | 30,710,824 | 1 | 5,628,096 | 0 | 0 | 0 | 0 | 0 | 140 |
| 0002 | mobilizing | 1,500,000 | 1 | **0** | 2 | 1 | 1 | 2 | 1,700 | 700 |
| 0003 | active | 10,430,505 | 1 | **0** | 0 | 0 | 0 | 4 | 151,531 | 133,850 |
| 0004 | active | **0** | **2** | 904,672 | 0 | 0 | 1 | 23 | **971,031** | **12,725** |
| 0005 | active | 2,000,000 | **0** | 0 | 2 | 0 | 0 | 1 | 221,799 | **0** |
| 0006 | active | 1,201,689 | **0** | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 0007 | active | 1,202,941 | 1 | **0** | 0 | 0 | 0 | 0 | 0 | 0 |
| 001 | mobilizing | 0 | **0** | 0 | 2 | 3 | 0 | 0 | 0 | 0 |
| CBT-101 | mobilizing | 0 | **0** | 0 | 1 | 0 | 0 | 0 | 0 | 0 |
| LUS-001 | active | 0 | **0** | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| SOU-501 | closing | 0 | **0** | 0 | 2 | 0 | 0 | 0 | 0 | 0 |

### Material requests by status and scope

| Status | Scope | Count | With budget line | Cost entries | Estimated | Priced |
| --- | --- | --- | --- | --- | --- | --- |
| submitted | site | 2 | 2 | 0 | 21,070 | 0 |
| in_review | site | 1 | 1 | 0 | 0 | 0 |
| pricing_pending | site | 4 | 2 | **0** | 782,035 | **758,223** |
| pricing_pending | general | 1 | 0 | 0 | 0 | 0 |
| pricing_pending | it | 1 | 0 | 0 | 22,898 | 0 |
| md_review | it | 1 | 0 | 0 | 5,700 | 5,700 |
| approved | site | 11 | 8 | 8 | 279,492 | 287,211 |
| approved | general | 3 | 0 | 0 | 3,392 | 3,392 |
| approved | it | 3 | 0 | 0 | 15,499 | 15,499 |
| **closed** | **site** | **7** | **0** | **0** | **22,995** | **21,000** |
| rejected | site / general | 3 | 0 | 0 | 1,351 | 4,563 |
| cancelled | site / it | 5 | 1 | 1 | 240,169 | 0 |

### Cost ledger contents (13 rows, entire history)

| Status | Type | Source | Rows | Amount | With budget line |
| --- | --- | --- | --- | --- | --- |
| committed | materials | material_requests | 8 | 144,645 | 8 |
| cancelled | materials | material_requests | 1 | 0 | 1 |
| committed | transport | transport_requests | 3 | 770 | **0** |
| posted | transport | transport_requests | 1 | 2,000 | **0** |

### Empty modules

`journal_entries` 0 · `journal_lines` 0 · `invoices` 0 · `customers` 0 ·
`payment_requests` 0 · `stock_items` 0 · `stock_movements` 0 ·
`goods_received_notes` 0 · `commercial_contracts` 0 · `commercial_valuations` 0.
`chart_of_accounts` holds 68 accounts with nothing posted to them.

### Taxonomy fragmentation

- `boq_line_items.category`: 1 distinct value (`general`, 4 rows) — free text.
- `project_budget_lines.category`: 15 distinct values — free text; 1 duplicate
  pair within a budget.
- `project_budget_lines.cost_code`: empty on 13 of 21 rows; no FK.
- `project_cost_entries.cost_type`: `materials`, `transport` — a third,
  unrelated taxonomy.
- `chart_of_accounts`: 68 accounts, unconnected to any of the above.
