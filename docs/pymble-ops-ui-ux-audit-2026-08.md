# Pymble Ops — UI/UX audit (2026-08-10)

Scope: the whole `/ops` workspace — 84 pages, 47 of them `force-dynamic`.
This audit explains the four symptoms reported by the user, in their words:

> most UI feel very blunt and repetitive · some things are not collapsible making
> it hard to navigate · some are not having next page which is stall and when
> next page is clicked it doesn't stay on page and load dynamically, it fails ·
> some fields are overlayed in sections

Each is a real, locatable defect rather than a matter of taste. They share two
root causes: **the page is the unit of everything** (one server component
renders every section and re-queries all of it on any interaction), and **the
list and form primitives were built for one shape and are being used for many.**

---

## 1. "Next page doesn't stay on page, and it fails"

All list pagination goes through `OpsPaginationControls` in
[src/components/ops/OpsListControls.tsx](../src/components/ops/OpsListControls.tsx).

### 1a. Every query param that isn't `q`, a declared filter, or `page` is discarded

`buildPageHref` (line 44) constructs the Next/Previous href from an empty
`URLSearchParams` and re-adds only three things: `q`, the filters the caller
declared, and `page`. Anything else the page read from `searchParams` is gone
after one click — the open tab, a date range, `dept`, `scope`, a `status` the
page parses directly instead of declaring as a filter, and any `#run-…` anchor.

The same bug exists on the way in: `OpsListControls` (line 80) is a plain GET
`<form>` carrying only `q` and its declared `<select>`s, with no hidden inputs
for the rest. So **searching also resets state the user set two clicks ago.**
This is the "363 redirects that discard your page/filters" finding from the
2026-07-31 platform audit, resurfacing in the list controls themselves.

### 1b. Next scrolls you to the top of a 2,000-line page

The Next/Previous links are plain `<Link>`s with no `scroll={false}` and no
fragment. Next.js restores scroll to the top on navigation. On
`/ops/hse-compliance` the paginated PPE list starts at line 1,940 of a
2,299-line page; on `/ops/employees` it is line 2,835 of 2,845. Clicking Next
therefore lands the user at the top of the page, several screens above the list
they were reading. That is exactly "it doesn't stay on page".

### 1c. Paging re-runs the entire page

Because these pages are single `force-dynamic` server components, `?page=2`
re-executes *every* fetch on the page, not just the list's. `/ops/commercial`
awaits 7 top-level data bundles; `/ops/employees` and `/ops/hse-compliance` 5
each, most of them multi-query. Under a slow connection this reads as a hang and
can time out — the "it fails" half of the report.

### 1d. Most modules have no pagination at all

Only 23 pages use `parseOpsListState`. The rest fetch everything or silently
truncate:

| Module | Behaviour today |
| --- | --- |
| `/ops/workers` | `fetchOpsWorkers()` — no limit, no search, no filter |
| `/ops/site-checklists` | `fetchOpsQaChecklistRuns({ limit: 30 })` — hard cap, no "more" |
| `/ops/attendance`, `/ops/photos`, `/ops/staff`, `/ops/payroll`, `/ops/project-schedule` | full fetch |

`fetchOpsQaChecklistStats()` is worse than unpaginated: it pulls **200 full
runs, all their items, and every site photo row** to compute four KPI numbers,
on every render of the page ([qa-checklists.ts:213](../src/lib/ops/qa-checklists.ts)).
`fetchOpsQaChecklistRun(id)` does the same 200-run fetch to find one record, and
it runs on every checklist mutation.

---

## 2. "Fields are overlayed in sections"

Two causes, both mechanical.

### 2a. No `min-w-0` anywhere in the workspace

There are **82** form grids at 4–6 columns across `/ops`, and **zero** uses of
`min-w-0` on a field wrapper. CSS grid *items* default to `min-width: auto`,
which means an item refuses to shrink below its own intrinsic width and
overflows its track instead. A `<select>` whose longest option is a full site
label, or an input with a long `defaultValue`, therefore spills out of its
column and over the field next to it. `OPS_INPUT_CLASS` carries `w-full`, which
does not help — the control is already sized to the track; it is the item's
minimum being violated. (Tailwind's `grid-cols-N` pins tracks at
`minmax(0,1fr)`, so the track is not the culprit — the item is.)

Worst offenders are the 6-column forms: the Add-worker form
([workers/page.tsx:114](<../src/app/ops/(workspace)/workers/page.tsx>)) puts nine
fields including two site-labelled selects into `lg:grid-cols-6`.

### 2b. `OpsListControls` hardcodes exactly two filters

