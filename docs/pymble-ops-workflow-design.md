# Pymble Operations — Complete Workflow Design

> **Status:** design document — no code changes yet. Once you sign off on this
> doc, every implementation that follows is just executing decisions made here.
>
> Companion docs (existing): [Audit & Roadmap](./pymble-ops-audit-and-roadmap.md),
> [User Guide](./pymble-ops-user-guide.md), [Operations Guide](./pymble-ops-operations-guide.md).

---

## Part 1 — Diagnosis (audit findings)

### 1.1 The five real problems

I audited the codebase and queried the live database. Five concrete problems
underlie what you described as "incompleteness and inconsistencies."

#### Problem 1 — Department separation is leaky in the nav, not the data

- The **Approvals** menu link is shown to **every operational role**
  (`OPS_OPERATIONAL_ROLES`). Click it as a non-leader and you land on a page
  that *correctly* filters down to "your own + assigned to you" — but the link
  being there at all makes it feel like everyone sees everyone else's stuff.
- The data layer ([approvals.ts:187–193](src/lib/ops/approvals.ts)) is already
  doing the right thing: only Developer / MD / GM see all; everyone else only
  sees requests they raised, or steps assigned to their user / role.
- **Fix:** narrow the nav link to actual approver/requester roles + add a
  per-module tab filter so a Procurement Manager only sees procurement
  approvals by default, etc.

#### Problem 2 — Workflows are wired to roles that don't exist in your org

Live database, today:

| Role | Active users |
| --- | --- |
| Developer | 1 |
| Managing Director | 1 |
| Operations Manager | 1 |
| Procurement Manager | 1 |
| Procurement Assistant | 1 |
| Engineer | 3 |
| HSE Officer | 1 |
| HSE Assistant Officer | 1 |
| Human Resource | 1 |
| Admin / Receptionist | 1 |
| **Quantity Surveyor** | **0** ❌ |
| **Projects Manager** | **0** ❌ |
| **General Manager** | **0** ❌ |
| **Finance Manager** | **0** ❌ |
| **Accountant** | **0** ❌ |

But the system's approval chains assume:

- **Material request** approval chain = *Projects Manager → Procurement Manager*
  — Projects Manager doesn't exist, so the chain dead-ends at step 1.
- **Purchase Order** approval chain = *Procurement Manager → Finance Manager → MD (above 50k)*
  — Finance Manager doesn't exist, so the chain dead-ends at step 2.
- **BOQ** ownership = anyone with `canManageOps` (effectively everyone except crew),
  which is far too broad: a Procurement Manager today *can* create a BOQ, which
  you've said should not happen.

This is the single biggest source of "things look broken" — the workflows are
correct in theory but **the actors aren't filled**.

#### Problem 3 — Edit / Delete coverage is missing across most modules

I counted `update*` and `delete/archive/cancel*` server actions per module:

| Module | Create | Update | Delete/Archive |
| --- | :-: | :-: | :-: |
| BOQ | 2 | **0** ❌ | **0** ❌ |
| Material Requests | 1 | **0** ❌ | **0** ❌ |
| Invoices | 1 | **0** ❌ | 0 |
| Payroll | 2 | **0** ❌ | 0 |
| Daily Site Reports | 1 | **0** ❌ | 0 |
| Workers | 1 | **0** ❌ | 0 |
| Attendance | 1 | **0** ❌ | 0 |
| Staff | 1 | 0 | 1 (deactivate only) |
| Stores Inventory | 2 | 0 | 0 |
| Sites | 1 | 1 ✅ | 1 ✅ (just added) |
| Suppliers | 1 | 1 ✅ | 1 ✅ |
| Commercial | 10 | 1 | 11 ✅ |
| HR | 7 | 3 | 3 |

**Once a BOQ or material request is created, nobody can edit or delete it
through the app.** You've correctly identified this as the most painful gap.

#### Problem 4 — The PDF workflow has a step the code doesn't model

The Odoo PDF (and your description) describes:

> Site Engineer → raises material request → **Procurement adds actual supplier
> prices** → Finance approves the cost → PO issued.

Today the system has:

> Engineer → raises material request → Projects Manager approves → Procurement
> Manager approves → RFQ → quotes → PO → PO approval chain (incl. Finance) → PO issued.

The current model only gets supplier prices into the picture **after** the
material request is approved (when an RFQ is raised). Finance only sees costs
at PO time, not material-request time. That mismatch is real — your workflow
is more efficient (cost visibility earlier) and the system needs a small
extra status to support it: `pricing_pending` between `approved` and `ordered`.

#### Problem 5 — Daily reports & HSE feedback don't route up

- HSE Officer / HSE Assistant cannot create **material requests** (PPE, safety
  equipment) today.
- There is no "weekly HSE report" concept.
- Daily Site Reports exist but there is **no automatic routing** of completion
  to Operations Manager / Projects Manager / GM / MD. The MD has to refresh the
  module to see them.
- Rejections on material requests / approvals leave a comment in the approval
  trail but **don't push a notification with reason back to the requester**.

---

## Part 2 — Workflow design

For each record type in the system, this is the **target** model. Each section
follows the same shape — owner, status flow, edit, delete, who's notified,
visibility. After Part 2 there's an RBAC matrix and Part 3 sequences the work.

### 2.1 BOQ (Bill of Quantities)

**Owner:** Quantity Surveyor.

**Status flow:** `draft` → `issued` → `superseded` (replaced by new version) → `archived`.

**Actions & roles:**

| Action | Allowed roles | Constraint |
| --- | --- | --- |
| Create | QS, Projects Manager, Developer, MD | While `draft` |
| Edit lines (description / unit / qty / rate / supplier) | QS, Projects Manager, Developer, MD | While `draft` |
| Issue (status → issued) | QS, Projects Manager, Developer, MD | From `draft` only |
| Edit lines on issued BOQ | **Blocked** | Create a new version instead |
| Supersede (new version) | QS, Projects Manager, Developer, MD | Always |
| Archive (soft delete) | **MD, GM, Projects Manager, Operations Manager, Developer** | Always |
| Hard delete | **Developer only** | Never advertised in UI |

**Visibility:** any role with the BOQ menu (per current model: leadership,
commercial, procurement). Site-scoped (you only see BOQs for sites you have a
relationship with — see Part 2.14).

