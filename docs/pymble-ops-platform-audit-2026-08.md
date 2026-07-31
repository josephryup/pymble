# Pymble Ops — Platform Audit (identity, payroll, offline, performance, notifications)

**Audit date:** 2026-07-31
**Status:** audit only — **no code or schema changed by this document**
**Scope:** nine issues raised after the project↔finance spine work shipped
**Related:** [project–finance spine audit](pymble-ops-project-finance-spine-audit.md)

---

## 0. First: is the previous work complete?

**Yes.** Verified against the repository and the live database:

- Working tree clean, in sync with `origin/main` — the spine work is committed
  and pushed.
- All 10 new library modules present on disk (`cost-codes.ts`,
  `budget-availability.ts`, `procurement-fulfilment.ts`,
  `procurement-controls.ts`, `call-off-actions.ts`, `three-way-match.ts`,
  `schedule-variance.ts`, `finance-leaks.ts`, `variation-candidates.ts`,
  `/ops/cost-codes`).
- All 19 migrations present and applied remotely.
- Live reconciliation still reads clean: 53 library codes with **0 unmapped to
  a GL account**, 21/21 budget lines and 20/20 cost entries coded, 0 live
  requests without a budget line, 0 sites with more than one open budget.

The one deliberate open item remains the **suspected K2.8m duplicate** on site
0001, which now has a UI to resolve.

So: that chapter is closed. Everything below is new ground.

---

## 1. Executive summary

Nine issues, and they are not nine independent problems. They fall into three
groups, and the grouping matters because it changes the fix order:

**A. One broken link causes three of the symptoms.**
`employees.user_id` is the join between a person's HR record and their login.
**6 of 22 employees have no link, and 5 of 17 active users have no employee
record.** There is a dropdown to set it when an employee is *created* and
**no way to set it afterwards** — on the edit form it is a hidden field that
just re-submits the existing value. That single gap explains why staff cannot
see their payroll (§5), and it is the thing §2 asks for directly.

**B. Two performance problems share one cause.**
77 of 81 ops pages are `force-dynamic` with essentially no caching, and the
heaviest pages issue **37, 24 and 17 server queries per render**. On top of
that, `OpsRealtimeRefresh` is mounted on **37 pages** and calls
`router.refresh()` on every relevant database row change — re-running the whole
query fan-out for every viewer. That is the Vercel CPU burn (§8), and it is
also why the app is unusable offline (§7): there is no cached shell to fall
back to.

**C. Notification volume is a key-design bug, and it is measurable.**
**6,935 notifications exist; only 852 are distinct. 6,083 (88%) are redundant
copies, and 6,509 (94%) carry a date inside their idempotency key.** The
dedupe mechanism works perfectly — it is being handed a key that is designed to
change daily.

The remaining items (module grouping, IT provisioning, payroll email) are
smaller and independent.

### Severity and effort at a glance

| § | Issue | Severity | Effort | Root cause is |
| --- | --- | --- | --- | --- |
| 9 | Notification duplication | **High** | Low | Key design |
| 2 | Staff account linking | **High** | Low | Missing edit control |
| 5 | Staff can't see payroll | **High** | Low | Same as §2 |
| 11 | Submit loses your place | **High** | Low–Med | Redirect pattern |
| 8 | Vercel CPU cost | **High** | Medium | Architecture |
| 12 | Interface feels static | Medium | Medium | No feedback layer |
| 6 | IT can't provision staff | Medium | Low | Permission list |
| 10 | Payroll email + payslip | Medium | Low–Med | Never built |
| 3 | Avatars | Medium | Medium | Never built |
| 7 | Offline doesn't work | Medium | **High** | Architecture |
| 4 | Module grouping | Low | Low | Taxonomy drift |

### A fourth shared cause, added after the first pass

**D. There is no in-between state.** Every mutation is submit → full redirect →
full re-render. That single pattern produces three of the complaints at once:
it loses your page and filters (§11), it gives no sense of responsiveness
because nothing indicates work is happening (§12), and it re-runs the entire
query fan-out on every save (§8). Fixing how a form result is applied fixes all
three, which is why §11 and §12 should be worked alongside §8 rather than after
it.

