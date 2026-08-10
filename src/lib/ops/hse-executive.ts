import { requireOpsUser } from "@/lib/ops/auth";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import {
  OPS_HSE_ESCALATION_NOTIFICATION_ROLES,
  OPS_HSE_REVIEW_NOTIFICATION_ROLES,
  OPS_HSE_TRAINING_RENEWAL_NOTIFICATION_ROLES,
  queueOpsHseRoleNotifications,
  queueOpsHseUserNotification,
} from "@/lib/ops/hse-notifications";
import { canViewOpsHse } from "@/lib/ops/hse-permissions";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type { OpsHseIncidentSeverity, OpsPriority } from "@/lib/ops/types";

export type OpsHseExecutivePressureLevel = "steady" | "urgent" | "watch";

export type OpsHseExecutiveSafetySignals = {
  actionRequiredAudits: number;
  actionRequiredIncidents: number;
  agedOpenIncidents: number;
  auditsDueSoon: number;
  auditsOverdue: number;
  completedActionsAwaitingVerification: number;
  dueSoonCorrectiveActions: number;
  expiredTraining: number;
  highCriticalOpenIncidents: number;
  highPriorityOpenActions: number;
  highResidualRiskAssessments: number;
  inspectionsActionRequired: number;
  inspectionsOverdue: number;
  openCorrectiveActions: number;
  openIncidents: number;
  openInspectionFindings: number;
  overdueCorrectiveActions: number;
  reviewDueRiskAssessments: number;
  submittedRiskAssessments: number;
  trainingDueSoon: number;
  zeroStockPpeItems: number;
};

export type OpsHseExecutiveSignal = {
  href: string;
  label: string;
  tone: "default" | "urgent" | "watch";
  value: number;
};

export type OpsHseExecutiveTrendSnapshot = {
  detail: string;
  href: string;
  label: string;
  tone: OpsHseExecutiveSignal["tone"];
  value: string;
};

export type OpsHseExecutiveSafetyRollup = {
  escalationSignals: OpsHseExecutiveSignal[];
  generatedAt: string;
  headline: string;
  pressureLevel: OpsHseExecutivePressureLevel;
  pressureScore: number;
  signals: OpsHseExecutiveSafetySignals;
  today: string;
  trendSnapshots: OpsHseExecutiveTrendSnapshot[];
};

type CountQueryResult = {
  count: number | null;
  error: { code?: string; message?: string } | null;
};

type SweepIncident = {
  id: string;
  incident_number: string;
  occurred_at: string;
  severity: OpsHseIncidentSeverity;
  title: string;
};

type SweepCorrectiveAction = {
  action_number: string;
  due_date: string | null;
  id: string;
  owner_id: string | null;
  priority: OpsPriority;
  title: string;
};

type SweepRiskAssessment = {
  assessment_number: string;
  id: string;
  residual_risk: OpsHseIncidentSeverity;
  responsible_user_id: string | null;
  review_date: string | null;
  title: string;
};

type SweepComplianceAudit = {
  auditor_id: string | null;
  audit_number: string;
  id: string;
  scheduled_date: string;
  status: "action_required" | "planned";
  title: string;
};

type SweepSafetyTrainingRecord = {
  employee: {
    user_id: string | null;
  } | null;
  employee_id: string | null;
  expiry_date: string | null;
  id: string;
  status: "completed" | "expired";
  trainee_name: string;
  training_number: string;
  training_title: string;
};

export type OpsHseScheduledEscalationSweepResult = {
  actionRequiredAudits: number;
  expiredTraining: number;
  highSeverityIncidents: number;
  notificationsQueued: number;
  overdueAudits: number;
  overdueCorrectiveActions: number;
  reviewDueRiskAssessments: number;
  trainingDueSoon: number;
  today: string;
};

const ZERO_SIGNALS: OpsHseExecutiveSafetySignals = {
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

function isMissingHseExecutiveTable(error: { code?: string; message?: string } | null | undefined) {
  return Boolean(
    error &&
      (error.code === "42P01" ||
        error.code === "PGRST200" ||
        error.code === "PGRST205" ||
        /hse_incidents|corrective_actions|hse_inspections|hse_inspection_findings|safety_training_records|ppe_items|hse_risk_assessments|hse_compliance_audits|schema cache/i.test(
          error.message ?? "",
        )),
  );
}

function addDays(date: string, days: number) {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function todayInLusaka() {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Africa/Lusaka",
    year: "numeric",
  }).format(new Date());
}

