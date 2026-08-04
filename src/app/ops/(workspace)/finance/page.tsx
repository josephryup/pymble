import {
  AlertTriangle,
  Banknote,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  HardHat,
  Layers,
  PackageCheck,
  Receipt,
  ScrollText,
  Target,
  TrendingDown,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OpsInlineEmpty } from "@/components/ops/OpsInlineEmpty";
import { OpsDashboardPanel } from "@/components/ops/OpsDashboardPanel";
import {
  OpsAgeingPanel,
  OpsCashflowChartPanel,
  OpsCommercialKpiPanel,
} from "@/components/ops/OpsFinanceKpiPanels";
import {
  OpsCashBalanceTrendChart,
  OpsRevenueCostTrendChart,
} from "@/components/ops/OpsGlTrendCharts";
import { OpsKpiCard } from "@/components/ops/OpsKpiCard";
import { OpsPageHeader } from "@/components/ops/OpsPageHeader";
import { OpsProjectPnlPanel } from "@/components/ops/OpsProjectPnlPanel";
import { OpsRealtimeRefresh } from "@/components/ops/OpsRealtimeRefresh";
import { OpsTableShell } from "@/components/ops/OpsTableShell";
import { requireOpsUser } from "@/lib/ops/auth";
import { canViewOpsChartOfAccounts } from "@/lib/ops/chart-of-accounts-permissions";
import {
  fetchOpsBudgetVarianceDashboard,
  fetchOpsFinanceCashflowDashboard,
  fetchOpsPaymentRequestStats,
  fetchOpsProjectBudgetStats,
} from "@/lib/ops/finance";
import {
  fetchOpsCashflowChart,
  fetchOpsCommercialKpis,
  fetchOpsReceivablesAgeing,
  fetchOpsSupplierAgeing,
} from "@/lib/ops/finance-kpis";
import { fetchOpsFinanceLeakReport } from "@/lib/ops/finance-leaks";
import { fetchOpsGlReconciliation } from "@/lib/ops/gl-cost-bridge";
import { fetchOpsGlMonthlyTrend } from "@/lib/ops/gl-trends";
import {
  fetchOpsStaleReservations,
  STALE_RESERVATION_DAYS,
} from "@/lib/ops/procurement-controls";
import { fetchOpsMaterialRequestsPricedCount } from "@/lib/ops/material-requests";
import { canAccessOpsHref } from "@/lib/ops/permissions";
import { fetchOpsProjectPnl } from "@/lib/ops/project-pnl";
import { fetchOpsPendingSubcontractorPaymentsCount } from "@/lib/ops/subcontractors";
import {
  formatZmw,
  OPS_SECONDARY_BUTTON_CLASS,
  OPS_TABLE_CLASS,
  OPS_TD_CLASS,
  OPS_TD_NUM_CLASS,
  OPS_TH_CLASS,
  OPS_TH_NUM_CLASS,
  OPS_THEAD_CLASS,
  OPS_TR_CLASS,
} from "@/lib/ops/ui";

export const dynamic = "force-dynamic";

