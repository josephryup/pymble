# Pymble Operations — Remediation Quality Check

**Date:** 2026-08-05
**Scope:** verify that every phase of the remediation actually achieved its goal
**Method:** live database inspection (`zuezxgyhhrhklrhqsvvs`), Supabase security and
performance advisors, `pg_proc` / `pg_policies` / `information_schema` inspection,
source-level scans, and a full `tsc --noEmit && eslint && npm test` run.
**Baseline:** `docs/pymble-ops-independent-audit-2026-08-04.md`

---

## 0. Verdict

Every phase met its goal, verified against the live system rather than against the
migration files. Two defects were found during this check — one introduced by the
remediation itself — and one is fixed below. The other is pre-existing and left for
a decision.

| Phase | Goal | Verified | Evidence |
| --- | --- | --- | --- |
| 0 | Empty-state consistency | ✅ | 54 of 81 pages on shared components (was 37) |
| 1 | Narrow over-wide RLS write policies | ✅ | 5 tables now resolve via `private.can_*()` |
| 2 | DB cleanup + growth indexes | ✅ | advisors 3→1; 0 unindexed FKs on the 8 growth tables |
| 3 | Rate-limit public endpoints | ✅ | 6 of 6 public POST routes throttled |
| 4 | Failure visibility + guard tests | ✅ | health panel live; guard proven to fail on regression |
| 5 | Atomicity for money flows | ✅ | 2 transactional functions, branches exercised live |
| 6 | Suspense streaming | ✅ | 0 → 5 boundaries on the 3 heaviest dashboards |

---

## 1. Security — verified against the live database

**Supabase security advisors: 3 lints → 1.**

The single remaining lint is `auth_leaked_password_protection`, which requires a Pro
plan. It is blocked alongside 2FA enrolment (S1/S2) by the same constraint and is not
an engineering item.

**Function-level state.** All seven functions created or changed are SECURITY DEFINER,
pinned to `search_path = public`, and revoked from **both** `anon` and `authenticated`:

```
private.can_manage_invoices          revoked  8 roles
private.can_manage_boq               revoked  11 roles
private.can_manage_sites             revoked  8 roles
private.can_manage_workers           revoked  10 roles
private.can_manage_payroll_run       revoked  8 roles
public.ops_complete_staff_payroll_run        revoked
public.ops_insert_purchase_order_with_lines  revoked   (confirmed the generated-column-aware version)
public.ops_next_invoice_number               revoked   (S5)
```

**Every helper's role set matches its TypeScript predicate exactly.** Checked by
extracting the role literals from `pg_get_functiondef` and comparing against the
source predicate, not by trusting the migration text:

| Helper | Roles | Mirrors |
| --- | --- | --- |
| `can_manage_invoices` | 8 | `INVOICE_CREATE_ROLES` |
| `can_manage_boq` | 11 | BOQ create ∪ price ∪ archive |
| `can_manage_sites` | 8 | `SITE_MANAGE_ROLES` |
| `can_manage_workers` | 10 | `canEditWorker` (incl. `engineering_manager`) |
| `can_manage_payroll_run` | 8 | `canManagePayrollRun` / `canManageOpsStaffPayroll` |

`can_access_staff_payroll` remains 9 roles — it includes `accountant`, who may *view*
staff payroll but not run it. That asymmetry is deliberate and now consistent.

**`otp_challenges` dropped** (137 → 136 tables). **`ops_next_invoice_number`** no longer
executable by `authenticated`.

### Policies still carrying inline role arrays — by decision, not omission

Five write policies still name roles inline. Each was left deliberately:

| Policy | Roles | Why left |
| --- | --- | --- |
| `attendance_records_write_ops` | 20 | RLS is **tighter** than the code gate (`canRecordAttendance` = not crew) |
| `organization_profile_update_admin` | 20 | same — `canManageOps` is broader |
| `site_photos_write_ops` | 20 | uploads are intentionally broad; field crews post via the offline route |
| `audit_events_insert_ops` | 10 | every module writes audit rows by design |
| `user_site_assignments_manage` | 7 | narrow already; not in audit scope |

