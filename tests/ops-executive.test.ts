import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildOpsExecutiveDashboardReport,
  type OpsExecutiveReportSources,
} from "../src/lib/ops/executive";
import { canViewOpsExecutiveDashboard } from "../src/lib/ops/executive-permissions";
import {
  buildOpsHseExecutiveSafetyRollup,
  type OpsHseExecutiveSafetySignals,
} from "../src/lib/ops/hse-executive";

const zeroHseSignals: OpsHseExecutiveSafetySignals = {
  actionRequiredAudits: 0,
  actionRequiredIncidents: 0,
  agedOpenIncidents: 0,
  auditsDueSoon: 0,
  auditsOverdue: 0,
  completedActionsAwaitingVerification: 0,
  dueSoonCorrectiveActions: 0,
  expiredTraining: 0,
  highCriticalOpenIncidents: 0,
  highPriorityOpenActions: 0,
  highResidualRiskAssessments: 0,
  inspectionsActionRequired: 0,
  inspectionsOverdue: 0,
  openCorrectiveActions: 0,
  openIncidents: 0,
  openInspectionFindings: 0,
  overdueCorrectiveActions: 0,
  reviewDueRiskAssessments: 0,
  submittedRiskAssessments: 0,
  trainingDueSoon: 0,
  zeroStockPpeItems: 0,
};

function baseSources(): OpsExecutiveReportSources {
  return {
    approvals: [],
    budgetVariance: {
      overBudgetAmount: 0,
      rows: [],
      totalBudgetedAmount: 0,
      totalCommittedAmount: 0,
      totalExposureAmount: 0,
      totalPostedAmount: 0,
      totalRemainingAmount: 0,
    },
    cashflow: {
      approvedPayables: 0,
      asOfDate: "2026-06-07",
      draftReceivables: 0,
      netNext30: 0,
      next30Date: "2026-07-07",
      next30Payables: 0,
      openReceivables: 0,
      overduePayables: 0,
      paidThisMonth: 0,
      receivedThisMonth: 0,
      sentReceivables: 0,
    },
    commercialForecast: {
      totals: {
        approvedCashflowNet: 0,
        cashflowDangerCount: 0,
        forecastCost: 0,
        forecastRetentionRelease: 0,
        forecastRevenue: 0,
        milestoneAchievedAmount: 0,
        milestoneForecastAmount: 0,
        milestoneOverdueCount: 0,
        pendingRetentionAmount: 0,
        releasedRetentionAmount: 0,
        retentionDueCount: 0,
      },
    },
    commercialMargin: {
      snapshots: [],
      totals: {
        certifiedRevenue: 0,
        dangerCount: 0,
        forecastMargin: 0,
        forecastMarginPercent: null,
        forecastRevenue: 0,
        postedCost: 0,
        realizedMargin: 0,
        realizedMarginPercent: null,
        siteCount: 0,
        totalCostExposure: 0,
        watchCount: 0,
      },
    },
    deliveryFollowUp: {
      ageingAlerts: [],
      asOfDate: "2026-06-07",
      buckets: [],
      highRiskActionable: 0,
      overdueActionable: 0,
      staleNoDueActionable: 0,
      supplierFollowUps: [],
      totalActionable: 0,
    },
    engineering: {
      actionRequiredInspections: 0,
      currentDrawings: 0,
      delayedMilestones: 0,
      failedTests: 0,
      openFollowUps: 0,
      openInstructions: 0,
      openSnags: 0,
      overdueSnags: 0,
      plannedInspections: 0,
    },
    equipment: {
      activeEquipmentCount: 0,
      allocationRows: [],
      availabilityPercent: 0,
      equipmentCount: 0,
      fuelCost30Days: 0,
      fuelLitres30Days: 0,
      maintenanceRows: [],
      openMaintenanceCost: 0,
      openMaintenanceDowntimeHours: 0,
      openMaintenanceJobs: 0,
      utilizationPercent: 0,
    },
    financeAgeing: {
      asOfDate: "2026-06-07",
      attentionItems: [],
      buckets: [],
      dueSoonAmount: 0,
      overdueAmount: 0,
      totalUnpaid: 0,
    },
    fleet: {
      activeLabour: 0,
      activeStays: 0,
      dueThisWeekTrips: 0,
      mobilizationRows: [],
      overdueTrips: 0,
      scheduledTrips: 0,
      tripRows: [],
    },
    hr: {
      activeContracts: 0,
      activeEmployees: 0,
      approvedLeave: 0,
      dueAppraisals: 0,
      expiredTraining: 0,
      lowLeaveBalances: 0,
      onLeave: 0,
      openOnboardingItems: 0,
      openRecruitment: 0,
      overdueOnboardingItems: 0,
      submittedLeave: 0,
      totalEmployees: 0,
      trainingDueSoon: 0,
    },
    hse: buildOpsHseExecutiveSafetyRollup(zeroHseSignals, "2026-06-07"),
    hseEmail: {
      configured: true,
      failed7d: 0,
      failureRate7d: 0,
      lastAttemptAt: null,
      lastFailureAt: null,
      lastSentAt: null,
      recentEvents: [],
      sent7d: 0,
      skipped7d: 0,
      total7d: 0,
      trendRows: [],
    },
    rfqPo: {
      awardedRfqs: 0,
      draftPurchaseOrders: 0,
      issuedRfqs: 0,
      openRfqs: 0,
      receivedQuotes: 0,
    },
  };
}

