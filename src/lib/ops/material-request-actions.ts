"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeOpsActionErrorMessage } from "@/lib/ops/action-errors";
import { requireOpsUser } from "@/lib/ops/auth";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import {
  canApproveMaterialRequestCost,
  canApproveMaterialRequestMdReview,
  canArchiveOpsMaterialRequest,
  canAttachMaterialRequestPricing,
  canCancelOpsMaterialRequest,
  canConfirmMaterialRequestDelivery,
  canCreateOpsMaterialRequest,
  canCreateOpsMaterialRequestScope,
  canDeleteOpsMaterialRequest,
  canEditOpsMaterialRequest,
  canSetMaterialRequestTransportCost,
  canSubmitOpsMaterialRequest,
  materialRequestApprovalRecipientRoles,
  materialRequestApprovalSteps,
} from "@/lib/ops/material-request-permissions";
import { trackOpsEvent } from "@/lib/ops/analytics";
import { parseCsvRows, readPdfRows, readXlsxRows } from "@/lib/ops/boq-imports";
import { collectOpsLineItems } from "@/lib/ops/line-items";
import { resolveMaterialRequestBudgetLine } from "@/lib/ops/material-requests";
import { fanoutToOpsRoles } from "@/lib/ops/notification-fanout";
import { queueOpsNotification } from "@/lib/ops/notifications";
import { upsertMaterialRequestCostEntries } from "@/lib/ops/project-cost-entries";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type {
  OpsMaterialRequestScope,
  OpsMaterialRequestStatus,
  OpsPriority,
} from "@/lib/ops/types";

const MATERIAL_REQUEST_ROUTE = "/ops/material-requests";

const MR_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const headerSchema = z
  .object({
    description: z.string().trim().max(800).default(""),
    needed_by: z.string().trim().default(""),
    priority: z.enum(["low", "normal", "high", "urgent"]),
    // 'site' requests target a project site; 'general' requests are office /
    // overhead purchasing with no site.
    scope: z.enum(["site", "general", "it"]).default("site"),
    site_id: z.string().trim().default(""),
    title: z.string().trim().min(2, "Request title is required.").max(160),
  })
  .superRefine((value, ctx) => {
    if (value.scope === "site" && !MR_UUID_PATTERN.test(value.site_id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Select a site, or switch the request to General.",
        path: ["site_id"],
      });
    }
  });

const itemSchema = z.object({
  estimated_unit_cost: z.coerce.number().min(0, "Estimated unit cost cannot be negative."),
  item_name: z.string().trim().min(2, "Item name is required.").max(160),
  notes: z.string().trim().max(400).default(""),
  quantity: z.coerce.number().positive("Quantity must be greater than zero."),
  specification: z.string().trim().max(500).default(""),
  unit: z.string().trim().min(1, "Unit is required.").max(40),
  // Per-item supplier: either the suppliers.id (when picked from the master
  // list) or a free-text name (when the supplier isn't on the list yet).
  supplier_id: z
    .string()
    .trim()
    .default("")
    .transform((value) => (value.length > 0 ? value : null)),
  supplier_name_freeform: z.string().trim().max(160).default(""),
  // Optional link back to the planned material schedule (BOQ) line this item
  // fulfils. Drives budget-line resolution at submit time.
  boq_line_item_id: z
    .string()
    .trim()
    .default("")
    .transform((value) => (value.length > 0 ? value : null))
    .refine((value) => value === null || MR_UUID_PATTERN.test(value), {
      message: "Select a valid schedule line.",
    }),
});


const requestIdSchema = z.object({
  request_id: z.string().uuid("Select a material request."),
});

type MaterialRequestForMutation = {
  approval_request_id: string | null;
  budget_line_id: string | null;
  description: string;
  id: string;
  needed_by: string | null;
  priority: OpsPriority;
  request_number: string;
  requested_by: string | null;
  scope: OpsMaterialRequestScope;
  site_id: string;
  status: OpsMaterialRequestStatus;
  title: string;
  transport_budget_line_id: string | null;
  transport_cost: number | string;
};

type MaterialRequestItemForApproval = {
  boq_line_item_id: string | null;
  estimated_total: number | string;
  id: string;
  item_name: string;
  quantity: number | string;
  unit: string;
};

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function materialRequestError(message: string): never {
  redirect(`${MATERIAL_REQUEST_ROUTE}?error=${encodeURIComponent(safeOpsActionErrorMessage(message))}`);
}

function normalizeDateInput(value: string) {
  if (!value) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    materialRequestError("Use a valid needed-by date.");
  }

  return value;
}

