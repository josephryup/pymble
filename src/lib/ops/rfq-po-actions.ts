"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeOpsActionErrorMessage } from "@/lib/ops/action-errors";
import { fetchPurchaseOrderApprovalSettings } from "@/lib/ops/approval-settings";
import { requireOpsUser } from "@/lib/ops/auth";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import { fanoutToOpsRoles } from "@/lib/ops/notification-fanout";
import { queueOpsNotification } from "@/lib/ops/notifications";
import {
  canAddOpsRfqItem,
  canCancelOpsRfq,
  canCreateOpsRfq,
  canEditOpsPurchaseOrder,
  canEditOpsRfq,
  canIssueOpsPurchaseOrder,
  canSubmitOpsPurchaseOrderForApproval,
  purchaseOrderApprovalRecipientRoles,
  purchaseOrderApprovalSteps,
} from "@/lib/ops/rfq-po-permissions";
import { parseCsvRows, readPdfRows, readXlsxRows } from "@/lib/ops/boq-imports";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type {
  OpsMaterialRequestStatus,
  OpsPurchaseOrderStatus,
  OpsRfqStatus,
} from "@/lib/ops/types";

const RFQ_PO_ROUTE = "/ops/rfq-po";

const headerSchema = z.object({
  description: z.string().trim().max(800).default(""),
  due_date: z.string().trim().default(""),
  material_request_id: z.string().trim().default(""),
  site_id: z.string().uuid("Select a site."),
  title: z.string().trim().min(2, "RFQ title is required.").max(160),
});

const itemSchema = z.object({
  estimated_unit_cost: z.coerce.number().min(0, "Estimated unit cost cannot be negative."),
  actual_unit_cost: z.coerce.number().min(0, "Actual unit cost cannot be negative.").default(0),
  item_name: z.string().trim().min(2, "Item name is required.").max(160),
  notes: z.string().trim().max(400).default(""),
  quantity: z.coerce.number().positive("Quantity must be greater than zero."),
  specification: z.string().trim().max(500).default(""),
  unit: z.string().trim().min(1, "Unit is required.").max(40),
  // Per-item supplier — same model as material_request_items / boq_line_items.
  // RFQ no longer "invites" suppliers; each line nominates one internally.
  supplier_id: z
    .string()
    .trim()
    .default("")
    .transform((value) => (value.length > 0 ? value : null)),
  supplier_name_freeform: z.string().trim().max(160).default(""),
});

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const optionalSupplierId = z
  .string()
  .trim()
  .default("")
  .transform((value) => (value.length > 0 ? value : null))
  .refine((value) => value === null || UUID_PATTERN.test(value), {
    message: "Select a valid supplier.",
  });

const createRfqSchema = headerSchema.extend(itemSchema.shape).extend({
  supplier_id: optionalSupplierId,
});

const rfqIdSchema = z.object({
  rfq_id: z.string().uuid("Select an RFQ."),
});

const purchaseOrderIdSchema = z.object({
  purchase_order_id: z.string().uuid("Select a purchase order."),
});

const updateRfqHeaderSchema = rfqIdSchema.extend({
  title: z.string().trim().min(2, "RFQ title is required.").max(160),
  description: z.string().trim().max(800).default(""),
  due_date: z.string().trim().default(""),
});

const rfqItemIdSchema = z.object({
  rfq_item_id: z.string().uuid("Select an RFQ item."),
});

const updateRfqItemSchema = rfqItemIdSchema.extend(itemSchema.shape).extend({
  supplier_id: optionalSupplierId,
});

type SiteForMutation = {
  code: string;
  id: string;
  is_active: boolean;
  name: string;
};

type MaterialRequestForRfq = {
  id: string;
  request_number: string;
  site_id: string;
  status: OpsMaterialRequestStatus;
  title: string;
};

type RfqForMutation = {
  id: string;
  material_request_id: string | null;
  rfq_number: string;
  site_id: string;
  status: OpsRfqStatus;
  title: string;
};


type PurchaseOrderForMutation = {
  approval_request_id: string | null;
  created_by: string | null;
  currency_code: string;
  description: string;
  id: string;
  material_request_id: string | null;
  po_number: string;
  rfq_id: string | null;
  site_id: string;
  status: OpsPurchaseOrderStatus;
  title: string;
  total_amount: number | string;
};

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function rfqError(message: string): never {
  redirect(`${RFQ_PO_ROUTE}?error=${encodeURIComponent(safeOpsActionErrorMessage(message))}`);
}

function normalizeDateInput(value: string) {
  if (!value) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    rfqError("Use a valid date.");
  }

  return value;
}

function normalizeOptionalUuid(value: string) {
  return value || null;
}

