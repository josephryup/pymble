import {
  departmentsExpectedToReport,
  OPS_DEPARTMENT_LABELS,
  OPS_DEPARTMENT_REPORTING_ROUTES,
  type OpsDepartmentKey,
  type OpsDepartmentReportScope,
} from "@/lib/ops/department-report-permissions";
import { queueOpsNotification } from "@/lib/ops/notifications";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type {
  OpsApprovalStatus,
  OpsDeliveryExceptionStatus,
  OpsMaterialRequestStatus,
  OpsPaymentRequestStatus,
  OpsPurchaseOrderStatus,
  OpsRfqStatus,
  OpsUserRole,
} from "@/lib/ops/types";

const OPS_ESCALATION_TIME_ZONE = "Africa/Lusaka";
const MAX_ESCALATION_RECORDS_PER_TABLE = 100;

export const OPS_ESCALATION_SLA_DAYS = {
  approvals: 2,
  deliveryExceptions: 2,
  departmentReports: 2,
  equipmentRequests: 2,
  leaveRequests: 2,
  materialRequests: 2,
  paymentRequests: 2,
  purchaseOrders: 1,
  rfqs: 2,
  subcontractorPayments: 2,
  transportRequests: 2,
} as const;

// Reporting cadence is weekly: reminders fire on Monday and Tuesday until
// last week's compiled department report exists.
export const OPS_REPORT_REMINDER_WEEKDAYS = [1, 2];

// Budget variance: alert when actual+committed cost exceeds the active budget by
// this fraction. 1.05 = 5% over budget triggers; tune via env if needed later.
export const OPS_BUDGET_VARIANCE_THRESHOLD = 1.05;

const LEADERSHIP_ESCALATION_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "general_manager",
  "owner",
  "manager",
];

const DELIVERY_ESCALATION_ROLES: OpsUserRole[] = [
  ...LEADERSHIP_ESCALATION_ROLES,
  "operations_manager",
  "projects_manager",
  "engineer",
  "supervisor",
];

const PROCUREMENT_ESCALATION_ROLES: OpsUserRole[] = [
  ...LEADERSHIP_ESCALATION_ROLES,
  "operations_manager",
  "projects_manager",
  "procurement_manager",
  "quantity_surveyor",
  "procurement",
  "procurement_assistant",
];

const FINANCE_ESCALATION_ROLES: OpsUserRole[] = [
  ...LEADERSHIP_ESCALATION_ROLES,
  "finance_manager",
  "accountant",
];

const PURCHASE_ORDER_ESCALATION_ROLES: OpsUserRole[] = [
  ...LEADERSHIP_ESCALATION_ROLES,
  "procurement_manager",
  "finance_manager",
];

// Equipment + transport request approvals (mirrors My Queue's
// OPERATIONS_APPROVERS / the equipment & fleet decision-role gates).
const OPERATIONS_ESCALATION_ROLES: OpsUserRole[] = [
  ...LEADERSHIP_ESCALATION_ROLES,
  "operations_manager",
  "projects_manager",
];

const HR_ESCALATION_ROLES: OpsUserRole[] = [
  ...LEADERSHIP_ESCALATION_ROLES,
  "human_resource",
  "hr",
];

type SupabaseServiceClient = ReturnType<typeof getOpsSupabaseServiceClient>;

type OpsEscalationReason = "overdue" | "stale";

type OpsEscalationAgeInput = {
  dueAt?: string | null;
  dueDate?: string | null;
  nowIso: string;
  staleAt?: string | null;
  staleBeforeDate?: string | null;
  staleBeforeIso?: string | null;
  staleDate?: string | null;
  todayIsoDate: string;
};

type OpsEscalationUser = {
  full_name: string | null;
  id: string;
  role: OpsUserRole;
};

type ApprovalEscalationRow = {
  created_at: string;
  due_at: string | null;
  id: string;
  module_key: string;
  requested_by: string | null;
  source_id: string;
  source_table: string;
  status: OpsApprovalStatus;
  submitted_at: string | null;
  title: string;
};

type ApprovalStepEscalationRow = {
  approval_request_id: string;
  approver_role: OpsUserRole | null;
  approver_user_id: string | null;
};

type MaterialRequestEscalationRow = {
  created_at: string;
  id: string;
  needed_by: string | null;
  request_number: string;
  requested_by: string | null;
  status: OpsMaterialRequestStatus;
  submitted_at: string | null;
  title: string;
};

type PaymentRequestEscalationRow = {
  created_at: string;
  due_date: string | null;
  id: string;
  request_number: string;
  requested_amount: number | string | null;
  requested_by: string | null;
  status: OpsPaymentRequestStatus;
  submitted_at: string | null;
  title: string;
};

type RfqEscalationRow = {
  created_at: string;
  created_by: string | null;
  id: string;
  issued_at: string | null;
  rfq_number: string;
  status: OpsRfqStatus;
  title: string;
};

type PurchaseOrderEscalationRow = {
  created_at: string;
  created_by: string | null;
  id: string;
  po_number: string;
  status: OpsPurchaseOrderStatus;
  title: string;
};

type DeliveryExceptionEscalationRow = {
  assigned_to: string | null;
  due_at: string | null;
  exception_number: string;
  id: string;
  reported_at: string;
  reported_by: string | null;
  severity: string;
  status: OpsDeliveryExceptionStatus;
  title: string;
};

type DepartmentReportEscalationRow = {
  department: OpsDepartmentKey;
  id: string;
  period: string;
  period_end_date: string;
  scope: OpsDepartmentReportScope;
  status: string;
  submitted_at: string | null;
  submitted_by: string | null;
  title: string;
};

type EquipmentRequestEscalationRow = {
  created_at: string;
  id: string;
  needed_from: string | null;
  request_number: string;
  requested_by: string | null;
  status: string;
  submitted_at: string | null;
  title: string;
};

type TransportRequestEscalationRow = {
  created_at: string;
  id: string;
  request_number: string;
  requested_by: string | null;
  requested_for: string | null;
  status: string;
  submitted_at: string | null;
  title: string;
};

type SubcontractorPaymentEscalationRow = {
  amount: number | string | null;
  created_at: string;
  id: string;
  payment_type: string;
  requested_by: string | null;
  scheduled_for: string | null;
  status: string;
};

type LeaveRequestEscalationRow = {
  created_at: string;
  created_by: string | null;
  id: string;
  leave_number: string;
  start_date: string | null;
  status: string;
  submitted_at: string | null;
};