function normalizeMoney(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

async function fetchMaterialRequestForMutation(requestId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("material_requests")
    .select(
      "id, request_number, scope, site_id, requested_by, title, description, priority, status, needed_by, approval_request_id, budget_line_id, transport_budget_line_id, transport_cost",
    )
    .eq("id", requestId)
    .maybeSingle<MaterialRequestForMutation>();

  if (error) {
    throw error;
  }

  return data;
}

async function fetchMaterialRequestItemsForApproval(requestId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("material_request_items")
    .select("id, item_name, quantity, unit, estimated_total, boq_line_item_id")
    .eq("request_id", requestId)
    .order("line_number", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as unknown as MaterialRequestItemForApproval[];
}

async function fetchOpenMaterialRequestApproval(requestId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("approval_requests")
    .select("id")
    .eq("module_key", "material_requests")
    .eq("source_table", "material_requests")
    .eq("source_id", requestId)
    .in("status", ["draft", "submitted", "in_review"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (error) {
    throw error;
  }

  return data;
}

async function nextMaterialRequestLineNumber(requestId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("material_request_items")
    .select("line_number")
    .eq("request_id", requestId)
    .order("line_number", { ascending: false })
    .limit(1)
    .maybeSingle<{ line_number: number }>();

  if (error) {
    throw error;
  }

  return (data?.line_number ?? 0) + 1;
}

export async function createMaterialRequestAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canCreateOpsMaterialRequest(profile.role)) {
    materialRequestError("Your role cannot create material requests.");
  }

  const parsed = headerSchema.safeParse({
    description: field(formData, "description"),
    needed_by: field(formData, "needed_by"),
    priority: field(formData, "priority") || "normal",
    scope: field(formData, "scope") || "site",
    site_id: field(formData, "site_id"),
    title: field(formData, "title"),
  });

  if (!parsed.success) {
    materialRequestError(parsed.error.issues[0]?.message ?? "Check the material request.");
  }

  if (!canCreateOpsMaterialRequestScope(profile.role, parsed.data.scope)) {
    materialRequestError(
      parsed.data.scope === "it"
        ? "Only the IT manager (or top leadership) can raise IT requests."
        : "The IT manager raises IT-scoped requests only.",
    );
  }

  const lineItems = collectOpsLineItems(formData);
  if (!lineItems.ok) {
    materialRequestError(lineItems.message);
  }

  const siteId = parsed.data.scope === "site" ? parsed.data.site_id : null;
  const neededBy = normalizeDateInput(parsed.data.needed_by);
  const supabase = getOpsSupabaseServiceClient();
  const { data: request, error: requestError } = await supabase
    .from("material_requests")
    .insert({
      description: parsed.data.description,
      needed_by: neededBy,
      priority: parsed.data.priority,
      requested_by: profile.id,
      scope: parsed.data.scope,
      site_id: siteId,
      status: "draft",
      title: parsed.data.title,
    })
    .select("id, request_number")
    .single<{ id: string; request_number: string }>();

  if (requestError || !request) {
    materialRequestError(requestError?.message ?? "Could not create material request.");
  }

  const { error: itemError } = await supabase.from("material_request_items").insert(
    lineItems.items.map((item, index) => ({
      estimated_unit_cost: item.estimated_unit_cost,
      item_name: item.item_name,
      line_number: index + 1,
      notes: item.notes,
      quantity: item.quantity,
      request_id: request.id,
      specification: item.specification,
      supplier_id: item.supplier_id,
      supplier_name_freeform: item.supplier_name_freeform,
      unit: item.unit,
    })),
  );

  if (itemError) {
    await (async () => {
      await supabase.from("material_requests").delete().eq("id", request.id);
    })().catch(() => null);
    materialRequestError(itemError.message);
  }

  await recordOpsAuditEvent({
    action: "material_request.created",
    actorUserId: profile.id,
    entityId: request.id,
    entityType: "material_request",
    metadata: {
      priority: parsed.data.priority,
      request_number: request.request_number,
      scope: parsed.data.scope,
      site_id: siteId,
    },
    moduleKey: "material_requests",
    sourceId: request.id,
    sourceTable: "material_requests",
    summary: `Created ${request.request_number}: ${parsed.data.title}`,
  }).catch(() => null);

  revalidatePath(MATERIAL_REQUEST_ROUTE);
  redirect(`${MATERIAL_REQUEST_ROUTE}?created=material_request`);
}

export async function addMaterialRequestItemAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = requestIdSchema.extend(itemSchema.shape).safeParse({
    estimated_unit_cost: field(formData, "estimated_unit_cost") || "0",
    item_name: field(formData, "item_name"),
    notes: field(formData, "notes"),
    quantity: field(formData, "quantity"),
    request_id: field(formData, "request_id"),
    specification: field(formData, "specification"),
    supplier_id: field(formData, "supplier_id"),
    supplier_name_freeform: field(formData, "supplier_name_freeform"),
    unit: field(formData, "unit") || "each",
    boq_line_item_id: field(formData, "boq_line_item_id"),
  });

  if (!parsed.success) {
    materialRequestError(parsed.error.issues[0]?.message ?? "Check the material line item.");
  }

  const request = await fetchMaterialRequestForMutation(parsed.data.request_id);

  if (!request) {
    materialRequestError("Material request was not found.");
  }

  if (!canEditOpsMaterialRequest(profile.id, profile.role, request)) {
    materialRequestError("You can only edit draft or rejected material requests you manage.");
  }

  const lineNumber = await nextMaterialRequestLineNumber(request.id);
  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase.from("material_request_items").insert({
    estimated_unit_cost: parsed.data.estimated_unit_cost,
    item_name: parsed.data.item_name,
    line_number: lineNumber,
    notes: parsed.data.notes,
    quantity: parsed.data.quantity,
    request_id: request.id,
    specification: parsed.data.specification,
    supplier_id: parsed.data.supplier_id,
    supplier_name_freeform: parsed.data.supplier_name_freeform || null,
    unit: parsed.data.unit,
    boq_line_item_id: parsed.data.boq_line_item_id,
  });

  if (error) {
    materialRequestError(error.message);
  }

  await recordOpsAuditEvent({
    action: "material_request.item_added",
    actorUserId: profile.id,
    entityId: request.id,
    entityType: "material_request",
    metadata: {
      item_name: parsed.data.item_name,
      line_number: lineNumber,
      request_number: request.request_number,
    },
    moduleKey: "material_requests",
    sourceId: request.id,
    sourceTable: "material_requests",
    summary: `Added item to ${request.request_number}`,
  }).catch(() => null);

  revalidatePath(MATERIAL_REQUEST_ROUTE);
  redirect(`${MATERIAL_REQUEST_ROUTE}?updated=item_added`);
}

// ===========================================================================
// Material-request line-item import (CSV / XLSX / PDF). Mirrors the requisition
// importer: a site team uploads a needs list and the rows become line items
// with a nominated supplier per line where given.
// ===========================================================================

const MR_IMPORT_MAX_BYTES = 2 * 1024 * 1024;
const MR_IMPORT_MAX_ROWS = 1000;

const MR_IMPORT_HEADER_ALIASES: Record<string, string> = {
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
  price: "estimated_unit_cost",
  "unit price": "estimated_unit_cost",
  rate: "estimated_unit_cost",
  supplier: "supplier",
  vendor: "supplier",
  specification: "specification",
  spec: "specification",
  note: "notes",
  notes: "notes",
};

const mrImportRowSchema = z.object({
  item_name: z.string().trim().min(2, "Item name is required.").max(160),
  unit: z.string().trim().min(1).max(40).default("each"),
  quantity: z.coerce.number().positive("Quantity must be greater than zero."),
  estimated_unit_cost: z.coerce.number().min(0).default(0),
  specification: z.string().trim().max(500).default(""),
  notes: z.string().trim().max(400).default(""),
});

export async function importMaterialRequestItemsAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  const parsedId = requestIdSchema.safeParse({ request_id: field(formData, "request_id") });
  if (!parsedId.success) {
    materialRequestError("Select a material request to import into.");
  }

  const request = await fetchMaterialRequestForMutation(parsedId.data.request_id);
  if (!request) {
    materialRequestError("Material request was not found.");
  }
  if (!canEditOpsMaterialRequest(profile.id, profile.role, request)) {
    materialRequestError("You can only edit draft or rejected material requests you manage.");
  }

  const file = formData.get("file") as File | null;
  if (!(file instanceof File) || file.size === 0) {
    materialRequestError("Choose a CSV, XLSX, or PDF file to import.");
  }
  if (file.size > MR_IMPORT_MAX_BYTES) {
    materialRequestError("Import files must be 2 MB or smaller.");
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
    materialRequestError(
      importError instanceof Error
        ? `Could not read the file: ${importError.message}`
        : "Could not read the file.",
    );
  }

  rows = rows.filter((row) => row.some((cell) => (cell ?? "").toString().trim().length > 0));
  if (rows.length < 2) {
    materialRequestError("The file needs a header row and at least one line item.");
  }

  const header = rows[0].map((cell) => MR_IMPORT_HEADER_ALIASES[cell.trim().toLowerCase()] ?? "");
  const columnIndex = (key: string) => header.indexOf(key);
  const itemIndex = columnIndex("item_name");
  const unitIndex = columnIndex("unit");
  const quantityIndex = columnIndex("quantity");
  const estimateIndex = columnIndex("estimated_unit_cost");
  const supplierIndex = columnIndex("supplier");
  const specIndex = columnIndex("specification");
  const notesIndex = columnIndex("notes");

  if (itemIndex === -1 || quantityIndex === -1) {
    materialRequestError(
      "Spreadsheet must include at least item/description and quantity columns.",
    );
  }

  const dataRows = rows.slice(1);
  if (dataRows.length > MR_IMPORT_MAX_ROWS) {
    materialRequestError(`Import is limited to ${MR_IMPORT_MAX_ROWS} rows at a time.`);
  }

  const supabase = getOpsSupabaseServiceClient();

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
        materialRequestError(supplierError.message);
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

  const startLine = await nextMaterialRequestLineNumber(request.id);
  const inserts: Array<Record<string, unknown>> = [];
  const rowErrors: string[] = [];
  let unmatchedSuppliers = 0;

  dataRows.forEach((row, index) => {
    const parsed = mrImportRowSchema.safeParse({
      item_name: row[itemIndex] ?? "",
      unit: (unitIndex !== -1 ? row[unitIndex] : "")?.trim() || "each",
      quantity: (row[quantityIndex] ?? "").trim(),
      estimated_unit_cost: (estimateIndex !== -1 ? row[estimateIndex] : "")?.trim() || "0",
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
      estimated_unit_cost: parsed.data.estimated_unit_cost,
      item_name: parsed.data.item_name,
      line_number: startLine + inserts.length,
      notes: parsed.data.notes,
      quantity: parsed.data.quantity,
      request_id: request.id,
      specification: parsed.data.specification,
      supplier_id: supplierId,
      supplier_name_freeform: supplierFreeform,
      unit: parsed.data.unit,
    });
  });

  if (inserts.length === 0) {
    materialRequestError(
      rowErrors[0] ? `No rows imported. ${rowErrors[0]}` : "No valid line items were found.",
    );
  }

  const { error: insertError } = await supabase
    .from("material_request_items")
    .insert(inserts);
  if (insertError) {
    materialRequestError(insertError.message);
  }

  await recordOpsAuditEvent({
    action: "material_request.items_imported",
    actorUserId: profile.id,
    entityId: request.id,
    entityType: "material_request",
    metadata: {
      imported: inserts.length,
      request_number: request.request_number,
      skipped: rowErrors.length,
      unmatched_suppliers: unmatchedSuppliers,
    },
    moduleKey: "material_requests",
    sourceId: request.id,
    sourceTable: "material_requests",
    summary: `Imported ${inserts.length} item(s) into ${request.request_number}`,
  }).catch(() => null);

  revalidatePath(MATERIAL_REQUEST_ROUTE);
  redirect(
    `${MATERIAL_REQUEST_ROUTE}?updated=items_imported&imported=${inserts.length}&skipped=${rowErrors.length}`,
  );
}

export async function submitMaterialRequestForApprovalAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = requestIdSchema.safeParse({
    request_id: field(formData, "request_id"),
  });

  if (!parsed.success) {
    materialRequestError(parsed.error.issues[0]?.message ?? "Select a material request.");
  }

  const request = await fetchMaterialRequestForMutation(parsed.data.request_id);

  if (!request) {
    materialRequestError("Material request was not found.");
  }

  if (!canSubmitOpsMaterialRequest(profile.id, profile.role, request)) {
    materialRequestError("You can only submit draft or rejected material requests you manage.");
  }

  const openApproval = await fetchOpenMaterialRequestApproval(request.id);

  if (openApproval) {
    redirect(`/ops/approvals/${openApproval.id}`);
  }

  const items = await fetchMaterialRequestItemsForApproval(request.id);

  if (items.length === 0) {
    materialRequestError("Add at least one line item before requesting approval.");
  }

  const estimatedTotal = items.reduce(
    (sum, item) => sum + normalizeMoney(item.estimated_total),
    0,
  );
  const steps = materialRequestApprovalSteps(request.priority, estimatedTotal);
  const now = new Date().toISOString();
  const supabase = getOpsSupabaseServiceClient();
  const { data: approval, error: approvalError } = await supabase
    .from("approval_requests")
    .insert({
      amount: estimatedTotal,
      currency_code: "ZMW",
      current_step_number: 1,
      description:
        request.description ||
        `${request.request_number} has ${items.length} material item${items.length === 1 ? "" : "s"}.`,
      module_key: "material_requests",
      priority: request.priority,
      requested_by: profile.id,
      site_id: request.site_id,
      source_id: request.id,
      source_table: "material_requests",
      status: "submitted",
      submitted_at: now,
      title: `Material request: ${request.request_number} - ${request.title}`,
    })
    .select("id")
    .single<{ id: string }>();

  if (approvalError || !approval) {
    materialRequestError(approvalError?.message ?? "Could not create approval request.");
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
    materialRequestError(stepError.message);
  }

  // Resolve which budget line(s) this request draws against (goods + the
  // site's dedicated transport line), so the linkage is visible before
  // Finance ever sees the request. Best-effort: a resolution hiccup shouldn't
  // block submission — it can be re-resolved later when pricing/cost is
  // approved.
  const budgetLines = await resolveMaterialRequestBudgetLine({
    actorUserId: profile.id,
    boqLineItemIds: items.map((item) => item.boq_line_item_id).filter((id): id is string => Boolean(id)),
    siteId: request.site_id,
  }).catch((budgetLineError: unknown) => {
    void recordOpsAuditEvent({
      action: "material_request.budget_line_resolution_failed",
      actorUserId: profile.id,
      entityId: request.id,
      entityType: "material_request",
      metadata: {
        error: budgetLineError instanceof Error ? budgetLineError.message : String(budgetLineError),
      },
      moduleKey: "material_requests",
      sourceId: request.id,
      sourceTable: "material_requests",
      summary: `Could not resolve a budget line for ${request.request_number}`,
    }).catch(() => null);
    return { budgetLineId: null, transportBudgetLineId: null };
  });

  const { data: updatedRequest, error: requestUpdateError } = await supabase
    .from("material_requests")
    .update({
      approval_request_id: approval.id,
      status: "submitted",
      submitted_at: now,
      budget_line_id: budgetLines.budgetLineId,
      transport_budget_line_id: budgetLines.transportBudgetLineId,
    })
    .eq("id", request.id)
    .in("status", ["draft", "rejected"])
    .select("id")
    .maybeSingle<{ id: string }>();

  if (requestUpdateError || !updatedRequest) {
    await (async () => {
      await supabase
        .from("approval_requests")
        .update({
          resolved_at: now,
          status: "cancelled",
        })
        .eq("id", approval.id);
    })().catch(() => null);
    materialRequestError(
      requestUpdateError?.message ??
        "This material request is no longer ready for submission. Refresh and try again.",
    );
  }

  await recordOpsAuditEvent({
    action: "material_request.approval_requested",
    actorUserId: profile.id,
    entityId: approval.id,
    entityType: "approval_request",
    metadata: {
      estimated_total: estimatedTotal,
      item_count: items.length,
      request_id: request.id,
      request_number: request.request_number,
      site_id: request.site_id,
      step_roles: steps.map((step) => step.approverRole),
    },
    moduleKey: "material_requests",
    sourceId: request.id,
    sourceTable: "material_requests",
    summary: `Requested approval for ${request.request_number}`,
  }).catch(() => null);

  // Resolve approvers using the workflow fallback chain so a missing role
  // (e.g. Projects Manager seat unfilled) doesn't drop the notification.
  const recipientRoles = materialRequestApprovalRecipientRoles(steps);
  const approvers = await fanoutToOpsRoles(recipientRoles, {
    excludeUserIds: [profile.id],
  });

  await Promise.all(
    approvers.map((approver) =>
      queueOpsNotification({
        actionHref: `/ops/approvals/${approval.id}`,
        body: `${profile.full_name} requested approval for ${request.request_number}.`,
        idempotencyKey: `material-request-approval:${approval.id}:${approver.id}`,
        moduleKey: "material_requests",
        recipientId: approver.id,
        sourceId: approval.id,
        sourceTable: "approval_requests",
        title: "Material request approval",
      }).catch(() => null),
    ),
  );

  trackOpsEvent("ops.material_request.submitted", {
    request_number: request.request_number,
  });

  revalidatePath(MATERIAL_REQUEST_ROUTE);
  revalidatePath("/ops/approvals");
  revalidatePath("/ops/notifications");
  redirect(`/ops/approvals/${approval.id}?created=material_request_approval`);
}