function normalizeMoney(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

async function fetchActiveSite(siteId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("sites")
    .select("id, code, name, is_active")
    .eq("id", siteId)
    .eq("is_active", true)
    .maybeSingle<SiteForMutation>();

  if (error) {
    throw error;
  }

  return data;
}

async function fetchMaterialRequestForRfq(materialRequestId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("material_requests")
    .select("id, request_number, site_id, title, status")
    .eq("id", materialRequestId)
    .maybeSingle<MaterialRequestForRfq>();

  if (error) {
    throw error;
  }

  return data;
}

async function fetchRfqForMutation(rfqId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("rfqs")
    .select("id, rfq_number, site_id, material_request_id, title, status")
    .eq("id", rfqId)
    .maybeSingle<RfqForMutation>();

  if (error) {
    throw error;
  }

  return data;
}

async function fetchRfqItemForMutation(itemId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("rfq_items")
    .select("id, rfq_id, line_number, item_name")
    .eq("id", itemId)
    .maybeSingle<{ id: string; rfq_id: string; line_number: number; item_name: string }>();

  if (error) {
    throw error;
  }

  return data;
}

async function nextRfqLineNumber(rfqId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("rfq_items")
    .select("line_number")
    .eq("rfq_id", rfqId)
    .order("line_number", { ascending: false })
    .limit(1)
    .maybeSingle<{ line_number: number }>();

  if (error) {
    throw error;
  }

  return (data?.line_number ?? 0) + 1;
}

async function fetchPurchaseOrderForMutation(purchaseOrderId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("purchase_orders")
    .select(
      [
        "id",
        "po_number",
        "rfq_id",
        "site_id",
        "material_request_id",
        "title",
        "description",
        "status",
        "currency_code",
        "total_amount",
        "created_by",
        "approval_request_id",
      ].join(", "),
    )
    .eq("id", purchaseOrderId)
    .maybeSingle<PurchaseOrderForMutation>();

  if (error) {
    throw error;
  }

  return data;
}

async function fetchOpenPurchaseOrderApproval(purchaseOrderId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("approval_requests")
    .select("id")
    .eq("module_key", "rfq_po")
    .eq("source_table", "purchase_orders")
    .eq("source_id", purchaseOrderId)
    .in("status", ["draft", "submitted", "in_review"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (error) {
    throw error;
  }

  return data;
}

export async function createRfqAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canCreateOpsRfq(profile.role)) {
    rfqError("Your role cannot create RFQs.");
  }

  const parsed = createRfqSchema.safeParse({
    description: field(formData, "description"),
    due_date: field(formData, "due_date"),
    estimated_unit_cost: field(formData, "estimated_unit_cost") || "0",
    item_name: field(formData, "item_name"),
    material_request_id: field(formData, "material_request_id"),
    notes: field(formData, "notes"),
    quantity: field(formData, "quantity"),
    site_id: field(formData, "site_id"),
    specification: field(formData, "specification"),
    supplier_id: field(formData, "supplier_id"),
    title: field(formData, "title"),
    unit: field(formData, "unit") || "each",
  });

  if (!parsed.success) {
    rfqError(parsed.error.issues[0]?.message ?? "Check the RFQ details.");
  }

  const [site, materialRequest] = await Promise.all([
    fetchActiveSite(parsed.data.site_id),
    parsed.data.material_request_id
      ? fetchMaterialRequestForRfq(parsed.data.material_request_id)
      : Promise.resolve(null),
  ]);

  if (!site) {
    rfqError("Select an active site.");
  }

  if (materialRequest) {
    if (!["approved", "ordered", "closed"].includes(materialRequest.status)) {
      rfqError("Only approved material requests can feed an RFQ.");
    }

    if (materialRequest.site_id !== site.id) {
      rfqError("The selected material request belongs to a different site.");
    }
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data: rfq, error: rfqErrorResult } = await supabase
    .from("rfqs")
    .insert({
      created_by: profile.id,
      description: parsed.data.description,
      due_date: normalizeDateInput(parsed.data.due_date),
      material_request_id: normalizeOptionalUuid(parsed.data.material_request_id),
      site_id: site.id,
      status: "draft",
      title: parsed.data.title,
    })
    .select("id, rfq_number")
    .single<{ id: string; rfq_number: string }>();

  if (rfqErrorResult || !rfq) {
    rfqError(rfqErrorResult?.message ?? "Could not create RFQ.");
  }

  const { error: itemError } = await supabase.from("rfq_items").insert({
    estimated_unit_cost: parsed.data.estimated_unit_cost,
    item_name: parsed.data.item_name,
    line_number: 1,
    notes: parsed.data.notes,
    quantity: parsed.data.quantity,
    rfq_id: rfq.id,
    specification: parsed.data.specification,
    unit: parsed.data.unit,
  });

  if (itemError) {
    await (async () => {
      await supabase.from("rfqs").delete().eq("id", rfq.id);
    })().catch(() => null);
    rfqError(itemError.message);
  }


  await recordOpsAuditEvent({
    action: "rfq.created",
    actorUserId: profile.id,
    entityId: rfq.id,
    entityType: "rfq",
    metadata: {
      material_request_id: materialRequest?.id ?? null,
      rfq_number: rfq.rfq_number,
      site_id: site.id,
    },
    moduleKey: "rfq_po",
    sourceId: rfq.id,
    sourceTable: "rfqs",
    summary: `Created RFQ ${rfq.rfq_number}: ${parsed.data.title}`,
  }).catch(() => null);

  revalidatePath(RFQ_PO_ROUTE);
  redirect(`${RFQ_PO_ROUTE}?created=rfq`);
}

export async function addRfqItemAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = rfqIdSchema.extend(itemSchema.shape).safeParse({
    estimated_unit_cost: field(formData, "estimated_unit_cost") || "0",
    actual_unit_cost: field(formData, "actual_unit_cost") || "0",
    item_name: field(formData, "item_name"),
    notes: field(formData, "notes"),
    quantity: field(formData, "quantity"),
    rfq_id: field(formData, "rfq_id"),
    specification: field(formData, "specification"),
    supplier_id: field(formData, "supplier_id"),
    supplier_name_freeform: field(formData, "supplier_name_freeform"),
    unit: field(formData, "unit") || "each",
  });

  if (!parsed.success) {
    rfqError(parsed.error.issues[0]?.message ?? "Check the RFQ item.");
  }

  const rfq = await fetchRfqForMutation(parsed.data.rfq_id);

  if (!rfq) {
    rfqError("RFQ was not found.");
  }

  if (!canAddOpsRfqItem(profile.role, rfq)) {
    rfqError("Your role cannot add items to this RFQ.");
  }

  const lineNumber = await nextRfqLineNumber(rfq.id);
  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase.from("rfq_items").insert({
    estimated_unit_cost: parsed.data.estimated_unit_cost,
    actual_unit_cost: parsed.data.actual_unit_cost,
    item_name: parsed.data.item_name,
    line_number: lineNumber,
    notes: parsed.data.notes,
    quantity: parsed.data.quantity,
    rfq_id: rfq.id,
    specification: parsed.data.specification,
    supplier_id: parsed.data.supplier_id,
    supplier_name_freeform: parsed.data.supplier_name_freeform || null,
    unit: parsed.data.unit,
  });

  if (error) {
    rfqError(error.message);
  }

  await recordOpsAuditEvent({
    action: "rfq.item_added",
    actorUserId: profile.id,
    entityId: rfq.id,
    entityType: "rfq",
    metadata: {
      item_name: parsed.data.item_name,
      line_number: lineNumber,
      rfq_number: rfq.rfq_number,
    },
    moduleKey: "rfq_po",
    sourceId: rfq.id,
    sourceTable: "rfqs",
    summary: `Added item to ${rfq.rfq_number}`,
  }).catch(() => null);

  revalidatePath(RFQ_PO_ROUTE);
  redirect(`${RFQ_PO_ROUTE}?updated=item_added`);
}