---

## 2. Staff account linking (the keystone issue)

### What's wrong

`employees.user_id` exists and is a proper FK. The **create employee** form
offers a "Staff user link" dropdown
([employees/page.tsx:1249](<../src/app/ops/(workspace)/employees/page.tsx>:1249)).

The **edit employee** form does not
([employees/page.tsx:2295](<../src/app/ops/(workspace)/employees/page.tsx>:2295)):

```tsx
<input name="user_id" type="hidden" value={employee.user?.id ?? ""} />
```

It is a hidden field that re-submits whatever is already there. **An employee
created without a link can never be linked**, and a link can never be corrected
or removed, through any screen in the system.

### Live impact

| | |
| --- | --- |
| Employees | 22 |
| Linked to a user account | 16 |
| **Not linked** | **6** |
| Active users | 17 |
| **Active users with no employee record** | **5** |

Those 6 people cannot see their own payslip, cannot use any self-service
feature keyed on the employee record, and are invisible to anything that walks
`user → employee`.

### Recommendation

A **Staff account link** section in employee details, gated to
**HR + Managing Director + Developer** as requested — note this is *narrower*
than the existing `canManageStaff` (which also includes General Manager), so it
needs its own permission rather than reusing that one.

Three things worth building in:

- **Show the unlinked both ways.** A "6 employees not linked · 5 users with no
  employee record" banner, because the gap is invisible today until someone
  complains their payslip is missing.
- **Warn on suspected matches.** Match on email and name to *suggest* a link;
  never auto-link — attaching the wrong person to a payroll record is a privacy
  breach, not a data-quality issue.
- **Enforce one-to-one.** A user should not be linkable to two employees. There
  is no unique constraint on `employees.user_id` today; add one.

---

## 3. Profile avatars

### What's wrong

**Nothing exists.** The `users` table is `id, full_name, role, phone, email,
is_active, created_at, updated_at` — there is no avatar column, and no
`avatar`/`photo_url` reference anywhere in `src/lib/ops` or in any migration.
`src/components/ui/avatar.tsx` is the unused shadcn primitive.

### Recommendation

Small but touches several surfaces, so worth sequencing:

1. `users.avatar_url` (text, nullable) + upload to the existing **private R2**
   bucket (`src/lib/ops/r2.ts`) — the same path documents and site photos
   already use, so no new infrastructure.
2. Validate on upload with the existing `upload-validation.ts` helper; cap
   dimensions and re-encode, because an unbounded original will be fetched on
   every timeline row.
3. Serve through an authenticated route like the document download route —
   avatars are staff photographs and should not sit on a public URL.
4. A shared `<OpsUserBadge>` rendering avatar + name + role, then replace the
   name/role text in the activity timeline, comment threads, approvals and the
   top bar with it. Doing it as one component is what stops this becoming five
   slightly different avatar treatments.
5. **Fallback matters more than the image:** initials on a deterministic colour
   from the user id, so a workspace where nobody has uploaded a photo still
   reads as distinct people.

---

## 4. Module grouping in the sidebar

### What's wrong

Eleven groups, unevenly filled, with a clear junk drawer:

| Group | Count | Problem |
| --- | --- | --- |
| IT | 12 | Fine — a genuine module set |
| Finance | 11 | Six statutory statements sit flat beside operational screens |
| Operations | 10 | Mixes the workspace root, master data, and **personal** items |
| **Records** | **9** | **Junk drawer** — holds Settings, Get IT Help, IT Policies |
| Fleet | 2 | Thin |
| Executive | 2 | Thin |

Concrete mis-placements:

- **Material Schedule sits in Commercial.** It is the material plan that drives
  procurement and the project budget — everything the spine work connected it
  to lives in Procurement and Finance. Users already call it "material
  schedule", not a BOQ. It belongs with Procurement (or a Planning group).
- **Settings is in Records.** It is administration, not a record.
- **Get IT Help** and **IT Policies & Guides** are in Records while a
  twelve-item IT group exists.