Narrowing the first two would make the database disagree with the application; widening
them to match would be worse. The real exposure there was the weak *application* gate,
which is what finding S7 addressed.

---

## 2. Performance

**Advisor lints: 542 → 537.**

| Lint | Before | After |
| --- | --- | --- |
| `unindexed_foreign_keys` | 374 | **340** |
| `unused_index` | 153 | **182** |
| `multiple_permissive_policies` | 14 | 14 |
| `auth_rls_initplan` | 1 | 1 |

**Unindexed FKs on the eight growth tables: 0.** `payment_requests` (was the worst at
11), `project_cost_entries`, `purchase_orders`, `material_requests`,
`material_request_items`, `attendance_records`, `audit_events` and
`payment_request_items` are all covered.

**Honest trade-off:** `unused_index` rose by 29, because the indexes just added have not
yet been used by any query. That is expected — they are deliberately forward-looking, and
each one costs write throughput today for a benefit that arrives with volume. If these
tables never grow, that cost is not repaid. The reasoning is recorded in the migration
so a future reader can reverse it knowingly.

`multiple_permissive_policies` is unchanged at 14 and remains a planner-cost item, not a
security one: in every case both policies use the same predicate, so nothing is widened.

---

## 3. Robustness

```
tsc --noEmit    clean
eslint          2 warnings, both pre-existing (cost-code-permissions, procure-actions)
npm test        672 passing / 141 suites / 0 failing      (was 627 / 133)
test files      82                                        (was 77)
```

**Atomicity.** `.rpc()` call sites 8 → 10 — the two new transactional functions.
Both were exercised against the live database:

- `ops_complete_staff_payroll_run` returns `not_found` for a missing run,
  `not_approved` for a draft, and `already_completed` for a finished one. State was
  re-counted after each probe and was unchanged (16 draft / 1 completed / 13 items sent /
  1 audit row), confirming the guard branches mutate nothing.
- `ops_insert_purchase_order_with_lines` wrote a header and two lines in one call, with
  `line_total` correctly computed by the database (20.00 + 103.45 = 123.45) and the bogus
  values supplied by the probe correctly ignored. The probe rows were then deleted; a
  follow-up check confirmed zero probe POs and zero orphan lines.

**Failure visibility.** The `/ops/settings` health panel was validated by running its
query shape directly: it returns 17 `material_request.budget_line_resolution_failed`
events inside the 30-day window (18 exist in total; one is older). These had been
accumulating unseen since 27 July.

`catch(() => null)` remains at **338**. That number is not meant to fall — the pattern is
correct. What changed is that the audit rows those catches write are now readable.

**Guard tests.** The action-authorisation guard was proven to work by injecting a
regression into `it-security-actions.ts`; it failed and named all six affected actions,
then went green when reverted. It resolves delegation across module boundaries, so the
five notification actions that delegate to `notifications.ts` are correctly recognised as
authenticated rather than being permanently exempted.

---

## 4. UI

| Signal | Before | After |
| --- | --- | --- |
| Pages using shared empty-state components | 37 | **54** of 81 |
| Suspense boundaries in `/ops` | **0** | **5** (commercial 3, employees 1, hse-compliance 1) |
| Blocking queries, commercial page | 21 | **17** |
| Blocking queries, hse-compliance | 13 | **12** |
| `error.tsx` | 2 | 2 — **correct**, see below |

The 27 pages without an empty-state component are detail and form routes that render a
single record, where an empty state has no meaning.

**On `error.tsx`.** The original audit called 2 boundaries for 81 pages a finding. It is
not. `error.tsx` sits beside `layout.tsx` at the `(workspace)` level, so it renders
*inside* the shell and catches every one of the 79 nested pages. No work was needed and
none was done.

