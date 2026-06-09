import {
  opsIlikePattern,
  toOpsPaginatedResult,
  type OpsListState,
  type OpsPaginatedResult,
} from "@/lib/ops/listing";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type { OpsBoqStatus } from "@/lib/ops/types";

export type OpsBoqSite = {
  id: string;
  code: string;
  name: string;
};

export type OpsBoqLineItem = {
  id: string;
  boq_id: string;
  description: string;
  unit: string;
  quantity: number;
  unit_rate: number;
  budgeted_total: number;
  actual_quantity: number;
  updated_at: string;
};

export type OpsBoqDocument = {
  id: string;
  site_id: string;
  title: string;
  version: number;
  status: OpsBoqStatus;
  created_at: string;
  updated_at: string;
  site: OpsBoqSite | null;
  items: OpsBoqLineItem[];
  budgeted_total: number;
  actual_total: number;
};

export type OpsBoqOption = {
  id: string;
  title: string;
  site_id: string;
  budgeted_total: number;
};

export type FetchOpsBoqDocumentsOptions = {
  query?: string;
  status?: OpsBoqStatus;
};

export type FetchPaginatedOpsBoqDocumentsOptions = FetchOpsBoqDocumentsOptions & {
  listState: OpsListState;
};

type Relation<T> = T | T[] | null;

type RawBoqDocument = Omit<
  OpsBoqDocument,
  "actual_total" | "budgeted_total" | "items" | "site"
> & {
  site: Relation<OpsBoqSite>;
};

type RawBoqLineItem = Omit<
  OpsBoqLineItem,
  "actual_quantity" | "budgeted_total" | "quantity" | "unit_rate"
> & {
  actual_quantity: number | string;
  budgeted_total: number | string;
  quantity: number | string;
  unit_rate: number | string;
};

function normalizeMoney(value: number | string | null) {
  return Number(value ?? 0);
}

function normalizeRelation<T>(value: Relation<T>) {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function normalizeLineItem(item: RawBoqLineItem): OpsBoqLineItem {
  return {
    ...item,
    actual_quantity: normalizeMoney(item.actual_quantity),
    budgeted_total: normalizeMoney(item.budgeted_total),
    quantity: normalizeMoney(item.quantity),
    unit_rate: normalizeMoney(item.unit_rate),
  };
}

async function fetchOpsBoqDocumentItems(
  options: FetchOpsBoqDocumentsOptions = {},
  listState?: OpsListState,
) {
  const supabase = getOpsSupabaseServiceClient();
  let documentQuery = supabase
    .from("boq_documents")
    .select(
      `
        id,
        site_id,
        title,
        version,
        status,
        created_at,
        updated_at,
        site:sites!boq_documents_site_id_fkey(id, code, name)
      `,
      listState ? { count: "exact" } : undefined,
    )
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  if (options.status) {
    documentQuery = documentQuery.eq("status", options.status);
  }

  const searchPattern = opsIlikePattern(options.query ?? "");

  if (searchPattern) {
    documentQuery = documentQuery.ilike("title", searchPattern);
  }

  const { data: documentData, error: documentError, count } = await (listState
    ? documentQuery.range(listState.from, listState.to)
    : documentQuery);

  if (documentError) {
    throw documentError;
  }

  const documents = ((documentData ?? []) as unknown as RawBoqDocument[]).map((document) => ({
    ...document,
    actual_total: 0,
    budgeted_total: 0,
    items: [] as OpsBoqLineItem[],
    site: normalizeRelation(document.site),
  }));

  if (!documents.length) {
    return {
      count,
      items: documents,
    };
  }

  const { data: itemData, error: itemError } = await supabase
    .from("boq_line_items")
    .select("id, boq_id, description, unit, quantity, unit_rate, budgeted_total, actual_quantity, updated_at")
    .in(
      "boq_id",
      documents.map((document) => document.id),
    )
    .order("created_at", { ascending: true });

  if (itemError) {
    throw itemError;
  }

  const items = ((itemData ?? []) as unknown as RawBoqLineItem[]).map(normalizeLineItem);

  const itemsWithTotals = documents.map((document) => {
    const documentItems = items.filter((item) => item.boq_id === document.id);
    const budgetedTotal = documentItems.reduce((sum, item) => sum + item.budgeted_total, 0);
    const actualTotal = documentItems.reduce(
      (sum, item) => sum + item.actual_quantity * item.unit_rate,
      0,
    );

    return {
      ...document,
      actual_total: actualTotal,
      budgeted_total: budgetedTotal,
      items: documentItems,
    };
  });

  return {
    count,
    items: itemsWithTotals,
  };
}

export async function fetchOpsBoqDocuments(options: FetchOpsBoqDocumentsOptions = {}) {
  const result = await fetchOpsBoqDocumentItems(options);
  return result.items;
}

export async function fetchPaginatedOpsBoqDocuments(
  options: FetchPaginatedOpsBoqDocumentsOptions,
): Promise<OpsPaginatedResult<OpsBoqDocument>> {
  const result = await fetchOpsBoqDocumentItems(options, options.listState);
  return toOpsPaginatedResult(result.items, result.count, options.listState);
}

export async function fetchOpsBoqOptions() {
  const documents = await fetchOpsBoqDocuments();

  return documents.map((document) => ({
    budgeted_total: document.budgeted_total,
    id: document.id,
    site_id: document.site_id,
    title: document.title,
  }));
}