type QueueEscalationInput = {
  actionHref: string;
  body: string;
  idempotencyBase: string;
  moduleKey: string;
  recipients: OpsEscalationUser[];
  // Null for reminders about records that don't exist yet (e.g. a missing
  // monthly report).
  sourceId: string | null;
  sourceTable: string;
  title: string;
};

export type OpsEscalationSnapshot = {
  staleApprovals: number;
  staleDeliveryExceptions: number;
  staleDepartmentReports: number;
  staleEquipmentRequests: number;
  staleLeaveRequests: number;
  staleMaterialRequests: number;
  stalePaymentRequests: number;
  staleRfqs: number;
  staleSubcontractorPayments: number;
  staleTransportRequests: number;
  stalePurchaseOrders: number;
  budgetVariance: number;
  total: number;
};

export type OpsEscalationSweepResult = {
  departmentReportReminders: number;
  escalated: OpsEscalationSnapshot;
  inspected: {
    approvals: number;
    deliveryExceptions: number;
    departmentReports: number;
    equipmentRequests: number;
    leaveRequests: number;
    materialRequests: number;
    paymentRequests: number;
    rfqs: number;
    purchaseOrders: number;
    subcontractorPayments: number;
    transportRequests: number;
    budgets: number;
  };
  notificationFailures: number;
  notificationsQueued: number;
  ranAt: string;
};

export function getOpsEscalationTodayKey(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: OPS_ESCALATION_TIME_ZONE,
    year: "numeric",
  }).format(now);
}

export function getOpsEscalationDateDaysAgo(days: number, now = new Date()) {
  const today = new Date(`${getOpsEscalationTodayKey(now)}T00:00:00+02:00`);
  today.setDate(today.getDate() - days);

  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: OPS_ESCALATION_TIME_ZONE,
    year: "numeric",
  }).format(today);
}

export function getOpsEscalationIsoDaysAgo(days: number, now = new Date()) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

export function classifyOpsEscalationAge(input: OpsEscalationAgeInput): OpsEscalationReason | null {
  if (input.dueDate && input.dueDate < input.todayIsoDate) {
    return "overdue";
  }

  if (input.dueAt && input.dueAt < input.nowIso) {
    return "overdue";
  }

  if (input.staleDate && input.staleBeforeDate && input.staleDate < input.staleBeforeDate) {
    return "stale";
  }

  if (input.staleAt && input.staleBeforeIso && input.staleAt < input.staleBeforeIso) {
    return "stale";
  }

  return null;
}

/**
 * Identity of an escalation notification: WHICH item, escalated for WHICH
 * reason, to WHOM.
 *
 * Deliberately date-free. This key used to carry the sweep's date, so the six
 * daily cron sweeps minted a fresh key every morning and one unresolved item
 * produced a notification per recipient per day — 6,083 of the 6,935
 * notifications in the system (88%) were redundant copies created this way.
 *
 * Without the date the upsert updates the existing row in place, so the
 * notification stays current instead of multiplying. Escalation still happens,
 * but through meaning rather than repetition:
 *
 *   • the `reason` is part of the key, so an item moving from `overdue` to
 *     `stale` legitimately raises a NEW notification — the situation changed;
 *   • widening the recipients (a more senior role) raises new notifications for
 *     those people, because `recipientId` is part of the key.
 *
 * What it will no longer do is tell the same person the same thing about the
 * same item every morning. If a recipient has read and forgotten an item, the
 * answer is the periodic digest, not an unbounded stream of duplicates.
 */
export function buildOpsEscalationIdempotencyKey(input: {
  recipientId: string;
  reason: OpsEscalationReason;
  sourceId: string;
  sourceTable: string;
}) {
  return [
    "ops-escalation",
    input.sourceTable,
    input.sourceId,
    input.reason,
    input.recipientId,
  ].join(":");
}

function uniqueRoles(roles: OpsUserRole[]) {
  return Array.from(new Set(roles));
}

function uniqueUsers(users: OpsEscalationUser[]) {
  return Array.from(new Map(users.map((user) => [user.id, user])).values());
}

function recipientsFor(
  users: OpsEscalationUser[],
  roles: OpsUserRole[],
  userIds: Array<string | null | undefined> = [],
) {
  const roleSet = new Set(uniqueRoles(roles));
  const userIdSet = new Set(userIds.filter(Boolean) as string[]);

  return uniqueUsers(users.filter((user) => roleSet.has(user.role) || userIdSet.has(user.id)));
}

function reasonText(reason: OpsEscalationReason) {
  return reason === "overdue" ? "past its due date" : "stale against the configured SLA";
}

function moneyText(amount: PaymentRequestEscalationRow["requested_amount"]) {
  const numeric = Number(amount ?? 0);

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return "";
  }

  return ` (${numeric.toLocaleString("en-ZM", {
    currency: "ZMW",
    maximumFractionDigits: 2,
    style: "currency",
  })})`;
}

async function fetchActiveEscalationUsers(supabase: SupabaseServiceClient) {
  const { data, error } = await supabase
    .from("users")
    .select("id, full_name, role")
    .eq("is_active", true);

  if (error) {
    throw error;
  }

  return (data ?? []) as OpsEscalationUser[];
}

async function fetchPendingApprovalSteps(supabase: SupabaseServiceClient, approvalRequestIds: string[]) {
  if (approvalRequestIds.length === 0) {
    return new Map<string, ApprovalStepEscalationRow[]>();
  }

  const { data, error } = await supabase
    .from("approval_steps")
    .select("approval_request_id, approver_role, approver_user_id")
    .in("approval_request_id", approvalRequestIds)
    .eq("status", "pending");

  if (error) {
    throw error;
  }

  const stepsByRequest = new Map<string, ApprovalStepEscalationRow[]>();
  ((data ?? []) as ApprovalStepEscalationRow[]).forEach((step) => {
    const steps = stepsByRequest.get(step.approval_request_id) ?? [];
    steps.push(step);
    stepsByRequest.set(step.approval_request_id, steps);
  });

  return stepsByRequest;
}

async function queueEscalationNotifications(input: QueueEscalationInput) {
  let failures = 0;
  let queued = 0;

  for (const recipient of input.recipients) {
    try {
      await queueOpsNotification({
        actionHref: input.actionHref,
        body: input.body,
        idempotencyKey: `${input.idempotencyBase}:${recipient.id}`,
        moduleKey: input.moduleKey,
        recipientId: recipient.id,
        sourceId: input.sourceId,
        sourceTable: input.sourceTable,
        title: input.title,
      });
      queued += 1;
    } catch {
      failures += 1;
    }
  }

  return { failures, queued };
}

