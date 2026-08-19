# Pymble Ops — End-to-end workflow audit and remediation plan

**Date:** 19 August 2026
**Scope:** Material requests → approvals → pricing → procurement → delivery → finance → project budget → cost codes → GL
**Method:** Source trace of every state transition, cross-checked against the live production database (`zuezxgyhhrhklrhqsvvs`) on 19 Aug 2026.
**Build health:** `tsc --noEmit` passes clean. Nothing here is a compile error. Every defect below is a *wiring* defect — a link the code knows about but does not reliably make.

---

## 1. The diagnosis in one paragraph

The ops system is not one workflow. It is six modules, each keeping its **own status column**, joined together by **optional, best-effort side-effects** (`.catch(() => null)`), with **no transactions** anywhere. Every join between modules is written as "nice if it works". In production, most of them do not work — and because they fail silently, nobody has known which ones. The result the team feels as "bugs" is really this: *a record moves forward on one screen and stays behind on another, and the money never moves at all.*

That is why the fix is not a list of patches. It is: **one state machine, one writer per transition, derived links instead of typed ones, and loud failure.**

---

## 2. Evidence from the live database

| Measure | Value | What it means |
|---|---|---|
| Material request items | 491 | |
| …linked to a material schedule line | **0 of 491** | The planned-vs-actual spine has never carried a single row |
| …with no cost code | 107 (22%) | Uncharged spend |
| Material schedules (`boq_documents`) | 10 | 8 have zero lines |
| …status `issued` (the only kind MRs can match against) | **1**, and it has 0 lines | The matcher has nothing to match |
| Project budget lines | 37 | |
| …with no `cost_code_id` | **16 (43%)** | Invisible to every band, roll-up and variance report |
| …created from a material schedule | **0** | BOQ→budget sync has never produced a line |
| Purchase orders | 8 | |
| …that produced a cost entry | **0 of 8** | The `committed` station is empty database-wide |
| Goods received notes | **0** | Three-way match is inert |
| Journal entries in the whole GL | **4** | 3 invoices + 1 payment request |
| Cost entries at a postable station (`accrued`/`actual`) | 9, **all with `journal_entry_id = NULL`** | Every one is an unreported reconciliation break |
| `cost_code_library` rows with a GL account mapped | **53 of 53** | So the GL gap is pure wiring, not missing setup |
| Payment requests | 15, **14 stuck at `submitted`** | Finance approval is a dead end |
| Purchase orders stuck at `approval_pending` | **5 of 8**, oldest 1 July | While their material requests are already `closed` |
| Material requests stuck at `pricing_pending` | **9**, oldest 23 June (8 weeks) | See F1 |
| RFQs raised against any of those 9 | **0** | The gate demanding one has never been satisfied |

### The budget picture — the single most damaging fact

| Site | Material requests | Ledger spend | Budget | Status |
|---|---|---|---|---|
| RUBIS SERVICE STATION | 24 | K59,720 | K904,672 | **draft** |
| PARROGATE WAREHOUSES | 10 | K137,550 | K0 (2 empty lines) | **draft** |
| COCA COLA DECANTING | 4 | K700 | K1,099,564 | active |
| SIATONTOLA ROAD | 1 | K140 | K16,218,159 | active |
| KANGILA STAFF HOUSES | 0 | K0 | K901,277 (**all 5 lines uncoded**) | draft |
| MUSANGU GIRLS DORMITORY | 0 | K1 | K523,246 (**all 5 lines uncoded**) | draft |

**The projects that spend have no active budget. The projects with active budgets do not spend.** K17.3M of active budget is watching K840 of activity, while K197,270 of real spend charges nothing at all.

---

## 3. Findings

### F1 — The pricing gate was mathematically impossible to satisfy. *(Critical — FIXED, Phase 0)*

**The headline, found during remediation:** the gate demanded a requisition that the system refused to create.

- `material-request-actions.ts` blocked *Send to Finance* until an RFQ existed against the request.
- `rfq-po-actions.ts:470` refused to build an RFQ from anything but a request in status `approved`.
- A request only reaches `approved` by passing the gate.

