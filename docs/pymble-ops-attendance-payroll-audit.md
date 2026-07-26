# Pymble Ops — attendance, payroll & system improvement audit

**Date:** 2026-07-26
**Scope:** the attendance module (rebuilt this session for fixed daily rates), its
downstream payroll path, and a system-wide sweep for the highest-value
improvements. Findings are grounded in the current code, not in general advice.

---

## Part 1 — What changed in attendance this session

| Before | Now |
| --- | --- |
| Pay = hours × (daily rate ÷ standard hours) — a 4h day paid half | Pay = the **full fixed daily rate** (K60 default) for any present/late day, whatever the hours |
| Overtime silently derived from hours only | Overtime has its **own input** next to hours, paid on top at the multiplier |
| Hours a required manual field | Hours **auto-fill from clock in → clock out** (night shifts across midnight included) |
| No idea what a record would pay until saved | **Live "Will earn" preview**: base + overtime + total, updates as you type |
| 3 GPS inputs (label, latitude, longitude) on every capture | GPS removed; a single free-text **Site note** remains |
| Nothing stopped two records for one worker on one day | **Duplicate-day guard** on both create and edit |

Absent still pays zero. Explicit overtime always beats the derived figure, so a
supervisor can log a 12-hour day while only authorising 1 hour of overtime.

**Applies to new and edited records only.** Attendance rows written before this
change still hold hours-scaled amounts; see Action 1 below.

---

## Part 2 — Attendance & payroll findings

### A1 — Self-approval: attendance has no maker/checker split ✅ FIXED
`canApproveAttendance` in [permissions.ts:34](../src/lib/ops/permissions.ts:34) is
`canRecordAttendance(role) && role !== "engineering_intern"`. Every role that can
record attendance can also approve it, including its own records — and approval is
the gate that releases a record into payroll
([payroll-actions.ts:153](../src/lib/ops/payroll-actions.ts:153) selects on
`approved_at is not null`).

A site supervisor can therefore create and approve attendance for a worker
unopposed. Under the flat daily rate this is a clean path to fabricated pay, and
the hours column no longer looks anomalous when it happens.

**Fixed:** new `canSelfApproveAttendance` in
[permissions.ts](../src/lib/ops/permissions.ts) limits self-approval to
developer / MD / owner / GM / manager / operations manager / projects manager.
`approveAttendanceAction` checks `created_by` against the actor and refuses
otherwise, and the attendance page hides the Approve button on your own records
(showing "another approver must sign it off") so the button never dead-ends.
Covered by `tests/attendance-controls.test.ts`.

### A2 — Historical rows are on the old pay basis 🟠
Rows written before today still carry `amount_earned` computed as hours × hourly
rate. A short day recorded last week is under-paying versus the new rule, and any
unpaid approved row will be picked up by the next payroll run at the old figure.

**Fix (decide, then do one):** either (a) leave history as-is and treat the change
as effective 2026-07-26 — cleanest for audit; or (b) recompute unpaid rows
(`payroll_run_id is null`) to the fixed rate via a one-off script. Do **not**
touch rows already attached to a payroll run.

### A3 — Worker daily rates are not actually K60 in the database 🟠
The form now defaults to K60 and the column default is set in
[the new migration](../supabase/migrations/20260726090000_pymble_attendance_fixed_daily_rate.sql),
but existing `workers.daily_rate` values are whatever was typed at creation. The
fixed-rate model only behaves as described once the register agrees.

**Fix:** review the worker register and normalise rates. Left undone
deliberately — a mass rate update is a pay decision, not a refactor.

### A4 — Capture is one worker at a time ✅ FIXED
A 30-worker site means 30 form submissions, each re-picking site and date. This is
the single biggest daily time cost in the module.

**Fixed:** a **Bulk roster capture** panel on `/ops/attendance`. Pick a site and
date (GET params, so the roster renders server-side), get every assigned worker as
a row defaulting to Present, set shared default clock times with optional per-row
overrides plus per-row overtime, and submit once. Workers who already have a record
for that day are shown as such and skipped; `createBulkAttendanceAction` re-checks
server-side, batches the insert, and writes one audit event per record. The
result notice reports created and skipped counts.

### A5 — Offline replay endpoints unthrottled ✅ FIXED
`/api/ops/offline/attendance` writes money-bearing records and has no rate limit.
Rate limiting exists in the codebase but is wired only to
[the login route](../src/app/api/ops/auth/login/route.ts). The `client_id` upsert
prevents duplicate replays of the *same* intent, not a flood of distinct ones.