export async function updateRfqAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = updateRfqHeaderSchema.safeParse({
    rfq_id: field(formData, "rfq_id"),
    title: field(formData, "title"),
    description: field(formData, "description"),
    due_date: field(formData, "due_date"),
  });

  if (!parsed.success) {
    rfqError(parsed.error.issues[0]?.message ?? "Check the RFQ details.");
  }

  const rfq = await fetchRfqForMutation(parsed.data.rfq_id);
  if (!rfq) {
    rfqError("RFQ was not found.");
  }

  if (!canEditOpsRfq(profile.role, rfq)) {
    rfqError("This RFQ can no longer be edited.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("rfqs")
    .update({
      title: parsed.data.title,
      description: parsed.data.description,
      due_date: normalizeDateInput(parsed.data.due_date),
    })
    .eq("id", rfq.id)
    .in("status", ["draft", "issued"]);

  if (error) {
    rfqError(error.message);
  }

  await recordOpsAuditEvent({
    action: "rfq.updated",
    actorUserId: profile.id,
    entityId: rfq.id,
    entityType: "rfq",
    metadata: { rfq_number: rfq.rfq_number, title: parsed.data.title },
    moduleKey: "rfq_po",
    sourceId: rfq.id,
    sourceTable: "rfqs",
    summary: `Updated RFQ ${rfq.rfq_number}`,
  }).catch(() => null);

  revalidatePath(RFQ_PO_ROUTE);
  redirect(`${RFQ_PO_ROUTE}?updated=rfq_updated`);
}

export async function updateRfqItemAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = updateRfqItemSchema.safeParse({
    rfq_item_id: field(formData, "rfq_item_id"),
    estimated_unit_cost: field(formData, "estimated_unit_cost") || "0",
    actual_unit_cost: field(formData, "actual_unit_cost") || "0",
    item_name: field(formData, "item_name"),
    notes: field(formData, "notes"),
    quantity: field(formData, "quantity"),
    specification: field(formData, "specification"),
    supplier_id: field(formData, "supplier_id"),
    supplier_name_freeform: field(formData, "supplier_name_freeform"),
    unit: field(formData, "unit") || "each",
  });

  if (!parsed.success) {
    rfqError(parsed.error.issues[0]?.message ?? "Check the RFQ item.");
  }

  const item = await fetchRfqItemForMutation(parsed.data.rfq_item_id);
  if (!item) {
    rfqError("RFQ item was not found.");
  }

  const rfq = await fetchRfqForMutation(item.rfq_id);
  if (!rfq) {
    rfqError("RFQ was not found.");
  }

  if (!canEditOpsRfq(profile.role, rfq)) {
    rfqError("This RFQ can no longer be edited.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("rfq_items")
    .update({
      estimated_unit_cost: parsed.data.estimated_unit_cost,
      actual_unit_cost: parsed.data.actual_unit_cost,
      item_name: parsed.data.item_name,
      notes: parsed.data.notes,
      quantity: parsed.data.quantity,
      specification: parsed.data.specification,
      supplier_id: parsed.data.supplier_id,
      supplier_name_freeform: parsed.data.supplier_name_freeform || null,
      unit: parsed.data.unit,
    })
    .eq("id", item.id);

  if (error) {
    rfqError(error.message);
  }

  await recordOpsAuditEvent({
    action: "rfq.item_updated",
    actorUserId: profile.id,
    entityId: rfq.id,
    entityType: "rfq",
    metadata: {
      item_name: parsed.data.item_name,
      line_number: item.line_number,
      rfq_number: rfq.rfq_number,
    },
    moduleKey: "rfq_po",
    sourceId: rfq.id,
    sourceTable: "rfqs",
    summary: `Updated item on ${rfq.rfq_number}`,
  }).catch(() => null);

  revalidatePath(RFQ_PO_ROUTE);
  redirect(`${RFQ_PO_ROUTE}?updated=item_updated`);
}

export async function submitPurchaseOrderForApprovalAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = purchaseOrderIdSchema.safeParse({
    purchase_order_id: field(formData, "purchase_order_id"),
  });

  if (!parsed.success) {
    rfqError(parsed.error.issues[0]?.message ?? "Select a purchase order.");
  }

  const purchaseOrder = await fetchPurchaseOrderForMutation(parsed.data.purchase_order_id);

  if (!purchaseOrder) {
    rfqError("Purchase order was not found.");
  }

  if (!canSubmitOpsPurchaseOrderForApproval(profile.role, purchaseOrder)) {
    rfqError("Your role cannot submit this purchase order for approval.");
  }

  const openApproval = await fetchOpenPurchaseOrderApproval(purchaseOrder.id);

  if (openApproval) {
    redirect(`/ops/approvals/${openApproval.id}`);
  }

  const totalAmount = normalizeMoney(purchaseOrder.total_amount);

  if (totalAmount <= 0) {
    rfqError("Purchase order total must be greater than zero before approval.");
  }

  const approvalSettings = await fetchPurchaseOrderApprovalSettings();
  const steps = purchaseOrderApprovalSteps(approvalSettings, totalAmount);

  if (steps.length === 0) {
    rfqError("Purchase order approval settings are not active.");
  }

  const now = new Date().toISOString();
  const supabase = getOpsSupabaseServiceClient();
  const { data: approval, error: approvalError } = await supabase
    .from("approval_requests")
    .insert({
      amount: totalAmount,
      currency_code: purchaseOrder.currency_code,
      current_step_number: 1,
      description:
        purchaseOrder.description ||
        `${purchaseOrder.po_number} requires approval before it can be issued.`,
      idempotency_key: `purchase-order-approval:${purchaseOrder.id}`,
      module_key: "rfq_po",
      priority: totalAmount >= approvalSettings.threshold_amount ? "high" : "normal",
      requested_by: profile.id,
      site_id: purchaseOrder.site_id,
      source_id: purchaseOrder.id,
      source_table: "purchase_orders",
      status: "submitted",
      submitted_at: now,
      title: `Purchase order: ${purchaseOrder.po_number} - ${purchaseOrder.title}`,
    })
    .select("id")
    .single<{ id: string }>();

  if (approvalError || !approval) {
    rfqError(approvalError?.message ?? "Could not create purchase order approval.");
  }

  const { error: stepError } = await supabase.from("approval_steps").insert(
    steps.map((step) => ({
      approval_request_id: approval.id,
      approver_role: step.approverRole,
      approver_sequence: step.sequence,
      status: "pending",
      step_label: step.label,
      step_number: step.stepNumber,
    })),
  );

  if (stepError) {
    await (async () => {
      await supabase
        .from("approval_requests")
        .update({
          resolved_at: now,
          status: "cancelled",
        })
        .eq("id", approval.id);
    })().catch(() => null);
    rfqError(stepError.message);
  }

  const { data: updatedPurchaseOrder, error: purchaseOrderUpdateError } = await supabase
    .from("purchase_orders")
    .update({
      approval_request_id: approval.id,
      approved_at: null,
      approved_by: null,
      status: "approval_pending",
      submitted_at: now,
    })
    .eq("id", purchaseOrder.id)
    .in("status", ["draft", "rejected"])
    .select("id")
    .maybeSingle<{ id: string }>();

  if (purchaseOrderUpdateError || !updatedPurchaseOrder) {
    await (async () => {
      await supabase
        .from("approval_requests")
        .update({
          resolved_at: now,
          status: "cancelled",
        })
        .eq("id", approval.id);
    })().catch(() => null);
    rfqError(
      purchaseOrderUpdateError?.message ??
        "This purchase order is no longer ready for approval. Refresh and try again.",
    );
  }

  await recordOpsAuditEvent({
    action: "purchase_order.approval_requested",
    actorUserId: profile.id,
    entityId: approval.id,
    entityType: "approval_request",
    metadata: {
      amount: totalAmount,
      po_number: purchaseOrder.po_number,
      purchase_order_id: purchaseOrder.id,
      step_roles: steps.map((step) => step.approverRole),
    },
    moduleKey: "rfq_po",
    sourceId: purchaseOrder.id,
    sourceTable: "purchase_orders",
    summary: `Requested approval for ${purchaseOrder.po_number}`,
  }).catch(() => null);

  // Resolve approvers using the workflow fallback chain so missing seats
  // (e.g. Finance Manager unfilled) don't drop the notification — falls
  // through to Accountant → MD per the chain in notification-fanout.ts.
  const recipientRoles = purchaseOrderApprovalRecipientRoles(steps);
  const approvers = await fanoutToOpsRoles(recipientRoles, {
    excludeUserIds: [profile.id],
  });

  await Promise.all(
    approvers.map((approver) =>
      queueOpsNotification({
        actionHref: `/ops/approvals/${approval.id}`,
        body: `${profile.full_name} requested approval for ${purchaseOrder.po_number}.`,
        idempotencyKey: `purchase-order-approval:${approval.id}:${approver.id}`,
        moduleKey: "rfq_po",
        recipientId: approver.id,
        sourceId: approval.id,
        sourceTable: "approval_requests",
        title: "Purchase order approval",
      }).catch(() => null),
    ),
  );

  revalidatePath(RFQ_PO_ROUTE);
  revalidatePath("/ops/approvals");
  revalidatePath("/ops/notifications");
  redirect(`/ops/approvals/${approval.id}?created=purchase_order_approval`);
}

const updatePurchaseOrderSchema = z.object({
  purchase_order_id: z.string().uuid("Select a purchase order."),
  title: z.string().trim().min(2, "PO title is required.").max(200),
  total_amount: z.coerce.number().min(0, "Total amount cannot be negative."),
});

export async function updatePurchaseOrderAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = updatePurchaseOrderSchema.safeParse({
    purchase_order_id: field(formData, "purchase_order_id"),
    title: field(formData, "title"),
    total_amount: field(formData, "total_amount"),
  });

  if (!parsed.success) {
    rfqError(parsed.error.issues[0]?.message ?? "Check the purchase order details.");
  }

  const purchaseOrder = await fetchPurchaseOrderForMutation(parsed.data.purchase_order_id);
  if (!purchaseOrder) {
    rfqError("Purchase order was not found.");
  }

  if (!canEditOpsPurchaseOrder(profile.role, purchaseOrder)) {
    rfqError("Only draft or rejected purchase orders can be edited.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("purchase_orders")
    .update({
      title: parsed.data.title,
      total_amount: normalizeMoney(parsed.data.total_amount),
    })
    .eq("id", purchaseOrder.id)
    .in("status", ["draft", "rejected"]);

  if (error) {
    rfqError(error.message);
  }

  await recordOpsAuditEvent({
    action: "purchase_order.updated",
    actorUserId: profile.id,
    entityId: purchaseOrder.id,
    entityType: "purchase_order",
    metadata: {
      po_number: purchaseOrder.po_number,
      title: parsed.data.title,
      total_amount: normalizeMoney(parsed.data.total_amount),
    },
    moduleKey: "rfq_po",
    sourceId: purchaseOrder.id,
    sourceTable: "purchase_orders",
    summary: `Updated ${purchaseOrder.po_number}`,
  }).catch(() => null);

  revalidatePath(RFQ_PO_ROUTE);
  redirect(`${RFQ_PO_ROUTE}?updated=po_updated`);
}

export async function issuePurchaseOrderAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = purchaseOrderIdSchema.safeParse({
    purchase_order_id: field(formData, "purchase_order_id"),
  });

  if (!parsed.success) {
    rfqError(parsed.error.issues[0]?.message ?? "Select a purchase order.");
  }

  const purchaseOrder = await fetchPurchaseOrderForMutation(parsed.data.purchase_order_id);

  if (!purchaseOrder) {
    rfqError("Purchase order was not found.");
  }

  if (!canIssueOpsPurchaseOrder(profile.role, purchaseOrder)) {
    rfqError("Only an approved purchase order can be issued.");
  }

  const now = new Date().toISOString();
  const supabase = getOpsSupabaseServiceClient();
  const { data: updatedPurchaseOrder, error } = await supabase
    .from("purchase_orders")
    .update({
      issued_at: now,
      issued_by: profile.id,
      status: "issued",
    })
    .eq("id", purchaseOrder.id)
    .eq("status", "approved")
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error || !updatedPurchaseOrder) {
    rfqError(error?.message ?? "This purchase order is no longer ready to issue.");
  }

  if (purchaseOrder.material_request_id) {
    await (async () => {
      await supabase
        .from("material_requests")
        .update({ status: "ordered" })
        .eq("id", purchaseOrder.material_request_id)
        .in("status", ["approved", "submitted", "in_review"]);
    })().catch(() => null);
  }

  await recordOpsAuditEvent({
    action: "purchase_order.issued",
    actorUserId: profile.id,
    entityId: purchaseOrder.id,
    entityType: "purchase_order",
    metadata: {
      issued_at: now,
      po_number: purchaseOrder.po_number,
      total_amount: normalizeMoney(purchaseOrder.total_amount),
    },
    moduleKey: "rfq_po",
    sourceId: purchaseOrder.id,
    sourceTable: "purchase_orders",
    summary: `Issued ${purchaseOrder.po_number}`,
  }).catch(() => null);

  if (purchaseOrder.created_by && purchaseOrder.created_by !== profile.id) {
    await queueOpsNotification({
      actionHref: RFQ_PO_ROUTE,
      body: `${profile.full_name} issued ${purchaseOrder.po_number}.`,
      idempotencyKey: `purchase-order-issued:${purchaseOrder.id}:${purchaseOrder.created_by}`,
      moduleKey: "rfq_po",
      recipientId: purchaseOrder.created_by,
      sourceId: purchaseOrder.id,
      sourceTable: "purchase_orders",
      title: "Purchase order issued",
    }).catch(() => null);
  }

  revalidatePath(RFQ_PO_ROUTE);
  revalidatePath("/ops/material-requests");
  revalidatePath("/ops/notifications");
  redirect(`${RFQ_PO_ROUTE}?updated=po_issued`);
}

