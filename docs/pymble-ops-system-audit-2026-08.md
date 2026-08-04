# Pymble Operations — Full System Audit

**Date:** 2026-08-01
**Scope:** security, operations, robustness, effectiveness, functionality, UI/UX
**Method:** live database inspection (`zuezxgyhhrhklrhqsvvs`), Supabase security and
performance advisors, static analysis of 90,722 lines of ops code, 135 migrations,
437 server actions, 81 pages.
**Status:** audit only — no code or schema changed by this document.

---

## 0. The one thing to fix this week

> **Two-factor authentication is documented as enforced. It is enrolled for
> nobody.**
>
> `docs/two-factor-authentication.md` opens: *"Two-factor authentication (2FA)
> is enforced for leadership and finance accounts — the seats that can move
> money, change roles, or see the entire company's data."*
>
> Live database: `auth.mfa_factors` contains **0 rows**. **0 verified.** There
> are **5 privileged accounts** (MD, GM, Owner, Developer, HR) and 17 active
> users. Every one of them is protected by a password alone.
>
> This is the most serious finding in the audit, and it is not a code defect —
> the capability exists in Supabase and the runbook is written. Nobody enrolled.
> A documented control that does not exist is worse than no control, because it
> stops people asking the question.

Compounding it: **leaked-password protection is disabled** (Supabase advisor),
so a password already published in a breach corpus is accepted at signup and
reset. The two together mean a single credential-stuffing hit on one leadership
account yields the entire company's finances, payroll and staff records.

Both are configuration, not engineering. They can be done today.

---

## 1. Executive summary

This is a genuinely substantial system — 73 modules, 137 tables, 437 server
actions, 354 permission functions — built to a consistently high standard. The
code is unusually well-commented, the permission model is explicit, RLS is
enabled on every table, and the recent project↔finance spine work established
patterns (pure testable cores, idempotent writers, guard tests) that are better
than most commercial ERPs.

The findings below are therefore not "this is bad". They are the four things
that happen to a system built quickly and well: **security controls that were
designed but never switched on**, **atomicity that was never introduced**,
**surface area that outran adoption**, and **a rendering model that costs more
than it needs to**.

| # | Finding | Severity | Effort | Domain |
| --- | --- | --- | --- | --- |
| S1 | 2FA enrolled for nobody despite being documented as enforced | **Critical** | Hours | Security |
| S2 | Leaked-password protection disabled | **High** | Minutes | Security |
| R1 | No database transactions anywhere; 32 actions do 3+ writes non-atomically | **High** | Medium | Robustness |
| S3 | RLS is a backstop that is almost never exercised (814 service-client calls) | **High** | Architectural | Security |
| S4 | No rate limiting on 4 public forms | Medium | Low | Security |
| E1 | 56 of 137 tables empty; surface far exceeds adoption | Medium | Product decision | Effectiveness |
| R2 | 338 silent `.catch(() => null)` with no failure surface | Medium | Low–Med | Robustness |
| R3 | 2 error boundaries for 81 pages | Medium | Low | Robustness |
| P1 | 374 unindexed foreign keys | Medium | Low | Performance |
| U1 | 3,181-line pages; a11y coverage thin | Medium | Medium | UI/UX |
| S5 | `ops_next_invoice_number` SECURITY DEFINER callable by any signed-in user | Low | Minutes | Security |
| S6 | `otp_challenges` — RLS on, no policy, no code, 0 rows | Low | Minutes | Security |

---

## 2. Security

### What is genuinely good

Worth stating first, because it is unusual:

- **RLS enabled on 137 of 137 tables**, 159 policies across 136 tables. No table
  was forgotten. An event trigger (`rls_auto_enable`) enforces this on every new
  table, so coverage cannot silently regress.
- **Secrets hygiene is clean.** `.env` is git-ignored; the service-role key is
  referenced in **0** client components; no key material in the repo.
