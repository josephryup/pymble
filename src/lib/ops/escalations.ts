import { queueOpsNotification } from "@/lib/ops/notifications";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type {
  OpsApprovalStatus,
  OpsDeliveryExceptionStatus,
  OpsMaterialRequestStatus,
  OpsPaymentRequestStatus,
  OpsUserRole,
} from "@/lib/ops/types";

const OPS_ESCALATION_TIME_ZONE = "Africa/Lusaka";
const MAX_ESCALATION_RECORDS_PER_TABLE = 100;

export const OPS_ESCALATION_SLA_DAYS = {
  approvals: 2,
  deliveryExceptions: 2,
  materialRequests: 2,
  paymentRequests: 2,
} as const;

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
  total: number;
};

export type OpsEscalationSweepResult = {
  escalated: OpsEscalationSnapshot;
  inspected: {
    approvals: number;
    deliveryExceptions: number;
    materialRequests: number;
    paymentRequests: number;
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

export async function fetchOpsEscalationSnapshot(now = new Date()): Promise<OpsEscalationSnapshot> {
  const supabase = getOpsSupabaseServiceClient();
  const nowIso = now.toISOString();
  const todayIsoDate = getOpsEscalationTodayKey(now);
  const staleBeforeIso = getOpsEscalationIsoDaysAgo(OPS_ESCALATION_SLA_DAYS.approvals, now);
  const staleBeforeDate = getOpsEscalationDateDaysAgo(
    OPS_ESCALATION_SLA_DAYS.deliveryExceptions,
    now,
  );

  const [approvals, materialRequests, paymentRequests, deliveryExceptions] = await Promise.all([
    fetchApprovalEscalationRows(supabase),
    fetchMaterialRequestEscalationRows(supabase),
    fetchPaymentRequestEscalationRows(supabase),
    fetchDeliveryExceptionEscalationRows(supabase),
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

  return {
    staleApprovals,
    staleDeliveryExceptions,
    staleMaterialRequests,
    stalePaymentRequests,
    total: staleApprovals + staleDeliveryExceptions + staleMaterialRequests + stalePaymentRequests,
  };
}

export async function runOpsScheduledEscalationSweep(now = new Date()): Promise<OpsEscalationSweepResult> {
  const supabase = getOpsSupabaseServiceClient();
  const dateKey = getOpsEscalationTodayKey(now);
  const nowIso = now.toISOString();
  const todayIsoDate = dateKey;
  const users = await fetchActiveEscalationUsers(supabase);
  const [approvals, materialRequests, paymentRequests, deliveryExceptions] = await Promise.all([
    fetchApprovalEscalationRows(supabase),
    fetchMaterialRequestEscalationRows(supabase),
    fetchPaymentRequestEscalationRows(supabase),
    fetchDeliveryExceptionEscalationRows(supabase),
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
      total: 0,
    },
    inspected: {
      approvals: approvals.length,
      deliveryExceptions: deliveryExceptions.length,
      materialRequests: materialRequests.length,
      paymentRequests: paymentRequests.length,
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

  result.escalated.total =
    result.escalated.staleApprovals +
    result.escalated.staleMaterialRequests +
    result.escalated.stalePaymentRequests +
    result.escalated.staleDeliveryExceptions;

  return result;
}
