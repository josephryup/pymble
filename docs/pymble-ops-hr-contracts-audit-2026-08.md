# HR Contracts — audit and implementation plan

**Date:** 2026-08-25
**Scope:** moving Contracts from Operations to HR; kind-aware contract forms; remuneration on the contract; Operations Manager access; linking contracts to individual employees.
**Status:** COMPLETE — Phases 0–5 plus F7 shipped 2026-08-25, and the 2026 ZRA/NAPSA rates loaded. **All six migrations applied and verified** against `zuezxgyhhrhklrhqsvvs`. 1,302 tests pass.

---

## Summary

Four of the five asks are the same defect wearing different clothes. The contracts
engine (`public.contracts`, Phase 12) was built subcontract-first and then had an
`employment` kind bolted on as an enum value. It got the enum, the RLS split and
the template — but it never got its own fields, its own form, its own route, or
its own idea of what a contract with a person contains. So today an employment
contract is a works order with a different clause list.

There is also a real, currently-exploitable **privacy leak** (F2) that has nothing
to do with the requested features and should be closed before any of them.

And there are **two contract systems**, both live, neither aware of the other
(F1). That is the thing that decides how "link contracts to each employee" gets
built, so it is the first finding.

---

## Findings

### F1 — Two contract systems, both live, neither aware of the other

| | `employee_contracts` | `contracts` (kind = `employment`) |
|---|---|---|
| Since | Phase 5 (2026-06-04) | Phase 12 (2026-08-18) |
| Lives at | `/ops/employees` | `/ops/contracts` |
| Holds | `basic_pay`, `housing_allowance`, `other_allowances`, `leave_rate_per_month`, `pay_frequency`, `salary_amount`, `probation_end_date` | templates, clauses, signatures, revisions, PDF/DOCX, audit trail |
| Pay figures | **yes** | **none at all** |
| Signature workflow | none | full (HR → GM → MD, hash-verified) |
| Read by | staff payslip PDF, `staff-payroll-actions.ts`, leave-accrual cron | the contract register only |

Consumers of `employee_contracts` that would break if it were replaced:

- [staff-payslip route](src/app/api/ops/pdf/staff-payslip/[itemId]/route.ts:196)
- [staff-payroll-actions.ts:156](src/lib/ops/staff-payroll-actions.ts:156) — `basic_pay, housing_allowance, other_allowances`
- [leave-accrual cron](src/app/api/ops/cron/leave-accrual/route.ts:61) — `leave_rate_per_month`
- [hr-actions.ts](src/lib/ops/hr-actions.ts:517) and three more mutation paths

So `employee_contracts` is the **payroll spine**. It is not a duplicate to be
deleted; it is the record payroll runs off.

The sharpest illustration of the split: the seeded employment template's
Remuneration clause reads *"the basic salary and allowances set out in the
schedule to this contract"* — and there is no schedule. Nothing in
`contracts` can hold one. The document a person signs currently contains no pay
figures whatsoever.

---

### F2 — `kind` and `counterparty_type` are independent, and every privacy gate reads only `kind` — SECURITY

Every visibility gate in the module branches on `kind`:

- [`canViewOpsContractKind`](src/lib/ops/contract-permissions.ts:112)
- `contracts_select_ops` RLS policy — `kind <> 'employment' or private.can_access_hr_maturity()`
- `private.can_read_contract(uuid)` — same test, for the six child tables
- [contract PDF route](src/app/api/ops/pdf/contract/[id]/route.ts:39)

`counterparty_type` / `employee_id` is **never** checked against `kind`. Not in
the zod schema ([contract-actions.ts:127](src/lib/ops/contract-actions.ts:127)),
not in the action body, not in a DB constraint. The only DB constraint,
`contracts_counterparty_exactly_one`, ties `counterparty_type` to *which id
column is populated* — it says nothing about `kind`.

**The exploit.** On the create form the three selects — Template, Kind,
Counterparty type — are independent controls:

```
template_id      = <subcontract works order>
kind             = subcontract     ← passes template.kind check
counterparty_type= employee
employee_id      = <any staff member>
```

