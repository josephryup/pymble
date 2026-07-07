# Pymble Ops UI Consistency Audit

Last updated: 2026-06-09

This audit captures remaining UI/layout inconsistencies after the first shadcn foundation pass. It is intentionally an audit only: no UI fixes are included in this document.

## Scope

- Desktop sidebar and profile anchoring
- Mobile navigation drawer
- Page width and centered wrappers
- shadcn consistency across shared and page-specific UI
- Tables, forms, alerts, details panels, and page headers
- Responsive behavior and overflow checks

## Browser Evidence

Desktop check at `1440x900`:

- No horizontal page overflow on sampled routes.
- Main content area after the fixed sidebar has about `1160px` available.
- First page work surfaces render at about `1064px`, leaving visible side inset.
- `/ops`, `/ops/sites`, `/ops/approvals`, `/ops/material-requests`, `/ops/rfq-po`, `/ops/stores-inventory`, `/ops/profile`, `/ops/hse`, and `/ops/commercial` loaded without runtime errors.
- Desktop sidebar has `29` visible nav links.
- Desktop sidebar nav height measured about `1774px`.
- Desktop sidebar inner scroll height measured about `2163px` against a `900px` viewport.
- Desktop profile panel was pushed below the visible area, so profile/logout access is not reliably visible.

Mobile check at `390x844`:

- No horizontal overflow.
- Mobile header and drawer open correctly.
- Drawer width is about `343px`.
- Drawer includes `29` nav links and a profile panel.
- Mobile drawer is functional, but dense and long for field use.

## Completed Passes

### 2026-06-09 - Shell And Width Pass

Status: completed and verified against a fresh production build.

Changes completed:

- Desktop sidebar now uses grouped/collapsible module sections instead of one long visible nav stack.
- Desktop profile panel is pinned in the fixed bottom row of the sidebar and remains visible at `1440x900`.
- Mobile drawer now uses the same grouped navigation model and keeps the profile panel visible.
- Ops route wrappers were changed from centered `mx-auto max-w-*` containers to `w-full max-w-none`.
- `OpsRouteLoader` now matches the full-width workspace canvas.
- Ops nav links now support lucide icons and truncate long labels.

Verification:

- `npm run lint` passed.
- `npm run build` passed.
- Desktop browser check at `1440x900`: no horizontal overflow, no browser console errors, sidebar profile visible, grouped nav rendered.
- Mobile browser check at `390x844`: drawer opens, grouped nav rendered, profile visible, no horizontal overflow.
- Source scan found no remaining `mx-auto max-w-7xl`, `mx-auto max-w-5xl`, or `mx-auto max-w-[1440px]` route wrappers under Ops.

## Code Evidence

Top-level centered wrappers remain in many routes:

- `src/components/ops/OpsRoleOverviewDashboard.tsx:1582` uses `mx-auto max-w-[1440px]`.
- `src/app/ops/(workspace)/profile/page.tsx:210` uses `mx-auto max-w-5xl`.
- Most module pages use `mx-auto max-w-7xl`, including attendance, BOQ, documents, approvals, invoices, material requests, payment requests, RFQ/PO, sites, staff, workers, suppliers, stores, HSE, equipment, employees, and project budgets.

Other measurable patterns:

- `214` raw table-related tags remain in `/ops` app routes.
- `244` `details` / `summary` tags remain across Ops routes/components.
- A source scan found over `2000` legacy token usages such as `primary-dark`, `primary-blue`, `bg-white`, and `border-primary-dark`.
- The shadcn migration is active but incomplete: shared surfaces use shadcn in places, while many page-specific panels still use one-off Tailwind card, table, alert, and form markup.

## Route Width Sweep

The following routes/components still need a full-width page wrapper pass. They should move to one shared wrapper such as `OpsPageCanvas` with `w-full max-w-none`, then keep only inner reading text constrained where needed.