Its grid is `lg:grid-cols-[minmax(0,1fr)_repeat(2,minmax(10rem,14rem))_auto]`
with the search label spanning 2 tracks — a layout that only balances when the
caller passes exactly 2 filters. Pages passing 1 or 3+ get a ragged second row
with the buttons stranded under the search box.

---

## 3. "Not collapsible, hard to navigate"

45 files use `<details>`, but always for a *secondary* panel (an edit form, an
override box). The primary content is always fully expanded:

- **`/ops/site-checklists`** renders up to 30 checklist runs, each with its full
  item list and a 4-field form *per item*. A site with three active checklists
  of ~15 items each is a single page of ~45 inline forms with no way to fold a
  finished one away.
- **`/ops/workers`** renders a complete 9-field edit form for every worker row.
- The mega-pages stack 6–12 equally-weighted bordered cards with no hierarchy,
  no collapse, and no in-page navigation.

There is also no shared collapsible primitive: every `<details>` is hand-rolled,
so the affordance (chevron or not), the open/closed styling, and the focus
treatment differ page to page, and open state is never remembered across the
redirect that every server action performs.

---

## 4. "Blunt and repetitive"

Structural, not cosmetic:

1. **Everything is a bordered card of the same weight.** Page header, KPI strip,
   create form, list — all `rounded-lg border border-border bg-card`, same
   radius, same border, same padding. Nothing signals what matters.
2. **29 of 84 pages hand-roll their header** instead of using `OpsPageHeader`
   (`/ops/workers` is one — bespoke eyebrow + `h1` + inline stat tiles).
3. ~~Carried over from the 2026-07-06 consistency pass: ~58 bespoke
   `statusClass` functions and 73 files on legacy colour literals.~~
   **Wrong — that was a stale note.** Verified 2026-08-10: zero bespoke
   `statusClass` functions remain, `text-primary-dark` is gone, and `bg-white`
   survives in 2 places. That migration finished on 2026-07-06. What *is*
   outstanding from it is the header work in Phase 5 item 11.
4. Every mutation is a full server-action POST + redirect + full page re-render,
   so the workspace never feels responsive — there is no optimistic or partial
   update anywhere.

---

## 5. What to do, in order

Ordered by (user pain × blast radius) ÷ effort. Phases 1–2 are shared-primitive
work that fixes many pages at once; nothing below requires a redesign.

### Phase 1 — list plumbing (fixes 1a, 1b, 2b everywhere at once)

1. `buildPageHref` takes the **full** incoming `searchParams` and mutates only
   `page`, preserving unknown params; add an optional `anchor` so Next returns
   to the list, and `scroll={false}` on the links.
2. `OpsListControls` renders hidden inputs for every incoming param it does not
   own, so searching preserves the rest of the URL state.
3. Make the controls grid track the actual filter count (`repeat(auto-fit,…)`).
4. Reset `page` to 1 whenever the query or a filter changes (currently implicit
   and only correct by accident).

### Phase 2 — form/field primitives (fixes 2a everywhere at once) — **DONE 2026-08-10**

5. ~~Add `min-w-0` to the shared field wrapper and introduce `OpsFormGrid` /
   `OpsField` so field layout stops being retyped per page; cap desktop density
   at 3–4 tracks.~~

Shipped as: `min-w-0` on `OPS_LABEL_CLASS` (one line, fixes the overflow in
every form at once); `OPS_FORM_GRID_CLASS` + `OpsFormGrid` / `OpsField` in
`src/components/ops/OpsForm.tsx`, with the Add-worker form as the reference use;
65 form grids capped from 5–6 tracks to 4 across 36 files, and the 79 child
`col-span-5/6` inside them re-pointed to 4 (a `col-span-6` in a 4-track grid
does not clamp — it creates two implicit columns). `tests/ops-form-layout.test.ts`
is a source-level guard so none of it drifts back.

### Phase 3 — progressive disclosure (fixes 3) — **MOSTLY DONE 2026-08-10**

6. ~~Add an `OpsCollapsible` primitive (chevron, consistent focus ring, `open`
   controlled by URL so it survives the action redirect).~~ Shipped as
   `src/components/ops/OpsCollapsible.tsx` — two variants (`panel` for a card
   section, `inline` for a disclosure inside a record row), three tones, a
   `meta` slot for counts and badges, and `open` driven from a search param so
   the state survives the redirect every server action performs.
7. Applied to site-checklists (run cards, and the hold-point release box),
   workers (the per-row edit form), and 35 of the inline disclosures on the four
   heaviest pages — commercial, hse-compliance, engineering-controls,
   fleet-logistics. Those 35 previously had neither a marker reset nor a focus
   ring, so this is an accessibility fix as much as a consistency one.
   `tests/ops-collapsible.test.ts` holds a ratchet: the count of hand-rolled
   `<details>` (150) may only go down.