- **Personal surfaces are scattered**: My Sites and My Conversations under
  Operations, Get IT Help under Records, Notifications under Operations,
  profile off-menu entirely. There is no "me" grouping.
- **Overview** is listed inside Operations though it is the workspace root.

### Recommendation

Restructure around **what the user is doing**, not which department owns the
table:

1. Add a **My Workspace** group at the top: Overview, My Sites, My
   Conversations, Notifications, My Profile (incl. payslips, §5), Get IT Help.
   This alone fixes most of the "doesn't make sense" feeling — personal items
   currently sit in four different departments.
2. Move **Material Schedule → Procurement and Stores**.
3. Move **Settings → Administration** (with Staff, and the cost-code library
   once §6 lands).
4. Move the two IT self-service entries into the IT group.
5. Nest the six statutory statements under a **Financial Statements** subgroup
   so Finance reads as five working screens plus a statements folder.
6. Consider folding **Executive** and the seven per-department report entries
   into a single **Reports** group — right now report links are duplicated
   across nearly every group.

Two implementation notes: the nav is data-driven from `OPS_MODULES` /
`OPS_MODULE_GROUPS` in `constants.ts`, so this is a data change, not a UI
rewrite — and the `nav module icon coverage` test will hold you to giving any
new group's modules icons.

---

## 5. Staff cannot see their approved payroll

### What's wrong

The self-service path **already exists and is correct**. `fetchMyStaffPayslips`
([staff-payroll.ts:307](../src/lib/ops/staff-payroll.ts:307)) is surfaced on
`/ops/profile`, and the release gate is right:

```ts
export const SELF_SERVICE_RUN_STATUSES = new Set([
  "approved", "disbursing", "completed",
]);
```

Approved payslips *are* meant to be visible. But the function opens with:

```ts
const { data: employee } = await supabase
  .from("employees").select("id").eq("user_id", profile.id).maybeSingle();
if (!employee) {
  return [];
}
```

**No employee link ⇒ silently returns an empty list.** This is §2 wearing a
different hat.

Two secondary factors:

- Only **1 of 16 payroll runs is `approved`** (15 are `draft`), so even linked
  staff have almost nothing to see. Worth confirming with Finance whether runs
  are actually being approved or are stalling in draft.
- The empty state is indistinguishable from "you have no payslips". A user with
  no link sees the same screen as a genuine new starter.

### Recommendation

1. Fix §2 — that restores visibility for the 6 unlinked employees.
2. **Make the empty state diagnostic**: if the signed-in user has no employee
   record, say so and point them at HR, rather than rendering a blank list.
   Silence here is what turned a data gap into a reported bug.
3. Notify on release: when a run is approved, queue a notification to each
   linked employee (there is already a `staff-payslip-released:${row.id}` key,
   so some of this exists — verify it fires and reaches the employee, not just
   Finance).
4. Consider surfacing payslips at a top-level **My Payslips** entry under the
   proposed My Workspace group; buried inside the profile page is discoverable
   only if you already know it is there.

---

## 6. IT cannot assign staff to the system

### What's wrong

Straightforward and confirmed:

```ts
export function canManageStaff(role: OpsUserRole) {
  return isDeveloperRole(role) || isManagingDirectorRole(role)
    || isGeneralManagerRole(role) || isHumanResourceRole(role);
}
```
([permissions.ts:21](../src/lib/ops/permissions.ts:21))

`it_manager` is absent — so IT cannot create staff accounts. It is also absent
from `OPS_STAFF_ROLES`, so **IT cannot even see the Staff module** in the
sidebar.

This is inconsistent with how the rest of the IT module is built: IT already
owns asset assignment, access requests, licences and credentials — every part
of onboarding *except* creating the account itself.

### Recommendation

1. Add `it_manager` to `OPS_STAFF_ROLES` (visibility) and to `canManageStaff`
   (action).
2. **Bound what IT may grant.** `canCreateStaffRole` already restricts which
   roles a given actor may create; IT should be able to create operational
   roles but **not** `managing_director`, `owner`, `developer`, or finance
   roles. Account creation is privilege granting — an IT manager who can mint
   an MD account has more power than the MD.
