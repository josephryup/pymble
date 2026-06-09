import { fetchOpsApprovalRequests, type OpsApprovalRequestSummary } from "@/lib/ops/approvals";
import {
  fetchOpsCommercialForecastReport,
  fetchOpsCommercialMarginReport,
} from "@/lib/ops/commercial";
import type {
  OpsCommercialForecastReport,
  OpsCommercialMarginReport,
} from "@/lib/ops/commercial-reporting";
import {
  fetchOpsDeliveryExceptionFollowUpDashboard,
  type OpsDeliveryExceptionFollowUpDashboard,
} from "@/lib/ops/delivery-exceptions";
import {
  fetchOpsEngineeringControlStats,
  type OpsEngineeringControlStats,
} from "@/lib/ops/engineering-controls";
import {
  fetchOpsEquipmentUtilizationDashboard,
  type OpsEquipmentUtilizationDashboard,
} from "@/lib/ops/equipment";
import { canViewOpsExecutiveDashboard } from "@/lib/ops/executive-permissions";
import {
  fetchOpsBudgetVarianceDashboard,
  fetchOpsFinanceAgeingDashboard,
  fetchOpsFinanceCashflowDashboard,
  type OpsBudgetVarianceDashboard,
  type OpsFinanceAgeingDashboard,
  type OpsFinanceCashflowDashboard,
} from "@/lib/ops/finance";
import {
  fetchOpsFleetMobilizationDashboard,
  type OpsFleetMobilizationDashboard,
} from "@/lib/ops/fleet-logistics";
import { fetchOpsHrStats, type OpsHrStats } from "@/lib/ops/hr";
import {
  fetchOpsHseEmailDeliveryReport,
  type OpsHseEmailDeliveryReport,
} from "@/lib/ops/hse-email-observability";
import {
  buildOpsHseExecutiveSafetyRollup,
  fetchOpsHseExecutiveSafetyRollup,
  type OpsHseExecutiveSafetyRollup,
  type OpsHseExecutiveSafetySignals,
} from "@/lib/ops/hse-executive";
import { fetchOpsRfqPoStats, type OpsRfqPoStats } from "@/lib/ops/rfq-po";
import { requireOpsUser } from "@/lib/ops/auth";

export type OpsExecutiveActionTone = "good" | "urgent" | "watch";

export type OpsExecutiveSourceHealth = {
  key: string;
  label: string;
  status: "ok" | "unavailable";
};

export type OpsExecutivePriorityAction = {
  detail: string;
  href: string;
  label: string;
  tone: OpsExecutiveActionTone;
  value: string;
};

export type OpsExecutiveProjectSnapshot = {
  costExposure: number;
  forecastMargin: number;
  forecastMarginPercent: number | null;
  forecastRevenue: number;
  overBudgetAmount: number;
  remainingAmount: number;
  siteCode: string;
  siteId: string;
  siteName: string;
  tone: OpsExecutiveActionTone;
};

export type OpsExecutiveDashboardReport = {
  approvals: {
    backlog: number;
    highPriority: number;
    totalAmount: number;
  };
  commercial: {
    cashflowDangerCount: number;
    forecastMargin: number;
    forecastMarginPercent: number | null;
    forecastNetCash: number;
    marginDangerCount: number;
    marginWatchCount: number;
    milestoneOverdueCount: number;
    pendingRetentionAmount: number;
  };
  delivery: {
    highRiskActionable: number;
    overdueActionable: number;
    totalActionable: number;
  };
  engineering: {
    delayedMilestones: number;
    failedTests: number;
    openFollowUps: number;
    overdueSnags: number;
  };
  equipment: {
    availabilityPercent: number;
    openMaintenanceCost: number;
    openMaintenanceJobs: number;
    utilizationPercent: number;
  };
  finance: {
    approvedPayables: number;
    netNext30: number;
    openReceivables: number;
    overBudgetAmount: number;
    overduePayables: number;
    totalExposureAmount: number;
    totalUnpaid: number;
  };
  fleet: {
    activeLabour: number;
    activeStays: number;
    dueThisWeekTrips: number;
    overdueTrips: number;
  };
  generatedAt: string;
  hse: OpsHseExecutiveSafetyRollup;
  hseEmail: {
    configured: boolean;
    failed7d: number;
    sent7d: number;
    skipped7d: number;
  };
  people: {
    activeEmployees: number;
    expiredTraining: number;
    openOnboardingItems: number;
    overdueOnboardingItems: number;
    submittedLeave: number;
    trainingDueSoon: number;
  };
  priorityActions: OpsExecutivePriorityAction[];
  procurement: {
    draftPurchaseOrders: number;
    issuedRfqs: number;
    openRfqs: number;
    receivedQuotes: number;
  };
  projectSnapshots: OpsExecutiveProjectSnapshot[];
  sourceHealth: OpsExecutiveSourceHealth[];
  today: string;
};

