import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import { fetchOpsEscalationSnapshot, type OpsEscalationSnapshot } from "@/lib/ops/escalations";

type QueryResult = {
  count?: number | null;
  data?: Record<string, unknown>[] | null;
  error?: unknown;
};

export type OpsOverviewRoleMetrics = {
  commercial: {
    activeIpcs: number;
    activeVariations: number;
    unpaidInvoiceAmount: number;
  };
  escalations: OpsEscalationSnapshot;
  finance: {
    approvedPaymentAmount: number;
    overduePaymentAmount: number;
    paidInvoicesThisMonth: number;
    paymentRequestsPending: number;
    unpaidInvoiceAmount: number;
  };
  hse: {
    openCorrectiveActions: number;
    openIncidents: number;
    overdueCorrectiveActions: number;
    trainingExpiringSoon: number;
  };
  people: {
    activeEmployees: number;
    expiringDocuments: number;
    onboardingOpenItems: number;
    onLeaveToday: number;
    pendingLeaveRequests: number;
  };
  procurement: {
    activeRfqs: number;
    deliveryExceptions: number;
    openMaterialRequests: number;
    posAwaitingDelivery: number;
  };
};

function monthStartIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)).toISOString();
}

function todayIsoDate() {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Africa/Lusaka",
    year: "numeric",
  }).format(new Date());
}

function datePlusDaysIsoDate(days: number) {
  const date = new Date(`${todayIsoDate()}T00:00:00+02:00`);
  date.setDate(date.getDate() + days);

  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Africa/Lusaka",
    year: "numeric",
  }).format(date);
}

function numeric(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

async function safeCount(executor: () => PromiseLike<unknown>) {
  const result = (await executor()) as QueryResult;

  if (result.error) {
    return 0;
  }

  return result.count ?? 0;
}

async function safeAmount(executor: () => PromiseLike<unknown>, column: string) {
  const result = (await executor()) as QueryResult;

  if (result.error) {
    return 0;
  }

  return (result.data ?? []).reduce((total, row) => total + numeric(row[column]), 0);
}

export async function fetchOpsOverviewRoleMetrics(): Promise<OpsOverviewRoleMetrics> {
  const supabase = getOpsSupabaseServiceClient();
  const today = todayIsoDate();
  const dueSoon = datePlusDaysIsoDate(30);
  const monthStart = monthStartIso();

  const [
    openMaterialRequests,
    activeRfqs,
    posAwaitingDelivery,
    deliveryExceptions,
    paymentRequestsPending,
    approvedPaymentAmount,
    overduePaymentAmount,
    paidInvoicesThisMonth,
    unpaidInvoiceAmount,
    activeIpcs,
    activeVariations,
    openIncidents,
    openCorrectiveActions,
    overdueCorrectiveActions,
    trainingExpiringSoon,
    activeEmployees,
    onLeaveToday,
    pendingLeaveRequests,
    expiringDocuments,
    onboardingOpenItems,
    escalationSnapshot,
  ] = await Promise.all([
    safeCount(() =>
      supabase
        .from("material_requests")
        .select("id", { count: "exact", head: true })
        .in("status", ["submitted", "approved"]),
    ),
    safeCount(() =>
      supabase
        .from("rfqs")
        .select("id", { count: "exact", head: true })
        .in("status", ["draft", "issued", "quoted"]),
    ),
    safeCount(() =>
      supabase
        .from("purchase_orders")
        .select("id", { count: "exact", head: true })
        .in("status", ["issued", "partially_received"]),
    ),
    safeCount(() =>
      supabase
        .from("delivery_exceptions")
        .select("id", { count: "exact", head: true })
        .in("status", ["open", "investigating", "resolved"]),
    ),
    safeCount(() =>
      supabase
        .from("payment_requests")
        .select("id", { count: "exact", head: true })
        .in("status", ["submitted", "finance_review", "approved"]),
    ),
    safeAmount(
      () =>
        supabase
          .from("payment_requests")
          .select("requested_amount")
          .in("status", ["submitted", "finance_review", "approved"]),
      "requested_amount",
    ),
    safeAmount(
      () =>
        supabase
          .from("payment_requests")
          .select("requested_amount")
          .in("status", ["submitted", "finance_review", "approved"])
          .lt("due_date", today),
      "requested_amount",
    ),
    safeAmount(
      () =>
        supabase
          .from("invoices")
          .select("total_amount")
          .eq("status", "paid")
          .gte("paid_at", monthStart),
      "total_amount",
    ),
    safeAmount(
      () =>
        supabase
          .from("invoices")
          .select("total_amount")
          .in("status", ["draft", "sent"]),
      "total_amount",
    ),
    safeCount(() =>
      supabase
        .from("commercial_ipcs")
        .select("id", { count: "exact", head: true })
        .in("status", ["draft", "submitted", "certified", "invoiced"]),
    ),
    safeCount(() =>
      supabase
        .from("commercial_variations")
        .select("id", { count: "exact", head: true })
        .in("status", ["draft", "submitted", "priced", "approved"]),
    ),
    safeCount(() =>
      supabase
        .from("hse_incidents")
        .select("id", { count: "exact", head: true })
        .in("status", ["reported", "investigating", "action_required"]),
    ),
    safeCount(() =>
      supabase
        .from("corrective_actions")
        .select("id", { count: "exact", head: true })
        .in("status", ["open", "in_progress", "completed"]),
    ),
    safeCount(() =>
      supabase
        .from("corrective_actions")
        .select("id", { count: "exact", head: true })
        .in("status", ["open", "in_progress"])
        .lt("due_date", today),
    ),
    safeCount(() =>
      supabase
        .from("safety_training_records")
        .select("id", { count: "exact", head: true })
        .eq("status", "completed")
        .gte("expiry_date", today)
        .lte("expiry_date", dueSoon),
    ),
    safeCount(() =>
      supabase
        .from("employees")
        .select("id", { count: "exact", head: true })
        .in("status", ["active", "probation"]),
    ),
    safeCount(() =>
      supabase
        .from("employees")
        .select("id", { count: "exact", head: true })
        .eq("status", "on_leave"),
    ),
    safeCount(() =>
      supabase
        .from("leave_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "submitted"),
    ),
    safeCount(() =>
      supabase
        .from("employee_documents")
        .select("id", { count: "exact", head: true })
        .eq("status", "accepted")
        .gte("expiry_date", today)
        .lte("expiry_date", dueSoon),
    ),
    safeCount(() =>
      supabase
        .from("employee_onboarding_items")
        .select("id", { count: "exact", head: true })
        .in("status", ["pending", "in_progress"]),
    ),
    fetchOpsEscalationSnapshot().catch(() => ({
      staleApprovals: 0,
      staleDeliveryExceptions: 0,
      staleMaterialRequests: 0,
      stalePaymentRequests: 0,
      total: 0,
    })),
  ]);

  return {
    commercial: {
      activeIpcs,
      activeVariations,
      unpaidInvoiceAmount,
    },
    escalations: escalationSnapshot,
    finance: {
      approvedPaymentAmount,
      overduePaymentAmount,
      paidInvoicesThisMonth,
      paymentRequestsPending,
      unpaidInvoiceAmount,
    },
    hse: {
      openCorrectiveActions,
      openIncidents,
      overdueCorrectiveActions,
      trainingExpiringSoon,
    },
    people: {
      activeEmployees,
      expiringDocuments,
      onboardingOpenItems,
      onLeaveToday,
      pendingLeaveRequests,
    },
    procurement: {
      activeRfqs,
      deliveryExceptions,
      openMaterialRequests,
      posAwaitingDelivery,
    },
  };
}
