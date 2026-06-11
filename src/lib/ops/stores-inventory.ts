import { requireOpsUser } from "@/lib/ops/auth";
import {
  opsIlikeOrFilter,
  toOpsPaginatedResult,
  type OpsListState,
  type OpsPaginatedResult,
} from "@/lib/ops/listing";
import { canViewOpsStoresInventory } from "@/lib/ops/stores-inventory-permissions";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type {
  OpsGrnStatus,
  OpsInventoryLocationType,
  OpsPurchaseOrderStatus,
  OpsStockMovementType,
} from "@/lib/ops/types";

export type OpsStoresSiteSummary = {
  code: string;
  id: string;
  name: string;
};

export type OpsStoresSupplierSummary = {
  id: string;
  legal_name: string;
  supplier_code: string;
};

export type OpsInventoryLocationSummary = {
  description: string;
  id: string;
  is_active: boolean;
  location_code: string;
  location_type: OpsInventoryLocationType;
  name: string;
  site: OpsStoresSiteSummary | null;
  site_id: string | null;
};

export type OpsStockItemSummary = {
  category: string;
  id: string;
  is_active: boolean;
  item_code: string;
  item_name: string;
  specification: string;
  unit: string;
  minimum_quantity: number;
  target_quantity: number;
  lead_time_days: number;
  last_unit_cost: number;
};

export type OpsReceivablePurchaseOrderItemOption = {
  id: string;
  item_name: string;
  po_number: string;
  purchase_order_id: string;
  quantity: number;
  remaining_quantity: number;
  site: OpsStoresSiteSummary | null;
  specification: string;
  status: OpsPurchaseOrderStatus;
  supplier: OpsStoresSupplierSummary | null;
  unit: string;
  unit_cost: number;
};

export type OpsGoodsReceivedItemSummary = {
  id: string;
  item_name: string;
  line_number: number;
  quantity_ordered: number;
  quantity_received: number;
  quantity_rejected: number;
  stock_item: OpsStockItemSummary | null;
  stock_item_id: string;
  unit: string;
  unit_cost: number;
};

export type OpsGoodsReceivedNoteSummary = {
  created_at: string;
  delivery_reference: string;
  grn_number: string;
  id: string;
  items: OpsGoodsReceivedItemSummary[];
  location: Pick<OpsInventoryLocationSummary, "id" | "location_code" | "name"> | null;
  location_id: string;
  notes: string;
  purchase_order: {
    id: string;
    po_number: string;
    status: OpsPurchaseOrderStatus;
  } | null;
  purchase_order_id: string;
  received_at: string;
  site: OpsStoresSiteSummary | null;
  site_id: string;
  status: OpsGrnStatus;
  supplier: OpsStoresSupplierSummary | null;
  supplier_id: string;
  total_received_amount: number;
};

export type OpsStockLevelSummary = {
  id: string;
  last_movement_at: string | null;
  location: Pick<OpsInventoryLocationSummary, "id" | "location_code" | "name"> | null;
  location_id: string;
  quantity_on_hand: number;
  stock_item: OpsStockItemSummary | null;
  stock_item_id: string;
};

export type OpsStockMovementSummary = {
  created_at: string;
  id: string;
  location: Pick<OpsInventoryLocationSummary, "id" | "location_code" | "name"> | null;
  location_id: string;
  movement_at: string;
  movement_type: OpsStockMovementType;
  notes: string;
  quantity: number;
  source_id: string;
  source_table: string;
  stock_item: OpsStockItemSummary | null;
  stock_item_id: string;
  total_amount: number;
  unit_cost: number;
};

export type OpsStoresInventoryStats = {
  activeLocations: number;
  activeStockItems: number;
  postedGrns: number;
  receivablePurchaseOrders: number;
};

type RawRelation<T> = T | T[] | null;

type RawInventoryLocation = Omit<OpsInventoryLocationSummary, "site"> & {
  site: RawRelation<OpsStoresSiteSummary>;
};

type RawReceivablePurchaseOrder = {
  id: string;
  po_number: string;
  status: OpsPurchaseOrderStatus;
  site: RawRelation<OpsStoresSiteSummary>;
  supplier: RawRelation<OpsStoresSupplierSummary>;
};

type RawPurchaseOrderItem = Omit<
  OpsReceivablePurchaseOrderItemOption,
  "po_number" | "remaining_quantity" | "site" | "status" | "supplier" | "unit_cost"
> & {
  line_total: number | string;
  quantity: number | string;
  unit_cost: number | string;
};

type RawGoodsReceivedItem = Omit<
  OpsGoodsReceivedItemSummary,
  "quantity_ordered" | "quantity_received" | "quantity_rejected" | "stock_item" | "unit_cost"