// =============================================================================
// H3: Procurement attaches actual supplier prices to a request that is in
// `pricing_pending` (operations has approved). On success the request moves to
// `priced` and Finance is notified to approve the cost.
// =============================================================================

const pricingItemSchema = z.object({
  item_id: z.string().uuid("Select a line item."),
  actual_unit_cost: z.coerce
    .number()
    .min(0, "Actual unit cost cannot be negative.")
    .max(1_000_000_000, "Actual unit cost looks unrealistic."),
});

export async function attachMaterialRequestPricingAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canAttachMaterialRequestPricing(profile.role)) {
    materialRequestError(
      "Only Procurement and leadership can attach supplier prices to a material request.",
    );
  }

  const idParsed = requestIdSchema.safeParse({ request_id: field(formData, "request_id") });
  if (!idParsed.success) {
    materialRequestError(idParsed.error.issues[0]?.message ?? "Select a material request.");
  }

  const request = await fetchMaterialRequestForMutation(idParsed.data.request_id);
  if (!request) {
    materialRequestError("Material request was not found.");
  }

  if (request.status !== "pricing_pending" && request.status !== "priced") {
    materialRequestError(
      "Supplier prices can only be attached once Operations has approved the request.",
    );
  }

  // Collect every `actual_unit_cost::<itemId>` field from the form. We don't
  // require every line — a partial update is allowed so procurement can save
  // progress — but we need at least one valid entry.
  const updates: { item_id: string; actual_unit_cost: number }[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("actual_unit_cost::")) {
      continue;
    }
    const itemId = key.slice("actual_unit_cost::".length);
    const parsed = pricingItemSchema.safeParse({ item_id: itemId, actual_unit_cost: value });
    if (!parsed.success) {
      materialRequestError(parsed.error.issues[0]?.message ?? "Check supplier prices.");
    }
    updates.push(parsed.data);
  }

  if (updates.length === 0) {
    materialRequestError("Enter at least one supplier price before saving.");
  }

  const supabase = getOpsSupabaseServiceClient();

  // Confirm every item belongs to this request — defence against tampered form ids.
  const itemIds = updates.map((u) => u.item_id);
  const { data: lineRows, error: lineFetchError } = await supabase
    .from("material_request_items")
    .select("id, request_id")
    .in("id", itemIds);

  if (lineFetchError) {
    materialRequestError(lineFetchError.message);
  }

  const valid = (lineRows ?? []) as Array<{ id: string; request_id: string }>;
  if (valid.length !== updates.length || valid.some((row) => row.request_id !== request.id)) {
    materialRequestError("One or more line items don't belong to this request.");
  }

  // Apply updates serially (small N — at most a few line items per request).
  // Attaching the supplier price REPLACES the engineer estimate on that line, so
  // the request total, the line "Estimate" column, the finance cost approval, and
  // any downstream PO all reflect the real price rather than the original guess.
  // (estimated_total is a generated column — quantity * estimated_unit_cost — so
  // it follows estimated_unit_cost; the trigger keeps actual_total in step too.)
  for (const update of updates) {
    const { error: updErr } = await supabase
      .from("material_request_items")
      .update({
        actual_unit_cost: update.actual_unit_cost,
        estimated_unit_cost: update.actual_unit_cost,
      })
      .eq("id", update.item_id);
    if (updErr) {
      materialRequestError(updErr.message);
    }
  }

  // Re-read actual line totals to compute the priced total for the finance
  // notification. The request's estimate/actual totals are DERIVED from the line
  // items at read time (material_requests has no stored total column), so
  // overwriting the line estimates above is enough — there is no header total to
  // write, and the displayed request estimate updates on the next read.
  const { data: pricedRows } = await supabase
    .from("material_request_items")
    .select("actual_total")
    .eq("request_id", request.id);
  const pricedTotal = ((pricedRows ?? []) as Array<{ actual_total: number | string }>).reduce(
    (sum, row) => sum + normalizeMoney(row.actual_total),
    0,
  );

  // Move the request to `priced` so Finance can approve the cost.
  const nowIso = new Date().toISOString();
  const { error: stateError } = await supabase
    .from("material_requests")
    .update({ status: "priced", priced_at: nowIso, priced_by: profile.id })
    .eq("id", request.id);
  if (stateError) {
    materialRequestError(stateError.message);
  }

  await recordOpsAuditEvent({
    action: "material_request.priced",
    actorUserId: profile.id,
    entityId: request.id,
    entityType: "material_request",
    metadata: {
      request_number: request.request_number,
      priced_total_zmw: pricedTotal,
      lines_updated: updates.length,
    },
    moduleKey: "material_requests",
    sourceId: request.id,
    sourceTable: "material_requests",
    summary: `Procurement attached supplier prices to ${request.request_number}`,
  }).catch(() => null);

  // Notify Finance to approve the cost, plus the requester for awareness.
  const financeRecipients = await fanoutToOpsRoles(["finance_manager", "accountant"], {
    excludeUserIds: [profile.id],
  });
  await Promise.all(
    financeRecipients.map((recipient) =>
      queueOpsNotification({
        actionHref: `${MATERIAL_REQUEST_ROUTE}#mr-${request.id}`,
        body: `Procurement priced ${request.request_number} at ZMW ${pricedTotal.toLocaleString("en-ZM")}. Please approve the cost.`,
        idempotencyKey: `material-request-priced:${request.id}:${recipient.id}`,
        moduleKey: "material_requests",
        recipientId: recipient.id,
        sourceId: request.id,
        sourceTable: "material_requests",
        title: `Approve cost: ${request.request_number}`,
      }).catch(() => null),
    ),
  );

  if (request.requested_by && request.requested_by !== profile.id) {
    await queueOpsNotification({
      actionHref: `${MATERIAL_REQUEST_ROUTE}#mr-${request.id}`,
      body: `${profile.full_name} attached supplier prices to your request ${request.request_number}. Awaiting Finance approval of the cost.`,
      idempotencyKey: `material-request-priced-requester:${request.id}`,
      moduleKey: "material_requests",
      recipientId: request.requested_by,
      sourceId: request.id,
      sourceTable: "material_requests",
      title: `Priced: ${request.request_number}`,
    }).catch(() => null);
  }

  revalidatePath(MATERIAL_REQUEST_ROUTE);
  revalidatePath("/ops/notifications");
  redirect(`${MATERIAL_REQUEST_ROUTE}?updated=priced#mr-${request.id}`);
}

// =============================================================================
// H3: Finance approves the cost of a request that has been priced by
// procurement. On success the request moves to `approved` (the legacy terminal
// state, kept so the existing approved → RFQ/PO downstream still works).
// =============================================================================

const costDecisionSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  comment: z.string().trim().max(800).default(""),
});