| Surface | Current issue | Priority |
| --- | --- | --- |
| `/ops` overview | `OpsRoleOverviewDashboard` still constrains the whole dashboard to `max-w-[1440px]`. | P1 |
| `/ops/sites` | Route wrapper uses `mx-auto max-w-7xl`. | P1 |
| `/ops/approvals` | Route wrapper uses `mx-auto max-w-7xl`. | P1 |
| `/ops/material-requests` | Route wrapper uses `mx-auto max-w-7xl`. | P1 |
| `/ops/rfq-po` | Route wrapper uses `mx-auto max-w-7xl`. | P1 |
| `/ops/stores-inventory` | Route wrapper uses `mx-auto max-w-7xl`. | P1 |
| `/ops/suppliers` | Route wrapper uses `mx-auto max-w-[1440px]`. | P1 |
| `/ops/invoices` | Route wrapper uses `mx-auto max-w-7xl`. | P1 |
| `/ops/documents` | Route wrapper uses `mx-auto max-w-7xl`. | P1 |
| `/ops/hse`, `/ops/hse-compliance` | Route wrappers use `mx-auto max-w-7xl`. | P1 |
| `/ops/equipment` | Route wrapper uses `mx-auto max-w-7xl`. | P1 |
| `/ops/daily-site-reports` | Route wrapper uses `mx-auto max-w-7xl`. | P1 |
| `/ops/delivery-exceptions` | Route wrapper uses `mx-auto max-w-7xl`. | P1 |
| `/ops/project-budgets` | Route wrapper uses `mx-auto max-w-7xl`. | P1 |
| `/ops/executive` | Route wrapper uses `mx-auto max-w-[1440px]`. | P1 |
| `/ops/profile` | Route wrapper uses `mx-auto max-w-5xl`; keep only if intentionally treated as a narrow settings page. | P2 |
| Route loader | `OpsRouteLoader` uses `mx-auto max-w-7xl`, so loading states do not match future full-width pages. | P2 |

## Navigation Audit

Desktop sidebar:

- Current fixed width is `280px`, which is workable for a quiet ERP shell.
- The problem is vertical density: developer view exposes every module as a full nav item.
- The profile panel is visually designed to live at the bottom, but the nav pushes it below the viewport.
- The whole sidebar should not become a scroll trap; instead, the nav model needs to reduce always-visible links.

Mobile drawer:

- The drawer is mechanically responsive and did not create horizontal overflow at `390x844`.
- It exposes the same dense module list as desktop.
- Field users need role-critical modules first, with secondary records collapsed or moved behind an "All modules" launcher.

Recommended navigation model:

- Sidebar shows primary work areas only.
- Use collapsible groups for `Operations`, `Commercial`, `Records`, and `Admin`.
- Developer still has access to all modules through grouped navigation and command palette, but not as one long visible list.
- Profile, notifications, and logout remain fixed/available at the bottom on desktop and reachable quickly on mobile.

## Priority Findings

### P1 - Desktop Sidebar Profile Is Not Reliably Accessible

The sidebar was previously required to be static and keep the profile at the bottom. With the current number of visible modules, the nav stack exceeds the viewport and pushes the profile/logout controls far below the screen.

Impact:

- Users may not see profile, password, notifications, or logout on desktop.
- Developer role is worst affected because it sees all modules.
- A static non-scrolling sidebar cannot safely show every module link at full text density.

Recommended fix:

- Keep only daily workspace groups in the sidebar.
- Move overflow/system/less frequent modules to command palette, top search, or a compact "More" / "All records" surface.
- Consider collapsible nav groups only if profile remains anchored and visible.
- Make the sidebar layout explicitly reserve rows for brand, nav, and profile.

### P1 - Ops Pages Are Still Centered Instead Of Full Working Width

Most routes still use `mx-auto max-w-7xl`. This creates a centered dashboard/card look instead of a full-width ERP work surface. The browser confirms visible side inset on desktop even though the shell has more space available.

Impact:

- Tables and operational panels feel squeezed.
- Dense ERP pages do not use the available desktop canvas.
- Pages feel visually inconsistent with the requested full-width operational layout.

Recommended fix:

- Introduce a shared `OpsPageShell` or `OpsPageCanvas` with `w-full max-w-none`.
- Replace route-level `mx-auto max-w-*` wrappers with the shared full-width wrapper.
- Keep only descriptive text lines constrained with `max-w-3xl`; do not constrain the whole page.
- Profile can remain narrower only if that is a deliberate exception, but it should be called out as an exception.

### P1 - Page-Specific UI Still Uses Legacy Cards Instead Of shadcn Primitives

The first shadcn pass migrated shared components, but many route files still contain raw `rounded-lg border border-primary-dark/10 bg-white` card blocks.

Impact:

- Some modules look more polished than others.
- Borders, shadows, radii, spacing, and headings drift between pages.
- Future changes become slower because each module has custom markup.

Recommended fix:

- Create a small Ops shadcn composition layer:
  - `OpsPageHeader`
  - `OpsPageSection`
  - `OpsMetricGrid`
  - `OpsDataCard`
  - `OpsEmptyState`
  - `OpsNotice`
  - `OpsDetailsPanel`
- Convert high-traffic pages first: `/ops`, `/ops/sites`, `/ops/approvals`, `/ops/material-requests`, `/ops/rfq-po`, `/ops/stores-inventory`, `/ops/profile`.

### P1 - Tables Are Not Yet Standardized