A closed loop with no entry point. **The RFQ the gate demanded could never be created**, which is why all 9 stranded requests show exactly zero RFQs — not neglect, impossibility. The tender policy's own design comment says the RFQ "runs BEFORE pricing, not after approval"; the enforcement did the opposite.



`src/lib/ops/tender-policy.ts:44` counts a supplier only when `supplier_id` is set (a row in the supplier master). The UI, at `material-requests/page.tsx:394`, displays `supplier_name_freeform` as **"Supplier: MTN (not in master list)"**.

So the screen says a supplier is named and the gate says none is. The user is told:

> *"No item names a supplier yet, so there is nothing for Finance to approve a price against. Raise an RFQ against this request…"*

…on a request that visibly names a supplier. There is no third branch in `evaluateTenderRequirement` for "named, but not on the register", so a freeform supplier falls through to the *wrong* message with the *wrong* remedy.

Three compounding faults on the same path:

1. **Wrong predicate** — freeform suppliers are invisible to the gate.
2. **Fires too late** — `material-request-actions.ts:1237` runs the check *after* the price updates have already been written to the database (line ~1180). Prices save, state does not advance, nothing says so. No transaction wraps the pair.
3. **Fires at the wrong moment** — the requirement is only surfaced when the user presses *Send to Finance*. It should be visible from the moment the request is created.

**Impact:** 9 requests frozen, K782,435 of value, oldest 8 weeks old, zero RFQs raised against any of them. This one defect is the largest single blockage in the system.

**Status — fixed 19 Aug 2026.** `evaluateTenderRequirement` now distinguishes registered / typed / unapproved / over-threshold as four separate triggers, each with its own reason and its own remedy; below the threshold, registering the supplier clears the gate without an RFQ. The check moved ahead of the price write and is judged at the proposed prices. `createRfqFromMaterialRequestAction` now accepts `pricing_pending`, `priced`, `md_review`, `approved` and `partially_ordered`, breaking the deadlock. 15 policy tests, 7 of them new and specific to this defect.

### F2 — Two rival writers move a request to `ordered`; one of them writes no money. *(Critical)*

| Path | Sets MR → `ordered` | Writes `committed` cost entry | Relieves the reservation |
|---|---|---|---|
| `procure-actions.ts:195` `procureMaterialRequestAction` | yes | yes | yes |
| `rfq-po-actions.ts:1028` `issuePurchaseOrderAction` | yes | **no** | **no** |

Whichever screen the user happens to be on decides whether the money is recorded. Production result: **all 8 POs produced 0 cost entries**, and the `committed` lifecycle station is empty across the entire database. Approved-but-ordered spend is stuck at `reserved` forever, which double-counts against the budget the moment anything else advances.

The `procure` path is additionally gated on `request.budget_line_id && request.site_id` — 7 site-scoped MRs have no budget line, so even the good path silently skips them.

### F3 — Activating a project budget does nothing. *(Critical)*

`finance-actions.ts:895` `activateProjectBudgetAction` writes a status flag and an audit row. That is all. It does not provision cost codes, does not backfill the site's existing requests, does not link to the material schedule, does not re-resolve budget lines on open requests.

Worse: `budget-availability.ts:308` counts budgets in `('draft','active','locked')` **equally**. Activation is therefore a literal no-op for every control in the system. This is exactly the behaviour reported as *"budgets when activated are not linking automatically"* — they are not linking because activation was never wired to link anything.

### F4 — 43% of budget lines are invisible. *(High)*

16 of 37 `project_budget_lines` have `cost_code_id = NULL`. `fetchOpsCostCodePosition` keys entirely on that column, so those lines contribute nothing to availability, roll-up or variance. Kangila (K901,277) and Musangu (K523,246) are 100% uncoded — over K1.4M of budget that no control can see.

`addProjectBudgetLineAction` now *requires* a cost code (correctly, at line 563). But the legacy rows were never backfilled and nothing on any screen tells Finance they are broken.

### F5 — The BOQ→budget sync writes lines that are dead on arrival. *(High)*

