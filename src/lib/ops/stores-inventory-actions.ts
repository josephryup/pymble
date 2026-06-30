"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeOpsActionErrorMessage } from "@/lib/ops/action-errors";
import { requireOpsUser } from "@/lib/ops/auth";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import { fanoutToOpsRoles } from "@/lib/ops/notification-fanout";
import { queueOpsNotification } from "@/lib/ops/notifications";
import {
  canAdjustOpsStock,
  canIssueOpsStock,
  canManageOpsInventoryMasterData,
  canRecordOpsGoodsReceived,
  canTransferOpsStock,
} from "@/lib/ops/stores-inventory-permissions";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type {
  OpsInventoryLocationType,
  OpsPurchaseOrderStatus,
  OpsStockMovementType,
} from "@/lib/ops/types";

const STORES_ROUTE = "/ops/stores-inventory";

const optionalCode = z
  .string()
  .trim()
  .max(24, "Code must be 24 characters or fewer.")
  .transform((value) => value.toUpperCase().replace(/\s+/g, "-"))
  .transform((value) => (value.length > 0 ? value : null));

const locationSchema = z.object({
  description: z.string().trim().max(400).default(""),
  location_code: optionalCode,
  location_type: z.enum(["central_store", "site_store", "yard", "vehicle"]),
  name: z.string().trim().min(2, "Location name is required.").max(140),
  site_id: z.string().trim().default(""),
});

const stockItemSchema = z.object({
  category: z
    .string()
    .trim()
    .max(60)
    .default("material")
    .transform((value) => value.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, ""))
    .transform((value) => value || "material"),
  item_code: optionalCode,
  item_name: z.string().trim().min(2, "Item name is required.").max(160),
  specification: z.string().trim().max(500).default(""),
  unit: z.string().trim().min(1, "Unit is required.").max(40),
});

const grnSchema = z.object({
  delivery_reference: z.string().trim().max(120).default(""),
  location_id: z.string().uuid("Select a stock location."),
  notes: z.string().trim().max(800).default(""),
  purchase_order_item_id: z.string().uuid("Select a purchase order line."),
  quantity_received: z.coerce.number().positive("Received quantity must be greater than zero."),
  quantity_rejected: z.coerce.number().min(0, "Rejected quantity cannot be negative."),
  received_at: z.string().trim().default(""),
  stock_item_id: z.string().uuid("Select a stock item."),
});

const stockMovementBaseSchema = z.object({
  movement_at: z.string().trim().default(""),
  notes: z.string().trim().max(800).default(""),
  reference: z.string().trim().max(120).default(""),
  stock_level_id: z.string().uuid("Select a stock balance."),
});

const stockIssueSchema = stockMovementBaseSchema.extend({
  quantity: z.coerce.number().positive("Issue quantity must be greater than zero."),
});

const stockTransferSchema = stockMovementBaseSchema.extend({
  destination_location_id: z.string().uuid("Select a destination location."),
  quantity: z.coerce.number().positive("Transfer quantity must be greater than zero."),
});

const stockAdjustmentSchema = stockMovementBaseSchema.extend({
  counted_quantity: z.coerce.number().min(0, "Counted quantity cannot be negative."),
  reason: z
    .string()
    .trim()
    .max(80)
    .default("stock_count")
    .transform((value) =>
      (value || "stock_count")
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, "_")
        .replace(/^_+|_+$/g, ""),
    )
    .transform((value) => value || "stock_count"),
});

type PurchaseOrderItemForReceipt = {
  id: string;
  item_name: string;
  purchase_order_id: string;
  quantity: number | string;
  specification: string;
  unit: string;
  unit_cost: number | string;
};

type PurchaseOrderForReceipt = {
  id: string;
  material_request_id: string | null;
  po_number: string;
  site_id: string;
  status: OpsPurchaseOrderStatus;
  supplier_id: string;
};

type LocationForReceipt = {
  id: string;
  is_active: boolean;
  location_code: string;
  location_type: OpsInventoryLocationType;
  name: string;
  site_id: string | null;
};