Every check passes. The row is valid. Then on approval,
[`buildCounterpartySnapshot`](src/lib/ops/contract-actions.ts:1120) writes that
employee's `full_name`, `phone` and `email` into `counterparty_snapshot` — and
because `kind = 'subcontract'`, the entire row is readable by the full
`VIEWER_ROLES` set: quantity surveyor, procurement manager, procurement,
finance manager, accountant, projects manager, operations manager. None of them
pass `can_access_hr_maturity()`. The RLS policy will not stop it either, because
the policy tests the same column.

The reverse — `kind = 'employment'` against a subcontractor — is not a leak but
is a mess: a works order visible only to HR, invisible on the commercial register.

**Second, smaller hole on the same path.** `createOpsContractDraftAction` checks
`canDraftOpsContractKind(role, input.kind)` but never checks anything before
accepting an `employee_id`. The employee `<select>` is hidden from a QS in the
UI ([contracts/page.tsx:305](src/app/ops/(workspace)/contracts/page.tsx:305)),
but a Server Action accepts whatever `FormData` is posted to it. The gate on
that field is presentational only.

---

### F3 — The contract detail page has zero kind branching

`grep -c 'kind === "employment"'` over the 1,690-line detail page: **0**.

An employment contract therefore renders, and `updateOpsContractTermsAction`
accepts, all of:

Retention %, Penalty % per week, Penalty cap %, Defects liability (months),
Warranty (months), Variation threshold %, Minimum workers, VAT applicable /
VAT %, Scope of works (numbered list), priced lines with cost codes, payment
milestones with certify + retention release, and *"Works completed … retention
releases"*.

The register list has the same problem in miniature: a **Value** column that for
an employment contract shows `ZMW 0.00`, and headline tiles for *Active value*
and *Retention held* that an employment contract can only pollute.

Conversely there is nowhere to put what an employment contract actually needs:
no job title, no probation period, no notice period, no leave entitlement, no
hours of work, no place of work. Those clauses exist in the template and refer
to values the record cannot hold.

---

### F4 — No remuneration on the contract, and the statutory toggle is in the wrong module

`public.contracts` has no pay column of any kind.

The arithmetic already exists and is good:
[`computeStaffPayslip`](src/lib/ops/statutory/calculator.ts:178) returns basic,
housing, other allowances, gross, PAYE, NAPSA employee/employer, NHIMA
employee/employer, WCF, total deductions and **net** — and it already takes
`statutoryContributionsEnabled`, with a well-argued comment about contractors
who invoice gross.

But that flag is `employees.statutory_contributions_enabled`, it is edited on
`/ops/staff-payroll` ([staff-payroll/page.tsx:196](src/app/ops/(workspace)/staff-payroll/page.tsx:196)),
and it is a *payroll* setting on the *person*. It is agreed at contract time and
it belongs on the contract. Right now the person who drafts the contract and the
person who sets the tax basis are looking at two different screens, and nothing
ties the two decisions together.

---

### F5 — Contracts sits in the `operations` module group, so IT can widen it

[constants.ts:1055](src/lib/ops/constants.ts:1055) — `group: "operations"`.

`SENSITIVE_MODULE_GROUPS` is `{finance, hr, executive, commercial}`
([module-access-core.ts:52](src/lib/ops/module-access-core.ts:52)). `operations`
is not in it. So `isSensitiveOpsModule(contracts)` is **false**, and an IT
Manager can tick any role into the Contracts module at `/ops/it/module-access`
without the MD.

That control exists precisely to stop IT reaching pay data by the side door. A
module containing employment contracts is behind the wrong side of it. Moving
the group to `hr` closes this on its own, with no new code.

---

### F6 — The Operations Manager has none of it, and cannot be given it cheaply

`operations_manager` today:

| List | In it? |
|---|---|
| `private.can_access_contracts()` | ✅ yes — sees subcontracts |
| `OPS_OPERATIONAL_ROLES` (contracts module `roles`) | ✅ yes |
| `EMPLOYMENT_VIEWER_ROLES` | ❌ no |
| `OPS_HR_ROLES` (employees module) | ❌ no |
| `HR_VIEW_ROLES` (`canViewOpsHr`) | ❌ no |
| `private.can_access_hr_maturity()` | ❌ no |

The trap: **every** fetcher in `hr.ts` gates on the single function
`canViewOpsHr` — seven call sites (lines 884, 986, 1012, 1034, 1120, 1186, 1365).
Adding `operations_manager` to `HR_VIEW_ROLES` is one line and grants the whole
HR module in one move: performance appraisals, employee documents, leave
balances, HR document categories, salary figures, recruitment. There is no
narrower "employee directory" concept in the codebase today.