> & {
  grn_id: string;
  quantity_ordered: number | string;
  quantity_received: number | string;
  quantity_rejected: number | string;
  stock_item: RawRelation<OpsStockItemSummary>;
  unit_cost: number | string;
};

type RawGoodsReceivedNote = Omit<
  OpsGoodsReceivedNoteSummary,
  "items" | "location" | "purchase_order" | "site" | "supplier" | "total_received_amount"
> & {
  location: RawRelation<Pick<OpsInventoryLocationSummary, "id" | "location_code" | "name">>;
  purchase_order: RawRelation<{
    id: string;
    po_number: string;
    status: OpsPurchaseOrderStatus;
  }>;
  site: RawRelation<OpsStoresSiteSummary>;
  supplier: RawRelation<OpsStoresSupplierSummary>;
};

type RawStockLevel = Omit<
  OpsStockLevelSummary,
  "location" | "quantity_on_hand" | "stock_item"
> & {
  location: RawRelation<Pick<OpsInventoryLocationSummary, "id" | "location_code" | "name">>;
  quantity_on_hand: number | string;
  stock_item: RawRelation<OpsStockItemSummary>;
};

type RawStockMovement = Omit<
  OpsStockMovementSummary,
  "location" | "quantity" | "stock_item" | "total_amount" | "unit_cost"
> & {
  location: RawRelation<Pick<OpsInventoryLocationSummary, "id" | "location_code" | "name">>;
  quantity: number | string;
  stock_item: RawRelation<OpsStockItemSummary>;
  total_amount: number | string;
  unit_cost: number | string;
};

export type FetchPaginatedGoodsReceivedNotesOptions = {
  listState: OpsListState;
  query?: string;
  status?: OpsGrnStatus;
};