- **CSP is applied** at the proxy with a static, cache-stable policy.
- **Login is rate-limited.**
- **The local role-preview backdoor is correctly gated** — it requires
  `NODE_ENV !== "production"` **and** the absence of Vercel runtime markers
  **and** a localhost host. Three independent conditions, and the comment
  explains that the positive `NODE_ENV` check exists specifically so a
  self-hosted production build can never enable role impersonation. This is
  exactly right and I want to name it, because it is the kind of thing usually
  gated on one flag.
- **Payslip privacy is well-reasoned**: one email, one recipient, one
  attachment; shared mailboxes (`it@`, `procurement@`) deliberately skipped
  rather than delivered to.

### S1 — Two-factor authentication is not enrolled (Critical)

Covered in §0. Evidence: `auth.mfa_factors` = 0 rows, 0 verified; 5 privileged
accounts.

**Recommendation.** Enrol the five privileged accounts this week. Then decide
whether to *enforce* it — Supabase can require an AAL2 session, and the ops
middleware could refuse privileged routes below that. Enforcement without
enrolment locks people out, so enrol first, enforce second.

### S2 — Leaked-password protection disabled (High)

Supabase Auth can check new passwords against HaveIBeenPwned. It is off. With
2FA also absent, password quality is the *only* barrier on every account.

**Recommendation.** Turn it on in the Supabase dashboard. It is a toggle. This
was flagged in the June 2026 audit and is still open — worth noting, because a
finding that survives two audits usually means nobody owns it.

### S3 — RLS is a backstop that is almost never exercised (High, architectural)

| | |
| --- | --- |
| Files using the **service-role** client (bypasses RLS) | **147** |
| Service-client call sites | **814** |
| Files using the **session** client (respects RLS) | **21** |

Nearly every server-side read and write runs as the service role. That means the
159 RLS policies protect the browser's direct Supabase access (realtime
subscriptions) but do essentially nothing for the application's own data access.

**All authorisation therefore rests on 354 TypeScript permission functions**
being called correctly at 437 action entry points. There is no second line of
defence: a single missing `if (!canX(role))` is a full data exposure, and RLS
will not catch it because the query never passes through it.

This is a legitimate architecture — most Next.js apps do exactly this — and I am
**not** recommending a rewrite. But two things follow from it:

1. **The permission functions are load-bearing infrastructure**, not helpers.
   They deserve the same test rigour as the finance spine got. Today there are
   77 test files against 245 modules; permission coverage is partial.
2. **A missing check is invisible.** Consider a lint rule or a guard test in the
   style of `tests/ops-notification-keys.test.ts` — which already proves this
   codebase can enforce a convention at the source level — asserting that every
   exported `*Action` calls `requireOpsUser()` and at least one `can*` function
   before its first write.

That second item is the highest-leverage security investment available, because
it converts a class of vulnerability from "hope nobody forgets" into "CI fails".

### S4 — Public forms have no rate limiting (Medium)

| Route | Rate limited |
| --- | --- |
| `/api/careers/apply` | **No** |
| `/api/contact` | **No** |
| `/api/newsletter` | **No** |
| `/api/quote` | **No** |
| `/api/ops/auth/reset-password` | **No** |
| `/api/ops/auth/login` | Yes |

`careers/apply` accepts **file uploads** to R2 with no throttle — that is a
storage-cost and abuse vector, not just spam. `reset-password` with no limit
permits email-bombing a known address.

**Recommendation.** The `rate-limit.ts` helper already exists and is wired into
login. Extend it to these five. Low effort, contained.

### S5 — `ops_next_invoice_number` is SECURITY DEFINER and publicly callable (Low)

Any signed-in user can call it via `/rest/v1/rpc/`. The practical impact is
minor — burning invoice sequence numbers — but a `SECURITY DEFINER` function
reachable by `authenticated` is a pattern worth closing before it is copied.

**Recommendation.** `REVOKE EXECUTE ... FROM authenticated`. The server calls it
as service role and is unaffected.

### S6 — `otp_challenges` is a dead table (Low)