`boq-budget-sync.ts:186` `upsertBudgetLineByCategory` inserts `cost_code` (free text), `category`, `description`, `budgeted_amount`, `source` — and **never `cost_code_id` or `boq_id`**, even though both columns exist. So a budget generated from a material schedule would land already invisible (F4) and already unlinked to the schedule that produced it.

Production confirms: 0 budget lines have a `boq_id`. The sync has never run to completion for anyone.

### F6 — The material schedule cannot feed anything, because it is empty. *(High)*

Schedule→request matching (`importMaterialRequestItemsAction`, line 652) only considers schedules with `status = 'issued'` and no supersede/archive/delete stamp. **There is exactly one issued schedule in the database and it has zero lines.**

Two further gaps on the same path:
- Auto-matching exists **only in the CSV/Excel import path**. The manual *Add line item* form (`addMaterialRequestItemAction:395`) never attempts a match and never inherits the schedule line's cost code, even when `boq_line_item_id` is supplied.
- Cost codes are stamped onto items **only at submit time** (`material-request-actions.ts:940–980`), not at creation. So the request is built, reviewed, and only then discovers whether it can be charged.

### F7 — Requests with no site can never be coded, but are told they can. *(Medium)*

13 of 53 requests are `it` or `general` scope and carry no `site_id`. Cost codes are provisioned per site (`ensureProjectCostCodeForLibraryCode`), so these requests structurally cannot have one. Yet the UI still shows:

> *"No cost code on this request — all lines will charge the unplanned / contingency budget."*

There is no site, so there is no contingency leaf. The banner promises a destination that does not exist. Company overheads need a **cost centre** (the `cost_centres` table already exists, 6 rows), not a project cost code.

### F8 — The general ledger is decorative. *(High)*

Four journal entries exist in total. All 53 library codes have a GL account mapped, so the plumbing is complete — it simply never runs:

- All 9 postable cost entries have `journal_entry_id = NULL`. `postCostEntryToGlSafe` is called under `.catch(() => null)` (`material-request-actions.ts:1851`) so every failure is discarded.
- 18 staff payroll runs and 2 payroll runs have never posted a journal.
- `fetchOpsGlReconciliation` exists and would surface all of this — but nothing routes its output to a person.

### F9 — The approval sync has no state guard, and can push a request backwards. *(Medium)*

`approval-actions.ts:100` `syncMaterialRequestApprovalStatus` writes the MR status **unconditionally**:

```
await supabase.from("material_requests").update(update).eq("id", sourceId);
```

Its purchase-order twin twelve lines below correctly guards with `.eq("status", "approval_pending")`. A re-decided or stale approval therefore throws a `priced`, `approved` or `ordered` request back to `pricing_pending`, wiping `priced_at`/`cost_approved_at` semantics. This is a plausible source of the "it went backwards" reports.

### F10 — Downstream dead ends. *(Medium)*

- **5 of 8 POs** sit at `approval_pending` since 1 July, while their material requests are already `closed`. A request cannot legitimately be closed against an unissued PO.
- **14 of 15 payment requests** sit at `submitted`. Nothing has ever been paid.
- **0 goods received notes.** `three-way-match.ts` is referenced only by stores-inventory and has never had data. Delivery confirmation therefore books `actual` with no receipt evidence behind it.

### F11 — Failure is invisible by construction. *(Cross-cutting)*

Budget-line resolution, cost-code stamping, cost-entry writes, GL posting and notification fanout are **all** wrapped in `.catch(() => null)` or written to `audit_events` with a `*_failed` action that no screen reads. Combined with zero database transactions, a half-completed transition is the normal outcome and nobody is told. The 1,672 audit rows contain the record of every one of these failures; nothing surfaces them.

---

## 4. Remediation

### Five principles to hold the design to

1. **One state machine, one writer per transition.** A transition is a named function. Every screen calls it. No screen writes `status` directly.
2. **Links are derived, not typed.** If the system can work out the cost code, the schedule line or the budget line, it must — and only ask a human when it genuinely cannot.
3. **Gates fire early and explain themselves.** A requirement the user can only discover by pressing the final button is a defect. Show it from creation; block at the last possible moment; always offer the action that satisfies it in one click.
4. **Failure is loud.** No `.catch(() => null)` on anything that moves money. Money-moving transitions run in a transaction. Breaks appear on a screen a named person owns.
5. **Activation means reconciliation.** Nothing is "activated" without backfilling everything already in flight behind it.