export default async function OpsFinanceOverviewPage() {
  const { profile } = await requireOpsUser();

  if (!canAccessOpsHref(profile.role, "/ops/finance")) {
    notFound();
  }

  const [
    cashflow,
    paymentStats,
    budgetStats,
    variance,
    cashflowChart,
    supplierAgeing,
    receivablesAgeing,
    pnl,
    commercialKpis,
    glTrend,
    materialRequestsPricedCount,
    subcontractorPaymentsPendingCount,
    leakReport,
    reservations,
    glReconciliation,
  ] = await Promise.all([
    fetchOpsFinanceCashflowDashboard(),
    fetchOpsPaymentRequestStats(),
    fetchOpsProjectBudgetStats(),
    fetchOpsBudgetVarianceDashboard(),
    fetchOpsCashflowChart(),
    fetchOpsSupplierAgeing(),
    fetchOpsReceivablesAgeing(),
    fetchOpsProjectPnl(),
    fetchOpsCommercialKpis(),
    fetchOpsGlMonthlyTrend().catch(() => []),
    fetchOpsMaterialRequestsPricedCount(),
    fetchOpsPendingSubcontractorPaymentsCount(),
    fetchOpsFinanceLeakReport(),
    fetchOpsStaleReservations().catch(() => ({
      rows: [],
      staleAmount: 0,
      totalReservedAmount: 0,
    })),
    fetchOpsGlReconciliation().catch(() => null),
  ]);
  const staleReservations = reservations.rows.filter((row) => row.isStale);
  const hasGlActivity = glTrend.some(
    (point) => point.income !== 0 || point.expenses !== 0 || point.cashBalance !== 0,
  );

  const showAccountsLink = canViewOpsChartOfAccounts(profile.role);

  return (
    <div className="w-full max-w-none space-y-6">
      <OpsRealtimeRefresh
        tables={["payment_requests", "invoices", "project_budgets", "project_cost_entries"]}
      />
      <OpsPageHeader
        eyebrow="Finance and Accounts"
        title="Finance overview"
        description="Cashflow, receivables, payables, budget variance, and project margin in one cockpit. Statutory statements unlock when the general ledger goes live."
        actions={
          <>
            <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/project-budgets">
              <Target className="size-4" aria-hidden="true" />
              Budgets
            </Link>
            <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/payment-requests">
              <Banknote className="size-4" aria-hidden="true" />
              Payments
            </Link>
            <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/invoices">
              <Receipt className="size-4" aria-hidden="true" />
              Invoices
            </Link>
            {showAccountsLink ? (
              <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/finance/accounts">
                <BookOpen className="size-4" aria-hidden="true" />
                Chart of Accounts
              </Link>
            ) : null}
          </>
        }
      />

      {/* Action queue: things awaiting a Finance decision that live outside
          payment_requests, so they never showed up on this dashboard before —
          see docs/pymble-ops-subcontractor-payments-audit.md (Round 3). */}
      <section className="grid gap-3 md:grid-cols-2">
        <OpsKpiCard
          href="/ops/material-requests?status=priced"
          icon={PackageCheck}
          label="Material requests — cost approval needed"
          tone={materialRequestsPricedCount > 0 ? "warn" : "default"}
          hint="Priced by Procurement"
          value={String(materialRequestsPricedCount)}
        />
        <OpsKpiCard
          href="/ops/subcontractors"
          icon={HardHat}
          label="Subcontractor payments to review"
          tone={subcontractorPaymentsPendingCount > 0 ? "warn" : "default"}
          hint="Pending decision"
          value={String(subcontractorPaymentsPendingCount)}
        />
      </section>

      {/* Leak detector: reconciliation of the request → budget → cost-ledger
          chain. When every count is zero the chain reconciles — this panel is
          the regression check for the project↔finance spine work (see
          docs/pymble-ops-project-finance-spine-audit.md, Phase 0). */}
      <OpsDashboardPanel
        accent={!leakReport.clean}
        density="compact"
        eyebrow="Reconciliation"
        title="Financial leak detector"
        description={
          leakReport.clean
            ? "Every request, cost entry, and site reconciles to a budget. The chain is tight."
            : `${formatZmw(leakReport.leakAmount)} of operational spend is not reconciled to a budget.`
        }
      >
        <div className="overflow-x-auto">
          <table className={OPS_TABLE_CLASS}>
            <thead className={OPS_THEAD_CLASS}>
              <tr>
                <th className={OPS_TH_CLASS}>Check</th>
                <th className={OPS_TH_NUM_CLASS}>Records</th>
                <th className={OPS_TH_NUM_CLASS}>Value</th>
                <th className={OPS_TH_CLASS}>Examples</th>
              </tr>
            </thead>
            <tbody>
              {leakReport.checks.map((check) => (
                <tr className={OPS_TR_CLASS} key={check.key}>
                  <td className={OPS_TD_CLASS}>
                    <Link
                      className="font-semibold text-foreground hover:text-primary-blue"
                      href={check.href}
                      title={check.description}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        {check.count > 0 ? (
                          <AlertTriangle
                            className="size-3.5 text-amber-600"
                            aria-hidden="true"
                          />
                        ) : (
                          <CheckCircle2
                            className="size-3.5 text-emerald-600"
                            aria-hidden="true"
                          />
                        )}
                        {check.label}
                      </span>
                    </Link>
                    <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                      {check.description}
                    </p>
                  </td>
                  <td className={OPS_TD_NUM_CLASS}>
                    <span className={check.count > 0 ? "font-bold text-amber-700" : ""}>
                      {check.count}
                    </span>
                  </td>
                  <td className={OPS_TD_NUM_CLASS}>
                    {check.amount === null ? "—" : formatZmw(check.amount)}
                  </td>
                  <td className={`${OPS_TD_CLASS} text-xs text-muted-foreground`}>
                    {check.samples.length > 0 ? check.samples.join(", ") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </OpsDashboardPanel>

      {/* Subledger ⇄ general ledger reconciliation (audit §4.5). The audit's own
          test for whether the bridge works: if this is empty, nothing is
          leaking between operations and the accounts. */}
      {glReconciliation ? (
        <OpsDashboardPanel
          accent={!glReconciliation.clean}
          density="compact"
          eyebrow="Ledger integrity"
          title="Cost subledger ⇄ general ledger"
          description={
            glReconciliation.clean
              ? "Every actual cost has posted to the general ledger, and every cost code has an account mapped."
              : `${formatZmw(glReconciliation.variance)} of actual cost has not reached the general ledger.`
          }
        >
          <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Cost subledger (actual)
              </dt>
              <dd className="mt-1 text-lg font-bold text-foreground">
                {formatZmw(glReconciliation.subledgerTotal)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Posted to the ledger
              </dt>
              <dd className="mt-1 text-lg font-bold text-foreground">
                {formatZmw(glReconciliation.postedTotal)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Unposted
              </dt>
              <dd
                className={`mt-1 text-lg font-bold ${
                  glReconciliation.unpostedCount > 0 ? "text-amber-700" : "text-foreground"
                }`}
              >
                {glReconciliation.unpostedCount} · {formatZmw(glReconciliation.unpostedAmount)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Cost codes with no GL account
              </dt>
              <dd
                className={`mt-1 text-lg font-bold ${
                  glReconciliation.unmappedCostCodeCount > 0
                    ? "text-amber-700"
                    : "text-foreground"
                }`}
              >
                {glReconciliation.unmappedCostCodeCount}
              </dd>
            </div>
          </dl>
          {glReconciliation.unmappedCostCodeLabels.length > 0 ? (
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              Unmapped: {glReconciliation.unmappedCostCodeLabels.join(", ")}
            </p>
          ) : null}
        </OpsDashboardPanel>
      ) : null}

      {/* Reservations still standing. Approved-but-not-procured spend holds
          budget: left unwatched it makes a healthy budget look exhausted
          (audit R4). Reported, never released automatically — handing funds
          back on a timer is its own hazard. */}
      {reservations.rows.length > 0 ? (
        <OpsDashboardPanel
          accent={staleReservations.length > 0}
          density="compact"
          eyebrow="Commitment control"
          title="Reservations awaiting procurement"
          description={
            staleReservations.length > 0
              ? `${formatZmw(reservations.staleAmount)} has been held for over ${STALE_RESERVATION_DAYS} days without being ordered.`
              : `${formatZmw(reservations.totalReservedAmount)} approved and awaiting purchase orders — all current.`
          }
        >
          <div className="overflow-x-auto">
            <table className={OPS_TABLE_CLASS}>
              <thead className={OPS_THEAD_CLASS}>
                <tr>
                  <th className={OPS_TH_CLASS}>Request</th>
                  <th className={OPS_TH_CLASS}>Site</th>
                  <th className={OPS_TH_CLASS}>Cost code</th>
                  <th className={OPS_TH_NUM_CLASS}>Reserved</th>
                  <th className={OPS_TH_NUM_CLASS}>Age</th>
                </tr>
              </thead>
              <tbody>
                {reservations.rows.slice(0, 8).map((row) => (
                  <tr className={OPS_TR_CLASS} key={`${row.requestId}-${row.reservedOn}`}>
                    <td className={OPS_TD_CLASS}>
                      <Link
                        className="font-semibold text-foreground hover:text-primary-blue"
                        href={`/ops/material-requests#mr-${row.requestId}`}
                      >
                        {row.requestNumber}
                      </Link>
                      <p className="text-xs text-muted-foreground">{row.requestTitle}</p>
                    </td>
                    <td className={OPS_TD_CLASS}>{row.siteCode}</td>
                    <td className={`${OPS_TD_CLASS} text-xs text-muted-foreground`}>
                      {row.costCodeLabel ?? "—"}
                    </td>
                    <td className={OPS_TD_NUM_CLASS}>{formatZmw(row.amount)}</td>
                    <td className={OPS_TD_NUM_CLASS}>
                      <span className={row.isStale ? "font-bold text-amber-700" : ""}>
                        {row.ageDays}d{row.isStale ? " ⚠" : ""}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </OpsDashboardPanel>
      ) : null}

      {/* Cash & liability signal */}
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <OpsKpiCard
          href="/ops/payment-requests"
          icon={Wallet}
          label="Net 30-day cash signal"
          tone={cashflow.netNext30 >= 0 ? "good" : "critical"}
          trend={cashflow.netNext30 >= 0 ? "Inflow positive" : "Shortfall risk"}
          trendDirection={cashflow.netNext30 >= 0 ? "up" : "down"}
          value={formatZmw(cashflow.netNext30)}
        />
        <OpsKpiCard
          href="/ops/invoices"
          icon={Receipt}
          label="Open receivables"
          hint={`${formatZmw(cashflow.sentReceivables)} sent`}
          value={formatZmw(cashflow.openReceivables)}
        />
        <OpsKpiCard
          href="/ops/payment-requests?status=submitted#payment-request-register"
          icon={Banknote}
          label="Unpaid payables"
          tone={paymentStats.unpaidAmount > 0 ? "warn" : "default"}
          hint="Submitted plus approved"
          value={formatZmw(paymentStats.unpaidAmount)}
        />
        <OpsKpiCard
          href="/ops/payment-requests"
          icon={AlertTriangle}
          label="Overdue payables"
          tone={cashflow.overduePayables > 0 ? "critical" : "good"}
          trend={cashflow.overduePayables > 0 ? "Past due date" : "None overdue"}
          value={formatZmw(cashflow.overduePayables)}
        />
      </section>

      {/* Budget posture */}
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <OpsKpiCard
          href="/ops/project-budgets"
          icon={Layers}
          label="Total budgeted"
          hint={`${budgetStats.activeBudgets} active budgets`}
          value={formatZmw(budgetStats.totalBudgetedAmount)}
        />
        <OpsKpiCard
          href="/ops/project-budgets"
          icon={ClipboardList}
          label="Committed cost"
          value={formatZmw(budgetStats.committedAmount)}
        />
        <OpsKpiCard
          href="/ops/project-budgets"
          icon={CheckCircle2}
          label="Posted cost"
          value={formatZmw(budgetStats.postedAmount)}
        />
        <OpsKpiCard
          href="/ops/project-budgets"
          icon={TrendingDown}
          label="Over budget"
          tone={variance.overBudgetAmount > 0 ? "critical" : "good"}
          trend={variance.overBudgetAmount > 0 ? "Exposure exceeds budget" : "Within budget"}
          value={formatZmw(variance.overBudgetAmount)}
        />
      </section>

      {hasGlActivity ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <OpsDashboardPanel
            eyebrow="General ledger"
            title="Revenue vs expenses by month"
            description="Posted journals bucketed by calendar month."
          >
            <OpsRevenueCostTrendChart points={glTrend} />
          </OpsDashboardPanel>
          <OpsDashboardPanel
            eyebrow="General ledger"
            title="Cash balance trend"
            description="Cumulative bank and cash account balance at month end."
          >
            <OpsCashBalanceTrendChart points={glTrend} />
          </OpsDashboardPanel>
        </div>
      ) : null}

      <OpsCashflowChartPanel data={cashflowChart} />

      <div className="grid gap-4 xl:grid-cols-2">
        <OpsAgeingPanel
          description="Outstanding supplier payment requests by days since submission."
          emptyMessage="No outstanding payment requests."
          eyebrow="Supplier ageing"
          registerHref="/ops/payment-requests#payment-request-register"
          registerLabel="Payments"
          summary={supplierAgeing}
          title="Payables ageing 0/30/60/90"
        />
        <OpsAgeingPanel
          description="Outstanding sent client invoices by days since issue."
          emptyMessage="No outstanding receivables."
          eyebrow="Receivables ageing"
          registerHref="/ops/invoices"
          registerLabel="Invoices"
          summary={receivablesAgeing}
          title="Receivables ageing 0/30/60/90"
        />
      </div>

      <OpsCommercialKpiPanel kpis={commercialKpis} />

      <OpsProjectPnlPanel pnl={pnl} />

      <OpsDashboardPanel
        eyebrow="Budget variance"
        title="Project budget exposure"
        description="Active and locked budgets ranked by over-budget amount, then variance."
        actions={
          <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/project-budgets">
            <Target className="size-4" aria-hidden="true" />
            Open budgets
          </Link>
        }
      >
        {variance.rows.length > 0 ? (
          <OpsTableShell>
            <table className={`${OPS_TABLE_CLASS} min-w-[720px]`}>
              <caption className="sr-only">
                Project budget variance by budget — budgeted, exposure, remaining, and over-budget amounts.
              </caption>
              <thead className={OPS_THEAD_CLASS}>
                <tr>
                  <th className={OPS_TH_CLASS} scope="col">Budget</th>
                  <th className={OPS_TH_NUM_CLASS} scope="col">Budgeted</th>
                  <th className={OPS_TH_NUM_CLASS} scope="col">Exposure</th>
                  <th className={OPS_TH_NUM_CLASS} scope="col">Remaining</th>
                  <th className={OPS_TH_NUM_CLASS} scope="col">Over budget</th>
                  <th className={OPS_TH_NUM_CLASS} scope="col">Used</th>
                </tr>
              </thead>
              <tbody>
                {variance.rows.map((row) => (
                  <tr className={OPS_TR_CLASS} key={row.id}>
                    <td className={OPS_TD_CLASS}>
                      {row.site ? (
                        <Link
                          className="font-bold text-foreground hover:text-primary hover:underline"
                          href={`/ops/sites/${row.site.id}`}
                        >
                          {row.title}
                        </Link>
                      ) : (
                        <p className="font-bold text-foreground">{row.title}</p>
                      )}
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {row.budget_number}
                        {row.site ? ` · ${row.site.code}` : ""}
                      </p>
                    </td>
                    <td className={`${OPS_TD_NUM_CLASS} text-muted-foreground`}>
                      {formatZmw(row.total_budgeted_amount)}
                    </td>
                    <td className={`${OPS_TD_NUM_CLASS} font-semibold text-foreground`}>
                      {formatZmw(row.exposure_amount)}
                    </td>
                    <td
                      className={`${OPS_TD_NUM_CLASS} font-semibold ${
                        row.remaining_amount < 0 ? "text-red-700" : "text-emerald-700"
                      }`}
                    >
                      {formatZmw(row.remaining_amount)}
                    </td>
                    <td
                      className={`${OPS_TD_NUM_CLASS} font-bold ${
                        row.over_budget_amount > 0 ? "text-red-700" : "text-muted-foreground"
                      }`}
                    >
                      {formatZmw(row.over_budget_amount)}
                    </td>
                    <td className={`${OPS_TD_NUM_CLASS} text-muted-foreground`}>
                      {Math.round(row.variance_percent)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </OpsTableShell>
        ) : (
          <OpsInlineEmpty>No active or locked budgets with cost exposure yet.</OpsInlineEmpty>
        )}
      </OpsDashboardPanel>

      <OpsDashboardPanel
        eyebrow="General Ledger"
        title="Ledger and statements"
        description="The double-entry ledger is live — journals post automatically when invoices are sent and paid, bills are approved and paid, and payroll is disbursed. Statements are since-inception until period close lands in a later phase."
        actions={
          showAccountsLink ? (
            <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/finance/accounts">
              <ScrollText className="size-4" aria-hidden="true" />
              Chart of Accounts
            </Link>
          ) : undefined
        }
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {[
            { label: "Trial Balance", href: "/ops/finance/trial-balance" },
            { label: "Journal", href: "/ops/finance/journal" },
            { label: "Profit & Loss", href: "/ops/finance/profit-and-loss" },
            { label: "Balance Sheet", href: "/ops/finance/balance-sheet" },
            { label: "Cash Flow Statement", href: "/ops/finance/cash-flow-statement" },
          ].map((statement) =>
            statement.href ? (
              <Link
                className="rounded-md border border-border bg-card px-3 py-4 text-center transition hover:border-primary/50 hover:bg-muted"
                href={statement.href}
                key={statement.label}
              >
                <p className="text-sm font-bold text-foreground">{statement.label}</p>
                <p className="mt-1 text-xs font-semibold uppercase tracking-[0.1em] text-emerald-700">
                  Live
                </p>
              </Link>
            ) : (
              <div
                className="rounded-md border border-dashed border-border px-3 py-4 text-center"
                key={statement.label}
              >
                <p className="text-sm font-bold text-foreground">{statement.label}</p>
                <p className="mt-1 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  Pending
                </p>
              </div>
            ),
          )}
        </div>
      </OpsDashboardPanel>
    </div>
  );
}