async function fetchApprovalEscalationRows(supabase: SupabaseServiceClient) {
  const { data, error } = await supabase
    .from("approval_requests")
    .select(
      "id, module_key, source_table, source_id, title, status, requested_by, due_at, submitted_at, created_at",
    )
    .in("status", ["submitted", "in_review"])
    .order("created_at", { ascending: true })
    .limit(MAX_ESCALATION_RECORDS_PER_TABLE);

  if (error) {
    throw error;
  }

  return (data ?? []) as ApprovalEscalationRow[];
}

async function fetchMaterialRequestEscalationRows(supabase: SupabaseServiceClient) {
  const { data, error } = await supabase
    .from("material_requests")
    .select("id, request_number, title, status, requested_by, needed_by, submitted_at, created_at")
    .in("status", ["submitted", "in_review", "approved"])
    .order("created_at", { ascending: true })
    .limit(MAX_ESCALATION_RECORDS_PER_TABLE);

  if (error) {
    throw error;
  }

  return (data ?? []) as MaterialRequestEscalationRow[];
}

async function fetchPaymentRequestEscalationRows(supabase: SupabaseServiceClient) {
  const { data, error } = await supabase
    .from("payment_requests")
    .select(
      "id, request_number, title, status, requested_amount, requested_by, due_date, submitted_at, created_at",
    )
    .in("status", ["submitted", "finance_review", "approved"])
    .order("created_at", { ascending: true })
    .limit(MAX_ESCALATION_RECORDS_PER_TABLE);

  if (error) {
    throw error;
  }

  return (data ?? []) as PaymentRequestEscalationRow[];
}

async function fetchDeliveryExceptionEscalationRows(supabase: SupabaseServiceClient) {
  const { data, error } = await supabase
    .from("delivery_exceptions")
    .select(
      "id, exception_number, title, status, severity, reported_by, assigned_to, reported_at, due_at",
    )
    .in("status", ["open", "investigating"])
    .order("reported_at", { ascending: true })
    .limit(MAX_ESCALATION_RECORDS_PER_TABLE);

  if (error) {
    throw error;
  }

  return (data ?? []) as DeliveryExceptionEscalationRow[];
}

async function fetchRfqEscalationRows(supabase: SupabaseServiceClient) {
  const { data, error } = await supabase
    .from("rfqs")
    .select("id, rfq_number, title, status, created_by, issued_at, created_at")
    .in("status", ["draft", "issued"])
    .order("created_at", { ascending: true })
    .limit(MAX_ESCALATION_RECORDS_PER_TABLE);

  if (error) {
    throw error;
  }

  return (data ?? []) as RfqEscalationRow[];
}

async function fetchDepartmentReportEscalationRows(supabase: SupabaseServiceClient) {
  const { data, error } = await supabase
    .from("department_reports")
    .select(
      "id, department, scope, title, period, period_end_date, status, submitted_at, submitted_by",
    )
    .in("status", ["submitted", "under_review"])
    .is("archived_at", null)
    .order("submitted_at", { ascending: true })
    .limit(MAX_ESCALATION_RECORDS_PER_TABLE);

  if (error) {
    throw error;
  }

  return (data ?? []) as DepartmentReportEscalationRow[];
}

/**
 * The previous calendar month for a Lusaka business date ("YYYY-MM-DD"),
 * as inclusive ISO date bounds plus a stable month key for idempotency.
 */
export function previousMonthWindow(todayIsoDate: string) {
  const [year, month] = todayIsoDate.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 2, 1));
  const end = new Date(Date.UTC(year, month - 1, 0));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    monthKey: start.toISOString().slice(0, 7),
  };
}

/**
 * The last full Monday–Sunday week before a Lusaka business date, plus a
 * stable key (the week's Monday) for reminder idempotency.
 */
export function previousWeekWindow(todayIsoDate: string) {
  const today = new Date(`${todayIsoDate}T00:00:00Z`);
  const dayOfWeek = today.getUTCDay() === 0 ? 7 : today.getUTCDay();
  const thisMonday = new Date(today);
  thisMonday.setUTCDate(today.getUTCDate() - (dayOfWeek - 1));
  const lastMonday = new Date(thisMonday);
  lastMonday.setUTCDate(thisMonday.getUTCDate() - 7);
  const lastSunday = new Date(thisMonday);
  lastSunday.setUTCDate(thisMonday.getUTCDate() - 1);
  return {
    start: lastMonday.toISOString().slice(0, 10),
    end: lastSunday.toISOString().slice(0, 10),
    weekKey: lastMonday.toISOString().slice(0, 10),
  };
}