type StockItemForReceipt = {
  id: string;
  is_active: boolean;
  item_code: string;
  item_name: string;
  unit: string;
};

type StockLevelForMutation = {
  id: string;
  location_id: string;
  quantity_on_hand: number | string;
  stock_item_id: string;
};

type StockMovementRpcResult = {
  movement_id: string;
  quantity_on_hand: number | string;
  stock_level_id: string;
};

type StockTransferRpcResult = {
  from_quantity_on_hand: number | string;
  from_stock_level_id: string;
  issue_movement_id: string;
  receipt_movement_id: string;
  to_quantity_on_hand: number | string;
  to_stock_level_id: string;
};

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function storesError(message: string): never {
  redirect(`${STORES_ROUTE}?error=${encodeURIComponent(safeOpsActionErrorMessage(message))}`);
}

function normalizeOptionalUuid(value: string) {
  return value || null;
}

function normalizeNumber(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

function normalizeDateInput(value: string) {
  if (!value) {
    return new Date().toISOString().slice(0, 10);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    storesError("Use a valid received date.");
  }

  return value;
}

function normalizeMovementDateInput(value: string) {
  if (!value) {
    return new Date().toISOString();
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    storesError("Use a valid movement date.");
  }

  return new Date(`${value}T12:00:00+02:00`).toISOString();
}

function stockMovementNotes(input: {
  fallback: string;
  notes: string;
  reference: string;
}) {
  return [input.reference ? `Ref: ${input.reference}` : "", input.notes || input.fallback]
    .filter(Boolean)
    .join(" / ");
}

async function fetchPurchaseOrderItemForReceipt(itemId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("purchase_order_items")
    .select("id, purchase_order_id, item_name, specification, unit, quantity, unit_cost")
    .eq("id", itemId)
    .maybeSingle<PurchaseOrderItemForReceipt>();

  if (error) {
    throw error;
  }

  return data;
}

async function fetchPurchaseOrderForReceipt(purchaseOrderId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("purchase_orders")
    .select("id, po_number, site_id, supplier_id, material_request_id, status")
    .eq("id", purchaseOrderId)
    .maybeSingle<PurchaseOrderForReceipt>();

  if (error) {
    throw error;
  }

  return data;
}

async function fetchLocationForReceipt(locationId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("inventory_locations")
    .select("id, location_code, name, location_type, site_id, is_active")
    .eq("id", locationId)
    .maybeSingle<LocationForReceipt>();

  if (error) {
    throw error;
  }

  return data;
}

async function fetchStockItemForReceipt(stockItemId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("stock_items")
    .select("id, item_code, item_name, unit, is_active")
    .eq("id", stockItemId)
    .maybeSingle<StockItemForReceipt>();

  if (error) {
    throw error;
  }

  return data;
}

async function fetchStockLevelForMutation(stockLevelId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("stock_levels")
    .select("id, stock_item_id, location_id, quantity_on_hand")
    .eq("id", stockLevelId)
    .maybeSingle<StockLevelForMutation>();

  if (error) {
    throw error;
  }

  return data;
}

async function latestUnitCostForStockLevel(stockLevel: StockLevelForMutation) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("stock_movements")
    .select("unit_cost")
    .eq("stock_item_id", stockLevel.stock_item_id)
    .eq("location_id", stockLevel.location_id)
    .gt("unit_cost", 0)
    .order("movement_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ unit_cost: number | string }>();

  if (error) {
    throw error;
  }

  return normalizeNumber(data?.unit_cost);
}

async function postStockMovement(input: {
  createdBy: string;
  locationId: string;
  movementAt: string;
  movementType: OpsStockMovementType;
  notes: string;
  quantity: number;
  sourceId: string;
  sourceTable: string;
  stockItemId: string;
  unitCost: number;
}) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .rpc("ops_post_stock_movement", {
      p_created_by: input.createdBy,
      p_location_id: input.locationId,
      p_movement_at: input.movementAt,
      p_movement_type: input.movementType,
      p_notes: input.notes,
      p_quantity: input.quantity,
      p_source_id: input.sourceId,
      p_source_table: input.sourceTable,
      p_stock_item_id: input.stockItemId,
      p_unit_cost: input.unitCost,
    })
    .single<StockMovementRpcResult>();

  if (error || !data) {
    throw error ?? new Error("Could not post stock movement.");
  }

  return data;
}

