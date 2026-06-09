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
  OpsSupplierQuoteStatus,
  OpsSupplierStatus,
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

export type OpsRfqSupplierSummary = {
  id: string;
  legal_name: string;
  status: OpsSupplierStatus;
  supplier_code: string;
  trading_name: string;
};

export type OpsRfqItemSummary = {
  created_at: string;
  estimated_total: number;
  estimated_unit_cost: number;
  id: string;
  item_name: string;
  line_number: number;
  notes: string;
  quantity: number;
  rfq_id: string;
  specification: string;
  unit: string;
};

export type OpsSupplierQuoteSummary = {
  awarded_at: string | null;
  created_at: string;
  currency_code: string;
  id: string;
  notes: string;
  quote_number: string;
  quote_reference: string;
  quoted_total: number;
  rfq_id: string;
  status: OpsSupplierQuoteStatus;
  submitted_at: string | null;
  supplier: OpsRfqSupplierSummary | null;
  supplier_id: string;
  valid_until: string | null;
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
  supplier_quote_id: string | null;
  title: string;
  total_amount: number;
};

export type OpsRfqSummary = {
  awarded_quote_id: string | null;
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
  quotes: OpsSupplierQuoteSummary[];
  rfq_number: string;
  site: OpsRfqSiteSummary | null;
  site_id: string;
  status: OpsRfqStatus;
  title: string;
  updated_at: string;
};

export type OpsRfqPoStats = {
  awardedRfqs: number;
  draftPurchaseOrders: number;
  issuedRfqs: number;
  openRfqs: number;
  receivedQuotes: number;
};

export type FetchOpsRfqsOptions = {
  limit?: number;
  query?: string;
  status?: OpsRfqStatus;
};

export type FetchPaginatedOpsRfqsOptions = FetchOpsRfqsOptions & {
  listState: OpsListState;
};

type RawRfq = Omit<
  OpsRfqSummary,
  "estimated_total" | "items" | "material_request" | "purchase_orders" | "quotes" | "site"
> & {
  material_request:
    | OpsRfqMaterialRequestSummary
    | OpsRfqMaterialRequestSummary[]
    | null;
  site: OpsRfqSiteSummary | OpsRfqSiteSummary[] | null;
};

type RawRfqItem = Omit<
  OpsRfqItemSummary,
  "estimated_total" | "estimated_unit_cost" | "quantity"
> & {
  estimated_total: number | string;
  estimated_unit_cost: number | string;
  quantity: number | string;
};

type RawSupplierQuote = Omit<OpsSupplierQuoteSummary, "quoted_total" | "supplier"> & {
  quoted_total: number | string;
  supplier: OpsRfqSupplierSummary | OpsRfqSupplierSummary[] | null;
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
      quantity: normalizeMoney(item.quantity),
    };

    grouped.set(item.rfq_id, [...(grouped.get(item.rfq_id) ?? []), normalized]);
  });

  return grouped;
}

function groupSupplierQuotes(quotes: RawSupplierQuote[]) {
  const grouped = new Map<string, OpsSupplierQuoteSummary[]>();

  quotes.forEach((quote) => {
    const normalized = {
      ...quote,
      quoted_total: normalizeMoney(quote.quoted_total),
      supplier: normalizeRelation(quote.supplier),
    };

    grouped.set(quote.rfq_id, [...(grouped.get(quote.rfq_id) ?? []), normalized]);
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

export function lowestReceivedSupplierQuote(quotes: OpsSupplierQuoteSummary[]) {
  return quotes
    .filter((quote) => quote.status === "received" && quote.quoted_total > 0)
    .sort((a, b) => a.quoted_total - b.quoted_total)[0] ?? null;
}

async function fetchRfqItems(rfqIds: string[]) {
  if (rfqIds.length === 0) {
    return new Map<string, OpsRfqItemSummary[]>();
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("rfq_items")
    .select(
      "id, rfq_id, line_number, item_name, specification, unit, quantity, estimated_unit_cost, estimated_total, notes, created_at",
    )
    .in("rfq_id", rfqIds)
    .order("line_number", { ascending: true });

  if (error) {
    throw error;
  }

  return groupRfqItems((data ?? []) as unknown as RawRfqItem[]);
}

async function fetchSupplierQuotes(rfqIds: string[]) {
  if (rfqIds.length === 0) {
    return new Map<string, OpsSupplierQuoteSummary[]>();
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("supplier_quotes")
    .select(
      [
        "id",
        "quote_number",
        "rfq_id",
        "supplier_id",
        "quote_reference",
        "status",
        "quoted_total",
        "currency_code",
        "valid_until",
        "notes",
        "submitted_at",
        "awarded_at",
        "created_at",
        "supplier:suppliers!supplier_quotes_supplier_id_fkey(id, supplier_code, legal_name, trading_name, status)",
      ].join(", "),
    )
    .in("rfq_id", rfqIds)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return groupSupplierQuotes((data ?? []) as unknown as RawSupplierQuote[]);
}

async function fetchPurchaseOrders(rfqIds: string[]) {
  if (rfqIds.length === 0) {
    return new Map<string, OpsPurchaseOrderSummary[]>();
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("purchase_orders")
    .select(
      "id, po_number, rfq_id, supplier_quote_id, supplier_id, title, status, currency_code, total_amount, approval_request_id, approved_at, issued_at, created_at",
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
        "awarded_quote_id",
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
  const [itemsByRfqId, quotesByRfqId, purchaseOrdersByRfqId] = await Promise.all([
    fetchRfqItems(rfqIds),
    fetchSupplierQuotes(rfqIds),
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
        quotes: quotesByRfqId.get(rfq.id) ?? [],
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

async function countSupplierQuotesByStatus(status: OpsSupplierQuoteStatus) {
  const supabase = getOpsSupabaseServiceClient();
  const { count, error } = await supabase
    .from("supplier_quotes")
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

  const [draftRfqs, issuedRfqs, quotedRfqs, awardedRfqs, receivedQuotes, draftPurchaseOrders] =
    await Promise.all([
      countRfqByStatus("draft"),
      countRfqByStatus("issued"),
      countRfqByStatus("quoted"),
      countRfqByStatus("awarded"),
      countSupplierQuotesByStatus("received"),
      countPurchaseOrdersByStatus("draft"),
    ]);

  return {
    awardedRfqs,
    draftPurchaseOrders,
    issuedRfqs,
    openRfqs: draftRfqs + issuedRfqs + quotedRfqs,
    receivedQuotes,
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