describe("executive dashboard", () => {
  it("only exposes the executive dashboard to leadership roles", () => {
    assert.equal(canViewOpsExecutiveDashboard("developer"), true);
    assert.equal(canViewOpsExecutiveDashboard("managing_director"), true);
    assert.equal(canViewOpsExecutiveDashboard("general_manager"), true);
    assert.equal(canViewOpsExecutiveDashboard("manager"), true);
    assert.equal(canViewOpsExecutiveDashboard("finance_manager"), false);
    assert.equal(canViewOpsExecutiveDashboard("hse_officer"), false);
  });

  it("promotes urgent leadership actions from high-risk source summaries", () => {
    const sources = baseSources();

    sources.approvals = [
      {
        amount: 75_000,
        created_at: "2026-06-07T00:00:00.000Z",
        currency_code: "ZMW",
        current_step_number: 1,
        description: "Payment approval",
        due_at: null,
        id: "approval-1",
        module_key: "finance",
        priority: "urgent",
        requested_by: "user-1",
        requester: null,
        resolved_at: null,
        site: null,
        site_id: null,
        source_id: "payment-1",
        source_table: "payment_requests",
        status: "submitted",
        submitted_at: "2026-06-07T00:00:00.000Z",
        title: "Supplier payment",
        updated_at: "2026-06-07T00:00:00.000Z",
      },
    ];
    sources.cashflow.netNext30 = -50_000;
    sources.cashflow.overduePayables = 20_000;
    sources.budgetVariance.overBudgetAmount = 12_000;
    sources.commercialMargin.totals.dangerCount = 1;
    sources.commercialMargin.totals.forecastMargin = -5_000;
    sources.hse = buildOpsHseExecutiveSafetyRollup(
      {
        ...zeroHseSignals,
        highCriticalOpenIncidents: 1,
        overdueCorrectiveActions: 1,
      },
      "2026-06-07",
    );
    sources.hseEmail.failed7d = 1;

    const report = buildOpsExecutiveDashboardReport(sources, "2026-06-07", "2026-06-07T00:00:00.000Z");

    assert.equal(report.approvals.backlog, 1);
    assert.equal(report.approvals.highPriority, 1);
    assert.equal(report.approvals.totalAmount, 75_000);
    assert.equal(report.finance.netNext30, -50_000);
    assert.equal(report.hse.pressureLevel, "urgent");
    assert.equal(report.priorityActions[0].tone, "urgent");
    assert.equal(
      report.priorityActions.some((action) => action.label === "Budget variance"),
      true,
    );
    assert.equal(
      report.priorityActions.some((action) => action.label === "HSE email delivery"),
      true,
    );
  });

  it("merges commercial margin and budget variance into project snapshots", () => {
    const sources = baseSources();

    sources.commercialMargin.snapshots = [
      {
        agreedClaimValue: 0,
        approvedVariationValue: 0,
        certifiedRevenue: 80_000,
        committedCost: 30_000,
        contractValue: 100_000,
        forecastMargin: 10_000,
        forecastMarginPercent: 10,
        forecastRevenue: 100_000,
        postedCost: 60_000,
        realizedMargin: 20_000,
        realizedMarginPercent: 25,
        site: { code: "PCL-001", id: "site-1", name: "Pymble Site" },
        siteId: "site-1",
        tone: "warn",
        totalCostExposure: 90_000,
      },
    ];
    sources.budgetVariance.rows = [
      {
        budget_number: "BUD-001",
        committed_amount: 30_000,
        currency_code: "ZMW",
        exposure_amount: 95_000,
        id: "budget-1",
        over_budget_amount: 5_000,
        posted_amount: 65_000,
        remaining_amount: -5_000,
        site: { code: "PCL-001", id: "site-1", name: "Pymble Site" },
        title: "Pymble budget",
        total_budgeted_amount: 90_000,
        variance_percent: 5.5,
      },
    ];

    const report = buildOpsExecutiveDashboardReport(sources, "2026-06-07", "2026-06-07T00:00:00.000Z");

    assert.equal(report.projectSnapshots.length, 1);
    assert.equal(report.projectSnapshots[0].siteId, "site-1");
    assert.equal(report.projectSnapshots[0].overBudgetAmount, 5_000);
    assert.equal(report.projectSnapshots[0].remainingAmount, -5_000);
    assert.equal(report.projectSnapshots[0].tone, "urgent");
  });
});
