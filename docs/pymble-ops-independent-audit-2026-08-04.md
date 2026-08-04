# Pymble Operations — Independent Verification Audit

> **Correction, 2026-08-05.** §0 below originally listed **11** tables as having
> RLS write policies wider than their TypeScript gate. On implementing the fix I
> checked each predicate directly and **6 of the 11 were wrong**. The genuinely
> over-wide set is **5 tables**: `invoices`, `boq_documents`, `boq_line_items`,
> `sites`, `workers`.
>
> On `payroll_runs`, `payroll_run_items`, `cash_advances`, `organization_profile`
> and `attendance_records` the relationship is **inverted** — the RLS list (20
> roles) is *tighter* than the code gate, because those modules are guarded only
> by `canManageOps` / `canRecordAttendance`, which both evaluate to
> `role !== "crew"` (25 of 26 roles). The weak door on those tables is the
> application, not the database. That is a separate and arguably worse finding,
> tracked below as **S7**. `site_photos` is intentionally broad — field crews
> upload through the offline replay route — so only its deletion path is
> restricted, by ownership rather than role.
>
> The §0 table is left as originally written for the record; read it with this
> correction applied.

**Date:** 2026-08-04
**Auditor:** second pass, independent of `pymble-ops-system-audit-2026-08.md`
**Method:** live database inspection (`zuezxgyhhrhklrhqsvvs`), Supabase security +
performance advisors, `pg_policies` / `information_schema` grant analysis, a
transitive-closure static scan of all 437 server actions, and a full
`tsc --noEmit && eslint && npm test` run.
**Status:** audit only — no code or schema was changed.

---

## 0. Headline: one finding the first audit missed

> **On 11 tables, the RLS write policy is far wider than the TypeScript
> permission that guards the same table in the app — and the browser can reach
> those tables directly.**

The first audit concluded (S3) that RLS "does essentially nothing for the
application's own data access" and framed the risk as *a missing check in
TypeScript*. I scanned all 437 actions and found **no missing checks**. The gap
is on the other side: RLS is not merely an unused backstop on these tables, it
is a **second door that is open wider than the front one**.

`NEXT_PUBLIC_SUPABASE_ANON_KEY` ships in the client bundle (it must — Realtime
needs it, see `src/lib/ops/supabase-browser.ts:32`), and every signed-in user
carries a session JWT. So any user can call `/rest/v1/<table>` directly from
devtools. What stops them is RLS alone — the 354 permission functions are not in
that path.

For these 11 tables, RLS names **20 of the 26 roles**:

| Table | Rows | TypeScript gate | RLS write policy |
| --- | --- | --- | --- |
| `payroll_runs` | 2 | leadership + HR + finance_manager | **20 roles** |
| `payroll_run_items` | 9 | leadership + HR + finance_manager | **20 roles** |
| `invoices` | 0 | `canCreateInvoice` (narrow) | **20 roles** |
| `cash_advances` | 4 | finance/HR | **20 roles** |
| `attendance_records` | 19 | attendance perms | **20 roles** |
| `boq_line_items` | 5 | `boq-permissions` | **20 roles** |
| `boq_documents` | — | `boq-permissions` | **20 roles** |
| `sites` | 11 | admin | **20 roles** |
| `workers` | 10 | HR | **20 roles** |
| `site_photos` | 1 | site perms | **20 roles** |
| `organization_profile` | — | admin (UPDATE) | **20 roles** |

The only roles excluded are `crew`, `care_taker`, `engineering_intern`,
`accountant_intern`, `it_manager`, `engineering_manager`.

**Included** are `admin_receptionist`, `hse_assistant_officer`, `hse_officer`,
`engineer`, `supervisor`, `procurement`, `procurement_assistant`,
`quantity_surveyor`. Cross-referenced against the live user table, **8 of the 17
active users hold one of those roles today.** Any of them can, right now,
`INSERT`/`UPDATE`/`DELETE` payroll runs, invoices, cash advances and attendance
records without ever touching the application.

This is not hypothetical and it is not a code defect — it is a policy-generation
inconsistency between two eras of migration. The newer tables do it correctly:

```sql
-- newer, correct: staff_payroll_items
using (private.can_access_staff_payroll())   -- 9 roles, one source of truth

-- older, too wide: payroll_runs
using ((private.current_user_role())::text = ANY (ARRAY[ ...20 roles... ]))
```

**Recommendation.** Replace the 11 inline role arrays with narrow
`private.can_*()` helpers mirroring the TypeScript predicate, exactly as
`can_access_staff_payroll()` already does. One migration. The helper pattern,
the tests, and the correct precedent all already exist in this repo — this is
bringing 11 stragglers onto an established standard, not new design.

> **Do not "fix" this by tightening `users_update_self`.** That policy looks like
> privilege escalation (`UPDATE` on `users` with only `id = auth.uid()`), but
> `authenticated` has **no UPDATE grant** on `public.users` — verified via
> `has_table_privilege`. The policy is unreachable. The grant layer is doing the
> work; leave it.

---

## 1. Where I agree with the first audit — confirmed against the live system

| # | Finding | Verdict |
| --- | --- | --- |
| S1 | 2FA enrolled for nobody | **Confirmed.** `auth.mfa_factors` = 0 rows, 0 verified, against 19 auth users / 17 active. |
| S2 | Leaked-password protection off | **Confirmed** by security advisor. |
| S4 | 4 public forms + reset-password unthrottled | **Confirmed.** Only `/api/ops/auth/login` calls the limiter. |
| S5 | `ops_next_invoice_number` callable by `authenticated` | **Confirmed** by advisor. |
| S6 | `otp_challenges` dead table | **Confirmed** — RLS on, no policy, no code references. |
| R2 | 338 silent `.catch(() => null)` | **Confirmed** — exactly 338 in `src/lib/ops`. |
| R3 | 2 error boundaries for 81 pages | **Confirmed.** |
| P1 | 374 unindexed FKs | **Confirmed.** 542 lints total; `payment_requests` (11) and `equipment_requests` (10) worst. |
| U1 | Oversized pages, no Suspense | **Confirmed.** 3,181-line `commercial/page.tsx`; **0** Suspense boundaries in `/ops`. |
| E1 | Surface exceeds adoption | **Confirmed** — 137 tables, 159 policies, 135 migrations. |

Also independently verified as **genuinely good**:

- **RLS enabled on 137/137 tables**; the security advisor reports **no**
  `rls_disabled_in_public` findings at all.
- **No `USING (true)` policy exists anywhere.** I checked explicitly.
- The 23 policies granted to `anon` are all **deny-all** (`false`/`false`) —
  deliberate service-role lockdown, the safest tables in the system.
- `private.current_user_role()` reads from `public.users`, **not** a JWT claim,
  so it is not spoofable by a crafted token. This is the right call and easy to
  get wrong.
- The local role-preview backdoor is triple-gated exactly as described.
- **All 6 cron endpoints** use `timingSafeEqualString` bearer comparison and
  return 503 when `CRON_SECRET` is unset. (The first audit did not check these.)

---

### S7 — Payroll and cash advances are gated only by "not crew" (High)

Found while implementing the §0 fix. These write paths:

| Module | Guard | Effective roles |
| --- | --- | --- |
| `payroll_runs`, `payroll_run_items` | `canManageOps` | 25 of 26 |
| `cash_advances` | `canManageOps` | 25 of 26 |
| `organization_profile` | `canManageOps` | 25 of 26 |
| `attendance_records` | `canRecordAttendance` | 25 of 26 |

`canManageOps` is `role !== "crew"` (`src/lib/ops/permissions.ts:18`). So an
`admin_receptionist`, `hse_assistant_officer` or `engineering_intern` can create,
cancel, archive and delete payroll runs and cash advances **through the normal
UI** — no REST trickery needed.

Two mitigating facts, neither of which resolves it: the *live* payroll module is
`staff_payroll_*`, which is correctly gated by `canManageOpsStaffPayroll`
(leadership + HR + Finance Manager); and `payroll_runs` holds only 2 rows against
`staff_payroll_runs`' 17. This looks like a legacy module that never had its
permissions tightened when the staff-payroll spine replaced it.