3. Have IT provisioning and the §2 employee link meet: the natural flow is
   HR creates the employee record, IT creates the login, and one of them links
   the two. Whoever acts second should be prompted to complete the link.

---

## 7. Offline does not work

### What's wrong

More is built here than it appears — and that is precisely the problem, because
the parts do not add up to a working whole.

**What exists:** a real Serwist service worker (`src/app/sw.ts`, built to
`public/sw.js`), registered in production only via `OpsServiceWorker.tsx`; an
IndexedDB outbox (`src/lib/ops/offline/outbox.ts`) with
`enqueue/replay/flushOutbox`; offline API routes for **four** flows —
attendance, daily site reports, photos, QA checklists; a `/ops/offline`
fallback page; and `OpsSyncIndicator` which calls `flushOutbox()`.

**Why it still fails:**

1. **Only 4 of ~81 screens have any offline write path.** Everything else —
   material requests, approvals, procurement, HSE — is server-action-only and
   simply fails with no network. "Operations continue offline" is not what was
   built; "four field forms queue offline" is.
2. **There is no offline *read*.** 77 of 81 pages are `force-dynamic`, so
   there is no static shell. The service worker's `defaultCache` can only serve
   a page the user has already visited on that device, and any navigation it
   cannot serve lands on the `/ops/offline` stub — which is why it feels like
   nothing works.
3. **Replay is owned by the page.** `flushOutbox` runs from `OpsSyncIndicator`;
   the SW deliberately does not intercept POSTs (a defensible choice — it keeps
   failures visible). But it means **queued work only syncs if the user
   reopens the app**. There is no Background Sync registration.
4. The SW comments record an earlier incident where cached HTML was poisoned by
   per-request nonce CSP headers, with a one-time cache purge on activation.
   Worth confirming that purge actually ran on installed devices before
   assuming caching is healthy.

### Recommendation

This is the **highest-effort item** and should not be attempted as a single
push. Decide the ambition first:

**Option A — honest, small (recommended first).** Keep offline scoped to field
data capture, and make it trustworthy: add Background Sync so the outbox
drains without the user reopening the app; show queued-item count and per-item
failure clearly; and relabel the offline page to say plainly which four things
work offline. Most of the current pain is the mismatch between the promise and
the four supported flows.

**Option B — genuine offline reads.** Requires an offline-first data layer
(cache a per-user snapshot of assignments, sites, open requests into IndexedDB;
render from it; reconcile on reconnect). That is a substantial architectural
change and it conflicts with the current `force-dynamic` SSR model — do not
start it without deciding §8 first, since the two share the same root.

**Do not** attempt Option B for all 81 screens. Pick the field-critical set —
my sites, today's attendance, open material requests, site checklists — and
make those work properly.

---

## 8. Vercel fluid CPU is high

### What's wrong

Three multiplying factors:

**1. Everything is dynamic.** 77 of 81 ops pages declare
`export const dynamic = "force-dynamic"`. There is exactly **one**
`export const revalidate` and essentially **no** `unstable_cache` usage in the
ops library. Every page view is a cold full render.

**2. Query fan-out per render is very high.**

| Page | Server fetches per render |
| --- | --- |
| `/ops/commercial` | **37** |
| `/ops/finance` | **24** |
| `/ops/employees` | **17** |

**3. Realtime multiplies both.** `OpsRealtimeRefresh` is mounted on **37
pages**. It subscribes to Postgres row changes and calls `router.refresh()`,
which **re-executes the entire server render** — all 37 queries on the
commercial page — for **every viewer with the page open**, on every relevant
row change.

That third point is the amplifier: one material request update can trigger a
24–37-query re-render for every user currently on an affected page. Cost scales
with `writes × concurrent viewers × queries per page`, which is exactly the
shape of a fluid-CPU bill that grows faster than headcount.

### Recommendation

In order of return-on-effort:

1. **Debounce and narrow realtime.** Check the existing debounce (a 500ms
   window is referenced in the component) and raise it substantially; scope
   each page's subscription to the narrowest table set; and consider refreshing
   only when the tab is visible. Several pages likely subscribe to tables they
   only display a count from.