async function countByQuery(
  buildQuery: (
    supabase: ReturnType<typeof getOpsSupabaseServiceClient>,
  ) => PromiseLike<CountQueryResult>,
) {
  const supabase = getOpsSupabaseServiceClient();
  const { count, error } = await buildQuery(supabase);

  if (isMissingHseExecutiveTable(error)) {
    return 0;
  }

  if (error) {
    throw error;
  }

  return count ?? 0;
}

function signalTone(value: number, urgent = false): OpsHseExecutiveSignal["tone"] {
  if (value <= 0) {
    return "default";
  }

  return urgent ? "urgent" : "watch";
}

function buildTrendSnapshots(signals: OpsHseExecutiveSafetySignals): OpsHseExecutiveTrendSnapshot[] {
  const compliancePressure =
    signals.actionRequiredAudits + signals.auditsOverdue + signals.auditsDueSoon;
  const correctiveActionPressure =
    signals.overdueCorrectiveActions +
    signals.dueSoonCorrectiveActions +
    signals.completedActionsAwaitingVerification;
  const trainingPressure = signals.expiredTraining + signals.trainingDueSoon;
  const fieldControlPressure =
    signals.inspectionsActionRequired +
    signals.inspectionsOverdue +
    signals.openInspectionFindings +
    signals.zeroStockPpeItems;

  return [
    {
      detail: `${signals.agedOpenIncidents} aged over 7 days / ${signals.actionRequiredIncidents} action required`,
      href: "/ops/hse#incident-register",
      label: "Incident backlog",
      tone: signalTone(signals.highCriticalOpenIncidents + signals.actionRequiredIncidents, true),
      value: String(signals.openIncidents),
    },
    {
      detail: `${signals.overdueCorrectiveActions} overdue / ${signals.dueSoonCorrectiveActions} due this week`,
      href: "/ops/hse#incident-register",
      label: "Corrective actions",
      tone: signalTone(signals.overdueCorrectiveActions, true),
      value: String(correctiveActionPressure),
    },
    {
      detail: `${signals.auditsOverdue} overdue / ${signals.actionRequiredAudits} action required / ${signals.auditsDueSoon} due soon`,
      href: "/ops/hse-compliance?tab=risk#audit-panel",
      label: "Compliance watch",
      tone: signalTone(signals.actionRequiredAudits + signals.auditsOverdue, true),
      value: String(compliancePressure),
    },
    {
      detail: `${signals.expiredTraining} expired / ${signals.trainingDueSoon} due within 30 days`,
      href: "/ops/hse-compliance?tab=training#training-panel",
      label: "Training readiness",
      tone: signalTone(signals.expiredTraining, true),
      value: String(trainingPressure),
    },
    {
      detail: `${signals.inspectionsActionRequired} inspections need action / ${signals.zeroStockPpeItems} PPE items at zero stock`,
      href: "/ops/hse-compliance?tab=training#inspection-panel",
      label: "Field controls",
      tone: signalTone(
        signals.inspectionsActionRequired + signals.inspectionsOverdue + signals.zeroStockPpeItems,
        true,
      ),
      value: String(fieldControlPressure),
    },
  ];
}