async function transferStock(input: {
  createdBy: string;
  fromLocationId: string;
  movementAt: string;
  notes: string;
  quantity: number;
  stockItemId: string;
  toLocationId: string;
  unitCost: number;
}) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .rpc("ops_transfer_stock", {
      p_created_by: input.createdBy,
      p_from_location_id: input.fromLocationId,
      p_movement_at: input.movementAt,
      p_notes: input.notes,
      p_quantity: input.quantity,
      p_stock_item_id: input.stockItemId,
      p_to_location_id: input.toLocationId,
      p_unit_cost: input.unitCost,
    })
    .single<StockTransferRpcResult>();

  if (error || !data) {
    throw error ?? new Error("Could not transfer stock.");
  }

  return data;
}

async function resolveStockLevelContext(stockLevelId: string) {
  const stockLevel = await fetchStockLevelForMutation(stockLevelId);

  if (!stockLevel) {
    storesError("Stock balance was not found.");
  }

  const [stockItem, location] = await Promise.all([
    fetchStockItemForReceipt(stockLevel.stock_item_id),
    fetchLocationForReceipt(stockLevel.location_id),
  ]);

  if (!stockItem || !stockItem.is_active) {
    storesError("The selected stock item is not active.");
  }

  if (!location || !location.is_active) {
    storesError("The selected stock location is not active.");
  }

  return {
    location,
    quantityOnHand: normalizeNumber(stockLevel.quantity_on_hand),
    stockItem,
    stockLevel,
  };
}

async function receivedQuantityForPurchaseOrderItem(itemId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("goods_received_items")
    .select("quantity_received")
    .eq("purchase_order_item_id", itemId);

  if (error) {
    throw error;
  }

  return (data ?? []).reduce(
    (sum, item) => sum + normalizeNumber(item.quantity_received as number | string),
    0,
  );
}

async function nextGrnLineNumber(grnId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("goods_received_items")
    .select("line_number")
    .eq("grn_id", grnId)
    .order("line_number", { ascending: false })
    .limit(1)
    .maybeSingle<{ line_number: number }>();

  if (error) {
    throw error;
  }

  return (data?.line_number ?? 0) + 1;
}

async function applyStockReceipt(input: {
  createdBy: string;
  grnId: string;
  locationId: string;
  notes: string;
  quantity: number;
  stockItemId: string;
  unitCost: number;
}) {
  await postStockMovement({
    createdBy: input.createdBy,
    locationId: input.locationId,
    movementAt: new Date().toISOString(),
    movementType: "receipt",
    notes: input.notes,
    quantity: input.quantity,
    sourceId: input.grnId,
    sourceTable: "goods_received_notes",
    stockItemId: input.stockItemId,
    unitCost: input.unitCost,
  });
}

async function syncPurchaseOrderReceiptStatus(purchaseOrder: PurchaseOrderForReceipt) {
  const supabase = getOpsSupabaseServiceClient();
  const { data: items, error: itemError } = await supabase
    .from("purchase_order_items")
    .select("id, quantity")
    .eq("purchase_order_id", purchaseOrder.id);

  if (itemError) {
    throw itemError;
  }

  const itemIds = (items ?? []).map((item) => item.id as string);
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

  const isClosed = (items ?? []).every(
    (item) => (receivedByItem.get(item.id as string) ?? 0) >= normalizeNumber(item.quantity as number | string),
  );
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("purchase_orders")
    .update({
      closed_at: isClosed ? now : null,
      status: isClosed ? "closed" : "partially_received",
    })
    .eq("id", purchaseOrder.id)
    .in("status", ["issued", "partially_received"]);

  if (error) {
    throw error;
  }

  if (isClosed && purchaseOrder.material_request_id) {
    await (async () => {
      // Stores receipt is the fallback close path (Option A). It closes a request
      // whether or not the requester has confirmed delivery — including one that
      // is resting in `delivered` after a partial confirmation.
      await supabase
        .from("material_requests")
        .update({ status: "closed", closed_at: now })
        .eq("id", purchaseOrder.material_request_id)
        .in("status", ["approved", "ordered", "delivered"]);
    })().catch(() => null);
  }
}