**Recommendation.** Decide whether the legacy payroll module is still needed. If
it is, gate it with the same predicate as staff payroll. If it is not, retire the
write paths — that is a smaller change than it sounds, since almost nothing uses
them. Either way, `canManageOps` should not be the guard on anything that moves
money.

---

## 2. Where I disagree or would soften the first audit

**S3 is stated backwards.** "A single missing `if (!canX(role))` is a full data
exposure … hope nobody forgets." I tested this rather than assuming it. A
transitive-closure scan over all **437** exported `*Action` functions — following
delegation into local helpers like `requireItManager()` and
`updateCommercialContractStatus()` — found **every single one authenticates**.
The five that initially flagged (`notification-actions.ts`) delegate to
`updateOpsNotificationStatus()`, which both calls `requireOpsUser()` *and*
scopes `.eq("recipient_id", profile.id)`. The application layer is clean. The
recommended guard test is still worth building — but as *regression protection
for a currently-passing property*, not as remediation.

**`careers/apply` is not unbounded.** The first audit called it a storage-abuse
vector with "no throttle". It does enforce `MAX_CV_BYTES = 10MB` and a MIME
allowlist (`route.ts:73-78`). The real weaknesses are narrower: `cv.type` is
client-supplied with no magic-byte check, and there is no per-IP throttle — so
the ceiling is *many* 10MB files, not infinite ones.

**The offline replay routes are already hardened.** Not mentioned in the first
audit, but all four `/api/ops/offline/*` endpoints authenticate *and* enforce
`OPS_OFFLINE_REPLAY_RATE_LIMIT`. Good work that deserved credit.

**"Zero transactional wrappers" needs a caveat.** There are 8 `.rpc()` call
sites, so the mechanism is in use (rate limiting, invoice numbering). The
accurate claim is narrower: *no multi-write business flow is atomic*. That is
still true and still the right R1 recommendation.

**The 14 `multiple_permissive_policies` warnings are performance, not security.**
They fire because a `cmd = ALL` write policy also matches `SELECT` and ORs with
the narrower select policy. In every case I checked, both policies use the same
predicate, so nothing is widened. Fix for planner cost, not exposure.

**Minor:** `aria-label` count is 29 within `src/app/ops` (75 including shared
`src/components`), not 68 across pages — the direction of the finding is right,
the figure depends on scope.

---

## 3. System health — verified, not asserted

```
npx tsc --noEmit    clean
npx eslint .        clean
npm test            627 passing / 133 suites / 0 failing
```

All modules compile, lint, and pass. `docs/pymble-ops-system-audit-2026-08.md`
reported the same 627 — I re-ran it rather than take the number on trust.

Other structural checks that came back clean:

- **No XSS sink is user-controlled.** All 6 `dangerouslySetInnerHTML` uses are
  `JSON.stringify` of JSON-LD built from `blog-data` / `constants` — static
  author-controlled files. Worth knowing that `JSON.stringify` does *not* escape
  `</script>`, so this becomes a real vector the day blog/project content moves
  into the database. Cheap insurance now: `.replace(/</g, "\\u003c")`.
- **No open redirect.** `safeOpsReturnTo` rejects `//`-prefixed values and
  requires a `/ops` prefix. Backslash and traversal variants both fail closed.
- **CSRF origin checks** are enforced on state-changing API routes via
  `rejectMismatchedOpsOrigin`.
- **Security headers** are applied at `src/proxy.ts` (Next.js 16 renamed
  `middleware.ts` → `proxy.ts`) — HSTS, `X-Frame-Options: DENY`, nosniff,
  `frame-ancestors 'none'`, plus `no-store` and `noindex` on ops paths.
- **Auth gating** is at the `(workspace)` layout, which calls `requireOpsUser()`.
  The only pages without their own auth call are `login`, `offline`, and two
  that inherit correctly from that layout.

One architectural note on the last point: the proxy does **not** gate auth — it
only refreshes sessions and sets headers. Protection depends on the workspace
layout. That works today, but it means a future route group created outside
`(workspace)` would be public by default. A `requireOpsUser()` call in a shared
root or a route-manifest guard test would make that failure mode impossible
rather than merely unlikely.