/** Day of week (1 = Monday … 7 = Sunday) for a "YYYY-MM-DD" business date. */
export function isoWeekday(todayIsoDate: string) {
  const day = new Date(`${todayIsoDate}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

/**
 * Departments that have NOT filed a COMPILED report of the given cadence
 * covering the window. Any status counts — a draft in progress still means
 * the manager has started.
 */
export function departmentsMissingCadenceReport(
  filed: Array<{
    department: OpsDepartmentKey;
    period: string;
    period_end_date: string;
    scope?: OpsDepartmentReportScope;
  }>,
  window: { start: string; end: string },
  period: "weekly" | "monthly",
): OpsDepartmentKey[] {
  const covered = new Set(
    filed
      .filter(
        (report) =>
          report.period === period &&
          (report.scope ?? "compiled") === "compiled" &&
          report.period_end_date >= window.start &&
          report.period_end_date <= window.end,
      )
      .map((report) => report.department),
  );

  return departmentsExpectedToReport().filter((department) => !covered.has(department));
}

type BudgetVarianceRow = {
  site_id: string;
  site_code: string;
  site_name: string;
  budget_id: string;
  budget_number: string;
  budgeted_total: number;
  actual_total: number;
  variance_ratio: number;
};

async function fetchBudgetVarianceCandidates(
  supabase: SupabaseServiceClient,
): Promise<BudgetVarianceRow[]> {
  const [budgetsResult, linesResult, costsResult] = await Promise.all([
    supabase
      .from("project_budgets")
      .select(
        "id, site_id, budget_number, contingency_amount, site:sites!project_budgets_site_id_fkey(code, name)",
      )
      .eq("status", "active"),
    supabase.from("project_budget_lines").select("budget_id, budgeted_amount"),
    supabase
      .from("project_cost_entries")
      .select("site_id, amount")
      .in("status", ["committed", "posted"]),
  ]);

  if (budgetsResult.error || linesResult.error || costsResult.error) {
    return [];
  }

  type BudgetRow = {
    id: string;
    site_id: string;
    budget_number: string;
    contingency_amount: number | string;
    site: { code: string; name: string } | { code: string; name: string }[] | null;
  };
  type LineRow = { budget_id: string; budgeted_amount: number | string };
  type CostRow = { site_id: string; amount: number | string };

  const lines = (linesResult.data ?? []) as LineRow[];
  const linesByBudget = new Map<string, number>();
  for (const line of lines) {
    linesByBudget.set(
      line.budget_id,
      (linesByBudget.get(line.budget_id) ?? 0) + Number(line.budgeted_amount ?? 0),
    );
  }

  const costs = (costsResult.data ?? []) as CostRow[];
  const costBySite = new Map<string, number>();
  for (const cost of costs) {
    costBySite.set(cost.site_id, (costBySite.get(cost.site_id) ?? 0) + Number(cost.amount ?? 0));
  }

  const budgets = (budgetsResult.data ?? []) as BudgetRow[];
  return budgets
    .map((budget) => {
      const site = Array.isArray(budget.site) ? budget.site[0] : budget.site;
      const budgetedTotal =
        (linesByBudget.get(budget.id) ?? 0) + Number(budget.contingency_amount ?? 0);
      const actualTotal = costBySite.get(budget.site_id) ?? 0;
      const ratio = budgetedTotal > 0 ? actualTotal / budgetedTotal : 0;

      return {
        site_id: budget.site_id,
        site_code: site?.code ?? "",
        site_name: site?.name ?? "",
        budget_id: budget.id,
        budget_number: budget.budget_number,
        budgeted_total: budgetedTotal,
        actual_total: actualTotal,
        variance_ratio: ratio,
      } satisfies BudgetVarianceRow;
    })
    .filter((row) => row.budgeted_total > 0 && row.variance_ratio >= OPS_BUDGET_VARIANCE_THRESHOLD);
}

async function fetchPurchaseOrderEscalationRows(supabase: SupabaseServiceClient) {
  const { data, error } = await supabase
    .from("purchase_orders")
    .select("id, po_number, title, status, created_by, created_at")
    .eq("status", "approval_pending")
    .order("created_at", { ascending: true })
    .limit(MAX_ESCALATION_RECORDS_PER_TABLE);

  if (error) {
    throw error;
  }

  return (data ?? []) as PurchaseOrderEscalationRow[];
}

async function fetchEquipmentRequestEscalationRows(supabase: SupabaseServiceClient) {
  const { data, error } = await supabase
    .from("equipment_requests")
    .select("id, request_number, title, status, requested_by, needed_from, submitted_at, created_at")
    .eq("status", "submitted")
    .is("archived_at", null)
    .order("created_at", { ascending: true })
    .limit(MAX_ESCALATION_RECORDS_PER_TABLE);

  if (error) {
    throw error;
  }

  return (data ?? []) as EquipmentRequestEscalationRow[];
}

async function fetchTransportRequestEscalationRows(supabase: SupabaseServiceClient) {
  const { data, error } = await supabase
    .from("transport_requests")
    .select("id, request_number, title, status, requested_by, requested_for, submitted_at, created_at")
    .eq("status", "submitted")
    .order("created_at", { ascending: true })
    .limit(MAX_ESCALATION_RECORDS_PER_TABLE);

  if (error) {
    throw error;
  }

  return (data ?? []) as TransportRequestEscalationRow[];
}

async function fetchSubcontractorPaymentEscalationRows(supabase: SupabaseServiceClient) {
  const { data, error } = await supabase
    .from("subcontractor_payments")
    .select("id, payment_type, amount, status, requested_by, scheduled_for, created_at")
    .eq("status", "pending")
    .is("archived_at", null)
    .order("created_at", { ascending: true })
    .limit(MAX_ESCALATION_RECORDS_PER_TABLE);

  if (error) {
    throw error;
  }

  return (data ?? []) as SubcontractorPaymentEscalationRow[];
}

async function fetchLeaveRequestEscalationRows(supabase: SupabaseServiceClient) {
  const { data, error } = await supabase
    .from("leave_requests")
    .select("id, leave_number, status, start_date, submitted_at, created_at, created_by")
    .eq("status", "submitted")
    .order("created_at", { ascending: true })
    .limit(MAX_ESCALATION_RECORDS_PER_TABLE);

  if (error) {
    throw error;
  }

  return (data ?? []) as LeaveRequestEscalationRow[];
}

export async function fetchOpsEscalationSnapshot(now = new Date()): Promise<OpsEscalationSnapshot> {
  const supabase = getOpsSupabaseServiceClient();
  const nowIso = now.toISOString();
  const todayIsoDate = getOpsEscalationTodayKey(now);
  const staleBeforeIso = getOpsEscalationIsoDaysAgo(OPS_ESCALATION_SLA_DAYS.approvals, now);
  const staleBeforeDate = getOpsEscalationDateDaysAgo(
    OPS_ESCALATION_SLA_DAYS.deliveryExceptions,
    now,
  );

  const [
    approvals,
    materialRequests,
    paymentRequests,
    deliveryExceptions,
    rfqs,
    purchaseOrders,
    budgetVariances,
    departmentReports,
    equipmentRequests,
    transportRequests,
    subcontractorPayments,
    leaveRequests,
  ] = await Promise.all([
    fetchApprovalEscalationRows(supabase),
    fetchMaterialRequestEscalationRows(supabase),
    fetchPaymentRequestEscalationRows(supabase),
    fetchDeliveryExceptionEscalationRows(supabase),
    fetchRfqEscalationRows(supabase),
    fetchPurchaseOrderEscalationRows(supabase),
    fetchBudgetVarianceCandidates(supabase),
    fetchDepartmentReportEscalationRows(supabase),
    fetchEquipmentRequestEscalationRows(supabase),
    fetchTransportRequestEscalationRows(supabase),
    fetchSubcontractorPaymentEscalationRows(supabase),
    fetchLeaveRequestEscalationRows(supabase),
  ]);

  const staleApprovals = approvals.filter((approval) =>
    classifyOpsEscalationAge({
      dueAt: approval.due_at,
      nowIso,
      staleAt: approval.submitted_at ?? approval.created_at,
      staleBeforeIso,
      todayIsoDate,
    }),
  ).length;

  const staleDepartmentReports = departmentReports.filter((report) =>
    classifyOpsEscalationAge({
      nowIso,
      staleAt: report.submitted_at,
      staleBeforeIso: getOpsEscalationIsoDaysAgo(OPS_ESCALATION_SLA_DAYS.departmentReports, now),
      todayIsoDate,
    }),
  ).length;
  const staleMaterialRequests = materialRequests.filter((request) =>
    classifyOpsEscalationAge({
      dueDate: request.needed_by,
      nowIso,
      staleAt: request.submitted_at ?? request.created_at,
      staleBeforeIso: getOpsEscalationIsoDaysAgo(OPS_ESCALATION_SLA_DAYS.materialRequests, now),
      todayIsoDate,
    }),
  ).length;
  const stalePaymentRequests = paymentRequests.filter((request) =>
    classifyOpsEscalationAge({
      dueDate: request.due_date,
      nowIso,
      staleAt: request.submitted_at ?? request.created_at,
      staleBeforeIso: getOpsEscalationIsoDaysAgo(OPS_ESCALATION_SLA_DAYS.paymentRequests, now),
      todayIsoDate,
    }),
  ).length;
  const staleDeliveryExceptions = deliveryExceptions.filter((exception) =>
    classifyOpsEscalationAge({
      dueDate: exception.due_at,
      nowIso,
      staleBeforeDate,
      staleDate: exception.reported_at,
      todayIsoDate,
    }),
  ).length;

  const staleRfqs = rfqs.filter((rfq) =>
    classifyOpsEscalationAge({
      nowIso,
      staleAt: rfq.issued_at ?? rfq.created_at,
      staleBeforeIso: getOpsEscalationIsoDaysAgo(OPS_ESCALATION_SLA_DAYS.rfqs, now),
      todayIsoDate,
    }),
  ).length;
  const stalePurchaseOrders = purchaseOrders.filter((purchaseOrder) =>
    classifyOpsEscalationAge({
      nowIso,
      staleAt: purchaseOrder.created_at,
      staleBeforeIso: getOpsEscalationIsoDaysAgo(OPS_ESCALATION_SLA_DAYS.purchaseOrders, now),
      todayIsoDate,
    }),
  ).length;

  const staleEquipmentRequests = equipmentRequests.filter((request) =>
    classifyOpsEscalationAge({
      dueDate: request.needed_from,
      nowIso,
      staleAt: request.submitted_at ?? request.created_at,
      staleBeforeIso: getOpsEscalationIsoDaysAgo(OPS_ESCALATION_SLA_DAYS.equipmentRequests, now),
      todayIsoDate,
    }),
  ).length;
  const staleTransportRequests = transportRequests.filter((request) =>
    classifyOpsEscalationAge({
      dueDate: request.requested_for,
      nowIso,
      staleAt: request.submitted_at ?? request.created_at,
      staleBeforeIso: getOpsEscalationIsoDaysAgo(OPS_ESCALATION_SLA_DAYS.transportRequests, now),
      todayIsoDate,
    }),
  ).length;
  const staleSubcontractorPayments = subcontractorPayments.filter((payment) =>
    classifyOpsEscalationAge({
      dueDate: payment.scheduled_for,
      nowIso,
      staleAt: payment.created_at,
      staleBeforeIso: getOpsEscalationIsoDaysAgo(
        OPS_ESCALATION_SLA_DAYS.subcontractorPayments,
        now,
      ),
      todayIsoDate,
    }),
  ).length;
  const staleLeaveRequests = leaveRequests.filter((request) =>
    classifyOpsEscalationAge({
      dueDate: request.start_date,
      nowIso,
      staleAt: request.submitted_at ?? request.created_at,
      staleBeforeIso: getOpsEscalationIsoDaysAgo(OPS_ESCALATION_SLA_DAYS.leaveRequests, now),
      todayIsoDate,
    }),
  ).length;

  return {
    staleApprovals,
    staleDeliveryExceptions,
    staleDepartmentReports,
    staleEquipmentRequests,
    staleLeaveRequests,
    staleMaterialRequests,
    stalePaymentRequests,
    staleRfqs,
    staleSubcontractorPayments,
    staleTransportRequests,
    stalePurchaseOrders,
    budgetVariance: budgetVariances.length,
    total:
      staleApprovals +
      staleDeliveryExceptions +
      staleDepartmentReports +
      staleEquipmentRequests +
      staleLeaveRequests +
      staleMaterialRequests +
      stalePaymentRequests +
      staleRfqs +
      staleSubcontractorPayments +
      staleTransportRequests +
      stalePurchaseOrders +
      budgetVariances.length,
  };
}

export async function runOpsScheduledEscalationSweep(now = new Date()): Promise<OpsEscalationSweepResult> {
  const supabase = getOpsSupabaseServiceClient();
  const dateKey = getOpsEscalationTodayKey(now);
  const nowIso = now.toISOString();
  const todayIsoDate = dateKey;
  const users = await fetchActiveEscalationUsers(supabase);
  const [
    approvals,
    materialRequests,
    paymentRequests,
    deliveryExceptions,
    rfqs,
    purchaseOrders,
    budgetVariances,
    departmentReports,
    equipmentRequests,
    transportRequests,
    subcontractorPayments,
    leaveRequests,
  ] = await Promise.all([
    fetchApprovalEscalationRows(supabase),
    fetchMaterialRequestEscalationRows(supabase),
    fetchPaymentRequestEscalationRows(supabase),
    fetchDeliveryExceptionEscalationRows(supabase),
    fetchRfqEscalationRows(supabase),
    fetchPurchaseOrderEscalationRows(supabase),
    fetchBudgetVarianceCandidates(supabase),
    fetchDepartmentReportEscalationRows(supabase),
    fetchEquipmentRequestEscalationRows(supabase),
    fetchTransportRequestEscalationRows(supabase),
    fetchSubcontractorPaymentEscalationRows(supabase),
    fetchLeaveRequestEscalationRows(supabase),
  ]);
  const approvalSteps = await fetchPendingApprovalSteps(
    supabase,
    approvals.map((approval) => approval.id),
  );
  const result: OpsEscalationSweepResult = {
    departmentReportReminders: 0,
    escalated: {
      staleApprovals: 0,
      staleDeliveryExceptions: 0,
      staleDepartmentReports: 0,
      staleEquipmentRequests: 0,
      staleLeaveRequests: 0,
      staleMaterialRequests: 0,
      stalePaymentRequests: 0,
      staleRfqs: 0,
      staleSubcontractorPayments: 0,
      staleTransportRequests: 0,
      stalePurchaseOrders: 0,
      budgetVariance: 0,
      total: 0,
    },
    inspected: {
      approvals: approvals.length,
      deliveryExceptions: deliveryExceptions.length,
      departmentReports: departmentReports.length,
      equipmentRequests: equipmentRequests.length,
      leaveRequests: leaveRequests.length,
      materialRequests: materialRequests.length,
      paymentRequests: paymentRequests.length,
      rfqs: rfqs.length,
      purchaseOrders: purchaseOrders.length,
      subcontractorPayments: subcontractorPayments.length,
      transportRequests: transportRequests.length,
      budgets: budgetVariances.length,
    },
    notificationFailures: 0,
    notificationsQueued: 0,
    ranAt: nowIso,
  };

  for (const approval of approvals) {
    const reason = classifyOpsEscalationAge({
      dueAt: approval.due_at,
      nowIso,
      staleAt: approval.submitted_at ?? approval.created_at,
      staleBeforeIso: getOpsEscalationIsoDaysAgo(OPS_ESCALATION_SLA_DAYS.approvals, now),
      todayIsoDate,
    });

    if (!reason) {
      continue;
    }

    const pendingSteps = approvalSteps.get(approval.id) ?? [];
    const recipients = recipientsFor(
      users,
      uniqueRoles([
        ...LEADERSHIP_ESCALATION_ROLES,
        ...pendingSteps.flatMap((step) => (step.approver_role ? [step.approver_role] : [])),
      ]),
      [approval.requested_by, ...pendingSteps.map((step) => step.approver_user_id)],
    );
    const queued = await queueEscalationNotifications({
      actionHref: `/ops/approvals?status=${approval.status}`,
      body: `${approval.title} is ${reasonText(reason)}. Please review the approval path and move it forward.`,
      idempotencyBase: buildOpsEscalationIdempotencyKey({
        reason,
        recipientId: "role",
        sourceId: approval.id,
        sourceTable: "approval_requests",
      }),
      moduleKey: approval.module_key,
      recipients,
      sourceId: approval.id,
      sourceTable: "approval_requests",
      title: "Approval escalation",
    });
    result.escalated.staleApprovals += 1;
    result.notificationFailures += queued.failures;
    result.notificationsQueued += queued.queued;
  }

  for (const request of materialRequests) {
    const reason = classifyOpsEscalationAge({
      dueDate: request.needed_by,
      nowIso,
      staleAt: request.submitted_at ?? request.created_at,
      staleBeforeIso: getOpsEscalationIsoDaysAgo(OPS_ESCALATION_SLA_DAYS.materialRequests, now),
      todayIsoDate,
    });

    if (!reason) {
      continue;
    }

    const queued = await queueEscalationNotifications({
      actionHref: `/ops/material-requests?status=${request.status}`,
      body: `${request.request_number} - ${request.title} is ${reasonText(reason)}. Site, procurement, and commercial owners should confirm the next action.`,
      idempotencyBase: buildOpsEscalationIdempotencyKey({
        reason,
        recipientId: "role",
        sourceId: request.id,
        sourceTable: "material_requests",
      }),
      moduleKey: "material_requests",
      recipients: recipientsFor(users, PROCUREMENT_ESCALATION_ROLES, [request.requested_by]),
      sourceId: request.id,
      sourceTable: "material_requests",
      title: "Material request escalation",
    });
    result.escalated.staleMaterialRequests += 1;
    result.notificationFailures += queued.failures;
    result.notificationsQueued += queued.queued;
  }

  for (const request of paymentRequests) {
    const reason = classifyOpsEscalationAge({
      dueDate: request.due_date,
      nowIso,
      staleAt: request.submitted_at ?? request.created_at,
      staleBeforeIso: getOpsEscalationIsoDaysAgo(OPS_ESCALATION_SLA_DAYS.paymentRequests, now),
      todayIsoDate,
    });

    if (!reason) {
      continue;
    }

    const queued = await queueEscalationNotifications({
      actionHref: `/ops/payment-requests?status=${request.status}`,
      body: `${request.request_number} - ${request.title}${moneyText(
        request.requested_amount,
      )} is ${reasonText(reason)}. Finance should confirm review, approval, or payment movement.`,
      idempotencyBase: buildOpsEscalationIdempotencyKey({
        reason,
        recipientId: "role",
        sourceId: request.id,
        sourceTable: "payment_requests",
      }),
      moduleKey: "payment_requests",
      recipients: recipientsFor(users, FINANCE_ESCALATION_ROLES, [request.requested_by]),
      sourceId: request.id,
      sourceTable: "payment_requests",
      title: "Payment request escalation",
    });
    result.escalated.stalePaymentRequests += 1;
    result.notificationFailures += queued.failures;
    result.notificationsQueued += queued.queued;
  }

  for (const exception of deliveryExceptions) {
    const reason = classifyOpsEscalationAge({
      dueDate: exception.due_at,
      nowIso,
      staleBeforeDate: getOpsEscalationDateDaysAgo(
        OPS_ESCALATION_SLA_DAYS.deliveryExceptions,
        now,
      ),
      staleDate: exception.reported_at,
      todayIsoDate,
    });

    if (!reason) {
      continue;
    }

    const queued = await queueEscalationNotifications({
      actionHref: `/ops/delivery-exceptions?status=${exception.status}`,
      body: `${exception.exception_number} - ${exception.title} is ${reasonText(
        reason,
      )}. Severity is ${exception.severity}; supplier follow-up should be confirmed.`,
      idempotencyBase: buildOpsEscalationIdempotencyKey({
        reason,
        recipientId: "role",
        sourceId: exception.id,
        sourceTable: "delivery_exceptions",
      }),
      moduleKey: "delivery_exceptions",
      recipients: recipientsFor(users, DELIVERY_ESCALATION_ROLES, [
        exception.assigned_to,
        exception.reported_by,
      ]),
      sourceId: exception.id,
      sourceTable: "delivery_exceptions",
      title: "Delivery exception escalation",
    });
    result.escalated.staleDeliveryExceptions += 1;
    result.notificationFailures += queued.failures;
    result.notificationsQueued += queued.queued;
  }

  for (const rfq of rfqs) {
    const reason = classifyOpsEscalationAge({
      nowIso,
      staleAt: rfq.issued_at ?? rfq.created_at,
      staleBeforeIso: getOpsEscalationIsoDaysAgo(OPS_ESCALATION_SLA_DAYS.rfqs, now),
      todayIsoDate,
    });

    if (!reason) {
      continue;
    }

    const awaiting = rfq.status === "issued" ? "awaiting supplier quotes" : "still in draft";
    const queued = await queueEscalationNotifications({
      actionHref: "/ops/rfq-po",
      body: `${rfq.rfq_number} - ${rfq.title} is ${awaiting} and ${reasonText(reason)}. Procurement should invite suppliers, capture quotes, or award.`,
      idempotencyBase: buildOpsEscalationIdempotencyKey({
        reason,
        recipientId: "role",
        sourceId: rfq.id,
        sourceTable: "rfqs",
      }),
      moduleKey: "rfq_po",
      recipients: recipientsFor(users, PROCUREMENT_ESCALATION_ROLES, [rfq.created_by]),
      sourceId: rfq.id,
      sourceTable: "rfqs",
      title: "RFQ escalation",
    });
    result.escalated.staleRfqs += 1;
    result.notificationFailures += queued.failures;
    result.notificationsQueued += queued.queued;
  }

  for (const purchaseOrder of purchaseOrders) {
    const reason = classifyOpsEscalationAge({
      nowIso,
      staleAt: purchaseOrder.created_at,
      staleBeforeIso: getOpsEscalationIsoDaysAgo(OPS_ESCALATION_SLA_DAYS.purchaseOrders, now),
      todayIsoDate,
    });

    if (!reason) {
      continue;
    }

    const queued = await queueEscalationNotifications({
      actionHref: "/ops/rfq-po",
      body: `${purchaseOrder.po_number} - ${purchaseOrder.title} is pending approval and ${reasonText(reason)}. Procurement and finance approvers should action it so the order can be issued.`,
      idempotencyBase: buildOpsEscalationIdempotencyKey({
        reason,
        recipientId: "role",
        sourceId: purchaseOrder.id,
        sourceTable: "purchase_orders",
      }),
      moduleKey: "rfq_po",
      recipients: recipientsFor(users, PURCHASE_ORDER_ESCALATION_ROLES, [purchaseOrder.created_by]),
      sourceId: purchaseOrder.id,
      sourceTable: "purchase_orders",
      title: "Purchase order escalation",
    });
    result.escalated.stalePurchaseOrders += 1;
    result.notificationFailures += queued.failures;
    result.notificationsQueued += queued.queued;
  }

  for (const request of equipmentRequests) {
    const reason = classifyOpsEscalationAge({
      dueDate: request.needed_from,
      nowIso,
      staleAt: request.submitted_at ?? request.created_at,
      staleBeforeIso: getOpsEscalationIsoDaysAgo(OPS_ESCALATION_SLA_DAYS.equipmentRequests, now),
      todayIsoDate,
    });

    if (!reason) {
      continue;
    }

    const queued = await queueEscalationNotifications({
      actionHref: "/ops/equipment?status=submitted#equipment-request-register",
      body: `${request.request_number} - ${request.title} is ${reasonText(reason)}. Operations should approve or reject it so the crew can plan.`,
      idempotencyBase: buildOpsEscalationIdempotencyKey({
        reason,
        recipientId: "role",
        sourceId: request.id,
        sourceTable: "equipment_requests",
      }),
      moduleKey: "equipment",
      recipients: recipientsFor(users, OPERATIONS_ESCALATION_ROLES, [request.requested_by]),
      sourceId: request.id,
      sourceTable: "equipment_requests",
      title: "Equipment request escalation",
    });
    result.escalated.staleEquipmentRequests += 1;
    result.notificationFailures += queued.failures;
    result.notificationsQueued += queued.queued;
  }

  for (const request of transportRequests) {
    const reason = classifyOpsEscalationAge({
      dueDate: request.requested_for,
      nowIso,
      staleAt: request.submitted_at ?? request.created_at,
      staleBeforeIso: getOpsEscalationIsoDaysAgo(OPS_ESCALATION_SLA_DAYS.transportRequests, now),
      todayIsoDate,
    });

    if (!reason) {
      continue;
    }

    const queued = await queueEscalationNotifications({
      actionHref: "/ops/fleet-logistics?status=submitted#transport-register",
      body: `${request.request_number} - ${request.title} is ${reasonText(reason)}. Operations should approve or schedule the trip.`,
      idempotencyBase: buildOpsEscalationIdempotencyKey({
        reason,
        recipientId: "role",
        sourceId: request.id,
        sourceTable: "transport_requests",
      }),
      moduleKey: "fleet_logistics",
      recipients: recipientsFor(users, OPERATIONS_ESCALATION_ROLES, [request.requested_by]),
      sourceId: request.id,
      sourceTable: "transport_requests",
      title: "Transport request escalation",
    });
    result.escalated.staleTransportRequests += 1;
    result.notificationFailures += queued.failures;
    result.notificationsQueued += queued.queued;
  }

  for (const payment of subcontractorPayments) {
    const reason = classifyOpsEscalationAge({
      dueDate: payment.scheduled_for,
      nowIso,
      staleAt: payment.created_at,
      staleBeforeIso: getOpsEscalationIsoDaysAgo(
        OPS_ESCALATION_SLA_DAYS.subcontractorPayments,
        now,
      ),
      todayIsoDate,
    });

    if (!reason) {
      continue;
    }

    const queued = await queueEscalationNotifications({
      actionHref: "/ops/subcontractors",
      body: `A pending subcontractor payment (${payment.payment_type.replace(/_/g, " ")}${moneyText(
        payment.amount,
      )}) is ${reasonText(reason)}. Finance should approve, pay, or reject it.`,
      idempotencyBase: buildOpsEscalationIdempotencyKey({
        reason,
        recipientId: "role",
        sourceId: payment.id,
        sourceTable: "subcontractor_payments",
      }),
      moduleKey: "subcontractors",
      recipients: recipientsFor(users, FINANCE_ESCALATION_ROLES, [payment.requested_by]),
      sourceId: payment.id,
      sourceTable: "subcontractor_payments",
      title: "Subcontractor payment escalation",
    });
    result.escalated.staleSubcontractorPayments += 1;
    result.notificationFailures += queued.failures;
    result.notificationsQueued += queued.queued;
  }

  for (const request of leaveRequests) {
    const reason = classifyOpsEscalationAge({
      dueDate: request.start_date,
      nowIso,
      staleAt: request.submitted_at ?? request.created_at,
      staleBeforeIso: getOpsEscalationIsoDaysAgo(OPS_ESCALATION_SLA_DAYS.leaveRequests, now),
      todayIsoDate,
    });

    if (!reason) {
      continue;
    }

    const queued = await queueEscalationNotifications({
      actionHref: "/ops/employees",
      body: `Leave request ${request.leave_number} is ${reasonText(reason)}. HR should approve or decline it before the leave start date.`,
      idempotencyBase: buildOpsEscalationIdempotencyKey({
        reason,
        recipientId: "role",
        sourceId: request.id,
        sourceTable: "leave_requests",
      }),
      moduleKey: "employees",
      recipients: recipientsFor(users, HR_ESCALATION_ROLES, [request.created_by]),
      sourceId: request.id,
      sourceTable: "leave_requests",
      title: "Leave request escalation",
    });
    result.escalated.staleLeaveRequests += 1;
    result.notificationFailures += queued.failures;
    result.notificationsQueued += queued.queued;
  }

  for (const variance of budgetVariances) {
    const overspendPct = Math.round((variance.variance_ratio - 1) * 100);
    const queued = await queueEscalationNotifications({
      actionHref: "/ops/project-budgets",
      body: `${variance.site_code} - ${variance.site_name} active budget ${variance.budget_number} is ${overspendPct}% over plan (actual ${Math.round(
        variance.actual_total,
      ).toLocaleString("en-ZM")} ZMW vs budget ${Math.round(variance.budgeted_total).toLocaleString(
        "en-ZM",
      )} ZMW). Finance and projects leadership should confirm scope, cost, or budget revision.`,
      idempotencyBase: buildOpsEscalationIdempotencyKey({
        reason: "overdue",
        recipientId: "role",
        sourceId: variance.budget_id,
        sourceTable: "project_budgets",
      }),
      moduleKey: "project_budgets",
      recipients: recipientsFor(users, [...FINANCE_ESCALATION_ROLES, "projects_manager"]),
      sourceId: variance.budget_id,
      sourceTable: "project_budgets",
      title: "Budget variance escalation",
    });
    result.escalated.budgetVariance += 1;
    result.notificationFailures += queued.failures;
    result.notificationsQueued += queued.queued;
  }

  // Department reports sitting unreviewed past the SLA: nag whoever the
  // report routes to — the line manager for an individual report, the MD/GM
  // tier for a compiled one — so a submitted report never just sits.
  for (const report of departmentReports) {
    const reason = classifyOpsEscalationAge({
      nowIso,
      staleAt: report.submitted_at,
      staleBeforeIso: getOpsEscalationIsoDaysAgo(OPS_ESCALATION_SLA_DAYS.departmentReports, now),
      todayIsoDate,
    });

    if (!reason) {
      continue;
    }

    const route = OPS_DEPARTMENT_REPORTING_ROUTES[report.department];
    const reviewerRoles =
      report.scope === "individual" && route.compilerRoles.length > 0
        ? route.compilerRoles
        : uniqueRoles([...route.finalReviewerRoles, ...LEADERSHIP_ESCALATION_ROLES]);
    const queued = await queueEscalationNotifications({
      actionHref: `/ops/department-reports/${report.id}`,
      body: `${report.title} (${OPS_DEPARTMENT_LABELS[report.department]}) was submitted and is still awaiting review. Please acknowledge it or request revisions.`,
      idempotencyBase: buildOpsEscalationIdempotencyKey({
        reason,
        recipientId: "role",
        sourceId: report.id,
        sourceTable: "department_reports",
      }),
      moduleKey: "department_reports",
      recipients: recipientsFor(users, reviewerRoles),
      sourceId: report.id,
      sourceTable: "department_reports",
      title:
        report.scope === "individual"
          ? "Team report awaiting your review"
          : "Department report awaiting review",
    });
    result.escalated.staleDepartmentReports += 1;
    result.notificationFailures += queued.failures;
    result.notificationsQueued += queued.queued;
  }

  // Weekly cadence: every Monday and Tuesday, departments that have not filed
  // last week's compiled report get reminded — the compiler is asked to
  // compile, the contributors are asked to file their individual reports.
  // Idempotency is keyed on the week, so each person hears about a given week
  // at most once.
  if (OPS_REPORT_REMINDER_WEEKDAYS.includes(isoWeekday(dateKey))) {
    const window = previousWeekWindow(dateKey);
    const { data: filedRows, error: filedError } = await supabase
      .from("department_reports")
      .select("department, scope, period, period_end_date")
      .eq("period", "weekly")
      .eq("scope", "compiled")
      .is("archived_at", null)
      .gte("period_end_date", window.start)
      .lte("period_end_date", window.end);

    if (!filedError) {
      const missing = departmentsMissingCadenceReport(
        (filedRows ?? []) as Array<{
          department: OpsDepartmentKey;
          period: string;
          period_end_date: string;
          scope: OpsDepartmentReportScope;
        }>,
        window,
        "weekly",
      );

      for (const department of missing) {
        const route = OPS_DEPARTMENT_REPORTING_ROUTES[department];
        const recipients = recipientsFor(users, [
          ...route.compilerRoles,
          ...route.contributorRoles,
        ]);
        if (recipients.length === 0) {
          continue;
        }

        const queued = await queueEscalationNotifications({
          actionHref: `/ops/department-reports/new?department=${department}&period=weekly`,
          body: `The ${OPS_DEPARTMENT_LABELS[department]} weekly report for ${window.start} to ${window.end} has not been filed yet. Open the form to draft yours — the template and figures are ready.`,
          idempotencyBase: `ops-report-reminder:${department}:${window.weekKey}`,
          moduleKey: "department_reports",
          recipients,
          sourceId: null,
          sourceTable: "department_reports",
          title: `Weekly report due: ${OPS_DEPARTMENT_LABELS[department]}`,
        });
        result.departmentReportReminders += queued.queued;
        result.notificationFailures += queued.failures;
        result.notificationsQueued += queued.queued;
      }
    }
  }

  result.escalated.total =
    result.escalated.staleApprovals +
    result.escalated.staleMaterialRequests +
    result.escalated.stalePaymentRequests +
    result.escalated.staleDeliveryExceptions +
    result.escalated.staleRfqs +
    result.escalated.stalePurchaseOrders +
    result.escalated.staleDepartmentReports +
    result.escalated.staleEquipmentRequests +
    result.escalated.staleTransportRequests +
    result.escalated.staleSubcontractorPayments +
    result.escalated.staleLeaveRequests +
    result.escalated.budgetVariance;

  return result;
}