Many modules still render raw tables with custom `thead`, `tbody`, `th`, and `td` classes instead of the shadcn table primitives or one shared Ops table wrapper.

Impact:

- Header styling, row density, mobile behavior, and empty states vary by module.
- Table accessibility and horizontal-scroll behavior need repeated manual checks.
- Dense operational tables are one of the most important ERP surfaces.

Recommended fix:

- Introduce a shared `OpsDataTable` wrapper using shadcn `Table`.
- Standardize:
  - sticky or clear table headers where useful
  - horizontal scroll container
  - mobile card fallback
  - row action placement
  - empty state
  - status badge placement

### P2 - Mobile Drawer Is Functional But Too Dense

The drawer opens and does not overflow horizontally, but it currently contains 29 links plus profile controls. That is heavy for site users on small screens.

Impact:

- Field users must scan too much navigation.
- Important modules may be harder to find quickly.
- Developer view is especially dense.

Recommended fix:

- Group drawer sections with collapsible groups.
- Show role-critical modules first.
- Move rarely used/system links lower or into a secondary "All modules" route.
- Keep profile and notifications available without forcing users to scroll through every module.

### P2 - Top Utility Bar Still Mixes Old and New Patterns

The command palette uses shadcn, but the current-page search, notification button, "New request", and "Public site" links still use legacy custom button/input classes.

Impact:

- The top bar does not fully match the shadcn design system.
- Search controls and action buttons differ from module list controls.

Recommended fix:

- Use shadcn `Button`, `Input`, `Badge`, and possibly `Breadcrumb`.
- Keep the command palette as the primary navigation/search pattern.
- Decide whether current-page search is useful enough to remain in the top bar or should be moved into each list control.

### P2 - Details/Summary Panels Need a Standard Pattern

Many pages use native `details` / `summary` panels. They are practical, but current styling varies and some are still legacy token-heavy.

Impact:

- Collapsed creation panels look different across modules.
- Focus and expanded states are not visually consistent.
- Some panels read as plain forms rather than controlled ERP tools.

Recommended fix:

- Create `OpsDetailsPanel` using shadcn `Card` composition around native `details`, or move some flows to shadcn `Sheet`/`Dialog` where the action is heavy.
- Standardize summary icon, title, helper text, chevron, border, and focus states.

### P2 - Alerts And Notices Are Inconsistent

Several routes still use custom red/green/orange notice blocks instead of shadcn `Alert` or one shared `OpsNotice`.

Impact:

- Success/error states do not feel like one system.
- Accessibility roles and tone mapping are repeated manually.

Recommended fix:

- Add `OpsNotice` wrapping shadcn `Alert`.
- Replace custom notice blocks route by route.

### P2 - Legacy Design Tokens Remain Widespread

The system now has shadcn tokens, but old classes such as `primary-dark`, `primary-blue`, `bg-white`, and `border-primary-dark/10` still dominate many pages.

Impact:

- Theme changes are harder.
- Components can look close-but-not-identical.
- Dark mode or future theme support would be expensive.

Recommended fix:

- Use shadcn tokens for generic surfaces:
  - `bg-background`
  - `bg-card`
  - `text-foreground`
  - `text-muted-foreground`
  - `border-border`
  - `bg-primary`
  - `text-primary`
- Keep Pymble brand utility classes only for intentional brand moments.

## Recommended Fix Order

1. Done: Fix desktop sidebar density and profile anchoring.
2. Done: Introduce full-width Ops route canvases and replace route-level `mx-auto max-w-*` wrappers.
3. Standardize page headers and title/action rows with shadcn composition.
4. Standardize tables with a shared shadcn `OpsDataTable`.
5. Standardize details panels and notices.
6. Convert remaining high-traffic module panels from raw Tailwind cards to shadcn cards.
7. Re-test desktop/mobile routes and update this audit with completed items.

## Acceptance Criteria For The Next UI Pass

- Desktop profile panel is visible without scrolling the sidebar.
- Sidebar has no navigation scroll trap.
- Main module pages use full available content width.
- Tables do not force page-level horizontal overflow.
- Mobile drawer remains accessible, grouped, and not overwhelming.
- High-traffic routes use the same header, KPI, panel, table, notice, and action patterns.
- No route shows setup requirements or generic placeholder content.
- Browser checks pass on desktop and mobile with no runtime errors.

## 2026-07-06 - Measured Consistency Findings (post analytics pass)

Quantified with grep across `src/app/ops` + `src/components/ops` after the
dashboard-analytics overhaul (see `pymble-ops-dashboard-analytics-audit.md`).

