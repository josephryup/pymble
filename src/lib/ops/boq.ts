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

export type OpsBoqLineSupplier = {
  id: string;
  supplier_code: string;
  legal_name: string;
};

export type OpsBoqLineTask = {
  id: string;
  title: string;
  planned_start_date: string;
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
  supplier_id: string | null;
  supplier: OpsBoqLineSupplier | null;
  supplier_name_freeform: string | null;
  category: string;
  needed_by: string | null;
  estimated_transport_cost: number;
  lead_time_days_override: number | null;
  project_task_id: string | null;
  task: OpsBoqLineTask | null;
  updated_at: string;
};

export type OpsBoqDocument = {
  id: string;
  site_id: string;
  title: string;
  version: number;
  status: OpsBoqStatus;
  submitted_at: string | null;
  priced_at: string | null;
  priced_by: string | null;
  issued_at: string | null;
  issued_by: string | null;
  budget_id: string | null;
  created_at: string;
  updated_at: string;
  site: OpsBoqSite | null;
  items: OpsBoqLineItem[];
  budgeted_total: number;
  actual_total: number;
  transport_total: number;
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
  | "actual_quantity"
  | "budgeted_total"
  | "quantity"
  | "unit_rate"
  | "supplier"
  | "estimated_transport_cost"
  | "task"
> & {
  actual_quantity: number | string;
  budgeted_total: number | string;
  quantity: number | string;
  unit_rate: number | string;
  estimated_transport_cost: number | string;
  supplier: Relation<OpsBoqLineSupplier>;
  task: Relation<OpsBoqLineTask>;
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
    supplier: normalizeRelation(item.supplier),
    task: normalizeRelation(item.task),
    unit_rate: normalizeMoney(item.unit_rate),
    estimated_transport_cost: normalizeMoney(item.estimated_transport_cost),
  };
}

/**
 * Derives this line's effective "needed by" and "trigger a material request
 * by" dates. When the line is linked to a project task, the task's live
 * planned_start_date is authoritative (so a schedule shift is reflected
 * automatically, with zero drift risk); needed_by is then only a display
 * fallback for unlinked lines. lead_time_days_override is the QS's manual
 * lead-time fallback until BOQ lines are coded against stock_items.
 */