RLS enabled, **no policy**, **0 rows**, and **no code in the repository
references it**. Almost certainly the remains of a custom 2FA attempt abandoned
in favour of Supabase MFA.

**Recommendation.** Drop it. A table with RLS and no policy is permanently
inaccessible, so it is not a live risk — but it is a permanent advisor warning
that trains people to ignore advisor warnings.

---

## 3. Robustness

### R1 — There are no database transactions (High)

**Zero** transactional wrappers exist in the codebase. **32 server actions
perform three or more writes** with no atomicity.

The consequence is concrete. `completeStaffPayrollRunAction` does this:

1. update the run to `completed`
2. update every payroll item to `payout_status = sent`
3. write an audit event
4. send payslip emails
5. write a second audit event

If step 2 fails, the run is marked paid while its items are not. If the function
times out between 1 and 2 — plausible, since step 4 renders PDFs — payroll is
half-committed with no record of which half. The same shape appears in the
procurement, budget-consolidation and approval flows.

Supabase's PostgREST client cannot open a transaction; that is why this happened.
The available remedies, cheapest first:

1. **Order writes so the dangerous one is last and idempotent** — already done in
   places (the payslip email is deliberately after the state change, and is
   idempotent). This is a discipline, not a mechanism.
2. **Move genuinely multi-step operations into Postgres functions** and call
   them with a single `rpc()`. The function body is a transaction for free. This
   is the right answer for payroll completion, budget consolidation, and
   procure-and-commit.
3. **A reconciliation sweep** for the states that can drift — the finance leak
   detector is already exactly this pattern and should be the model.

**Recommendation.** Do (2) for the three money-moving flows. Do not attempt it
everywhere; most actions write once and are fine.

### R2 — 338 silent failure paths (Medium)

`.catch(() => null)` appears **338 times** in `src/lib/ops`. This is a deliberate
and largely correct pattern — a notification failure must not roll back an
approval — and it is usually paired with an audit row.

The problem is that **the audit rows are write-only**. The project↔finance audit
found `material_request.budget_line_resolution_failed` events that had been
accumulating unnoticed for weeks. Nobody looks, because there is nowhere to look.

**Recommendation.** One "system health" panel listing recent `*_failed` audit
actions, with counts. The data already exists; it needs a surface. Without one,
every one of those 338 catches is a silent failure by design.

### R3 — Two error boundaries for 81 pages (Medium)

`find src/app/ops -name error.tsx` → **2**. A thrown error on any of the other 79
pages surfaces as the framework's default, losing the workspace shell and any
useful message.

**Recommendation.** One `error.tsx` per route group, with a retry and a link back
to `/ops`. Low effort, high perceived reliability.

### R4 — Test coverage is deep but narrow

77 test files against 245 lib modules, 437 actions, 81 pages. **627 tests pass.**

The coverage is excellent where it exists — pure logic (cost roll-up, budget
availability, three-way match, payslip content, notification keys) is tested to a
standard I would not expect at this stage. The gap is that **server actions and
permission functions are largely untested**, and per §S3 those are exactly the
security-critical surface.

**Recommendation.** Extend the guard-test idea rather than chasing per-action
unit tests: source-level assertions that every action authenticates and
authorises, in the style of the notification-key test.

---

## 4. Operations

**Healthy:**
- Sentry on server and edge, 5% trace sampling.
- 6 cron jobs (escalations, HSE, project overdue, IT, archive, leave accrual)
  with sensible off-peak schedules.
- 135 migrations, all applied; no drift between repo and database.
- Structured audit trail — `audit_events` is the largest table in the system at
  1,148 rows.

**Gaps:**

| Gap | Detail |
| --- | --- |
| **No documented restore test** | `docs/backup-and-recovery.md` exists; nothing records a restore ever being *exercised*. An untested backup is a hypothesis. |
| **No failure surface for crons** | If the escalation sweep throws, it is a Sentry event nobody is watching for. A "last successful run" timestamp per cron, surfaced on the overview, would make silence visible. |
| **5% trace sampling** | Reasonable for cost, but too sparse to diagnose the CPU problem the business is actually paying for. Temporarily raising it on the heavy routes would answer questions guesswork cannot. |