So this ask needs a new gate, not an addition to an existing list.

---

### F7 — Contracts are not wired into notifications or the activity feed — FIXED 2026-08-25

`record-activity.ts` had no `contracts` source table and `inbox-routes.ts` had no
contracts entry. An employment contract sitting on someone's signature raised no
inbox item and appeared in no activity feed — which is why nobody chased an
unsigned contract.

**What shipped.** Approval fired a one-time notification and nothing followed it,
so the fix is two chases rather than one more ping:

- **A standing My Queue entry** — "Employment contracts / Subcontracts awaiting
  your signature", one per register, linking to the right one. Counts a slot
  assigned to you **by name** as well as one you fill **by office**, counts
  contracts rather than slots (three pending slots on one contract is one thing
  to go and do), and only counts a contract actually open for signature. It
  applies the subject gate too — every signatory role can see pay today, so that
  changes nothing now, but a queue reading a table directly is exactly where a
  future widening would leak silently.
- **A single nudge from the daily sweep** after 7 days, aimed at the people
  holding the pending slots — by name where a slot names someone, by office
  otherwise — rather than broadcast at a department. Stamped in
  `signature_reminder_notified_at` so it sends once, keyed on the contract and
  never on the date (a dated key regenerates daily and re-notifies — that is how
  88% of notifications became duplicates once before).
- `opsContractSignatoryRoles()` exported to read the signature matrix the other
  way round, returning a copy so a caller cannot edit it.
- `contracts` added to the inbox route and label maps, so a contract
  notification links somewhere real.

> ⚠️ **Deliberately NOT done: comments and attachments on contracts.** Adding
> `contracts` to `OPS_RECORD_ACTIVITY_SOURCE_TABLES` would have closed the
> literal wording of this finding, but the gate in
> `record-activity-actions.ts` is `canManageOps(role)` — a broad role check with
> **no per-record test**. Registering contracts there would give every "manage"
> role a path to attach to an employment contract, which is the opposite of
> everything else in this workstream. Closing that half properly means giving
> the record-activity module a per-record gate; that is its own piece of work,
> in its own module, and is now the open item behind this finding.

**Verified:** the sweep's queries were exercised read-only against production —
one live subcontract, approved 18 August, with three unassigned pending slots
(hr, general_manager, managing_director) — without sending anything or stamping
anything. The sweep will nudge on it when the cron next runs.

---

## Decisions this drives

### D1 — Link, don't replace

`employee_contracts` stays the pay record; `contracts` stays the document.
Add `contracts.employee_contract_id` and generate the document *from* the pay
record.

**Why not merge them:** replacing `employee_contracts` means editing payroll
runs, the payslip PDF and the leave-accrual cron. That is the highest
blast-radius module in the system, and the RPC-execute incident of 2026-08-17
is a standing reminder of what a quiet mismatch in that area costs. One
direction of truth, no payroll change: pay lives in `employee_contracts`, the
signed instrument lives in `contracts`, and the instrument carries a **frozen
snapshot** of the figures as at issue — exactly the pattern
`counterparty_snapshot` already establishes, and for exactly the same reason: a
pay review next year must not rewrite a contract signed this year.

### D2 — Two routes, one engine — and that is also the fix for F2

Rather than a Kind dropdown that anybody can mismatch:

- `/ops/hr/contracts` — group `hr`, **locked** to `kind='employment'` + `counterparty_type='employee'`
- `/ops/contracts` — group `operations`, **locked** to `kind='subcontract'` + `counterparty_type='subcontractor'`

The kind is decided by the route, not by a select. Both render from the same
`contracts` table through the same lifecycle and signature code. The Kind and
Counterparty-type dropdowns disappear entirely, which is precisely the "when
employee is selected it should not show anything relating to subcontractor" ask
— structurally, rather than by hiding fields.

Note this deliberately does **not** move the subcontract register into HR.
Works orders are commercial; burying them under HR would put them behind
`OPS_HR_ROLES`, where the QS and procurement cannot reach them.

### D3 — OM scope — DECIDED 2026-08-25: full HR view

The Operations Manager gets the **full HR view**, salaries included, plus the
ability to approve leave requests, perform HR admin, and create employee
contracts. Lists to add `operations_manager` to in Phase 3:

- `OPS_HR_ROLES` (constants.ts) — nav and module access
- `HR_VIEW_ROLES` — every `hr.ts` fetcher
- `HR_MANAGE_ROLES` — create/update employees, employee contracts, appraisals
- `LEAVE_DECISION_ROLES` — approve and reject leave
- `PERSONAL_CONTRACT_VIEWER_ROLES` (contract-permissions.ts) — employment contracts
- `ISSUE_ROLES` if the OM is to issue contracts as well as draft them
- `private.can_access_hr_maturity()` — the SQL side, or RLS refuses the tables

**One carve-out to keep.** Do **not** add `operations_manager` to
`EMPLOYEE_ACCOUNT_LINK_ROLES` in hr-permissions.ts. That list is deliberately
narrower than `HR_MANAGE_ROLES` — it already excludes the General Manager and
the generic `manager` role — because `employees.user_id` is the only bridge
between "the person we employ" and "the account that signs in", and the payslip
self-service gate reads it directly. Mis-linking two employees exposes one
person's pay to another. Keep it to HR, MD, Owner and developer.

---

## Implementation plan

### Phase 0 — Close the leak — SHIPPED 2026-08-25

1. Check for existing bad rows:
   `select count(*) from contracts where (kind='employment') <> (counterparty_type='employee');`
   The table is a week old, so this is almost certainly 0.
2. Migration — add the missing constraint:
   `check ((kind = 'employment') = (counterparty_type = 'employee'))`
   (add `not valid` + `validate constraint` if step 1 returns rows).
3. Widen both DB gates from `kind` to *kind or counterparty*, so a mismatched
   row is caught even if the constraint is ever dropped:
   `(kind <> 'employment' and counterparty_type <> 'employee') or private.can_access_hr_maturity()`
   — in `contracts_select_ops` and `private.can_read_contract`.
4. Replace `canViewOpsContractKind(role, kind)` with
   `canViewOpsContract(role, { kind, counterparty_type })` and update all four
   call sites. Same change to `canDraftOpsContractKind`.
5. In `createOpsContractDraftAction`: zod `.refine` for the pairing, plus require
   `canDraftOpsContractKind(role, 'employment')` before accepting any
   `employee_id` — closing the posted-FormData path.
6. Test: a QS posting `counterparty_type=employee` is refused; a mismatched row
   is invisible to `accountant`.

**What actually shipped:**

- `supabase/migrations/20260825090000_pymble_ops_contract_subject_gate.sql` —
  widens `can_read_contract()` and `contracts_select_ops` to test both columns,
  then adds `contracts_kind_matches_counterparty`. Gates go first so an abort on
  unexpected data still leaves the leak closed; a `do $$` block raises with a
  row count rather than failing on an opaque constraint error.
  **⚠ NOT YET APPLIED — the Supabase MCP is not permitted in this session.**
- `OpsContractSubject`, `isOpsPersonalContract`, `isOpsContractSubjectConsistent`
  in contract-types.ts.
- `EMPLOYMENT_VIEWER_ROLES` → `PERSONAL_CONTRACT_VIEWER_ROLES`;
  `canViewOpsContractKind` → `canViewOpsContractSubject`;
  `canDraftOpsContractKind` → `canDraftOpsContractSubject`; new
  `canViewOpsPersonalContracts` for list-level filtering. The old names are gone
  entirely, so a new call site cannot reintroduce the narrow test by copying a
  neighbouring line — a test asserts their absence across all five files.
- Register query now filters `.neq("kind", "employment").neq("counterparty_type", "employee")`.
- `createOpsContractDraftAction` **derives** `counterparty_type` from `kind`
  rather than reading it from the request, refuses a posted value that
  disagrees, and refuses a stray `employee_id` or `subcontractor_id` loudly
  instead of nulling it out — a rejected attempt leaves an error a reviewer can
  see. The Counterparty-type `<select>` is gone from the form.
- `tests/ops-contract-subject-gate.test.ts` — 20 tests. Full suite: 1190 pass, 0 fail.

### Phase 1 — Remuneration on the contract — SHIPPED 2026-08-25

**Migration** — on `public.contracts`:

| Column | Type | Note |
|---|---|---|
| `employee_contract_id` | `uuid → employee_contracts(id) on delete restrict` | nullable; `check (employee_contract_id is null or kind='employment')` |
| `statutory_contributions_apply` | `boolean` nullable | defaults from the employee, overridable per contract |
| `remuneration_snapshot` | `jsonb not null default '{}'` | frozen at issue |
| `job_title`, `probation_months`, `notice_period_days`, `annual_leave_days`, `hours_per_week`, `place_of_work` | | employment terms with nowhere to live today |

**New `src/lib/ops/contract-remuneration.ts`** — reads the linked
`employee_contracts` row, calls the existing `computeStaffPayslip`, returns a
display shape. The remuneration panel shows:

> Basic pay · Housing allowance · Other allowances · **Gross pay** ·
> *Statutory contributions: apply / do not apply* · PAYE · NAPSA (employee /
> employer) · NHIMA (employee / employer) · **Net pay** · rates citation

Frozen into `remuneration_snapshot` at issue, and read from the snapshot
thereafter.

**Merge tokens** — add `basic_pay`, `housing_allowance`, `gross_pay`, `net_pay`,
`statutory_basis` to `OPS_CONTRACT_MERGE_TOKENS`, then publish employment
template **v2** with a real remuneration schedule, so the existing clause's
"schedule to this contract" stops being a dangling reference.

> ⚠️ The employment template is still flagged `requires_legal_review` and has
> never been reviewed by counsel (design doc §9.1). A v2 that adds a pay
> schedule needs that review before it can be approved or signed. Adding the
> schedule does not clear the flag.

**What actually shipped:**

- `20260825091000_pymble_ops_contract_remuneration.sql` — `employee_contract_id`
  (FK `on delete restrict`), `statutory_contributions_apply`,
  `remuneration_snapshot`, and the six employment-terms columns. Four CHECKs
  bound them to the Employment Code (probation ≤ 12 months, hours ≤ 168), one
  ties a pay record to the employment kind, and
  `contracts_employment_approved_has_remuneration` stops an employment contract
  reaching approval with an empty schedule.
- `20260825092000_pymble_ops_employment_template_v2.sql` — template **v2** as a
  new row, v1 deactivated not deleted. The Remuneration clause now names real
  figures and there is a `schedule_remuneration` clause. `requires_legal_review`
  stays **true** — a pay schedule does not make the wording vetted.
- `src/lib/ops/employee-pay.ts` — the pay-structure reader, now shared. The
  private `sumOtherAllowances` in `staff-payroll-actions.ts` is **deleted** and
  points here, so a contract cannot promise one gross while the payslip pays
  another. A test asserts the private copy has not come back.
- `src/lib/ops/contract-remuneration.ts` — live from the pay record while a
  draft, frozen from `remuneration_snapshot` once approved. Every figure comes
  from `computeStaffPayslip`, the same function payroll uses.
- `remuneration_snapshot` is **not** in `CONTRACT_SELECT`: a column never
  selected on the list path is one no list read can leak. The detail fetch reads
  it separately, by id, *after* `canViewOpsContractSubject`. A test asserts the
  ordering.
- Pay figures are now part of `toOpsContractSignableContent`, so the document
  hash covers the schedule — a signature over a hash that omitted the salary
  would verify nothing anyone cared about. `frozen`/`computed_at` are excluded:
  they describe the read, not the agreement.
- Remuneration panel on the contract page, plus the schedule on the PDF and the
  DOCX (same figures, same order — the two are one instrument in two wrappers).
- `updateOpsContractRemunerationAction` refuses a pay record belonging to a
  different employee, or one that is superseded/terminated. Audit metadata
  records the link and the basis, never the figures.

### Phase 2 — Kind-aware forms — SHIPPED 2026-08-25

Add a `CONTRACT_KIND_SECTIONS` registry to `contract-types.ts` — one table
declaring which sections each kind owns — rather than scattering
`kind === "employment"` ternaries through 1,690 lines. Same shape as the
existing `OPS_CONTRACT_STATUS_LABELS`, and the same reason: a reviewer can read
the rule in one place.

| Section | subcontract | employment |
|---|:--:|:--:|
| VAT, retention, penalties, defects liability, warranty, variation threshold, minimum workers | ✅ | ❌ |
| Scope of works, priced lines, cost codes, milestones, certification, retention release | ✅ | ❌ |
| Job title, probation, notice period, hours, place of work, leave entitlement | ❌ | ✅ |
| Remuneration schedule (basic / gross / statutory / net) | ❌ | ✅ |
| Programme dates, clauses, signatures, revisions, addenda | ✅ | ✅ |