export async function decideMaterialRequestCostAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  const idParsed = requestIdSchema.safeParse({ request_id: field(formData, "request_id") });
  if (!idParsed.success) {
    materialRequestError(idParsed.error.issues[0]?.message ?? "Select a material request.");
  }

  const decisionParsed = costDecisionSchema.safeParse({
    decision: field(formData, "decision"),
    comment: field(formData, "comment"),
  });
  if (!decisionParsed.success) {
    materialRequestError(
      decisionParsed.error.issues[0]?.message ?? "Choose approve or reject.",
    );
  }

  const request = await fetchMaterialRequestForMutation(idParsed.data.request_id);
  if (!request) {
    materialRequestError("Material request was not found.");
  }

  // Two decision stages share this action: Finance acts on `priced`; for
  // IT-scoped requests the MD then acts on `md_review` (final gate).
  if (request.status === "priced") {
    if (!canApproveMaterialRequestCost(profile.role)) {
      materialRequestError(
        "Only Finance and leadership can approve or reject the cost of a priced request.",
      );
    }
  } else if (request.status === "md_review") {
    if (!canApproveMaterialRequestMdReview(profile.role)) {
      materialRequestError(
        "Only the Managing Director can decide an IT request awaiting MD approval.",
      );
    }
  } else {
    materialRequestError(
      "This request is not awaiting a cost decision (Finance acts on priced requests; the MD acts on IT requests in MD review).",
    );
  }

  if (decisionParsed.data.decision === "reject" && decisionParsed.data.comment.length < 4) {
    materialRequestError(
      "Add a brief reason when rejecting a cost so the requester knows what to fix.",
    );
  }

  const supabase = getOpsSupabaseServiceClient();
  const nowIso = new Date().toISOString();
  const decisionIsApprove = decisionParsed.data.decision === "approve";
  // Finance approval of an IT request hands over to the MD instead of closing
  // the approval chain.
  const movesToMdReview =
    decisionIsApprove && request.status === "priced" && request.scope === "it";
  const isFinalApproval = decisionIsApprove && !movesToMdReview;

  const update: {
    status: OpsMaterialRequestStatus;
    approved_at?: string | null;
    rejected_at?: string | null;
  } = {
    status: decisionIsApprove ? (movesToMdReview ? "md_review" : "approved") : "rejected",
  };
  if (isFinalApproval) {
    update.approved_at = nowIso;
    update.rejected_at = null;
  } else if (!decisionIsApprove) {
    update.rejected_at = nowIso;
  }

  const { error: stateError } = await supabase
    .from("material_requests")
    .update(update)
    .eq("id", request.id);
  if (stateError) {
    materialRequestError(stateError.message);
  }

  // Final approval is the moment the spend counts against the project
  // budget (committed), mirroring Payment Requests' approve → committed
  // transition. For IT requests that moment is the MD's approval, not
  // Finance's. Best-effort: a ledger hiccup never blocks the approval.
  let overBudget = false;
  if (isFinalApproval) {
    const { data: itemRows } = await supabase
      .from("material_request_items")
      .select("actual_total")
      .eq("request_id", request.id);
    const goodsAmount = ((itemRows ?? []) as Array<{ actual_total: number | string }>).reduce(
      (sum, row) => sum + normalizeMoney(row.actual_total),
      0,
    );

    await upsertMaterialRequestCostEntries({
      actorUserId: profile.id,
      goodsAmount,
      request,
      status: "committed",
    }).catch((costEntryError: unknown) =>
      recordOpsAuditEvent({
        action: "material_request.cost_entry_sync_failed",
        actorUserId: profile.id,
        entityId: request.id,
        entityType: "material_request",
        metadata: {
          error:
            costEntryError instanceof Error ? costEntryError.message : String(costEntryError),
        },
        moduleKey: "material_requests",
        sourceId: request.id,
        sourceTable: "material_requests",
        summary: `Could not record the budget ledger entry for ${request.request_number}`,
      }).catch(() => null),
    );

    if (request.budget_line_id) {
      const { data: budgetLine } = await supabase
        .from("project_budget_lines")
        .select("budgeted_amount")
        .eq("id", request.budget_line_id)
        .maybeSingle<{ budgeted_amount: number | string }>();
      const { data: committedRows } = await supabase
        .from("project_cost_entries")
        .select("amount")
        .eq("budget_line_id", request.budget_line_id)
        .in("status", ["committed", "posted"]);
      const committedTotal = ((committedRows ?? []) as Array<{ amount: number | string }>).reduce(
        (sum, row) => sum + normalizeMoney(row.amount),
        0,
      );
      overBudget = committedTotal > normalizeMoney(budgetLine?.budgeted_amount);
    }
  }

  const stageLabel = request.status === "md_review" ? "MD" : "Finance";
  await recordOpsAuditEvent({
    action: decisionIsApprove
      ? movesToMdReview
        ? "material_request.cost_approved_md_pending"
        : "material_request.cost_approved"
      : "material_request.cost_rejected",
    actorUserId: profile.id,
    entityId: request.id,
    entityType: "material_request",
    metadata: {
      request_number: request.request_number,
      decision: decisionParsed.data.decision,
      comment: decisionParsed.data.comment,
      over_budget: overBudget,
      stage: stageLabel,
    },
    moduleKey: "material_requests",
    sourceId: request.id,
    sourceTable: "material_requests",
    summary: decisionIsApprove
      ? movesToMdReview
        ? `Finance approved cost for ${request.request_number} — awaiting MD approval`
        : `${stageLabel} approved cost for ${request.request_number}${overBudget ? " (over budget)" : ""}`
      : `${stageLabel} rejected cost for ${request.request_number}: ${decisionParsed.data.comment}`,
  }).catch(() => null);

  // Notify the requester with the decision and reason.
  if (request.requested_by && request.requested_by !== profile.id) {
    await queueOpsNotification({
      actionHref: `${MATERIAL_REQUEST_ROUTE}#mr-${request.id}`,
      body: decisionIsApprove
        ? movesToMdReview
          ? `${profile.full_name} approved the cost of ${request.request_number}. It now awaits the Managing Director's approval.`
          : `${profile.full_name} approved the cost of ${request.request_number}. Procurement can now raise the RFQ / Purchase Order.`
        : `${profile.full_name} rejected the cost of ${request.request_number}. Reason: ${decisionParsed.data.comment}`,
      idempotencyKey: `material-request-cost-decision:${request.id}:${request.status}:${decisionParsed.data.decision}`,
      moduleKey: "material_requests",
      recipientId: request.requested_by,
      sourceId: request.id,
      sourceTable: "material_requests",
      title: decisionIsApprove
        ? movesToMdReview
          ? `Awaiting MD: ${request.request_number}`
          : `Approved: ${request.request_number}`
        : `Rejected: ${request.request_number}`,
    }).catch(() => null);
  }

  if (movesToMdReview) {
    // Hand the IT request to the Managing Director for the final gate.
    const mdRecipients = await fanoutToOpsRoles(["managing_director"], {
      excludeUserIds: [profile.id],
    });
    await Promise.all(
      mdRecipients.map((recipient) =>
        queueOpsNotification({
          actionHref: `${MATERIAL_REQUEST_ROUTE}?status=md_review#mr-${request.id}`,
          body: `Finance approved the cost of IT request ${request.request_number} (${request.title}). Your approval is the final gate before Procurement orders.`,
          idempotencyKey: `material-request-md-review:${request.id}:${recipient.id}`,
          moduleKey: "material_requests",
          recipientId: recipient.id,
          sourceId: request.id,
          sourceTable: "material_requests",
          title: `MD approval needed: ${request.request_number}`,
        }).catch(() => null),
      ),
    );
  } else {
    // Notify procurement so they can raise the RFQ/PO (on approval) or fix
    // prices and resubmit (on rejection).
    const procurementRecipients = await fanoutToOpsRoles(
      ["procurement_manager", "procurement"],
      { excludeUserIds: [profile.id] },
    );
    await Promise.all(
      procurementRecipients.map((recipient) =>
        queueOpsNotification({
          actionHref: decisionIsApprove
            ? "/ops/rfq-po"
            : `${MATERIAL_REQUEST_ROUTE}#mr-${request.id}`,
          body: decisionIsApprove
            ? `Cost approved for ${request.request_number} by ${profile.full_name}. Raise the RFQ / PO.`
            : `${stageLabel} rejected the cost on ${request.request_number}. Reason: ${decisionParsed.data.comment}`,
          idempotencyKey: `material-request-cost-procurement:${request.id}:${request.status}:${decisionParsed.data.decision}:${recipient.id}`,
          moduleKey: "material_requests",
          recipientId: recipient.id,
          sourceId: request.id,
          sourceTable: "material_requests",
          title: decisionIsApprove
            ? `Order: ${request.request_number}`
            : `Re-price: ${request.request_number}`,
        }).catch(() => null),
      ),
    );
  }

  revalidatePath(MATERIAL_REQUEST_ROUTE);
  revalidatePath("/ops/notifications");
  revalidatePath("/ops");
  revalidatePath("/ops/project-budgets");
  const updatedFlag = decisionIsApprove
    ? movesToMdReview
      ? "cost_approved_md_pending"
      : overBudget
        ? "cost_approved_over_budget"
        : "cost_approved"
    : "cost_rejected";
  redirect(`${MATERIAL_REQUEST_ROUTE}?updated=${updatedFlag}#mr-${request.id}`);
}