function normalizeNumber(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

function normalizeRelation<T>(value: RawRelation<T>) {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function normalizeLimit(limit: number | undefined, max = 150) {
  return Math.min(Math.max(limit ?? 50, 1), max);
}

function groupGoodsReceivedItems(items: RawGoodsReceivedItem[]) {
  const grouped = new Map<string, OpsGoodsReceivedItemSummary[]>();

  items.forEach((item) => {
    const normalized: OpsGoodsReceivedItemSummary = {
      ...item,
      quantity_ordered: normalizeNumber(item.quantity_ordered),
      quantity_received: normalizeNumber(item.quantity_received),
      quantity_rejected: normalizeNumber(item.quantity_rejected),
      stock_item: normalizeRelation(item.stock_item),
      unit_cost: normalizeNumber(item.unit_cost),
    };
    grouped.set(item.grn_id, [...(grouped.get(item.grn_id) ?? []), normalized]);
  });

  return grouped;
}

export async function fetchActiveInventoryLocationOptions(limit = 100) {
  const { profile } = await requireOpsUser();

  if (!canViewOpsStoresInventory(profile.role)) {
    return [];
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("inventory_locations")
    .select("id, location_code, name, location_type, site_id, description, is_active, site:sites(id, code, name)")
    .eq("is_active", true)
    .order("name", { ascending: true })
    .limit(normalizeLimit(limit));

  if (error) {
    throw error;
  }

  return ((data ?? []) as unknown as RawInventoryLocation[]).map((location) => ({
    ...location,
    site: normalizeRelation(location.site),
  }));
}

export async function fetchActiveStockItemOptions(limit = 150) {
  const { profile } = await requireOpsUser();

  if (!canViewOpsStoresInventory(profile.role)) {
    return [];
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("stock_items")
    .select(
      "id, item_code, item_name, category, specification, unit, is_active, minimum_quantity, target_quantity, lead_time_days, last_unit_cost",
    )
    .eq("is_active", true)
    .order("item_name", { ascending: true })
    .limit(normalizeLimit(limit, 250));

  if (error) {
    throw error;
  }

  type RawStockItem = Omit<
    OpsStockItemSummary,
    "minimum_quantity" | "target_quantity" | "lead_time_days" | "last_unit_cost"
  > & {
    minimum_quantity: number | string;
    target_quantity: number | string;
    lead_time_days: number | string;
    last_unit_cost: number | string;
  };

  return ((data ?? []) as unknown as RawStockItem[]).map((row) => ({
    ...row,
    minimum_quantity: Number(row.minimum_quantity ?? 0),
    target_quantity: Number(row.target_quantity ?? 0),
    lead_time_days: Number(row.lead_time_days ?? 0),
    last_unit_cost: Number(row.last_unit_cost ?? 0),
  }));
}

export async function fetchReceivablePurchaseOrderItemOptions(limit = 150) {
  const { profile } = await requireOpsUser();

  if (!canViewOpsStoresInventory(profile.role)) {
    return [];
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data: purchaseOrders, error: purchaseOrderError } = await supabase
    .from("purchase_orders")
    .select(
      "id, po_number, status, supplier:suppliers!purchase_orders_supplier_id_fkey(id, supplier_code, legal_name), site:sites!purchase_orders_site_id_fkey(id, code, name)",
    )
    .in("status", ["issued", "partially_received"])
    .order("issued_at", { ascending: false })
    .limit(normalizeLimit(limit, 250));

  if (purchaseOrderError) {
    throw purchaseOrderError;
  }

  const rawPurchaseOrders = (purchaseOrders ?? []) as unknown as RawReceivablePurchaseOrder[];
  const purchaseOrderIds = rawPurchaseOrders.map((purchaseOrder) => purchaseOrder.id);

  if (purchaseOrderIds.length === 0) {
    return [];
  }

  const { data: items, error: itemError } = await supabase
    .from("purchase_order_items")
    .select(
      "id, purchase_order_id, item_name, specification, unit, quantity, unit_cost, line_total",
    )
    .in("purchase_order_id", purchaseOrderIds)
    .order("line_number", { ascending: true });

  if (itemError) {
    throw itemError;
  }

  const itemIds = ((items ?? []) as unknown as RawPurchaseOrderItem[]).map((item) => item.id);
  const receivedByItem = new Map<string, number>();

  if (itemIds.length > 0) {
    const { data: receivedItems, error: receivedError } = await supabase
      .from("goods_received_items")
      .select("purchase_order_item_id, quantity_received")
      .in("purchase_order_item_id", itemIds);

    if (receivedError) {
      throw receivedError;
    }

    (receivedItems ?? []).forEach((item) => {
      const itemId = item.purchase_order_item_id as string | null;

      if (!itemId) {
        return;
      }

      receivedByItem.set(
        itemId,
        (receivedByItem.get(itemId) ?? 0) + normalizeNumber(item.quantity_received as number | string),
      );
    });
  }

  const purchaseOrderById = new Map(
    rawPurchaseOrders.map((purchaseOrder) => [purchaseOrder.id, purchaseOrder]),
  );

  return ((items ?? []) as unknown as RawPurchaseOrderItem[])
    .map((item) => {
      const purchaseOrder = purchaseOrderById.get(item.purchase_order_id);
      const quantity = normalizeNumber(item.quantity);
      const received = receivedByItem.get(item.id) ?? 0;

      return {
        ...item,
        po_number: purchaseOrder?.po_number ?? "PO unavailable",
        quantity,
        remaining_quantity: Math.max(quantity - received, 0),
        site: normalizeRelation(purchaseOrder?.site ?? null),
        status: purchaseOrder?.status ?? "issued",
        supplier: normalizeRelation(purchaseOrder?.supplier ?? null),
        unit_cost: normalizeNumber(item.unit_cost),
      } satisfies OpsReceivablePurchaseOrderItemOption;
    })
    .filter((item) => item.remaining_quantity > 0);
}

async function fetchGoodsReceivedItems(grnIds: string[]) {
  if (grnIds.length === 0) {
    return new Map<string, OpsGoodsReceivedItemSummary[]>();
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("goods_received_items")
    .select(
      "id, grn_id, stock_item_id, line_number, item_name, unit, quantity_ordered, quantity_received, quantity_rejected, unit_cost, notes, stock_item:stock_items!goods_received_items_stock_item_id_fkey(id, item_code, item_name, category, specification, unit, is_active)",
    )
    .in("grn_id", grnIds)
    .order("line_number", { ascending: true });

  if (error) {
    throw error;
  }

  return groupGoodsReceivedItems((data ?? []) as unknown as RawGoodsReceivedItem[]);
}

export async function fetchPaginatedGoodsReceivedNotes(
  options: FetchPaginatedGoodsReceivedNotesOptions,
): Promise<OpsPaginatedResult<OpsGoodsReceivedNoteSummary>> {
  const { profile } = await requireOpsUser();

  if (!canViewOpsStoresInventory(profile.role)) {
    return toOpsPaginatedResult([], 0, options.listState);
  }

  const supabase = getOpsSupabaseServiceClient();
  let query = supabase
    .from("goods_received_notes")
    .select(
      [
        "id",
        "grn_number",
        "purchase_order_id",
        "supplier_id",
        "site_id",
        "location_id",
        "delivery_reference",
        "received_at",
        "status",
        "notes",
        "created_at",
        "purchase_order:purchase_orders!goods_received_notes_purchase_order_id_fkey(id, po_number, status)",
        "supplier:suppliers!goods_received_notes_supplier_id_fkey(id, supplier_code, legal_name)",
        "site:sites!goods_received_notes_site_id_fkey(id, code, name)",
        "location:inventory_locations!goods_received_notes_location_id_fkey(id, location_code, name)",
      ].join(", "),
      { count: "exact" },
    )
    .order("received_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (options.status) {
    query = query.eq("status", options.status);
  }

  const searchFilter = opsIlikeOrFilter(["grn_number", "delivery_reference", "notes"], options.query ?? "");

  if (searchFilter) {
    query = query.or(searchFilter);
  }

  const { data, error, count } = await query.range(options.listState.from, options.listState.to);

  if (error) {
    throw error;
  }

  const grns = (data ?? []) as unknown as RawGoodsReceivedNote[];
  const itemsByGrnId = await fetchGoodsReceivedItems(grns.map((grn) => grn.id));

  return toOpsPaginatedResult(
    grns.map((grn) => {
      const items = itemsByGrnId.get(grn.id) ?? [];

      return {
        ...grn,
        items,
        location: normalizeRelation(grn.location),
        purchase_order: normalizeRelation(grn.purchase_order),
        site: normalizeRelation(grn.site),
        supplier: normalizeRelation(grn.supplier),
        total_received_amount: items.reduce(
          (sum, item) => sum + item.quantity_received * item.unit_cost,
          0,
        ),
      } satisfies OpsGoodsReceivedNoteSummary;
    }),
    count,
    options.listState,
  );
}

export async function fetchStockLevels(limit = 60) {
  const { profile } = await requireOpsUser();

  if (!canViewOpsStoresInventory(profile.role)) {
    return [];
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("stock_levels")
    .select(
      "id, stock_item_id, location_id, quantity_on_hand, last_movement_at, stock_item:stock_items!stock_levels_stock_item_id_fkey(id, item_code, item_name, category, specification, unit, is_active), location:inventory_locations!stock_levels_location_id_fkey(id, location_code, name)",
    )
    .gt("quantity_on_hand", 0)
    .order("quantity_on_hand", { ascending: false })
    .limit(normalizeLimit(limit, 120));

  if (error) {
    throw error;
  }

  return ((data ?? []) as unknown as RawStockLevel[]).map((level) => ({
    ...level,
    location: normalizeRelation(level.location),
    quantity_on_hand: normalizeNumber(level.quantity_on_hand),
    stock_item: normalizeRelation(level.stock_item),
  }));
}

export async function fetchRecentStockMovements(limit = 30) {
  const { profile } = await requireOpsUser();

  if (!canViewOpsStoresInventory(profile.role)) {
    return [];
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("stock_movements")
    .select(
      "id, stock_item_id, location_id, movement_type, quantity, unit_cost, total_amount, source_table, source_id, movement_at, notes, created_at, stock_item:stock_items!stock_movements_stock_item_id_fkey(id, item_code, item_name, category, specification, unit, is_active), location:inventory_locations!stock_movements_location_id_fkey(id, location_code, name)",
    )
    .order("movement_at", { ascending: false })
    .limit(normalizeLimit(limit, 80));

  if (error) {
    throw error;
  }

  return ((data ?? []) as unknown as RawStockMovement[]).map((movement) => ({
    ...movement,
    location: normalizeRelation(movement.location),
    quantity: normalizeNumber(movement.quantity),
    stock_item: normalizeRelation(movement.stock_item),
    total_amount: normalizeNumber(movement.total_amount),
    unit_cost: normalizeNumber(movement.unit_cost),
  }));
}

async function countTable(table: string, filter?: { column: string; value: string | boolean }) {
  const supabase = getOpsSupabaseServiceClient();
  let query = supabase.from(table).select("id", { count: "exact", head: true });

  if (filter) {
    query = query.eq(filter.column, filter.value);
  }

  const { count, error } = await query;

  if (error) {
    throw error;
  }

  return count ?? 0;
}

export async function fetchStoresInventoryStats(): Promise<OpsStoresInventoryStats> {
  const { profile } = await requireOpsUser();

  if (!canViewOpsStoresInventory(profile.role)) {
    return {
      activeLocations: 0,
      activeStockItems: 0,
      postedGrns: 0,
      receivablePurchaseOrders: 0,
    };
  }

  const supabase = getOpsSupabaseServiceClient();
  const [
    activeLocations,
    activeStockItems,
    postedGrns,
    { count: receivablePurchaseOrders, error: purchaseOrderError },
  ] = await Promise.all([
    countTable("inventory_locations", { column: "is_active", value: true }),
    countTable("stock_items", { column: "is_active", value: true }),
    countTable("goods_received_notes", { column: "status", value: "posted" }),
    supabase
      .from("purchase_orders")
      .select("id", { count: "exact", head: true })
      .in("status", ["issued", "partially_received"]),
  ]);

  if (purchaseOrderError) {
    throw purchaseOrderError;
  }

  return {
    activeLocations,
    activeStockItems,
    postedGrns,
    receivablePurchaseOrders: receivablePurchaseOrders ?? 0,
  };
}