export async function createInventoryLocationAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canManageOpsInventoryMasterData(profile.role)) {
    storesError("Your role cannot create stock locations.");
  }

  const parsed = locationSchema.safeParse({
    description: field(formData, "description"),
    location_code: field(formData, "location_code"),
    location_type: field(formData, "location_type") || "site_store",
    name: field(formData, "name"),
    site_id: field(formData, "site_id"),
  });

  if (!parsed.success) {
    storesError(parsed.error.issues[0]?.message ?? "Check the stock location.");
  }

  const insert: Record<string, unknown> = {
    created_by: profile.id,
    description: parsed.data.description,
    location_type: parsed.data.location_type,
    name: parsed.data.name,
    site_id: normalizeOptionalUuid(parsed.data.site_id),
  };

  if (parsed.data.location_code) {
    insert.location_code = parsed.data.location_code;
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("inventory_locations")
    .insert(insert)
    .select("id, location_code")
    .single<{ id: string; location_code: string }>();

  if (error || !data) {
    storesError(error?.code === "23505" ? "That location code already exists." : error?.message ?? "Could not create stock location.");
  }

  await recordOpsAuditEvent({
    action: "inventory.location_created",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "inventory_location",
    metadata: {
      location_code: data.location_code,
      location_type: parsed.data.location_type,
      site_id: normalizeOptionalUuid(parsed.data.site_id),
    },
    moduleKey: "stores_inventory",
    sourceId: data.id,
    sourceTable: "inventory_locations",
    summary: `Created stock location ${data.location_code}`,
  }).catch(() => null);

  revalidatePath(STORES_ROUTE);
  redirect(`${STORES_ROUTE}?created=location`);
}

export async function createStockItemAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canManageOpsInventoryMasterData(profile.role)) {
    storesError("Your role cannot create stock items.");
  }

  const parsed = stockItemSchema.safeParse({
    category: field(formData, "category") || "material",
    item_code: field(formData, "item_code"),
    item_name: field(formData, "item_name"),
    specification: field(formData, "specification"),
    unit: field(formData, "unit") || "each",
  });

  if (!parsed.success) {
    storesError(parsed.error.issues[0]?.message ?? "Check the stock item.");
  }

  const insert: Record<string, unknown> = {
    category: parsed.data.category,
    created_by: profile.id,
    item_name: parsed.data.item_name,
    specification: parsed.data.specification,
    unit: parsed.data.unit,
  };

  if (parsed.data.item_code) {
    insert.item_code = parsed.data.item_code;
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("stock_items")
    .insert(insert)
    .select("id, item_code")
    .single<{ id: string; item_code: string }>();

  if (error || !data) {
    storesError(error?.code === "23505" ? "That stock item code already exists." : error?.message ?? "Could not create stock item.");
  }

  await recordOpsAuditEvent({
    action: "inventory.stock_item_created",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "stock_item",
    metadata: {
      category: parsed.data.category,
      item_code: data.item_code,
      unit: parsed.data.unit,
    },
    moduleKey: "stores_inventory",
    sourceId: data.id,
    sourceTable: "stock_items",
    summary: `Created stock item ${data.item_code}`,
  }).catch(() => null);

  revalidatePath(STORES_ROUTE);
  redirect(`${STORES_ROUTE}?created=stock_item`);
}