// =============================================================================
// Transport cost: Procurement records its OWN internal cost of moving around to
// source / collect the materials. It is kept separate from goods totals and is
// never printed on either PDF (see migration part 2).
// =============================================================================

const transportSchema = requestIdSchema.extend({
  transport_cost: z.coerce
    .number()
    .min(0, "Transport cost cannot be negative.")
    .max(1_000_000_000, "Transport cost looks unrealistic."),
});

export async function setMaterialRequestTransportCostAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canSetMaterialRequestTransportCost(profile.role)) {
    materialRequestError("Only Procurement and leadership can record transport cost.");
  }

  const parsed = transportSchema.safeParse({
    request_id: field(formData, "request_id"),
    transport_cost: field(formData, "transport_cost") || "0",
  });
  if (!parsed.success) {
    materialRequestError(parsed.error.issues[0]?.message ?? "Check the transport cost.");
  }

  const request = await fetchMaterialRequestForMutation(parsed.data.request_id);
  if (!request) {
    materialRequestError("Material request was not found.");
  }

  // Procurement sources materials from pricing through to delivery, so transport
  // can be recorded any time the request is in that window.
  const transportEditable: OpsMaterialRequestStatus[] = [
    "pricing_pending",
    "priced",
    "md_review",
    "approved",
    "ordered",
  ];
  if (!transportEditable.includes(request.status)) {
    materialRequestError(
      "Transport cost can only be recorded while the request is with Procurement (priced through ordered).",
    );
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("material_requests")
    .update({ transport_cost: parsed.data.transport_cost })
    .eq("id", request.id);
  if (error) {
    materialRequestError(error.message);
  }

  await recordOpsAuditEvent({
    action: "material_request.transport_cost_set",
    actorUserId: profile.id,
    entityId: request.id,
    entityType: "material_request",
    metadata: {
      request_number: request.request_number,
      transport_cost_zmw: parsed.data.transport_cost,
    },
    moduleKey: "material_requests",
    sourceId: request.id,
    sourceTable: "material_requests",
    summary: `Recorded transport cost on ${request.request_number}: ZMW ${parsed.data.transport_cost.toLocaleString("en-ZM")}`,
  }).catch(() => null);

  revalidatePath(MATERIAL_REQUEST_ROUTE);
  redirect(`${MATERIAL_REQUEST_ROUTE}?updated=transport_cost#mr-${request.id}`);
}

// =============================================================================
// Delivery confirmation (Option A): the site requester confirms ordered
// materials arrived and picks the delivery date. "Received in full" closes the
// request outright; a partial / with-issues delivery rests in `delivered` until
// the Goods Received Note flow (or a follow-up) closes it.
// =============================================================================

const deliverySchema = requestIdSchema.extend({
  delivered_on: z.string().trim().default(""),
  received_in_full: z.boolean().default(false),
  notes: z.string().trim().max(800).default(""),
});

export async function confirmMaterialRequestDeliveryAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  const parsed = deliverySchema.safeParse({
    request_id: field(formData, "request_id"),
    delivered_on: field(formData, "delivered_on"),
    received_in_full: field(formData, "received_in_full") === "on",
    notes: field(formData, "notes"),
  });
  if (!parsed.success) {
    materialRequestError(parsed.error.issues[0]?.message ?? "Check the delivery details.");
  }

  const request = await fetchMaterialRequestForMutation(parsed.data.request_id);
  if (!request) {
    materialRequestError("Material request was not found.");
  }

  if (!canConfirmMaterialRequestDelivery(profile.id, profile.role, request)) {
    materialRequestError(
      "Only the requester (or an operations manager) can confirm delivery, and only once the request has been ordered.",
    );
  }

  // normalizeDateInput validates the YYYY-MM-DD shape (and redirects on a bad
  // one). Store at local noon so the displayed date can't slip a day on TZ math.
  const deliveredAt = parsed.data.delivered_on
    ? `${normalizeDateInput(parsed.data.delivered_on)}T12:00:00+02:00`
    : new Date().toISOString();
  const nowIso = new Date().toISOString();
  const receivedInFull = parsed.data.received_in_full;

  const update: {
    status: OpsMaterialRequestStatus;
    delivered_at: string;
    delivered_by: string;
    delivery_notes: string;
    closed_at?: string;
  } = {
    status: receivedInFull ? "closed" : "delivered",
    delivered_at: deliveredAt,
    delivered_by: profile.id,
    delivery_notes: parsed.data.notes,
  };
  if (receivedInFull) {
    update.closed_at = nowIso;
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data: updated, error } = await supabase
    .from("material_requests")
    .update(update)
    .eq("id", request.id)
    .eq("status", "ordered")
    .select("id")
    .maybeSingle<{ id: string }>();
  if (error || !updated) {
    materialRequestError(
      error?.message ??
        "This request is no longer awaiting delivery confirmation. Refresh and try again.",
    );
  }

  // Closing is the request's true completion milestone — the committed
  // budget-ledger entries recorded at Finance approval become posted here,
  // mirroring Payment Requests' paid → posted transition. Best-effort.
  if (receivedInFull) {
    const { data: itemRows } = await supabase
      .from("material_request_items")
      .select("actual_total")
      .eq("request_id", request.id);
    const goodsAmount = ((itemRows ?? []) as Array<{ actual_total: number | string }>).reduce(
      (sum, row) => sum + normalizeMoney(row.actual_total),
      0,
    );

    await upsertMaterialRequestCostEntries({
      actorUserId: profile.id,
      goodsAmount,
      request,
      status: "posted",
    }).catch((costEntryError: unknown) =>
      recordOpsAuditEvent({
        action: "material_request.cost_entry_sync_failed",
        actorUserId: profile.id,
        entityId: request.id,
        entityType: "material_request",
        metadata: {
          error:
            costEntryError instanceof Error ? costEntryError.message : String(costEntryError),
        },
        moduleKey: "material_requests",
        sourceId: request.id,
        sourceTable: "material_requests",
        summary: `Could not post the budget ledger entry for ${request.request_number}`,
      }).catch(() => null),
    );
  }

  await recordOpsAuditEvent({
    action: receivedInFull
      ? "material_request.delivered_closed"
      : "material_request.delivered",
    actorUserId: profile.id,
    entityId: request.id,
    entityType: "material_request",
    metadata: {
      request_number: request.request_number,
      delivered_at: deliveredAt,
      received_in_full: receivedInFull,
      notes: parsed.data.notes,
    },
    moduleKey: "material_requests",
    sourceId: request.id,
    sourceTable: "material_requests",
    summary: receivedInFull
      ? `${profile.full_name} confirmed ${request.request_number} delivered in full and closed it`
      : `${profile.full_name} confirmed delivery on ${request.request_number}`,
  }).catch(() => null);

  // Let Procurement and Finance know the order landed.
  const recipients = await fanoutToOpsRoles(
    ["procurement_manager", "procurement", "finance_manager", "accountant"],
    { excludeUserIds: [profile.id] },
  );
  await Promise.all(
    recipients.map((recipient) =>
      queueOpsNotification({
        actionHref: `${MATERIAL_REQUEST_ROUTE}#mr-${request.id}`,
        body: receivedInFull
          ? `${profile.full_name} confirmed ${request.request_number} was delivered in full.`
          : `${profile.full_name} confirmed a (partial) delivery on ${request.request_number}.`,
        idempotencyKey: `material-request-delivered:${request.id}:${recipient.id}`,
        moduleKey: "material_requests",
        recipientId: recipient.id,
        sourceId: request.id,
        sourceTable: "material_requests",
        title: `Delivered: ${request.request_number}`,
      }).catch(() => null),
    ),
  );

  revalidatePath(MATERIAL_REQUEST_ROUTE);
  revalidatePath("/ops/notifications");
  revalidatePath("/ops/project-budgets");
  redirect(
    `${MATERIAL_REQUEST_ROUTE}?updated=${receivedInFull ? "delivered_closed" : "delivered"}#mr-${request.id}`,
  );
}