Guard the **write** side too — `updateOpsContractTermsAction` must *reject*
subcontract fields on an employment contract, not merely stop rendering them.
Register list columns become kind-aware (Value → Monthly gross for employment).

**What actually shipped:**

- `OPS_CONTRACT_KIND_SECTIONS` + `OPS_CONTRACT_SECTION_FIELDS` in
  `contract-types.ts`. Ten sections, each with its field list; a test asserts
  every field maps to exactly one section and every section a kind can own has a
  field list.
- The detail page reads seven `showX` flags from the registry. Scope of works,
  priced lines and milestones no longer render on an employment contract; the
  commercial-terms block, the works-order header and the minimum-workers field
  are gated; six employment-terms inputs added.
- `assertOpsContractSectionAllowed` refuses any **posted** field the kind does
  not own, and the update object is built section by section from the same
  table. Hiding an input is presentation; this is the gate.
- `work_order_number`/`work_order_date` moved from `programme` to
  `commercial_terms` — an employment contract is not raised against a works
  order.
- Register: Value shows "—" for employment rather than `ZMW 0.00`; the
  active-value tile counts live *subcontracts* and names employment contracts
  separately, since they were inflating a count under a money figure.
- Fixed a pre-existing bug found on the way: the detail page's success banner
  read `params.created` while every redirect sets `?updated=`, so it had never
  fired. Now reads `updated` against a message map.

### Phase 3 — Move to HR, and OM access — SHIPPED 2026-08-25

- Split the single `contracts` module entry in `constants.ts` into two:
  `contracts` (`group: "operations"`, HR roles removed) and `hr-contracts`
  (`href: "/ops/hr/contracts"`, `group: "hr"`).
- Because `hr` is a `SENSITIVE_MODULE_GROUP`, IT can no longer widen the
  employment register — only the MD can. **This is the security win of the
  move**, and it comes free.
- New routes `/ops/hr/contracts` and `/ops/hr/contracts/[contractId]`, kind-locked.
- `/ops/contracts/[id]` redirects to the HR route when the contract is
  employment kind, so audit-log deep links and existing bookmarks don't 404.
- OM access per D3.

**What actually shipped:**

- `20260825093000_pymble_ops_hr_operations_manager.sql` — `operations_manager`
  added to `private.can_access_hr_maturity()`, the fourth of four lists that
  must agree (the other three are `OPS_HR_ROLES`, `HR_VIEW_ROLES`/
  `HR_MANAGE_ROLES`/`LEAVE_DECISION_ROLES`, and
  `PERSONAL_CONTRACT_VIEWER_ROLES`). Without it the OM would reach a register
  the RLS policy on `contracts` refuses, since that policy calls this function.
- `EMPLOYEE_ACCOUNT_LINK_ROLES` deliberately untouched, with a comment saying
  so and a test asserting it. A test also pins that the list is genuinely
  narrower — GM and `manager` are excluded too, not just the OM.
- Module registry split in two: `contracts` (group `operations`, HR roles
  removed, retitled **Subcontracts**) and `hr-contracts` (`/ops/hr/contracts`,
  group **`hr`**). A test asserts `isSensitiveOpsModule` is now true for the
  employment module — IT can no longer widen it — and that the QS and
  procurement keep the subcontract register.
- Page bodies moved to `src/components/ops/OpsContractRegisterPage.tsx` and
  `OpsContractDetailPage.tsx`, both taking `kind`. Four thin route files fix it.
- **The Kind and Counterparty-type dropdowns are gone entirely.** The kind is a
  hidden field set by the route, and the register offers only the counterparty
  its route can have. The mismatched pair from F2 is now unconstructible from
  the UI as well as refused by the action and the database.
- `opsContractHref(kind, id)` replaces the hardcoded `ROUTE`. Every success
  redirect, the addendum redirect and the lifecycle notification hrefs are
  kind-aware; `revalidateContract` refreshes both registers rather than
  guessing. `contractError` takes the contract where one is in hand.
- A contract reaching the wrong route is **forwarded, not 404'd**, carrying its
  query string — so audit-log deep links, bookmarks and the error redirects
  from actions that fail before the row loads all still arrive.