export async function cancelRfqAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = rfqIdSchema.safeParse({
    rfq_id: field(formData, "rfq_id"),
  });

  if (!parsed.success) {
    rfqError(parsed.error.issues[0]?.message ?? "Select an RFQ.");
  }

  if (field(formData, "confirm") !== "cancel") {
    rfqError("Confirm the RFQ cancellation.");
  }

  const rfq = await fetchRfqForMutation(parsed.data.rfq_id);

  if (!rfq) {
    rfqError("RFQ was not found.");
  }

  if (!canCancelOpsRfq(profile.role, rfq)) {
    rfqError("Your role cannot cancel this RFQ.");
  }

  const now = new Date().toISOString();
  const supabase = getOpsSupabaseServiceClient();
  const { error: rfqUpdateError } = await supabase
    .from("rfqs")
    .update({
      cancelled_at: now,
      status: "cancelled",
    })
    .eq("id", rfq.id)
    .neq("status", "closed")
    .neq("status", "cancelled");

  if (rfqUpdateError) {
    rfqError(rfqUpdateError.message ?? "Could not cancel RFQ.");
  }

  await recordOpsAuditEvent({
    action: "rfq.cancelled",
    actorUserId: profile.id,
    entityId: rfq.id,
    entityType: "rfq",
    metadata: {
      cancelled_at: now,
      rfq_number: rfq.rfq_number,
    },
    moduleKey: "rfq_po",
    sourceId: rfq.id,
    sourceTable: "rfqs",
    summary: `Cancelled ${rfq.rfq_number}`,
  }).catch(() => null);

  revalidatePath(RFQ_PO_ROUTE);
  redirect(`${RFQ_PO_ROUTE}?updated=rfq_cancelled`);
}