// =============================================================================
// I5: Edit / cancel / archive / delete actions for material requests.
// =============================================================================

const updateRequestHeaderSchema = requestIdSchema.extend({
  title: z.string().trim().min(2, "Request title is required.").max(160),
  description: z.string().trim().max(800).default(""),
  priority: z.enum(["low", "normal", "high", "urgent"]),
  needed_by: z.string().trim().default(""),
});

const updateItemSchema = z.object({
  item_id: z.string().uuid("Select a line item."),
  item_name: z.string().trim().min(2, "Item name is required.").max(160),
  unit: z.string().trim().min(1, "Unit is required.").max(40),
  quantity: z.coerce.number().positive("Quantity must be greater than zero."),
  estimated_unit_cost: z.coerce.number().min(0, "Estimated unit cost cannot be negative."),
  specification: z.string().trim().max(500).default(""),
  notes: z.string().trim().max(400).default(""),
  supplier_id: z
    .string()
    .trim()
    .default("")
    .transform((value) => (value.length > 0 ? value : null)),
  supplier_name_freeform: z.string().trim().max(160).default(""),
});

const itemIdSchema = z.object({
  item_id: z.string().uuid("Select a line item."),
});

const cancelSchema = requestIdSchema.extend({
  reason: z.string().trim().max(800).default(""),
});

export async function updateMaterialRequestHeaderAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  const parsed = updateRequestHeaderSchema.safeParse({
    request_id: field(formData, "request_id"),
    title: field(formData, "title"),
    description: field(formData, "description"),
    priority: field(formData, "priority"),
    needed_by: field(formData, "needed_by"),
  });
  if (!parsed.success) {
    materialRequestError(parsed.error.issues[0]?.message ?? "Check the request details.");
  }

  const request = await fetchMaterialRequestForMutation(parsed.data.request_id);
  if (!request) {
    materialRequestError("Material request was not found.");
  }
  if (!canEditOpsMaterialRequest(profile.id, profile.role, request)) {
    materialRequestError("This material request can no longer be edited.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("material_requests")
    .update({
      title: parsed.data.title,
      description: parsed.data.description,
      priority: parsed.data.priority,
      needed_by: normalizeDateInput(parsed.data.needed_by),
    })
    .eq("id", parsed.data.request_id);
  if (error) {
    materialRequestError(error.message);
  }

  await recordOpsAuditEvent({
    action: "material_request.updated",
    actorUserId: profile.id,
    entityId: parsed.data.request_id,
    entityType: "material_request",
    moduleKey: "material_requests",
    sourceId: parsed.data.request_id,
    sourceTable: "material_requests",
    summary: `Updated material request ${request.request_number}`,
  }).catch(() => null);

  revalidatePath(MATERIAL_REQUEST_ROUTE);
  redirect(`${MATERIAL_REQUEST_ROUTE}?updated=request#mr-${parsed.data.request_id}`);
}

export async function updateMaterialRequestItemAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  const parsed = updateItemSchema.safeParse({
    item_id: field(formData, "item_id"),
    item_name: field(formData, "item_name"),
    unit: field(formData, "unit"),
    quantity: field(formData, "quantity"),
    estimated_unit_cost: field(formData, "estimated_unit_cost"),
    specification: field(formData, "specification"),
    notes: field(formData, "notes"),
    supplier_id: field(formData, "supplier_id"),
    supplier_name_freeform: field(formData, "supplier_name_freeform"),
  });
  if (!parsed.success) {
    materialRequestError(parsed.error.issues[0]?.message ?? "Check the line item.");
  }

  // Find which request this item belongs to so we can check edit permissions.
  const supabase = getOpsSupabaseServiceClient();
  const { data: itemRow } = await supabase
    .from("material_request_items")
    .select("request_id")
    .eq("id", parsed.data.item_id)
    .maybeSingle<{ request_id: string }>();
  if (!itemRow) {
    materialRequestError("Line item was not found.");
  }
  const request = await fetchMaterialRequestForMutation(itemRow.request_id);
  if (!request) {
    materialRequestError("Material request was not found.");
  }
  if (!canEditOpsMaterialRequest(profile.id, profile.role, request)) {
    materialRequestError("Lines on this request can no longer be edited.");
  }

  const { error } = await supabase
    .from("material_request_items")
    .update({
      item_name: parsed.data.item_name,
      unit: parsed.data.unit,
      quantity: parsed.data.quantity,
      estimated_unit_cost: parsed.data.estimated_unit_cost,
      specification: parsed.data.specification,
      notes: parsed.data.notes,
      supplier_id: parsed.data.supplier_id,
      supplier_name_freeform: parsed.data.supplier_name_freeform || null,
    })
    .eq("id", parsed.data.item_id);
  if (error) {
    materialRequestError(error.message);
  }

  await recordOpsAuditEvent({
    action: "material_request.item_updated",
    actorUserId: profile.id,
    entityId: parsed.data.item_id,
    entityType: "material_request_item",
    moduleKey: "material_requests",
    sourceId: itemRow.request_id,
    sourceTable: "material_requests",
    summary: `Updated line item on ${request.request_number}`,
  }).catch(() => null);

  revalidatePath(MATERIAL_REQUEST_ROUTE);
  redirect(`${MATERIAL_REQUEST_ROUTE}?updated=item#mr-${itemRow.request_id}`);
}

export async function deleteMaterialRequestItemAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  const parsed = itemIdSchema.safeParse({ item_id: field(formData, "item_id") });
  if (!parsed.success) {
    materialRequestError(parsed.error.issues[0]?.message ?? "Select a line item.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data: itemRow } = await supabase
    .from("material_request_items")
    .select("request_id")
    .eq("id", parsed.data.item_id)
    .maybeSingle<{ request_id: string }>();
  if (!itemRow) {
    materialRequestError("Line item was not found.");
  }
  const request = await fetchMaterialRequestForMutation(itemRow.request_id);
  if (!request) {
    materialRequestError("Material request was not found.");
  }
  if (!canEditOpsMaterialRequest(profile.id, profile.role, request)) {
    materialRequestError("Lines on this request can no longer be removed.");
  }

  const { error } = await supabase
    .from("material_request_items")
    .delete()
    .eq("id", parsed.data.item_id);
  if (error) {
    materialRequestError(error.message);
  }

  await recordOpsAuditEvent({
    action: "material_request.item_deleted",
    actorUserId: profile.id,
    entityId: parsed.data.item_id,
    entityType: "material_request_item",
    moduleKey: "material_requests",
    sourceId: itemRow.request_id,
    sourceTable: "material_requests",
    summary: `Deleted line item from ${request.request_number}`,
  }).catch(() => null);

  revalidatePath(MATERIAL_REQUEST_ROUTE);
  redirect(`${MATERIAL_REQUEST_ROUTE}?updated=item_deleted#mr-${itemRow.request_id}`);
}

export async function cancelMaterialRequestAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  const parsed = cancelSchema.safeParse({
    request_id: field(formData, "request_id"),
    reason: field(formData, "reason"),
  });
  if (!parsed.success) {
    materialRequestError(parsed.error.issues[0]?.message ?? "Select a request to cancel.");
  }

  const request = await fetchMaterialRequestForMutation(parsed.data.request_id);
  if (!request) {
    materialRequestError("Material request was not found.");
  }
  if (!canCancelOpsMaterialRequest(profile.id, profile.role, request)) {
    materialRequestError(
      "This material request can no longer be cancelled — it has already been ordered or closed.",
    );
  }

  const supabase = getOpsSupabaseServiceClient();
  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from("material_requests")
    .update({
      status: "cancelled",
      cancelled_at: nowIso,
      cancelled_by: profile.id,
    })
    .eq("id", parsed.data.request_id);
  if (error) {
    materialRequestError(error.message);
  }

  // If Finance had already committed a budget-ledger entry (request was
  // "approved" before being cancelled), release it — best-effort, only
  // meaningful when a prior entry exists (upsert is a no-op cost-wise
  // otherwise since goodsAmount would just write a cancelled zero-ish row,
  // which is harmless but we only bother when there's something to release).
  if (request.budget_line_id) {
    const { data: itemRows } = await supabase
      .from("material_request_items")
      .select("actual_total")
      .eq("request_id", request.id);
    const goodsAmount = ((itemRows ?? []) as Array<{ actual_total: number | string }>).reduce(
      (sum, row) => sum + normalizeMoney(row.actual_total),
      0,
    );

    await upsertMaterialRequestCostEntries({
      actorUserId: profile.id,
      goodsAmount,
      request,
      status: "cancelled",
    }).catch(() => null);
  }

  await recordOpsAuditEvent({
    action: "material_request.cancelled",
    actorUserId: profile.id,
    entityId: parsed.data.request_id,
    entityType: "material_request",
    metadata: { reason: parsed.data.reason },
    moduleKey: "material_requests",
    sourceId: parsed.data.request_id,
    sourceTable: "material_requests",
    summary: `Cancelled material request ${request.request_number}${
      parsed.data.reason ? `: ${parsed.data.reason}` : ""
    }`,
  }).catch(() => null);

  // Tell the requester (if cancelled by someone else) so they know.
  if (request.requested_by && request.requested_by !== profile.id) {
    await queueOpsNotification({
      actionHref: `${MATERIAL_REQUEST_ROUTE}#mr-${request.id}`,
      body: `${profile.full_name} cancelled your material request ${request.request_number}.${
        parsed.data.reason ? ` Reason: ${parsed.data.reason}` : ""
      }`,
      idempotencyKey: `material-request-cancelled:${request.id}`,
      moduleKey: "material_requests",
      recipientId: request.requested_by,
      sourceId: request.id,
      sourceTable: "material_requests",
      title: `Cancelled: ${request.request_number}`,
    }).catch(() => null);
  }

  revalidatePath(MATERIAL_REQUEST_ROUTE);
  redirect(`${MATERIAL_REQUEST_ROUTE}?updated=cancelled#mr-${parsed.data.request_id}`);
}

export async function archiveMaterialRequestAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  const parsed = requestIdSchema.safeParse({ request_id: field(formData, "request_id") });
  if (!parsed.success) {
    materialRequestError(parsed.error.issues[0]?.message ?? "Select a request.");
  }

  const request = await fetchMaterialRequestForMutation(parsed.data.request_id);
  if (!request) {
    materialRequestError("Material request was not found.");
  }
  if (!canArchiveOpsMaterialRequest(profile.role, request)) {
    materialRequestError(
      "Only Operations / Projects Manager / leadership can archive a material request, and only after it is closed, rejected, or cancelled.",
    );
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("material_requests")
    .update({ archived_at: new Date().toISOString(), archived_by: profile.id })
    .eq("id", parsed.data.request_id);
  if (error) {
    materialRequestError(error.message);
  }

  await recordOpsAuditEvent({
    action: "material_request.archived",
    actorUserId: profile.id,
    entityId: parsed.data.request_id,
    entityType: "material_request",
    moduleKey: "material_requests",
    sourceId: parsed.data.request_id,
    sourceTable: "material_requests",
    summary: `Archived material request ${request.request_number}`,
  }).catch(() => null);

  revalidatePath(MATERIAL_REQUEST_ROUTE);
  redirect(`${MATERIAL_REQUEST_ROUTE}?updated=archived#mr-${parsed.data.request_id}`);
}

export async function deleteMaterialRequestAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canDeleteOpsMaterialRequest(profile.role)) {
    materialRequestError("Only the Developer can permanently delete a material request.");
  }

  const parsed = requestIdSchema.safeParse({ request_id: field(formData, "request_id") });
  if (!parsed.success) {
    materialRequestError(parsed.error.issues[0]?.message ?? "Select a request.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("material_requests")
    .delete()
    .eq("id", parsed.data.request_id);
  if (error) {
    materialRequestError(error.message);
  }

  await recordOpsAuditEvent({
    action: "material_request.deleted",
    actorUserId: profile.id,
    entityId: parsed.data.request_id,
    entityType: "material_request",
    moduleKey: "material_requests",
    sourceId: parsed.data.request_id,
    sourceTable: "material_requests",
    summary: `Permanently deleted material request`,
  }).catch(() => null);

  revalidatePath(MATERIAL_REQUEST_ROUTE);
  redirect(`${MATERIAL_REQUEST_ROUTE}?updated=deleted`);
}