2. **Stop refreshing the whole page.** Replace `router.refresh()` with targeted
   revalidation of the affected segment, or move the live counters to a small
   client fetch, so a row change costs one query rather than thirty-seven.
3. **Cache the expensive, slow-moving reads.** Chart-of-accounts, cost-code
   library, site options, supplier options and module registries change rarely
   and are fetched on nearly every page. `unstable_cache` with tag-based
   invalidation on those alone would remove a large share of the queries.
4. **Split the dashboard pages.** `/ops/commercial` at 37 fetches should stream
   its panels via Suspense so the page paints on the first few and the rest
   arrive independently — this also fixes perceived slowness.
5. **Re-examine `force-dynamic` case by case.** Many of the 77 are dynamic
   because of `requireOpsUser()`, not because their data must be fresh
   per-request. Some can move to short `revalidate` windows.
6. **Measure before optimising further.** Vercel's per-route CPU breakdown will
   confirm whether the cost is concentrated in the few heavy dashboards (likely)
   or spread evenly (which would point elsewhere).

---

## 9. Notifications repeat endlessly

### What's wrong

This is the clearest-cut item in the audit, and the numbers are stark:

| | |
| --- | --- |
| Total notifications | **6,935** |
| Distinct (recipient + source + title) | **852** |
| **Redundant copies** | **6,083 (88%)** |
| Idempotency keys containing a date | **6,509 (94%)** |
| Notifications with no idempotency key | 0 |
| Unread | **5,364** |

**The dedupe mechanism is not broken.** `queueOpsNotification` upserts with
`onConflict: "idempotency_key"`, and every notification has a key. The bug is
that **the keys are built to change**:

```ts
// escalations.ts — buildOpsEscalationIdempotencyKey
return ["ops-escalation", sourceTable, sourceId, reason, dateKey, recipientId].join(":");
//                                                        ^^^^^^^ changes daily
```

Six cron sweeps run daily (`vercel.json`). Every sweep that finds the same
unresolved item mints a **new** key because the date is part of it — so one item
left unresolved for 30 days produces 30 notifications per recipient. Same
pattern in `it-escalations.ts:92` (`${keyPrefix}:${today}:${recipientId}`) and
`project-task-overdue:${today}:...`.

**One of these is mine and is worse than the rest.** In the procure action I
wrote:

```ts
idempotencyKey: `material-request-unmet:${request.id}:${nowIso}:${recipient.id}`
```

`nowIso` is a full timestamp, so that key is unique on **every single
invocation** — it can never dedupe at all. That is a defect I introduced and it
should be fixed with the others.

### Recommendation

The goal is *"tell me once, and tell me again only when something changes"*.

1. **Remove the date from escalation keys.** Key on
   `(source, reason, recipient)` only. The upsert then updates the existing
   row's title/body in place — the notification stays current without
   multiplying. Note the existing upsert does **not** reset `read_at` /
   `archived_at`, so a re-fire will not resurrect something the user dismissed;
   if re-surfacing *is* wanted after N days, that should be an explicit,
   deliberate rule rather than a side effect of a date in a string.
2. **Fix `material-request-unmet`** — drop `nowIso`.
3. **Escalate by changing severity, not by repeating.** If an item is still
   unresolved after a threshold, update the same notification and raise its
   category, and only then notify a *different* (more senior) recipient. That
   is the behaviour people actually want from an escalation engine.
4. **Digest the routine.** Daily sweeps should produce one "12 items need your
   attention" summary per recipient, not 12 notifications. Only genuinely
   urgent single events should stand alone.
5. **Clean up the existing 6,083.** A one-off consolidation keeping the newest
   per `(recipient, source_table, source_id, title)`. Worth doing — 5,364
   unread is past the point where anyone reads any of them, which makes every
   notification in the system worthless, including the important ones.
6. **Add a guard test** asserting no idempotency key contains a date or
   timestamp pattern. This is a bug class that will otherwise return.

---

## 10. Payroll email with payslip attached

### What's wrong

**Not built.** `src/lib/ops/email.ts` contains exactly one outbound email type:
critical HSE alerts. There is no payroll or payslip email.

