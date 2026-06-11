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
  materialRequests: 2,
  paymentRequests: 2,
  purchaseOrders: 1,
  rfqs: 2,
} as const;

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

type QueueEscalationInput = {
  actionHref: string;
  body: string;
  idempotencyBase: string;
  moduleKey: string;
  recipients: OpsEscalationUser[];
  sourceId: string;
  sourceTable: string;
  title: string;
};

export type OpsEscalationSnapshot = {
  staleApprovals: number;
  staleDeliveryExceptions: number;
  staleMaterialRequests: number;
  stalePaymentRequests: number;
  staleRfqs: number;
  stalePurchaseOrders: number;
  budgetVariance: number;
  total: number;
};

export type OpsEscalationSweepResult = {
  escalated: OpsEscalationSnapshot;
  inspected: {
    approvals: number;
    deliveryExceptions: number;
    materialRequests: number;
    paymentRequests: number;
    rfqs: number;
    purchaseOrders: number;
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

export function buildOpsEscalationIdempotencyKey(input: {
  dateKey: string;
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
    input.dateKey,
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
  ] = await Promise.all([
    fetchApprovalEscalationRows(supabase),
    fetchMaterialRequestEscalationRows(supabase),
    fetchPaymentRequestEscalationRows(supabase),
    fetchDeliveryExceptionEscalationRows(supabase),
    fetchRfqEscalationRows(supabase),
    fetchPurchaseOrderEscalationRows(supabase),
    fetchBudgetVarianceCandidates(supabase),
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

  return {
    staleApprovals,
    staleDeliveryExceptions,
    staleMaterialRequests,
    stalePaymentRequests,
    staleRfqs,
    stalePurchaseOrders,
    budgetVariance: budgetVariances.length,
    total:
      staleApprovals +
      staleDeliveryExceptions +
      staleMaterialRequests +
      stalePaymentRequests +
      staleRfqs +
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
  ] = await Promise.all([
    fetchApprovalEscalationRows(supabase),
    fetchMaterialRequestEscalationRows(supabase),
    fetchPaymentRequestEscalationRows(supabase),
    fetchDeliveryExceptionEscalationRows(supabase),
    fetchRfqEscalationRows(supabase),
    fetchPurchaseOrderEscalationRows(supabase),
    fetchBudgetVarianceCandidates(supabase),
  ]);
  const approvalSteps = await fetchPendingApprovalSteps(
    supabase,
    approvals.map((approval) => approval.id),
  );
  const result: OpsEscalationSweepResult = {
    escalated: {
      staleApprovals: 0,
      staleDeliveryExceptions: 0,
      staleMaterialRequests: 0,
      stalePaymentRequests: 0,
      staleRfqs: 0,
      stalePurchaseOrders: 0,
      budgetVariance: 0,
      total: 0,
    },
    inspected: {
      approvals: approvals.length,
      deliveryExceptions: deliveryExceptions.length,
      materialRequests: materialRequests.length,
      paymentRequests: paymentRequests.length,
      rfqs: rfqs.length,
      purchaseOrders: purchaseOrders.length,
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
        dateKey,
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
        dateKey,
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
        dateKey,
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
        dateKey,
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
        dateKey,
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
        dateKey,
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
        dateKey,
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

  result.escalated.total =
    result.escalated.staleApprovals +
    result.escalated.staleMaterialRequests +
    result.escalated.stalePaymentRequests +
    result.escalated.staleDeliveryExceptions +
    result.escalated.staleRfqs +
    result.escalated.stalePurchaseOrders +
    result.escalated.budgetVariance;

  return result;
}