**Still open on this phase:** the top-level `<section>` blocks on the mega-pages
are still always-open. Making them collapsible is not mechanical — each header
carries its own actions and description — and *collapsed by default* changes
what a user sees on load, which is a product decision rather than a refactor.
Recommendation: collapsible but `open` by default, so folding is available
without hiding anything from anyone who does not ask for it.

### Phase 4 — pagination coverage (fixes 1d) — **DONE 2026-08-10**

8. ~~Extend `parseOpsListState` + `OpsListControls` to workers, site-checklists,
   attendance, photos, staff, payroll.~~ All six are paged. The hard caps they
   used to carry — attendance 100, photos 60, cash advances 50, checklists 30 —
   are gone; every row is now reachable. Attendance and payroll keep their own
   richer filter forms and take only the pagination control (with `params`, so
   all five attendance filters survive a page change); the rest also get search
   and two filters each.

   Header tiles on every one of these now read from a dedicated summary query
   rather than from the fetched list, so "Active workers", "Records", "Photos",
   "Outstanding advances" describe the whole set instead of quietly becoming
   per-page numbers.

9. ~~Replace the 200-row `fetchOpsQaChecklistStats` / `fetchOpsQaChecklistRun`
   scans with count queries and a single-row fetch.~~ `fetchOpsQaChecklistRun`
   is one row filtered by id. The stats read one narrow row per live inspection
   plus item rows for open runs only, with `failedItems` as a count query. The
   photo lookup inside `fetchOpsQaChecklistRuns` was also fetching *every*
   checklist-linked photo in the database on every render — it is now scoped to
   the items on the page.

`tests/ops-list-pagination.test.ts` guards the coverage and the `params`
hand-off.

### Phase 5 — page weight (fixes 1c and most of 4) — **STARTED 2026-08-10**

10. **`OpsTabs` shipped, one page converted.** `src/components/ops/OpsTabs.tsx`
    drives tabs from `?tab=` rather than sub-routes, so a page keeps one file,
    one permission check and one set of deep links — the only thing that changes
    is that the server skips the queries for tabs you are not looking at.
    Switching tabs drops `page` and carries every other param, the same
    discipline as `OpsListControls`.

    `/ops/hse-compliance` (2,270 lines) is converted as the reference: four tabs
    (Overview · PPE · Risk & audits · Talks, inspections & training) over what
    was a single 12-query `Promise.all`. Each view now runs 4–7 of those
    queries instead of all twelve.

    **The trap, for whoever does the next one:** splitting sections onto tabs
    breaks every deep link into them, silently. 45 links and server-action
    redirects pointed at `#ppe-register`, `#inspection-panel` and friends; after
    the split those anchors do not exist on the default tab, so the link lands
    on Overview and simply does nothing. No type error, no runtime error. They
    all had to be re-pointed with `?tab=`, and the list controls needed
    `params` so paging the PPE register does not bounce you to Overview.
    `tests/ops-tabs.test.ts` guards this.

    **Remaining: 7 pages** — commercial (3,204), employees (2,845),
    engineering-controls (1,984), material-requests (1,877), equipment (1,840),
    fleet-logistics (1,833), material-schedule (1,601). Same recipe. Worth doing
    one at a time and checking the anchor/redirect fallout each time, rather
    than as one scripted sweep.

    `<Suspense>` per section is still outstanding. `/ops/hse-compliance` already
    streams its ageing watch that way (`HseAgeingSection`), which is the pattern
    to copy — but it needs each section's fetch moved into its own async
    component, so it is a second pass over the same files.

11. **Partly obsolete, partly outstanding.** The bespoke `statusClass` functions
    are *already* gone — the workspace has none left; `opsStatusBadgeClass` is
    used in 36 files. The remaining piece is **25 workspace pages that still
    hand-roll their header** instead of using `OpsPageHeader` (attendance, boq,
    commercial, documents, employees, equipment, photos, payroll, sites, staff,
    workers, …). That is a per-page judgement job — each hand-rolled header
    carries different trailing content (stat tiles, action rows) that has to be
    re-homed — so it belongs with the page-by-page work in item 10 rather than
    as a scripted sweep.

### Phase 6 — feel

12. Introduce weight tiers (primary surface / secondary / inline) so a page is
    not 10 identical cards, and add `useOptimistic` on the highest-traffic
    single-field mutations (checklist item answers, attendance marks).
