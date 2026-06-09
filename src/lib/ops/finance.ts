import { requireOpsUser } from "@/lib/ops/auth";
import {
  opsIlikeOrFilter,
  toOpsPaginatedResult,
  type OpsListState,
  type OpsPaginatedResult,
} from "@/lib/ops/listing";
import { canViewOpsFinanceBridge } from "@/lib/ops/finance-permissions";
import {
  createOpsFinanceAgeingBucketSummaries,
  getOpsFinanceAgeingBucket,
  getOpsFinanceCalendarDayDelta,
  getOpsFinanceDatePlusDays,
  getOpsFinanceMonthStartIso,
  getOpsFinanceTodayIso,
  type OpsFinanceAgeingBucket,
  type OpsFinanceAgeingBucketSummary,
} from "@/lib/ops/finance-reporting";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type {
  OpsInvoiceStatus,
  OpsPaymentRequestStatus,
  OpsPaymentRequestType,
  OpsProjectBudgetStatus,
  OpsProjectCostEntryStatus,
  OpsPurchaseOrderStatus,
  OpsUserRole,
} from "@/lib/ops/types";

export type OpsFinanceSiteSummary = {
  code: string;
  id: string;
  name: string;
};

export type OpsFinanceSupplierSummary = {
  id: string;
  legal_name: string;
  supplier_code: string;
};

export type OpsProjectCostEntrySummary = {
  amount: number;
  budget_id: string | null;
  budget_line_id: string | null;
  cost_date: string;
  cost_type: string;
  currency_code: string;
  description: string;
  id: string;
  payment_request_id: string | null;
  purchase_order_id: string | null;
  site_id: string;
  source_id: string;
  source_table: string;
  status: OpsProjectCostEntryStatus;
  supplier_id: string | null;
};

export type OpsProjectBudgetLineSummary = {
  budgeted_amount: number;
  category: string;
  committed_amount: number;
  cost_code: string;
  created_at: string;
  description: string;
  id: string;
  line_number: number;
  notes: string;
  posted_amount: number;
};

export type OpsProjectBudgetSummary = {
  active_at: string | null;
  archived_at: string | null;
  budget_number: string;
  committed_amount: number;
  contingency_amount: number;
  created_at: string;
  created_by: string | null;
  currency_code: string;
  description: string;
  effective_from: string;
  id: string;
  lines: OpsProjectBudgetLineSummary[];
  locked_at: string | null;
  posted_amount: number;
  remaining_amount: number;
  site: OpsFinanceSiteSummary | null;
  site_id: string;
  status: OpsProjectBudgetStatus;
  title: string;
  total_budgeted_amount: number;
  updated_at: string;
};

export type OpsPaymentRequestItemSummary = {
  budget_line: Pick<OpsProjectBudgetLineSummary, "cost_code" | "description" | "id"> | null;
  budget_line_id: string | null;
  description: string;
  id: string;
  line_number: number;
  line_total: number;
  notes: string;
  quantity: number;
  unit_cost: number;
};

export type OpsPaymentRequestSummary = {
  approval_request_id: string | null;
  approved_at: string | null;
  budget: {
    budget_number: string;
    id: string;
    title: string;
  } | null;
  budget_id: string | null;
  budget_line: Pick<OpsProjectBudgetLineSummary, "cost_code" | "description" | "id"> | null;
  budget_line_id: string | null;
  cost_entry: OpsProjectCostEntrySummary | null;
  created_at: string;
  created_by: string | null;
  currency_code: string;
  description: string;
  due_date: string | null;
  id: string;
  invoice_reference: string;
  items: OpsPaymentRequestItemSummary[];
  paid_at: string | null;
  payment_reference: string;
  payment_type: OpsPaymentRequestType;
  purchase_order: {
    id: string;
    po_number: string;
    status: OpsPurchaseOrderStatus;
    total_amount: number;
  } | null;
  purchase_order_id: string | null;
  request_number: string;
  requested_amount: number;
  requested_by: string | null;
  requested_by_user: {
    full_name: string;
    id: string;
    role: OpsUserRole;
  } | null;
  site: OpsFinanceSiteSummary | null;
  site_id: string;
  status: OpsPaymentRequestStatus;
  supplier: OpsFinanceSupplierSummary | null;
  supplier_id: string | null;
  title: string;
  updated_at: string;
};

export type OpsProjectBudgetStats = {
  activeBudgets: number;
  committedAmount: number;
  draftBudgets: number;
  postedAmount: number;
  totalBudgetedAmount: number;
};

export type OpsPaymentRequestStats = {
  approved: number;
  draft: number;
  paid: number;
  submitted: number;
  unpaidAmount: number;
};