- Register columns per route: the employment list drops Kind and Value (every
  row is the same kind; value is a subcontract concept) and shows Place of work
  and Starts instead.

**Verified against the live database:**

| Check | Result |
|---|---|
| All 4 migrations applied | ✅ 7 constraints validated |
| Mismatched `kind`/`counterparty_type` insert | ✅ blocked, no row left behind |
| Pay record on a subcontract | ✅ blocked |
| Approving an employment contract with no schedule | ✅ blocked, draft untouched |
| `can_access_hr_maturity()` includes the OM | ✅ |
| Employment template v1 / v2 | ✅ v1 inactive, v2 active, 12 clauses |
| `npm run build` | ✅ all four routes emitted |
| Test suite | ✅ 1256 pass, 0 fail |

> ⚠️ **Caught during apply.** `contract_templates` carries a partial unique
> index `(template_code) WHERE is_active`, so v2 could not be inserted before
> v1 was deactivated — the migration now does them in that order. And
> `requires_legal_review` **defaults to false**, so the v2 insert inherited
> "already reviewed" by omission; it is now set explicitly to `true`. Both are
> fixed in the migration file as well as in the database.

### Phase 4 — Link to the individual employee, both directions — SHIPPED 2026-08-25

- On the employee record (`/ops/employees`): a **Contracts** section listing the
  linked `contracts` rows — number, title, status, signature state, PDF link —
  alongside the existing `employee_contracts` pay records. The
  `contracts_employee_idx` index already exists, so the query is cheap.
- On the contract: which `employee_contracts` row it was priced from, and a link
  back.
- The PDF link is gated on the same pay-visibility rule, not on page access.

**What actually shipped:**

- `fetchOpsEmployeeContractDocuments` in contracts.ts — gates on
  `canViewOpsPersonalContracts` and returns an **empty map**, not an error, for
  a role that cannot see pay. The Admin/Receptionist reaches the employee page
  legitimately for the directory and the leave diary; an empty list is the
  honest answer for them and leaves nothing to probe.
- The employee record now has **two** panels, deliberately distinct: **Pay
  records** (`employee_contracts`, what payroll pays against) and **Signed
  contracts** (`contracts`, the instruments drawn from them). Collapsing them
  into one list is how the two systems came to be mistaken for each other.
- The signed-contracts panel carries **no pay figure and no signatory name** —
  only status and "N of M signed". Tests assert both, by field read rather than
  by keyword, and that no currency is formatted there at all.
- The fetcher selects neither `remuneration_snapshot` nor
  `employee_contract_id`, so the employee page cannot leak pay through a column
  it never asked for.
- The contract's remuneration panel links back to the employee record.

### Phase 5 — Tests and integrity checks — SHIPPED 2026-08-25

- `canViewOpsContract` agrees with `can_access_contracts()` /
  `can_read_contract()` — the standing "RLS drifts wider than code" finding
  applies here and the module's own comments already ask for this check.
- Integrity: 0 rows where `(kind='employment') <> (counterparty_type='employee')`.
- Integrity: 0 issued employment contracts with an empty `remuneration_snapshot`.
- A QS posting `employee_id` to the draft action is refused.
- An `accountant` cannot read an employment contract by id, by PDF route, or by
  DOCX route.

**What actually shipped:**

- `tests/ops-contract-rls-parity.test.ts` — parses the role list out of each SQL
  helper and compares it to the TypeScript gate in front of it, for
  `can_access_contracts`, `can_access_personal_contracts` and
  `can_access_hr_maturity`. This is the standing "RLS drifts wider" finding,
  finally under test rather than under review.
- Three integrity checks added to the nightly `workflow-integrity` cron:
  `contract_kind_matches_counterparty`,
  `employment_contracts_carry_their_schedule` and
  `contract_pay_record_matches_employee` — all three **verified clean against
  production**, and their PostgREST filters exercised live rather than assumed.
- A test holds the integrity module to being read-only: no `insert`, `update`,
  `delete` or `upsert` in the checks. A watchdog that quietly repairs hides how
  often the thing it repairs breaks.

