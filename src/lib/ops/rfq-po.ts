import { requireOpsUser } from "@/lib/ops/auth";
import {
  opsIlikeOrFilter,
  toOpsPaginatedResult,
  type OpsListState,
  type OpsPaginatedResult,
} from "@/lib/ops/listing";
import { canViewOpsRfqPo } from "@/lib/ops/rfq-po-permissions";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type {
  OpsMaterialRequestStatus,
  OpsPurchaseOrderStatus,
  OpsRfqStatus,
} from "@/lib/ops/types";

export type OpsRfqSiteSummary = {
  code: string;
  id: string;
  name: string;
};

export type OpsRfqMaterialRequestSummary = {
  id: string;
  request_number: string;
  status: OpsMaterialRequestStatus;
  title: string;
};

export type OpsRfqMaterialRequestOption = OpsRfqMaterialRequestSummary & {
  site: OpsRfqSiteSummary | null;
  site_id: string;
};

export type OpsRfqItemSummary = {
  created_at: string;
  estimated_total: number;
  estimated_unit_cost: number;
  actual_total: number;
  actual_unit_cost: number;
  id: string;
  item_name: string;
  line_number: number;
  notes: string;
  quantity: number;
  rfq_id: string;
  specification: string;
  supplier_id: string | null;
  supplier_name_freeform: string | null;
  unit: string;
};

export type OpsPurchaseOrderSummary = {
  approval_request_id: string | null;
  approved_at: string | null;
  created_at: string;
  currency_code: string;
  id: string;
  issued_at: string | null;
  po_number: string;
  rfq_id: string | null;
  status: OpsPurchaseOrderStatus;
  supplier_id: string;
  title: string;
  total_amount: number;
};

export type OpsRfqSummary = {
  cancelled_at: string | null;
  closed_at: string | null;
  created_at: string;
  created_by: string | null;
  currency_code: string;
  description: string;
  due_date: string | null;
  estimated_total: number;
  id: string;
  issued_at: string | null;
  items: OpsRfqItemSummary[];
  material_request: OpsRfqMaterialRequestSummary | null;
  material_request_id: string | null;
  purchase_orders: OpsPurchaseOrderSummary[];
  rfq_number: string;
  scope: "site" | "general";
  site: OpsRfqSiteSummary | null;
  site_id: string | null;
  status: OpsRfqStatus;
  title: string;
  updated_at: string;
};

export type OpsRfqPoStats = {
  awardedRfqs: number;
  draftPurchaseOrders: number;
  issuedRfqs: number;
  openRfqs: number;
  // Retained for the executive dashboard contract; always 0 now that the
  // supplier-quote subsystem is retired in favour of per-item actual pricing.
  receivedQuotes: number;
};

export type FetchOpsRfqsOptions = {
  limit?: number;
  query?: string;
  status?: OpsRfqStatus;
  scope?: "site" | "general";
};

export type FetchPaginatedOpsRfqsOptions = FetchOpsRfqsOptions & {
  listState: OpsListState;
};

type RawRfq = Omit<
  OpsRfqSummary,
  "estimated_total" | "items" | "material_request" | "purchase_orders" | "site"
> & {
  material_request:
    | OpsRfqMaterialRequestSummary
    | OpsRfqMaterialRequestSummary[]
    | null;
  site: OpsRfqSiteSummary | OpsRfqSiteSummary[] | null;
};

type RawRfqItem = Omit<
  OpsRfqItemSummary,
  "estimated_total" | "estimated_unit_cost" | "actual_total" | "actual_unit_cost" | "quantity"
> & {
  estimated_total: number | string;
  estimated_unit_cost: number | string;
  actual_total: number | string;
  actual_unit_cost: number | string;
  quantity: number | string;
};

type RawPurchaseOrder = Omit<OpsPurchaseOrderSummary, "total_amount"> & {
  total_amount: number | string;
};

type RawMaterialRequestOption = Omit<OpsRfqMaterialRequestOption, "site"> & {
  site: OpsRfqSiteSummary | OpsRfqSiteSummary[] | null;
};

