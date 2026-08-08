import {
  EMPTY_BOQ_LINE_ACTUALS,
  fetchOpsBoqLineActuals,
  type BoqLineActuals,
} from "@/lib/ops/boq-actuals";
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

export type OpsBoqLineStockItem = {
  id: string;
  item_code: string;
  item_name: string;
  unit: string;
  /** Typical supplier lead time, used when the line has no manual override. */
  lead_time_days: number;
  /** Most recent unit cost seen on a GRN — the price-benchmark reference. */
  last_unit_cost: number;
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
  /** The WBS leaf this planned line charges; inherited by every call-off. */
  cost_code_id: string | null;
  stock_item_id: string | null;
  stock_item: OpsBoqLineStockItem | null;
  updated_at: string;
  /** Derived consumption from linked material requests (audit A2). */
  actuals: BoqLineActuals;
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
  /** The schedule this one revises, if any (audit B1). */
  supersedes_id: string | null;
  superseded_at: string | null;
  created_at: string;
  updated_at: string;
  site: OpsBoqSite | null;
  items: OpsBoqLineItem[];
  budgeted_total: number;
  /** Legacy: derived from the manually keyed actual_quantity (audit A1). */
  actual_total: number;
  /** Value actually requested against this schedule's lines (audit A2). */
  requested_total: number;
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
  | "stock_item"
> & {
  actual_quantity: number | string;
  budgeted_total: number | string;
  quantity: number | string;
  unit_rate: number | string;
  estimated_transport_cost: number | string;
  supplier: Relation<OpsBoqLineSupplier>;
  task: Relation<OpsBoqLineTask>;
  stock_item: Relation<RawBoqLineStockItem>;
};

type RawBoqLineStockItem = Omit<OpsBoqLineStockItem, "lead_time_days" | "last_unit_cost"> & {
  lead_time_days: number | string;
  last_unit_cost: number | string;
};

function normalizeMoney(value: number | string | null) {
  return Number(value ?? 0);
}

function normalizeRelation<T>(value: Relation<T>) {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function normalizeStockItem(item: RawBoqLineStockItem | null): OpsBoqLineStockItem | null {
  return item
    ? {
        ...item,
        lead_time_days: normalizeMoney(item.lead_time_days),
        last_unit_cost: normalizeMoney(item.last_unit_cost),
      }
    : null;
}

function normalizeLineItem(item: RawBoqLineItem): Omit<OpsBoqLineItem, "actuals"> {
  return {
    ...item,
    actual_quantity: normalizeMoney(item.actual_quantity),
    budgeted_total: normalizeMoney(item.budgeted_total),
    quantity: normalizeMoney(item.quantity),
    supplier: normalizeRelation(item.supplier),
    task: normalizeRelation(item.task),
    stock_item: normalizeStockItem(normalizeRelation(item.stock_item)),
    unit_rate: normalizeMoney(item.unit_rate),
    estimated_transport_cost: normalizeMoney(item.estimated_transport_cost),
  };
}

/**
 * Derives this line's effective "needed by" and "trigger a material request
 * by" dates. When the line is linked to a project task, the task's live
 * planned_start_date is authoritative (so a schedule shift is reflected
 * automatically, with zero drift risk); needed_by is then only a display
 * fallback for unlinked lines.
 *
 * Lead time resolves in order: the QS's manual override, then the linked
 * dictionary item's typical lead time, then zero. Before the dictionary link
 * (audit A4) an unoverridden line fell straight to zero, meaning it only
 * triggered on the day the material was already needed.
 */
export function deriveOpsBoqLineDates(
  item: Pick<OpsBoqLineItem, "needed_by" | "lead_time_days_override" | "task"> & {
    stock_item?: Pick<OpsBoqLineStockItem, "lead_time_days"> | null;
  },
): {
  effectiveNeededBy: string | null;
  triggerBy: string | null;
  leadTimeDays: number;
  leadTimeSource: "override" | "dictionary" | "none";
} {
  const overrideDays = item.lead_time_days_override;
  const dictionaryDays = item.stock_item?.lead_time_days ?? 0;
  const leadDays = overrideDays ?? (dictionaryDays > 0 ? dictionaryDays : 0);
  const leadTimeSource: "override" | "dictionary" | "none" =
    overrideDays !== null && overrideDays !== undefined
      ? "override"
      : dictionaryDays > 0
        ? "dictionary"
        : "none";

  const effectiveNeededBy = item.task?.planned_start_date ?? item.needed_by ?? null;
  if (!effectiveNeededBy) {
    return { effectiveNeededBy: null, triggerBy: null, leadTimeDays: leadDays, leadTimeSource };
  }

  // Calendar arithmetic, anchored at UTC midnight. Anchoring at +02:00 (as this
  // did) puts the instant on the *previous* UTC day, so slicing the ISO date
  // back out returned a trigger date one day early — even with a zero lead
  // time. Both dates here are plain calendar dates, so no zone belongs in the
  // subtraction at all.
  const triggerDate = new Date(`${effectiveNeededBy}T00:00:00Z`);
  triggerDate.setUTCDate(triggerDate.getUTCDate() - leadDays);

  return {
    effectiveNeededBy,
    triggerBy: triggerDate.toISOString().slice(0, 10),
    leadTimeDays: leadDays,
    leadTimeSource,
  };
}

/**
 * Benchmark a priced line against the last price actually paid for the same
 * dictionary item (audit A5). Returns null when there is nothing to compare —
 * no dictionary link, no price history, or the line is not priced yet — so
 * callers can simply not render a badge.
 */
export function boqLinePriceBenchmark(
  item: Pick<OpsBoqLineItem, "unit_rate"> & {
    stock_item?: Pick<OpsBoqLineStockItem, "last_unit_cost"> | null;
  },
): { lastUnitCost: number; delta: number; percent: number; isAbove: boolean } | null {
  const lastUnitCost = item.stock_item?.last_unit_cost ?? 0;
  if (lastUnitCost <= 0 || item.unit_rate <= 0) {
    return null;
  }

  const delta = Math.round((item.unit_rate - lastUnitCost + Number.EPSILON) * 100) / 100;
  return {
    lastUnitCost,
    delta,
    percent: Math.round((delta / lastUnitCost) * 100),
    isAbove: delta > 0,
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
        supersedes_id,
        superseded_at,
        created_at,
        updated_at,
        site:sites!boq_documents_site_id_fkey(id, code, name)
      `,
      listState ? { count: "exact" } : undefined,
    )
    .is("deleted_at", null)
    .is("archived_at", null)
    // Superseded versions stay readable by id but leave the working list —
    // the live revision replaces them (audit B1).
    .is("superseded_at", null)
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
    requested_total: 0,
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
      "id, boq_id, description, unit, quantity, unit_rate, budgeted_total, actual_quantity, supplier_id, supplier_name_freeform, category, needed_by, estimated_transport_cost, lead_time_days_override, project_task_id, cost_code_id, stock_item_id, updated_at, supplier:suppliers!boq_line_items_supplier_id_fkey(id, supplier_code, legal_name), task:project_tasks!boq_line_items_project_task_id_fkey(id, title, planned_start_date), stock_item:stock_items!boq_line_items_stock_item_id_fkey(id, item_code, item_name, unit, lead_time_days, last_unit_cost)",
    )
    .in(
      "boq_id",
      documents.map((document) => document.id),
    )
    .order("created_at", { ascending: true });

  if (itemError) {
    throw itemError;
  }

  const baseItems = ((itemData ?? []) as unknown as RawBoqLineItem[]).map(normalizeLineItem);

  // Real consumption per line, from the material requests raised against it
  // (audit A2). Attached here so every consumer of a schedule sees the same
  // planned-vs-requested picture.
  const actualsByLine = await fetchOpsBoqLineActuals(baseItems.map((item) => item.id));
  const items = baseItems.map((item) => ({
    ...item,
    actuals: actualsByLine.get(item.id) ?? EMPTY_BOQ_LINE_ACTUALS,
  }));

  const itemsWithTotals = documents.map((document) => {
    const documentItems = items.filter((item) => item.boq_id === document.id);
    const budgetedTotal = documentItems.reduce((sum, item) => sum + item.budgeted_total, 0);
    // Legacy manual figure — kept so the existing "Actual" column kept its
    // meaning; `requested_total` below is the derived one worth trusting.
    const actualTotal = documentItems.reduce(
      (sum, item) => sum + item.actual_quantity * item.unit_rate,
      0,
    );
    const requestedTotal = documentItems.reduce(
      (sum, item) => sum + item.actuals.requestedValue,
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
      requested_total: requestedTotal,
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

export type OpsBoqStockItemOption = {
  id: string;
  item_code: string;
  item_name: string;
  unit: string;
  lead_time_days: number;
  last_unit_cost: number;
};

/**
 * Materials dictionary options for the schedule line forms (audit A3).
 *
 * Deliberately not `fetchActiveStockItemOptions` from stores-inventory: that
 * one gates on `canViewOpsStoresInventory`, which a Quantity Surveyor need not
 * have. Authoring a schedule requires reading the dictionary, not the stores.
 */
export async function fetchOpsBoqStockItemOptions(
  limit = 250,
): Promise<OpsBoqStockItemOption[]> {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("stock_items")
    .select("id, item_code, item_name, unit, lead_time_days, last_unit_cost")
    .eq("is_active", true)
    .order("item_name", { ascending: true })
    .limit(limit);

  if (error) {
    throw error;
  }

  return (
    (data ?? []) as Array<
      Omit<OpsBoqStockItemOption, "lead_time_days" | "last_unit_cost"> & {
        lead_time_days: number | string;
        last_unit_cost: number | string;
      }
    >
  ).map((item) => ({
    ...item,
    lead_time_days: normalizeMoney(item.lead_time_days),
    last_unit_cost: normalizeMoney(item.last_unit_cost),
  }));
}

export type OpsScheduleCompositionLine = {
  id: string;
  boqId: string;
  boqTitle: string;
  description: string;
  unit: string;
  quantity: number;
  unitRate: number;
  plannedTotal: number;
  requestedQuantity: number;
  requestedValue: number;
};

/** Key for the composition map: one site's lines within one category. */
export function scheduleCompositionKey(siteId: string, category: string) {
  return `${siteId}::${category || "general"}`;
}

/**
 * Which material schedule lines make up each generated budget line (audit B2).
 *
 * The budget deliberately stays category-level — Finance wants a handful of
 * lines, not two hundred — so line-level traceability is provided by looking
 * through from the budget line to the schedule lines that produced it, rather
 * than by exploding the budget itself.
 *
 * Only live (issued, non-superseded) schedules count, matching what the budget
 * was generated from.
 */
export async function fetchOpsScheduleComposition(
  siteIds: string[],
): Promise<Map<string, OpsScheduleCompositionLine[]>> {
  const composition = new Map<string, OpsScheduleCompositionLine[]>();
  if (siteIds.length === 0) {
    return composition;
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data: boqRows, error: boqError } = await supabase
    .from("boq_documents")
    .select("id, site_id, title")
    .in("site_id", siteIds)
    .eq("status", "issued")
    .is("deleted_at", null)
    .is("archived_at", null)
    .is("superseded_at", null);

  if (boqError) {
    throw boqError;
  }

  const documents = (boqRows ?? []) as Array<{ id: string; site_id: string; title: string }>;
  if (documents.length === 0) {
    return composition;
  }

  const siteByBoq = new Map(documents.map((document) => [document.id, document.site_id]));
  const titleByBoq = new Map(documents.map((document) => [document.id, document.title]));

  const { data: lineRows, error: lineError } = await supabase
    .from("boq_line_items")
    .select("id, boq_id, description, unit, quantity, unit_rate, budgeted_total, category")
    .in(
      "boq_id",
      documents.map((document) => document.id),
    )
    .order("created_at", { ascending: true });

  if (lineError) {
    throw lineError;
  }

  const lines = (lineRows ?? []) as Array<{
    id: string;
    boq_id: string;
    description: string;
    unit: string;
    quantity: number | string;
    unit_rate: number | string;
    budgeted_total: number | string;
    category: string;
  }>;

  const actualsByLine = await fetchOpsBoqLineActuals(lines.map((line) => line.id));

  for (const line of lines) {
    const siteId = siteByBoq.get(line.boq_id);
    if (!siteId) continue;

    const actuals = actualsByLine.get(line.id) ?? EMPTY_BOQ_LINE_ACTUALS;
    const key = scheduleCompositionKey(siteId, line.category);
    const bucket = composition.get(key) ?? [];
    bucket.push({
      id: line.id,
      boqId: line.boq_id,
      boqTitle: titleByBoq.get(line.boq_id) ?? "",
      description: line.description,
      unit: line.unit,
      quantity: normalizeMoney(line.quantity),
      unitRate: normalizeMoney(line.unit_rate),
      plannedTotal: normalizeMoney(line.budgeted_total),
      requestedQuantity: actuals.requestedQuantity,
      requestedValue: actuals.requestedValue,
    });
    composition.set(key, bucket);
  }

  return composition;
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
  stock_item: Relation<{ lead_time_days: number | string }>;
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
      "id, boq_id, description, unit, quantity, category, needed_by, lead_time_days_override, task:project_tasks!boq_line_items_project_task_id_fkey(id, title, planned_start_date), stock_item:stock_items!boq_line_items_stock_item_id_fkey(lead_time_days), boq:boq_documents!boq_line_items_boq_id_fkey(title)",
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
    const stockItem = normalizeRelation(line.stock_item);
    const { effectiveNeededBy, triggerBy } = deriveOpsBoqLineDates({
      needed_by: line.needed_by,
      lead_time_days_override: line.lead_time_days_override,
      task,
      stock_item: stockItem
        ? { lead_time_days: normalizeMoney(stockItem.lead_time_days) }
        : null,
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