Everything needed already exists, though:

- **Resend** is the provider and is configured (`isOpsEmailConfigured()`),
  with `OPS_EMAIL_FROM` / `RESEND_API_KEY`. Resend supports attachments
  natively.
- **Payslip PDFs already render**: `src/lib/ops/pdf/StaffPayslipPdf.tsx` and
  the route `/api/ops/pdf/staff-payslip`.
- **Delivery is already auditable**: `recordOpsEmailDeliveryEvent` and the
  HSE email observability pattern give a template for logging sends.
- **Employee emails exist** on `employees.email`.

So this is genuinely a wiring job, as you expected.

### Recommendation

1. Trigger on the **disbursed / paid** transition rather than approval — an
   email saying "your payslip is ready" that arrives before the money is a
   support call. (Approval can drive the in-app notification; payment drives
   the email.)
2. Render the existing `StaffPayslipPdf` server-side per payslip and attach it.
3. **Send per employee, never in bulk** — one payslip per email, to
   `employees.email`, with no other recipient. A single mis-addressed batch is
   a payroll data breach.
4. **Record every send** via `recordOpsEmailDeliveryEvent`, and show Finance a
   per-run delivery summary (sent / failed / skipped-no-email). Payroll email
   silently failing for one person is worse than not sending at all.
5. **Handle the gaps explicitly**: employees with no email address, and the
   6 unlinked employees from §2. Report them rather than skipping quietly.
6. Consider whether the PDF should be password-protected (NRC or employee
   number). Email is not a secure channel and payslips carry NRC, TPIN,
   NAPSA and bank details.
7. Make it **idempotent per (run, employee)** so a re-run or retry cannot send
   the same payslip twice — the same discipline §9 is about.

---

## 11. Submitting a form throws away where you were

### What's wrong

Every server action in the workspace ends the same way:

```ts
revalidatePath(ROUTE);
redirect(`${ROUTE}?updated=something#anchor`);
```

That `redirect` rebuilds the URL **from scratch**. Any state that lived in the
query string — `page=3`, `q=cement`, `status=approved`, the selected site — is
silently dropped, because it was never carried into the new URL.

| | |
| --- | --- |
| `redirect(...)` calls in server actions | **363** |
| That preserve list state (`page` / `q` / `status`) | **0** |
| Action files using the `safeOpsReturnTo` helper | **3** of ~40 |

So the behaviour you described is not an edge case — it is the *only* behaviour
the system has. Edit something on page 3 of a filtered list and you land on
page 1, unfiltered, every time.

Two details make it feel worse than it is:

- Many redirects append an anchor (`#mr-${id}`), which is a genuine attempt to
  return you to the record — but the anchor cannot resolve, because after the
  reset to page 1 that record is usually not on the page any more.
- `revalidatePath(ROUTE)` invalidates the **entire route**, so the full server
  render re-runs — 37 queries on the commercial page — rather than just the
  changed record. This is the same amplifier described in §8.

A helper already exists — `safeOpsReturnTo(value, fallback)` in
`src/lib/ops/return-paths.ts` — and is used by exactly three action files
(notifications and HR). The pattern was established and then not adopted.

### Recommendation

Three levels, and they are worth doing in this order because each is useful on
its own:

**1. Preserve the list state (small, mechanical, fixes the reported bug).**
Carry the current query string into the action as a hidden `return_to` field,
validate it with the existing `safeOpsReturnTo`, and redirect back to it with
the `updated=` flag merged in rather than replacing it. This is a repetitive
but low-risk change across the action files, and it is the whole fix for
"it takes me back to page 1".

**2. Stop full-page redirects for in-place edits (the real fix).**
Most of these actions do not need to navigate at all. Returning a result from
the action and letting the client update in place — `useActionState` with
`useTransition`, or a router refresh scoped to the affected segment — keeps the
user exactly where they are, keeps scroll position, and removes the jump
entirely. Redirect should be reserved for actions that genuinely change context
(creating a record you should now be looking at, deleting the thing you were on).