export function buildOpsHseExecutiveSafetyRollup(
  signals: OpsHseExecutiveSafetySignals,
  today: string,
  generatedAt = new Date().toISOString(),
): OpsHseExecutiveSafetyRollup {
  const criticalPressure =
    signals.highCriticalOpenIncidents +
    signals.actionRequiredIncidents +
    signals.overdueCorrectiveActions +
    signals.actionRequiredAudits +
    signals.auditsOverdue;
  const watchPressure =
    signals.openIncidents +
    signals.dueSoonCorrectiveActions +
    signals.reviewDueRiskAssessments +
    signals.highResidualRiskAssessments +
    signals.submittedRiskAssessments +
    signals.inspectionsActionRequired +
    signals.expiredTraining +
    signals.zeroStockPpeItems;
  const pressureScore = Math.min(
    100,
    signals.highCriticalOpenIncidents * 18 +
      signals.actionRequiredIncidents * 12 +
      signals.overdueCorrectiveActions * 12 +
      signals.highPriorityOpenActions * 10 +
      signals.actionRequiredAudits * 10 +
      signals.auditsOverdue * 8 +
      signals.highResidualRiskAssessments * 7 +
      signals.inspectionsActionRequired * 6 +
      signals.expiredTraining * 4 +
      signals.zeroStockPpeItems * 3,
  );
  const pressureLevel: OpsHseExecutivePressureLevel =
    criticalPressure > 0 || pressureScore >= 55 ? "urgent" : watchPressure > 0 ? "watch" : "steady";
  const headline =
    pressureLevel === "urgent"
      ? "Immediate HSE leadership attention required."
      : pressureLevel === "watch"
        ? "HSE controls are active with items to watch."
        : "No urgent HSE escalation signals.";

  return {
    escalationSignals: [
      {
        href: "/ops/hse?severity=high#incident-register",
        label: "High/critical open incidents",
        tone: signalTone(signals.highCriticalOpenIncidents, true),
        value: signals.highCriticalOpenIncidents,
      },
      {
        href: "/ops/hse#incident-register",
        label: "Overdue corrective actions",
        tone: signalTone(signals.overdueCorrectiveActions, true),
        value: signals.overdueCorrectiveActions,
      },
      {
        href: "/ops/hse-compliance?tab=risk#audit-panel",
        label: "Audit actions",
        tone: signalTone(signals.actionRequiredAudits + signals.auditsOverdue, true),
        value: signals.actionRequiredAudits + signals.auditsOverdue,
      },
      {
        href: "/ops/hse-compliance?tab=risk#risk-assessment-panel",
        label: "Risk reviews due",
        tone: signalTone(signals.reviewDueRiskAssessments),
        value: signals.reviewDueRiskAssessments,
      },
      {
        href: "/ops/hse-compliance?tab=training#inspection-panel",
        label: "Inspection pressure",
        tone: signalTone(signals.inspectionsActionRequired + signals.inspectionsOverdue, true),
        value: signals.inspectionsActionRequired + signals.inspectionsOverdue,
      },
      {
        href: "/ops/hse-compliance?tab=training#training-panel",
        label: "Training expired",
        tone: signalTone(signals.expiredTraining, true),
        value: signals.expiredTraining,
      },
    ],
    generatedAt,
    headline,
    pressureLevel,
    pressureScore,
    signals,
    today,
    trendSnapshots: buildTrendSnapshots(signals),
  };
}