export type OpsExecutiveReportSources = {
  approvals: OpsApprovalRequestSummary[];
  budgetVariance: OpsBudgetVarianceDashboard;
  cashflow: OpsFinanceCashflowDashboard;
  commercialForecast: OpsCommercialForecastReport;
  commercialMargin: OpsCommercialMarginReport;
  deliveryFollowUp: OpsDeliveryExceptionFollowUpDashboard;
  engineering: OpsEngineeringControlStats;
  equipment: OpsEquipmentUtilizationDashboard;
  financeAgeing: OpsFinanceAgeingDashboard;
  fleet: OpsFleetMobilizationDashboard;
  hr: OpsHrStats;
  hse: OpsHseExecutiveSafetyRollup;
  hseEmail: OpsHseEmailDeliveryReport;
  rfqPo: OpsRfqPoStats;
  sourceHealth?: OpsExecutiveSourceHealth[];
};

type ExecutiveSourceResult<T> = {
  data: T;
  health: OpsExecutiveSourceHealth;
};

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

function todayInLusaka() {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Africa/Lusaka",
    year: "numeric",
  }).format(new Date());
}

function normalizeNumber(value: number | null | undefined) {
  return Number(value ?? 0);
}

function isRecoverableExecutiveSourceError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const source = error as { code?: string; message?: string };
  const code = source.code ?? "";
  const message = source.message ?? "";

  return (
    code === "42P01" ||
    code === "42703" ||
    code === "PGRST200" ||
    code === "PGRST204" ||
    code === "PGRST205" ||
    /schema cache|does not exist|column .* does not exist/i.test(message)
  );
}

async function safeExecutiveSource<T>(
  key: string,
  label: string,
  load: () => Promise<T>,
  fallback: T,
): Promise<ExecutiveSourceResult<T>> {
  try {
    return {
      data: await load(),
      health: { key, label, status: "ok" },
    };
  } catch (error) {
    if (!isRecoverableExecutiveSourceError(error)) {
      throw error;
    }

    console.warn(`[ops] executive ${key} source unavailable; using fallback`, {
      code: (error as { code?: string }).code ?? null,
      message: (error as { message?: string }).message ?? "Unknown source error.",
    });

    return {
      data: fallback,
      health: { key, label, status: "unavailable" },
    };
  }
}