---

## 5. Effectiveness — the central strategic finding

| Measure | Value |
| --- | --- |
| Tables | 137 |
| **Tables with zero rows** | **56 (41%)** |
| Tables with 1–9 rows | 43 (31%) |
| Tables with 10+ rows | **38 (28%)** |
| Total rows in the entire system | **3,562** |
| Nav modules | 73 |
| Active users | 17 |
| Lines of ops code | 90,722 |

And the composition of what data does exist:

| Table | Rows |
| --- | --- |
| `audit_events` | 1,148 |
| `notifications` | 885 |
| `material_request_items` | 358 |
| `staff_payroll_items` | 166 |
| everything else | ~1,000 combined |

**The system's own exhaust — audit log and notifications — is 57% of all data in
it.** Actual business records account for roughly 1,500 rows across 73 modules.

This is the honest summary: **Pymble Operations has been built far faster than it
has been adopted.** Two thirds of the schema has never held a real record.
Commercial (contracts, IPCs, valuations, variations), stores/inventory, GL
journals, customers and invoices are all empty. The three modules carrying real
traffic are material requests, staff payroll, and attendance.

I want to be careful here, because there are two very different readings:

- **The generous reading**: the platform was deliberately built ahead of demand
  so the business can grow into it, and the empty tables are capacity, not waste.
- **The uncomfortable reading**: 73 modules is more surface than 17 people can
  learn, and every unused module is code that must be maintained, migrated,
  secured and kept consistent forever — a permanent tax paid for optionality
  that may never be exercised.

Both are partly true. What is *not* in doubt is that the marginal value of a
74th module is now lower than the marginal value of making the three used
modules excellent — which is precisely what the recent spine and platform work
did, and why it produced findings worth acting on.

**Recommendation.** Before building anything new, pick a small number of modules
to *retire or hide*. A module registry entry that shows a nav item for an empty
module trains users that the system is mostly empty. Hiding unused modules behind
a "not yet in use" state would make the workspace feel finished rather than
sparse — a perception change with no data loss.

---

## 6. Functionality

The functional model is strong and coherent. Specifically worth commending:

- **The cost-code spine** (phase → trade, enforced two levels, every code mapped
  to a GL account) is a genuinely correct ERP construct, better than what many
  mid-market packages ship.
- **The six-station cost lifecycle with relief semantics** is the right answer to
  partial procurement, and the invariant is tested.
- **Segregation of duties is explicit** — IT cannot mint finance roles, the
  approver cannot procure their own approval, and both are pinned by tests.
- **Idempotency is treated as a first-class concern** across notifications,
  cost entries and payslip emails.

The functional gaps that remain are the ones already catalogued in the
project↔finance audit (§Phase 4–7 items) plus:

- **No customers, no invoices, no GL journals** — the revenue half of the system
  is wired but has never run. `fetchOpsProjectPnl` reads revenue from invoices,
  so **every project currently reports revenue = 0 and margin = −cost.** Anyone
  reading project profitability today is reading a wrong number, not a missing
  one. That distinction matters.

---

## 7. UI/UX

### Recently and genuinely improved

Avatars across shell, timeline and activity feed; the animated brand mark as a
full-screen loading state over a dimmed skeleton; a toast layer; pending states
on submit buttons; list state preserved across saves; nav regrouped.

### Remaining

| Signal | Value | Comment |
| --- | --- | --- |
| Largest page | **3,181 lines** (`commercial/page.tsx`) | Also 2,828 (employees), 2,267 (hse-compliance). These are not maintainable units. |
| `Suspense` boundaries in `/ops` | **0** | The heavy dashboards still wait on every query before painting. |
| `aria-label` / `aria-labelledby` | **68** across 81 pages | Thin. Icon-only buttons are the usual offenders. |
| `alt=` attributes | **2** | Nearly every image is decorative — defensible — but worth an explicit pass. |
| Labels vs inputs | 1,139 labels / 1,060 inputs | Healthy ratio; form accessibility is better than the aria numbers suggest. |
| `error.tsx` | 2 | See R3. |