export async function fetchOpsHseExecutiveSafetyRollup(options: { enforceAccess?: boolean } = {}) {
  const enforceAccess = options.enforceAccess ?? true;

  if (enforceAccess) {
    const { profile } = await requireOpsUser();

    if (!canViewOpsHse(profile.role)) {
      return buildOpsHseExecutiveSafetyRollup(ZERO_SIGNALS, todayInLusaka());
    }
  }

  const today = todayInLusaka();
  const dueSoon7 = addDays(today, 7);
  const dueSoon14 = addDays(today, 14);
  const dueSoon30 = addDays(today, 30);
  const agedIncidentCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [
    openIncidents,
    highCriticalOpenIncidents,
    actionRequiredIncidents,
    agedOpenIncidents,
    openCorrectiveActions,
    overdueCorrectiveActions,
    dueSoonCorrectiveActions,
    completedActionsAwaitingVerification,
    highPriorityOpenActions,
    submittedRiskAssessments,
    highResidualRiskAssessments,
    reviewDueRiskAssessments,
    actionRequiredAudits,
    auditsOverdue,
    auditsDueSoon,
    inspectionsActionRequired,
    inspectionsOverdue,
    openInspectionFindings,
    expiredTrainingMarked,
    expiredTrainingByDate,
    trainingDueSoon,
    zeroStockPpeItems,
  ] = await Promise.all([
    countByQuery((supabase) =>
      supabase
        .from("hse_incidents")
        .select("id", { count: "exact", head: true })
        .in("status", ["reported", "investigating", "action_required"]),
    ),
    countByQuery((supabase) =>
      supabase
        .from("hse_incidents")
        .select("id", { count: "exact", head: true })
        .in("status", ["reported", "investigating", "action_required"])
        .in("severity", ["high", "critical"]),
    ),
    countByQuery((supabase) =>
      supabase
        .from("hse_incidents")
        .select("id", { count: "exact", head: true })
        .eq("status", "action_required"),
    ),
    countByQuery((supabase) =>
      supabase
        .from("hse_incidents")
        .select("id", { count: "exact", head: true })
        .in("status", ["reported", "investigating", "action_required"])
        .lt("occurred_at", agedIncidentCutoff),
    ),
    countByQuery((supabase) =>
      supabase
        .from("corrective_actions")
        .select("id", { count: "exact", head: true })
        .in("status", ["open", "in_progress", "completed"]),
    ),
    countByQuery((supabase) =>
      supabase
        .from("corrective_actions")
        .select("id", { count: "exact", head: true })
        .in("status", ["open", "in_progress"])
        .lt("due_date", today),
    ),
    countByQuery((supabase) =>
      supabase
        .from("corrective_actions")
        .select("id", { count: "exact", head: true })
        .in("status", ["open", "in_progress"])
        .gte("due_date", today)
        .lte("due_date", dueSoon7),
    ),
    countByQuery((supabase) =>
      supabase.from("corrective_actions").select("id", { count: "exact", head: true }).eq("status", "completed"),
    ),
    countByQuery((supabase) =>
      supabase
        .from("corrective_actions")
        .select("id", { count: "exact", head: true })
        .in("status", ["open", "in_progress"])
        .in("priority", ["high", "urgent"]),
    ),
    countByQuery((supabase) =>
      supabase.from("hse_risk_assessments").select("id", { count: "exact", head: true }).eq("status", "submitted"),
    ),
    countByQuery((supabase) =>
      supabase
        .from("hse_risk_assessments")
        .select("id", { count: "exact", head: true })
        .eq("status", "approved")
        .in("residual_risk", ["high", "critical"]),
    ),
    countByQuery((supabase) =>
      supabase
        .from("hse_risk_assessments")
        .select("id", { count: "exact", head: true })
        .eq("status", "approved")
        .lte("review_date", dueSoon30),
    ),
    countByQuery((supabase) =>
      supabase
        .from("hse_compliance_audits")
        .select("id", { count: "exact", head: true })
        .eq("status", "action_required"),
    ),
    countByQuery((supabase) =>
      supabase
        .from("hse_compliance_audits")
        .select("id", { count: "exact", head: true })
        .eq("status", "planned")
        .lt("scheduled_date", today),
    ),
    countByQuery((supabase) =>
      supabase
        .from("hse_compliance_audits")
        .select("id", { count: "exact", head: true })
        .eq("status", "planned")
        .gte("scheduled_date", today)
        .lte("scheduled_date", dueSoon14),
    ),
    countByQuery((supabase) =>
      supabase
        .from("hse_inspections")
        .select("id", { count: "exact", head: true })
        .eq("status", "action_required"),
    ),
    countByQuery((supabase) =>
      supabase
        .from("hse_inspections")
        .select("id", { count: "exact", head: true })
        .in("status", ["planned", "action_required"])
        .lt("scheduled_date", today),
    ),
    countByQuery((supabase) =>
      supabase
        .from("hse_inspection_findings")
        .select("id", { count: "exact", head: true })
        .in("status", ["open", "in_progress", "corrected"]),
    ),
    countByQuery((supabase) =>
      supabase.from("safety_training_records").select("id", { count: "exact", head: true }).eq("status", "expired"),
    ),
    countByQuery((supabase) =>
      supabase
        .from("safety_training_records")
        .select("id", { count: "exact", head: true })
        .eq("status", "completed")
        .lt("expiry_date", today),
    ),
    countByQuery((supabase) =>
      supabase
        .from("safety_training_records")
        .select("id", { count: "exact", head: true })
        .eq("status", "completed")
        .gte("expiry_date", today)
        .lte("expiry_date", dueSoon30),
    ),
    countByQuery((supabase) =>
      supabase
        .from("ppe_items")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true)
        .eq("stock_on_hand", 0),
    ),
  ]);

  return buildOpsHseExecutiveSafetyRollup(
    {
      actionRequiredAudits,
      actionRequiredIncidents,
      agedOpenIncidents,
      auditsDueSoon,
      auditsOverdue,
      completedActionsAwaitingVerification,
      dueSoonCorrectiveActions,
      expiredTraining: expiredTrainingMarked + expiredTrainingByDate,
      highCriticalOpenIncidents,
      highPriorityOpenActions,
      highResidualRiskAssessments,
      inspectionsActionRequired,
      inspectionsOverdue,
      openCorrectiveActions,
      openIncidents,
      openInspectionFindings,
      overdueCorrectiveActions,
      reviewDueRiskAssessments,
      submittedRiskAssessments,
      trainingDueSoon,
      zeroStockPpeItems,
    },
    today,
  );
}