function currencyText(value: number) {
  return new Intl.NumberFormat("en-ZM", {
    currency: "ZMW",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

function percentTone(value: number | null): OpsExecutiveActionTone {
  if (value === null) {
    return "watch";
  }

  if (value < 5) {
    return "urgent";
  }

  if (value < 15) {
    return "watch";
  }

  return "good";
}

function projectSnapshotTone(input: {
  forecastMarginPercent: number | null;
  overBudgetAmount: number;
}): OpsExecutiveActionTone {
  if (
    input.overBudgetAmount > 0 ||
    (input.forecastMarginPercent !== null && input.forecastMarginPercent < 5)
  ) {
    return "urgent";
  }

  if (input.forecastMarginPercent === null || input.forecastMarginPercent < 15) {
    return "watch";
  }

  return "good";
}

function sortAction(first: OpsExecutivePriorityAction, second: OpsExecutivePriorityAction) {
  const weights: Record<OpsExecutiveActionTone, number> = {
    urgent: 0,
    watch: 1,
    good: 2,
  };

  return weights[first.tone] - weights[second.tone] || first.label.localeCompare(second.label);
}

function buildProjectSnapshots(
  commercialMargin: OpsCommercialMarginReport,
  budgetVariance: OpsBudgetVarianceDashboard,
) {
  const rows = new Map<string, OpsExecutiveProjectSnapshot>();

  for (const snapshot of commercialMargin.snapshots) {
    const siteId = snapshot.site?.id ?? snapshot.siteId;
    rows.set(siteId, {
      costExposure: snapshot.totalCostExposure,
      forecastMargin: snapshot.forecastMargin,
      forecastMarginPercent: snapshot.forecastMarginPercent,
      forecastRevenue: snapshot.forecastRevenue,
      overBudgetAmount: 0,
      remainingAmount: 0,
      siteCode: snapshot.site?.code ?? "Site",
      siteId,
      siteName: snapshot.site?.name ?? "Unlinked project",
      tone: percentTone(snapshot.forecastMarginPercent),
    });
  }

  for (const budget of budgetVariance.rows) {
    const siteId = budget.site?.id ?? budget.id;
    const existing = rows.get(siteId);

    if (existing) {
      existing.overBudgetAmount += budget.over_budget_amount;
      existing.remainingAmount += budget.remaining_amount;
      existing.tone = projectSnapshotTone(existing);
      continue;
    }

    rows.set(siteId, {
      costExposure: budget.exposure_amount,
      forecastMargin: 0,
      forecastMarginPercent: null,
      forecastRevenue: 0,
      overBudgetAmount: budget.over_budget_amount,
      remainingAmount: budget.remaining_amount,
      siteCode: budget.site?.code ?? budget.budget_number,
      siteId,
      siteName: budget.site?.name ?? budget.title,
      tone: projectSnapshotTone({
        forecastMarginPercent: null,
        overBudgetAmount: budget.over_budget_amount,
      }),
    });
  }

  return Array.from(rows.values())
    .sort((first, second) => {
      const toneWeights: Record<OpsExecutiveActionTone, number> = {
        urgent: 0,
        watch: 1,
        good: 2,
      };
      const toneSort = toneWeights[first.tone] - toneWeights[second.tone];

      if (toneSort !== 0) {
        return toneSort;
      }

      return second.costExposure - first.costExposure;
    })
    .slice(0, 8);
}

export function buildOpsExecutiveDashboardReport(
  sources: OpsExecutiveReportSources,
  today = todayInLusaka(),
  generatedAt = new Date().toISOString(),
): OpsExecutiveDashboardReport {
  const approvalBacklog = sources.approvals.length;
  const approvalAmount = sources.approvals.reduce(
    (sum, approval) => sum + normalizeNumber(approval.amount),
    0,
  );
  const highPriority = sources.approvals.filter(
    (approval) => approval.priority === "high" || approval.priority === "urgent",
  ).length;
  const commercialTotals = sources.commercialMargin.totals;
  const forecastTotals = sources.commercialForecast.totals;
  const projectSnapshots = buildProjectSnapshots(
    sources.commercialMargin,
    sources.budgetVariance,
  );
  const priorityActions: OpsExecutivePriorityAction[] = [];

  if (approvalBacklog > 0) {
    priorityActions.push({
      detail: `${highPriority} high-priority item${highPriority === 1 ? "" : "s"} in the shared workflow queue.`,
      href: "/ops/approvals",
      label: "Approval backlog",
      tone: highPriority > 0 ? "urgent" : "watch",
      value: String(approvalBacklog),
    });
  }

  if (sources.cashflow.overduePayables > 0 || sources.cashflow.netNext30 < 0) {
    priorityActions.push({
      detail: `${currencyText(sources.cashflow.overduePayables)} overdue payables / ${currencyText(
        sources.cashflow.netNext30,
      )} next-30 net position.`,
      href: "/ops/payment-requests",
      label: "Cashflow pressure",
      tone: sources.cashflow.netNext30 < 0 ? "urgent" : "watch",
      value: currencyText(sources.cashflow.netNext30),
    });
  }

  if (sources.budgetVariance.overBudgetAmount > 0) {
    priorityActions.push({
      detail: `${currencyText(sources.budgetVariance.overBudgetAmount)} over active project budgets.`,
      href: "/ops/project-budgets",
      label: "Budget variance",
      tone: "urgent",
      value: currencyText(sources.budgetVariance.overBudgetAmount),
    });
  }

  if (commercialTotals.dangerCount > 0 || forecastTotals.cashflowDangerCount > 0) {
    priorityActions.push({
      detail: `${commercialTotals.dangerCount} project margin danger signal${
        commercialTotals.dangerCount === 1 ? "" : "s"
      } / ${forecastTotals.cashflowDangerCount} cashflow forecast warning${
        forecastTotals.cashflowDangerCount === 1 ? "" : "s"
      }.`,
      href: "/ops/commercial",
      label: "Commercial exposure",
      tone: commercialTotals.dangerCount > 0 ? "urgent" : "watch",
      value: currencyText(commercialTotals.forecastMargin),
    });
  }

  if (sources.hse.pressureLevel !== "steady") {
    priorityActions.push({
      detail: sources.hse.headline,
      href: "/ops/hse",
      label: "HSE leadership pressure",
      tone: sources.hse.pressureLevel === "urgent" ? "urgent" : "watch",
      value: String(sources.hse.pressureScore),
    });
  }

  if (!sources.hseEmail.configured || sources.hseEmail.failed7d > 0) {
    priorityActions.push({
      detail: sources.hseEmail.configured
        ? `${sources.hseEmail.failed7d} failed critical HSE email attempt${
            sources.hseEmail.failed7d === 1 ? "" : "s"
          } in the last 7 days.`
        : "Critical HSE email delivery is not configured.",
      href: "/ops/hse#email-delivery-health",
      label: "HSE email delivery",
      tone: sources.hseEmail.failed7d > 0 ? "urgent" : "watch",
      value: sources.hseEmail.configured ? String(sources.hseEmail.failed7d) : "Config",
    });
  }

  if (sources.deliveryFollowUp.highRiskActionable > 0 || sources.deliveryFollowUp.overdueActionable > 0) {
    priorityActions.push({
      detail: `${sources.deliveryFollowUp.highRiskActionable} high-risk delivery issue${
        sources.deliveryFollowUp.highRiskActionable === 1 ? "" : "s"
      } / ${sources.deliveryFollowUp.overdueActionable} overdue follow-up${
        sources.deliveryFollowUp.overdueActionable === 1 ? "" : "s"
      }.`,
      href: "/ops/delivery-exceptions",
      label: "Delivery exceptions",
      tone: sources.deliveryFollowUp.highRiskActionable > 0 ? "urgent" : "watch",
      value: String(sources.deliveryFollowUp.totalActionable),
    });
  }

  if (sources.fleet.overdueTrips > 0 || sources.engineering.delayedMilestones > 0) {
    priorityActions.push({
      detail: `${sources.fleet.overdueTrips} overdue trip${sources.fleet.overdueTrips === 1 ? "" : "s"} / ${sources.engineering.delayedMilestones} delayed programme milestone${sources.engineering.delayedMilestones === 1 ? "" : "s"}.`,
      href: "/ops/fleet-logistics",
      label: "Mobilization and programme",
      tone: sources.fleet.overdueTrips > 0 ? "urgent" : "watch",
      value: String(sources.fleet.overdueTrips + sources.engineering.delayedMilestones),
    });
  }

  if (sources.hr.expiredTraining > 0 || sources.hr.overdueOnboardingItems > 0) {
    priorityActions.push({
      detail: `${sources.hr.expiredTraining} expired training record${
        sources.hr.expiredTraining === 1 ? "" : "s"
      } / ${sources.hr.overdueOnboardingItems} overdue onboarding item${
        sources.hr.overdueOnboardingItems === 1 ? "" : "s"
      }.`,
      href: "/ops/employees",
      label: "People readiness",
      tone: sources.hr.expiredTraining > 0 ? "urgent" : "watch",
      value: String(sources.hr.expiredTraining + sources.hr.overdueOnboardingItems),
    });
  }

  if (priorityActions.length === 0) {
    priorityActions.push({
      detail: "No urgent cross-module escalation signals are active.",
      href: "/ops",
      label: "Leadership control",
      tone: "good",
      value: "Clear",
    });
  }

  return {
    approvals: {
      backlog: approvalBacklog,
      highPriority,
      totalAmount: approvalAmount,
    },
    commercial: {
      cashflowDangerCount: forecastTotals.cashflowDangerCount,
      forecastMargin: commercialTotals.forecastMargin,
      forecastMarginPercent: commercialTotals.forecastMarginPercent,
      forecastNetCash: forecastTotals.approvedCashflowNet,
      marginDangerCount: commercialTotals.dangerCount,
      marginWatchCount: commercialTotals.watchCount,
      milestoneOverdueCount: forecastTotals.milestoneOverdueCount,
      pendingRetentionAmount: forecastTotals.pendingRetentionAmount,
    },
    delivery: {
      highRiskActionable: sources.deliveryFollowUp.highRiskActionable,
      overdueActionable: sources.deliveryFollowUp.overdueActionable,
      totalActionable: sources.deliveryFollowUp.totalActionable,
    },
    engineering: {
      delayedMilestones: sources.engineering.delayedMilestones,
      failedTests: sources.engineering.failedTests,
      openFollowUps: sources.engineering.openFollowUps,
      overdueSnags: sources.engineering.overdueSnags,
    },
    equipment: {
      availabilityPercent: sources.equipment.availabilityPercent,
      openMaintenanceCost: sources.equipment.openMaintenanceCost,
      openMaintenanceJobs: sources.equipment.openMaintenanceJobs,
      utilizationPercent: sources.equipment.utilizationPercent,
    },
    finance: {
      approvedPayables: sources.cashflow.approvedPayables,
      netNext30: sources.cashflow.netNext30,
      openReceivables: sources.cashflow.openReceivables,
      overBudgetAmount: sources.budgetVariance.overBudgetAmount,
      overduePayables: sources.cashflow.overduePayables,
      totalExposureAmount: sources.budgetVariance.totalExposureAmount,
      totalUnpaid: sources.financeAgeing.totalUnpaid,
    },
    fleet: {
      activeLabour: sources.fleet.activeLabour,
      activeStays: sources.fleet.activeStays,
      dueThisWeekTrips: sources.fleet.dueThisWeekTrips,
      overdueTrips: sources.fleet.overdueTrips,
    },
    generatedAt,
    hse: sources.hse,
    hseEmail: {
      configured: sources.hseEmail.configured,
      failed7d: sources.hseEmail.failed7d,
      sent7d: sources.hseEmail.sent7d,
      skipped7d: sources.hseEmail.skipped7d,
    },
    people: {
      activeEmployees: sources.hr.activeEmployees,
      expiredTraining: sources.hr.expiredTraining,
      openOnboardingItems: sources.hr.openOnboardingItems,
      overdueOnboardingItems: sources.hr.overdueOnboardingItems,
      submittedLeave: sources.hr.submittedLeave,
      trainingDueSoon: sources.hr.trainingDueSoon,
    },
    priorityActions: priorityActions.sort(sortAction).slice(0, 8),
    procurement: {
      draftPurchaseOrders: sources.rfqPo.draftPurchaseOrders,
      issuedRfqs: sources.rfqPo.issuedRfqs,
      openRfqs: sources.rfqPo.openRfqs,
      receivedQuotes: sources.rfqPo.receivedQuotes,
    },
    projectSnapshots,
    sourceHealth: sources.sourceHealth ?? [],
    today,
  };
}

export async function fetchOpsExecutiveDashboardReport() {
  const { profile } = await requireOpsUser();

  if (!canViewOpsExecutiveDashboard(profile.role)) {
    throw new Error("Executive dashboard is restricted to leadership roles.");
  }

  const today = todayInLusaka();
  const zeroHse = buildOpsHseExecutiveSafetyRollup(zeroHseSignals, today);
  const [
    approvals,
    cashflow,
    financeAgeing,
    budgetVariance,
    commercialMargin,
    commercialForecast,
    deliveryFollowUp,
    rfqPo,
    equipment,
    fleet,
    engineering,
    hr,
    hse,
    hseEmail,
  ] = await Promise.all([
    safeExecutiveSource(
      "approvals",
      "Approvals",
      () => fetchOpsApprovalRequests({ limit: 100, status: ["submitted", "in_review"] }),
      [],
    ),
    safeExecutiveSource(
      "cashflow",
      "Cashflow",
      fetchOpsFinanceCashflowDashboard,
      {
        approvedPayables: 0,
        asOfDate: today,
        draftReceivables: 0,
        netNext30: 0,
        next30Date: today,
        next30Payables: 0,
        openReceivables: 0,
        overduePayables: 0,
        paidThisMonth: 0,
        receivedThisMonth: 0,
        sentReceivables: 0,
      },
    ),
    safeExecutiveSource(
      "finance-ageing",
      "Finance ageing",
      fetchOpsFinanceAgeingDashboard,
      {
        asOfDate: today,
        attentionItems: [],
        buckets: [],
        dueSoonAmount: 0,
        overdueAmount: 0,
        totalUnpaid: 0,
      },
    ),
    safeExecutiveSource(
      "budget-variance",
      "Budget variance",
      fetchOpsBudgetVarianceDashboard,
      {
        overBudgetAmount: 0,
        rows: [],
        totalBudgetedAmount: 0,
        totalCommittedAmount: 0,
        totalExposureAmount: 0,
        totalPostedAmount: 0,
        totalRemainingAmount: 0,
      },
    ),
    safeExecutiveSource(
      "commercial-margin",
      "Commercial margin",
      fetchOpsCommercialMarginReport,
      {
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
    ),
    safeExecutiveSource(
      "commercial-forecast",
      "Commercial forecast",
      () => fetchOpsCommercialForecastReport(today),
      {
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
    ),
    safeExecutiveSource(
      "delivery",
      "Delivery exceptions",
      fetchOpsDeliveryExceptionFollowUpDashboard,
      {
        ageingAlerts: [],
        asOfDate: today,
        buckets: [],
        highRiskActionable: 0,
        overdueActionable: 0,
        staleNoDueActionable: 0,
        supplierFollowUps: [],
        totalActionable: 0,
      },
    ),
    safeExecutiveSource(
      "procurement",
      "Procurement",
      fetchOpsRfqPoStats,
      {
        awardedRfqs: 0,
        draftPurchaseOrders: 0,
        issuedRfqs: 0,
        openRfqs: 0,
        receivedQuotes: 0,
      },
    ),
    safeExecutiveSource(
      "equipment",
      "Equipment",
      fetchOpsEquipmentUtilizationDashboard,
      {
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
    ),
    safeExecutiveSource(
      "fleet",
      "Fleet and logistics",
      fetchOpsFleetMobilizationDashboard,
      {
        activeLabour: 0,
        activeStays: 0,
        dueThisWeekTrips: 0,
        mobilizationRows: [],
        overdueTrips: 0,
        scheduledTrips: 0,
        tripRows: [],
      },
    ),
    safeExecutiveSource(
      "engineering",
      "Engineering",
      fetchOpsEngineeringControlStats,
      {
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
    ),
    safeExecutiveSource(
      "hr",
      "HR",
      fetchOpsHrStats,
      {
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
    ),
    safeExecutiveSource(
      "hse",
      "HSE",
      () => fetchOpsHseExecutiveSafetyRollup({ enforceAccess: false }),
      zeroHse,
    ),
    safeExecutiveSource(
      "hse-email",
      "HSE email delivery",
      fetchOpsHseEmailDeliveryReport,
      {
        configured: false,
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
    ),
  ]);

  return buildOpsExecutiveDashboardReport(
    {
      approvals: approvals.data,
      budgetVariance: budgetVariance.data,
      cashflow: cashflow.data,
      commercialForecast: commercialForecast.data,
      commercialMargin: commercialMargin.data,
      deliveryFollowUp: deliveryFollowUp.data,
      engineering: engineering.data,
      equipment: equipment.data,
      financeAgeing: financeAgeing.data,
      fleet: fleet.data,
      hr: hr.data,
      hse: hse.data,
      hseEmail: hseEmail.data,
      rfqPo: rfqPo.data,
      sourceHealth: [
        approvals.health,
        cashflow.health,
        financeAgeing.health,
        budgetVariance.health,
        commercialMargin.health,
        commercialForecast.health,
        deliveryFollowUp.health,
        rfqPo.health,
        equipment.health,
        fleet.health,
        engineering.health,
        hr.health,
        hse.health,
        hseEmail.health,
      ],
    },
    today,
  );
}