> 🔎 **The parity test found a real gap on its first run.** The RLS on
> `contracts` reused `private.can_access_hr_maturity()` for the personal-contract
> test, and that function admits `admin_receptionist` — who belongs in HR for the
> directory and the leave diary but has never been in
> `PERSONAL_CONTRACT_VIEWER_ROLES`. So the policy was **wider than the code by
> exactly one role**: the standing finding, reappearing inside the module whose
> own comments warn about it. Nothing was exposed in practice, because every app
> read goes through the service-role client and is gated in TypeScript — but the
> second line of defence was wider than the first.
>
> Migration `20260825094000_pymble_ops_personal_contract_gate.sql` gives the
> personal-contract test its own function, `can_access_personal_contracts()`,
> matching the TypeScript list exactly, and repoints both
> `contracts_select_ops` and `can_read_contract()` at it. Applied and verified.

---

## Security invariants to hold throughout

1. **One gate, five call sites.** `canViewOpsContract(role, contract)` must be
   the only visibility rule, used by the fetcher, the RLS policy, the PDF route,
   the DOCX route, and the employee page's contract list.
2. **Pay figures never leave the server for a role that cannot see pay.** Attach
   the remuneration shape to the contract object only *after* the gate — the same
   structural trick `contract-types.ts` already uses to keep `signature_r2_key`
   out of client-reachable types. Don't gate it in JSX.
3. **Snapshot frozen at issue.** A pay review must not rewrite a signed contract.
4. **Code gates are load-bearing, RLS is the second line.** Contracts use the
   service-role client throughout, so RLS is bypassed on every read the app
   performs. Every new fetcher needs its own explicit gate — RLS will not catch
   an omission.
5. **Module group `hr`,** so an IT Manager cannot widen access to employment
   contracts.

---

## The 2026 ZRA rates — loaded 2026-08-25

`ZAMBIAN_TAX_YEARS` stopped at 2025, so every payslip run this year fell back to
the 2025 bands with "rates for 2026 not yet confirmed" appended to the citation.
Correct behaviour, but not a state to leave a signed contract schedule in.

**PAYE bands for the 2026 charge year are UNCHANGED from 2025.** Confirmed
against PwC Worldwide Tax Summaries: 0–61,200 at 0%, 61,201–85,200 at 20%,
85,201–110,400 at 30%, above 110,400 at 37% — the same monthly figures already
in the table.

> ⚠️ Several public "Zambia PAYE calculator 2026" sites claim a **25%** second
> band, a **K9,900** third threshold and a **37.5%** top rate. They disagree with
> PwC and with each other. They were not used. Had they been trusted, every
> payslip would have over-withheld.

**The one thing that moved is the NAPSA ceiling.** The insurable-earnings cap
rose from K26,840 to **K37,236** a month from 1 January 2026 following a ZamStats
adjustment to National Average Earnings, so 5% of it is **K1,861.80** per side
(K3,723.60 total). That is a 38.7% jump — large enough to be worth confirming
with your accountant before the first live January run, though NAPSA's own notice
and the payroll vendors agree on it.

**Who this affects:** only people earning above K26,840 a month. Below that the
contribution is 5% of gross and the ceiling never binds — tests assert that
everyone under the old cap is penny-identical year on year.

Unchanged and deliberately left alone: NHIMA at 1%/1% (this codebase applies it
to **basic** pay rather than gross — a Pymble policy decision recorded when the
module was built), WCF construction 2% (industry-assessed per employer, not set
nationally), VAT 16%.

> 📌 **Not added, worth a decision:** the Skills Development Levy, 0.5%,
> employer-only. It is not an employee deduction and it is not a 2026 change, but
> it is a real employer cost that `employerTotalCost` does not currently include.

Sources: [PwC Worldwide Tax Summaries — Zambia](https://taxsummaries.pwc.com/zambia/individual/taxes-on-personal-income),
[Sage — NAPSA ceiling for 2026](https://communityhub.sage.com/za/sage-vip-payroll-hr/f/announcements/261227/zambia-national-pension-scheme-authority-napsa-ceiling-for-2026),
[ZRA](https://www.zra.org.zm/).

---

## Ordering

Phase 0 first and alone — it is a live leak and it depends on nothing.
Phases 1–2 next (they are the substance of the request).
Phase 3 after, since moving the route is cheapest once the forms already split.
Phases 4–5 last.

`npm run verify` (tsc + eslint + node:test) after each phase. Migrations do not
apply themselves in this project — each must be applied via the Supabase MCP
`apply_migration` against `zuezxgyhhrhklrhqsvvs` or the pages crash on the
missing column.