export type OpsFinanceAgeingItem = {
  amount: number;
  bucket: OpsFinanceAgeingBucket;
  days_until_due: number | null;
  due_date: string | null;
  id: string;
  request_number: string;
  site: OpsFinanceSiteSummary | null;
  status: OpsPaymentRequestStatus;
  supplier: OpsFinanceSupplierSummary | null;
  title: string;
};

export type OpsFinanceAgeingDashboard = {
  asOfDate: string;
  attentionItems: OpsFinanceAgeingItem[];
  buckets: OpsFinanceAgeingBucketSummary[];
  dueSoonAmount: number;
  overdueAmount: number;
  totalUnpaid: number;
};

export type OpsFinanceCashflowDashboard = {
  approvedPayables: number;
  asOfDate: string;
  draftReceivables: number;
  netNext30: number;
  next30Date: string;
  next30Payables: number;
  openReceivables: number;
  overduePayables: number;
  paidThisMonth: number;
  receivedThisMonth: number;
  sentReceivables: number;
};

export type OpsBudgetVarianceRow = {
  budget_number: string;
  committed_amount: number;
  currency_code: string;
  exposure_amount: number;
  id: string;
  over_budget_amount: number;
  posted_amount: number;
  remaining_amount: number;
  site: OpsFinanceSiteSummary | null;
  title: string;
  total_budgeted_amount: number;
  variance_percent: number;
};

export type OpsBudgetVarianceDashboard = {
  overBudgetAmount: number;
  rows: OpsBudgetVarianceRow[];
  totalBudgetedAmount: number;
  totalCommittedAmount: number;
  totalExposureAmount: number;
  totalPostedAmount: number;
  totalRemainingAmount: number;
};

export type OpsFinanceBudgetLineOption = {
  budget: {
    budget_number: string;
    id: string;
    site_id: string;
    title: string;
  } | null;
  budget_id: string;
  budgeted_amount: number;
  category: string;
  cost_code: string;
  description: string;
  id: string;
};

export type OpsFinancePurchaseOrderOption = {
  id: string;
  po_number: string;
  site: OpsFinanceSiteSummary | null;
  site_id: string;
  status: OpsPurchaseOrderStatus;
  supplier: OpsFinanceSupplierSummary | null;
  supplier_id: string;
  title: string;
  total_amount: number;
};

export type FetchPaginatedOpsProjectBudgetsOptions = {
  listState: OpsListState;
  query?: string;
  status?: OpsProjectBudgetStatus;
};

export type FetchPaginatedOpsPaymentRequestsOptions = {
  listState: OpsListState;
  query?: string;
  status?: OpsPaymentRequestStatus;
};

type RawRelation<T> = T | T[] | null;

type RawProjectBudget = Omit<
  OpsProjectBudgetSummary,
  | "committed_amount"
  | "contingency_amount"
  | "lines"
  | "posted_amount"
  | "remaining_amount"
  | "site"
  | "total_budgeted_amount"
> & {
  contingency_amount: number | string;
  site: RawRelation<OpsFinanceSiteSummary>;
};

type RawProjectBudgetLine = Omit<
  OpsProjectBudgetLineSummary,
  "budgeted_amount" | "committed_amount" | "posted_amount"
> & {
  budget_id: string;
  budgeted_amount: number | string;
};

type RawProjectCostEntry = Omit<OpsProjectCostEntrySummary, "amount"> & {
  amount: number | string;
};

type RawPaymentRequest = Omit<
  OpsPaymentRequestSummary,
  | "budget"
  | "budget_line"
  | "cost_entry"
  | "items"
  | "purchase_order"
  | "requested_amount"
  | "requested_by_user"
  | "site"
  | "supplier"
> & {
  budget: RawRelation<OpsPaymentRequestSummary["budget"]>;
  budget_line: RawRelation<OpsPaymentRequestSummary["budget_line"]>;
  purchase_order: RawRelation<Omit<NonNullable<OpsPaymentRequestSummary["purchase_order"]>, "total_amount"> & {
    total_amount: number | string;
  }>;
  requested_amount: number | string;
  requested_by_user: RawRelation<OpsPaymentRequestSummary["requested_by_user"]>;
  site: RawRelation<OpsFinanceSiteSummary>;
  supplier: RawRelation<OpsFinanceSupplierSummary>;
};

type RawPaymentRequestItem = Omit<
  OpsPaymentRequestItemSummary,
  "budget_line" | "line_total" | "quantity" | "unit_cost"
> & {
  budget_line: RawRelation<OpsPaymentRequestItemSummary["budget_line"]>;
  line_total: number | string;
  payment_request_id: string;
  quantity: number | string;
  unit_cost: number | string;
};

type RawBudgetLineOption = Omit<
  OpsFinanceBudgetLineOption,
  "budget" | "budgeted_amount"
> & {
  budget: RawRelation<OpsFinanceBudgetLineOption["budget"]>;
  budgeted_amount: number | string;
};