function normalizeMoney(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

function normalizeLimit(limit: number | undefined) {
  return Math.min(Math.max(limit ?? 25, 1), 100);
}

function normalizeRelation<T>(value: T | T[] | null) {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function groupRfqItems(items: RawRfqItem[]) {
  const grouped = new Map<string, OpsRfqItemSummary[]>();

  items.forEach((item) => {
    const normalized = {
      ...item,
      estimated_total: normalizeMoney(item.estimated_total),
      estimated_unit_cost: normalizeMoney(item.estimated_unit_cost),
      actual_total: normalizeMoney(item.actual_total),
      actual_unit_cost: normalizeMoney(item.actual_unit_cost),
      quantity: normalizeMoney(item.quantity),
    };

    grouped.set(item.rfq_id, [...(grouped.get(item.rfq_id) ?? []), normalized]);
  });

  return grouped;
}

function groupPurchaseOrders(purchaseOrders: RawPurchaseOrder[]) {
  const grouped = new Map<string, OpsPurchaseOrderSummary[]>();

  purchaseOrders.forEach((purchaseOrder) => {
    if (!purchaseOrder.rfq_id) {
      return;
    }

    const normalized = {
      ...purchaseOrder,
      total_amount: normalizeMoney(purchaseOrder.total_amount),
    };

    grouped.set(purchaseOrder.rfq_id, [
      ...(grouped.get(purchaseOrder.rfq_id) ?? []),
      normalized,
    ]);
  });

  return grouped;
}

export function calculateOpsRfqEstimatedTotal(
  items: Array<Pick<OpsRfqItemSummary, "estimated_total">>,
) {
  return items.reduce((sum, item) => sum + normalizeMoney(item.estimated_total), 0);
}

async function fetchRfqItems(rfqIds: string[]) {
  if (rfqIds.length === 0) {
    return new Map<string, OpsRfqItemSummary[]>();
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("rfq_items")
    .select(
      "id, rfq_id, line_number, item_name, specification, unit, quantity, estimated_unit_cost, estimated_total, actual_unit_cost, actual_total, notes, supplier_id, supplier_name_freeform, created_at",
    )
    .in("rfq_id", rfqIds)
    .order("line_number", { ascending: true });

  if (error) {
    throw error;
  }

  return groupRfqItems((data ?? []) as unknown as RawRfqItem[]);
}

async function fetchPurchaseOrders(rfqIds: string[]) {
  if (rfqIds.length === 0) {
    return new Map<string, OpsPurchaseOrderSummary[]>();
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("purchase_orders")
    .select(
      "id, po_number, rfq_id, supplier_id, title, status, currency_code, total_amount, approval_request_id, approved_at, issued_at, created_at",
    )
    .in("rfq_id", rfqIds)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return groupPurchaseOrders((data ?? []) as unknown as RawPurchaseOrder[]);
}

async function fetchOpsRfqItems(options: FetchOpsRfqsOptions = {}, listState?: OpsListState) {
  const { profile } = await requireOpsUser();

  if (!canViewOpsRfqPo(profile.role)) {
    return {
      count: 0,
      items: [],
    };
  }

  const supabase = getOpsSupabaseServiceClient();
  let rfqQuery = supabase
    .from("rfqs")
    .select(
      [
        "id",
        "rfq_number",
        "scope",
        "site_id",
        "material_request_id",
        "title",
        "description",
        "status",
        "due_date",
        "currency_code",
        "created_by",
        "issued_at",
        "closed_at",
        "cancelled_at",
        "created_at",
        "updated_at",
        "site:sites(id, code, name)",
        "material_request:material_requests(id, request_number, title, status)",
      ].join(", "),
      listState ? { count: "exact" } : undefined,
    )
    .order("created_at", { ascending: false });

  if (options.status) {
    rfqQuery = rfqQuery.eq("status", options.status);
  }

  if (options.scope) {
    rfqQuery = rfqQuery.eq("scope", options.scope);
  }

  const searchFilter = opsIlikeOrFilter(
    ["rfq_number", "title", "description"],
    options.query ?? "",
  );

  if (searchFilter) {
    rfqQuery = rfqQuery.or(searchFilter);
  }

  const { data, error, count } = await (listState
    ? rfqQuery.range(listState.from, listState.to)
    : rfqQuery.limit(normalizeLimit(options.limit)));

  if (error) {
    throw error;
  }

  const rfqs = (data ?? []) as unknown as RawRfq[];
  const rfqIds = rfqs.map((rfq) => rfq.id);
  const [itemsByRfqId, purchaseOrdersByRfqId] = await Promise.all([
    fetchRfqItems(rfqIds),
    fetchPurchaseOrders(rfqIds),
  ]);

  return {
    count,
    items: rfqs.map((rfq) => {
      const items = itemsByRfqId.get(rfq.id) ?? [];

      return {
        ...rfq,
        estimated_total: calculateOpsRfqEstimatedTotal(items),
        items,
        material_request: normalizeRelation(rfq.material_request),
        purchase_orders: purchaseOrdersByRfqId.get(rfq.id) ?? [],
        site: normalizeRelation(rfq.site),
      } satisfies OpsRfqSummary;
    }),
  };
}

async function countRfqByStatus(status: OpsRfqStatus) {
  const supabase = getOpsSupabaseServiceClient();
  const { count, error } = await supabase
    .from("rfqs")
    .select("id", { count: "exact", head: true })
    .eq("status", status);

  if (error) {
    throw error;
  }

  return count ?? 0;
}

async function countPurchaseOrdersByStatus(status: OpsPurchaseOrderStatus) {
  const supabase = getOpsSupabaseServiceClient();
  const { count, error } = await supabase
    .from("purchase_orders")
    .select("id", { count: "exact", head: true })
    .eq("status", status);

  if (error) {
    throw error;
  }

  return count ?? 0;
}

export async function fetchOpsRfqs(options: FetchOpsRfqsOptions = {}) {
  const result = await fetchOpsRfqItems(options);
  return result.items;
}

export async function fetchPaginatedOpsRfqs(
  options: FetchPaginatedOpsRfqsOptions,
): Promise<OpsPaginatedResult<OpsRfqSummary>> {
  const result = await fetchOpsRfqItems(options, options.listState);
  return toOpsPaginatedResult(result.items, result.count, options.listState);
}

export async function fetchOpsRfqPoStats(): Promise<OpsRfqPoStats> {
  const { profile } = await requireOpsUser();

  if (!canViewOpsRfqPo(profile.role)) {
    return {
      awardedRfqs: 0,
      draftPurchaseOrders: 0,
      issuedRfqs: 0,
      openRfqs: 0,
      receivedQuotes: 0,
    };
  }

  const [draftRfqs, issuedRfqs, quotedRfqs, awardedRfqs, draftPurchaseOrders] =
    await Promise.all([
      countRfqByStatus("draft"),
      countRfqByStatus("issued"),
      countRfqByStatus("quoted"),
      countRfqByStatus("awarded"),
      countPurchaseOrdersByStatus("draft"),
    ]);

  return {
    awardedRfqs,
    draftPurchaseOrders,
    issuedRfqs,
    openRfqs: draftRfqs + issuedRfqs + quotedRfqs,
    receivedQuotes: 0,
  };
}

export async function fetchApprovedMaterialRequestOptions(
  limit = 100,
): Promise<OpsRfqMaterialRequestOption[]> {
  const { profile } = await requireOpsUser();

  if (!canViewOpsRfqPo(profile.role)) {
    return [];
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("material_requests")
    .select(
      "id, request_number, title, status, site_id, site:sites(id, code, name)",
    )
    .in("status", ["approved", "ordered", "closed"])
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 250));

  if (error) {
    throw error;
  }

  return ((data ?? []) as unknown as RawMaterialRequestOption[]).map((request) => ({
    ...request,
    site: normalizeRelation(request.site),
  }));
}