export async function issueStockAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canIssueOpsStock(profile.role)) {
    storesError("Your role cannot issue stock.");
  }

  const parsed = stockIssueSchema.safeParse({
    movement_at: field(formData, "movement_at"),
    notes: field(formData, "notes"),
    quantity: field(formData, "quantity"),
    reference: field(formData, "reference"),
    stock_level_id: field(formData, "stock_level_id"),
  });

  if (!parsed.success) {
    storesError(parsed.error.issues[0]?.message ?? "Check the stock issue.");
  }

  const { location, quantityOnHand, stockItem, stockLevel } =
    await resolveStockLevelContext(parsed.data.stock_level_id);

  if (parsed.data.quantity > quantityOnHand) {
    storesError("Issue quantity cannot exceed available stock.");
  }

  const unitCost = await latestUnitCostForStockLevel(stockLevel);
  const movementAt = normalizeMovementDateInput(parsed.data.movement_at);
  const notes = stockMovementNotes({
    fallback: `Issue from ${location.location_code}`,
    notes: parsed.data.notes,
    reference: parsed.data.reference,
  });

  let movement: StockMovementRpcResult;

  try {
    movement = await postStockMovement({
      createdBy: profile.id,
      locationId: location.id,
      movementAt,
      movementType: "issue",
      notes,
      quantity: parsed.data.quantity * -1,
      sourceId: stockLevel.id,
      sourceTable: "stock_levels",
      stockItemId: stockItem.id,
      unitCost,
    });
  } catch (error) {
    storesError(error instanceof Error ? error.message : "Could not issue stock.");
  }

  await recordOpsAuditEvent({
    action: "stock.issue_posted",
    actorUserId: profile.id,
    entityId: movement.movement_id,
    entityType: "stock_movement",
    metadata: {
      location_id: location.id,
      movement_at: movementAt,
      quantity: parsed.data.quantity,
      quantity_on_hand: normalizeNumber(movement.quantity_on_hand),
      stock_item_id: stockItem.id,
    },
    moduleKey: "stores_inventory",
    sourceId: stockLevel.id,
    sourceTable: "stock_levels",
    summary: `Issued ${parsed.data.quantity} ${stockItem.unit} of ${stockItem.item_code}`,
  }).catch(() => null);

  revalidatePath(STORES_ROUTE);
  redirect(`${STORES_ROUTE}?updated=stock_issue`);
}

export async function transferStockAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canTransferOpsStock(profile.role)) {
    storesError("Your role cannot transfer stock.");
  }

  const parsed = stockTransferSchema.safeParse({
    destination_location_id: field(formData, "destination_location_id"),
    movement_at: field(formData, "movement_at"),
    notes: field(formData, "notes"),
    quantity: field(formData, "quantity"),
    reference: field(formData, "reference"),
    stock_level_id: field(formData, "stock_level_id"),
  });

  if (!parsed.success) {
    storesError(parsed.error.issues[0]?.message ?? "Check the stock transfer.");
  }

  const { location, quantityOnHand, stockItem, stockLevel } =
    await resolveStockLevelContext(parsed.data.stock_level_id);
  const destination = await fetchLocationForReceipt(parsed.data.destination_location_id);

  if (!destination || !destination.is_active) {
    storesError("Select an active destination location.");
  }

  if (destination.id === location.id) {
    storesError("Transfer destination must be different from the source location.");
  }

  if (parsed.data.quantity > quantityOnHand) {
    storesError("Transfer quantity cannot exceed available stock.");
  }

  const unitCost = await latestUnitCostForStockLevel(stockLevel);
  const movementAt = normalizeMovementDateInput(parsed.data.movement_at);
  const notes = stockMovementNotes({
    fallback: `Transfer from ${location.location_code} to ${destination.location_code}`,
    notes: parsed.data.notes,
    reference: parsed.data.reference,
  });

  let transferResult: StockTransferRpcResult;

  try {
    transferResult = await transferStock({
      createdBy: profile.id,
      fromLocationId: location.id,
      movementAt,
      notes,
      quantity: parsed.data.quantity,
      stockItemId: stockItem.id,
      toLocationId: destination.id,
      unitCost,
    });
  } catch (error) {
    storesError(error instanceof Error ? error.message : "Could not transfer stock.");
  }

  await recordOpsAuditEvent({
    action: "stock.transfer_posted",
    actorUserId: profile.id,
    entityId: transferResult.issue_movement_id,
    entityType: "stock_movement",
    metadata: {
      from_location_id: location.id,
      from_quantity_on_hand: normalizeNumber(transferResult.from_quantity_on_hand),
      quantity: parsed.data.quantity,
      receipt_movement_id: transferResult.receipt_movement_id,
      stock_item_id: stockItem.id,
      to_location_id: destination.id,
      to_quantity_on_hand: normalizeNumber(transferResult.to_quantity_on_hand),
    },
    moduleKey: "stores_inventory",
    sourceId: stockLevel.id,
    sourceTable: "stock_levels",
    summary: `Transferred ${parsed.data.quantity} ${stockItem.unit} of ${stockItem.item_code}`,
  }).catch(() => null);

  revalidatePath(STORES_ROUTE);
  redirect(`${STORES_ROUTE}?updated=stock_transfer`);
}