async function fetchSweepRows<T>(
  buildQuery: (supabase: ReturnType<typeof getOpsSupabaseServiceClient>) => PromiseLike<{
    data: unknown[] | null;
    error: { code?: string; message?: string } | null;
  }>,
) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await buildQuery(supabase);

  if (isMissingHseExecutiveTable(error)) {
    return [] as T[];
  }

  if (error) {
    throw error;
  }

  return (data ?? []) as T[];
}

async function safeQueue(task: () => Promise<number>) {
  try {
    return await task();
  } catch {
    return 0;
  }
}

export async function runOpsHseScheduledEscalationSweep(
  today = todayInLusaka(),
): Promise<OpsHseScheduledEscalationSweepResult> {
  const trainingDueSoonCutoff = addDays(today, 30);
  const [
    highSeverityIncidents,
    overdueCorrectiveActions,
    reviewDueRiskAssessments,
    overdueAudits,
    actionRequiredAudits,
    expiredTrainingMarked,
    expiredTrainingByDate,
    trainingDueSoon,
  ] = await Promise.all([
    fetchSweepRows<SweepIncident>((client) =>
      client
        .from("hse_incidents")
        .select("id, incident_number, title, severity, occurred_at")
        .in("status", ["reported", "investigating", "action_required"])
        .in("severity", ["high", "critical"])
        .order("occurred_at", { ascending: true })
        .limit(50),
    ),
    fetchSweepRows<SweepCorrectiveAction>((client) =>
      client
        .from("corrective_actions")
        .select("id, action_number, title, priority, due_date, owner_id")
        .in("status", ["open", "in_progress"])
        .lt("due_date", today)
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(50),
    ),
    fetchSweepRows<SweepRiskAssessment>((client) =>
      client
        .from("hse_risk_assessments")
        .select("id, assessment_number, title, residual_risk, review_date, responsible_user_id")
        .eq("status", "approved")
        .lte("review_date", today)
        .order("review_date", { ascending: true, nullsFirst: false })
        .limit(50),
    ),
    fetchSweepRows<SweepComplianceAudit>((client) =>
      client
        .from("hse_compliance_audits")
        .select("id, audit_number, title, scheduled_date, status, auditor_id")
        .eq("status", "planned")
        .lt("scheduled_date", today)
        .order("scheduled_date", { ascending: true })
        .limit(50),
    ),
    fetchSweepRows<SweepComplianceAudit>((client) =>
      client
        .from("hse_compliance_audits")
        .select("id, audit_number, title, scheduled_date, status, auditor_id")
        .eq("status", "action_required")
        .order("scheduled_date", { ascending: true })
        .limit(50),
    ),
    fetchSweepRows<SweepSafetyTrainingRecord>((client) =>
      client
        .from("safety_training_records")
        .select(
          "id, training_number, training_title, trainee_name, employee_id, expiry_date, status, employee:employees!safety_training_records_employee_id_fkey(user_id)",
        )
        .eq("status", "expired")
        .order("expiry_date", { ascending: true, nullsFirst: false })
        .limit(50),
    ),
    fetchSweepRows<SweepSafetyTrainingRecord>((client) =>
      client
        .from("safety_training_records")
        .select(
          "id, training_number, training_title, trainee_name, employee_id, expiry_date, status, employee:employees!safety_training_records_employee_id_fkey(user_id)",
        )
        .eq("status", "completed")
        .lt("expiry_date", today)
        .order("expiry_date", { ascending: true })
        .limit(50),
    ),
    fetchSweepRows<SweepSafetyTrainingRecord>((client) =>
      client
        .from("safety_training_records")
        .select(
          "id, training_number, training_title, trainee_name, employee_id, expiry_date, status, employee:employees!safety_training_records_employee_id_fkey(user_id)",
        )
        .eq("status", "completed")
        .gte("expiry_date", today)
        .lte("expiry_date", trainingDueSoonCutoff)
        .order("expiry_date", { ascending: true })
        .limit(50),
    ),
  ]);
  const expiredTraining = [...expiredTrainingMarked, ...expiredTrainingByDate];

  const queuedCounts = await Promise.all([
    ...highSeverityIncidents.map((incident) =>
      safeQueue(() =>
        queueOpsHseRoleNotifications({
          actionHref: "/ops/hse?severity=high#incident-register",
          body: `${incident.incident_number} remains open with ${incident.severity} severity.`,
          idempotencyKeyPrefix: `hse-sweep-high-incident:${today}:${incident.id}`,
          moduleKey: "hse",
          recipientRoles: OPS_HSE_ESCALATION_NOTIFICATION_ROLES,
          sendCriticalEmail: true,
          sourceId: incident.id,
          sourceTable: "hse_incidents",
          title: "Open high severity incident",
        }),
      ),
    ),
    ...overdueCorrectiveActions.flatMap((action) => [
      safeQueue(() =>
        queueOpsHseUserNotification({
          actionHref: "/ops/hse#incident-register",
          body: `${action.action_number} is overdue for HSE corrective action.`,
          idempotencyKeyPrefix: `hse-sweep-overdue-action-owner:${today}:${action.id}`,
          moduleKey: "hse",
          recipientId: action.owner_id,
          sendCriticalEmail: true,
          sourceId: action.id,
          sourceTable: "corrective_actions",
          title: "Overdue HSE corrective action",
        }),
      ),
      safeQueue(() =>
        queueOpsHseRoleNotifications({
          actionHref: "/ops/hse#incident-register",
          body: `${action.action_number} is overdue for HSE corrective action.`,
          idempotencyKeyPrefix: `hse-sweep-overdue-action:${today}:${action.id}`,
          moduleKey: "hse",
          recipientRoles: OPS_HSE_ESCALATION_NOTIFICATION_ROLES,
          sendCriticalEmail: true,
          sourceId: action.id,
          sourceTable: "corrective_actions",
          title: "Overdue HSE corrective action",
        }),
      ),
    ]),
    ...reviewDueRiskAssessments.flatMap((assessment) => [
      safeQueue(() =>
        queueOpsHseUserNotification({
          actionHref: "/ops/hse-compliance?tab=risk#risk-assessment-panel",
          body: `${assessment.assessment_number} is due for risk review.`,
          idempotencyKeyPrefix: `hse-sweep-risk-review-owner:${today}:${assessment.id}`,
          moduleKey: "hse_compliance",
          recipientId: assessment.responsible_user_id,
          sourceId: assessment.id,
          sourceTable: "hse_risk_assessments",
          title: "Risk assessment review due",
        }),
      ),
      safeQueue(() =>
        queueOpsHseRoleNotifications({
          actionHref: "/ops/hse-compliance?tab=risk#risk-assessment-panel",
          body: `${assessment.assessment_number} is due for risk review.`,
          idempotencyKeyPrefix: `hse-sweep-risk-review:${today}:${assessment.id}`,
          moduleKey: "hse_compliance",
          recipientRoles: OPS_HSE_REVIEW_NOTIFICATION_ROLES,
          sourceId: assessment.id,
          sourceTable: "hse_risk_assessments",
          title: "Risk assessment review due",
        }),
      ),
    ]),
    ...overdueAudits.flatMap((audit) => [
      safeQueue(() =>
        queueOpsHseUserNotification({
          actionHref: "/ops/hse-compliance?tab=risk#audit-panel",
          body: `${audit.audit_number} is overdue for compliance audit completion.`,
          idempotencyKeyPrefix: `hse-sweep-overdue-audit-owner:${today}:${audit.id}`,
          moduleKey: "hse_compliance",
          recipientId: audit.auditor_id,
          sendCriticalEmail: true,
          sourceId: audit.id,
          sourceTable: "hse_compliance_audits",
          title: "Overdue compliance audit",
        }),
      ),
      safeQueue(() =>
        queueOpsHseRoleNotifications({
          actionHref: "/ops/hse-compliance?tab=risk#audit-panel",
          body: `${audit.audit_number} is overdue for compliance audit completion.`,
          idempotencyKeyPrefix: `hse-sweep-overdue-audit:${today}:${audit.id}`,
          moduleKey: "hse_compliance",
          recipientRoles: OPS_HSE_ESCALATION_NOTIFICATION_ROLES,
          sendCriticalEmail: true,
          sourceId: audit.id,
          sourceTable: "hse_compliance_audits",
          title: "Overdue compliance audit",
        }),
      ),
    ]),
    ...actionRequiredAudits.flatMap((audit) => [
      safeQueue(() =>
        queueOpsHseUserNotification({
          actionHref: "/ops/hse-compliance?tab=risk#audit-panel",
          body: `${audit.audit_number} still requires HSE compliance action.`,
          idempotencyKeyPrefix: `hse-sweep-action-audit-owner:${today}:${audit.id}`,
          moduleKey: "hse_compliance",
          recipientId: audit.auditor_id,
          sendCriticalEmail: true,
          sourceId: audit.id,
          sourceTable: "hse_compliance_audits",
          title: "Audit action still required",
        }),
      ),
      safeQueue(() =>
        queueOpsHseRoleNotifications({
          actionHref: "/ops/hse-compliance?tab=risk#audit-panel",
          body: `${audit.audit_number} still requires HSE compliance action.`,
          idempotencyKeyPrefix: `hse-sweep-action-audit:${today}:${audit.id}`,
          moduleKey: "hse_compliance",
          recipientRoles: OPS_HSE_ESCALATION_NOTIFICATION_ROLES,
          sendCriticalEmail: true,
          sourceId: audit.id,
          sourceTable: "hse_compliance_audits",
          title: "Audit action still required",
        }),
      ),
    ]),
    ...expiredTraining.flatMap((training) => [
      safeQueue(() =>
        queueOpsHseUserNotification({
          actionHref: "/ops/profile#my-training",
          body: `${training.training_number} for ${training.training_title} is expired.`,
          idempotencyKeyPrefix: `hse-sweep-expired-training-employee:${today}:${training.id}`,
          moduleKey: "employees",
          recipientId: training.employee?.user_id,
          sourceId: training.id,
          sourceTable: "safety_training_records",
          title: "Safety training expired",
        }),
      ),
      safeQueue(() =>
        queueOpsHseRoleNotifications({
          actionHref: "/ops/employees?tab=admin#training-renewals",
          body: `${training.training_number} for ${training.trainee_name} is expired.`,
          idempotencyKeyPrefix: `hse-sweep-expired-training:${today}:${training.id}`,
          moduleKey: "employees",
          recipientRoles: OPS_HSE_TRAINING_RENEWAL_NOTIFICATION_ROLES,
          sourceId: training.id,
          sourceTable: "safety_training_records",
          title: "Safety training expired",
        }),
      ),
    ]),
    ...trainingDueSoon.flatMap((training) => [
      safeQueue(() =>
        queueOpsHseUserNotification({
          actionHref: "/ops/profile#my-training",
          body: `${training.training_number} for ${training.training_title} expires on ${
            training.expiry_date ?? "the recorded expiry date"
          }.`,
          idempotencyKeyPrefix: `hse-sweep-training-due-employee:${today}:${training.id}`,
          moduleKey: "employees",
          recipientId: training.employee?.user_id,
          sourceId: training.id,
          sourceTable: "safety_training_records",
          title: "Safety training renewal due",
        }),
      ),
      safeQueue(() =>
        queueOpsHseRoleNotifications({
          actionHref: "/ops/employees?tab=admin#training-renewals",
          body: `${training.training_number} for ${training.trainee_name} expires on ${
            training.expiry_date ?? "the recorded expiry date"
          }.`,
          idempotencyKeyPrefix: `hse-sweep-training-due:${today}:${training.id}`,
          moduleKey: "employees",
          recipientRoles: OPS_HSE_TRAINING_RENEWAL_NOTIFICATION_ROLES,
          sourceId: training.id,
          sourceTable: "safety_training_records",
          title: "Safety training renewal due",
        }),
      ),
    ]),
  ]);
  const result = {
    actionRequiredAudits: actionRequiredAudits.length,
    expiredTraining: expiredTraining.length,
    highSeverityIncidents: highSeverityIncidents.length,
    notificationsQueued: queuedCounts.reduce((total, count) => total + count, 0),
    overdueAudits: overdueAudits.length,
    overdueCorrectiveActions: overdueCorrectiveActions.length,
    reviewDueRiskAssessments: reviewDueRiskAssessments.length,
    trainingDueSoon: trainingDueSoon.length,
    today,
  };

  await recordOpsAuditEvent({
    action: "hse_escalation_sweep.completed",
    entityType: "hse_escalation_sweep",
    metadata: result,
    moduleKey: "hse",
    summary: `HSE escalation sweep queued ${result.notificationsQueued} notifications`,
  }).catch(() => null);

  return result;
}
