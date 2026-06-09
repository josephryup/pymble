import type {
  OpsProgrammeMilestoneStatus,
  OpsQaFindingCategory,
  OpsQaInspectionItemResult,
} from "@/lib/ops/types";

export type OpsEngineeringProgrammeMilestoneSource = {
  actual_date: string | null;
  baseline_date: string;
  delay_reason: string;
  forecast_date: string | null;
  milestone_number: string;
  progress_percent: number | string;
  site?: {
    code: string;
    id: string;
    name: string;
  } | null;
  site_id: string;
  status: OpsProgrammeMilestoneStatus;
  title: string;
};

export type OpsEngineeringProgrammeSiteRow = {
  completed: number;
  delayed: number;
  forecast_slip_days: number;
  milestones: number;
  next_due_date: string | null;
  overdue: number;
  progress_percent: number;
  site_code: string;
  site_id: string;
  site_name: string;
};

export type OpsEngineeringProgrammePressureReport = {
  siteRows: OpsEngineeringProgrammeSiteRow[];
  totals: {
    completedMilestones: number;
    delayedMilestones: number;
    dueThisWeek: number;
    forecastSlipDays: number;
    milestones: number;
    overdueMilestones: number;
    plannedMilestones: number;
  };
};

export type OpsEngineeringQaCategorySource = {
  action_required: boolean;
  finding_category?: OpsQaFindingCategory | null;
  result: OpsQaInspectionItemResult;
};

export type OpsEngineeringQaCategoryRow = {
  action_required: number;
  category: OpsQaFindingCategory;
  failed: number;
  observations: number;
  total: number;
};

const QA_CATEGORIES: OpsQaFindingCategory[] = [
  "workmanship",
  "material",
  "design",
  "safety",
  "environmental",
  "documentation",
  "dimensional",
  "testing",
  "coordination",
  "other",
];

function normalizeNumber(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

function dateOnly(value: string | null | undefined) {
  return value ? value.slice(0, 10) : null;
}

function dateDiffDays(left: string, right: string) {
  const [leftYear, leftMonth, leftDay] = left.split("-").map(Number);
  const [rightYear, rightMonth, rightDay] = right.split("-").map(Number);
  const leftUtc = Date.UTC(leftYear, leftMonth - 1, leftDay);
  const rightUtc = Date.UTC(rightYear, rightMonth - 1, rightDay);

  return Math.round((leftUtc - rightUtc) / 86_400_000);
}

function isOpenProgrammeStatus(status: OpsProgrammeMilestoneStatus) {
  return status === "planned" || status === "on_track" || status === "delayed";
}

function nextProgrammeDate(row: OpsEngineeringProgrammeMilestoneSource) {
  return dateOnly(row.forecast_date) ?? dateOnly(row.baseline_date);
}

function forecastSlipDays(row: OpsEngineeringProgrammeMilestoneSource) {
  const forecastDate = dateOnly(row.forecast_date);
  const baselineDate = dateOnly(row.baseline_date);

  if (!forecastDate || !baselineDate) {
    return 0;
  }

  return Math.max(dateDiffDays(forecastDate, baselineDate), 0);
}

function siteKey(row: OpsEngineeringProgrammeMilestoneSource) {
  return row.site?.id ?? row.site_id;
}

export function buildOpsEngineeringProgrammePressureReport({
  milestones,
  todayDate,
}: {
  milestones: OpsEngineeringProgrammeMilestoneSource[];
  todayDate: string;
}): OpsEngineeringProgrammePressureReport {
  const siteRows = new Map<string, OpsEngineeringProgrammeSiteRow & { progress_total: number }>();
  const totals = {
    completedMilestones: 0,
    delayedMilestones: 0,
    dueThisWeek: 0,
    forecastSlipDays: 0,
    milestones: milestones.length,
    overdueMilestones: 0,
    plannedMilestones: 0,
  };

  milestones.forEach((milestone) => {
    const nextDate = nextProgrammeDate(milestone);
    const open = isOpenProgrammeStatus(milestone.status);
    const daysUntilDue = nextDate ? dateDiffDays(nextDate, todayDate) : null;
    const slipDays = forecastSlipDays(milestone);
    const key = siteKey(milestone);
    const existing = siteRows.get(key) ?? {
      completed: 0,
      delayed: 0,
      forecast_slip_days: 0,
      milestones: 0,
      next_due_date: null,
      overdue: 0,
      progress_percent: 0,
      progress_total: 0,
      site_code: milestone.site?.code ?? "SITE",
      site_id: key,
      site_name: milestone.site?.name ?? "Unassigned site",
    };

    existing.milestones += 1;
    existing.progress_total += normalizeNumber(milestone.progress_percent);
    existing.forecast_slip_days += slipDays;

    if (milestone.status === "completed") {
      existing.completed += 1;
      totals.completedMilestones += 1;
    }

    if (milestone.status === "delayed") {
      existing.delayed += 1;
      totals.delayedMilestones += 1;
    }

    if (milestone.status === "planned") {
      totals.plannedMilestones += 1;
    }

    if (open && daysUntilDue !== null && daysUntilDue < 0) {
      existing.overdue += 1;
      totals.overdueMilestones += 1;
    }

    if (open && daysUntilDue !== null && daysUntilDue >= 0 && daysUntilDue <= 7) {
      totals.dueThisWeek += 1;
    }

    if (open && nextDate && (!existing.next_due_date || nextDate < existing.next_due_date)) {
      existing.next_due_date = nextDate;
    }

    totals.forecastSlipDays += slipDays;
    siteRows.set(key, existing);
  });

  return {
    siteRows: [...siteRows.values()]
      .map(({ progress_total, ...site }) => ({
        ...site,
        progress_percent: site.milestones > 0 ? progress_total / site.milestones : 0,
      }))
      .sort((a, b) => {
        if (b.overdue !== a.overdue) {
          return b.overdue - a.overdue;
        }

        if (b.delayed !== a.delayed) {
          return b.delayed - a.delayed;
        }

        return (a.next_due_date ?? "9999-12-31").localeCompare(b.next_due_date ?? "9999-12-31");
      })
      .slice(0, 8),
    totals,
  };
}

export function buildOpsEngineeringQaCategoryReport(
  items: OpsEngineeringQaCategorySource[],
): OpsEngineeringQaCategoryRow[] {
  const rows = new Map<OpsQaFindingCategory, OpsEngineeringQaCategoryRow>();

  QA_CATEGORIES.forEach((category) => {
    rows.set(category, {
      action_required: 0,
      category,
      failed: 0,
      observations: 0,
      total: 0,
    });
  });

  items.forEach((item) => {
    const category = item.finding_category ?? "other";
    const row = rows.get(category) ?? rows.get("other");

    if (!row) {
      return;
    }

    row.total += 1;
    row.action_required += item.action_required ? 1 : 0;
    row.failed += item.result === "fail" ? 1 : 0;
    row.observations += item.result === "observation" ? 1 : 0;
  });

  return [...rows.values()]
    .filter((row) => row.total > 0)
    .sort((a, b) => {
      if (b.action_required !== a.action_required) {
        return b.action_required - a.action_required;
      }

      if (b.failed !== a.failed) {
        return b.failed - a.failed;
      }

      return b.total - a.total;
    });
}
