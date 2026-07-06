# Pymble Ops Dashboard Analytics Audit & Plan

Last updated: 2026-07-06

Audit of dashboard UI/UX across the ops workspace with a tracked implementation plan.
Goal: use Recharts (via the shadcn `ChartContainer` wrapper) on every dashboard where a
chart carries real signal, and make metric tiles honest and consistent.

Related docs: `pymble-ops-ui-consistency-audit.md` (shell/layout), `pymble-ops-design-system.md`.

## Current State (as audited 2026-07-06)

- Recharts infrastructure exists (`src/components/ui/chart.tsx`) but only 3 of ~35
  dashboard-style pages use it:
  - `OpsGlTrendCharts.tsx` (revenue/cost composed chart, cash area chart) — Finance, Executive
  - `OpsCommercialCharts.tsx` (certification S-curve) — Commercial
- 34 pages render `OpsKpiCard` grids. The card is sound, but:
  - `trend` is usually a static category string ("Needs triage", "Email"), not a delta.
  - `trendDirection` is almost never passed, and the component then *infers* an arrow
    from `tone` — a "warn" card shows a downward-trend arrow with no trend data behind it.
- 11 hand-rolled `style={{ width: pct }}` div-bar "charts" across HSE, sites,
  project-budgets, project-schedule, engineering-controls, `OpsChartPanel`,
  `OpsRoleOverviewDashboard`, `OpsFinanceKpiPanels`, `OpsCommercialCharts` (funnel).
- Three inconsistent metric-tile designs: `OpsKpiCard`, the `<article>` tiles inside
  `OpsHseKpiPanel`/`OpsFinanceKpiPanels`, and recruitment's private `StatCard`.
- Formatting/threshold helpers (`compactZmw`, `pctClass`, `rateClass`, `scoreClass`)
  duplicated per file; chart colors are hex literals while tiles use Tailwind tokens.
- Attendance and payroll — daily-use pages — have **no visual summary at all**.

## Findings by Dashboard

### Tier 1 — chart-ready data already fetched, no charts

| Page | Today | Add |
| --- | --- | --- |
| `/ops/hse` | KPI cards + number tiles + DIY div-bars | Incident trend (LTIFR/TRIFR), severity breakdown, compliance gauges |
| `/ops/attendance` | No KPIs, no charts | Present/absent/late KPIs + daily headcount bars (trailing week) |
| `/ops/payroll`, `/ops/staff-payroll` | Accordion tables only | Gross/advances/net per run trend + summary KPIs |
| `/ops/approvals` | 6 KPI cards | Weekly submitted vs approved throughput, time-in-stage |
| `/ops/it/helpdesk` | 4 KPI cards | Inflow vs resolution trend, open-by-priority donut |

### Tier 2 — replace DIY bars / extend existing dashboards

- Executive: portfolio budget-vs-actual per site bar; approvals pipeline funnel.
- Role overview dashboard (`OpsRoleOverviewDashboard`): replace `OpsChartPanel` div-bars
  with the shared breakdown-bar primitive.
- Project budgets / sites / project-schedule: budget-vs-actual horizontal bars; reuse the
  Commercial S-curve pattern for schedule progress.
- Stores-inventory / equipment / fleet-logistics: stock-by-category bars, equipment status
  donut. Fleet utilization trend needs a data-layer fetcher first.

### Tier 3 — intentionally no charts

Registers and CRUD lists (suppliers, customers, documents, IT KB/policies/credentials,
glossary, notifications, inbox, archive) and finance statements (P&L, balance sheet,
trial balance, journal). KPI cards / tables are correct there; charts would be decoration.

## Principles

1. **Only chart real data.** No synthetic sparklines, no empty charts. Deferred finance
   ratios (DSO/DPO etc.) stay deferred until finance data exists.
2. **Server fetch → client chart.** Pages stay server components; chart components are
   `"use client"` leaves, following the `OpsGlTrendCharts` pattern.
3. **One palette.** Chart colors come from a shared config so charts and tiles agree.
4. **Trend arrows only with real direction.** Category labels belong in `hint`, not the
   trend badge.

## Implementation Plan

### Phase 1 — Foundations (done 2026-07-06)

- [x] Fix `OpsKpiCard`: render a trend arrow only when `trendDirection` is supplied;
      `trend` without direction renders as a neutral badge (no icon).