### Phase 0 — Unblock the team ✅ *delivered 19 Aug 2026*

Nothing structural. Purely: stop the bleeding.

- **P0.1 ✅** `evaluateTenderRequirement` now knows about `supplier_name_freeform`. Four distinct triggers (`over_threshold`, `no_supplier`, `unregistered`, `not_approved`), each with its own reason *and its own remedy*. Below the threshold, registering the supplier clears the gate — an RFQ is only the sole remedy above it. *(F1)*
- **P0.2 ✅** The check moved **ahead of** the price write and is judged at the *proposed* prices, so a refusal leaves the request exactly as the user found it. A `TenderRequirementNotice` banner shows the position on the list from the moment items exist. *(F1)*
- **P0.3 ✅** `createRfqFromMaterialRequestAction` accepts `pricing_pending`, `priced`, `md_review`, `approved`, `partially_ordered` — **breaking the deadlock**. A *Record comparison prices* button sits inline on the blocked request.
- **P0.4 ✅** Data repair applied. 5 ghost POs (K25,745) and their 5 stale approvals cancelled, with the reason stamped into `audit_events` under `repair: phase0_repair`. The 9 stranded requests needed no data repair — the code fix alone frees them.
- **P0.5 ✅** *(found while applying P0.4)* `cancelMaterialRequestAction` cancelled the request but **never withdrew the approval it had raised**, so every cancelled request left a live approval with `pending` steps in its approvers' queues. Fixed in code, and the backlog of 11 dead approvals / 23 orphaned pending steps cleared.

**Exit test:** ✅ every one of the 9 stuck requests can now reach Finance without a developer. Verified: 1,122 tests pass, `tsc` and `eslint` clean.

**Measured effect on the live system:**

| | Before | After |
|---|---|---|
| Open approval requests | 13 | **8** |
| Orphaned `pending` steps on cancelled approvals | 23 | **0** |
| Purchase orders stuck at `approval_pending` | 5 | **0** |
| Requests that can reach Finance | 0 of 9 | **9 of 9** |

### Phase 1 — One writer per transition (~3 days)

- **P1.1** Extract `src/lib/ops/material-request-lifecycle.ts`: a single exported transition per edge (`submit`, `priceAndSend`, `decideCost`, `markOrdered`, `confirmDelivery`, `close`, `cancel`), each declaring its legal `from` states and performing *all* side-effects.
- **P1.2** Make `issuePurchaseOrderAction` and `procureMaterialRequestAction` both call `markOrdered`. Delete the divergent inline updates. *(F2)*
- **P1.3** Wrap each transition in a Postgres function or an explicit transaction so status + cost entry + budget relief commit together or not at all. *(F2, F11)*
- **P1.4** Guard `syncMaterialRequestApprovalStatus` with an explicit `from`-state filter, matching its PO twin. *(F9)*
- **P1.5** Add a database `CHECK`-backed transition table so an illegal move fails at the database, not just in code.

**Exit test:** a test that drives one request through every state via *both* the RFQ/PO screen and the procurement screen and asserts identical cost-entry output.

### Phase 2 — Make the links derive themselves (~4 days)

This is the phase that answers *"cost codes shouldn't be fixed manually."*

- **P2.1** Move cost-code resolution from submit-time to **write-time**: `addMaterialRequestItemAction` inherits from the linked schedule line, then the site's active budget line for the category, then the contingency leaf — in that order, on insert. *(F6)*
- **P2.2** Run `buildScheduleLineMatcher` in the **manual** add-item form too, not only the CSV import, and show the proposed match inline ("matches *Cement 32.5N, bags* on Schedule S-004 — use it?"). *(F6)*
- **P2.3** Relax schedule matching from `issued`-only to `issued` *or* `priced`, so a schedule under pricing still guides requests. Gate the *budget* on issue, not the *matching*. *(F6)*
- **P2.4** Fix `upsertBudgetLineByCategory` to write `cost_code_id` and `boq_id`. *(F5)*
- **P2.5** Give non-site scopes a real home: resolve `it`/`general` requests to a **cost centre** instead of a project cost code, and change the banner to name it. *(F7)*
- **P2.6** Backfill migration: stamp cost codes on the 107 uncoded items and the 16 uncoded budget lines, using the same resolution order. Report what could not be resolved rather than leaving it null.