**Fixed:** `checkOpsOfflineReplayRateLimit` (per-user 120/5min, per-IP 300/5min,
separate buckets per endpoint) now guards all three `/api/ops/offline/*` routes,
returning 429 with `Retry-After`.

While wiring this up: the outbox dead-lettered **every** 4xx, so a throttled sync
would have silently discarded a queued attendance record. `replayOutboxIntent` in
[outbox.ts](../src/lib/ops/offline/outbox.ts) now treats 429 and 408 as retryable.
Worth knowing this bug pre-existed for any endpoint that ever returned 429.

### A6 — No attendance export ✅ FIXED
**Fixed:** `GET /api/ops/attendance/export` builds a branded ExcelJS register
(logo band, summary cards, frozen header, autofilter, totals row) styled to match
the staff payroll register. The **Export to Excel** button on the register carries
the active filters through, and the fetch keeps the caller's site-assignment
scoping so a supervisor can only export their own sites. Export is audit-logged as
`attendance.excel_exported`.

### A7 — GPS columns retained, not dropped 🟡
`gps_latitude` / `gps_longitude` are no longer written or read anywhere in the app,
and `gps_label` now stores a plain site note under a misleading name. Columns were
deliberately **not** dropped, so existing history survives and no deploy-ordering
hazard is introduced.

**Fix when convenient:** rename `gps_label` → `site_note` and drop the two
coordinate columns, in a migration applied *before* the code that expects the new
name. The overview map's clock-point layer has already been removed.

---

## Part 3 — System-wide findings

### S1 — 345 silently swallowed errors 🟠
`grep` finds 345 instances of `.catch(() => null)` / `.catch(() => {})` across
`src`. For notification fanout this is correct — a failed push must not fail a
business write. But the pattern is now applied uniformly, including to audit-event
inserts, so a failed audit write is indistinguishable from a successful one.

**Fix:** keep the swallow, add observability — route these through a helper that
reports to Sentry (already installed) instead of discarding. One helper, mechanical
call-site migration.

### S2 — 70 files opt out of caching 🟠
70 files carry `force-dynamic`. Much of it is necessary (session-scoped ops pages),
but it is applied as a default rather than a decision, so genuinely static or
short-TTL-cacheable reads (dashboards, trend charts, org profile) re-query on every
navigation. This is the most likely cause of perceived slowness in the workspace.

**Fix:** audit the list, and give the read-heavy analytics fetchers a short
`revalidate` instead.

### S3 — Four files over 2,000 lines 🟠
`commercial-actions.ts` (3,730), `commercial/page.tsx` (3,027),
`employees/page.tsx` (2,599), `hse-compliance-actions.ts` (2,374). These are the
files where merge conflicts and regressions concentrate, and they are too large to
review meaningfully in one pass.

**Fix:** split by workflow (one action module per business verb), opportunistically
— not as a big-bang refactor.

### S4 — 184 unchecked type casts 🟡
184 `as unknown as` / `as any` casts, concentrated on Supabase query results. Each
is a place where a schema change compiles clean and fails at runtime. The
`check-schema` script exists but does not cover row shapes.

**Fix:** generate Supabase types and delete the casts module by module, highest-
traffic first (payroll, attendance, GL).

### S5 — Test suite is broad but action-thin 🟡
327 tests across 49 files, and they are good tests — the statutory calculator and
the attendance calculator are both properly covered. But coverage concentrates on
pure functions; server actions (permission gates, clash guards, approval
transitions) are largely untested, which is exactly where A1-style control bugs
live.

**Fix:** a thin harness with a mocked Supabase client, then test the guards rather
than the happy paths.

---

## Status

**Shipped:** everything in Part 1, plus A1 (maker/checker), A4 (bulk roster
capture), A5 (offline throttling + the 4xx dead-letter bug it uncovered), and A6
(Excel export). Verified: `tsc` clean, ESLint clean, 339/339 tests pass.

**Waiting on a pay decision — these are yours to call, not a refactor:**

- **A2** — historical `amount_earned` rows are still on the old hours-scaled
  basis. Effective-date the change, or recompute unpaid (`payroll_run_id is
  null`) rows only? Rows already in a payroll run must not move either way.
- **A3** — existing `workers.daily_rate` values were never normalised to K60.

Both should be settled before the next payroll run.

**Remaining engineering work, in order:** S1 + S2 (error observability and the
caching audit — cheap, system-wide), then A7 (rename `gps_label` → `site_note`
and drop the coordinate columns, migration applied *before* the code), then
S3–S5 as capacity allows.