type RawPurchaseOrderOption = Omit<
  OpsFinancePurchaseOrderOption,
  "site" | "supplier" | "total_amount"
> & {
  site: RawRelation<OpsFinanceSiteSummary>;
  supplier: RawRelation<OpsFinanceSupplierSummary>;
  total_amount: number | string;
};

type RawFinancePaymentRequestReportRow = {
  created_at: string;
  currency_code: string;
  due_date: string | null;
  id: string;
  paid_at: string | null;
  request_number: string;
  requested_amount: number | string;
  site: RawRelation<OpsFinanceSiteSummary>;
  status: OpsPaymentRequestStatus;
  supplier: RawRelation<OpsFinanceSupplierSummary>;
  title: string;
};

type RawFinanceInvoiceReportRow = {
  client_name: string;
  id: string;
  invoice_number: string;
  issued_at: string;
  paid_at: string | null;
  status: OpsInvoiceStatus;
  total_amount: number | string;
};

type RawBudgetVarianceBudget = {
  budget_number: string;
  contingency_amount: number | string;
  currency_code: string;
  id: string;
  site: RawRelation<OpsFinanceSiteSummary>;
  title: string;
};

function normalizeNumber(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

function normalizeRelation<T>(value: RawRelation<T>) {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function normalizeLimit(limit: number, max = 250) {
  return Math.min(Math.max(limit, 1), max);
}

function dateOnly(value: string | null) {
  return value ? value.slice(0, 10) : null;
}

function groupBudgetLines(lines: RawProjectBudgetLine[], costs: OpsProjectCostEntrySummary[]) {
  const costsByLineId = new Map<string, OpsProjectCostEntrySummary[]>();

  costs.forEach((cost) => {
    if (!cost.budget_line_id) {
      return;
    }

    costsByLineId.set(cost.budget_line_id, [
      ...(costsByLineId.get(cost.budget_line_id) ?? []),
      cost,
    ]);
  });

  const grouped = new Map<string, OpsProjectBudgetLineSummary[]>();

  lines.forEach((line) => {
    const lineCosts = costsByLineId.get(line.id) ?? [];
    const committed = lineCosts
      .filter((cost) => cost.status === "committed")
      .reduce((sum, cost) => sum + cost.amount, 0);
    const posted = lineCosts
      .filter((cost) => cost.status === "posted")
      .reduce((sum, cost) => sum + cost.amount, 0);
    const normalized: OpsProjectBudgetLineSummary = {
      ...line,
      budgeted_amount: normalizeNumber(line.budgeted_amount),
      committed_amount: committed,
      posted_amount: posted,
    };

    grouped.set(line.budget_id, [...(grouped.get(line.budget_id) ?? []), normalized]);
  });

  return grouped;
}

async function fetchProjectBudgetLines(budgetIds: string[]) {
  if (budgetIds.length === 0) {
    return [];
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("project_budget_lines")
    .select(
      "id, budget_id, line_number, cost_code, category, description, budgeted_amount, notes, created_at",
    )
    .in("budget_id", budgetIds)
    .order("line_number", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as unknown as RawProjectBudgetLine[];
}

async function fetchProjectCostEntriesByBudget(budgetIds: string[]) {
  if (budgetIds.length === 0) {
    return [];
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("project_cost_entries")
    .select(
      "id, site_id, budget_id, budget_line_id, supplier_id, purchase_order_id, payment_request_id, source_table, source_id, cost_type, description, amount, currency_code, cost_date, status",
    )
    .in("budget_id", budgetIds)
    .neq("status", "cancelled")
    .order("cost_date", { ascending: false });

  if (error) {
    throw error;
  }

  return ((data ?? []) as unknown as RawProjectCostEntry[]).map((entry) => ({
    ...entry,
    amount: normalizeNumber(entry.amount),
  }));
}

async function fetchPaymentRequestItems(paymentRequestIds: string[]) {
  if (paymentRequestIds.length === 0) {
    return new Map<string, OpsPaymentRequestItemSummary[]>();
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("payment_request_items")
    .select(
      [
        "id",
        "payment_request_id",
        "budget_line_id",
        "line_number",
        "description",
        "quantity",
        "unit_cost",
        "line_total",
        "notes",
        "budget_line:project_budget_lines!payment_request_items_budget_line_id_fkey(id, cost_code, description)",
      ].join(", "),
    )
    .in("payment_request_id", paymentRequestIds)
    .order("line_number", { ascending: true });

  if (error) {
    throw error;
  }

  const grouped = new Map<string, OpsPaymentRequestItemSummary[]>();

  ((data ?? []) as unknown as RawPaymentRequestItem[]).forEach((item) => {
    const normalized: OpsPaymentRequestItemSummary = {
      ...item,
      budget_line: normalizeRelation(item.budget_line),
      line_total: normalizeNumber(item.line_total),
      quantity: normalizeNumber(item.quantity),
      unit_cost: normalizeNumber(item.unit_cost),
    };
    grouped.set(item.payment_request_id, [
      ...(grouped.get(item.payment_request_id) ?? []),
      normalized,
    ]);
  });

  return grouped;
}

async function fetchCostEntriesByPaymentRequest(paymentRequestIds: string[]) {
  if (paymentRequestIds.length === 0) {
    return new Map<string, OpsProjectCostEntrySummary>();
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("project_cost_entries")
    .select(
      "id, site_id, budget_id, budget_line_id, supplier_id, purchase_order_id, payment_request_id, source_table, source_id, cost_type, description, amount, currency_code, cost_date, status",
    )
    .in("payment_request_id", paymentRequestIds)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return new Map(
    ((data ?? []) as unknown as RawProjectCostEntry[])
      .filter((entry) => entry.payment_request_id)
      .map((entry) => [
        entry.payment_request_id as string,
        {
          ...entry,
          amount: normalizeNumber(entry.amount),
        } satisfies OpsProjectCostEntrySummary,
      ]),
  );
}

async function countByStatus(table: "payment_requests", status: OpsPaymentRequestStatus) {
  const supabase = getOpsSupabaseServiceClient();
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("status", status);

  if (error) {
    throw error;
  }

  return count ?? 0;
}

async function countBudgetByStatus(status: OpsProjectBudgetStatus) {
  const supabase = getOpsSupabaseServiceClient();
  const { count, error } = await supabase
    .from("project_budgets")
    .select("id", { count: "exact", head: true })
    .eq("status", status);

  if (error) {
    throw error;
  }

  return count ?? 0;
}

export async function fetchPaginatedOpsProjectBudgets(
  options: FetchPaginatedOpsProjectBudgetsOptions,
): Promise<OpsPaginatedResult<OpsProjectBudgetSummary>> {
  const { profile } = await requireOpsUser();

  if (!canViewOpsFinanceBridge(profile.role)) {
    return toOpsPaginatedResult([], 0, options.listState);
  }

  const supabase = getOpsSupabaseServiceClient();
  let query = supabase
    .from("project_budgets")
    .select(
      [
        "id",
        "budget_number",
        "site_id",
        "title",
        "description",
        "status",
        "currency_code",
        "contingency_amount",
        "effective_from",
        "active_at",
        "locked_at",
        "archived_at",
        "created_by",
        "created_at",
        "updated_at",
        "site:sites!project_budgets_site_id_fkey(id, code, name)",
      ].join(", "),
      { count: "exact" },
    )
    .order("effective_from", { ascending: false })
    .order("created_at", { ascending: false });

  if (options.status) {
    query = query.eq("status", options.status);
  }

  const searchFilter = opsIlikeOrFilter(
    ["budget_number", "title", "description"],
    options.query ?? "",
  );

  if (searchFilter) {
    query = query.or(searchFilter);
  }

  const { data, error, count } = await query.range(options.listState.from, options.listState.to);

  if (error) {
    throw error;
  }

  const budgets = (data ?? []) as unknown as RawProjectBudget[];
  const budgetIds = budgets.map((budget) => budget.id);
  const [lines, costs] = await Promise.all([
    fetchProjectBudgetLines(budgetIds),
    fetchProjectCostEntriesByBudget(budgetIds),
  ]);
  const linesByBudgetId = groupBudgetLines(lines, costs);

  return toOpsPaginatedResult(
    budgets.map((budget) => {
      const budgetLines = linesByBudgetId.get(budget.id) ?? [];
      const totalBudgetedAmount = budgetLines.reduce(
        (sum, line) => sum + line.budgeted_amount,
        0,
      );
      const committedAmount = budgetLines.reduce(
        (sum, line) => sum + line.committed_amount,
        0,
      );
      const postedAmount = budgetLines.reduce((sum, line) => sum + line.posted_amount, 0);
      const totalWithContingency = totalBudgetedAmount + normalizeNumber(budget.contingency_amount);

      return {
        ...budget,
        committed_amount: committedAmount,
        contingency_amount: normalizeNumber(budget.contingency_amount),
        lines: budgetLines,
        posted_amount: postedAmount,
        remaining_amount: totalWithContingency - committedAmount - postedAmount,
        site: normalizeRelation(budget.site),
        total_budgeted_amount: totalBudgetedAmount,
      } satisfies OpsProjectBudgetSummary;
    }),
    count,
    options.listState,
  );
}

export async function fetchPaginatedOpsPaymentRequests(
  options: FetchPaginatedOpsPaymentRequestsOptions,
): Promise<OpsPaginatedResult<OpsPaymentRequestSummary>> {
  const { profile } = await requireOpsUser();

  if (!canViewOpsFinanceBridge(profile.role)) {
    return toOpsPaginatedResult([], 0, options.listState);
  }

  const supabase = getOpsSupabaseServiceClient();
  let query = supabase
    .from("payment_requests")
    .select(
      [
        "id",
        "request_number",
        "site_id",
        "supplier_id",
        "purchase_order_id",
        "budget_id",
        "budget_line_id",
        "payment_type",
        "status",
        "title",
        "description",
        "invoice_reference",
        "currency_code",
        "requested_amount",
        "due_date",
        "requested_by",
        "approval_request_id",
        "payment_reference",
        "approved_at",
        "paid_at",
        "created_by",
        "created_at",
        "updated_at",
        "site:sites!payment_requests_site_id_fkey(id, code, name)",
        "supplier:suppliers!payment_requests_supplier_id_fkey(id, supplier_code, legal_name)",
        "purchase_order:purchase_orders!payment_requests_purchase_order_id_fkey(id, po_number, status, total_amount)",
        "budget:project_budgets!payment_requests_budget_id_fkey(id, budget_number, title)",
        "budget_line:project_budget_lines!payment_requests_budget_line_id_fkey(id, cost_code, description)",
        "requested_by_user:users!payment_requests_requested_by_fkey(id, full_name, role)",
      ].join(", "),
      { count: "exact" },
    )
    .order("created_at", { ascending: false });

  if (options.status) {
    query = query.eq("status", options.status);
  }

  const searchFilter = opsIlikeOrFilter(
    ["request_number", "title", "description", "invoice_reference", "payment_reference"],
    options.query ?? "",
  );

  if (searchFilter) {
    query = query.or(searchFilter);
  }

  const { data, error, count } = await query.range(options.listState.from, options.listState.to);

  if (error) {
    throw error;
  }

  const paymentRequests = (data ?? []) as unknown as RawPaymentRequest[];
  const paymentRequestIds = paymentRequests.map((request) => request.id);
  const [itemsByRequestId, costEntryByRequestId] = await Promise.all([
    fetchPaymentRequestItems(paymentRequestIds),
    fetchCostEntriesByPaymentRequest(paymentRequestIds),
  ]);

  return toOpsPaginatedResult(
    paymentRequests.map((request) => {
      const purchaseOrder = normalizeRelation(request.purchase_order);

      return {
        ...request,
        budget: normalizeRelation(request.budget),
        budget_line: normalizeRelation(request.budget_line),
        cost_entry: costEntryByRequestId.get(request.id) ?? null,
        items: itemsByRequestId.get(request.id) ?? [],
        purchase_order: purchaseOrder
          ? {
              ...purchaseOrder,
              total_amount: normalizeNumber(purchaseOrder.total_amount),
            }
          : null,
        requested_amount: normalizeNumber(request.requested_amount),
        requested_by_user: normalizeRelation(request.requested_by_user),
        site: normalizeRelation(request.site),
        supplier: normalizeRelation(request.supplier),
      } satisfies OpsPaymentRequestSummary;
    }),
    count,
    options.listState,
  );
}

export async function fetchOpsProjectBudgetStats(): Promise<OpsProjectBudgetStats> {
  const { profile } = await requireOpsUser();

  if (!canViewOpsFinanceBridge(profile.role)) {
    return {
      activeBudgets: 0,
      committedAmount: 0,
      draftBudgets: 0,
      postedAmount: 0,
      totalBudgetedAmount: 0,
    };
  }

  const supabase = getOpsSupabaseServiceClient();
  const [
    draftBudgets,
    activeBudgets,
    { data: lines, error: linesError },
    { data: costs, error: costsError },
  ] = await Promise.all([
    countBudgetByStatus("draft"),
    countBudgetByStatus("active"),
    supabase.from("project_budget_lines").select("budgeted_amount"),
    supabase.from("project_cost_entries").select("amount, status").neq("status", "cancelled"),
  ]);

  if (linesError || costsError) {
    throw linesError ?? costsError;
  }

  const totalBudgetedAmount = (lines ?? []).reduce(
    (sum, line) => sum + normalizeNumber(line.budgeted_amount as number | string),
    0,
  );
  const committedAmount = (costs ?? [])
    .filter((cost) => cost.status === "committed")
    .reduce((sum, cost) => sum + normalizeNumber(cost.amount as number | string), 0);
  const postedAmount = (costs ?? [])
    .filter((cost) => cost.status === "posted")
    .reduce((sum, cost) => sum + normalizeNumber(cost.amount as number | string), 0);

  return {
    activeBudgets,
    committedAmount,
    draftBudgets,
    postedAmount,
    totalBudgetedAmount,
  };
}

export async function fetchOpsPaymentRequestStats(): Promise<OpsPaymentRequestStats> {
  const { profile } = await requireOpsUser();

  if (!canViewOpsFinanceBridge(profile.role)) {
    return {
      approved: 0,
      draft: 0,
      paid: 0,
      submitted: 0,
      unpaidAmount: 0,
    };
  }

  const supabase = getOpsSupabaseServiceClient();
  const [
    draft,
    submitted,
    financeReview,
    approved,
    paid,
    { data: unpaidRequests, error: unpaidError },
  ] = await Promise.all([
    countByStatus("payment_requests", "draft"),
    countByStatus("payment_requests", "submitted"),
    countByStatus("payment_requests", "finance_review"),
    countByStatus("payment_requests", "approved"),
    countByStatus("payment_requests", "paid"),
    supabase
      .from("payment_requests")
      .select("requested_amount")
      .in("status", ["submitted", "finance_review", "approved"]),
  ]);

  if (unpaidError) {
    throw unpaidError;
  }

  return {
    approved,
    draft,
    paid,
    submitted: submitted + financeReview,
    unpaidAmount: (unpaidRequests ?? []).reduce(
      (sum, request) => sum + normalizeNumber(request.requested_amount as number | string),
      0,
    ),
  };
}

export async function fetchOpsFinanceAgeingDashboard(): Promise<OpsFinanceAgeingDashboard> {
  const asOfDate = getOpsFinanceTodayIso();
  const buckets = createOpsFinanceAgeingBucketSummaries();
  const { profile } = await requireOpsUser();

  if (!canViewOpsFinanceBridge(profile.role)) {
    return {
      asOfDate,
      attentionItems: [],
      buckets,
      dueSoonAmount: 0,
      overdueAmount: 0,
      totalUnpaid: 0,
    };
  }

  const bucketByKey = new Map(buckets.map((bucket) => [bucket.bucket, bucket]));
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("payment_requests")
    .select(
      [
        "id",
        "request_number",
        "status",
        "title",
        "requested_amount",
        "currency_code",
        "due_date",
        "paid_at",
        "created_at",
        "site:sites!payment_requests_site_id_fkey(id, code, name)",
        "supplier:suppliers!payment_requests_supplier_id_fkey(id, supplier_code, legal_name)",
      ].join(", "),
    )
    .in("status", ["submitted", "finance_review", "approved"])
    .order("due_date", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    throw error;
  }

  let totalUnpaid = 0;
  let dueSoonAmount = 0;
  let overdueAmount = 0;

  const items = ((data ?? []) as unknown as RawFinancePaymentRequestReportRow[]).map(
    (request) => {
      const amount = normalizeNumber(request.requested_amount);
      const bucket = getOpsFinanceAgeingBucket(request.due_date, asOfDate);
      const daysUntilDue = getOpsFinanceCalendarDayDelta(request.due_date, asOfDate);
      const bucketSummary = bucketByKey.get(bucket);

      if (bucketSummary) {
        bucketSummary.amount += amount;
        bucketSummary.count += 1;
      }

      totalUnpaid += amount;

      if (bucket === "due_soon") {
        dueSoonAmount += amount;
      }

      if (bucket.startsWith("overdue")) {
        overdueAmount += amount;
      }

      return {
        amount,
        bucket,
        days_until_due: daysUntilDue,
        due_date: request.due_date,
        id: request.id,
        request_number: request.request_number,
        site: normalizeRelation(request.site),
        status: request.status,
        supplier: normalizeRelation(request.supplier),
        title: request.title,
      } satisfies OpsFinanceAgeingItem;
    },
  );

  return {
    asOfDate,
    attentionItems: items
      .filter((item) => item.bucket !== "current")
      .sort((first, second) => {
        const firstDue = first.days_until_due ?? Number.MAX_SAFE_INTEGER;
        const secondDue = second.days_until_due ?? Number.MAX_SAFE_INTEGER;
        return firstDue - secondDue;
      })
      .slice(0, 8),
    buckets,
    dueSoonAmount,
    overdueAmount,
    totalUnpaid,
  };
}

export async function fetchOpsFinanceCashflowDashboard(): Promise<OpsFinanceCashflowDashboard> {
  const asOfDate = getOpsFinanceTodayIso();
  const next30Date = getOpsFinanceDatePlusDays(asOfDate, 30);
  const monthStart = getOpsFinanceMonthStartIso(asOfDate);
  const { profile } = await requireOpsUser();

  const emptyDashboard = {
    approvedPayables: 0,
    asOfDate,
    draftReceivables: 0,
    netNext30: 0,
    next30Date,
    next30Payables: 0,
    openReceivables: 0,
    overduePayables: 0,
    paidThisMonth: 0,
    receivedThisMonth: 0,
    sentReceivables: 0,
  };

  if (!canViewOpsFinanceBridge(profile.role)) {
    return emptyDashboard;
  }

  const supabase = getOpsSupabaseServiceClient();
  const [paymentResult, invoiceResult] = await Promise.all([
    supabase
      .from("payment_requests")
      .select("id, request_number, status, title, requested_amount, currency_code, due_date, paid_at, created_at")
      .in("status", ["submitted", "finance_review", "approved", "paid"])
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("invoices")
      .select("id, invoice_number, client_name, status, total_amount, issued_at, paid_at")
      .is("deleted_at", null)
      .order("issued_at", { ascending: false })
      .limit(500),
  ]);

  if (paymentResult.error || invoiceResult.error) {
    throw paymentResult.error ?? invoiceResult.error;
  }

  const payments = (paymentResult.data ?? []) as unknown as RawFinancePaymentRequestReportRow[];
  const invoices = (invoiceResult.data ?? []) as unknown as RawFinanceInvoiceReportRow[];

  const unpaidPayments = payments.filter((payment) =>
    ["submitted", "finance_review", "approved"].includes(payment.status),
  );
  const next30Payables = unpaidPayments
    .filter((payment) => {
      const dueDate = payment.due_date;
      return dueDate ? dueDate <= next30Date : false;
    })
    .reduce((sum, payment) => sum + normalizeNumber(payment.requested_amount), 0);
  const overduePayables = unpaidPayments
    .filter((payment) => Boolean(payment.due_date && payment.due_date < asOfDate))
    .reduce((sum, payment) => sum + normalizeNumber(payment.requested_amount), 0);
  const approvedPayables = unpaidPayments
    .filter((payment) => payment.status === "approved")
    .reduce((sum, payment) => sum + normalizeNumber(payment.requested_amount), 0);
  const paidThisMonth = payments
    .filter((payment) => {
      const paidDate = dateOnly(payment.paid_at);
      return paidDate ? paidDate >= monthStart : false;
    })
    .reduce((sum, payment) => sum + normalizeNumber(payment.requested_amount), 0);

  const openReceivables = invoices
    .filter((invoice) => invoice.status !== "paid")
    .reduce((sum, invoice) => sum + normalizeNumber(invoice.total_amount), 0);
  const draftReceivables = invoices
    .filter((invoice) => invoice.status === "draft")
    .reduce((sum, invoice) => sum + normalizeNumber(invoice.total_amount), 0);
  const sentReceivables = invoices
    .filter((invoice) => invoice.status === "sent")
    .reduce((sum, invoice) => sum + normalizeNumber(invoice.total_amount), 0);
  const receivedThisMonth = invoices
    .filter((invoice) => {
      const paidDate = dateOnly(invoice.paid_at);
      return invoice.status === "paid" && paidDate ? paidDate >= monthStart : false;
    })
    .reduce((sum, invoice) => sum + normalizeNumber(invoice.total_amount), 0);

  return {
    approvedPayables,
    asOfDate,
    draftReceivables,
    netNext30: openReceivables - next30Payables,
    next30Date,
    next30Payables,
    openReceivables,
    overduePayables,
    paidThisMonth,
    receivedThisMonth,
    sentReceivables,
  };
}

export async function fetchOpsBudgetVarianceDashboard(): Promise<OpsBudgetVarianceDashboard> {
  const { profile } = await requireOpsUser();

  const emptyDashboard = {
    overBudgetAmount: 0,
    rows: [],
    totalBudgetedAmount: 0,
    totalCommittedAmount: 0,
    totalExposureAmount: 0,
    totalPostedAmount: 0,
    totalRemainingAmount: 0,
  };

  if (!canViewOpsFinanceBridge(profile.role)) {
    return emptyDashboard;
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data: budgets, error: budgetError } = await supabase
    .from("project_budgets")
    .select(
      [
        "id",
        "budget_number",
        "title",
        "currency_code",
        "contingency_amount",
        "site:sites!project_budgets_site_id_fkey(id, code, name)",
      ].join(", "),
    )
    .in("status", ["active", "locked"])
    .order("updated_at", { ascending: false })
    .limit(500);

  if (budgetError) {
    throw budgetError;
  }

  const budgetRows = (budgets ?? []) as unknown as RawBudgetVarianceBudget[];
  const budgetIds = budgetRows.map((budget) => budget.id);

  if (budgetIds.length === 0) {
    return emptyDashboard;
  }

  const [lines, costs] = await Promise.all([
    fetchProjectBudgetLines(budgetIds),
    fetchProjectCostEntriesByBudget(budgetIds),
  ]);
  const linesByBudgetId = new Map<string, RawProjectBudgetLine[]>();
  const costsByBudgetId = new Map<string, OpsProjectCostEntrySummary[]>();

  lines.forEach((line) => {
    linesByBudgetId.set(line.budget_id, [
      ...(linesByBudgetId.get(line.budget_id) ?? []),
      line,
    ]);
  });

  costs.forEach((cost) => {
    if (!cost.budget_id) {
      return;
    }

    costsByBudgetId.set(cost.budget_id, [
      ...(costsByBudgetId.get(cost.budget_id) ?? []),
      cost,
    ]);
  });

  const rows = budgetRows.map((budget) => {
    const budgetLines = linesByBudgetId.get(budget.id) ?? [];
    const budgetCosts = costsByBudgetId.get(budget.id) ?? [];
    const lineBudgetedAmount = budgetLines.reduce(
      (sum, line) => sum + normalizeNumber(line.budgeted_amount),
      0,
    );
    const totalBudgetedAmount =
      lineBudgetedAmount + normalizeNumber(budget.contingency_amount);
    const committedAmount = budgetCosts
      .filter((cost) => cost.status === "committed")
      .reduce((sum, cost) => sum + cost.amount, 0);
    const postedAmount = budgetCosts
      .filter((cost) => cost.status === "posted")
      .reduce((sum, cost) => sum + cost.amount, 0);
    const exposureAmount = committedAmount + postedAmount;
    const remainingAmount = totalBudgetedAmount - exposureAmount;
    const overBudgetAmount = Math.max(0, exposureAmount - totalBudgetedAmount);

    return {
      budget_number: budget.budget_number,
      committed_amount: committedAmount,
      currency_code: budget.currency_code,
      exposure_amount: exposureAmount,
      id: budget.id,
      over_budget_amount: overBudgetAmount,
      posted_amount: postedAmount,
      remaining_amount: remainingAmount,
      site: normalizeRelation(budget.site),
      title: budget.title,
      total_budgeted_amount: totalBudgetedAmount,
      variance_percent:
        totalBudgetedAmount > 0 ? (exposureAmount / totalBudgetedAmount) * 100 : 0,
    } satisfies OpsBudgetVarianceRow;
  });

  return {
    overBudgetAmount: rows.reduce((sum, row) => sum + row.over_budget_amount, 0),
    rows: rows
      .sort((first, second) => {
        if (second.over_budget_amount !== first.over_budget_amount) {
          return second.over_budget_amount - first.over_budget_amount;
        }

        return second.variance_percent - first.variance_percent;
      })
      .slice(0, 8),
    totalBudgetedAmount: rows.reduce((sum, row) => sum + row.total_budgeted_amount, 0),
    totalCommittedAmount: rows.reduce((sum, row) => sum + row.committed_amount, 0),
    totalExposureAmount: rows.reduce((sum, row) => sum + row.exposure_amount, 0),
    totalPostedAmount: rows.reduce((sum, row) => sum + row.posted_amount, 0),
    totalRemainingAmount: rows.reduce((sum, row) => sum + row.remaining_amount, 0),
  };
}

export async function fetchFinanceBudgetLineOptions(limit = 250) {
  const { profile } = await requireOpsUser();

  if (!canViewOpsFinanceBridge(profile.role)) {
    return [];
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data: budgets, error: budgetError } = await supabase
    .from("project_budgets")
    .select("id")
    .in("status", ["active", "locked"])
    .order("created_at", { ascending: false })
    .limit(normalizeLimit(limit, 500));

  if (budgetError) {
    throw budgetError;
  }

  const budgetIds = (budgets ?? []).map((budget) => budget.id as string);

  if (budgetIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("project_budget_lines")
    .select(
      [
        "id",
        "budget_id",
        "cost_code",
        "category",
        "description",
        "budgeted_amount",
        "budget:project_budgets!project_budget_lines_budget_id_fkey(id, budget_number, title, site_id)",
      ].join(", "),
    )
    .in("budget_id", budgetIds)
    .order("created_at", { ascending: false })
    .limit(normalizeLimit(limit, 500));

  if (error) {
    throw error;
  }

  return ((data ?? []) as unknown as RawBudgetLineOption[]).map((line) => ({
    ...line,
    budget: normalizeRelation(line.budget),
    budgeted_amount: normalizeNumber(line.budgeted_amount),
  }));
}

export async function fetchFinancePurchaseOrderOptions(limit = 200) {
  const { profile } = await requireOpsUser();

  if (!canViewOpsFinanceBridge(profile.role)) {
    return [];
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("purchase_orders")
    .select(
      [
        "id",
        "po_number",
        "supplier_id",
        "site_id",
        "title",
        "status",
        "total_amount",
        "supplier:suppliers!purchase_orders_supplier_id_fkey(id, supplier_code, legal_name)",
        "site:sites!purchase_orders_site_id_fkey(id, code, name)",
      ].join(", "),
    )
    .in("status", ["issued", "partially_received", "closed"])
    .order("created_at", { ascending: false })
    .limit(normalizeLimit(limit, 500));

  if (error) {
    throw error;
  }

  return ((data ?? []) as unknown as RawPurchaseOrderOption[]).map((purchaseOrder) => ({
    ...purchaseOrder,
    site: normalizeRelation(purchaseOrder.site),
    supplier: normalizeRelation(purchaseOrder.supplier),
    total_amount: normalizeNumber(purchaseOrder.total_amount),
  }));
}