**Exit test:** a new request on an active-budget site, built entirely through the UI with no cost-code dropdown touched, arrives at Finance fully coded and charged to the right leaf.

### Phase 3 — Make budget activation mean something (~3 days)

- **P3.1** `activateProjectBudgetAction` becomes a reconciliation: provision any missing project cost codes, resolve budget lines on every open request for that site, re-stamp uncoded items, and report the result to the activator ("linked 24 requests, K59,720 of existing spend now charged; 3 items could not be resolved"). *(F3)*
- **P3.2** Change `fetchOpsCostCodePosition` to count **`active` and `locked`** budgets only. A draft budget is a plan, not a control. Show draft figures separately as "planned". *(F3)*
- **P3.3** Block activation on a budget that has any uncoded line, with a one-click *code the remaining lines* path. *(F4)*
- **P3.4** Add a *Budget health* strip to `/ops/project-budgets`: uncoded lines, sites with spend and no active budget, requests charging contingency. The two draft budgets carrying 34 live requests must be impossible to miss.

**Exit test:** activating RUBIS's K904,672 budget immediately shows its 24 requests and K59,720 of spend against it, with no manual step.

### Phase 4 — Close the money loop (~4 days)

- **P4.1** Remove `.catch(() => null)` from every cost-entry and GL write. Failures raise; the transition rolls back. *(F11)*
- **P4.2** Post the GL from the transition, inside the same transaction. Backfill the 9 unposted entries. *(F8)*
- **P4.3** Surface `fetchOpsGlReconciliation` on `/ops/finance` as a permanent break count, with the weekly digest to the Finance Manager. A number that is not zero must be visible without opening anything. *(F8)*
- **P4.4** Require a goods received note before `confirmDelivery` books `actual`, and wire `summariseMatch` into the delivery screen. *(F10)*
- **P4.5** Post payroll runs to the GL on completion; backfill the 2 completed runs. *(F8)*

**Exit test:** GL reconciliation reports zero breaks, and every posted cost entry carries a journal entry.

### Phase 5 — Prevent recurrence (~2 days)

- **P5.1** A `workflow-integrity` test suite asserting the invariants this audit had to check by hand: every `ordered` MR has a committed entry; every postable entry has a journal; every budget line has a cost code; no MR is `closed` against an unissued PO; no site has spend without an active budget.
- **P5.2** Run it in CI **and** as a nightly cron against production, reporting to the Ops inbox. The reason this audit was necessary is that nothing was watching.

---

## 5. Where the existing design is right, and should not be changed

Worth stating plainly, because most of the architecture is sound and the temptation after an audit like this is to rebuild:

- The **six-station cost lifecycle** (`reserved → committed → accrued → actual → paid`, with `released` as inert history) is correct, and the "advancing a station relieves the prior one" invariant is exactly right. It is not wrong — it is unwired.
- The **cost-code library as the real taxonomy**, with `project_cost_codes` assembling itself from use, is the right model and the reasoning in `cost-code-picker.ts` is sound.
- **Never blocking over-budget spend**, only escalating it, is the right call for this business.
- Moving the **RFQ before pricing rather than after approval** is correct governance. F1 is a bug in that gate, not an argument against it.
- Separating **`cost_approved_at` from `approved_at`** was the right fix and should be preserved.

The remediation above changes no model. It makes the models actually run.

---

## 6. Suggested order of execution

Phase 0 first and immediately — the team is blocked today. Then 1 → 2 → 3 in order, because each depends on the one before: you cannot derive links reliably until there is one writer, and activation cannot reconcile until the links derive. Phase 4 can run in parallel with 3. Phase 5 last, but written as each phase lands rather than bolted on at the end.

Total: roughly **17 working days**, of which the first day removes the blockage the team is feeling right now.