export function deriveOpsBoqLineDates(
  item: Pick<OpsBoqLineItem, "needed_by" | "lead_time_days_override" | "task">,
): {
  effectiveNeededBy: string | null;
  triggerBy: string | null;
} {
  const effectiveNeededBy = item.task?.planned_start_date ?? item.needed_by ?? null;
  if (!effectiveNeededBy) {
    return { effectiveNeededBy: null, triggerBy: null };
  }

  const leadDays = item.lead_time_days_override ?? 0;
  const triggerDate = new Date(`${effectiveNeededBy}T00:00:00+02:00`);
  triggerDate.setUTCDate(triggerDate.getUTCDate() - leadDays);

  return {
    effectiveNeededBy,
    triggerBy: triggerDate.toISOString().slice(0, 10),
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
        submitted_at,
        priced_at,
        priced_by,
        issued_at,
        issued_by,
        budget_id,
        created_at,
        updated_at,
        site:sites!boq_documents_site_id_fkey(id, code, name)
      `,
      listState ? { count: "exact" } : undefined,
    )
    .is("deleted_at", null)
    .is("archived_at", null)
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
    transport_total: 0,
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
    .select(
      "id, boq_id, description, unit, quantity, unit_rate, budgeted_total, actual_quantity, supplier_id, supplier_name_freeform, category, needed_by, estimated_transport_cost, lead_time_days_override, project_task_id, updated_at, supplier:suppliers!boq_line_items_supplier_id_fkey(id, supplier_code, legal_name), task:project_tasks!boq_line_items_project_task_id_fkey(id, title, planned_start_date)",
    )
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
    const transportTotal = documentItems.reduce(
      (sum, item) => sum + item.estimated_transport_cost,
      0,
    );

    return {
      ...document,
      actual_total: actualTotal,
      budgeted_total: budgetedTotal,
      transport_total: transportTotal,
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

export type OpsMaterialTriggerAlert = {
  lineItemId: string;
  boqId: string;
  boqTitle: string;
  description: string;
  category: string;
  quantity: number;
  unit: string;
  effectiveNeededBy: string;
  triggerBy: string;
  projectTaskId: string | null;
  projectTaskTitle: string | null;
};

type RawBoqLineForTrigger = {
  id: string;
  boq_id: string;
  description: string;
  unit: string;
  quantity: number | string;
  category: string;
  needed_by: string | null;
  lead_time_days_override: number | null;
  task: Relation<OpsBoqLineTask>;
  boq: Relation<{ title: string }>;
};

/**
 * Lines from issued schedules whose derived trigger-by date has arrived and
 * that no material request has been raised against yet — a proactive
 * "materials due" signal, not a blocking gate. See deriveOpsBoqLineDates for
 * how the trigger date is computed.
 */
export async function fetchOpsMaterialTriggerAlerts(
  siteId: string,
): Promise<OpsMaterialTriggerAlert[]> {
  const supabase = getOpsSupabaseServiceClient();

  const { data: boqRows, error: boqError } = await supabase
    .from("boq_documents")
    .select("id")
    .eq("site_id", siteId)
    .eq("status", "issued")
    .is("deleted_at", null)
    .is("archived_at", null);

  if (boqError) {
    throw boqError;
  }

  const boqIds = (boqRows ?? []).map((row) => (row as { id: string }).id);
  if (boqIds.length === 0) {
    return [];
  }

  const { data: lineRows, error: lineError } = await supabase
    .from("boq_line_items")
    .select(
      "id, boq_id, description, unit, quantity, category, needed_by, lead_time_days_override, task:project_tasks!boq_line_items_project_task_id_fkey(id, title, planned_start_date), boq:boq_documents!boq_line_items_boq_id_fkey(title)",
    )
    .in("boq_id", boqIds);

  if (lineError) {
    throw lineError;
  }

  const lines = (lineRows ?? []) as unknown as RawBoqLineForTrigger[];
  if (lines.length === 0) {
    return [];
  }

  const { data: linkedRows, error: linkedError } = await supabase
    .from("material_request_items")
    .select("boq_line_item_id")
    .in(
      "boq_line_item_id",
      lines.map((line) => line.id),
    );

  if (linkedError) {
    throw linkedError;
  }

  const linkedLineIds = new Set(
    ((linkedRows ?? []) as Array<{ boq_line_item_id: string | null }>)
      .map((row) => row.boq_line_item_id)
      .filter((id): id is string => Boolean(id)),
  );

  const today = new Date().toISOString().slice(0, 10);

  const alerts: OpsMaterialTriggerAlert[] = [];
  for (const line of lines) {
    if (linkedLineIds.has(line.id)) {
      continue;
    }

    const task = normalizeRelation(line.task);
    const boq = normalizeRelation(line.boq);
    const { effectiveNeededBy, triggerBy } = deriveOpsBoqLineDates({
      needed_by: line.needed_by,
      lead_time_days_override: line.lead_time_days_override,
      task,
    });

    if (!effectiveNeededBy || !triggerBy || triggerBy > today) {
      continue;
    }

    alerts.push({
      lineItemId: line.id,
      boqId: line.boq_id,
      boqTitle: boq?.title ?? "",
      description: line.description,
      category: line.category,
      quantity: normalizeMoney(line.quantity),
      unit: line.unit,
      effectiveNeededBy,
      triggerBy,
      projectTaskId: task?.id ?? null,
      projectTaskTitle: task?.title ?? null,
    });
  }

  return alerts.sort((a, b) => a.triggerBy.localeCompare(b.triggerBy));
}