- [x] Shared chart primitives in `src/components/ops/OpsAnalyticsCharts.tsx`:
  - [x] `OpsTrendChart` — line/area/bar time series with ZMW/number formatting.
  - [x] `OpsBreakdownBar` — horizontal category bars (replaces div-bar pattern).
  - [x] `OpsStatusDonut` — status/priority distribution.
- [x] Shared palette (`OPS_CHART_COLORS`) + value formatting live in
      `OpsAnalyticsCharts.tsx` for now; extract to `lib/ops` if server code needs them.

### Phase 2 — Missing dashboards (done 2026-07-06)

- [x] Attendance: KPI row (present/late/absent/pending, real day-over-day trend on the
      present card) + daily headcount chart via `fetchOpsAttendanceDailySummary`.
- [x] Payroll: run trend chart (gross/advances bars + net line, last 12 runs).

### Phase 3 — Upgrade existing dashboards (done 2026-07-06)

- [x] HSE: monthly incident trend + severity donut via `fetchOpsHseIncidentTrend`;
      DIY 7-day email-delivery bars replaced with `OpsTrendChart`; category strings
      moved from `trend` to `hint` on all HSE KPI cards.
- [x] Helpdesk: raised-vs-resolved weekly chart + open-by-priority donut via
      `fetchOpsItTicketAnalytics`.
- [x] Approvals: weekly submitted/approved/rejected chart via
      `fetchOpsApprovalsWeeklyThroughput` (decisions bucketed on `updated_at` — the
      request table has no decision timestamp); `trend` strings moved to `hint`.

### Phase 4 — Consistency & polish

- [x] Migrate recruitment `StatCard` to `OpsKpiCard`.
- [x] Replace `OpsChartPanel` usage in `OpsRoleOverviewDashboard` with `OpsBreakdownBar`
      (`OpsChartPanel.tsx` deleted — it was the last consumer).
- [x] Ad-hoc div-bars reviewed (project-budgets, sites, sites/[siteId],
      project-schedule, engineering-controls, `OpsFinanceKpiPanels`): all are genuine
      inline progress/share indicators with correct 0–100 clamping and honest zeros —
      **kept by design**; a recharts chart would be worse UI in a table row. Only
      chart-shaped div-bars were migrated.
- [x] All static `trend="..."` category labels (53 call sites) moved to `hint`.
      Remaining dynamic `trend={...}` strings are conditional status badges
      ("Over budget", "5 overdue") and render without arrows now — legitimate emphasis,
      left as badges.

### Phase 5 — Later / needs data or design work first

- [ ] Executive portfolio budget-vs-actual chart (needs per-site rollup fetcher).
- [ ] Schedule S-curve on `/ops/project-schedule/[siteId]`.
- [ ] Real KPI sparklines (7/30-day series behind headline numbers) — only once cheap
      per-metric history queries exist; never synthetic.
- [ ] Stores/equipment/fleet charts (fleet utilization needs a trend fetcher).
- [ ] Migrate `OpsHseKpiPanel` / `OpsFinanceKpiPanels` tiles onto a shared non-link
      KPI tile variant.

## Additional Improvements (beyond charts)

- **Color/theming**: chart hex literals (`#059669`, `#dc2626`, `#2563eb`) should move to
  a shared `ChartConfig` palette aligned with the Tailwind tokens used by tiles, so any
  future dark-mode pass touches one place.
- **Accessibility**: every chart needs an `aria-label` on its container and, where the
  data is decision-critical (finance, HSE), a visually-hidden or toggleable table
  fallback. The existing DIY bars at least had text values inline — don't regress that.
- **Mobile**: chart heights should step down on small screens (`h-56`/`h-64` via
  responsive classes); Recharts tooltips must not overflow the viewport. Verify at 390px.
- **Empty states**: chart components take an explicit empty state (reuse `OpsEmptyState`)
  instead of rendering an axis-only chart.
- **Refresh interplay**: charts are fed by server fetches, so `OpsAutoRefresh` /
  `OpsRealtimeRefresh` re-renders keep them current — keep chart components stateless.
- **Percentage clamping**: several DIY bars use `Math.max(1, share)`/`Math.max(2, pct)`
  which shows a sliver for zero values; the shared primitives must render true zero.

## Verification

Local dev on this machine is too slow for live screenshots (`docs` note + memory):
verify with `npm run verify` (tsc + eslint + tests) after each phase.