**3. Narrow the revalidation.** `revalidatePath` on a whole dashboard route is
heavy. Tag-based revalidation of just the affected data lets an edit update one
panel instead of re-running the page. This overlaps directly with §8 — do them
together, since the same change buys both responsiveness and CPU.

One caution: this pattern is load-bearing for progressive enhancement — the
current forms work without JavaScript, which matters on site. Step 2 should
**degrade** to today's redirect behaviour when JS is unavailable rather than
replacing it outright.

---

## 12. The interface does not feel dynamic, calm or modern

### What's wrong

This is a fair reading, and the causes are specific rather than a matter of
taste. The workspace has **no feedback layer**:

| Signal | Count | Should be |
| --- | --- | --- |
| `loading.tsx` files | **2** for 81 pages | Most routes |
| `Suspense` boundaries in `/ops` | **0** | Every multi-panel dashboard |
| Files with a pending state (`useFormStatus` / `useTransition` / `isPending`) | **3** | Every submitting form |
| Toast / transient notification system | **none installed** | One |
| `<details>` blocks used as the primary disclosure | **161** | Sparingly |
| Animation / transition tokens in the ops UI kit | **2** | A small motion scale |
| `prefers-reduced-motion` handling | **0** | Required if motion is added |
| `dark:` variants in the ops token file | **7** | Consistent coverage |

Put together, this is exactly what "not dynamic, not calm" feels like in
practice:

- **Every interaction is a full page load.** Press a button, the screen freezes
  with no indication anything is happening (3 files have pending states), then
  the whole page replaces itself and you have lost your place (§11). There is
  no in-between state anywhere in the system.
- **The heaviest pages have nothing to show while they load.** With 0 Suspense
  boundaries and 2 loading files, `/ops/commercial` waits on all 37 queries
  before painting anything. The user sees a blank or stale screen for the full
  duration of the slowest query.
- **Feedback arrives as a page-level banner via the URL.** Success and error
  are communicated by `?updated=` / `?error=` query params rendering a notice
  strip at the top — so confirmation of an edit you made at the bottom of a
  long page appears somewhere you are not looking, after a jump.
- **161 native `<details>` blocks** carry most of the forms. They have no
  animation, no focus management, and no memory — they snap open and shut, and
  they all close again on every redirect. This is the single biggest contributor
  to the "not modern" feel, and it compounds §11: you reopen the same accordion
  after every save.
- **Dark mode is partial.** Seven `dark:` variants in the shared token file
  means most surfaces are styled for light only, and components I added recently
  had to hand-roll their dark variants — a sign the tokens are not carrying it.

Worth stating clearly: there **is** a documented design system
([pymble-ops-design-system.md](pymble-ops-design-system.md), 1,142 lines) and a
shared token layer in `src/lib/ops/ui.ts`. The problem is not absence of
direction — it is that the system covers colour, spacing and typography but has
nothing to say about **motion, loading, or transient feedback**, so each screen
improvises or omits them.

### Recommendation

Ordered so that the earliest items give the largest perceived improvement:

**1. Add a feedback layer (highest impact, lowest effort).**
Install one toast system and use it for every action result instead of
`?updated=` banners. Combined with §11 step 2, an edit becomes: button shows a
spinner → row updates in place → toast confirms. No jump, no lost place, no
hunting for a banner. This one change is most of what "dynamic and calm" means.

**2. Give every form a pending state.** `useFormStatus` on the submit button —
disabled, spinner, "Saving…". Three files have this today; it should be a
property of the shared button component so it is impossible to omit.

**3. Stream the dashboards.** Wrap each panel on the heavy pages in `Suspense`
with a skeleton. `/ops/commercial` then paints immediately and fills in as its
37 queries land, instead of showing nothing for the duration of the slowest.
This is also the cheapest perceived-performance win available and it needs no
data changes.

**4. Add `loading.tsx` per route group** with a skeleton matching the page's
shape, so navigation never shows a dead screen.

**5. Replace `<details>` for forms with a real disclosure component** that
animates height, manages focus, and — importantly — **remembers its open state
across a save**. Keep native `<details>` for genuinely static content.