export async function adjustStockCountAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canAdjustOpsStock(profile.role)) {
    storesError("Your role cannot adjust stock counts.");
  }

  const parsed = stockAdjustmentSchema.safeParse({
    counted_quantity: field(formData, "counted_quantity"),
    movement_at: field(formData, "movement_at"),
    notes: field(formData, "notes"),
    reason: field(formData, "reason") || "stock_count",
    reference: field(formData, "reference"),
    stock_level_id: field(formData, "stock_level_id"),
  });

  if (!parsed.success) {
    storesError(parsed.error.issues[0]?.message ?? "Check the stock adjustment.");
  }

  const { location, quantityOnHand, stockItem, stockLevel } =
    await resolveStockLevelContext(parsed.data.stock_level_id);
  const delta = parsed.data.counted_quantity - quantityOnHand;

  if (delta === 0) {
    storesError("Counted quantity already matches the stock balance.");
  }

  const unitCost = await latestUnitCostForStockLevel(stockLevel);
  const movementAt = normalizeMovementDateInput(parsed.data.movement_at);
  const notes = stockMovementNotes({
    fallback: `Adjustment reason: ${parsed.data.reason}`,
    notes: parsed.data.notes,
    reference: parsed.data.reference,
  });

  let movement: StockMovementRpcResult;

  try {
    movement = await postStockMovement({
      createdBy: profile.id,
      locationId: location.id,
      movementAt,
      movementType: "adjustment",
      notes,
      quantity: delta,
      sourceId: stockLevel.id,
      sourceTable: "stock_levels",
      stockItemId: stockItem.id,
      unitCost,
    });
  } catch (error) {
    storesError(error instanceof Error ? error.message : "Could not adjust stock.");
  }

  await recordOpsAuditEvent({
    action: "stock.adjustment_posted",
    actorUserId: profile.id,
    entityId: movement.movement_id,
    entityType: "stock_movement",
    metadata: {
      counted_quantity: parsed.data.counted_quantity,
      delta,
      location_id: location.id,
      previous_quantity: quantityOnHand,
      quantity_on_hand: normalizeNumber(movement.quantity_on_hand),
      reason: parsed.data.reason,
      stock_item_id: stockItem.id,
    },
    moduleKey: "stores_inventory",
    sourceId: stockLevel.id,
    sourceTable: "stock_levels",
    summary: `Adjusted ${stockItem.item_code} from ${quantityOnHand} to ${parsed.data.counted_quantity}`,
  }).catch(() => null);

  revalidatePath(STORES_ROUTE);
  redirect(`${STORES_ROUTE}?updated=stock_adjustment`);
}

