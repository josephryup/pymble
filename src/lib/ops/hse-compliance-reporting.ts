import type {
  OpsHseComplianceAuditSummary,
  OpsHseRiskAssessmentSummary,
} from "@/lib/ops/hse-compliance";
import type { OpsHseIncidentSeverity } from "@/lib/ops/types";

export const OPS_HSE_RISK_LEVELS: OpsHseIncidentSeverity[] = [
  "low",
  "medium",
  "high",
  "critical",
];

export type OpsHseRiskHeatmapCell = {
  approvedCount: number;
  count: number;
  initialRisk: OpsHseIncidentSeverity;
  residualRisk: OpsHseIncidentSeverity;
  reviewDueCount: number;
  submittedCount: number;
};

export type OpsHseRiskHeatmap = {
  cells: OpsHseRiskHeatmapCell[];
  criticalResidualCount: number;
  highResidualCount: number;
  matrix: OpsHseRiskHeatmapCell[][];
  reviewDueCount: number;
  submittedCount: number;
  totalActive: number;
};

export type OpsHseAuditEscalationBucket =
  | "action_required"
  | "completed_with_ncs"
  | "due_soon"
  | "overdue";

export type OpsHseAuditEscalationItem = {
  audit: OpsHseComplianceAuditSummary;
  bucket: OpsHseAuditEscalationBucket;
};

export type OpsHseAuditEscalationSummary = {
  counts: Record<OpsHseAuditEscalationBucket, number>;
  items: OpsHseAuditEscalationItem[];
};

const ACTIVE_RISK_STATUSES = new Set<OpsHseRiskAssessmentSummary["status"]>([
  "approved",
  "draft",
  "submitted",
]);

const AUDIT_BUCKET_PRIORITY: Record<OpsHseAuditEscalationBucket, number> = {
  action_required: 0,
  overdue: 1,
  due_soon: 2,
  completed_with_ncs: 3,
};

function addDays(date: string, days: number) {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function emptyRiskHeatmapCell(
  initialRisk: OpsHseIncidentSeverity,
  residualRisk: OpsHseIncidentSeverity,
): OpsHseRiskHeatmapCell {
  return {
    approvedCount: 0,
    count: 0,
    initialRisk,
    residualRisk,
    reviewDueCount: 0,
    submittedCount: 0,
  };
}

function isRiskReviewDue(
  assessment: OpsHseRiskAssessmentSummary,
  dueSoonDate: string,
) {
  return (
    assessment.status === "approved" &&
    Boolean(assessment.review_date) &&
    assessment.review_date! <= dueSoonDate
  );
}

export function buildOpsHseRiskHeatmap(
  assessments: OpsHseRiskAssessmentSummary[],
  today: string,
  dueSoonDays = 30,
): OpsHseRiskHeatmap {
  const dueSoonDate = addDays(today, dueSoonDays);
  const matrix = OPS_HSE_RISK_LEVELS.map((initialRisk) =>
    OPS_HSE_RISK_LEVELS.map((residualRisk) => emptyRiskHeatmapCell(initialRisk, residualRisk)),
  );
  const cellByKey = new Map(
    matrix.flat().map((cell) => [`${cell.initialRisk}:${cell.residualRisk}`, cell]),
  );
  let criticalResidualCount = 0;
  let highResidualCount = 0;
  let reviewDueCount = 0;
  let submittedCount = 0;
  let totalActive = 0;

  assessments.forEach((assessment) => {
    if (!ACTIVE_RISK_STATUSES.has(assessment.status)) {
      return;
    }

    const cell = cellByKey.get(`${assessment.initial_risk}:${assessment.residual_risk}`);

    if (!cell) {
      return;
    }

    totalActive += 1;
    cell.count += 1;

    if (assessment.status === "approved") {
      cell.approvedCount += 1;
    }

    if (assessment.status === "submitted") {
      submittedCount += 1;
      cell.submittedCount += 1;
    }

    if (assessment.residual_risk === "critical") {
      criticalResidualCount += 1;
    }

    if (assessment.residual_risk === "critical" || assessment.residual_risk === "high") {
      highResidualCount += 1;
    }

    if (isRiskReviewDue(assessment, dueSoonDate)) {
      reviewDueCount += 1;
      cell.reviewDueCount += 1;
    }
  });

  return {
    cells: matrix.flat(),
    criticalResidualCount,
    highResidualCount,
    matrix,
    reviewDueCount,
    submittedCount,
    totalActive,
  };
}

function classifyAuditEscalation(
  audit: OpsHseComplianceAuditSummary,
  today: string,
  dueSoonDate: string,
): OpsHseAuditEscalationBucket | null {
  if (audit.status === "action_required") {
    return "action_required";
  }

  if (audit.status === "planned") {
    if (audit.scheduled_date < today) {
      return "overdue";
    }

    if (audit.scheduled_date <= dueSoonDate) {
      return "due_soon";
    }
  }

  if (audit.status === "completed" && audit.non_conformance_count > 0) {
    return "completed_with_ncs";
  }

  return null;
}

export function buildOpsHseAuditEscalations(
  audits: OpsHseComplianceAuditSummary[],
  today: string,
  dueSoonDays = 14,
): OpsHseAuditEscalationSummary {
  const dueSoonDate = addDays(today, dueSoonDays);
  const counts: Record<OpsHseAuditEscalationBucket, number> = {
    action_required: 0,
    completed_with_ncs: 0,
    due_soon: 0,
    overdue: 0,
  };
  const items = audits.reduce<OpsHseAuditEscalationItem[]>((acc, audit) => {
    const bucket = classifyAuditEscalation(audit, today, dueSoonDate);

    if (!bucket) {
      return acc;
    }

    counts[bucket] += 1;
    acc.push({ audit, bucket });
    return acc;
  }, []);

  items.sort((left, right) => {
    const bucketPriority = AUDIT_BUCKET_PRIORITY[left.bucket] - AUDIT_BUCKET_PRIORITY[right.bucket];

    if (bucketPriority !== 0) {
      return bucketPriority;
    }

    return left.audit.scheduled_date.localeCompare(right.audit.scheduled_date);
  });

  return { counts, items };
}