| # | Finding | Scale | Impact |
|---|---------|-------|--------|
| 1 | Dual color system: legacy `text-primary-dark` / `bg-white` / `border-primary-dark/10` vs shadcn tokens | 73 files legacy vs 44 tokenised | `bg-white` panels break dark mode (token components ship `dark:` variants); subtle grey/border drift in light mode |
| 2 | Hand-rolled notice/error banners | ~50 page-level banners (~40 files) | Padding/radius drift; some error banners missing `role="alert"` |
| 3 | Per-page status-badge class functions | 62 local functions | Same status can render different colors on different pages; no single place to add dark-mode variants |
| 4 | Scattered formatting | 98 `toLocaleString("en-ZM")`, 90 `Intl.DateTimeFormat` call sites; `formatZmw`/`compactZmw`/percent in 3 files | Money renders as "K 1.2m" on one page, "ZMW 1,200,000" on another; in-render formatter construction |
| 5 | Panel radius drift | 49 `rounded-2xl` outliers vs house `rounded-lg` (panels) / `rounded-md` (tiles) | Project-schedule + a few forms read as a different product |

Healthy already: `OpsPageHeader` on 48/48 pages; `OpsEmptyState` on 33 pages
(~10 dashed hand-rolls left); table constants (`OPS_TABLE_*`) widely used.

### Tracked fixes (in recommended order)

- [x] **Notices** (done 2026-07-06): `OPS_NOTICE_SUCCESS/ERROR/WARNING/INFO_CLASS`
      in `lib/ops/ui.ts`, with the dark-mode variants the hand-rolls lacked;
      30 files migrated by exact-string script. All error banners verified to
      carry `role="alert"`. A handful of `mt-*`-prefixed variants remain —
      migrate opportunistically.
- [x] **Status badges** (completed 2026-07-06): central `OPS_STATUS_TONES`
      registry + `opsStatusBadgeClass(status)` in `lib/ops/ui.ts` (5 tones with
      dark variants; chip size standardised to px-2.5/py-1/text-[11px]).
      ALL local `statusClass`/`severityClass`/`presenceClass` functions are now
      migrated (61 of the original 62; the survivor is approvals'
      `priorityClass`, which colors table text, not a badge). The registry holds
      ~90 status words; local `StatusBadge`/`StatusPill` wrappers are
      registry-backed with an optional `tone` prop for derived states
      (expiry-aware helpers in employees/profile return tones, never classes).
      Intentional unifications: equipment "approved" sky→emerald, "allocated"
      emerald→sky, completed-training orange→emerald (was showing the good
      state as amber), chip size standardised to px-2.5/py-1/text-[11px].
      New status words go in the registry — never fork colors locally.
- [x] **Formatting** (done 2026-07-06): `lib/ops/format.ts` with singleton
      Lusaka-pinned formatters (`formatOpsDate`, `formatOpsDateTime`,
      `todayInLusaka`, `formatOpsLabel`, `formatCount`; `formatZmw` re-exported).
      31 files migrated by script — ~80 duplicated local definitions removed;
      `Intl.DateTimeFormat` construction in pages dropped 90 → 9 (the 9 that
      remain are specialised: time-only input extraction, weekday labels).
      **Bug fixed in passing**: most `formatDateTime` copies omitted the
      `Africa/Lusaka` pin, so those pages rendered timestamps in server time
      (UTC on Vercel, 2 h off); all now pinned. Custom fallback wording
      ("Not scheduled", "Not moved", "—") preserved via local wrapper consts.
      New code imports from `@/lib/ops/format` — never construct an Intl
      formatter in a render.
- [x] **Color tokens** (done 2026-07-06): scripted migration across 78 files,
      ~2,480 class occurrences. Mappings: `bg-white`→`bg-card`;
      `text-primary-dark`→`text-foreground`; `text-primary-dark/≤65`→
      `text-muted-foreground`; `/68–80`→`text-foreground/NN`;
      `border|divide-primary-dark/*`→`border|divide-border`;
      `bg-primary-dark/[0.0x]|/≤9`→`bg-muted/40`; `/10+`→`bg-muted`;
      `shadow-primary-dark/*`→`shadow-foreground/*`. Kept deliberately: 14
      solid `bg-primary-dark` brand icon squares (white-on-dark), 2
      `bg-white/20` translucent overlays, `text-primary-blue` brand accents.
      Verified via tsc/eslint/tests; **routes still need a visual pass in both
      themes when a dev server is available** — the migration was mechanical.
- [x] **Radius** (done 2026-07-06): all 48 `rounded-2xl` outliers in ops pages
      swept to `rounded-lg`. The one in `OpsNotificationDockClient` was kept —
      a floating dock is an elevated overlay where the larger radius reads as
      intentional.