export async function recordGoodsReceivedAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = grnSchema.safeParse({
    delivery_reference: field(formData, "delivery_reference"),
    location_id: field(formData, "location_id"),
    notes: field(formData, "notes"),
    purchase_order_item_id: field(formData, "purchase_order_item_id"),
    quantity_received: field(formData, "quantity_received"),
    quantity_rejected: field(formData, "quantity_rejected") || "0",
    received_at: field(formData, "received_at"),
    stock_item_id: field(formData, "stock_item_id"),
  });

  if (!parsed.success) {
    storesError(parsed.error.issues[0]?.message ?? "Check the goods received note.");
  }

  const purchaseOrderItem = await fetchPurchaseOrderItemForReceipt(parsed.data.purchase_order_item_id);

  if (!purchaseOrderItem) {
    storesError("Purchase order line was not found.");
  }

  const [purchaseOrder, location, stockItem, alreadyReceived] = await Promise.all([
    fetchPurchaseOrderForReceipt(purchaseOrderItem.purchase_order_id),
    fetchLocationForReceipt(parsed.data.location_id),
    fetchStockItemForReceipt(parsed.data.stock_item_id),
    receivedQuantityForPurchaseOrderItem(purchaseOrderItem.id),
  ]);

  if (!purchaseOrder) {
    storesError("Purchase order was not found.");
  }

  if (!canRecordOpsGoodsReceived(profile.role, purchaseOrder)) {
    storesError("Your role cannot receive goods against this purchase order.");
  }

  if (!location || !location.is_active) {
    storesError("Select an active stock location.");
  }

  if (location.site_id && location.site_id !== purchaseOrder.site_id) {
    storesError("The selected stock location belongs to a different site.");
  }

  if (!stockItem || !stockItem.is_active) {
    storesError("Select an active stock item.");
  }

  const orderedQuantity = normalizeNumber(purchaseOrderItem.quantity);
  const remainingQuantity = Math.max(orderedQuantity - alreadyReceived, 0);
  const deliveryQuantity = parsed.data.quantity_received + parsed.data.quantity_rejected;

  if (remainingQuantity <= 0) {
    storesError("This purchase order line has already been fully received.");
  }

  if (deliveryQuantity > remainingQuantity) {
    storesError("Received plus rejected quantity cannot exceed the remaining order quantity.");
  }

  const receivedAt = normalizeDateInput(parsed.data.received_at);
  const unitCost = normalizeNumber(purchaseOrderItem.unit_cost);
  const supabase = getOpsSupabaseServiceClient();
  const { data: grn, error: grnError } = await supabase
    .from("goods_received_notes")
    .insert({
      created_by: profile.id,
      delivery_reference: parsed.data.delivery_reference,
      location_id: location.id,
      notes: parsed.data.notes,
      purchase_order_id: purchaseOrder.id,
      received_at: receivedAt,
      received_by: profile.id,
      site_id: purchaseOrder.site_id,
      status: "posted",
      supplier_id: purchaseOrder.supplier_id,
    })
    .select("id, grn_number")
    .single<{ grn_number: string; id: string }>();

  if (grnError || !grn) {
    storesError(grnError?.message ?? "Could not create goods received note.");
  }

  const lineNumber = await nextGrnLineNumber(grn.id);
  const { data: grnItem, error: itemError } = await supabase
    .from("goods_received_items")
    .insert({
      grn_id: grn.id,
      item_name: purchaseOrderItem.item_name,
      line_number: lineNumber,
      notes: parsed.data.notes,
      purchase_order_item_id: purchaseOrderItem.id,
      quantity_ordered: orderedQuantity,
      quantity_received: parsed.data.quantity_received,
      quantity_rejected: parsed.data.quantity_rejected,
      stock_item_id: stockItem.id,
      unit: purchaseOrderItem.unit,
      unit_cost: unitCost,
    })
    .select("id")
    .single<{ id: string }>();

  if (itemError || !grnItem) {
    await (async () => {
      await supabase
        .from("goods_received_notes")
        .update({ cancelled_at: new Date().toISOString(), status: "cancelled" })
        .eq("id", grn.id);
    })().catch(() => null);
    storesError(itemError?.message ?? "Could not add goods received line.");
  }

  try {
    await applyStockReceipt({
      createdBy: profile.id,
      grnId: grn.id,
      locationId: location.id,
      notes: `${grn.grn_number} / ${purchaseOrder.po_number}`,
      quantity: parsed.data.quantity_received,
      stockItemId: stockItem.id,
      unitCost,
    });
  } catch (error) {
    await (async () => {
      await supabase
        .from("goods_received_notes")
        .update({ cancelled_at: new Date().toISOString(), status: "cancelled" })
        .eq("id", grn.id);
    })().catch(() => null);
    storesError(error instanceof Error ? error.message : "Could not post inventory movement.");
  }

  await syncPurchaseOrderReceiptStatus(purchaseOrder).catch((error: unknown) =>
    recordOpsAuditEvent({
      action: "goods_received.po_status_sync_failed",
      actorUserId: profile.id,
      entityId: grn.id,
      entityType: "goods_received_note",
      metadata: {
        error: error instanceof Error ? error.message : "Unknown sync error",
        grn_number: grn.grn_number,
        purchase_order_id: purchaseOrder.id,
      },
      moduleKey: "stores_inventory",
      sourceId: grn.id,
      sourceTable: "goods_received_notes",
      summary: `PO status sync failed after posting ${grn.grn_number}`,
    }).catch(() => null),
  );

  await recordOpsAuditEvent({
    action: "goods_received.posted",
    actorUserId: profile.id,
    entityId: grn.id,
    entityType: "goods_received_note",
    metadata: {
      grn_number: grn.grn_number,
      location_id: location.id,
      po_number: purchaseOrder.po_number,
      quantity_received: parsed.data.quantity_received,
      quantity_rejected: parsed.data.quantity_rejected,
      stock_item_id: stockItem.id,
    },
    moduleKey: "stores_inventory",
    sourceId: grn.id,
    sourceTable: "goods_received_notes",
    summary: `Posted ${grn.grn_number} for ${purchaseOrder.po_number}`,
  }).catch(() => null);

  // Phase M backfill: notify procurement + commercial + finance + leadership
  // so the receipt feeds straight into the matching invoice + budget cycle.
  const recipients = await fanoutToOpsRoles(
    [
      "procurement_manager",
      "procurement",
      "quantity_surveyor",
      "finance_manager",
      "accountant",
      "operations_manager",
      "managing_director",
    ],
    { excludeUserIds: [profile.id] },
  );
  await Promise.all(
    recipients.map((recipient) =>
      queueOpsNotification({
        actionHref: `/ops/stores-inventory#grn-${grn.id}`,
        body: `${profile.full_name} posted ${grn.grn_number} against ${purchaseOrder.po_number}. Received ${parsed.data.quantity_received}; rejected ${parsed.data.quantity_rejected}.`,
        idempotencyKey: `grn-posted:${grn.id}:${recipient.id}`,
        moduleKey: "stores_inventory",
        recipientId: recipient.id,
        sourceId: grn.id,
        sourceTable: "goods_received_notes",
        title: `Goods received: ${grn.grn_number}`,
      }).catch(() => null),
    ),
  );

  revalidatePath(STORES_ROUTE);
  revalidatePath("/ops/rfq-po");
  revalidatePath("/ops/material-requests");
  revalidatePath("/ops/notifications");
  redirect(`${STORES_ROUTE}?created=grn`);
}

// ---------------------------------------------------------------------------
// S2-5 / J2 backlog: archive GRN. GRN already has cancelled_at; archive lets
// procurement hide completed receipts without losing audit history.
// ---------------------------------------------------------------------------

const grnIdSchema = z.object({ id: z.string().uuid("Select a Goods Received Note.") });

export async function archiveGoodsReceivedNoteAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  const parsed = grnIdSchema.safeParse({ id: field(formData, "id") });
  if (!parsed.success) {
    storesError("Select a Goods Received Note to archive.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("goods_received_notes")
    .update({
      archived_at: new Date().toISOString(),
      archived_by: profile.id,
    })
    .eq("id", parsed.data.id)
    .in("status", ["completed", "cancelled"]);

  if (error) {
    storesError(error.message);
  }

  await recordOpsAuditEvent({
    action: "goods_received.archived",
    actorUserId: profile.id,
    entityId: parsed.data.id,
    entityType: "goods_received_note",
    moduleKey: "stores_inventory",
    sourceId: parsed.data.id,
    sourceTable: "goods_received_notes",
    summary: "Archived Goods Received Note",
  }).catch(() => null);

  revalidatePath(STORES_ROUTE);
  redirect(`${STORES_ROUTE}?updated=grn_archived`);
}
