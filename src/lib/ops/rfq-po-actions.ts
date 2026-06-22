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
  canAwardOpsSupplierQuote,
  canCancelOpsRfq,
  canCreateOpsRfq,
  canEditOpsPurchaseOrder,
  canInviteOpsRfqSupplier,
  canIssueOpsPurchaseOrder,
  canRecordOpsSupplierQuote,
  canSubmitOpsPurchaseOrderForApproval,
  purchaseOrderApprovalRecipientRoles,
  purchaseOrderApprovalSteps,
} from "@/lib/ops/rfq-po-permissions";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type {
  OpsMaterialRequestStatus,
  OpsPurchaseOrderStatus,
  OpsRfqStatus,
  OpsSupplierQuoteStatus,
  OpsSupplierStatus,
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

const quoteIdSchema = z.object({
  quote_id: z.string().uuid("Select a supplier quote."),
});

const purchaseOrderIdSchema = z.object({
  purchase_order_id: z.string().uuid("Select a purchase order."),
});

const inviteSupplierSchema = rfqIdSchema.extend({
  supplier_id: z.string().uuid("Select a supplier."),
});

const recordQuoteSchema = quoteIdSchema.extend({
  notes: z.string().trim().max(800).default(""),
  quote_reference: z.string().trim().max(120).default(""),
  quoted_total: z.coerce.number().positive("Quote total must be greater than zero."),
  valid_until: z.string().trim().default(""),
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

type SupplierForRfq = {
  id: string;
  legal_name: string;
  status: OpsSupplierStatus;
  supplier_code: string;
};

type SupplierQuoteForMutation = {
  id: string;
  quote_number: string;
  quoted_total: number | string;
  rfq_id: string;
  status: OpsSupplierQuoteStatus;
  supplier_id: string;
};

type PurchaseOrderInsertResult = {
  id: string;
  po_number: string;
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

async function fetchSupplierForRfq(supplierId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("suppliers")
    .select("id, supplier_code, legal_name, status")
    .eq("id", supplierId)
    .maybeSingle<SupplierForRfq>();

  if (error) {
    throw error;
  }

  return data;
}

async function fetchSupplierQuoteForMutation(quoteId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("supplier_quotes")
    .select("id, quote_number, rfq_id, supplier_id, status, quoted_total")
    .eq("id", quoteId)
    .maybeSingle<SupplierQuoteForMutation>();

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

async function fetchExistingPurchaseOrderForQuote(quoteId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("purchase_orders")
    .select("id, po_number")
    .eq("supplier_quote_id", quoteId)
    .maybeSingle<PurchaseOrderInsertResult>();

  if (error) {
    throw error;
  }

  return data;
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

  // Best-effort: when the RFQ is seeded from a BOQ line (or any flow that
  // pre-fills a supplier), auto-invite that supplier so the package is ready to
  // quote. Failures here must never void the created RFQ.
  if (parsed.data.supplier_id && canInviteOpsRfqSupplier(profile.role, { status: "draft" })) {
    try {
      const supplier = await fetchSupplierForRfq(parsed.data.supplier_id);

      if (supplier && supplier.status === "active") {
        const { error: inviteError } = await supabase.from("supplier_quotes").insert({
          created_by: profile.id,
          rfq_id: rfq.id,
          supplier_id: supplier.id,
        });

        if (!inviteError) {
          await supabase
            .from("rfqs")
            .update({ issued_at: new Date().toISOString(), status: "issued" })
            .eq("id", rfq.id)
            .eq("status", "draft");

          await recordOpsAuditEvent({
            action: "rfq.supplier_invited",
            actorUserId: profile.id,
            entityId: rfq.id,
            entityType: "rfq",
            metadata: {
              auto_invited: true,
              rfq_number: rfq.rfq_number,
              supplier_code: supplier.supplier_code,
              supplier_id: supplier.id,
              source: "boq_line",
            },
            moduleKey: "rfq_po",
            sourceId: rfq.id,
            sourceTable: "rfqs",
            summary: `Auto-invited ${supplier.supplier_code} to ${rfq.rfq_number}`,
          }).catch(() => null);
        }
      }
    } catch {
      // Swallow: the RFQ is still valid without the supplier pre-invite.
    }
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

export async function inviteSupplierToRfqAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = inviteSupplierSchema.safeParse({
    rfq_id: field(formData, "rfq_id"),
    supplier_id: field(formData, "supplier_id"),
  });

  if (!parsed.success) {
    rfqError(parsed.error.issues[0]?.message ?? "Check the RFQ supplier.");
  }

  const [rfq, supplier] = await Promise.all([
    fetchRfqForMutation(parsed.data.rfq_id),
    fetchSupplierForRfq(parsed.data.supplier_id),
  ]);

  if (!rfq) {
    rfqError("RFQ was not found.");
  }

  if (!supplier || supplier.status !== "active") {
    rfqError("Select an active supplier.");
  }

  if (!canInviteOpsRfqSupplier(profile.role, rfq)) {
    rfqError("Your role cannot invite suppliers to this RFQ.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data: quote, error } = await supabase
    .from("supplier_quotes")
    .insert({
      created_by: profile.id,
      rfq_id: rfq.id,
      supplier_id: supplier.id,
    })
    .select("id, quote_number")
    .single<{ id: string; quote_number: string }>();

  if (error || !quote) {
    rfqError(error?.code === "23505" ? "This supplier is already invited." : error?.message ?? "Could not invite supplier.");
  }

  if (rfq.status === "draft") {
    const { error: statusError } = await supabase
      .from("rfqs")
      .update({
        issued_at: new Date().toISOString(),
        status: "issued",
      })
      .eq("id", rfq.id)
      .eq("status", "draft");

    if (statusError) {
      rfqError(statusError.message);
    }
  }

  await recordOpsAuditEvent({
    action: "rfq.supplier_invited",
    actorUserId: profile.id,
    entityId: quote.id,
    entityType: "supplier_quote",
    metadata: {
      quote_number: quote.quote_number,
      rfq_number: rfq.rfq_number,
      supplier_code: supplier.supplier_code,
      supplier_id: supplier.id,
    },
    moduleKey: "rfq_po",
    sourceId: rfq.id,
    sourceTable: "rfqs",
    summary: `Invited ${supplier.supplier_code} to ${rfq.rfq_number}`,
  }).catch(() => null);

  revalidatePath(RFQ_PO_ROUTE);
  redirect(`${RFQ_PO_ROUTE}?updated=supplier_invited`);
}

export async function recordSupplierQuoteAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = recordQuoteSchema.safeParse({
    notes: field(formData, "notes"),
    quote_id: field(formData, "quote_id"),
    quote_reference: field(formData, "quote_reference"),
    quoted_total: field(formData, "quoted_total"),
    valid_until: field(formData, "valid_until"),
  });

  if (!parsed.success) {
    rfqError(parsed.error.issues[0]?.message ?? "Check the supplier quote.");
  }

  const quote = await fetchSupplierQuoteForMutation(parsed.data.quote_id);

  if (!quote) {
    rfqError("Supplier quote was not found.");
  }

  const rfq = await fetchRfqForMutation(quote.rfq_id);

  if (!rfq) {
    rfqError("RFQ was not found.");
  }

  if (!canRecordOpsSupplierQuote(profile.role, { rfq_status: rfq.status, status: quote.status })) {
    rfqError("Your role cannot record this supplier quote.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("supplier_quotes")
    .update({
      notes: parsed.data.notes,
      quote_reference: parsed.data.quote_reference,
      quoted_total: parsed.data.quoted_total,
      status: "received",
      submitted_at: now,
      valid_until: normalizeDateInput(parsed.data.valid_until),
    })
    .eq("id", quote.id)
    .in("status", ["invited", "received"]);

  if (error) {
    rfqError(error.message);
  }

  if (rfq.status === "draft" || rfq.status === "issued") {
    const { error: rfqStatusError } = await supabase
      .from("rfqs")
      .update({ status: "quoted" })
      .eq("id", rfq.id)
      .in("status", ["draft", "issued"]);

    if (rfqStatusError) {
      rfqError(rfqStatusError.message);
    }
  }

  await recordOpsAuditEvent({
    action: "rfq.quote_recorded",
    actorUserId: profile.id,
    entityId: quote.id,
    entityType: "supplier_quote",
    metadata: {
      quote_number: quote.quote_number,
      quoted_total: parsed.data.quoted_total,
      rfq_number: rfq.rfq_number,
      supplier_id: quote.supplier_id,
    },
    moduleKey: "rfq_po",
    sourceId: rfq.id,
    sourceTable: "rfqs",
    summary: `Recorded quote for ${rfq.rfq_number}`,
  }).catch(() => null);

  revalidatePath(RFQ_PO_ROUTE);
  redirect(`${RFQ_PO_ROUTE}?updated=quote_recorded`);
}

export async function awardSupplierQuoteAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = quoteIdSchema.safeParse({
    quote_id: field(formData, "quote_id"),
  });

  if (!parsed.success) {
    rfqError(parsed.error.issues[0]?.message ?? "Select a supplier quote.");
  }

  const quote = await fetchSupplierQuoteForMutation(parsed.data.quote_id);

  if (!quote) {
    rfqError("Supplier quote was not found.");
  }

  const [rfq, supplier, existingPurchaseOrder] = await Promise.all([
    fetchRfqForMutation(quote.rfq_id),
    fetchSupplierForRfq(quote.supplier_id),
    fetchExistingPurchaseOrderForQuote(quote.id),
  ]);

  if (!rfq) {
    rfqError("RFQ was not found.");
  }

  if (!supplier || supplier.status === "archived") {
    rfqError("Supplier is not available.");
  }

  if (existingPurchaseOrder) {
    redirect(`${RFQ_PO_ROUTE}?updated=po_exists`);
  }

  if (!canAwardOpsSupplierQuote(profile.role, { rfq_status: rfq.status, status: quote.status })) {
    rfqError("Your role cannot award this supplier quote.");
  }

  const quotedTotal = normalizeMoney(quote.quoted_total);

  if (quotedTotal <= 0) {
    rfqError("Record a positive quote total before awarding.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const now = new Date().toISOString();
  const { data: purchaseOrder, error: poError } = await supabase
    .from("purchase_orders")
    .insert({
      created_by: profile.id,
      description: `Draft purchase order created from ${rfq.rfq_number}.`,
      material_request_id: rfq.material_request_id,
      rfq_id: rfq.id,
      site_id: rfq.site_id,
      status: "draft",
      supplier_id: supplier.id,
      supplier_quote_id: quote.id,
      title: `PO from ${rfq.rfq_number} - ${supplier.legal_name}`,
      total_amount: quotedTotal,
    })
    .select("id, po_number")
    .single<PurchaseOrderInsertResult>();

  if (poError || !purchaseOrder) {
    rfqError(poError?.message ?? "Could not create draft purchase order.");
  }

  const { error: itemError } = await supabase.from("purchase_order_items").insert({
    item_name: `RFQ award package - ${rfq.rfq_number}`,
    line_number: 1,
    notes: `Supplier quote ${quote.quote_number}`,
    purchase_order_id: purchaseOrder.id,
    quantity: 1,
    specification: rfq.title,
    unit: "lot",
    unit_cost: quotedTotal,
  });

  if (itemError) {
    await (async () => {
      await supabase.from("purchase_orders").delete().eq("id", purchaseOrder.id);
    })().catch(() => null);
    rfqError(itemError.message);
  }

  const [{ error: awardError }, { error: rejectError }, { error: rfqUpdateError }] =
    await Promise.all([
      supabase
        .from("supplier_quotes")
        .update({
          awarded_at: now,
          status: "awarded",
        })
        .eq("id", quote.id),
      supabase
        .from("supplier_quotes")
        .update({ status: "rejected" })
        .eq("rfq_id", rfq.id)
        .neq("id", quote.id)
        .in("status", ["invited", "received"]),
      supabase
        .from("rfqs")
        .update({
          awarded_quote_id: quote.id,
          status: "awarded",
        })
        .eq("id", rfq.id),
    ]);

  if (awardError || rejectError || rfqUpdateError) {
    rfqError(
      awardError?.message ??
        rejectError?.message ??
        rfqUpdateError?.message ??
        "Could not mark RFQ as awarded.",
    );
  }

  await recordOpsAuditEvent({
    action: "rfq.quote_awarded",
    actorUserId: profile.id,
    entityId: purchaseOrder.id,
    entityType: "purchase_order",
    metadata: {
      po_number: purchaseOrder.po_number,
      quote_number: quote.quote_number,
      quoted_total: quotedTotal,
      rfq_number: rfq.rfq_number,
      supplier_id: supplier.id,
    },
    moduleKey: "rfq_po",
    sourceId: rfq.id,
    sourceTable: "rfqs",
    summary: `Awarded ${rfq.rfq_number} and created ${purchaseOrder.po_number}`,
  }).catch(() => null);

  revalidatePath(RFQ_PO_ROUTE);
  redirect(`${RFQ_PO_ROUTE}?updated=quote_awarded`);
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
  const [{ error: rfqUpdateError }, { error: quoteUpdateError }] = await Promise.all([
    supabase
      .from("rfqs")
      .update({
        cancelled_at: now,
        status: "cancelled",
      })
      .eq("id", rfq.id)
      .neq("status", "closed")
      .neq("status", "cancelled"),
    supabase
      .from("supplier_quotes")
      .update({ status: "rejected" })
      .eq("rfq_id", rfq.id)
      .in("status", ["invited", "received"]),
  ]);

  if (rfqUpdateError || quoteUpdateError) {
    rfqError(rfqUpdateError?.message ?? quoteUpdateError?.message ?? "Could not cancel RFQ.");
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
  notes: string;
  supplier_id: string | null;
  supplier_name_freeform: string | null;
};

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
      "id, line_number, item_name, specification, unit, quantity, estimated_unit_cost, notes, supplier_id, supplier_name_freeform",
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
      (sum, item) =>
        sum + Number(item.quantity ?? 0) * Number(item.estimated_unit_cost ?? 0),
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
      unit_cost: Number(item.estimated_unit_cost ?? 0),
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
