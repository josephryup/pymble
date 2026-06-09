"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeOpsActionErrorMessage } from "@/lib/ops/action-errors";
import { requireOpsUser } from "@/lib/ops/auth";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import {
  canCreateOpsMaterialRequest,
  canEditOpsMaterialRequest,
  canSubmitOpsMaterialRequest,
  materialRequestApprovalRecipientRoles,
  materialRequestApprovalSteps,
} from "@/lib/ops/material-request-permissions";
import { queueOpsNotification } from "@/lib/ops/notifications";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type { OpsMaterialRequestStatus, OpsPriority } from "@/lib/ops/types";

const MATERIAL_REQUEST_ROUTE = "/ops/material-requests";

const headerSchema = z.object({
  description: z.string().trim().max(800).default(""),
  needed_by: z.string().trim().default(""),
  priority: z.enum(["low", "normal", "high", "urgent"]),
  site_id: z.string().uuid("Select a site."),
  title: z.string().trim().min(2, "Request title is required.").max(160),
});

const itemSchema = z.object({
  estimated_unit_cost: z.coerce.number().min(0, "Estimated unit cost cannot be negative."),
  item_name: z.string().trim().min(2, "Item name is required.").max(160),
  notes: z.string().trim().max(400).default(""),
  quantity: z.coerce.number().positive("Quantity must be greater than zero."),
  specification: z.string().trim().max(500).default(""),
  unit: z.string().trim().min(1, "Unit is required.").max(40),
});

const createRequestSchema = headerSchema.extend(itemSchema.shape);

const requestIdSchema = z.object({
  request_id: z.string().uuid("Select a material request."),
});

type MaterialRequestForMutation = {
  approval_request_id: string | null;
  description: string;
  id: string;
  needed_by: string | null;
  priority: OpsPriority;
  request_number: string;
  requested_by: string | null;
  site_id: string;
  status: OpsMaterialRequestStatus;
  title: string;
};

type MaterialRequestItemForApproval = {
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
      "id, request_number, site_id, requested_by, title, description, priority, status, needed_by, approval_request_id",
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
    .select("id, item_name, quantity, unit, estimated_total")
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

  const parsed = createRequestSchema.safeParse({
    description: field(formData, "description"),
    estimated_unit_cost: field(formData, "estimated_unit_cost") || "0",
    item_name: field(formData, "item_name"),
    needed_by: field(formData, "needed_by"),
    notes: field(formData, "notes"),
    priority: field(formData, "priority") || "normal",
    quantity: field(formData, "quantity"),
    site_id: field(formData, "site_id"),
    specification: field(formData, "specification"),
    title: field(formData, "title"),
    unit: field(formData, "unit") || "each",
  });

  if (!parsed.success) {
    materialRequestError(parsed.error.issues[0]?.message ?? "Check the material request.");
  }

  const neededBy = normalizeDateInput(parsed.data.needed_by);
  const supabase = getOpsSupabaseServiceClient();
  const { data: request, error: requestError } = await supabase
    .from("material_requests")
    .insert({
      description: parsed.data.description,
      needed_by: neededBy,
      priority: parsed.data.priority,
      requested_by: profile.id,
      site_id: parsed.data.site_id,
      status: "draft",
      title: parsed.data.title,
    })
    .select("id, request_number")
    .single<{ id: string; request_number: string }>();

  if (requestError || !request) {
    materialRequestError(requestError?.message ?? "Could not create material request.");
  }

  const { error: itemError } = await supabase.from("material_request_items").insert({
    estimated_unit_cost: parsed.data.estimated_unit_cost,
    item_name: parsed.data.item_name,
    line_number: 1,
    notes: parsed.data.notes,
    quantity: parsed.data.quantity,
    request_id: request.id,
    specification: parsed.data.specification,
    unit: parsed.data.unit,
  });

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
      site_id: parsed.data.site_id,
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
    unit: field(formData, "unit") || "each",
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
    unit: parsed.data.unit,
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

  const { data: updatedRequest, error: requestUpdateError } = await supabase
    .from("material_requests")
    .update({
      approval_request_id: approval.id,
      status: "submitted",
      submitted_at: now,
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

  const recipientRoles = materialRequestApprovalRecipientRoles(steps);
  const { data: approvers } = await supabase
    .from("users")
    .select("id")
    .in("role", recipientRoles)
    .eq("is_active", true);

  await Promise.all(
    (approvers ?? [])
      .filter((approver) => approver.id !== profile.id)
      .map((approver) =>
        queueOpsNotification({
          actionHref: `/ops/approvals/${approval.id}`,
          body: `${profile.full_name} requested approval for ${request.request_number}.`,
          idempotencyKey: `material-request-approval:${approval.id}:${approver.id}`,
          moduleKey: "material_requests",
          recipientId: approver.id as string,
          sourceId: approval.id,
          sourceTable: "approval_requests",
          title: "Material request approval",
        }).catch(() => null),
      ),
  );

  revalidatePath(MATERIAL_REQUEST_ROUTE);
  revalidatePath("/ops/approvals");
  revalidatePath("/ops/notifications");
  redirect(`/ops/approvals/${approval.id}?created=material_request_approval`);
}