**6. Define a motion scale in the design system**: two or three durations, one
easing curve, and a `prefers-reduced-motion` rule that disables all of it.
Motion should be added *as a documented token set*, not per component, or it
will drift the way the colour classes did before the status-tone registry.

**7. Finish dark mode in the tokens**, so components stop hand-rolling
`dark:` variants.

**On sequencing:** items 1–4 are additive, low-risk, and independent of the
architectural work. Item 3 in particular should be done *with* §8, since
Suspense streaming and narrowed revalidation are the same conversation about
how these pages render.

---

## 13. Suggested order of work

Sequenced by dependency and return, not by the order raised:

**First — cheap fixes with disproportionate effect**
1. §9 notification keys (including my `material-request-unmet` defect) + the
   6,083-row cleanup. One day's work; makes the whole notification system
   trustworthy again.
2. §2 staff account linking, with the diagnostic empty state from §5. Unblocks
   6 employees and closes §5 almost entirely.
3. §11 step 1 — carry `return_to` through the actions so a save stops throwing
   you back to page 1. Mechanical, low risk, and it removes the single most
   irritating thing about using the system daily.
4. §6 IT provisioning permissions — a permission-list change plus role bounds.

**Second — how it feels (do §11 and §12 together)**
5. §12 items 1–2: a toast system and pending states on every submit button.
6. §11 step 2: return results from actions and update in place instead of
   redirecting. With step 5 this is the whole "dynamic and calm" change —
   spinner, in-place update, toast, no jump.
7. §12 items 3–4: Suspense streaming and `loading.tsx` skeletons on the heavy
   dashboards.

**Third — visible feature work**
8. §4 module regrouping (data-only change in `constants.ts`).
9. §10 payroll email — wiring, with the privacy safeguards above.
10. §3 avatars — schema, upload, one shared badge component.
11. §12 items 5–7: real disclosure component, motion scale, dark-mode tokens.

**Fourth — architectural, needs a decision before code**
12. §8 Vercel CPU. Start with realtime debouncing and caching the slow-moving
    reads; measure before going further. Note that §11 step 3 (narrowed
    revalidation) is part of this.
13. §7 offline. **Decide Option A or B first** (§7). It shares a root cause with
    §8, so do §8's measurement first — the answer will shape what offline can
    realistically look like.

A note on grouping: §11 and §12 are listed separately from §8 for clarity, but
they are the same architectural conversation about how a mutation is applied
and rendered. Doing them in isolation risks doing the work twice.

---

## Appendix — evidence

All figures queried live from Supabase project `zuezxgyhhrhklrhqsvvs` and the
repository at `origin/main`, 2026-07-31.

| Check | Value |
| --- | --- |
| Employees / linked / unlinked | 22 / 16 / **6** |
| Active users / without employee record | 17 / **5** |
| Notifications total / distinct / redundant | 6,935 / 852 / **6,083** |
| Notification keys containing a date | **6,509 of 6,935** |
| Unread notifications | 5,364 |
| Ops pages / `force-dynamic` | 81 / **77** |
| `export const revalidate` occurrences | **1** |
| Pages mounting `OpsRealtimeRefresh` | **37** |
| Server fetches: commercial / finance / employees | **37 / 24 / 17** |
| Staff payroll runs (approved / draft) | 1 / 15 |
| Payslip rows | 150 |
| Offline-capable write flows | **4** (attendance, DSR, photos, QA checklists) |
| Outbound email types implemented | **1** (critical HSE alert) |
| `users` avatar column | **none** |
| `it_manager` in `canManageStaff` | **no** |
| `redirect()` calls in server actions | **363** |
| …that preserve `page` / `q` / `status` | **0** |
| Action files using `safeOpsReturnTo` | **3** of ~40 |
| `loading.tsx` files / ops pages | **2 / 81** |
| `Suspense` boundaries in `/ops` | **0** |
| Files with a submit pending state | **3** |
| Toast system installed | **none** |
| `<details>` blocks across ops pages | **161** |
| Motion tokens in `ui.ts` / reduced-motion rules | **2 / 0** |
| `dark:` variants in the ops token file | **7** |