// ---------------------------------------------------------------------------
// S3-6: Convert RFQ → Purchase Orders by nominated supplier.
//
// Replaces the previous "invite supplier → quote → award" flow. Each RFQ line
// already nominates its own supplier (supplier_id or supplier_name_freeform).
// This action groups the lines by supplier and creates one draft PO per
// supplier group. Lines without a supplier are flagged back to the user.
// ---------------------------------------------------------------------------

type RfqItemForConversion = {
  id: string;
  line_number: number;
  item_name: string;
  specification: string;
  unit: string;
  quantity: number | string;
  estimated_unit_cost: number | string;
  actual_unit_cost: number | string;
  notes: string;
  supplier_id: string | null;
  supplier_name_freeform: string | null;
};

/**
 * The PO price for a line is the actual price the procurement office recorded
 * from the supplier. We fall back to the estimate only when no actual price has
 * been entered yet, so a half-priced RFQ still converts to a sensible PO.
 */
function conversionUnitCost(item: RfqItemForConversion) {
  const actual = Number(item.actual_unit_cost ?? 0);
  return actual > 0 ? actual : Number(item.estimated_unit_cost ?? 0);
}

export async function convertRfqToPurchaseOrdersAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = rfqIdSchema.safeParse({ rfq_id: field(formData, "rfq_id") });

  if (!parsed.success) {
    rfqError("Select an RFQ to convert.");
  }

  const rfq = await fetchRfqForMutation(parsed.data.rfq_id);
  if (!rfq) {
    rfqError("RFQ was not found.");
  }

  if (rfq.status === "closed" || rfq.status === "cancelled") {
    rfqError("This RFQ is already closed.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data: itemRows, error: itemsError } = await supabase
    .from("rfq_items")
    .select(
      "id, line_number, item_name, specification, unit, quantity, estimated_unit_cost, actual_unit_cost, notes, supplier_id, supplier_name_freeform",
    )
    .eq("rfq_id", rfq.id)
    .order("line_number");

  if (itemsError) {
    rfqError(itemsError.message);
  }

  const items = (itemRows ?? []) as RfqItemForConversion[];
  if (items.length === 0) {
    rfqError("Add line items to this RFQ before converting.");
  }

  const unassigned = items.filter(
    (item) => !item.supplier_id && !(item.supplier_name_freeform ?? "").trim(),
  );
  if (unassigned.length > 0) {
    rfqError(
      `${unassigned.length} line item${unassigned.length === 1 ? "" : "s"} have no supplier nominated. Nominate one per line before converting.`,
    );
  }

  // Bucket items by supplier — keyed by supplier_id when available, else by
  // normalized free-text name so lines from the same typed supplier merge
  // into a single PO.
  type Bucket = {
    supplierId: string | null;
    supplierName: string;
    items: RfqItemForConversion[];
  };
  const buckets = new Map<string, Bucket>();
  for (const item of items) {
    const freeform = (item.supplier_name_freeform ?? "").trim();
    const key = item.supplier_id ?? `freeform:${freeform.toLowerCase()}`;
    const supplierName = item.supplier_id
      ? "Master-list supplier"
      : freeform || "Free-text supplier";
    const existing = buckets.get(key);
    if (existing) {
      existing.items.push(item);
    } else {
      buckets.set(key, {
        supplierId: item.supplier_id,
        supplierName,
        items: [item],
      });
    }
  }

  // Look up supplier names for the buckets that have a supplier_id.
  const supplierIds = Array.from(buckets.values())
    .map((bucket) => bucket.supplierId)
    .filter((id): id is string => Boolean(id));
  if (supplierIds.length > 0) {
    const { data: suppliers } = await supabase
      .from("suppliers")
      .select("id, legal_name, status")
      .in("id", supplierIds);
    const supplierNameById = new Map(
      ((suppliers ?? []) as Array<{ id: string; legal_name: string; status: string }>).map(
        (supplier) => [supplier.id, supplier.legal_name] as const,
      ),
    );
    for (const bucket of buckets.values()) {
      if (bucket.supplierId) {
        const found = supplierNameById.get(bucket.supplierId);
        if (found) bucket.supplierName = found;
      }
    }
  }

  // Free-text suppliers can't satisfy purchase_orders.supplier_id (NOT NULL).
  // Reject the conversion if any bucket only has a free-text name — the user
  // should add the supplier to the master list first.
  const freeformBuckets = Array.from(buckets.values()).filter(
    (bucket) => !bucket.supplierId,
  );
  if (freeformBuckets.length > 0) {
    rfqError(
      `Add the typed supplier${freeformBuckets.length === 1 ? "" : "s"} to the supplier master list before converting (${freeformBuckets.map((bucket) => bucket.supplierName).join(", ")}).`,
    );
  }

  const createdPoIds: string[] = [];
  for (const bucket of buckets.values()) {
    if (!bucket.supplierId) continue; // already filtered out above
    const total = bucket.items.reduce(
      (sum, item) => sum + Number(item.quantity ?? 0) * conversionUnitCost(item),
      0,
    );

    const { data: po, error: poError } = await supabase
      .from("purchase_orders")
      .insert({
        created_by: profile.id,
        description: `Purchase order created from ${rfq.rfq_number}.`,
        material_request_id: rfq.material_request_id,
        rfq_id: rfq.id,
        site_id: rfq.site_id,
        status: "draft",
        supplier_id: bucket.supplierId,
        title: `PO from ${rfq.rfq_number} — ${bucket.supplierName}`,
        total_amount: total,
      })
      .select("id")
      .single<{ id: string }>();

    if (poError || !po) {
      rfqError(poError?.message ?? "Could not create purchase order.");
    }

    const inserts = bucket.items.map((item, index) => ({
      item_name: item.item_name,
      line_number: index + 1,
      notes: item.notes,
      purchase_order_id: po.id,
      quantity: Number(item.quantity ?? 0),
      rfq_item_id: item.id,
      specification: item.specification,
      supplier_id: bucket.supplierId,
      supplier_name_freeform: null,
      unit: item.unit,
      unit_cost: conversionUnitCost(item),
    }));
    const { error: itemError } = await supabase
      .from("purchase_order_items")
      .insert(inserts);
    if (itemError) {
      try {
        await supabase.from("purchase_orders").delete().eq("id", po.id);
      } catch {
        // Ignore — primary failure is itemError below.
      }
      rfqError(itemError.message);
    }

    createdPoIds.push(po.id);
  }

  await supabase
    .from("rfqs")
    .update({ status: "closed", closed_at: new Date().toISOString() })
    .eq("id", rfq.id);

  await recordOpsAuditEvent({
    action: "rfq.converted_to_purchase_orders",
    actorUserId: profile.id,
    entityId: rfq.id,
    entityType: "rfq",
    metadata: {
      rfq_number: rfq.rfq_number,
      purchase_order_count: createdPoIds.length,
    },
    moduleKey: "rfq_po",
    sourceId: rfq.id,
    sourceTable: "rfqs",
    summary: `Converted ${rfq.rfq_number} into ${createdPoIds.length} purchase order${createdPoIds.length === 1 ? "" : "s"}`,
  }).catch(() => null);

  // Notify procurement leadership that POs are ready for approval.
  const recipients = await fanoutToOpsRoles(
    ["procurement_manager", "operations_manager", "finance_manager", "managing_director"],
    { excludeUserIds: [profile.id] },
  );
  await Promise.all(
    recipients.map((recipient) =>
      queueOpsNotification({
        actionHref: RFQ_PO_ROUTE,
        body: `${profile.full_name} converted ${rfq.rfq_number} into ${createdPoIds.length} draft purchase order${createdPoIds.length === 1 ? "" : "s"}.`,
        idempotencyKey: `rfq-converted:${rfq.id}:${recipient.id}`,
        moduleKey: "rfq_po",
        recipientId: recipient.id,
        sourceId: rfq.id,
        sourceTable: "rfqs",
        title: `RFQ ${rfq.rfq_number} converted to POs`,
      }).catch(() => null),
    ),
  );

  revalidatePath(RFQ_PO_ROUTE);
  revalidatePath("/ops/notifications");
  redirect(`${RFQ_PO_ROUTE}?updated=rfq_converted`);
}

// ===========================================================================
// RFQ line-item import (CSV / XLSX / PDF). Mirrors the BOQ importer: the
// procurement office uploads a supplier price list / requisition and the rows
// become RFQ line items with their actual price and supplier already set.
// ===========================================================================

const RFQ_IMPORT_MAX_BYTES = 2 * 1024 * 1024;
const RFQ_IMPORT_MAX_ROWS = 1000;

const RFQ_IMPORT_HEADER_ALIASES: Record<string, string> = {
  item: "item_name",
  "item name": "item_name",
  "item description": "item_name",
  description: "item_name",
  material: "item_name",
  unit: "unit",
  uom: "unit",
  "unit of measure": "unit",
  quantity: "quantity",
  qty: "quantity",
  estimate: "estimated_unit_cost",
  estimated: "estimated_unit_cost",
  "estimated price": "estimated_unit_cost",
  "estimated unit cost": "estimated_unit_cost",
  "unit estimate": "estimated_unit_cost",
  price: "actual_unit_cost",
  "actual price": "actual_unit_cost",
  "actual unit price": "actual_unit_cost",
  "unit price": "actual_unit_cost",
  "unit price (k)": "actual_unit_cost",
  rate: "actual_unit_cost",
  "unit rate": "actual_unit_cost",
  amount: "actual_unit_cost",
  supplier: "supplier",
  vendor: "supplier",
  specification: "specification",
  spec: "specification",
  note: "notes",
  notes: "notes",
};

const rfqImportRowSchema = z.object({
  item_name: z.string().trim().min(2, "Item name is required.").max(160),
  unit: z.string().trim().min(1).max(40).default("each"),
  quantity: z.coerce.number().positive("Quantity must be greater than zero."),
  estimated_unit_cost: z.coerce.number().min(0).default(0),
  actual_unit_cost: z.coerce.number().min(0).default(0),
  specification: z.string().trim().max(500).default(""),
  notes: z.string().trim().max(400).default(""),
});

export async function importRfqItemsAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  const parsedId = rfqIdSchema.safeParse({ rfq_id: field(formData, "rfq_id") });
  if (!parsedId.success) {
    rfqError("Select an RFQ to import into.");
  }

  const rfq = await fetchRfqForMutation(parsedId.data.rfq_id);
  if (!rfq) {
    rfqError("RFQ was not found.");
  }
  if (!canEditOpsRfq(profile.role, rfq)) {
    rfqError("This RFQ can no longer accept imported items.");
  }

  const file = formData.get("file") as File | null;
  if (!(file instanceof File) || file.size === 0) {
    rfqError("Choose a CSV, XLSX, or PDF file to import.");
  }
  if (file.size > RFQ_IMPORT_MAX_BYTES) {
    rfqError("Import files must be 2 MB or smaller.");
  }

  const filename = file.name.toLowerCase();
  let rows: string[][] = [];
  try {
    if (filename.endsWith(".xlsx") || filename.endsWith(".xls")) {
      rows = await readXlsxRows(file);
    } else if (filename.endsWith(".pdf")) {
      rows = await readPdfRows(file);
    } else {
      rows = parseCsvRows(await file.text());
    }
  } catch (importError) {
    rfqError(
      importError instanceof Error
        ? `Could not read the file: ${importError.message}`
        : "Could not read the file.",
    );
  }

  rows = rows.filter((row) => row.some((cell) => (cell ?? "").toString().trim().length > 0));
  if (rows.length < 2) {
    rfqError("The file needs a header row and at least one line item.");
  }

  const header = rows[0].map((cell) => RFQ_IMPORT_HEADER_ALIASES[cell.trim().toLowerCase()] ?? "");
  const columnIndex = (key: string) => header.indexOf(key);
  const itemIndex = columnIndex("item_name");
  const unitIndex = columnIndex("unit");
  const quantityIndex = columnIndex("quantity");
  const estimateIndex = columnIndex("estimated_unit_cost");
  const actualIndex = columnIndex("actual_unit_cost");
  const supplierIndex = columnIndex("supplier");
  const specIndex = columnIndex("specification");
  const notesIndex = columnIndex("notes");

  if (itemIndex === -1 || quantityIndex === -1) {
    rfqError("Spreadsheet must include at least item/description and quantity columns.");
  }

  const dataRows = rows.slice(1);
  if (dataRows.length > RFQ_IMPORT_MAX_ROWS) {
    rfqError(`Import is limited to ${RFQ_IMPORT_MAX_ROWS} rows at a time.`);
  }

  const supabase = getOpsSupabaseServiceClient();

  // Resolve supplier references once (code or legal name -> id; otherwise free text).
  const supplierCodeToId = new Map<string, string>();
  const supplierNameToId = new Map<string, string>();
  if (supplierIndex !== -1) {
    const rawValues = Array.from(
      new Set(
        dataRows
          .map((row) => (row[supplierIndex] ?? "").trim())
          .filter((value) => value.length > 0),
      ),
    );
    if (rawValues.length > 0) {
      const { data: suppliers, error: supplierError } = await supabase
        .from("suppliers")
        .select("id, supplier_code, legal_name")
        .eq("status", "active");
      if (supplierError) {
        rfqError(supplierError.message);
      }
      for (const supplier of (suppliers ?? []) as Array<{
        id: string;
        supplier_code: string | null;
        legal_name: string;
      }>) {
        if (supplier.supplier_code) {
          supplierCodeToId.set(supplier.supplier_code.toUpperCase(), supplier.id);
        }
        supplierNameToId.set(supplier.legal_name.toLowerCase(), supplier.id);
      }
    }
  }

  const startLine = await nextRfqLineNumber(rfq.id);
  const inserts: Array<Record<string, unknown>> = [];
  const rowErrors: string[] = [];
  let unmatchedSuppliers = 0;

  dataRows.forEach((row, index) => {
    const parsed = rfqImportRowSchema.safeParse({
      item_name: row[itemIndex] ?? "",
      unit: (unitIndex !== -1 ? row[unitIndex] : "")?.trim() || "each",
      quantity: (row[quantityIndex] ?? "").trim(),
      estimated_unit_cost: (estimateIndex !== -1 ? row[estimateIndex] : "")?.trim() || "0",
      actual_unit_cost: (actualIndex !== -1 ? row[actualIndex] : "")?.trim() || "0",
      specification: specIndex !== -1 ? (row[specIndex] ?? "") : "",
      notes: notesIndex !== -1 ? (row[notesIndex] ?? "") : "",
    });

    if (!parsed.success) {
      rowErrors.push(`Row ${index + 2}: ${parsed.error.issues[0]?.message ?? "invalid"}`);
      return;
    }

    let supplierId: string | null = null;
    let supplierFreeform: string | null = null;
    if (supplierIndex !== -1) {
      const raw = (row[supplierIndex] ?? "").trim();
      if (raw.length > 0) {
        supplierId =
          supplierCodeToId.get(raw.toUpperCase()) ??
          supplierNameToId.get(raw.toLowerCase()) ??
          null;
        if (!supplierId) {
          supplierFreeform = raw;
          unmatchedSuppliers += 1;
        }
      }
    }

    inserts.push({
      actual_unit_cost: parsed.data.actual_unit_cost,
      estimated_unit_cost: parsed.data.estimated_unit_cost,
      item_name: parsed.data.item_name,
      line_number: startLine + inserts.length,
      notes: parsed.data.notes,
      quantity: parsed.data.quantity,
      rfq_id: rfq.id,
      specification: parsed.data.specification,
      supplier_id: supplierId,
      supplier_name_freeform: supplierFreeform,
      unit: parsed.data.unit,
    });
  });

  if (inserts.length === 0) {
    rfqError(
      rowErrors[0] ? `No rows imported. ${rowErrors[0]}` : "No valid line items were found.",
    );
  }

  const { error: insertError } = await supabase.from("rfq_items").insert(inserts);
  if (insertError) {
    rfqError(insertError.message);
  }

  await recordOpsAuditEvent({
    action: "rfq.items_imported",
    actorUserId: profile.id,
    entityId: rfq.id,
    entityType: "rfq",
    metadata: {
      imported: inserts.length,
      rfq_number: rfq.rfq_number,
      skipped: rowErrors.length,
      unmatched_suppliers: unmatchedSuppliers,
    },
    moduleKey: "rfq_po",
    sourceId: rfq.id,
    sourceTable: "rfqs",
    summary: `Imported ${inserts.length} item(s) into ${rfq.rfq_number}`,
  }).catch(() => null);

  revalidatePath(RFQ_PO_ROUTE);
  redirect(
    `${RFQ_PO_ROUTE}?updated=items_imported&imported=${inserts.length}&skipped=${rowErrors.length}`,
  );
}