**Recommendation, in order:**

1. **Suspense-stream the three heaviest dashboards.** Highest perceived-speed win
   available, and it overlaps the CPU work.
2. **Break up the 3,000-line pages** — not for elegance, but because a page that
   size cannot be reviewed, and unreviewable code is where defects hide.
3. **An accessibility pass on icon-only controls.** 68 aria-labels across a
   workspace this size means keyboard and screen-reader users are guessing.

---

## 8. Performance

From the Supabase performance advisor — **542 lints**:

| Lint | Count | Level |
| --- | --- | --- |
| `unindexed_foreign_keys` | **374** | INFO |
| `unused_index` | 153 | INFO |
| `multiple_permissive_policies` | 14 | WARN |
| `auth_rls_initplan` | 1 | WARN |

**374 unindexed foreign keys** is the headline. It is currently harmless — with
3,562 rows, everything is a fast sequential scan — but it is a cliff, not a
slope. `payment_requests` alone has 11 unindexed FKs; the first month that table
holds 50,000 rows, every join against it degrades at once.

The 153 *unused* indexes are the mirror image: indexes created speculatively that
no query has ever touched, each costing write throughput.

**Recommendation.** Do not index all 374. Index the FKs on the tables that will
actually grow — `payment_requests`, `project_cost_entries`, `material_request_items`,
`notifications`, `audit_events` — and drop the unused indexes on tables that are
empty. This is a 30-minute migration with a real future payoff.

---

## 9. Recommended sequence

**This week — configuration, no code**
1. Enrol 2FA for the 5 privileged accounts (**S1**).
2. Enable leaked-password protection (**S2**).
3. Revoke `EXECUTE` on `ops_next_invoice_number`; drop `otp_challenges` (**S5**, **S6**).

**Next — contained engineering**
4. Rate-limit the 4 public forms and reset-password (**S4**).
5. `error.tsx` per route group (**R3**).
6. System-health panel surfacing `*_failed` audit events (**R2**).
7. Index the FKs on the five tables that will grow (**P1**).

**Then — structural**
8. Guard test asserting every action authenticates and authorises (**S3**) — the
   single highest-leverage security item.
9. Move payroll completion, budget consolidation and procure-and-commit into
   Postgres functions for atomicity (**R1**).
10. Suspense-stream the heavy dashboards; break up the 3,000-line pages (**U1**).

**Product decision, not engineering**
11. Decide which unused modules to hide (**E1**). This is the difference between a
    workspace that feels finished and one that feels 60% empty.

---

## Appendix — evidence

All figures gathered 2026-08-01 from the live project and repository.

```
Security
  auth.mfa_factors                      0 rows (0 verified)
  privileged active users               5
  active ops users                      17
  RLS enabled                           137 / 137 tables
  RLS policies                          159 across 136 tables
  service-role client                   147 files, 814 call sites
  session client                        21 files
  API routes                            40 (30 gated, 10 public)
  public forms without rate limiting    4  (+ reset-password)
  service key in client components      0

Robustness
  transactional wrappers                0
  actions with 3+ writes                32 of 55 action files
  .catch(() => null)                    338
  error.tsx                             2 (for 81 pages)
  tests                                 627 passing, 77 files

Effectiveness
  tables                                137  (56 empty, 43 <10 rows, 38 in use)
  total rows                            3,562
  audit_events + notifications          2,033  (57% of all data)
  nav modules                           73
  server actions                        437
  permission functions                  354
  lines of ops code                     90,722
  migrations                            135

Performance
  advisor lints                         542
  unindexed foreign keys                374
  unused indexes                        153

UI/UX
  largest page                          3,181 lines
  Suspense boundaries in /ops           0
  aria-label / aria-labelledby          68
```