**Notifications on create/issue:**
- *Issued* → Procurement Manager, Procurement, Finance Manager, Projects Manager
  (so procurement knows there's commercial scope to source).

**Audit:** every action recorded with actor name + role on the BOQ activity panel.

### 2.2 Material Request

**Owner:** **Engineer, Site Agent, Operations Manager, Projects Manager, HSE Officer**
(HSE added — was missing).

**Status flow:**

```
draft → submitted → in_review → approved → pricing_pending → priced →
finance_review → ordered → closed
                ↓
             rejected (terminal, requester gets reason)
                ↓
             cancelled (terminal)
```

The two **new** statuses are:
- **`pricing_pending`** — request approved by operations; waiting for procurement
  to attach supplier prices.
- **`priced`** — procurement has filled in actual supplier prices; ready for
  Finance to approve the cost.
- **`finance_review`** — Finance has the priced request in their queue.

**Actions & roles:**

| Action | Who | Status it's allowed in |
| --- | --- | --- |
| Create | Engineer, Site Agent, Ops Mgr, Projects Mgr, HSE Officer, HSE Assistant, QS, Procurement, leadership | n/a |
| Add / edit line items | Requester + Ops Mgr + Projects Mgr | `draft`, `rejected` |
| Submit for approval | Requester + Ops Mgr + Projects Mgr | `draft`, `rejected` |
| Approve (step 1: operations) | **Operations Manager, Projects Manager**, MD, GM, Developer | `submitted`, `in_review` |
| Reject (any step) | Same approvers | `submitted`, `in_review`, `priced`, `finance_review` |
| **Attach supplier prices** | **Procurement Manager, Procurement** | `pricing_pending` |
| Approve cost (step 2: finance) | **Finance Manager, Accountant**, MD | `priced`, `finance_review` |
| Issue PO from approved request | Procurement Manager, Procurement, MD | `ordered` |
| Close | Procurement Manager, Stores | `ordered` (after all lines received) |
| Edit after closure | **Blocked** | n/a |
| Cancel (before procurement) | Requester (their own), Ops Mgr, MD, Developer | not `ordered`, not `closed` |
| Archive / hard delete | **Ops Mgr, Projects Mgr, MD, Developer only** | `rejected`, `cancelled`, `closed` |

**Approval chain (this is the user's exact requested flow):**

1. Engineer/HSE/Site raises request (`draft`)
2. Submits (`submitted` → `in_review`)
3. **Operations approval** (Ops Mgr OR Projects Mgr): approves or rejects with reason. Approve → `pricing_pending`
4. **Procurement adds actual supplier prices** per line item (`pricing_pending` → `priced`)
5. **Finance approval** of the priced request (`priced` → `finance_review` → `approved`)
6. Procurement converts to RFQ (existing flow) → PO. Status moves to `ordered` when PO issued
7. Stores logs GRN → status moves to `closed`

**Bootstrap fallback (because Projects Manager / Finance Manager are empty roles):**
- If an approver role has zero active users at the time of submission, the chain
  auto-substitutes the next-up role: Projects Manager fallback = Operations Manager
  → GM → MD; Finance Manager fallback = Accountant → MD.
- An audit event is written noting which role was substituted, so when the seat
  is filled later you can backfill ownership.

**Notifications:**
- **Submitted** → Ops Mgr + Projects Mgr (whoever exists)
- **Operations-approved** → Procurement Manager + Procurement (queue: "add prices")
- **Priced** → Finance Manager + Accountant (queue: "approve cost")
- **Rejected at any step** → **requester** (with the rejecter's name + reason in
  the body)
- **Final approval** → requester + Procurement (queue: "raise RFQ/PO")
- **Closed** → requester

**Visibility:** site-scoped + role-scoped. Engineers see their own + their
site's requests. Operations / Projects / Procurement / Finance see all requests
they have a role in. MD/GM/Developer see everything.

**Feedback loop (the user's explicit ask):** every rejection or status change
queues a notification to the requester with the actor's name, role, and reason.

### 2.3 RFQ → Quote → PO

Largely already correct in code. The remaining gaps:

| Issue | Fix |
| --- | --- |
| PO approval chain currently `Procurement Mgr → Finance Mgr → MD`, but Finance Mgr is empty | Same bootstrap fallback as 2.2 (Finance Mgr → Accountant → MD) |
| PO has no edit action | Add `updatePurchaseOrderAction` (limited to `draft` POs; Procurement only) |
| RFQ has no delete | Add archive (Procurement Manager, leadership only); only allowed when status is `draft` or `cancelled` |

### 2.4 GRN → Stores

| Action | Who |
| --- | --- |
| Create GRN | Procurement, Procurement Assistant, Stores user (new role? or use existing operations_manager) |
| Edit GRN | Same, while `posted` and within 48 hours |
| Cancel GRN | Procurement Manager, MD only |

Pop-up notification to Procurement Manager + requester of the linked material
request when a GRN is posted ("materials have arrived for your request X").

### 2.5 Daily Site Report

**Owner:** Engineer, Site Agent, HSE Officer (HSE adds the HSE column).

**Status flow:** `draft` → `submitted` → `reviewed`.

**Actions:**
- Create / edit / submit: Engineer, Site Agent, HSE Officer (per their column)
- Review: Operations Manager, Projects Manager
- **On submit**, notification fans out to **Operations Manager, Projects Manager,
  General Manager, Managing Director** (PDF requirement).
- Archive: Ops Mgr, MD, Developer.

### 2.6 Weekly HSE Report — NEW

A new record type so HSE can summarise the week for leadership.

| Field | Notes |
| --- | --- |
| `week_start`, `week_end` | Date range |
| `site_id` | Required (one report per site per week) |
| `incidents_count` | Auto-rolled from `hse_incidents` in that week |
| `near_misses_count` | Auto-rolled |
| `ppe_compliance_pct` | Manual or auto-rolled |
| `toolbox_talks_held` | Auto-rolled |
| `inspections_completed` | Auto-rolled |
| `concerns` | Free text |
| `actions_planned_next_week` | Free text |
| `status` | `draft` / `submitted` |

**Actions:** create/edit by HSE Officer / HSE Assistant. Submit → notifies
Operations Manager + Projects Manager + GM + MD (your explicit request).
Archive: HSE Manager, MD, Developer.

This is a new table + page + actions. Sized at ~half a day.

### 2.7 HSE Incidents, PPE, Toolbox Talks, Inspections, Audits

Existing model is good. The one improvement: any record completion (incident
closed / inspection completed / audit completed) queues a notification to GM
+ MD with the severity / score, so leadership sees safety pressure without
opening the module.

### 2.8 Invoices

| Action | Who | Status |
| --- | --- | --- |
| Create | QS, Finance Manager, Accountant, MD | n/a |
| Edit | Same | `draft` only |
| Mark sent | Finance Manager, Accountant, QS, MD | from `draft` |
| Mark paid | Finance Manager, Accountant, MD | from `sent` |
| Cancel / void | Finance Manager, MD, Developer | not `paid` |
| Archive | MD, Developer only | `paid` or `cancelled` |

Currently: 1 create action, no update, no delete. **Fill all of the above.**

Notifications:
- *Sent* → MD, GM, QS
- *Paid* → MD, GM, QS, Finance Manager

### 2.9 Payment Requests

Existing actions cover most of this. Gaps:
- No edit action — add `updatePaymentRequestAction` (only `draft` / `rejected`).
- No archive — add (MD, Developer only, for `rejected` / `paid` / `cancelled`).

### 2.10 Sites

Already done in Phase A. Confirms the user's permission table:
- Create / Edit / Stage change: **Developer, MD, GM, Operations Manager, Projects Manager**
- Archive: **Developer, MD, GM** only
- Hard delete: **Developer only**

### 2.11 Workers & Attendance

| Record | Who creates / edits |
| --- | --- |
| Worker | Site Agent, Ops Mgr, HR (currently only create exists — add edit) |
| Attendance | Same — currently only create, **add edit** for same-day records, lock after that. Approval of attendance still required for payroll |
| Archive worker | HR, Ops Mgr, MD only |

### 2.12 Payroll

| Action | Who | Status |
| --- | --- | --- |
| Create run | Finance Manager, Accountant, HR | n/a |
| Edit run details | Same | `draft` only |
| Submit for approval | Same | `draft` → `submitted` |
| Approve | MD, GM, Finance Manager | `submitted` → `approved` |
| Mark disbursed | Finance Manager, Accountant | `approved` → `disbursed` |
| Cancel run | MD, Developer | not `disbursed` |
| Archive | MD, Developer | `disbursed` |

Currently has no edit / no archive — gap.

### 2.13 Other modules (summary table — design parity with the above pattern)

| Module | Edit gap | Delete/Archive gap | Status routing gap |
| --- | --- | --- | --- |
| Stores / Inventory | yes | yes | "low stock" notification exists from Phase D; add edit/correction action |
| Equipment | partial | no | add edit |
| Fleet & Logistics | partial | no | add edit |
| Documents | n/a | exists | wire "uploaded by X" notification to interested stakeholders |
| Recruitment | exists | no | add archive for postings + applications |
| Photo log | no | partial | add edit caption / delete photo (uploader or Ops Mgr) |

### 2.14 Visibility model: site-scoping (the missing dimension)

Right now, role gives you access to a *module* but every module shows you
**all sites**. For a multi-site company that becomes noisy fast. The model
should be:

1. **Role gives you the module.**
2. **Site relationship gives you the records in that module.**

A "site relationship" is one of:
- You're the site's supervisor (`sites.supervisor_user_id`)
- You're the requester / approver / assignee on a record on the site
- You're in a **leadership/executive role** (Developer, MD, GM, Projects Manager,
  Operations Manager) → see every site

A new `site_team_members` table can make the relationship explicit when needed
(e.g. assigning two engineers + an HSE officer to one site). Most queries can
be added incrementally; not blocking for the demo.

---

## Part 3 — Department-specific Approvals view

The Approvals page today is **one queue showing every type of decision**. That's
the source of the "everyone sees everything" feeling. New design:

```
/ops/approvals
├── My queue           (default — only items where I'm an active approver)
├── Operations         (material requests, equipment requests)  — Ops Mgr, Projects Mgr
├── Procurement        (POs, supplier quotes awaiting decision) — Procurement Mgr
├── Finance            (priced material requests, payments, payroll) — Finance roles
├── HR                 (leave, recruitment) — HR roles
└── HSE                (risk assessments, training)             — HSE Manager
```

Each tab is a `module_key` filter on the existing `approval_requests` table.
Roles without a tab don't see it. MD/GM/Developer can switch tabs but their
default is "My queue."

The existing visibility data filter already does the right thing — this is just
splitting the UI presentation.

---

## Part 4 — RBAC matrix (master sheet)

The single table you'll reference for "who can do what." All "✅" means **only
that role and Developer**. "—" means not applicable.

| Record | Create | Edit | Submit / Issue | Approve | Reject | Archive | Hard delete |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Site** | Dev, MD, GM, Ops, Proj | Same | — | — | — | Dev, MD, GM | Dev |
| **BOQ** | QS, Proj, MD, Dev | While draft: same | QS, Proj, MD, Dev | — | — | Dev, MD, GM, Proj, Ops | Dev |
| **Material Request** | Eng, Site, Ops, Proj, HSE, HSE Asst, QS, Proc, leadership | Requester while draft/rejected | Same | Step 1: Ops, Proj. Step 2 (cost): Fin, Acc, MD | Any approver | Dev, MD, Ops, Proj | Dev |
| **MR pricing (lines)** | — | Procurement Mgr, Procurement | — | — | — | — | — |
| **RFQ** | Proc Mgr, Proc | Proc Mgr, Proc (draft) | Same | (auto-issued when supplier invited) | — | Proc Mgr, MD | Dev |
| **Supplier Quote** | Auto on invite | Proc Mgr, Proc | — | — | — | Proc Mgr | Dev |
| **Purchase Order** | Proc Mgr (from awarded quote) | Proc Mgr (draft) | Proc Mgr | Step 1: Proc Mgr. Step 2: Fin Mgr (fallback Acc, MD). Step 3 above threshold: MD | Any approver | Proc Mgr, MD | Dev |
| **GRN** | Proc, Proc Asst, Ops | Same within 48h | — | — | — | Proc Mgr, MD | Dev |
| **Stock movement** | Stores, Proc | Stores (within 24h) | — | — | — | Proc Mgr, MD | Dev |
| **Delivery Exception** | Stores, Proc, Site | Same | — | — | — | Proc Mgr, MD | Dev |
| **Daily Site Report** | Eng, Site, HSE | Same while draft | Same | Ops Mgr, Proj | — | Ops, MD | Dev |
| **Weekly HSE Report (new)** | HSE, HSE Asst | Same | Same | — | — | HSE, MD | Dev |
| **Site Instruction** | Eng, Proj, Ops | Same while draft | Same | Proj, Ops, GM | Same | Proj, MD | Dev |
| **QA/QC Inspection** | Eng, QS | Same while planned/in progress | — | — | — | Proj, MD | Dev |
| **HSE Incident** | HSE, Eng, Site, Ops | HSE while open | — | — | — | HSE, MD | Dev |
| **PPE Issue** | HSE, HSE Asst, Site, Admin | Same | — | — | — | HSE, MD | Dev |
| **Toolbox Talk** | HSE, HSE Asst, Site | Same | — | — | — | HSE, MD | Dev |
| **Risk Assessment** | HSE | HSE | HSE | HSE Mgr, GM, MD | Same | HSE, MD | Dev |
| **Worker** | Site, Ops, HR | Same | — | — | — | HR, MD | Dev |
| **Attendance** | Site, Ops | Same-day correction by site/Ops | — | Ops Mgr, Proj | — | Ops, MD | Dev |
| **Payroll Run** | Fin Mgr, Acc, HR | While draft | Same | MD, GM, Fin Mgr | Same | MD | Dev |
| **Invoice** | QS, Fin Mgr, Acc, MD | Draft only, by Fin / QS | Send, Pay: Fin Mgr, Acc, MD | — | — | MD | Dev |
| **Payment Request** | Fin Mgr, Acc, Proc | Draft / rejected by creator | Same | Fin Mgr; above thresh: MD | Same | MD | Dev |
| **Project Budget** | Fin Mgr, Acc, Proj | Same while draft | Same | MD, GM, Fin Mgr | Same | MD | Dev |
| **Commercial IPC** | QS | Draft only, by QS | QS | QS Mgr, Fin Mgr, MD | Same | QS Mgr, MD | Dev |
| **Variation** | QS, Eng | Draft only | QS | QS Mgr, Proj, MD | Same | QS Mgr, MD | Dev |
| **Claim** | QS, Eng | Draft only | QS | QS Mgr, MD | Same | QS Mgr, MD | Dev |
| **Contract** | QS, MD | Same while draft | Same | MD only | — | MD | Dev |
| **Equipment** | Ops, Fleet, Proc | Ops, Fleet | — | — | — | Ops, MD | Dev |
| **Equipment Request** | Eng, Site | Eng (while draft) | Same | Ops, Fleet | Same | Ops, MD | Dev |
| **Fuel Log** | Fleet, Driver, Ops | Same-day correction | — | — | — | Ops, MD | Dev |
| **Transport Request** | Eng, Site, Ops | Same while draft | Same | Ops, Fleet | Same | Ops, MD | Dev |
| **Accommodation** | HR, Admin, Ops | Same while draft | — | Ops, HR | — | HR, MD | Dev |
| **Employee** | HR | HR (while active) | — | — | — | HR, MD | Dev |
| **Leave Request** | Employee (self), HR | Self while draft | Same | HR, GM, MD | Same | HR, MD | Dev |
| **Recruitment Posting** | HR, MD | HR while draft | Publish: HR | — | — | HR, MD | Dev |
| **Job Application** | Public (no role) | — | — | HR (status moves) | — | HR, MD | Dev |
| **Document upload** | Per module owner | Owner | — | — | — | Owner, MD | Dev |

**Reading rule:** if your role isn't listed, you don't have that action. Developer
always has every action.

---

## Part 5 — Implementation plan

This is where it gets executed once you approve the design. Sequenced so the
*earliest changes are safe* and unblock everything else.

### Step 0 — Bootstrap the org

Before any code: **create the missing staff users** (or pre-assign existing
users as substitutes) so approval chains have somewhere to go:

- Pick or hire: Quantity Surveyor, Projects Manager, GM, Finance Manager,
  Accountant.
- OR: temporarily designate existing leadership as substitutes (e.g. MD plays
  GM until one is hired) by adding accounts at the missing roles via Staff.

The fallback logic below means workflows won't crash if a role is empty, but
the design is cleaner once the org chart matches the workflow.

### Phase H — Department separation & feedback loops (3 days)

| # | Item | Why it's first |
| --- | --- | --- |
| H1 | **Approvals page tabs** (My queue + 5 department tabs) | Single biggest visible "everyone sees everything" complaint |
| H2 | **Rejection → notification with reason** to requester (all modules already using `approval_requests`) | Closes the feedback loop everywhere at once |
| H3 | **Material Request `pricing_pending` + `priced` statuses** + Procurement "Attach supplier prices" form + Finance approval step | The PDF flow you specifically asked for |
| H4 | **Approval-chain fallback** when a role has 0 active users | Stops "stuck in step 2" issues today; lets the system run without all roles filled |

### Phase I — BOQ + Material Request edit/delete (2 days)

| # | Item |
| --- | --- |
| I1 | `updateBoqDocumentAction`, `updateBoqLineItemAction`, `archiveBoqAction` (RBAC per Part 4) |
| I2 | `updateMaterialRequestAction`, `cancelMaterialRequestAction`, `archiveMaterialRequestAction` |
| I3 | UI: edit-in-place panels on both BOQ and Material Request pages, with the existing inline-details pattern (matches Sites edit panel) |
| I4 | Narrow BOQ create permission from `canManageOps` → `canCreateBoq = QS + Projects Mgr + leadership` |

### Phase J — Edit/delete for the rest (3 days)

Edit + archive actions across: Invoice, Payment Request, Payroll Run, Worker,
Attendance, Stores movements, Site Instruction, Daily Site Report, Equipment,
Equipment Request, GRN. Each gets the same shape (update / cancel / archive)
with permissions per Part 4.

### Phase K — HSE completeness (2 days)

| # | Item |
| --- | --- |
| K1 | Add HSE Officer + HSE Assistant to `MATERIAL_REQUEST_CREATOR_ROLES` |
| K2 | **Weekly HSE Report** — migration + table + page + create/edit/submit actions + submission notifications to Ops Mgr / Projects Mgr / GM / MD |
| K3 | Daily Site Report submission → notification fan-out to Ops Mgr / Projects Mgr / GM / MD |
| K4 | HSE record closure → notification to GM + MD with severity/score |

### Phase L — Visibility + site-scoping (3 days, optional for first launch)

| # | Item |
| --- | --- |
| L1 | Add `site_team_members` table + assignment UI on Sites |
| L2 | Filter material requests / daily reports / HSE / engineering controls by site relationship |
| L3 | Leadership roles bypass site-scoping |

### Phase M — Notification coverage from earlier roadmap (2 days)

The previously-paused work — extend notification queue calls into
invoice / payroll / commercial / stores / equipment create+update flows
(per the previous Phase B3 audit). Reuse the fanout helper.

### Phase N — Plain English (Glossary + UI labels) (1 day)

Triggered by your feedback: "These abbreviations I don't understand them."
See Part 8 for the full glossary and label-expansion plan.

### Phase O — Role-scoped Workspace Timeline (2 days)

Triggered by: "HSE should not see activities done that don't concern them …
but Operations Manager, GM, MD and developer should see who has done what
entirely with their names and role."
See Part 9 for the design.

### Phase P — Make notifications actually appear (1.5 days)

Triggered by: "notifications are not showing."
Live database confirms zero notifications exist despite all the queueing code
being in place. See Part 10 for the root cause and the fix.

**Total: ~18 working days of focused implementation across these phases.**
Each phase is independently shippable — there's no need to do them all in one
go before showing improvements.

---

## Part 6 — What does NOT change

To be explicit about what we're keeping (so nobody hears "redesign" and panics):

- The existing **records, IDs, audit history** stay intact. Every change is
  *additive* (new statuses, new actions, new permission checks) — no record
  types are being deleted.
- The **module navigation** model stays as it is. Only the Approvals link gets
  narrower and the Approvals page gets tabs.
- **Existing approval requests in flight** continue to use the chain they were
  created with. New chains use the new model.
- **All Phase A–F work** (sites stage, BOQ supplier+CSV+PDF, recruitment,
  cashflow, ageing, KPIs, etc.) stays as-is and slots into this design.

---

## Part 7 — Open questions for you before implementation

Three small decisions I can't make for you. Each is a one-line answer.

1. **Should the QS role be the *only* BOQ creator, or also Projects Manager?**
   (Doc currently has both — drop one if you'd rather.)

2. **For sites, do you want the "site team members" model (Part 2.14) now, or
   later?** It's the cleanest separation of duties but it's a week of work; the
   role-based scoping already covers 80% of the value.

3. **Material request: when Finance approves the cost, do they need to be able
   to *change* the prices Procurement entered, or only approve/reject as a whole?**
   (Affects whether Finance step needs a price-edit UI.)

When you've answered these three, we can start Phase H. The rest of the design
above is concrete enough to execute against without more questions.

---

## Part 8 — Plain English (Glossary + UI labels)

You said: *"These abbreviations I don't understand them so I think they should
be in full form so I know when even explaining to the team I know what it is."*
This part is the answer.

### 8.1 The strategy

There are two reasons we can't just delete every abbreviation:

- Some are **industry standard** and your team will hear them on every site —
  e.g. **BOQ**, **PO**, **GRN**, **IPC**. Hiding them entirely means staff who
  hear the term in a meeting won't know it's the same thing.
- Some are **screen-space sensitive** — e.g. a column header that says
  "Personal Protective Equipment" instead of "PPE" wraps to three lines.

So the rule is:

1. **Module titles and main page headings** → full form. *(e.g. the menu item
   "BOQ" becomes "Bill of Quantities")*.
2. **Subtitles and first paragraph** → "Full Form (ABBR)". *(e.g. "Manage the
   Bill of Quantities (BOQ) for each project.")*.
3. **Tables, badges, narrow chips, dense forms** → keep the abbreviation, but
   add a **tooltip on hover** showing the full form.
4. **Code identifiers** (type names, table names, file names) → stay as they
   are. Renaming `OpsBoqDocument` to `OpsBillOfQuantitiesDocument` is pure cost
   for zero user benefit.

### 8.2 The full glossary (for you to share with the team)

| Abbreviation | Full form | What it means in plain English |
| --- | --- | --- |
| **BOQ** | Bill of Quantities | The priced list of every measured item in a project — the commercial backbone of every job. |
| **RFQ** | Request for Quotation | A document you send to suppliers asking them to quote prices. |
| **PO** | Purchase Order | The official order issued to a supplier after a quote is awarded. |
| **GRN** | Goods Received Note | The record you create when materials arrive on site, proving what was delivered. |
| **IPC** | Interim Payment Certificate | A staged invoice to the client, certifying work completed to date. |
| **QS** | Quantity Surveyor | The commercial specialist who builds and tracks the BOQ, IPCs, variations and claims. |
| **MD** | Managing Director | The top executive. Approves the highest-value items and sees the executive dashboard. |
| **GM** | General Manager | Second tier of leadership; runs day-to-day company-wide operations. |
| **HSE** | Health, Safety & Environment | Everything safety related: incidents, PPE, toolbox talks, inspections, audits, training. |
| **PPE** | Personal Protective Equipment | Safety gear issued to workers (helmets, boots, gloves, visibility vests). |
| **LTIFR** | Lost-Time Injury Frequency Rate | (Lost-time injuries × 1,000,000) ÷ total hours worked. The headline safety KPI. |
| **TRIFR** | Total Recordable Injury Frequency Rate | Same as LTIFR but counts all recordable injuries, not just lost-time. |
| **KPI** | Key Performance Indicator | A number you track to know if the business is healthy. |
| **VAT** | Value Added Tax | Government tax on sales (currently 16% in Zambia). |
| **TPIN** | Tax Payer Identification Number | The Zambia Revenue Authority identifier on every supplier and client. |
| **ZMW** | Zambian Kwacha | The local currency. |
| **PWA** | Progressive Web App | A website that can be installed on your phone like a real app. |
| **CSV** | Comma-Separated Values | A spreadsheet file format you can export from Excel. |
| **CSP** | Content Security Policy | Browser security header that controls what the page is allowed to load (developer-facing). |

### 8.3 The UI labels that change

These are the specific menu items, headings, and button labels we'll rename.
Everything else (small chips, dense table cells) stays abbreviated with hover
tooltips.

| Where | Today | Becomes |
| --- | --- | --- |
| Menu item | "BOQ" | "Bill of Quantities" |
| Menu item | "RFQs and Purchase Orders" | "Requests for Quotation and Purchase Orders" |
| Menu item | "IPCs, Variations, and Claims" | "Interim Payment Certificates, Variations and Claims" |
| Menu item | "HSE Compliance" | "Health, Safety & Environment Compliance" |
| Menu item | "Incidents and Actions" | "Safety Incidents and Corrective Actions" |
| Page heading | "HSE KPIs" | "Health, Safety & Environment Key Indicators" |
| Page heading | "BOQ register" | "Bill of Quantities register" |
| Form field | "TPIN" | "TPIN — Tax Payer Identification Number" (label + helper) |
| Form field | "VAT amount" | "VAT amount (16%)" |
| Button | "New BOQ" | "New Bill of Quantities" |
| Button | "Post GRN" | "Post Goods Received Note" |
| Badge | "PPE" / "LTIFR" / "TRIFR" | unchanged, but tooltip shows full form |

### 8.4 A separate `pymble-ops-glossary.md` document

The glossary above will be lifted into its own doc you can hand to a new
joiner — single page, alphabetical, with one example sentence each. It's a
training aid, not part of the app.

---

## Part 9 — Role-scoped Workspace Timeline

You said: *"The workspace timeline specific to their roles — HSE should not see
activities done that don't concern them. Operations Manager, GM, MD and
Developer should see who has done what entirely with their names and role."*

### 9.1 Diagnosis (from the live database)

Two independent issues are tangled here.

**Issue 1 — "It only shows System":** the live data shows the opposite. Of the
last 10 activity events:

- **10 out of 10 have a real actor recorded** (`actor_user_id` is populated)
- Names returned by the join include *Mukuka Ngulube (Procurement Manager)*,
  *Thandiwe Mulenga (Engineer)*, *Rose Chipili (HSE Assistant Officer)*, etc.
- Only ~9% of all historical events (the **6 cron-driven HSE escalation
  sweeps**) genuinely have no actor — those are system jobs and **correctly**
  show as "System".

So the actor display fix already shipped is working in code. If you're seeing
"System" on every line, the most likely cause is one of:

- **Browser cache** — hard-refresh the overview page.
- **A deploy that didn't include the actor fix yet** — the change is in
  `src/lib/ops/overview.ts` and `src/components/ops/OpsRoleOverviewDashboard.tsx`.

Run this in the browser console after a hard refresh and the names should
appear. If they don't, we'll dig deeper — but the data path is verified live.

**Issue 2 — "HSE shouldn't see activities that don't concern them":** confirmed.
Today the activity panel shows every audit event to everyone with
`canManageOps` permission. No module filter is applied.

A second wrinkle came out of the live data: **73% of audit events have no
`module_key` recorded** (38 of 52 events). They are written through direct
`supabase.from("audit_events").insert(...)` calls that don't set `module_key`,
instead of through the central `recordOpsAuditEvent()` helper. That means even
when we add a module filter, most events would be excluded from every department
view because their module is unknown.

### 9.2 The fix has three parts

**Part A — Backfill `module_key` everywhere.**

Find every direct `audit_events.insert` call and add `module_key`. The list
(from the codebase audit) is:

- `worker-actions.ts` → `module_key: "workers"`
- `attendance-actions.ts` → `module_key: "attendance"`
- `site-actions.ts` → `module_key: "sites"`
- `boq-actions.ts` → `module_key: "boq"`
- `payroll-actions.ts` → `module_key: "payroll"`
- `organization-actions.ts` → `module_key: "settings"`
- `staff-actions.ts` → `module_key: "staff"`

Once these are tagged, every new event is filterable.

**Part B — The role → modules visibility map.**

| Role | Sees events from these modules |
| --- | --- |
| Developer, Managing Director, Owner | **Everything** |
| General Manager, Operations Manager, Projects Manager, Manager | **Everything** |
| Engineer | sites · material_requests · daily_site_reports · engineering_controls · attendance · workers · photos |
| Quantity Surveyor | boq · commercial · invoices · project_budgets · material_requests |
| Procurement Manager, Procurement, Procurement Assistant | rfq_po · suppliers · material_requests · stores_inventory · delivery_exceptions · equipment |
| Finance Manager, Accountant | invoices · payment_requests · payroll · project_budgets · commercial |
| HSE Officer, HSE Assistant Officer | hse · hse_compliance |
| Human Resource | employees · recruitment · staff · payroll · attendance |
| Admin / Receptionist | employees · fleet_logistics · documents |

**Part C — The query change.**

The overview-page activity fetch ([src/lib/ops/overview.ts:502](src/lib/ops/overview.ts)) adds an
`.in("module_key", visibleModules)` filter, **unless** the user has a
leadership role, in which case no filter is applied.

This keeps:

- HSE seeing only safety activity (incidents, PPE, audits)
- Procurement seeing only procurement chain (material requests, RFQs, POs, GRNs)
- Engineer seeing only site delivery (their requests, daily reports, attendance)
- **Leadership (MD / GM / Ops Mgr / Projects Mgr / Developer) seeing everything
  with the actor name and role**, exactly as you described.

### 9.3 Side-effect bonus: it also reveals cross-departmental contamination

A Phase O implementation also surfaces something the live data made visible:

> The HSE Assistant Officer in the database has created `worker.created`,
> `attendance.created`, and `attendance.approved` events.

Per Part 4's RBAC matrix, those actions belong to Site Agent / Operations
Manager / HR — not HSE. So the current permissions are too broad and a real
user is doing actions outside their department. Phase J's permission tightening
fixes this at the same time: workers can only be created by Site / Ops / HR.

---

## Part 10 — Why notifications aren't showing (root cause + fix)

You said: *"Notifications are not showing. I think they're not properly wired."*
You're right that they're not showing. The reason is more interesting than
"missing code."

### 10.1 The live database tells the story

I queried the live notifications table. **It is completely empty.** Zero rows,
ever. Not for any recipient, not for any module:

```text
notifications_by_recipient → []
notifications_by_module    → []
notifications_unread       → 0
```

This is true despite the queueing code being in place across many action
files (approvals, material requests, RFQs/POs, HSE, documents, recruitment,
profile). So **the code path exists but never fires**. Why?

### 10.2 The root cause

Most notification queueing follows this pattern:

```ts
const recipients = await usersWithRoles([
  "projects_manager",      // ← empty role today
  "procurement_manager",   // ← exists
]);
for (const recipient of recipients) {
  await queueOpsNotification({ recipientId: recipient.id, ... });
}
```

And the live database shows:

| Role expected to receive | Active users |
| --- | --- |
| Projects Manager | **0** |
| Finance Manager | **0** |
| General Manager | **0** |
| Quantity Surveyor | **0** |
| Accountant | **0** |

So when a material request is submitted and the code says "notify Projects
Manager", `recipients` is an **empty array**, the loop runs zero times, and
no notification is queued. The same is true for almost every "leadership"
fanout.

This is the same root cause as the approval chain dead-ending at step 2 — the
workflows are correct in theory, but the actors don't exist in the org.

### 10.3 The fix has three parts

**Part A — Recipient fallback.**

A small helper, used by every fanout call:

```text
fanoutRoles([projects_manager], fallback: [operations_manager, general_manager, managing_director])
```

When the primary roles return no active users, the helper falls through to the
fallback roles. The first non-empty result wins. This is the same fallback rule
as the approval-chain fix in Phase H4 — they share one helper.

| Primary role missing | Fallback chain |
| --- | --- |
| Quantity Surveyor | → Projects Manager → Operations Manager → MD |
| Projects Manager | → Operations Manager → GM → MD |
| Finance Manager | → Accountant → MD |
| Accountant | → Finance Manager → MD |
| General Manager | → MD |
| HSE Manager (none defined) | → HSE Officer → MD |

**Part B — Cover the action paths that don't queue at all yet.**

From the previous audit (now confirmed by the empty notifications table):

| Module | Has queue calls? | Add coverage for |
| --- | --- | --- |
| Sites | No | Create / archive → leadership |
| Workers | No | Create / archive → HR + Site Agent |
| Attendance | No | Submit / approve → Operations Manager, Payroll prep |
| Invoices | No | Issue / send / paid → MD, GM, QS, Finance |
| Payroll | No | Submit / approve / disburse → MD, Finance, HR |
| Stores / GRN | No | GRN posted → original requester + Procurement + Finance |
| Equipment | No | Equipment request raised → Operations, Fleet |
| Commercial | No | IPC submitted / certified / paid → QS, Finance, MD |
| Recruitment | Yes (just done) | Verify it still works after fanout helper |

**Part C — Self-test in the database.**

After implementation, the same query that returned 0 rows today should return
at least one notification per action class for the seeded user. A simple
manual demo (create a material request as Engineer → log in as Procurement
Manager → see the notification badge) is the acceptance test.

### 10.4 What you'll see when this lands

For your team specifically — given the real users today:

- **Engineer Thandiwe Mulenga** creates a material request → **Operations
  Manager John Mulilo**, **Procurement Manager Mukuka Ngulube**, and **MD
  Matimba Hatimbula** each get an unread notification in their bell icon.
- **MD approves the cost on a priced material request** → the original
  requester (Engineer) gets a notification saying *"Approved by Matimba
  Hatimbula (Managing Director)"* with a click-through to their request.
- **HSE Officer Cassim Musolo** files an incident → **Operations Manager**,
  **GM** (or MD via fallback), **Projects Manager** (or Ops via fallback)
  get a notification.

All three of these produce zero notifications today. After Phase P they fire
correctly.

---

## Part 11 — Updated open questions for you

Adding to the original three questions in Part 7:

4. **Glossary doc — separate file or section in the user guide?** Either works.
   A separate `pymble-ops-glossary.md` is easier to print and hand out; a
   section in the existing user guide keeps everything in one place.

5. **Role-scoped timeline — do you also want a "Show all" toggle for non-leadership
   roles?** For example, should an Engineer be able to opt-in to see procurement
   activity that's blocking their site? Default is to hide; the question is
   whether to add an opt-in escape hatch.

6. **Notification fallback for missing roles — confirm fallback chain.**
   The Part 10.3.A table is my recommendation but you might prefer "always copy
   the MD on anything that can't find its primary recipient" instead.

Answer those plus the original three (BOQ creator, site team members, Finance
price edit), and we're ready for the first implementation phase.

---

## Part 12 — Notifications reach every relevant department (multi-audience fanout)

You said: *"All departments should see notification, lets say an engineer
requested for materials and its approved they should get a notification, even
procurement, HSE."*

This is the right model. Every state change on a record produces notifications
for **three audiences**, not one:

| Audience | Purpose | Example |
| --- | --- | --- |
| **Action-needed** | The person who has to do the *next* step. | When a material request is approved by Operations, the **Procurement Manager** is notified: *"Add supplier prices to MR-0042."* |
| **Stakeholders** | Everyone who has touched the record so far, plus its originator. They need a status update, not an action. | The original **Engineer** who raised the request, the **Operations Manager** who already approved it, and the **Projects Manager** who's tracking site delivery. |
| **Oversight** | Leadership who needs visibility but doesn't need to act unless something goes wrong. | **Managing Director** and **General Manager** for high-value or HSE-related events. |

### 12.1 Worked example — material request goes the full distance

This is the user's example, expanded with every audience at every step:

| Step | Who gets a notification | Audience class | Body |
| --- | --- | --- | --- |
| **Engineer submits MR-0042** | Operations Manager + Projects Manager | Action-needed | *"Review and approve MR-0042 from Engineer Thandiwe Mulenga."* |
| | Engineer (the requester) | Stakeholder | *"Your request MR-0042 has been submitted for approval."* |
| | Managing Director | Oversight (only if priority = urgent or amount > threshold) | *"Urgent material request raised for site Nandos Rubis Kitwe."* |
| **Operations Manager approves** | Procurement Manager + Procurement | Action-needed | *"MR-0042 approved — please attach supplier prices."* |
| | Engineer | Stakeholder | *"Your request MR-0042 was approved by John Mulilo (Operations Manager). Procurement will source prices next."* |
| | Projects Manager | Stakeholder | *"MR-0042 entered procurement."* |
| **Procurement attaches prices** | Finance Manager + Accountant | Action-needed | *"MR-0042 priced at ZMW 72,000 — please approve the cost."* |
| | Engineer | Stakeholder | *"Your request MR-0042 has been priced. Awaiting Finance approval."* |
| | Operations Manager | Stakeholder | *"MR-0042 priced."* |
| **Finance approves cost** | Procurement Manager + Procurement | Action-needed | *"MR-0042 cleared by Finance — raise the RFQ / PO."* |
| | Engineer | Stakeholder | *"Your request MR-0042 was approved. Procurement is ordering."* |
| | Managing Director | Oversight (above threshold only) | *"Finance approved ZMW 72,000 for MR-0042."* |
| **PO issued** | Storekeeper + Site Supervisor | Action-needed | *"Materials ordered against MR-0042 — expected delivery date X."* |
| | Engineer | Stakeholder | *"Order placed for your request MR-0042. Expected delivery: X."* |
| | Finance | Stakeholder | *"PO-0019 issued (cost commitment ZMW 72,000)."* |
| **Goods Received Note posted** | Engineer (the requester) | Action-needed | *"Materials for MR-0042 have arrived on site."* |
| | Procurement Manager + Finance | Stakeholder | *"GRN-0011 posted — commit to ledger / supplier ageing."* |
| | Operations Manager | Stakeholder | *"Site Nandos Rubis Kitwe received materials."* |
| **Rejected at any step** | Engineer (the requester) | Action-needed | *"Your request MR-0042 was rejected by Mukuka Ngulube (Procurement Manager). Reason: …"* |
| | Previous approver(s) | Stakeholder | *"MR-0042 rejected at the next step."* |

The pattern is the same for every other record type. Three columns. Three
audience classes per event.

### 12.2 Audience template per record type (extract — full version goes into the
implementation phase doc)

| Record event | Action-needed | Stakeholders | Oversight |
| --- | --- | --- | --- |
| Daily Site Report submitted | Operations Manager, Projects Manager | Engineer (author) | GM, MD |
| HSE Incident reported | HSE Officer, Operations Manager | Site Engineer, Projects Manager | GM, MD |
| HSE Incident closed | — (closed) | Original reporter + Operations + Projects | GM, MD |
| Weekly HSE Report submitted | Operations Manager, Projects Manager | HSE Officer (author) | GM, MD |
| Purchase Order pending approval | Finance Manager (or fallback) | Procurement Manager, Original requester | MD (above threshold) |
| PO issued | Storekeeper, Original requester | Procurement, Finance | — |
| Invoice issued to client | — (informational) | Quantity Surveyor, Finance | MD, GM |
| Invoice paid | — | Quantity Surveyor, Finance | MD, GM |
| Payment Request approved | Accounts Payable | Original requester, Finance Manager | MD (above threshold) |
| Payroll Run submitted | Finance Manager | HR (the author) | MD |
| Payroll Run disbursed | — | HR, Finance, Operations Manager | MD |
| Variation submitted | Quantity Surveyor Manager, Projects Manager | Engineer (author) | MD (above threshold) |
| IPC certified | Finance Manager | QS (author), Projects Manager | MD |
| Job application received | HR | Hiring manager | — |
| Leave request submitted | HR, Site Supervisor | Employee (author) | — |
| Equipment request raised | Operations Manager, Fleet | Engineer (author), Site Supervisor | — |
| Goods Received Note posted | Original MR requester | Procurement, Stores | Finance (for cost accrual) |

### 12.3 Why this matters beyond convenience

This three-audience model is what kills the "I had to phone John to ask if
my request was approved" problem the Odoo requirement PDF identified.

- The **action-needed** column means the next person knows to act without being
  chased.
- The **stakeholder** column means the engineer who raised the request finds
  out it's approved without checking the dashboard.
- The **oversight** column is what gives the MD their "I see what's happening
  without taking calls" view that the PDF specifically called out.

### 12.4 Implementation notes (slot into Phase P)

- Build a single fanout helper `notifyRecordEvent(record, event, { actionRoles,
  stakeholderRoles, oversightRoles, includeRequester })` and call it from every
  action handler.
- Each call resolves recipients via the fallback table (Part 10.3.A), so
  missing roles don't kill the notification.
- The **action-needed** notifications use `tone: warn` (badge orange). The
  **stakeholder** ones use `tone: default` (badge grey). The **oversight** ones
  also use `tone: default` but are auto-muted in the bell counter for the MD —
  they appear in the notifications page but don't increment the unread badge
  (otherwise the MD's badge becomes constant noise).
- The recipient is deduplicated across audience classes — if the same user
  qualifies as both action-needed and stakeholder, they get one notification
  with the action-needed tone (whichever is higher priority).
- Read state stays per recipient (already correct in the schema).

---

## Part 13 — Internal inbox / staff messaging

You said: *"Notifications maybe can have an internal inbox where they can text
each other idk what you think about that."*

Here's my honest take. There are three options ranging from "tiny addition" to
"build Slack" — and I think the middle option is the right level for a
construction company.

### 13.1 What you already have (and may not know about)

The system has a `record_comments` table that's already wired up. Anyone who
can see a record (BOQ, material request, RFQ, PO, GRN, incident, employee,
invoice, etc.) can leave a comment. Comments are timestamped, attributed to
the author with their role, and visible on the record's activity panel.

This is already an inbox — just an *anchored* one. Conversations happen on the
record they're about, which is usually what you want in a construction company.
Example: a discussion about MR-0042 stays on MR-0042's page, not in a separate
DM thread that nobody can find a month later.

### 13.2 The three options

**Option A — Stay with anchored comments + add @mentions** ⭐ (recommended)

The minimum useful addition: a Procurement Manager typing a comment on a
material request can write *"@John Mulilo can you confirm priority on this?"*
and John gets a notification pointing back to the comment.

| What it costs | One database column (`mentioned_user_ids uuid[]` on `record_comments`), a parser to detect @names, and a fanout into the existing notifications table. **~1 day of work.** |
| Why it's right | Keeps every conversation on the record it's about. Searchable. Audit-trailed. Zero new UI concepts to teach. |
| What it's not | Not a place for "what time is the safety briefing?" — that's still a phone or WhatsApp question, and that's fine. Construction ops shouldn't try to replace the entire phone. |

**Option B — Anchored comments + @mentions + a "My Conversations" inbox view** ⭐⭐ (good upgrade)

Same as Option A but adds a `/ops/inbox` page that shows every record where
the current user is the author, has been @mentioned, or has commented in the
last 30 days. Lets a user see their pending threads without remembering which
record they're on.

| What it costs | The same as Option A plus a single new page (no new tables — it's a query). **~2 days.** |
| Why it's right | Solves the "where did I leave that discussion?" problem without inventing a chat system. |

**Option C — Full direct messaging (Slack-like)** (not recommended yet)

A new `direct_messages` table with sender, recipient, body, read state.
A `/ops/messages` page with conversation threads, real-time updates (websockets
or polling), unread counts, group threads, attachments…

| What it costs | A new module from scratch: table, RLS, real-time, conversation UI, mobile considerations. **~2 weeks.** |
| Why I'd push back | Most construction ERPs that build this end up with a ghost-town inbox because the team uses WhatsApp anyway. The valuable conversations — "should we approve this?", "is the supplier reliable?", "what's the safety risk?" — are best held *on the record they're about*, where they leave a permanent audit trail and are visible to everyone with a stake. Free-form DMs lose that. |
| When it'd be worth it | If you find Option B isn't enough after 2–3 months of real use. |

### 13.3 My recommendation

**Go with Option B.** It gives you:

- @mentions on every record (so people get notified when they're called out)
- A unified "My Conversations" inbox that shows pending threads
- All conversations still anchored to the work they're about, with a permanent
  audit trail
- Roughly 2 days of work — finishes before Phase P

Defer Option C until after the team has used Option B for a couple of months.
If they're still texting each other on WhatsApp about MR-0042 instead of using
the record comment thread, the inbox isn't the answer — the comment-thread UX
needs to be better. We'll know which by then.

### 13.4 Implementation outline (slot in as Phase Q — 2 days)

| # | Item |
| --- | --- |
| Q1 | Add `mentioned_user_ids uuid[]` column to `record_comments` + an autocomplete picker in the comment composer that searches active users. |
| Q2 | On comment insert, fan out an "action-needed" notification to each mentioned user, with a click-through to the record + auto-scroll to the comment. |
| Q3 | Add `/ops/inbox` ("My Conversations") page — paginated list of records where the user is author / mentioned / recent commenter, with unread comment counts. |
| Q4 | Add an inbox bell with unread count to the workspace top bar, separate from the existing notifications bell. |

This is additive — no existing comments break, no schema is removed.

---

## Part 14 — Updated open questions for you

Adding to the original six:

7. **Notification fanout — confirm the three-audience model in Part 12.** Any
   tweaks per-event you want? (e.g. "I never want to be in the oversight
   audience for daily site reports — they're too frequent.")

8. **Inbox — Option A, B, or C in Part 13?** My recommendation is B but you
   may have a stronger view.

9. **@mention scope — should everyone be able to @mention anyone, or only
   within their department / site team?** I'd default to "everyone can mention
   anyone" (matches how WhatsApp works today) but it's a policy call.

When you've answered these plus the previous six, the implementation plan is
fully concrete:

- Phases H, I, J — separation of duties, edit/delete coverage
- Phases K, L — HSE completeness, site scoping
- Phases M, N — Notification coverage + Plain English UI
- Phases O, P — Role-scoped timeline + multi-audience notification fanout
- Phase Q (new) — @mentions + My Conversations inbox
- Phase R (new) — Staff role-change action (see Part 15)

---

## Part 15 — Staff role management (change roles, reactivate, edit details)

You said: *"HR should be able to change the roles assigned together with MD and
developer."*

Today the only staff actions that exist in the app are **create** (sends an
invitation) and **deactivate** (sets `is_active = false`). Everything else —
changing someone's role, fixing a typo in their name, reactivating an account,
resetting their password — has to be done with raw SQL in Supabase. That's
exactly the gap to close.

### 15.1 What's needed

| Action | Allowed roles | Hierarchy / constraints | Effect |
| --- | --- | --- | --- |
| **Create staff** (exists) | Developer, Managing Director, General Manager, Human Resource | Cannot create a role above your own tier | Sends email invitation; sets `is_active = true` |
| **Deactivate** (exists) | Developer, Managing Director, General Manager, Human Resource | Cannot deactivate your own account; cannot deactivate a role above your own tier; Developer cannot be deactivated by anyone | Sets `is_active = false` |
| **Reactivate** ❌ (new) | Developer, Managing Director, General Manager, Human Resource | Same hierarchy as deactivate | Sets `is_active = true` |
| **Change role** ❌ (new) | **Developer, Managing Director, Human Resource** | Cannot change your own role. Cannot promote into a tier above your own. Special: HR cannot change anyone *to* MD/GM, nor demote MD/GM. Cannot demote Developer. | Updates `users.role` |
| **Edit personal details** ❌ (new) | Developer, Managing Director, General Manager, Human Resource (any staff) — or the staff member themselves on their profile (already works) | Cannot change someone else's email (security boundary) | Updates name, phone |
| **Send password reset** ❌ (new) | Developer, Managing Director, General Manager, Human Resource | — | Triggers Supabase password reset email to the staff member |

### 15.2 The change-role hierarchy in plain English

The same rule the code already uses for **create** applies to **change role**:

- **Developer** — can change anyone's role to anything (including making
  someone else a Developer, or demoting a Developer to a normal role). The
  only exception is they cannot change their own role.
- **Managing Director** — can change anyone's role to anything *except*
  Developer. Cannot change their own role.
- **Human Resource** — can change anyone's role *except* Developer, Managing
  Director, and General Manager. Specifically, they can move staff between
  operational roles (Engineer ↔ Site Agent ↔ HSE Assistant ↔ Quantity Surveyor,
  etc.) but they cannot promote anyone to leadership and they cannot demote
  leadership. Cannot change their own role.
- **General Manager** — same as HR. We're explicitly *not* adding GM to the
  list of role-changers per your message, which restricts the action to HR /
  MD / Developer.

> "Cannot change your own role" is the single most important guard: it
> prevents accidental or malicious privilege escalation. Even the Developer
> needs to ask another Developer (or change it via SQL with full audit) to
> change their own role.

### 15.3 What happens when a role changes (the chain of side-effects)

This is where it gets interesting — changing someone's role is **not** just
updating a column. Several things follow:

| Effect | What happens |
| --- | --- |
| **Audit trail** | Audit event `staff.role_changed` with `metadata: { from: "human_resource", to: "engineer" }`, actor name + role recorded. |
| **Target notification** | The affected staff member gets a notification: *"Your role has been changed to Engineer by Joseph Phiri (Developer). Your menu and access will update on your next login."* |
| **Leadership notification (oversight)** | Managing Director gets a copy if HR initiated; Developer gets a copy if anyone other than Developer initiated. |
| **In-flight work** | Any approvals where the user was the assigned approver-by-role need to be re-evaluated. The code already does this on each fetch (steps assigned to `approver_role` look up the *current* role of `approver_user_id`) so it self-heals. |
| **Their next page load** | Their menu updates immediately; if they had a pending tab open from a module they no longer have access to, that page returns 404 on next click. |
| **Active session** | Their session stays valid (we don't force-logout), but their permissions are re-checked on every action. This is fine for normal demotions; for **security demotions** (e.g. suspected compromise) a sign-out can be triggered separately. |

### 15.4 The Managing-Director-uniqueness rule

The existing `createStaffMemberAction` enforces "only one active Managing
Director." The change-role action must enforce the same: if you try to change
someone's role *to* `managing_director` while another active MD exists, the
action errors with the same message: *"Only one active Managing Director
account is allowed."*

### 15.5 The Staff page UI

The Staff page (`/ops/staff`) gains two new inline actions per row, visible
only to allowed roles:

- **Change role** — opens a small dropdown of allowed target roles for your
  actor role. Submit triggers `changeStaffRoleAction` with a confirmation
  modal showing the old → new transition.
- **Send password reset** — a button that calls the existing reset endpoint
  for that user's email.

The Deactivate / Reactivate actions are mutually exclusive: deactivated rows
get a Reactivate button, active rows keep the existing Deactivate button.

### 15.6 Updated RBAC row (slots into Part 4)

Add this row to the master RBAC matrix:

| Record | Create | Edit details | Deactivate | Reactivate | Change role | Hard delete |
| --- | --- | --- | --- | --- | --- | --- |
| **Staff account** | Dev, MD, GM, HR (per hierarchy) | Dev, MD, GM, HR (per hierarchy) | Dev, MD, GM, HR (per hierarchy) | Dev, MD, GM, HR (per hierarchy) | **Dev, MD, HR** (per hierarchy; cannot change own role) | Dev only (and only after deactivation) |

### 15.7 Implementation (Phase R — 1 day)

| # | Item |
| --- | --- |
| R1 | New permission helpers `canChangeStaffRole(actor, target, newRole)`, `canReactivateStaff(actor, target)`, `canResetStaffPassword(actor, target)` — all wrapping the existing hierarchy rules from `canCreateStaffRole`. |
| R2 | New server actions `changeStaffRoleAction`, `reactivateStaffMemberAction`, `editStaffDetailsAction`, `sendStaffPasswordResetAction`. All audit-logged + notify the target + (where appropriate) leadership oversight. |
| R3 | Staff page UI: per-row "Manage" panel with the four new actions. Change-role uses a confirmation modal showing old → new + the audit reason field. |
| R4 | Guard: `changeStaffRoleAction` refuses if `actor.id === target.id` (cannot change your own role). Refuses if the change would create a second active MD. |

This phase is small and self-contained — no schema changes, no migrations.
Pure code work. Can ship in parallel with any other phase.

---

## Part 16 — Updated open questions for you (final)

Adding one more to the previous nine:

10. **Should HR be able to change a staff member's email address?** Today
    nobody can — and I'd recommend keeping it that way. Email is the login
    identifier and a security boundary. Changing it should require a re-invite
    flow (deactivate the old account + create a new one with the right email),
    or a Developer-only override. Confirm you agree, or tell me otherwise.

The full implementation plan with all phases:

| Phase | Scope | Duration |
| --- | --- | --- |
| Step 0 | Bootstrap missing org roles | — |
| H | Department separation + feedback loops + MR pricing flow | 3 days |
| I | BOQ + Material Request edit/delete | 2 days |
| J | Edit/delete for the rest (Invoice, Payroll, Worker, etc.) | 3 days |
| K | HSE completeness (weekly report, routing) | 2 days |
| L | Site team scoping (optional for first launch) | 3 days |
| M | Notification coverage from earlier roadmap | 2 days |
| N | Plain English (Glossary + UI labels) | 1 day |
| O | Role-scoped Workspace Timeline + module_key backfill | 2 days |
| P | Multi-audience notification fanout (Part 12) | 1.5 days |
| Q | @mentions + My Conversations inbox | 2 days |
| **R** | **Staff role-change + reactivate + reset password (Part 15)** | **1 day** |

**~22 working days total.** Each phase ships independently; no big bang.

---

## Part 16 — Per-item Supplier Model (replaces external RFQ invitations)

Status: implemented (Sprint 3/4, 2026-06-17 onward).

### Why this changed

Pymble's procurement reality (see the procurement requisition form image in
the source repo) is that **each line item can come from a different supplier**.
The previous "RFQ → invite N suppliers → wait for quotes → award one →
single-supplier PO" flow doesn't match: it forces one supplier per RFQ, and
the invite step assumes we want to send a request to an external party
(which we don't — quotes are collected by phone/WhatsApp/email outside the
system).

### New data model

| Table | New columns |
|-------|-------------|
| `material_request_items` | `supplier_id` (FK → suppliers, nullable), `supplier_name_freeform` (text, nullable) |
| `boq_line_items` | `supplier_name_freeform` (text, nullable). `supplier_id` already existed. |
| `rfq_items` | `supplier_id` (FK → suppliers, nullable), `supplier_name_freeform` (text, nullable) |
| `purchase_order_items` | `supplier_id` (FK → suppliers, nullable), `supplier_name_freeform` (text, nullable). PO header still has its own `supplier_id` (NOT NULL). |

Each line nominates **its own supplier** — either by reference (master-list
`supplier_id`) or by typed free-text name. Lines from the same supplier are
later bundled when converting RFQ → PO.

### New RFQ workflow (no invitations)

```
BOQ / Material Request line
   │  (supplier nominated per line — picker UI: master list + free text)
   ▼
[Create RFQ]  — pulls lines from approved MR
   │
   ▼
[Convert RFQ to Purchase Orders]
   │  Groups lines by their nominated supplier
   ▼
N draft Purchase Orders  (one per supplier)
   │  Each PO continues through the existing approval chain
   ▼
Issued POs
```

Legacy actions (`inviteSupplierToRfqAction`, `recordSupplierQuoteAction`,
`awardSupplierQuoteAction`) are still callable but no longer surfaced in the
default UI. They remain for backwards compatibility on any in-flight RFQs;
new RFQs should use the convert-to-PO path.

### Convert constraint

PO header still requires a `supplier_id`. So lines that nominate **only a
free-text** supplier (i.e. the supplier isn't on the master list yet) must
have that supplier added first. The convert action errors with a list of the
typed names that need to be promoted. This is intentional — once you commit
to a PO, the supplier becomes a real counterparty that needs banking, KYC,
performance scoring, etc., so it should join the master list.

### File-based BOQ upload

`importBoqLineItemsCsvAction` accepts:
- `.csv` (existing)
- `.xlsx`, `.xls` — parsed with SheetJS; auto-skips title/blank rows so
  form-style sheets (Item No, Quantity, Unit of Measure, Description, Unit
  Price (K), Total (K), Supplier Name) work directly
- `.pdf` — best-effort text extraction via pdfjs-dist; PDFs exported from
  the spreadsheet with header rows intact work; scanned PDFs do not (no OCR).

The "Supplier" column accepts either a `supplier_code` or the human name —
matched case-insensitively against the active master list, with fallback to
`supplier_name_freeform` when no match is found.

### Submission idempotency

The workspace layout mounts `<OpsFormSubmitGuard />` which intercepts every
form `submit` event globally, disables submit-style buttons inside the form,
and auto-restores them after 8 s as a safety net. This complements
`OpsSubmitButton` / `OpsConfirmSubmitButton` (which use `useFormStatus` per
button) — defense in depth so a fast double-click can't fire the same action
twice.