**Page decomposition was deliberately not attempted.** The three heaviest pages are
marginally longer than before (commercial 3,181 → 3,244) because extracting streamed
sections added components and their documentation. A wholesale split is a large
mechanical refactor with real regression risk and no user-visible benefit. The Suspense
work already extracts sections incrementally (`CommercialKpiSection`,
`CommercialChartsSection`, `CommercialMarginSection`, `HseAgeingSection`,
`HrTrainingRenewalSection`), which is the safer path: decompose while touching, not in
one sweep.

---

## 5. Defects found by this check

### Q1 — Migration filename collision (introduced by the remediation, **fixed**)

`20260805090000_narrow_over_wide_rls_write_policies.sql` was created with the same
version prefix as the pre-existing `20260805090000_pymble_ops_quotations.sql`. Supabase
keys migrations by that timestamp, so two files sharing one version is a genuine
conflict. Renamed to `20260805090100_…`, which also preserves the intended ordering
relative to the other four new migrations.

### Q2 — Four pre-existing duplicate migration versions (**not fixed** — needs a decision)

The same check surfaced four collisions that predate this work:

```
20260701090000  project_tasks              +  push_subscriptions
20260725090000  chart_of_accounts          +  material_request_delivered_status
20260730090000  intern_roles_site_assignments + login_rate_limit
20260812090000  dedupe_notification_backlog   + po_value_assertion
```

These are latent rather than active: this project applies migrations through the MCP
tool rather than `supabase db push`, so the CLI's version key is not currently consulted.
They would matter the moment anyone runs a CLI-driven push or tries to rebuild the
database from the repo. Renaming them is safe but is a history edit, so it is left as a
decision rather than done unilaterally.

### Q3 — Migration ledger does not match the repository (informational)

The database records seven new migrations against the repository's five files, and the
version numbers differ because `apply_migration` assigns its own timestamps:

```
DB                                                  repo
20260804232129 narrow_over_wide_rls_write_policies  20260805090100_…
20260804232148 db_cleanup_and_growth_indexes        20260805091000_…
20260804232403 tighten_legacy_payroll_write_policies 20260805092000_…
20260804233802 atomic_staff_payroll_completion      20260805093000_…
20260804234059 atomic_purchase_order_with_lines     20260805094000_…
20260804234210 atomic_purchase_order_with_lines_v2  (same file — corrected in place)
20260804234337 atomic_purchase_order_with_lines_v3  (same file — corrected in place)
```

The v2 and v3 entries are the two corrections made while fixing the
`jsonb_populate_record` default and generated-column problems. Because each function is
written with `CREATE OR REPLACE`, the live definition is the final one, which was
confirmed directly rather than inferred.

**All five repository files were checked for idempotency and all are safe to re-apply** —
they use only `create or replace`, `drop … if exists`, and `create index if not exists`.
So the drift is a bookkeeping inconsistency, not a hazard.

---

## 6. Still open

| Item | Status |
| --- | --- |
| **S1** — 2FA enrolled for nobody | Blocked on Supabase Pro. Deferred by decision; Cloudflare Access is the alternative under consideration. |
| **S2** — Leaked-password protection | Blocked on Supabase Pro. Same decision. |
| **E1** — Unused modules | Closed by decision: all 73 modules are retained, and the team will grow into them. This is why Phase 0 focused on making empty modules explain themselves rather than hiding them. |
| **Q2** — Duplicate migration versions | Needs a decision (§5). |
| Revenue half of the system | Unchanged: no customers, invoices or GL journals, so `fetchOpsProjectPnl` still reports revenue = 0 and margin = −cost on every project. Reading project profitability today still means reading a wrong number, not a missing one. |

While 2FA remains unavailable, login rate-limiting and the now-narrowed RLS policies are
the only barriers on privileged accounts. That raises rather than lowers the value of the
Phase 1 work.