---

## 4. UI/UX — organisation and clarity

The workspace shell, avatars, toast layer, loading states and preserved list
state are genuine recent improvements. What remains, in the order I would do it:

1. **`error.tsx` per route group** (2 exist for 81 pages). Highest
   reliability-per-hour available: a thrown error currently drops the whole
   workspace shell.
2. **Suspense-stream the three heavy dashboards.** Zero boundaries in `/ops`
   means every dashboard blocks on its slowest query before painting anything.
   The `loading.tsx` files (16 of them) only cover full-route transitions, not
   in-page waterfalls.
3. **Break up the 7 pages over 1,700 lines.** `commercial` (3,181), `employees`
   (2,828), `hse-compliance` (2,267), `engineering-controls` (1,943),
   `fleet-logistics` (1,838), `equipment` (1,823), `material-requests` (1,748).
   Not for elegance — a 3,000-line page cannot be reviewed, and unreviewable
   code is where the next defect hides.
4. **Accessibility pass on icon-only controls** — 29 aria-labels across 81 pages
   is thin.
5. **Hide unused modules.** 73 nav entries against 17 users, with two-thirds of
   tables empty, makes a finished system feel sparse. A "not yet in use" state
   costs nothing and changes the perception entirely.

---

## 5. Recommended sequence

**Today — configuration only, no deploy**
1. Enrol 2FA for the 5 privileged accounts (**S1**).
2. Enable leaked-password protection — one toggle (**S2**).

**This week — one migration**
3. **Narrow the 11 over-wide RLS write policies to `private.can_*()` helpers
   (§0).** This is now the top engineering item, ahead of everything in the
   first audit's list.
4. `REVOKE EXECUTE ON ops_next_invoice_number FROM authenticated`; `DROP TABLE
   otp_challenges` (**S5**, **S6**).
5. Index FKs on the five tables that will actually grow; drop unused indexes on
   empty tables (**P1**).

**Next — contained engineering**
6. Rate-limit the 4 public forms + reset-password; add magic-byte validation to
   the CV upload (**S4**).
7. `error.tsx` per route group (**R3**).
8. System-health panel surfacing `*_failed` audit events — the data already
   exists with nowhere to look at it (**R2**).

**Then — structural**
9. Guard test asserting every `*Action` authenticates. **It passes today** —
   land it to keep it that way, and extend it to assert RLS policy width matches
   the TypeScript predicate, which would have caught §0.
10. Move payroll completion, budget consolidation and procure-and-commit into
    Postgres functions for atomicity (**R1**).
11. Suspense-stream heavy dashboards; break up the oversized pages (**U1**).

---

## Appendix — evidence gathered 2026-08-04

```
Security
  auth.mfa_factors                       0 rows (0 verified)
  auth users / active ops users          19 / 17
  RLS enabled                            137 / 137 tables
  RLS policies                           159
  policies with USING (true)             0
  policies granted to anon               23  (all deny-all false/false)
  tables w/ 20-role write policy         11   <-- §0
  active users holding such a role       8 of 17
  security advisor lints                 3  (otp_challenges, invoice_number fn, leaked-pw)
  cron routes with timing-safe auth      6 / 6
  server actions authenticating          437 / 437
  public forms without rate limiting     4  (+ reset-password)

Robustness
  .catch(() => null)                     338
  .rpc() call sites                      8
  error.tsx                              2 (for 81 pages)
  tsc / eslint / tests                   clean / clean / 627 passing

Performance
  advisor lints                          542
  unindexed foreign keys                 374  (payment_requests 11, equipment_requests 10)
  unused indexes                         153
  multiple_permissive_policies           14   (performance only — predicates match)

UI/UX
  ops pages                              81
  pages over 1,700 lines                 7  (largest 3,181)
  Suspense boundaries in /ops            0
  loading.tsx                            16
  aria-label / aria-labelledby           29 in /ops (75 incl. shared components)
  lines of ops code                      140,758 (app/ops + lib/ops)
```
